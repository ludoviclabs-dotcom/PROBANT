import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { CycleContext } from "./cycle-context";
import { dateSchema, known, proofSchema, type BalanceLine, type SupportedAmount } from "./cycle-review";
import { fixedAssetMethodEligible, fixedAssetMovements, frameFixedAssets, movementBridge, recalculateDepreciation, type FixedAssetDocumentedMethod, type Movement } from "./fixed-assets";
import { buildFixedAssetFacts, FA_TABLES, FA_TABLE_LABELS, FixedAssetSourceError, type FaLine, type FaTable, type FaUnitFact, type FixedAssetFacts } from "./fixed-asset-sources";
import { frozen, knownAmountSchema, moneySchema, scopeSchema, type EvidenceLink, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { authorize, type Principal } from "./policy";

export const FIXED_ASSETS_PROCEDURE = "fixed_assets.review" as const;
const id = z.string().trim().min(1).max(200), note = z.string().trim().max(10000), required = note.refine(v => !!v, "Texte requis");
const timestamp = z.string().refine(v => Number.isFinite(Date.parse(v)), "Horodatage requis");
/** A method is documented by the preparer from a cited source; "not_covered" excludes it explicitly from the recalculation. */
export const fixedAssetMethodSchema = z.object({ id, version: id, kind: z.enum(["linear", "not_covered"]), label: required, source: required, from: dateSchema, to: dateSchema, basis: required }).strict();
export const fixedAssetDraftSchema = z.object({ methods: z.array(fixedAssetMethodSchema).max(100) }).strict();
export type FixedAssetDraft = z.infer<typeof fixedAssetDraftSchema>;
export type FixedAssetMethodDraft = z.infer<typeof fixedAssetMethodSchema>;
const stamp = { authorId: id, authoredAt: timestamp };
export const fixedAssetConventionSchema = z.object({ version: z.literal("fa-sign-1"), label: z.literal("register_table_direction_ledger_debit_positive"), validatedBy: id, validatedAt: timestamp }).strict();
export const fixedAssetWorkSchema = fixedAssetDraftSchema.extend({ schemaVersion: z.literal("fixed-assets-1"), convention: fixedAssetConventionSchema, methods: z.array(fixedAssetMethodSchema.extend(stamp).strict()).max(100) }).strict();
export type FixedAssetWork = z.infer<typeof fixedAssetWorkSchema>;
export const FA_CONVENTION_MEANING = "Registre : montants positifs dans le sens de chaque tableau (brut, amortissements cumulés, dépréciations cumulées). GL : soldes signés, débit positif. Cadrage : brut comparé tel quel ; amortissements et dépréciations comparés en valeur opposée (− clôture du registre).";
export const FA_FORMULA = "Dotation recalculée = (coût − valeur résiduelle) × 12 ÷ durée en mois × prorata n ÷ d ; arrondi au centime, demi supérieur ; plafonnée à la base amortissable. Écart = dotation comptabilisée (entrées du tableau Amortissements) − dotation recalculée.";
export const FIXED_ASSET_LIMITATIONS = [
  "La VNC est une différence arithmétique (brut − amortissements − dépréciations), pas une conclusion de valeur.",
  "Aucune conclusion d’existence physique : le registre et les pièces ne prouvent ni la présence ni l’état des biens.",
  "Aucune durée, aucun seuil de capitalisation, aucun prorata ni aucune valeur résiduelle implicites : chaque paramètre vient d’une source ou d’une méthode documentée.",
  "Recalcul limité aux méthodes linéaires documentées ; méthodes non couvertes, sorties de l’exercice et sorties partielles restent hors recalcul, avec motif.",
  "Dépréciations : pont des mouvements uniquement ; aucun test d’indice de perte de valeur ni de valeur actuelle.",
  "Recherche de dépenses à immobiliser hors périmètre de cet écran ; aucun reclassement automatique.",
  "Actifs complexes déclarés (crédit-bail, réévaluation, financier, devise, autre) exclus avec motif, jamais testés en silence.",
];

function context(scope: WorkpaperScope, period: AccountingPeriod): CycleContext { return { scope, period, purpose: scope.mode === "real" ? "real" : "synthetic_technical", procedure: FIXED_ASSETS_PROCEDURE }; }
export function fixedAssetDraftFromWork(work: FixedAssetWork): FixedAssetDraft {
  return fixedAssetDraftSchema.parse({ methods: work.methods.map(m => { const { authorId: _a, authoredAt: _t, ...rest } = m; void _a; void _t; return rest; }) });
}
/** Server-only stamping: author, date and convention validator come from the session, never from the draft. */
export function stampFixedAssetWork(input: { scope: WorkpaperScope; period: AccountingPeriod; runId: string; imports: ImportBatch[]; draft: FixedAssetDraft; actor: Principal; at: string; previous?: FixedAssetWork }): FixedAssetWork {
  authorize(input.actor, input.scope, "prepare");
  if (!Number.isFinite(Date.parse(input.at))) throw new Error("FA_TIMESTAMP_INVALID");
  const draft = fixedAssetDraftSchema.parse(input.draft);
  if (new Set(draft.methods.map(m => m.id)).size !== draft.methods.length) throw new Error("FA_METHOD_DUPLICATE");
  if (draft.methods.some(m => m.from > m.to)) throw new Error("FA_METHOD_PERIOD_INVALID");
  // A method unchanged since the previous version keeps its original author and date.
  const methods = draft.methods.map(m => {
    const old = input.previous?.methods.find(p => p.id === m.id);
    if (old) { const { authorId, authoredAt, ...prior } = old; if (stableSha256(prior) === stableSha256(m)) return { ...m, authorId, authoredAt }; }
    return { ...m, authorId: input.actor.id, authoredAt: input.at };
  }).sort((a, b) => a.id < b.id ? -1 : 1);
  const convention = input.previous?.convention ?? { version: "fa-sign-1" as const, label: "register_table_direction_ledger_debit_positive" as const, validatedBy: input.actor.id, validatedAt: input.at };
  const work = fixedAssetWorkSchema.parse({ schemaVersion: "fixed-assets-1", convention, methods });
  evaluateFixedAssets(input.scope, input.period, input.imports, input.runId, work);
  return frozen(work);
}

const tableIds = ["gross", "amortization", "impairment"] as const;
const lineRefSchema = z.object({ lineId: id, movement: z.enum(["opening", "addition", "disposal", "reversal", "reclassification", "closing"]), amount: moneySchema, date: dateSchema, pieceRef: note, label: note, account: id, proofId: id }).strict();
const tableSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("computed"), account: id, opening: moneySchema, additions: moneySchema, disposals: moneySchema, reversals: moneySchema, reclassifications: moneySchema, closing: moneySchema, expected: moneySchema, difference: knownAmountSchema, lines: z.array(lineRefSchema) }).strict(),
  z.object({ status: z.literal("incomplete"), account: id.nullable(), missing: z.array(note).min(1), lines: z.array(lineRefSchema) }).strict(),
  z.object({ status: z.literal("excluded"), account: id.nullable(), reason: note, lines: z.array(lineRefSchema) }).strict(),
]);
const recalcStatus = z.enum(["computed", "blocked", "not_applicable", "excluded"]);
const supportStatus = z.enum(["matched", "amount_difference", "date_difference", "missing"]);
const familyTableSchema = z.object({ inScopeUnits: z.number().int().nonnegative(), computedUnits: z.number().int().nonnegative(), complete: z.boolean(), opening: moneySchema, additions: moneySchema, disposals: moneySchema, reversals: moneySchema, reclassifications: moneySchema, closing: moneySchema, expected: moneySchema, difference: moneySchema, unitsWithDifference: z.number().int().nonnegative(), absoluteDifference: moneySchema }).strict();
const exceptionCodes = ["MOVEMENT_DIFFERENCE", "TABLE_INCOMPLETE", "FRAME_DIFFERENCE", "FRAME_SCOPE_INCOMPLETE", "SUPPORT_MISSING", "SUPPORT_AMOUNT_DIFFERENCE", "SUPPORT_DATE_DIFFERENCE", "RECALCULATION_DIFFERENCE", "RECALCULATION_BLOCKED"] as const;
export type FixedAssetExceptionCode = typeof exceptionCodes[number];
export const FA_UNCERTAINTY_CODES: FixedAssetExceptionCode[] = ["TABLE_INCOMPLETE", "FRAME_SCOPE_INCOMPLETE", "SUPPORT_MISSING", "RECALCULATION_BLOCKED"];
const controlIds = ["movements", "frame", "supports", "recalculation"] as const;
export type FixedAssetControlId = typeof controlIds[number];
export const fixedAssetResultSchema = z.object({
  schemaVersion: z.literal("fixed-assets-result-1"), scope: scopeSchema, runId: id, mode: z.enum(["real", "demo"]), startDate: dateSchema, closingDate: dateSchema, reviewDate: dateSchema,
  convention: fixedAssetConventionSchema.extend({ meaning: note }).strict(), formula: note,
  methods: z.array(fixedAssetMethodSchema.extend({ ...stamp, applicable: z.boolean(), unitsUsing: z.number().int().nonnegative(), evidence: z.array(proofSchema) }).strict()),
  units: z.array(z.object({
    unitId: id, assetId: id, componentId: id.nullable(), family: id, status: z.enum(["in_progress", "in_service", "disposed"]), treatment: id, label: note,
    inScope: z.boolean(), exclusionReason: note.nullable(), evidence: z.array(proofSchema),
    tables: z.object({ gross: tableSchema, amortization: tableSchema, impairment: tableSchema }).strict(),
    vnc: knownAmountSchema,
    recalculation: z.object({ status: recalcStatus, reason: note, method: z.object({ id, version: id, kind: z.enum(["linear", "not_covered"]), label: note, source: note }).strict().nullable(),
      inputs: z.object({ cost: moneySchema.nullable(), residual: moneySchema.nullable(), base: moneySchema.nullable(), durationMonths: z.number().int().positive().nullable(), prorataNumerator: z.string().nullable(), prorataDenominator: z.string().nullable(), inServiceDate: dateSchema.nullable(), rounding: z.literal("half_up_cent") }).strict(),
      recalculated: knownAmountSchema, booked: knownAmountSchema, difference: knownAmountSchema, proofIds: z.array(id) }).strict(),
    supports: z.array(z.object({ lineId: id, movement: z.enum(["addition", "disposal"]), amount: moneySchema, date: dateSchema, pieceRef: note, status: supportStatus, statusMeaning: note,
      piece: z.object({ pieceId: id, kind: z.enum(["acquisition", "cession", "mise_en_service"]), amount: moneySchema, date: dateSchema, label: note, proofId: id }).strict().nullable(), difference: knownAmountSchema, proofIds: z.array(id) }).strict()),
  }).strict()),
  families: z.array(z.object({ family: id, units: z.number().int().nonnegative(), excluded: z.number().int().nonnegative(), tables: z.object({ gross: familyTableSchema, amortization: familyTableSchema, impairment: familyTableSchema }).strict() }).strict()),
  framing: z.object({ convention: note, rows: z.array(z.object({ account: id, table: z.enum(tableIds).nullable(), label: note, register: moneySchema.nullable(), units: z.array(id), ledger: moneySchema.nullable(), difference: knownAmountSchema, evidence: z.array(proofSchema) }).strict()), net: knownAmountSchema, gross: knownAmountSchema }).strict(),
  exceptions: z.array(z.object({ id, controlId: z.enum(controlIds), code: z.enum(exceptionCodes), label: note, unitId: id.nullable(), table: z.enum(tableIds).nullable(), targetId: id, message: note, amount: knownAmountSchema, proofIds: z.array(id) }).strict()),
  controls: z.array(z.object({ id: z.enum(controlIds), label: note, unit: note, outcome: z.enum(["no_exception_detected", "exceptions_detected", "inconclusive"]), numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), exclusions: z.array(z.object({ id, reason: note }).strict()) }).strict()),
  limitations: z.array(note), conclusion: z.null(),
}).strict().superRefine((r, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const c = (m: Money) => cents(m);
  if (r.mode !== r.scope.mode || r.closingDate < r.startDate || r.reviewDate < r.closingDate) issue("Période du résultat incohérente");
  if (r.controls.length !== 4 || new Set(r.controls.map(x => x.id)).size !== 4 || r.controls.some(x => x.numerator > x.denominator)) issue("Programme ou dénominateur incohérent");
  for (const u of r.units) {
    for (const t of tableIds) {
      const table = u.tables[t];
      if (table.status !== "computed") continue;
      // Each bridge is recomputed from the register values: the closing is never rewritten.
      if (c(table.expected) !== c(table.opening) + c(table.additions) - c(table.disposals) - c(table.reversals) + c(table.reclassifications)) issue("Pont incohérent pour " + u.unitId + " / " + t);
      if (table.difference.kind === "known" && c(table.difference.value) !== c(table.closing) - c(table.expected)) issue("Écart incohérent pour " + u.unitId + " / " + t);
    }
    const x = u.recalculation;
    if (x.difference.kind === "known" && (x.recalculated.kind !== "known" || x.booked.kind !== "known" || c(x.difference.value) !== c(x.booked.value) - c(x.recalculated.value))) issue("Recalcul incohérent pour " + u.unitId);
    if (x.status === "computed" && x.recalculated.kind !== "known") issue("Recalcul déclaré calculé sans montant pour " + u.unitId);
  }
  const proofIds = new Set([...r.units.flatMap(u => u.evidence), ...r.framing.rows.flatMap(x => x.evidence), ...r.methods.flatMap(m => m.evidence)].map(p => p.id));
  if (r.exceptions.some(e => e.proofIds.some(p => !proofIds.has(p))) || r.units.some(u => u.recalculation.proofIds.some(p => !proofIds.has(p)) || u.supports.some(s => s.proofIds.some(p => !proofIds.has(p))))) issue("Référence de preuve non résolue");
  if (new Set(r.exceptions.map(e => e.id)).size !== r.exceptions.length || new Set(r.units.map(u => u.unitId)).size !== r.units.length) issue("Identité de résultat dupliquée");
});
export type FixedAssetResult = z.infer<typeof fixedAssetResultSchema>;
export type FixedAssetUnitResult = FixedAssetResult["units"][number];
export type FixedAssetTableResult = FixedAssetUnitResult["tables"]["gross"];
export const FA_EXCEPTION_LABELS: Record<FixedAssetExceptionCode, string> = {
  MOVEMENT_DIFFERENCE: "Écart du pont des mouvements à expliquer", TABLE_INCOMPLETE: "Tableau du registre incomplet", FRAME_DIFFERENCE: "Écart de cadrage registre / GL",
  FRAME_SCOPE_INCOMPLETE: "Cadrage registre / GL incomplet", SUPPORT_MISSING: "Pièce de mouvement absente", SUPPORT_AMOUNT_DIFFERENCE: "Montant de pièce différent du registre",
  SUPPORT_DATE_DIFFERENCE: "Date de pièce différente du registre", RECALCULATION_DIFFERENCE: "Écart entre dotation comptabilisée et dotation recalculée", RECALCULATION_BLOCKED: "Recalcul bloqué : source ou paramètre requis",
};
export const FA_RECALC_TEXT = {
  computed: { label: "Recalculé", meaning: "Recalcul exécuté sur des paramètres documentés et applicables ; l’écart éventuel reste à expliquer, il ne vaut pas conclusion." },
  blocked: { label: "Bloqué", meaning: "Une source ou un paramètre requis manque ou est incohérent : aucun montant recalculé, aucune valeur réputée nulle." },
  not_applicable: { label: "Non applicable", meaning: "L’actif n’entre pas dans le recalcul de l’exercice selon ses sources (en cours, sorti, mise en service postérieure)." },
  excluded: { label: "Exclu", meaning: "Exclu explicitement du recalcul avec motif (méthode non couverte, sortie partielle, actif complexe)." },
} as const;
export const FA_SUPPORT_TEXT = {
  matched: { label: "Pièce concordante", meaning: "Pièce du même actif, de nature attendue, même montant et même date que le registre." },
  amount_difference: { label: "Montant différent", meaning: "Pièce retrouvée, mais son montant diffère du mouvement du registre." },
  date_difference: { label: "Date différente", meaning: "Pièce retrouvée au même montant, mais à une autre date que le mouvement du registre." },
  missing: { label: "Pièce absente", meaning: "Aucune pièce de nature attendue pour ce mouvement : non testé, aucune conclusion." },
} as const;

const sumOf = (rows: { value: SupportedAmount | { amount: Money } }[]) => money(rows.reduce((s, r) => s + cents(r.value.amount), 0n));
const supported = (line: FaLine): SupportedAmount => ({ amount: line.value.amount, date: line.value.date, basis: "asset_register", evidence: [line.proof] });
const lineRef = (l: FaLine) => ({ lineId: l.lineId, movement: l.movement, amount: l.value.amount, date: l.value.date, pieceRef: l.pieceRef, label: l.label, account: l.account, proofId: l.proof.id });
function linesOf(unit: FaUnitFact, table: FaTable) { return unit.lines.filter(l => l.table === table).sort((a, b) => a.value.date < b.value.date ? -1 : a.value.date > b.value.date ? 1 : a.lineId < b.lineId ? -1 : 1); }
function movementOf(unit: FaUnitFact, table: FaTable): { movement: Movement; missing: null } | { movement: null; missing: string[] } {
  const lines = linesOf(unit, table), opening = lines.find(l => l.movement === "opening"), closing = lines.find(l => l.movement === "closing");
  const missing = !lines.length ? ["Tableau " + FA_TABLE_LABELS[table] + " absent du registre : aucune valeur réputée nulle."] : [!opening && "Ouverture absente du registre.", !closing && "Clôture absente du registre."].filter((v): v is string => !!v);
  if (missing.length) return { movement: null, missing };
  const pick = (m: FaLine["movement"]) => lines.filter(l => l.movement === m).map(supported);
  return { movement: { opening: supported(opening!), additions: pick("addition"), disposals: pick("disposal"), reversals: pick("reversal"), reclassifications: pick("reclassification"), closing: supported(closing!) }, missing: null };
}
const EXPECTED_KIND = { addition: "acquisition", disposal: "cession" } as const;

/** Pure, deterministic evaluation on the frozen approved sources. Missing sources stay visible as such; nothing unknown becomes zero. */
export function evaluateFixedAssets(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, input: FixedAssetWork): FixedAssetResult {
  const work = fixedAssetWorkSchema.parse(input), facts: FixedAssetFacts = buildFixedAssetFacts(scope, period, imports, runId), ctx = context(scope, period);
  const exceptions: FixedAssetResult["exceptions"] = [];
  const add = (code: FixedAssetExceptionCode, controlId: FixedAssetControlId, unitId: string | null, table: FaTable | null, targetId: string, message: string, amount: KnownAmount, proofIds: string[]) =>
    exceptions.push({ id: code + ":" + stableSha256({ runId, code, unitId, table, targetId }).slice(0, 24), controlId, code, label: FA_EXCEPTION_LABELS[code], unitId, table, targetId, message, amount, proofIds: [...new Set(proofIds)] });
  const methodEvidence = facts.parametersDocument ? [facts.parametersDocument] : [];
  const documented = (m: FixedAssetWork["methods"][number]): FixedAssetDocumentedMethod => ({ id: m.id, version: m.version, source: m.source, from: m.from, to: m.to, basis: m.basis, authorId: m.authorId, evidence: methodEvidence, synthetic: false });
  const methodApplicable = (m: FixedAssetWork["methods"][number]) => scope.mode === "real" ? fixedAssetMethodEligible(ctx, documented(m), period.closingDate) : m.from <= period.closingDate && period.closingDate <= m.to;
  const units: FixedAssetResult["units"] = facts.units.map(unit => {
    const evidence = [...unit.lines.map(l => l.proof), ...(unit.parameters ? [unit.parameters.proof] : []), ...unit.supports.map(s => s.proof)];
    const base = { unitId: unit.unitId, assetId: unit.assetId, componentId: unit.componentId, family: unit.family, status: unit.status, treatment: unit.treatment, label: unit.label, inScope: unit.inScope, exclusionReason: unit.exclusionReason, evidence: [...new Map(evidence.map(p => [p.id, p])).values()] };
    const noRecalc = (status: "blocked" | "not_applicable" | "excluded", reason: string, extra: Partial<FixedAssetUnitResult["recalculation"]> = {}): FixedAssetUnitResult["recalculation"] => ({ status, reason, method: null,
      inputs: { cost: null, residual: unit.parameters?.value.amount ?? null, base: null, durationMonths: unit.parameters?.durationMonths ?? null, prorataNumerator: unit.parameters?.prorata?.numerator ?? null, prorataDenominator: unit.parameters?.prorata?.denominator ?? null, inServiceDate: unit.parameters?.inServiceDate ?? null, rounding: "half_up_cent" },
      recalculated: { kind: status === "blocked" ? "unknown" : "not_applicable", reason }, booked: { kind: "not_applicable", reason: "Comparaison non effectuée" }, difference: { kind: status === "blocked" ? "unknown" : "not_applicable", reason }, proofIds: unit.parameters ? [unit.parameters.proof.id] : [], ...extra });
    if (!unit.inScope) {
      const excludedTable = (t: FaTable) => ({ status: "excluded" as const, account: unit.accounts[t] ?? null, reason: unit.exclusionReason!, lines: linesOf(unit, t).map(lineRef) });
      return { ...base, tables: { gross: excludedTable("gross"), amortization: excludedTable("amortization"), impairment: excludedTable("impairment") }, vnc: { kind: "not_applicable" as const, reason: unit.exclusionReason! }, recalculation: noRecalc("excluded", unit.exclusionReason!), supports: [] };
    }
    const movements = Object.fromEntries(FA_TABLES.map(t => [t, movementOf(unit, t)])) as Record<FaTable, ReturnType<typeof movementOf>>;
    const complete = FA_TABLES.every(t => movements[t].movement);
    // Complete assets go through fixedAssetMovements (three bridges + arithmetic VNC); a partial asset keeps its complete tables only.
    const bridges: Partial<Record<FaTable, ReturnType<typeof movementBridge>>> = {};
    let vnc: KnownAmount = { kind: "unknown", reason: "VNC non calculée : un tableau du registre est incomplet." };
    if (complete) {
      const row = fixedAssetMovements(ctx, [{ id: unit.unitId, family: unit.family, status: unit.status, gross: movements.gross.movement!, amortization: movements.amortization.movement!, impairment: movements.impairment.movement! }]).rows[0];
      bridges.gross = row.gross; bridges.amortization = row.amortization; bridges.impairment = row.impairment; vnc = known(row.vnc);
    } else for (const t of FA_TABLES) if (movements[t].movement) bridges[t] = movementBridge(ctx, movements[t].movement!, t);
    const tableResult = (t: FaTable): FixedAssetTableResult => {
      const m = movements[t], lines = linesOf(unit, t).map(lineRef);
      if (!m.movement || !bridges[t]) {
        add("TABLE_INCOMPLETE", "movements", unit.unitId, t, unit.unitId + ":" + t, `${unit.unitId} — ${FA_TABLE_LABELS[t]} : ${m.missing!.join(" ")} Pont non calculé.`, { kind: "unknown", reason: "Tableau incomplet" }, lines.map(l => l.proofId));
        return { status: "incomplete", account: unit.accounts[t] ?? null, missing: m.missing!, lines };
      }
      const b = bridges[t]!, mv = m.movement;
      if (b.difference.kind === "known" && cents(b.difference.value) !== 0n)
        add("MOVEMENT_DIFFERENCE", "movements", unit.unitId, t, unit.unitId + ":" + t, `${unit.unitId} — ${FA_TABLE_LABELS[t]} : clôture ${mv.closing.amount.amount} − (ouverture ${mv.opening.amount.amount} + entrées ${sumOf(mv.additions.map(v => ({ value: v }))).amount} − sorties ${sumOf(mv.disposals.map(v => ({ value: v }))).amount}${t === "impairment" ? " − reprises " + sumOf(mv.reversals.map(v => ({ value: v }))).amount : ""} ± reclassements ${sumOf(mv.reclassifications.map(v => ({ value: v }))).amount}) = ${b.difference.value.amount} EUR. Écart à expliquer ; aucune correction automatique.`, b.difference, lines.map(l => l.proofId));
      return { status: "computed", account: unit.accounts[t]!, opening: mv.opening.amount, additions: sumOf(mv.additions.map(v => ({ value: v }))), disposals: sumOf(mv.disposals.map(v => ({ value: v }))), reversals: sumOf(mv.reversals.map(v => ({ value: v }))), reclassifications: sumOf(mv.reclassifications.map(v => ({ value: v }))), closing: mv.closing.amount, expected: b.expected, difference: b.difference, lines };
    };
    const tables = { gross: tableResult("gross"), amortization: tableResult("amortization"), impairment: tableResult("impairment") };
    // Movement supports: gross additions and disposals only, matched by piece reference within the same asset.
    const supports: FixedAssetUnitResult["supports"] = linesOf(unit, "gross").filter(l => l.movement === "addition" || l.movement === "disposal").map(l => {
      const movement = l.movement as "addition" | "disposal", piece = l.pieceRef ? unit.supports.find(s => s.pieceId === l.pieceRef && s.kind === EXPECTED_KIND[movement]) : undefined;
      if (!piece) {
        add("SUPPORT_MISSING", "supports", unit.unitId, "gross", l.lineId, `${unit.unitId} — ${movement === "addition" ? "entrée" : "sortie"} ${l.lineId} (${l.value.amount.amount} EUR) : ${l.pieceRef ? "pièce « " + l.pieceRef + " » de nature " + EXPECTED_KIND[movement] + " introuvable pour cet actif" : "aucune référence de pièce au registre"}.`, { kind: "unknown", reason: "Pièce absente" }, [l.proof.id]);
        return { lineId: l.lineId, movement, amount: l.value.amount, date: l.value.date, pieceRef: l.pieceRef, status: "missing" as const, statusMeaning: FA_SUPPORT_TEXT.missing.meaning, piece: null, difference: { kind: "unknown" as const, reason: "Pièce absente" }, proofIds: [l.proof.id] };
      }
      const diff = money(cents(l.value.amount) - cents(piece.value.amount)), proofIds = [l.proof.id, piece.proof.id];
      const status = cents(diff) !== 0n ? "amount_difference" as const : piece.value.date !== l.value.date ? "date_difference" as const : "matched" as const;
      if (cents(diff) !== 0n) add("SUPPORT_AMOUNT_DIFFERENCE", "supports", unit.unitId, "gross", l.lineId, `${unit.unitId} — registre ${l.value.amount.amount} − pièce ${piece.pieceId} ${piece.value.amount.amount} = ${diff.amount} EUR.`, known(diff), proofIds);
      if (piece.value.date !== l.value.date) add("SUPPORT_DATE_DIFFERENCE", "supports", unit.unitId, "gross", l.lineId + ":date", `${unit.unitId} — mouvement daté du ${l.value.date} au registre, pièce ${piece.pieceId} datée du ${piece.value.date}.`, { kind: "not_applicable", reason: "Différence de date" }, proofIds);
      return { lineId: l.lineId, movement, amount: l.value.amount, date: l.value.date, pieceRef: l.pieceRef, status, statusMeaning: FA_SUPPORT_TEXT[status].meaning, piece: { pieceId: piece.pieceId, kind: piece.kind, amount: piece.value.amount, date: piece.value.date, label: piece.label, proofId: piece.proof.id }, difference: known(diff), proofIds };
    });
    // Documented recalculation: every input is sourced; any gap blocks with its cause instead of a default.
    const recalculation = ((): FixedAssetUnitResult["recalculation"] => {
      const p = unit.parameters;
      if (unit.status === "disposed") return noRecalc("not_applicable", "Actif sorti dans l’exercice : dotation jusqu’à la sortie non couverte par ce recalcul.");
      if (tables.gross.status === "computed" && cents(tables.gross.disposals) > 0n) return noRecalc("excluded", "Sortie partielle dans l’exercice : recalcul non couvert ; seul le pont des mouvements est produit.");
      if (!p) return unit.status === "in_progress" ? noRecalc("not_applicable", "Immobilisation en cours au registre, sans paramètres d’amortissement : aucun recalcul.") : noRecalc("blocked", "SOURCE REQUISE : paramètres d’amortissement absents pour cet actif.");
      if (unit.status === "in_progress" && p.inServiceDate <= period.closingDate) return noRecalc("blocked", `Statut « en cours » au registre incompatible avec une mise en service au ${p.inServiceDate} selon les paramètres.`);
      if (!p.methodRef) return noRecalc("blocked", "SOURCE REQUISE : méthode absente des paramètres.");
      const m = work.methods.find(x => x.id === p.methodRef);
      if (!m) return noRecalc("blocked", `SOURCE REQUISE : méthode « ${p.methodRef} » non documentée dans la feuille.`);
      const method = { id: m.id, version: m.version, kind: m.kind, label: m.label, source: m.source };
      if (m.kind === "not_covered") return noRecalc("excluded", `Méthode non couverte par le recalcul : ${m.label}.`, { method });
      if (!methodApplicable(m)) return noRecalc("blocked", `Méthode ${m.id} v${m.version} non applicable au ${period.closingDate} (validité ${m.from} → ${m.to}).`, { method });
      if (p.durationMonths === null) return noRecalc("blocked", "SOURCE REQUISE : durée d’amortissement absente.", { method });
      if (!p.prorata) return noRecalc("blocked", "SOURCE REQUISE : prorata de l’exercice absent.", { method });
      if (tables.gross.status !== "computed") return noRecalc("blocked", "Coût non établi : tableau Brut incomplet.", { method });
      const service = unit.supports.filter(s => s.kind === "mise_en_service");
      if (!service.length) return noRecalc("blocked", "SOURCE REQUISE : pièce de mise en service absente.", { method });
      const servicePiece = service.find(s => s.value.date === p.inServiceDate);
      if (!servicePiece) return noRecalc("blocked", `Date de mise en service divergente : paramètres ${p.inServiceDate}, pièce ${service[0].value.date}.`, { method });
      const cost = tables.gross.closing, residual = p.value.amount, inputs = { cost, residual, base: money(cents(cost) - cents(residual)), durationMonths: p.durationMonths, prorataNumerator: p.prorata.numerator, prorataDenominator: p.prorata.denominator, inServiceDate: p.inServiceDate, rounding: "half_up_cent" as const };
      const proofIds = [linesOf(unit, "gross").find(l => l.movement === "closing")!.proof.id, p.proof.id, servicePiece.proof.id];
      if (cents(residual) > cents(cost)) return noRecalc("blocked", `Valeur résiduelle ${residual.amount} EUR supérieure au coût ${cost.amount} EUR : paramètres incohérents.`, { method, inputs: { ...inputs, base: null }, proofIds });
      const closingLine = linesOf(unit, "gross").find(l => l.movement === "closing")!;
      const value = recalculateDepreciation(ctx, { method: scope.mode === "real" ? documented(m) : { id: m.id, version: m.version, source: m.source, from: m.from, to: m.to, approvedBy: m.authorId, synthetic: true }, kind: "linear",
        cost: { amount: cost, date: period.closingDate, basis: "depreciable_cost_eur", evidence: [closingLine.proof] }, residual: { amount: residual, date: period.closingDate, basis: "depreciable_cost_eur", evidence: [p.proof] },
        inServiceDate: p.inServiceDate, durationMonths: p.durationMonths, prorata: { numerator: p.prorata.numerator, denominator: p.prorata.denominator, evidence: [p.proof, servicePiece.proof] }, rounding: "half_up_cent" });
      if (value.kind !== "known") return noRecalc(value.kind === "unknown" && /postérieure à clôture/.test(value.reason) ? "not_applicable" : "blocked", value.kind === "unknown" ? value.reason : "Recalcul non applicable", { method, inputs, proofIds });
      const booked: KnownAmount = tables.amortization.status === "computed" ? known(tables.amortization.additions) : { kind: "unknown", reason: "Dotation comptabilisée non établie : tableau Amortissements incomplet." };
      const difference: KnownAmount = booked.kind === "known" ? known(money(cents(booked.value) - cents(value.value))) : { kind: "unknown", reason: "Comparaison impossible : dotation comptabilisée non établie." };
      const bookedProofs = linesOf(unit, "amortization").filter(l => l.movement === "addition").map(l => l.proof.id);
      if (difference.kind === "known" && cents(difference.value) !== 0n) add("RECALCULATION_DIFFERENCE", "recalculation", unit.unitId, "amortization", unit.unitId + ":recalc", `${unit.unitId} — dotation comptabilisée ${booked.kind === "known" ? booked.value.amount : "?"} − dotation recalculée ${value.value.amount} = ${difference.value.amount} EUR (méthode ${m.id} v${m.version}).`, difference, [...proofIds, ...bookedProofs]);
      return { status: "computed", reason: difference.kind === "known" ? "Recalcul exécuté sur paramètres documentés." : difference.reason, method, inputs, recalculated: value, booked, difference, proofIds: [...proofIds, ...bookedProofs] };
    })();
    if (recalculation.status === "blocked") add("RECALCULATION_BLOCKED", "recalculation", unit.unitId, "amortization", unit.unitId + ":recalc", `${unit.unitId} — ${recalculation.reason}`, { kind: "unknown", reason: "Recalcul bloqué" }, recalculation.proofIds.length ? recalculation.proofIds : base.evidence.slice(0, 1).map(p => p.id));
    return { ...base, tables, vnc, recalculation, supports };
  });
  // Framing register → GL: all register assets (excluded ones included, since they share the accounts), by account, never compensated across accounts.
  const tableOfAccount = new Map<string, FaTable>();
  facts.units.forEach(u => FA_TABLES.forEach(t => { if (u.accounts[t]) tableOfAccount.set(u.accounts[t]!, t); }));
  facts.ledger.forEach(l => { if (!tableOfAccount.has(l.account)) tableOfAccount.set(l.account, l.table); });
  const registerLines: BalanceLine[] = facts.units.flatMap(u => FA_TABLES.flatMap(t => {
    const closing = u.lines.find(l => l.table === t && l.movement === "closing");
    if (!closing) return [];
    const value = t === "gross" ? closing.value.amount : money(-cents(closing.value.amount));
    return [{ id: closing.lineId + "@" + u.unitId, key: closing.account, account: closing.account, party: u.unitId, value: { amount: value, date: period.closingDate, basis: "closing_balance_debit_positive", evidence: [closing.proof] } }];
  }));
  const ledgerLines: BalanceLine[] = facts.ledger.map(l => ({ id: "ledger:" + l.account, key: l.account, account: l.account, value: { amount: l.value.amount, date: period.closingDate, basis: "closing_balance_debit_positive", evidence: [l.proof] } }));
  const frame = frameFixedAssets(ctx, registerLines, null, ledgerLines, []).registerToLedger;
  const incompleteAccounts = new Set(facts.units.flatMap(u => FA_TABLES.filter(t => u.accounts[t] && u.lines.some(l => l.table === t) && !u.lines.some(l => l.table === t && l.movement === "closing")).map(t => u.accounts[t]!)));
  const framingRows: FixedAssetResult["framing"]["rows"] = frame.rows.map(r => {
    const registerSide = r.sourceLines.filter(l => !l.id.startsWith("ledger:")), ledgerSide = r.sourceLines.filter(l => l.id.startsWith("ledger:"));
    const ledgerFact = facts.ledger.find(l => l.account === r.key), table = tableOfAccount.get(r.key) ?? null;
    const difference: KnownAmount = incompleteAccounts.has(r.key) ? { kind: "unknown", reason: "Registre incomplet pour ce compte : une clôture d’actif manque." } : r.difference;
    const evidence = r.sourceLines.flatMap(l => l.value.evidence);
    if (difference.kind === "known" && cents(difference.value) !== 0n) add("FRAME_DIFFERENCE", "frame", null, table, r.key, `Compte ${r.key} : registre ${r.left.amount} − GL ${r.right.amount} = ${difference.value.amount} EUR (convention fa-sign-1, débit positif).`, difference, evidence.map(p => p.id));
    if (difference.kind !== "known") add("FRAME_SCOPE_INCOMPLETE", "frame", null, table, r.key, !registerSide.length ? `Compte ${r.key} présent au GL (${ledgerFact?.value.amount.amount ?? "?"} EUR) sans actif au registre : non rapprochable.` : !ledgerSide.length ? `Compte ${r.key} porté par le registre (${r.left.amount} EUR) absent du GL : non rapprochable.` : `Compte ${r.key} : ${difference.kind === "unknown" ? difference.reason : "non rapprochable"}`, { kind: "unknown", reason: "Cadrage incomplet" }, evidence.map(p => p.id));
    return { account: r.key, table, label: ledgerFact?.label ?? "", register: registerSide.length ? r.left : null, units: [...new Set(registerSide.map(l => l.party!))].sort(), ledger: ledgerSide.length ? r.right : null, difference, evidence };
  });
  const frameComplete = framingRows.length > 0 && framingRows.every(r => r.difference.kind === "known");
  const framing = { convention: FA_CONVENTION_MEANING, rows: framingRows,
    net: frameComplete ? known(money(framingRows.reduce((s, r) => s + (r.difference.kind === "known" ? cents(r.difference.value) : 0n), 0n))) : { kind: "unknown" as const, reason: "Cadrage partiel : au moins un compte non rapprochable." },
    gross: frameComplete ? known(money(framingRows.reduce((s, r) => { const n = r.difference.kind === "known" ? cents(r.difference.value) : 0n; return s + (n < 0n ? -n : n); }, 0n))) : { kind: "unknown" as const, reason: "Cadrage partiel : au moins un compte non rapprochable." } };
  // Family bridges sum the computed assets only, with their denominator; an incomplete asset is never counted as zero.
  const families = [...new Set(units.map(u => u.family))].sort().map(family => {
    const members = units.filter(u => u.family === family), inScope = members.filter(u => u.inScope);
    const table = (t: FaTable) => {
      const computed = inScope.map(u => u.tables[t]).filter((x): x is Extract<FixedAssetTableResult, { status: "computed" }> => x.status === "computed");
      const total = (k: "opening" | "additions" | "disposals" | "reversals" | "reclassifications" | "closing" | "expected") => money(computed.reduce((s, x) => s + cents(x[k]), 0n));
      const diffs = computed.map(x => x.difference.kind === "known" ? cents(x.difference.value) : 0n);
      return { inScopeUnits: inScope.length, computedUnits: computed.length, complete: computed.length === inScope.length && inScope.length > 0, opening: total("opening"), additions: total("additions"), disposals: total("disposals"), reversals: total("reversals"), reclassifications: total("reclassifications"), closing: total("closing"), expected: total("expected"),
        difference: money(diffs.reduce((s, n) => s + n, 0n)), unitsWithDifference: diffs.filter(n => n !== 0n).length, absoluteDifference: money(diffs.reduce((s, n) => s + (n < 0n ? -n : n), 0n)) };
    };
    return { family, units: inScope.length, excluded: members.length - inScope.length, tables: { gross: table("gross"), amortization: table("amortization"), impairment: table("impairment") } };
  });
  const tested = units.filter(u => u.inScope), excludedUnits = units.filter(u => !u.inScope).map(u => ({ id: u.unitId, reason: u.exclusionReason! }));
  const has = (control: FixedAssetControlId) => exceptions.some(e => e.controlId === control && !FA_UNCERTAINTY_CODES.includes(e.code));
  const outcome = (control: FixedAssetControlId, numerator: number, denominator: number) => has(control) ? "exceptions_detected" as const : !denominator || numerator !== denominator ? "inconclusive" as const : "no_exception_detected" as const;
  const computedTables = tested.reduce((n, u) => n + FA_TABLES.filter(t => u.tables[t].status === "computed").length, 0);
  const supportRows = tested.flatMap(u => u.supports), supportedCount = supportRows.filter(s => s.status !== "missing").length;
  const recalcUnits = tested.filter(u => u.recalculation.status === "computed" || u.recalculation.status === "blocked"), recalcDone = recalcUnits.filter(u => u.recalculation.status === "computed" && u.recalculation.difference.kind === "known").length;
  const knownFrame = framingRows.filter(r => r.difference.kind === "known").length;
  const controls: FixedAssetResult["controls"] = [
    { id: "movements", label: "Ponts des mouvements Brut / Amortissements / Dépréciations", unit: "tableaux calculés / tableaux attendus des actifs testés (3 par actif ou composant)", numerator: computedTables, denominator: tested.length * 3, exclusions: excludedUnits, outcome: outcome("movements", computedTables, tested.length * 3) },
    { id: "frame", label: "Cadrage registre → GL par compte", unit: "comptes rapprochés / comptes portés par le registre ou le GL", numerator: knownFrame, denominator: framingRows.length, exclusions: [], outcome: outcome("frame", knownFrame, framingRows.length) },
    { id: "supports", label: "Entrées et sorties brutes appuyées par une pièce", unit: "mouvements bruts rattachés à une pièce / entrées et sorties brutes des actifs testés", numerator: supportedCount, denominator: supportRows.length, exclusions: excludedUnits, outcome: outcome("supports", supportedCount, supportRows.length) },
    { id: "recalculation", label: "Recalcul documenté de la dotation", unit: "actifs recalculés et comparés / actifs testés soumis au recalcul", numerator: recalcDone, denominator: recalcUnits.length,
      exclusions: [...excludedUnits, ...tested.filter(u => u.recalculation.status === "not_applicable" || u.recalculation.status === "excluded").map(u => ({ id: u.unitId, reason: u.recalculation.reason }))], outcome: outcome("recalculation", recalcDone, recalcUnits.length) },
  ];
  // Deterministic presentation order: programme control, then asset or account, then target.
  exceptions.sort((x, y) => controlIds.indexOf(x.controlId) - controlIds.indexOf(y.controlId) || (x.unitId ?? "").localeCompare(y.unitId ?? "") || x.targetId.localeCompare(y.targetId) || x.code.localeCompare(y.code));
  const methods = work.methods.map(m => ({ ...m, applicable: m.kind === "linear" ? methodApplicable(m) : false, unitsUsing: facts.units.filter(u => u.parameters?.methodRef === m.id).length, evidence: methodEvidence }));
  return frozen(fixedAssetResultSchema.parse({ schemaVersion: "fixed-assets-result-1", scope, runId, mode: scope.mode, startDate: period.startDate, closingDate: period.closingDate, reviewDate: period.asOfDate,
    convention: { ...work.convention, meaning: FA_CONVENTION_MEANING }, formula: FA_FORMULA, methods, units, families, framing, exceptions, controls, limitations: FIXED_ASSET_LIMITATIONS, conclusion: null }));
}
export function fixedAssetOutcome(result: FixedAssetResult): "no_exception_detected" | "exceptions_detected" | "inconclusive" {
  return result.controls.some(c => c.outcome === "exceptions_detected") ? "exceptions_detected" : result.controls.some(c => c.outcome === "inconclusive") ? "inconclusive" : "no_exception_detected";
}
export function fixedAssetResultEvidence(result: FixedAssetResult): EvidenceLink[] {
  return [...new Map([...result.units.flatMap(u => u.evidence), ...result.framing.rows.flatMap(r => r.evidence), ...result.methods.flatMap(m => m.evidence)].map(p => [p.id, p])).values()];
}
/** Recalculation basis of one asset: what a method or parameter change must make visible, never silently. */
function basisOf(u: FixedAssetUnitResult) { const r = u.recalculation; return { status: r.status, method: r.method && { id: r.method.id, version: r.method.version, kind: r.method.kind }, inputs: r.inputs, recalculated: r.recalculated }; }
export interface RecalculationComparisonRow {
  unitId: string; label: string;
  before: ReturnType<typeof basisOf> | null; after: ReturnType<typeof basisOf> | null; change: KnownAmount;
}
/** Versioned comparison of two executed results; the server computes the change, the browser only displays it. */
export function compareFixedAssetRecalculations(before: FixedAssetResult, after: FixedAssetResult): RecalculationComparisonRow[] {
  const ids = [...new Set([...before.units.map(u => u.unitId), ...after.units.map(u => u.unitId)])].sort();
  return ids.flatMap(unitId => {
    const b = before.units.find(u => u.unitId === unitId), a = after.units.find(u => u.unitId === unitId);
    const bb = b ? basisOf(b) : null, ab = a ? basisOf(a) : null;
    if (stableSha256(bb) === stableSha256(ab)) return [];
    const change: KnownAmount = bb?.recalculated.kind === "known" && ab?.recalculated.kind === "known" ? known(money(cents(ab.recalculated.value) - cents(bb.recalculated.value))) : { kind: "unknown", reason: "Variation non calculable : un des deux recalculs est absent." };
    return [{ unitId, label: (a ?? b)!.label, before: bb, after: ab, change }];
  });
}
export function recalculationBasisHash(result: FixedAssetResult) { return stableSha256(result.units.map(u => ({ unitId: u.unitId, ...basisOf(u) }))); }
export { FixedAssetSourceError };

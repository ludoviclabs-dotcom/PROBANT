import { z } from "zod";
import { cents, type Money } from "@/lib/canonical-model/money";
import { isCivilDate, type AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { SourcedAmount } from "./cycle-context";
import { assertScope, frozen, moneySchema, type EvidenceLink, type SourceLocator, type SourceRow, type WorkpaperScope } from "./model";
import type { ImportBatch, ImportMapping } from "./imports";

/** Qualified sources of the equity review (Mission 11). Tabular sources carry one amount per row; minutes are versioned PDF documents paginated by the server. */
export const EQ_TABULAR_TYPES = ["eq_balances", "eq_entries", "eq_variation", "eq_decisions", "eq_payments"] as const;
export const EQ_TYPES = [...EQ_TABULAR_TYPES, "eq_minutes"] as const;
export type EquityTabularType = typeof EQ_TABULAR_TYPES[number];
export type EquitySourceType = typeof EQ_TYPES[number];
export const EQ_BASES = { eq_balances: "balances", eq_entries: "entries", eq_variation: "variation", eq_decisions: "decisions", eq_payments: "payments", eq_minutes: "minutes" } as const;
export const EQ_SOURCE_LABELS: Record<EquitySourceType, string> = {
  eq_balances: "Balance d’ouverture et de clôture des comptes de capitaux propres", eq_entries: "Écritures de l’exercice sur ces comptes (GL)",
  eq_variation: "Tableau de variation des capitaux propres fourni par l’entité", eq_decisions: "Registre des décisions transcrites des PV et actes",
  eq_payments: "Règlements des distributions et apports", eq_minutes: "PV et actes (PDF versionnés)",
};
export const EQ_REQUIRED: EquitySourceType[] = ["eq_balances", "eq_entries"];
const ROW_LIMITS: Record<EquityTabularType, number> = { eq_balances: 2000, eq_entries: 6000, eq_variation: 500, eq_decisions: 1000, eq_payments: 2000 };
export const EQ_MINUTES_MAX_PAGES = 200;
const id = z.string().trim().min(1).max(200), column = id;
export const EQ_PIECE_REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const equityMappingSchema = z.object({
  version: z.literal("equity-1"), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(),
  columns: z.object({ key: id, amount: id, date: id }).strict(), delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]),
  dateFormat: z.enum(["ISO", "DD/MM/YYYY"]), sign: z.union([z.literal(1), z.literal(-1)]), currency: z.literal("EUR"), expectedTotal: moneySchema.optional(),
  capitaux: z.object({ basis: z.enum(["balances", "entries", "variation", "decisions", "payments"]),
    accountColumn: column.optional(), componentColumn: column.optional(), natureColumn: column.optional(), effectDateColumn: column.optional(), decisionColumn: column.optional(),
    transferColumn: column.optional(), pieceColumn: column.optional(), labelColumn: column.optional(), columnColumn: column.optional(), decisionIdColumn: column.optional(),
    typeColumn: column.optional(), organColumn: column.optional(), minutesColumn: column.optional(), pageColumn: column.optional(), resolutionColumn: column.optional(), extractColumn: column.optional() }).strict(),
}).strict();
export type EquityMapping = z.infer<typeof equityMappingSchema>;
/** A PDF has no columns: its mapping only names the piece, its title and its date; the tabular fields are neutral constants. */
export const equityMinutesFormSchema = z.object({ pieceRef: z.string().regex(EQ_PIECE_REF), title: z.string().trim().min(1).max(300), documentDate: z.string().refine(isCivilDate, "Date civile ISO requise") }).strict();
export type EquityMinutesForm = z.infer<typeof equityMinutesFormSchema>;
const minutesMappingSchema = z.object({ version: z.literal("equity-minutes-1"), headerRow: z.literal(1), columns: z.object({ key: z.literal("page"), amount: z.literal("page"), date: z.literal("page") }).strict(),
  delimiter: z.literal(";"), decimal: z.literal("."), dateFormat: z.literal("ISO"), sign: z.literal(1), currency: z.literal("EUR"),
  capitaux: z.object({ basis: z.literal("minutes"), pieceRef: z.string().regex(EQ_PIECE_REF), title: z.string().trim().min(1).max(300), documentDate: z.string().refine(isCivilDate) }).strict() }).strict();
export function equityMinutesMapping(form: EquityMinutesForm): ImportMapping {
  return minutesMappingSchema.parse({ version: "equity-minutes-1", headerRow: 1, columns: { key: "page", amount: "page", date: "page" }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR", capitaux: { basis: "minutes", ...equityMinutesFormSchema.parse(form) } }) as ImportMapping;
}
export function isEquityMapping(mapping: ImportMapping) { return equityMappingSchema.safeParse(mapping).success || minutesMappingSchema.safeParse(mapping).success; }
type EqColumn = keyof EquityMapping["capitaux"];
/** Columns each source must name explicitly; nothing is guessed from a header label. */
export const EQ_REQUIRED_COLUMNS: Record<EquityTabularType, EqColumn[]> = {
  eq_balances: ["accountColumn", "componentColumn"],
  eq_entries: ["accountColumn", "componentColumn", "natureColumn", "effectDateColumn"],
  eq_variation: ["componentColumn", "columnColumn"],
  eq_decisions: ["decisionIdColumn", "typeColumn", "componentColumn", "effectDateColumn", "minutesColumn"],
  eq_payments: ["decisionColumn"],
};

/** Balance-sheet rubrics of the PCG model (art. 821-1, ANC regulation 2014-03 as amended): a documentary map, not a legal rule. */
export const EQ_COMPONENTS = ["capital", "primes", "ecarts_reevaluation", "ecart_equivalence", "reserve_legale", "reserves_statutaires", "reserves_reglementees", "autres_reserves", "report_a_nouveau", "resultat", "subventions_investissement", "provisions_reglementees", "autres_fonds_propres"] as const;
export type EqComponent = typeof EQ_COMPONENTS[number];
export const EQ_COMPONENT_LABELS: Record<EqComponent, string> = {
  capital: "Capital", primes: "Primes d’émission, de fusion, d’apport", ecarts_reevaluation: "Écarts de réévaluation", ecart_equivalence: "Écart d’équivalence",
  reserve_legale: "Réserve légale", reserves_statutaires: "Réserves statutaires ou contractuelles", reserves_reglementees: "Réserves réglementées", autres_reserves: "Autres réserves",
  report_a_nouveau: "Report à nouveau", resultat: "Résultat de l’exercice", subventions_investissement: "Subventions d’investissement", provisions_reglementees: "Provisions réglementées",
  autres_fonds_propres: "Autres fonds propres",
};
export const EQ_RESERVES: EqComponent[] = ["reserve_legale", "reserves_statutaires", "reserves_reglementees", "autres_reserves"];
/** Listed with its motive, never added to equity: the PCG model presents it as a distinct rubric. */
export const EQ_EXCLUSIONS: Partial<Record<EqComponent, string>> = {
  autres_fonds_propres: "Autres fonds propres : rubrique distincte des capitaux propres au modèle de bilan (art. 821-1 PCG) ; composition dépendant de la version applicable du PCG ; non couverte par cette procédure.",
};
export const EQ_NATURES = ["affectation_resultat", "distribution", "augmentation_capital", "reduction_capital", "incorporation_reserves", "resultat_exercice", "subventions", "provisions_reglementees", "reclassement_interne", "autre"] as const;
export type EqNature = typeof EQ_NATURES[number];
export const EQ_NATURE_LABELS: Record<EqNature, string> = {
  affectation_resultat: "Affectation du résultat", distribution: "Distributions", augmentation_capital: "Augmentations de capital", reduction_capital: "Réductions de capital",
  incorporation_reserves: "Incorporations de réserves", resultat_exercice: "Résultat de l’exercice", subventions: "Subventions (octroi, reprise)", provisions_reglementees: "Provisions réglementées (dotation, reprise)",
  reclassement_interne: "Reclassements internes", autre: "Autres mouvements",
};
/** Internal search method (not a legal rule): natures for which the sheet looks for a decision of the competent body. */
export const EQ_DECISION_NATURES: EqNature[] = ["affectation_resultat", "distribution", "augmentation_capital", "reduction_capital", "incorporation_reserves"];
/** Natures that may carry an internal transfer reference; a transfer moves equity between components, it never changes the total. */
export const EQ_TRANSFER_NATURES: EqNature[] = ["affectation_resultat", "incorporation_reserves", "reclassement_interne"];
export const EQ_DECISION_TYPES = ["affectation_resultat", "distribution", "augmentation_capital", "reduction_capital", "incorporation_reserves", "autre_decision"] as const;
export type EqDecisionType = typeof EQ_DECISION_TYPES[number];
export const EQ_DECISION_TYPE_LABELS: Record<EqDecisionType, string> = { ...EQ_NATURE_LABELS, autre_decision: "Autre décision" } as Record<EqDecisionType, string>;
export const EQ_VARIATION_COLUMNS = ["ouverture", ...EQ_NATURES, "cloture"] as const;
export type EqVariationColumn = typeof EQ_VARIATION_COLUMNS[number];

export class EquitySourceError extends Error {
  constructor(readonly code: string, readonly locator?: SourceLocator & { column?: string; value?: string }) { super(code); this.name = "EquitySourceError"; }
}
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const pick = <T extends string>(list: readonly T[], raw: string): T | undefined => (list as readonly string[]).includes(norm(raw)) ? norm(raw) as T : undefined;
const cell = (row: SourceRow, col?: string) => col ? row.original[col]?.trim() ?? "" : "";
/** Secondary date columns follow the mapping date format; an empty or malformed date is refused, never defaulted to the accounting date. */
export function equityDate(raw: string, format: "ISO" | "DD/MM/YYYY") {
  const s = raw.trim(), date = format === "ISO" ? s : /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : "";
  return isCivilDate(date) ? date : null;
}
export function batchType(batch: ImportBatch) { return batch.document.documentType as EquitySourceType; }

/** Row-level qualification of one previewed or approved batch; cross-source checks happen in buildEquityFacts. */
export function assertEquityBatch(batch: ImportBatch, period: AccountingPeriod) {
  const type = batchType(batch);
  if (!(EQ_TYPES as readonly string[]).includes(type)) throw new EquitySourceError("EQ_SOURCE_TYPE_INVALID");
  if (type === "eq_minutes") {
    const m = minutesMappingSchema.safeParse(batch.mapping);
    if (!m.success || batch.document.format !== "pdf") throw new EquitySourceError("EQ_MAPPING_INVALID");
    if (m.data.capitaux.documentDate > period.asOfDate) throw new EquitySourceError("EQ_MINUTES_AFTER_REVIEW", { column: "documentDate", value: m.data.capitaux.documentDate });
    if (!batch.rows.length || batch.rows.length > EQ_MINUTES_MAX_PAGES || batch.rows.some((r, i) => r.locator.page !== i + 1 || r.errors.length)) throw new EquitySourceError("EQ_MINUTES_PAGES_INVALID");
    return;
  }
  const parsed = equityMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) throw new EquitySourceError("EQ_MAPPING_INVALID");
  const m = parsed.data, f = m.capitaux;
  if (f.basis !== EQ_BASES[type]) throw new EquitySourceError("EQ_SOURCE_TYPE_INVALID");
  const missing = EQ_REQUIRED_COLUMNS[type].find(c => !f[c]);
  if (missing) throw new EquitySourceError("EQ_COLUMN_REQUIRED", { column: missing });
  if (batch.rows.length > ROW_LIMITS[type]) throw new EquitySourceError("EQ_ROWS_LIMIT");
  const keys = new Set<string>(), endpoints = new Set<string>(), accounts = new Map<string, string>(), cells = new Set<string>();
  const transfers = new Map<string, { total: bigint; lines: number; row: SourceRow }>();
  for (const row of batch.rows) {
    const at = (code: string, col?: string) => new EquitySourceError(code, { ...row.locator, ...(col ? { column: col, value: cell(row, col).slice(0, 80) } : {}) });
    if (!row.normalized || row.errors.length) throw at("EQ_ROW_INVALID");
    const key = row.normalized.key.trim();
    if (!id.safeParse(key).success || keys.has(key)) throw at("EQ_KEY_INVALID_OR_DUPLICATE", m.columns.key);
    keys.add(key);
    const date = row.normalized.date, amount = cents(row.normalized.amount);
    const component = () => { const c = pick(EQ_COMPONENTS, cell(row, f.componentColumn)); if (!c) throw at("EQ_COMPONENT_INVALID", f.componentColumn); return c; };
    const account = () => {
      const a = cell(row, f.accountColumn), c = component();
      if (!id.safeParse(a).success) throw at("EQ_ACCOUNT_REQUIRED", f.accountColumn);
      // One account belongs to one component: a mixed declaration is refused, never resolved by the first line.
      if (accounts.has(a) && accounts.get(a) !== c) throw at("EQ_ACCOUNT_COMPONENT_INCONSISTENT", f.componentColumn);
      accounts.set(a, c); return a;
    };
    const effect = () => { const d = equityDate(cell(row, f.effectDateColumn), m.dateFormat); if (!d) throw at("EQ_EFFECT_DATE_REQUIRED", f.effectDateColumn); return d; };
    if (type === "eq_balances") {
      const a = account();
      if (date !== period.startDate && date !== period.closingDate) throw at("EQ_BALANCE_DATE_INVALID", m.columns.date);
      if (endpoints.has(a + "\u0000" + date)) throw at("EQ_BALANCE_DUPLICATE", f.accountColumn);
      endpoints.add(a + "\u0000" + date);
    }
    if (type === "eq_entries") {
      account(); effect();
      const nature = pick(EQ_NATURES, cell(row, f.natureColumn));
      if (!nature) throw at("EQ_NATURE_INVALID", f.natureColumn);
      if (date < period.startDate || date > period.closingDate) throw at("EQ_ENTRY_OUTSIDE_PERIOD", m.columns.date);
      if (amount === 0n) throw at("EQ_ENTRY_ZERO", m.columns.amount);
      if (nature === "autre" && !cell(row, f.labelColumn)) throw at("EQ_LABEL_REQUIRED", f.labelColumn ?? f.natureColumn);
      const transfer = cell(row, f.transferColumn);
      if (transfer) {
        if (!id.safeParse(transfer).success) throw at("EQ_TRANSFER_INVALID", f.transferColumn);
        if (!EQ_TRANSFER_NATURES.includes(nature)) throw at("EQ_TRANSFER_NATURE_INVALID", f.natureColumn);
        const t = transfers.get(transfer) ?? { total: 0n, lines: 0, row };
        transfers.set(transfer, { total: t.total + amount, lines: t.lines + 1, row: t.row });
      }
      const decision = cell(row, f.decisionColumn);
      if (decision && !id.safeParse(decision).success) throw at("EQ_DECISION_REF_INVALID", f.decisionColumn);
    }
    if (type === "eq_variation") {
      const c = component(), col = pick(EQ_VARIATION_COLUMNS, cell(row, f.columnColumn));
      if (!col) throw at("EQ_VARIATION_COLUMN_INVALID", f.columnColumn);
      if (date !== (col === "ouverture" ? period.startDate : period.closingDate)) throw at("EQ_VARIATION_DATE_INVALID", m.columns.date);
      if (cells.has(c + "\u0000" + col)) throw at("EQ_VARIATION_DUPLICATE", f.columnColumn);
      cells.add(c + "\u0000" + col);
    }
    if (type === "eq_decisions") {
      if (!id.safeParse(cell(row, f.decisionIdColumn)).success) throw at("EQ_DECISION_ID_REQUIRED", f.decisionIdColumn);
      if (!pick(EQ_DECISION_TYPES, cell(row, f.typeColumn))) throw at("EQ_DECISION_TYPE_INVALID", f.typeColumn);
      component(); effect();
      if (amount === 0n) throw at("EQ_DECISION_ZERO", m.columns.amount);
      if (date > period.asOfDate) throw at("EQ_DECISION_AFTER_REVIEW", m.columns.date);
      const ref = cell(row, f.minutesColumn), page = cell(row, f.pageColumn);
      // An empty PV reference stays « PV absent » at calculation; a malformed one is refused here.
      if (ref && !EQ_PIECE_REF.test(ref)) throw at("EQ_MINUTES_REF_INVALID", f.minutesColumn);
      if (page && !/^[1-9]\d{0,3}$/.test(page)) throw at("EQ_PAGE_INVALID", f.pageColumn);
    }
    if (type === "eq_payments") {
      if (amount <= 0n) throw at("EQ_PAYMENT_SIGN_INVALID", m.columns.amount);
      if (date > period.asOfDate) throw at("EQ_PAYMENT_AFTER_REVIEW", m.columns.date);
      if (!id.safeParse(cell(row, f.decisionColumn)).success) throw at("EQ_PAYMENT_DECISION_REQUIRED", f.decisionColumn);
    }
  }
  // An internal transfer is balanced by construction: its lines sum to zero, so it has no effect on total equity.
  for (const [ref, t] of transfers) if (t.total !== 0n || t.lines < 2) throw new EquitySourceError("EQ_TRANSFER_UNBALANCED", { ...t.row.locator, column: f.transferColumn, value: ref.slice(0, 80) });
}

export interface EqSourceFact { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; value: SourcedAmount; proof: EvidenceLink }
export interface EqBalance extends EqSourceFact { account: string; component: EqComponent; point: "opening" | "closing"; label: string }
export interface EqEntry extends EqSourceFact { entryId: string; account: string; component: EqComponent; nature: EqNature; effectDate: string; decisionRef: string | null; transferRef: string | null; pieceRef: string; label: string }
export interface EqVariationCell extends EqSourceFact { component: EqComponent; column: EqVariationColumn }
export interface EqDecisionLine extends EqSourceFact { lineId: string; decisionId: string; type: EqDecisionType; component: EqComponent; organ: string; effectDate: string; minutesRef: string; page: number | null; resolution: string; extract: string; label: string }
export interface EqPayment extends EqSourceFact { paymentId: string; decisionRef: string; label: string }
export interface EqMinutes { importId: string; documentVersionId: string; fileName: string; sha256: string; pieceRef: string; title: string; documentDate: string; pageCount: number; pages: { page: number; rowId: string; proof: EvidenceLink }[] }
export interface EquityFacts {
  balances: EqBalance[]; entries: EqEntry[]; variation: EqVariationCell[] | null; decisions: EqDecisionLine[] | null; payments: EqPayment[] | null; minutes: EqMinutes[];
  accounts: { account: string; component: EqComponent; label: string }[];
}
export function equityProof(batch: ImportBatch, row: SourceRow, runId: string, purpose: string, precision: "row" | "page" = "row"): EvidenceLink {
  return { id: "proof-" + stableSha256({ runId, rowId: row.id }), scope: batch.scope, procedureId: runId, documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision, status: "verified", purpose };
}
/** Source heads of the equity chain: one per tabular type, one per PV / act piece reference. */
export function equityHeadKey(batch: ImportBatch) { return batch.document.logicalId; }
/**
 * A frozen run is current only if its sources are exactly the current approved equity heads:
 * a replaced, removed or newly approved source (statement, decisions, payments, PV) requires a revision.
 */
export function equitySourcesCurrent(importIds: string[], heads: { document_type: string; import_id: string }[]) {
  if (!importIds.length) return true;
  const current = heads.filter(h => h.document_type.startsWith("eq_")).map(h => h.import_id).sort(), frozenIds = [...importIds].sort();
  return current.length === frozenIds.length && current.every((x, i) => x === frozenIds[i]);
}
const tabular = (b: ImportBatch) => b.document.documentType !== "eq_minutes";
/** Population check used by freezePopulation: the single GL entries source of the validated equity mapping. */
export function isEquityPopulation(imports: ImportBatch[]) {
  return imports.filter(b => b.document.documentType === "eq_entries").length === 1 && imports.filter(b => b.document.documentType === "eq_decisions").length <= 1 && imports.every(b => (EQ_TYPES as readonly string[]).includes(b.document.documentType) && isEquityMapping(b.mapping));
}
/** Population items: every GL entry (« M: ») and every decision line (« D: »); the measure is the signed amount of the row. */
export function equityPopulationItems(imports: ImportBatch[]) {
  return imports.filter(tabular).filter(b => b.document.documentType === "eq_entries" || b.document.documentType === "eq_decisions").flatMap(b => b.rows.map(row => {
    if (!row.normalized || row.errors.length) throw new Error("POPULATION_ROW_INVALID");
    return { id: (b.document.documentType === "eq_entries" ? "M:" : "D:") + row.normalized.key.trim(), rowIds: [row.id], amount: row.normalized.amount };
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Items excluded with their motive: movements and decisions carried by a component outside equity. */
export function equityPopulationExclusions(facts: EquityFacts) {
  return [...facts.entries.filter(e => EQ_EXCLUSIONS[e.component]).map(e => ({ id: "M:" + e.entryId, reason: EQ_EXCLUSIONS[e.component]! })),
    ...(facts.decisions ?? []).filter(d => EQ_EXCLUSIONS[d.component]).map(d => ({ id: "D:" + d.lineId, reason: EQ_EXCLUSIONS[d.component]! }))].sort((a, b) => a.id < b.id ? -1 : 1);
}

/** Builds the decisions, movements and balances from the current approved sources. Inconsistent identities are refused with their locator, never dropped. */
export function buildEquityFacts(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string): EquityFacts {
  const count = (type: EquitySourceType) => imports.filter(b => b.document.documentType === type).length;
  if (count("eq_balances") !== 1 || count("eq_entries") !== 1 || count("eq_variation") > 1 || count("eq_decisions") > 1 || count("eq_payments") > 1 || imports.some(b => !(EQ_TYPES as readonly string[]).includes(b.document.documentType))) throw new EquitySourceError("EQ_SOURCES_REQUIRED");
  const facts: EquityFacts = { balances: [], entries: [], variation: count("eq_variation") ? [] : null, decisions: count("eq_decisions") ? [] : null, payments: count("eq_payments") ? [] : null, minutes: [], accounts: [] };
  const ordered = [...imports].sort((a, b) => EQ_TYPES.indexOf(batchType(a)) - EQ_TYPES.indexOf(batchType(b)) || (a.id < b.id ? -1 : 1));
  const accountComponent = new Map<string, { component: EqComponent; label: string }>();
  for (const batch of ordered) {
    assertScope(scope, batch.scope); assertEquityBatch(batch, period);
    if (!batch.approval || !batch.report.calculationAllowed || batch.report.blocking.length) throw new EquitySourceError("EQ_IMPORT_NOT_APPROVED");
    const type = batchType(batch);
    if (type === "eq_minutes") {
      const e = minutesMappingSchema.parse(batch.mapping).capitaux;
      if (facts.minutes.some(x => x.pieceRef === e.pieceRef)) throw new EquitySourceError("EQ_MINUTES_DUPLICATE", { column: "pieceRef", value: e.pieceRef });
      facts.minutes.push({ importId: batch.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, sha256: batch.document.byteHash, pieceRef: e.pieceRef, title: e.title, documentDate: e.documentDate, pageCount: batch.rows.length,
        pages: batch.rows.map(r => ({ page: r.locator.page!, rowId: r.id, proof: equityProof(batch, r, runId, e.title + " — page " + r.locator.page, "page") })) });
      continue;
    }
    const m = equityMappingSchema.parse(batch.mapping), f = m.capitaux;
    const fact = (row: SourceRow, purpose: string): EqSourceFact => ({ importId: batch.id, rowId: row.id, documentVersionId: batch.document.id, fileName: batch.document.fileName, locator: row.locator,
      value: { amount: row.normalized!.amount, date: row.normalized!.date, source: row }, proof: equityProof(batch, row, runId, purpose) });
    for (const row of batch.rows) {
      const key = row.normalized!.key.trim(), component = pick(EQ_COMPONENTS, cell(row, f.componentColumn))!;
      const bind = (account: string, label: string) => {
        const known = accountComponent.get(account);
        // The balance and the entries must place one account in the same component.
        if (known && known.component !== component) throw new EquitySourceError("EQ_ACCOUNT_COMPONENT_INCONSISTENT", { ...row.locator, column: f.componentColumn, value: account.slice(0, 80) });
        accountComponent.set(account, { component, label: known?.label || label });
      };
      if (type === "eq_balances") {
        const account = cell(row, f.accountColumn), label = cell(row, f.labelColumn); bind(account, label);
        const point = row.normalized!.date === period.startDate ? "opening" as const : "closing" as const;
        facts.balances.push({ ...fact(row, "Balance — " + (point === "opening" ? "ouverture" : "clôture") + " du compte " + account), account, component, point, label });
      } else if (type === "eq_entries") {
        const account = cell(row, f.accountColumn); bind(account, "");
        const nature = pick(EQ_NATURES, cell(row, f.natureColumn))!;
        facts.entries.push({ ...fact(row, "Écriture " + key + " — " + EQ_NATURE_LABELS[nature]), entryId: key, account, component, nature, effectDate: equityDate(cell(row, f.effectDateColumn), m.dateFormat)!,
          decisionRef: cell(row, f.decisionColumn) || null, transferRef: cell(row, f.transferColumn) || null, pieceRef: cell(row, f.pieceColumn), label: cell(row, f.labelColumn) });
      } else if (type === "eq_variation") {
        facts.variation!.push({ ...fact(row, "Tableau de variation fourni"), component, column: pick(EQ_VARIATION_COLUMNS, cell(row, f.columnColumn))! });
      } else if (type === "eq_decisions") {
        const page = cell(row, f.pageColumn);
        facts.decisions!.push({ ...fact(row, "Registre des décisions — ligne " + key), lineId: key, decisionId: cell(row, f.decisionIdColumn), type: pick(EQ_DECISION_TYPES, cell(row, f.typeColumn))!, component, organ: cell(row, f.organColumn),
          effectDate: equityDate(cell(row, f.effectDateColumn), m.dateFormat)!, minutesRef: cell(row, f.minutesColumn), page: page ? Number(page) : null, resolution: cell(row, f.resolutionColumn), extract: cell(row, f.extractColumn), label: cell(row, f.labelColumn) });
      } else {
        facts.payments!.push({ ...fact(row, "Règlement " + key), paymentId: key, decisionRef: cell(row, f.decisionColumn), label: cell(row, f.labelColumn) });
      }
    }
  }
  // A transfer moves equity between equity components only; a leg outside equity would change the total.
  const outside = facts.entries.find(e => e.transferRef && EQ_EXCLUSIONS[e.component]);
  if (outside) throw new EquitySourceError("EQ_TRANSFER_SCOPE_INVALID", { ...outside.locator, column: "composante", value: outside.component });
  facts.accounts = [...accountComponent.entries()].map(([account, v]) => ({ account, component: v.component, label: v.label })).sort((a, b) => EQ_COMPONENTS.indexOf(a.component) - EQ_COMPONENTS.indexOf(b.component) || (a.account < b.account ? -1 : 1));
  facts.entries.sort((a, b) => a.value.date < b.value.date ? -1 : a.value.date > b.value.date ? 1 : a.entryId < b.entryId ? -1 : 1);
  facts.decisions?.sort((a, b) => a.value.date < b.value.date ? -1 : a.value.date > b.value.date ? 1 : a.lineId < b.lineId ? -1 : 1);
  facts.minutes.sort((a, b) => a.pieceRef < b.pieceRef ? -1 : 1);
  return frozen(facts);
}

type FactRef = { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; amount: Money; date: string };
const factRef = (f: EqSourceFact): FactRef => ({ importId: f.importId, rowId: f.rowId, documentVersionId: f.documentVersionId, fileName: f.fileName, locator: f.locator, amount: f.value.amount, date: f.value.date });
/** Browser view of the server facts: amounts, dates and locators only; the browser never recomputes a bridge or a comparison. */
export function equityFactsView(facts: EquityFacts) {
  return {
    accounts: facts.accounts,
    balances: facts.balances.map(b => ({ ...factRef(b), account: b.account, component: b.component, point: b.point, label: b.label })),
    entries: facts.entries.map(e => ({ ...factRef(e), entryId: e.entryId, account: e.account, component: e.component, nature: e.nature, effectDate: e.effectDate, decisionRef: e.decisionRef, transferRef: e.transferRef, pieceRef: e.pieceRef, label: e.label })),
    decisions: facts.decisions?.map(d => ({ ...factRef(d), lineId: d.lineId, decisionId: d.decisionId, type: d.type, component: d.component, organ: d.organ, effectDate: d.effectDate, minutesRef: d.minutesRef, page: d.page, resolution: d.resolution, extract: d.extract, label: d.label })) ?? null,
    payments: facts.payments?.map(p => ({ ...factRef(p), paymentId: p.paymentId, decisionRef: p.decisionRef, label: p.label })) ?? null,
    variationProvided: facts.variation !== null,
    minutes: facts.minutes.map(m => ({ importId: m.importId, documentVersionId: m.documentVersionId, fileName: m.fileName, sha256: m.sha256, pieceRef: m.pieceRef, title: m.title, documentDate: m.documentDate, pageCount: m.pageCount })),
  };
}
export type EquityFactsView = ReturnType<typeof equityFactsView>;

import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { CycleContext } from "./cycle-context";
import { dateSchema, known, proofSchema, type SupportedAmount } from "./cycle-review";
import { reviewEquity } from "./equity";
import { buildEquityFacts, EQ_COMPONENTS, EQ_COMPONENT_LABELS, EQ_DECISION_NATURES, EQ_DECISION_TYPES, EQ_DECISION_TYPE_LABELS, EQ_EXCLUSIONS, EQ_NATURES, EQ_NATURE_LABELS, EQ_RESERVES, EQ_TRANSFER_NATURES, EQ_VARIATION_COLUMNS,
  EquitySourceError, type EqComponent, type EqDecisionLine, type EqEntry, type EqMinutes, type EqNature, type EquityFacts } from "./capitaux-sources";
import { frozen, knownAmountSchema, moneySchema, scopeSchema, type EvidenceLink, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { authorize, type Principal } from "./policy";
import { legalMarkers, legalMarkersSchema, SOCIAL_FORMS, SOCIAL_FORM_LABELS } from "./capitaux-legal";
import { buildPresentation, instrumentDeclarationSchema, instrumentDraftSchema, presentationSchema, type InstrumentDeclaration } from "./capitaux-presentation";
import { paymentState, paymentStateSchema, type PaymentState } from "./capitaux-payment";

export const EQUITY_PROCEDURE = "equity.review" as const;
/** Result contract of rule 1.1.0 (C09); results of rule 1.0.0 (« equity-result-1 ») stay readable and are never rewritten. */
export const CAPITAUX_RESULT_SCHEMA_VERSION = "capitaux-result-2" as const;
/** Rule of the /capitaux-propres procedure producing that contract. 1.1.1: an SCA's half-capital marker cites L225-248 through the renvoi of C. com. L226-1. */
export const CAPITAUX_RULE_VERSION = "1.1.1" as const;
/** Previous rule on the same contract: every other social form (or none declared) gets an identical result under 1.1.1. */
export const CAPITAUX_RULE_VERSION_1_1_0 = "1.1.0" as const;
/**
 * Why a sheet must be revised before being continued, or null when its rule still applies to it (callers name the sheet's rule).
 * Only the works concerned are made stale: a 1.1.0 sheet stays current unless its declared social form is an SCA; a 1.0.0 sheet
 * always needs a revision.
 */
export function capitauxRuleReplaced(run: Pick<WorkpaperRun, "template" | "capitauxWork">): string | null {
  const version = run.template.rule?.version ?? run.template.version;
  if (version === CAPITAUX_RULE_VERSION) return null;
  if (version === CAPITAUX_RULE_VERSION_1_1_0) {
    const form = run.capitauxWork?.schemaVersion === "equity-2" ? run.capitauxWork.framing.socialForm : null;
    return form === "sca" ? `forme déclarée SCA ; la règle ${CAPITAUX_RULE_VERSION} cite l’art. L225-248 par le renvoi de l’art. L226-1 (repère « moitié du capital »).` : null;
  }
  return `la règle ${CAPITAUX_RULE_VERSION} apporte les décisions amendées, le paiement par décision, les autres fonds propres et les repères légaux.`;
}
const id = z.string().trim().min(1).max(200), note = z.string().trim().max(10000), required = note.refine(v => !!v, "Texte requis");
const timestamp = z.string().refine(v => Number.isFinite(Date.parse(v)), "Horodatage requis");
/** The browser names a frozen document version (and a PDF page); file name, hash and piece are resolved by the server. */
const citationInput = z.object({ documentId: z.string().min(1).max(200), page: z.number().int().positive().max(10000).optional() }).strict();
const stampedCitation = z.object({ documentVersionId: id, importId: id, fileName: id, sha256: id, pieceRef: id.optional(), page: z.number().int().positive().optional() }).strict();
/** The preparer only names the decision lines whose PV reading he validated; piece, version and page are resolved by the server. */
export const equityReadingDraftSchema = z.object({ lineId: id, text: required }).strict();
export const equityFramingDraftSchema = z.object({ socialForm: z.enum(SOCIAL_FORMS).nullable(), socialFormCitation: citationInput.nullable(), anticipationAnc202407: z.boolean(), anticipationCitation: citationInput.nullable() }).strict();
export const EMPTY_FRAMING_DRAFT = { socialForm: null, socialFormCitation: null, anticipationAnc202407: false, anticipationCitation: null } as const;
/** Framing and instruments are optional in a draft: a draft carrying only readings keeps them empty (rule 1.1.0). */
export const equityDraftSchema = z.object({ readings: z.array(equityReadingDraftSchema).max(1000), framing: equityFramingDraftSchema.optional(), instruments: z.array(instrumentDraftSchema).max(50).optional() }).strict();
export type EquityDraft = z.infer<typeof equityDraftSchema>;
export const equityConventionSchema = z.object({ version: z.literal("eq-sign-1"), label: z.literal("equity_credit_positive"), validatedBy: id, validatedAt: timestamp }).strict();
export const equityReadingSchema = equityReadingDraftSchema.extend({ importId: id, documentVersionId: id, pieceRef: id, page: z.number().int().positive(), authorId: id, authoredAt: timestamp }).strict();
export const equityFramingSchema = z.object({ socialForm: z.enum(SOCIAL_FORMS).nullable(), socialFormCitation: stampedCitation.nullable(), anticipationAnc202407: z.boolean(), anticipationCitation: stampedCitation.nullable(), authorId: id, authoredAt: timestamp }).strict();
/** Rule 1.0.0 work, kept readable for the versions it produced. */
export const capitauxWorkSchemaV1 = z.object({ schemaVersion: z.literal("equity-1"), convention: equityConventionSchema, readings: z.array(equityReadingSchema).max(1000) }).strict();
/** Rule 1.1.0 work: readings, declared framing (social form, ANC 2024-07 anticipation) and instruments cited to frozen pieces. */
export const capitauxWorkSchemaV2 = z.object({ schemaVersion: z.literal("equity-2"), convention: equityConventionSchema, readings: z.array(equityReadingSchema).max(1000), framing: equityFramingSchema, instruments: z.array(instrumentDeclarationSchema).max(50) }).strict();
export const capitauxWorkSchema = z.union([capitauxWorkSchemaV1, capitauxWorkSchemaV2]);
export type EquityWork = z.infer<typeof capitauxWorkSchema>;
export type EquityWorkV2 = z.infer<typeof capitauxWorkSchemaV2>;
export type EquityReading = z.infer<typeof equityReadingSchema>;
export const EQ_CONVENTION_MEANING = "Sens des capitaux propres : un montant positif augmente la composante (crédit), un montant négatif la diminue (débit). Balance, écritures, tableau fourni et décisions sont exprimés dans ce sens ; le mapping peut inverser un export GL débit positif.";
export const EQ_METHOD_TEXT = "Méthode interne de recherche (pas une règle juridique) : une décision de l’organe compétent est recherchée pour les affectations du résultat, distributions, augmentations et réductions de capital et incorporations de réserves. Décision, comptabilisation et paiement restent trois mesures distinctes.";
export const EQ_LEGAL_TEXT = "Aucune règle juridique n’est implémentée (réserve légale, capitaux propres inférieurs à la moitié du capital, conditions de distribution…) : une telle règle doit être sourcée pour la forme sociale et la période avant toute implémentation. Les rapports affichés sont arithmétiques et ne valent ni conformité ni feu vert juridique.";
/** Rule 1.1.0: dated legal markers, arithmetic only. */
export const EQ_LEGAL_TEXT_V2 = "Repères légaux datés par forme sociale (C. com. L232-10, L232-11, L223-42, L225-248, L227-1, versions lues le 14/10/2026) : calculs arithmétiques sur les sources et signaux « à examiner » seulement. Aucune conclusion juridique, aucune alerte de dissolution, aucun délai calculé.";
/** Rule 1.1.1: same markers, the SCA citing the renvoi of L226-1. */
export const EQ_LEGAL_TEXT_V3 = "Repères légaux datés par forme sociale (C. com. L232-10, L232-11, L223-42, L225-248, L226-1, L227-1, versions lues le 14/10/2026) : calculs arithmétiques sur les sources et signaux « à examiner » seulement. Aucune conclusion juridique, aucune alerte de dissolution, aucun délai calculé.";
export const EQUITY_LIMITATIONS = [
  "Aucune conclusion juridique : un rapport arithmétique ou une décision rapprochée ne démontre ni la régularité de la décision ni la conformité des capitaux propres.",
  "La lecture d’un PV est une validation humaine de la transcription à la page citée ; elle ne prouve ni l’authenticité du PV, ni le quorum, ni la régularité de la convocation.",
  "La complétude de l’extraction des écritures n’est démontrée que composante par composante, par le pont ouverture + mouvements = clôture.",
  "Autres fonds propres listés et exclus du total avec motif ; composition non qualifiée par cette procédure.",
  "Une composante incomplète (ouverture, clôture ou compte absents) reste inconnue : aucune valeur réputée nulle, aucun total ni rapport calculé sur une partie.",
  "Paiements des distributions présentés séparément ; ils ne valent ni décision ni comptabilisation.",
  "Événements postérieurs à la clôture présentés sur la frise ; aucune appréciation de leur traitement comptable.",
];
/** Rule 1.1.0 limitations: other equity funds are presented instrument by instrument, amendments and settlements are traced. */
export const EQUITY_LIMITATIONS_V2 = [
  ...EQUITY_LIMITATIONS.filter(l => !l.startsWith("Autres fonds propres") && !l.startsWith("Paiements des distributions")),
  "Autres fonds propres exclus du total des capitaux propres ; leur présentation est qualifiée instrument par instrument à partir des termes contractuels déclarés et cités, selon le texte applicable à l’exercice (ANC 2024-07 ou texte antérieur). Aucun classement par numéro de compte.",
  "Une décision amendée n’est comptée qu’une fois : la ligne remplacée (décidée au plus tard à la clôture) reste visible et ses écritures et règlements sont rapprochés de la décision en vigueur. Une modification postérieure à la clôture ne change pas la décision en vigueur à la clôture.",
  "Paiements présentés à part et comparés au montant voté de la décision en vigueur, à la clôture et à la date de revue ; sans source de règlements, le paiement reste inconnu.",
];

function context(scope: WorkpaperScope, period: AccountingPeriod): CycleContext { return { scope, period, purpose: scope.mode === "real" ? "real" : "synthetic_technical", procedure: EQUITY_PROCEDURE }; }
type StampedCitation = z.infer<typeof stampedCitation>;
const citationRef = (c: StampedCitation | null) => c ? { documentId: c.documentVersionId, ...(c.page ? { page: c.page } : {}) } : null;
/** Draft rebuilt from the stored work: readings, framing and instruments are carried over so that a partial edit never drops them. */
export function equityDraftFromWork(work: EquityWork): EquityDraft {
  const v2 = work.schemaVersion === "equity-2" ? work : null;
  return equityDraftSchema.parse({ readings: work.readings.map(r => ({ lineId: r.lineId, text: r.text })),
    framing: v2 ? { socialForm: v2.framing.socialForm, socialFormCitation: citationRef(v2.framing.socialFormCitation), anticipationAnc202407: v2.framing.anticipationAnc202407, anticipationCitation: citationRef(v2.framing.anticipationCitation) } : { ...EMPTY_FRAMING_DRAFT },
    instruments: v2 ? v2.instruments.map(i => ({ id: i.id, label: i.label, kind: i.kind, accounts: i.accounts, terms: i.terms, note: i.note, citation: citationRef(i.citation) })) : [] });
}
const pvOf = (facts: EquityFacts, line: EqDecisionLine): EqMinutes | null => line.minutesRef ? facts.minutes.find(m => m.pieceRef === line.minutesRef) ?? null : null;
/** A declaration cites a frozen document version (and a page of a PDF piece); file, hash and piece are resolved here, never typed by the browser. */
function stampCitation(imports: ImportBatch[], input: z.infer<typeof citationInput> | null): StampedCitation | null {
  if (!input) return null;
  const batch = imports.find(b => b.document.id === input.documentId);
  if (!batch) throw new Error("EQ_CITATION_SOURCE_REQUIRED");
  const pdf = batch.document.format === "pdf";
  if (pdf ? !input.page || input.page > batch.rows.length : input.page !== undefined) throw new Error("EQ_CITATION_PAGE_INVALID");
  return stampedCitation.parse({ documentVersionId: batch.document.id, importId: batch.id, fileName: batch.document.fileName, sha256: batch.document.byteHash, ...(pdf ? { pieceRef: batch.mapping.capitaux?.pieceRef, page: input.page } : {}) });
}
/** An unchanged declaration keeps its original author and date. */
function keepAuthor<T extends { authorId: string; authoredAt: string }>(next: Omit<T, "authorId" | "authoredAt">, previous: T | undefined, actor: string, at: string): T {
  if (previous) { const { authorId, authoredAt, ...prior } = previous; if (stableSha256(prior) === stableSha256(next)) return { ...next, authorId, authoredAt } as T; }
  return { ...next, authorId: actor, authoredAt: at } as T;
}

/** Server-only stamping: author, date, convention validator and the cited piece / version / page come from the session and the frozen sources. */
export function stampEquityWork(input: { scope: WorkpaperScope; period: AccountingPeriod; runId: string; imports: ImportBatch[]; draft: EquityDraft; actor: Principal; at: string; previous?: EquityWork }): EquityWorkV2 {
  authorize(input.actor, input.scope, "prepare");
  if (!Number.isFinite(Date.parse(input.at))) throw new Error("EQ_TIMESTAMP_INVALID");
  const draft = equityDraftSchema.parse(input.draft);
  if (new Set(draft.readings.map(r => r.lineId)).size !== draft.readings.length) throw new Error("EQ_READING_DUPLICATE");
  const instrumentsDraft = draft.instruments ?? [];
  if (new Set(instrumentsDraft.map(i => i.id)).size !== instrumentsDraft.length) throw new Error("EQ_INSTRUMENT_DUPLICATE");
  if (new Set(instrumentsDraft.flatMap(i => i.accounts)).size !== instrumentsDraft.flatMap(i => i.accounts).length) throw new Error("EQ_INSTRUMENT_ACCOUNT_DUPLICATE");
  const framingDraft = draft.framing ?? EMPTY_FRAMING_DRAFT;
  // An anticipation of ANC 2024-07 is an entity choice: it must cite the piece that documents it.
  if (framingDraft.anticipationAnc202407 && !framingDraft.anticipationCitation) throw new Error("EQ_ANTICIPATION_CITATION_REQUIRED");
  const facts = buildEquityFacts(input.scope, input.period, input.imports, input.runId);
  const readings = draft.readings.map(r => {
    const line = facts.decisions?.find(d => d.lineId === r.lineId);
    if (!line) throw new Error("EQ_READING_LINE_UNKNOWN");
    const pv = pvOf(facts, line);
    if (!pv) throw new Error("EQ_READING_PV_REQUIRED");
    if (!line.page || line.page > pv.pageCount) throw new Error("EQ_READING_PAGE_INVALID");
    const cited = { lineId: r.lineId, text: r.text, importId: pv.importId, documentVersionId: pv.documentVersionId, pieceRef: pv.pieceRef, page: line.page };
    // A reading unchanged since the previous version keeps its original author and date.
    const old = input.previous?.readings.find(p => p.lineId === r.lineId);
    if (old) { const { authorId, authoredAt, ...prior } = old; if (stableSha256(prior) === stableSha256(cited)) return { ...cited, authorId, authoredAt }; }
    return { ...cited, authorId: input.actor.id, authoredAt: input.at };
  }).sort((a, b) => a.lineId < b.lineId ? -1 : 1);
  const convention = input.previous?.convention ?? { version: "eq-sign-1" as const, label: "equity_credit_positive" as const, validatedBy: input.actor.id, validatedAt: input.at };
  const previous = input.previous?.schemaVersion === "equity-2" ? input.previous : undefined;
  const framing = keepAuthor<z.infer<typeof equityFramingSchema>>({ socialForm: framingDraft.socialForm, socialFormCitation: stampCitation(input.imports, framingDraft.socialFormCitation),
    anticipationAnc202407: framingDraft.anticipationAnc202407, anticipationCitation: stampCitation(input.imports, framingDraft.anticipationCitation) }, previous?.framing, input.actor.id, input.at);
  const instruments = instrumentsDraft.map(d => keepAuthor<InstrumentDeclaration>({ id: d.id, label: d.label, kind: d.kind, accounts: d.accounts, terms: d.terms, note: d.note, citation: stampCitation(input.imports, d.citation) },
    previous?.instruments.find(p => p.id === d.id), input.actor.id, input.at)).sort((a, b) => a.id < b.id ? -1 : 1);
  const work = capitauxWorkSchemaV2.parse({ schemaVersion: "equity-2", convention, readings, framing, instruments });
  evaluateEquity(input.scope, input.period, input.imports, input.runId, work);
  return frozen(work);
}

const components = z.enum(EQ_COMPONENTS), natures = z.enum(EQ_NATURES);
const ratioSchema = z.union([knownAmountSchema, z.object({ kind: z.literal("ratio"), numerator: z.string().regex(/^-?\d+$/), denominator: z.string().regex(/^-?\d+$/) }).strict()]);
const exceptionCodes = ["BRIDGE_DIFFERENCE", "COMPONENT_INCOMPLETE", "STATEMENT_DIFFERENCE", "DECISION_WITHOUT_ENTRY", "AMOUNT_DIVERGENT", "PAYMENT_WITHOUT_DECISION", "ENTRY_WITHOUT_DECISION", "ENTRY_DECISION_MISMATCH", "EFFECT_OUTSIDE_PERIOD", "DECISIONS_SOURCE_MISSING", "PV_MISSING", "READING_PENDING"] as const;
export type EquityExceptionCode = typeof exceptionCodes[number];
export const EQ_UNCERTAINTY_CODES: EquityExceptionCode[] = ["COMPONENT_INCOMPLETE", "DECISIONS_SOURCE_MISSING", "PV_MISSING", "READING_PENDING"];
const controlIds = ["bridge", "statement", "decisions", "entries", "minutes"] as const;
export type EquityControlId = typeof controlIds[number];
const decisionStatus = z.enum(["matched", "amount_divergent", "without_entry", "reading_required", "effect_outside_period", "not_expected", "prior_period", "excluded", "superseded"]);
const framingResultSchema = equityFramingSchema.omit({ authorId: true, authoredAt: true }).extend({ socialFormLabel: note, authorId: id, authoredAt: timestamp }).strict();
const entryStatus = z.enum(["matched", "not_required", "without_decision", "unknown_decision", "mismatch", "source_missing", "excluded"]);
export const equityResultSchema = z.object({
  schemaVersion: z.enum(["equity-result-1", CAPITAUX_RESULT_SCHEMA_VERSION]), scope: scopeSchema, runId: id, mode: z.enum(["real", "demo"]), startDate: dateSchema, closingDate: dateSchema, reviewDate: dateSchema,
  convention: equityConventionSchema.extend({ meaning: note }).strict(), method: z.object({ decisionNatures: z.array(natures), transferNatures: z.array(natures), meaning: note }).strict(),
  cartography: z.array(z.object({ component: components, label: note, status: z.enum(["provided", "not_provided", "excluded"]), accounts: z.array(id), reason: note.nullable() }).strict()),
  components: z.array(z.object({
    component: components, label: note, inScope: z.boolean(), exclusionReason: note.nullable(), status: z.enum(["computed", "incomplete", "excluded"]),
    accounts: z.array(z.object({ account: id, label: note, opening: moneySchema.nullable(), closing: moneySchema.nullable(), proofIds: z.array(id) }).strict()),
    opening: moneySchema.nullable(), movements: z.record(natures, moneySchema), movementsTotal: moneySchema, expected: moneySchema.nullable(), closing: moneySchema.nullable(),
    difference: knownAmountSchema, missing: z.array(note), entryIds: z.array(id), evidence: z.array(proofSchema),
  }).strict()),
  natures: z.array(natures),
  totals: z.object({ complete: z.boolean(), inScopeComponents: z.number().int().nonnegative(), computedComponents: z.number().int().nonnegative(), opening: knownAmountSchema, movements: z.record(natures, moneySchema), movementsTotal: moneySchema, expected: knownAmountSchema, closing: knownAmountSchema, difference: knownAmountSchema, transfersEffect: moneySchema }).strict(),
  entries: z.array(z.object({ entryId: id, account: id, component: components, nature: natures, amount: moneySchema, date: dateSchema, effectDate: dateSchema, decisionRef: id.nullable(), transferRef: id.nullable(), pieceRef: note, label: note,
    inScope: z.boolean(), decisionStatus: entryStatus, effectStatus: z.enum(["in_period", "outside_period"]), proofId: id }).strict()),
  transfers: z.array(z.object({ transferRef: id, entryIds: z.array(id).min(2), components: z.array(components), total: moneySchema, lines: z.array(z.object({ entryId: id, component: components, amount: moneySchema }).strict()) }).strict()),
  decisions: z.array(z.object({
    lineId: id, decisionId: id, type: z.enum(EQ_DECISION_TYPES), component: components, organ: note, label: note, voted: moneySchema, decisionDate: dateSchema, effectDate: dateSchema, timing: z.enum(["before_period", "in_period", "after_closing"]), inScope: z.boolean(),
    pv: z.object({ pieceRef: note, status: z.enum(["available", "missing", "page_invalid"]), importId: id.nullable(), documentVersionId: id.nullable(), fileName: note.nullable(), sha256: note.nullable(), title: note.nullable(), page: z.number().int().positive().nullable(), pageCount: z.number().int().positive().nullable(), resolution: note, extract: note, proofId: id.nullable() }).strict(),
    reading: z.object({ status: z.enum(["validated", "pending", "not_possible"]), text: note.nullable(), authorId: id.nullable(), authoredAt: note.nullable(), documentVersionId: id.nullable(), page: z.number().int().positive().nullable() }).strict(),
    booked: knownAmountSchema, entryIds: z.array(id), payment: knownAmountSchema, paymentIds: z.array(id), difference: knownAmountSchema, status: decisionStatus, statusMeaning: note, proofIds: z.array(id),
    /** Rule 1.1.0 only: amendment chain and settlement of the decision in force. */
    amends: id.nullable().optional(), supersededBy: id.nullable().optional(), chain: z.array(id).optional(), paymentGroup: note.nullable().optional(), paymentState: paymentStateSchema.nullable().optional(),
  }).strict()).nullable(),
  payments: z.array(z.object({ paymentId: id, decisionRef: id, amount: moneySchema, date: dateSchema, label: note, linked: z.boolean(), proofId: id }).strict()).nullable(),
  statement: z.object({ provided: z.boolean(), cells: z.array(z.object({ component: components, column: z.enum(EQ_VARIATION_COLUMNS), provided: moneySchema.nullable(), rebuilt: moneySchema.nullable(), difference: knownAmountSchema, proofId: id.nullable() }).strict()) }).strict(),
  ratios: z.object({ equityToCapital: ratioSchema, reservesToCapital: ratioSchema, meaning: note }).strict(),
  legalConclusion: z.object({ kind: z.literal("unknown"), reason: note }).strict(), legalMeaning: note,
  exceptions: z.array(z.object({ id, controlId: z.enum(controlIds), code: z.enum(exceptionCodes), label: note, component: components.nullable(), targetId: id, message: note, amount: knownAmountSchema, proofIds: z.array(id) }).strict()),
  controls: z.array(z.object({ id: z.enum(controlIds), label: note, unit: note, outcome: z.enum(["no_exception_detected", "exceptions_detected", "inconclusive"]), numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), exclusions: z.array(z.object({ id, reason: note }).strict()) }).strict()),
  evidence: z.array(proofSchema), limitations: z.array(note), conclusion: z.null(),
  /** Rule 1.1.0 only. */
  framing: framingResultSchema.optional(), presentation: presentationSchema.optional(), legal: legalMarkersSchema.optional(),
}).strict().superRefine((r, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const c = (m: Money) => cents(m);
  // One contract per rule version: a 1.0.0 result never carries 1.1.0 fields, a 1.1.0 result always does.
  const v2 = r.schemaVersion === CAPITAUX_RESULT_SCHEMA_VERSION;
  if (v2 !== !!r.framing || v2 !== !!r.presentation || v2 !== !!r.legal) issue("Contrat de résultat incohérent avec sa version");
  for (const d of r.decisions ?? []) {
    if (v2 ? d.paymentState === undefined || d.amends === undefined || d.supersededBy === undefined || !d.chain || d.paymentGroup === undefined : d.paymentState !== undefined || d.amends !== undefined || d.supersededBy !== undefined || d.chain !== undefined || d.paymentGroup !== undefined || d.status === "superseded") issue("Décision incohérente avec la version du contrat : " + d.lineId);
    if (d.status === "superseded" && (!d.supersededBy || d.entryIds.length || d.paymentIds.length || d.difference.kind === "known")) issue("Décision remplacée encore rapprochée : " + d.lineId);
  }
  if (r.mode !== r.scope.mode || r.closingDate < r.startDate || r.reviewDate < r.closingDate) issue("Période du résultat incohérente");
  if (r.controls.length !== 5 || new Set(r.controls.map(x => x.id)).size !== 5 || r.controls.some(x => x.numerator > x.denominator)) issue("Programme ou dénominateur incohérent");
  for (const x of r.components) {
    const total = Object.values(x.movements).reduce((s, m) => s + (m ? c(m) : 0n), 0n);
    if (total !== c(x.movementsTotal)) issue("Mouvements incohérents pour " + x.component);
    if (x.status === "computed") {
      // The bridge is recomputed from the sources: the closing is never rewritten.
      if (!x.opening || !x.closing || !x.expected || x.difference.kind !== "known" || c(x.expected) !== c(x.opening) + c(x.movementsTotal) || c(x.difference.value) !== c(x.closing) - c(x.expected)) issue("Pont incohérent pour " + x.component);
    } else if (x.difference.kind === "known") issue("Écart connu sur une composante non calculée : " + x.component);
  }
  // Internal transfers are balanced and have no effect on total equity.
  if (r.transfers.some(t => c(t.total) !== 0n || t.lines.reduce((s, l) => s + c(l.amount), 0n) !== 0n) || c(r.totals.transfersEffect) !== 0n) issue("Transfert interne déséquilibré");
  if (r.totals.complete !== (r.totals.inScopeComponents > 0 && r.totals.computedComponents === r.totals.inScopeComponents) || (!r.totals.complete && [r.totals.opening, r.totals.closing, r.totals.expected, r.totals.difference].some(v => v.kind === "known"))) issue("Total des capitaux propres calculé sur une partie");
  for (const d of r.decisions ?? []) {
    if (d.difference.kind === "known" && (d.booked.kind !== "known" || c(d.difference.value) !== c(d.booked.value) - c(d.voted))) issue("Comparaison incohérente pour " + d.lineId);
    if (d.difference.kind === "known" && d.reading.status !== "validated") issue("Comparaison sans lecture validée pour " + d.lineId);
  }
  const proofIds = new Set(r.evidence.map(p => p.id));
  if (r.components.some(x => x.evidence.some(p => !proofIds.has(p.id))) || r.exceptions.some(e => e.proofIds.some(p => !proofIds.has(p))) || (r.decisions ?? []).some(d => d.proofIds.some(p => !proofIds.has(p)) || (d.pv.proofId !== null && !proofIds.has(d.pv.proofId)))
    || r.entries.some(e => !proofIds.has(e.proofId)) || (r.payments ?? []).some(p => !proofIds.has(p.proofId)) || r.statement.cells.some(x => x.proofId !== null && !proofIds.has(x.proofId))) issue("Référence de preuve non résolue");
  if (new Set(r.exceptions.map(e => e.id)).size !== r.exceptions.length || new Set(r.entries.map(e => e.entryId)).size !== r.entries.length) issue("Identité de résultat dupliquée");
});
export type EquityResult = z.infer<typeof equityResultSchema>;
export type EquityComponentResult = EquityResult["components"][number];
export type EquityDecisionResult = NonNullable<EquityResult["decisions"]>[number];
export type EquityEntryResult = EquityResult["entries"][number];
export const EQ_EXCEPTION_LABELS: Record<EquityExceptionCode, string> = {
  BRIDGE_DIFFERENCE: "Écart du pont de la composante à expliquer", COMPONENT_INCOMPLETE: "Composante incomplète : solde ou compte absent", STATEMENT_DIFFERENCE: "Tableau de variation fourni différent du tableau reconstitué",
  DECISION_WITHOUT_ENTRY: "Décision sans écriture", AMOUNT_DIVERGENT: "Montant divergent entre décision et comptabilisation", PAYMENT_WITHOUT_DECISION: "Règlement sans décision rattachée",
  ENTRY_WITHOUT_DECISION: "Écriture sans décision", ENTRY_DECISION_MISMATCH: "Écriture rattachée à une décision d’une autre composante ou nature", EFFECT_OUTSIDE_PERIOD: "Effet hors période comptabilisé dans l’exercice",
  DECISIONS_SOURCE_MISSING: "Registre des décisions absent : écritures non rapprochées", PV_MISSING: "PV absent ou page introuvable", READING_PENDING: "Lecture du PV à valider",
};
export const EQ_DECISION_TEXT: Record<z.infer<typeof decisionStatus>, { label: string; meaning: string }> = {
  matched: { label: "Concordante", meaning: "Montant voté et montant comptabilisé identiques après lecture validée du PV ; aucune conclusion juridique." },
  amount_divergent: { label: "Montant divergent", meaning: "Montant comptabilisé différent du montant voté ; l’écart reste à expliquer, il ne vaut pas anomalie validée." },
  without_entry: { label: "Sans écriture", meaning: "Décision à effet dans l’exercice sans aucune écriture rattachée : à rechercher." },
  reading_required: { label: "Lecture requise", meaning: "Écritures rattachées, mais PV absent ou lecture non validée : aucune comparaison de montant." },
  effect_outside_period: { label: "Effet hors période", meaning: "Décision à effet hors de l’exercice, pourtant comptabilisée dans l’exercice." },
  not_expected: { label: "Postérieure à la clôture", meaning: "Effet postérieur à la clôture : aucune écriture attendue dans l’exercice ; présentée sur la frise." },
  prior_period: { label: "Antérieure à l’exercice", meaning: "Effet antérieur à l’ouverture : aucune écriture attendue dans l’exercice." },
  excluded: { label: "Exclue", meaning: "Composante hors capitaux propres : décision listée avec motif, non testée." },
  superseded: { label: "Remplacée", meaning: "Ligne remplacée par une décision ultérieure prise au plus tard à la clôture : ses écritures et règlements sont rapprochés de la décision en vigueur ; elle n’est pas comptée deux fois." },
};
export const EQ_ENTRY_TEXT: Record<z.infer<typeof entryStatus>, { label: string; meaning: string }> = {
  matched: { label: "Décision rattachée", meaning: "Écriture rattachée à une ligne de décision de même composante et de même nature." },
  not_required: { label: "Sans décision requise", meaning: "Nature pour laquelle la méthode ne recherche pas de décision (résultat de l’exercice, subventions, provisions, reclassement, autre)." },
  without_decision: { label: "Sans décision", meaning: "Nature appelant une décision, sans référence de décision : à rechercher." },
  unknown_decision: { label: "Décision introuvable", meaning: "La décision citée n’existe pas dans le registre fourni." },
  mismatch: { label: "Décision incohérente", meaning: "La décision citée vise une autre composante ou une autre nature." },
  source_missing: { label: "Registre absent", meaning: "Registre des décisions non fourni : rapprochement impossible, aucune conclusion." },
  excluded: { label: "Exclue", meaning: "Composante hors capitaux propres : listée avec motif, non testée." },
};

const sumMoney = (values: Money[]) => money(values.reduce((s, m) => s + cents(m), 0n));
const BASIS = "equity_credit_positive_eur";
/** Pure, deterministic evaluation on the frozen approved sources. Missing sources stay visible as such; nothing unknown becomes zero. */
export function evaluateEquity(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, input: EquityWork): EquityResult {
  // Rule 1.1.0 executes only 1.1.0 work: a 1.0.0 sheet is read, never recomputed under another rule.
  const work = capitauxWorkSchemaV2.parse(input), facts = buildEquityFacts(scope, period, imports, runId), ctx = context(scope, period);
  const exceptions: EquityResult["exceptions"] = [];
  const add = (code: EquityExceptionCode, controlId: EquityControlId, component: EqComponent | null, targetId: string, message: string, amount: KnownAmount, proofIds: string[]) =>
    exceptions.push({ id: code + ":" + stableSha256({ runId, code, component, targetId }).slice(0, 24), controlId, code, label: EQ_EXCEPTION_LABELS[code], component, targetId, message, amount, proofIds: [...new Set(proofIds)] });
  const present = new Set<EqComponent>([...facts.accounts.map(a => a.component), ...(facts.decisions ?? []).map(d => d.component), ...(facts.variation ?? []).map(v => v.component)]);
  const cartography = EQ_COMPONENTS.map(c => ({ component: c, label: EQ_COMPONENT_LABELS[c], status: !present.has(c) ? "not_provided" as const : EQ_EXCLUSIONS[c] ? "excluded" as const : "provided" as const,
    accounts: facts.accounts.filter(a => a.component === c).map(a => a.account), reason: !present.has(c) ? "Aucun compte, écriture, décision ni cellule fournie : rien n’est réputé nul." : EQ_EXCLUSIONS[c] ?? null }));
  const ordered = EQ_COMPONENTS.filter(c => present.has(c)), inScope = (c: EqComponent) => !EQ_EXCLUSIONS[c];
  const supported = (amount: Money, date: string, proofs: EvidenceLink[]): SupportedAmount => ({ amount, date, basis: BASIS, evidence: proofs });
  // Component bridges go through reviewEquity: opening + movements = expected, compared to the observed closing.
  const prepared = ordered.filter(c => inScope(c)).map(component => {
    const accounts = facts.accounts.filter(a => a.component === component).map(a => ({ ...a, opening: facts.balances.find(b => b.account === a.account && b.point === "opening") ?? null, closing: facts.balances.find(b => b.account === a.account && b.point === "closing") ?? null }));
    const entries = facts.entries.filter(e => e.component === component);
    const missing = !accounts.length ? ["Aucun compte de la balance ni écriture : composante citée seulement par le registre des décisions ou le tableau fourni."]
      : accounts.flatMap(a => [!a.opening && `Compte ${a.account} : ouverture absente de la balance.`, !a.closing && `Compte ${a.account} : clôture absente de la balance.`].filter((v): v is string => !!v));
    const opening = accounts.length && accounts.every(a => a.opening) ? supported(sumMoney(accounts.map(a => a.opening!.value.amount)), period.startDate, accounts.map(a => a.opening!.proof)) : null;
    const closing = accounts.length && accounts.every(a => a.closing) ? supported(sumMoney(accounts.map(a => a.closing!.value.amount)), period.closingDate, accounts.map(a => a.closing!.proof)) : null;
    return { component, accounts, entries, missing, opening, closing };
  });
  const passed = prepared.filter(p => p.accounts.length);
  const reserveIds = EQ_RESERVES.filter(r => present.has(r));
  const reservesEstablished = reserveIds.length > 0 && reserveIds.every(r => passed.some(p => p.component === r));
  const allLines = facts.decisions ?? [];
  // Amendment chains: a line replaced by a decision taken no later than the closing date is superseded; a later amendment leaves the decision in force at closing unchanged.
  const replacedBy = new Map<string, EqDecisionLine>();
  for (const l of allLines) if (l.amends && l.value.date <= period.closingDate) replacedBy.set(l.amends, l);
  const chainOf = (line: EqDecisionLine) => { const chain: EqDecisionLine[] = []; let current = line;
    while (current.amends && replacedBy.get(current.amends)?.lineId === current.lineId) { current = allLines.find(x => x.lineId === current.amends)!; chain.unshift(current); }
    return chain; };
  const finalOf = (line: EqDecisionLine) => { let current = line; while (replacedBy.has(current.lineId)) current = replacedBy.get(current.lineId)!; return current; };
  const allInScopeLines = allLines.filter(d => inScope(d.component) && !replacedBy.has(d.lineId));
  // Decision lines: timing, PV, reading, linked entries and payments. Decision, booking and payment stay three separate measures.
  const linkOf = (e: EqEntry) => {
    if (!e.decisionRef) return null;
    return allInScopeLines.find(d => d.lineId === e.decisionRef) ?? allLines.find(d => d.lineId === e.decisionRef) ?? null;
  };
  const compatible = (e: EqEntry, d: EqDecisionLine) => d.component === e.component && (d.type === "autre_decision" || d.type === e.nature);
  const timingOf = (date: string) => date < period.startDate ? "before_period" as const : date > period.closingDate ? "after_closing" as const : "in_period" as const;
  // An amendment decided after the closing is a post-closing signal, whatever effect date it declares: the decision it targets stays in force
  // at closing and is the only one compared, settled and counted for the period.
  const postClosing = (line: EqDecisionLine) => !!line.amends && line.value.date > period.closingDate;
  const lineTiming = (line: EqDecisionLine) => postClosing(line) ? "after_closing" as const : timingOf(line.effectDate);
  const lineState = allInScopeLines.map(line => {
    const pv = pvOf(facts, line), page = pv && line.page && line.page <= pv.pageCount ? pv.pages.find(p => p.page === line.page)! : null;
    const reading = work.readings.find(r => r.lineId === line.lineId), readingValid = !!reading && !!pv && !!page && reading.importId === pv.importId && reading.page === line.page;
    // The decision in force carries the entries and payments of the lines it replaced: one economic decision is compared once.
    const chain = chainOf(line), refs = new Set([line.lineId, ...chain.map(c => c.lineId)]);
    const entries = facts.entries.filter(e => e.decisionRef !== null && refs.has(e.decisionRef) && compatible(e, line));
    const payments = (facts.payments ?? []).filter(p => refs.has(p.decisionRef));
    return { line, pv, page, reading, readingValid, entries, payments, chain, timing: lineTiming(line) };
  });
  // Settlement per decision (decision id + resolution, or type when no resolution is transcribed): voted magnitude of the lines calling for a payment.
  const SETTLED = ["distribution", "augmentation_capital"];
  const groupKey = (l: EqDecisionLine) => l.decisionId + " · " + (l.resolution ? "résolution " + l.resolution : EQ_DECISION_TYPE_LABELS[l.type]);
  const groupPayment = new Map<string, PaymentState>();
  const settledLines = lineState.filter(s => !postClosing(s.line));
  for (const key of [...new Set(settledLines.map(s => groupKey(s.line)))]) {
    const members = settledLines.filter(s => groupKey(s.line) === key), settled = members.filter(s => SETTLED.includes(s.line.type));
    const magnitude = settled.reduce((s, m) => { const v = cents(m.line.value.amount); return s + (v < 0n ? -v : v); }, 0n);
    groupPayment.set(key, paymentState({ voted: settled.length ? money(magnitude) : null, payments: [...new Map(members.flatMap(m => m.payments).map(p => [p.paymentId, { id: p.paymentId, amount: p.value.amount, date: p.value.date }])).values()],
      sourcePresent: facts.payments !== null, applies: settled.length > 0, closingDate: period.closingDate, asOfDate: period.asOfDate }));
  }
  const allocationInput = lineState.filter(s => s.timing === "in_period" && s.entries.length).map(s => ({ id: s.line.lineId,
    decision: supported(s.line.value.amount, period.closingDate, [s.line.proof, ...(s.page ? [s.page.proof] : [])]),
    booked: supported(sumMoney(s.entries.map(e => e.value.amount)), period.closingDate, s.entries.map(e => e.proof)),
    payment: s.payments.length ? supported(sumMoney(s.payments.map(p => p.value.amount)), period.asOfDate, s.payments.map(p => p.proof)) : null,
    decisionReference: s.pv && s.page ? s.pv.pieceRef + "@" + s.pv.documentVersionId + "#p" + s.page.page : "", readingValidated: s.readingValid, effectiveDate: s.line.effectDate }));
  const reviewed = reviewEquity({ context: ctx,
    components: passed.map(p => ({ id: p.component, accounts: p.accounts.map(a => a.account), opening: p.opening, closing: p.closing, movements: p.entries.map(e => ({ id: e.entryId, ...(e.transferRef ? { internalTransferId: e.transferRef } : {}), value: supported(e.value.amount, e.value.date, [e.proof]) })) })),
    allocations: allocationInput,
    events: lineState.filter(s => s.timing === "in_period" && !s.entries.length).map(s => ({ id: s.line.lineId, effectiveDate: s.line.effectDate, description: "Décision sans écriture : " + (s.line.label || EQ_DECISION_TYPE_LABELS[s.line.type]), evidence: [s.line.proof], review: "pending" as const, accountingMovementId: null })),
    capitalComponentId: passed.some(p => p.component === "capital") ? "capital" : null,
    reserveComponentIds: reservesEstablished ? reserveIds : null });
  const ratiosComplete = prepared.every(p => p.accounts.length);
  const componentsResult: EquityResult["components"] = ordered.map(component => {
    const label = EQ_COMPONENT_LABELS[component], entries = facts.entries.filter(e => e.component === component);
    const movements = Object.fromEntries(EQ_NATURES.filter(n => entries.some(e => e.nature === n)).map(n => [n, sumMoney(entries.filter(e => e.nature === n).map(e => e.value.amount))])) as Record<EqNature, Money>;
    const movementsTotal = sumMoney(entries.map(e => e.value.amount));
    const accountsView = facts.accounts.filter(a => a.component === component).map(a => { const o = facts.balances.find(b => b.account === a.account && b.point === "opening"), cl = facts.balances.find(b => b.account === a.account && b.point === "closing");
      return { account: a.account, label: a.label, opening: o?.value.amount ?? null, closing: cl?.value.amount ?? null, proofIds: [o, cl].filter(Boolean).map(b => b!.proof.id) }; });
    const evidence = [...new Map([...facts.balances.filter(b => b.component === component), ...entries, ...(facts.decisions ?? []).filter(d => d.component === component), ...(facts.variation ?? []).filter(v => v.component === component)].map(f => [f.proof.id, f.proof]))
      .values(), ...lineState.filter(s => s.line.component === component && s.page).map(s => s.page!.proof), ...(facts.payments ?? []).filter(p => (facts.decisions ?? []).some(d => d.lineId === p.decisionRef && d.component === component)).map(p => p.proof)];
    const uniqueEvidence = [...new Map(evidence.map(p => [p.id, p])).values()];
    if (!inScope(component)) return { component, label, inScope: false, exclusionReason: EQ_EXCLUSIONS[component]!, status: "excluded" as const, accounts: accountsView, opening: null, movements, movementsTotal, expected: null, closing: null,
      difference: { kind: "not_applicable" as const, reason: EQ_EXCLUSIONS[component]! }, missing: [], entryIds: entries.map(e => e.entryId), evidence: uniqueEvidence };
    const p = prepared.find(x => x.component === component)!, row = reviewed.rows.find(r => r.id === component);
    const difference: KnownAmount = row ? row.difference : { kind: "unknown", reason: p.missing.join(" ") };
    const status = p.missing.length || difference.kind !== "known" ? "incomplete" as const : "computed" as const;
    const proofs = uniqueEvidence.map(x => x.id);
    if (status === "incomplete") add("COMPONENT_INCOMPLETE", "bridge", component, component, `${label} : ${p.missing.join(" ") || (difference.kind === "unknown" ? difference.reason : "pont non calculé")} Pont, total et rapports non calculés pour cette composante.`, { kind: "unknown", reason: "Composante incomplète" }, proofs.slice(0, 20));
    else if (difference.kind === "known" && cents(difference.value) !== 0n) add("BRIDGE_DIFFERENCE", "bridge", component, component, `${label} : clôture ${p.closing!.amount.amount} − (ouverture ${p.opening!.amount.amount} + mouvements ${movementsTotal.amount}) = ${difference.value.amount} EUR. Écart à expliquer ; aucune correction automatique.`, difference, proofs.slice(0, 20));
    return { component, label, inScope: true, exclusionReason: null, status, accounts: accountsView, opening: p.opening?.amount ?? null, movements, movementsTotal, expected: status === "computed" ? row!.expected : null, closing: p.closing?.amount ?? null,
      difference: status === "computed" ? difference : { kind: "unknown" as const, reason: difference.kind === "unknown" ? difference.reason : "Composante incomplète" }, missing: p.missing, entryIds: entries.map(e => e.entryId), evidence: uniqueEvidence };
  });
  // Entries: decision link and effect date, one status each; the search never infers a decision from an amount.
  const entriesResult: EquityResult["entries"] = facts.entries.map(e => {
    const base = { entryId: e.entryId, account: e.account, component: e.component, nature: e.nature, amount: e.value.amount, date: e.value.date, effectDate: e.effectDate, decisionRef: e.decisionRef, transferRef: e.transferRef, pieceRef: e.pieceRef, label: e.label, proofId: e.proof.id };
    if (!inScope(e.component)) return { ...base, inScope: false, decisionStatus: "excluded" as const, effectStatus: timingOf(e.effectDate) === "in_period" ? "in_period" as const : "outside_period" as const };
    const line = linkOf(e), requires = EQ_DECISION_NATURES.includes(e.nature);
    const status = facts.decisions === null ? (requires || e.decisionRef ? "source_missing" as const : "not_required" as const)
      : !e.decisionRef ? (requires ? "without_decision" as const : "not_required" as const)
      : !line ? "unknown_decision" as const : !compatible(e, line) ? "mismatch" as const : "matched" as const;
    const decisionTiming = line && status === "matched" ? lineTiming(line) : "in_period";
    const effectStatus = timingOf(e.effectDate) !== "in_period" || decisionTiming !== "in_period" ? "outside_period" as const : "in_period" as const;
    const what = `${e.entryId} (${EQ_COMPONENT_LABELS[e.component]}, ${EQ_NATURE_LABELS[e.nature]}, ${e.value.amount.amount} EUR au ${e.value.date})`;
    if (status === "without_decision") add("ENTRY_WITHOUT_DECISION", "entries", e.component, e.entryId, `Écriture ${what} sans référence de décision.`, known(e.value.amount), [e.proof.id]);
    if (status === "unknown_decision") add("ENTRY_WITHOUT_DECISION", "entries", e.component, e.entryId, `Écriture ${what} : décision citée « ${e.decisionRef} » absente du registre.`, known(e.value.amount), [e.proof.id]);
    if (status === "mismatch") add("ENTRY_DECISION_MISMATCH", "entries", e.component, e.entryId, `Écriture ${what} : la décision « ${e.decisionRef} » vise ${EQ_COMPONENT_LABELS[line!.component]} (${EQ_DECISION_TYPE_LABELS[line!.type]}).`, known(e.value.amount), [e.proof.id, line!.proof.id]);
    if (effectStatus === "outside_period") add("EFFECT_OUTSIDE_PERIOD", "entries", e.component, e.entryId, (line && status === "matched" && postClosing(line) ? `Écriture ${what} : la décision ${line.lineId} qui la porte a été prise le ${line.value.date}, après la clôture du ${period.closingDate}.` : `Écriture ${what} : effet au ${decisionTiming !== "in_period" ? line!.effectDate + " selon la décision " + line!.lineId : e.effectDate}, hors de l’exercice ${period.startDate} → ${period.closingDate}.`), known(e.value.amount), [e.proof.id, ...(line && status === "matched" ? [line.proof.id] : [])]);
    return { ...base, inScope: true, decisionStatus: status, effectStatus };
  });
  if (facts.decisions === null) {
    const waiting = entriesResult.filter(e => e.decisionStatus === "source_missing");
    if (waiting.length) add("DECISIONS_SOURCE_MISSING", "entries", null, "eq_decisions", `${waiting.length} écriture(s) appelant une décision non rapprochée(s) : registre des décisions non fourni.`, { kind: "unknown", reason: "Source requise" }, waiting.slice(0, 20).map(e => e.proofId));
  }
  const transfers: EquityResult["transfers"] = [...new Set(facts.entries.filter(e => e.transferRef).map(e => e.transferRef!))].sort().map(ref => {
    const lines = facts.entries.filter(e => e.transferRef === ref);
    return { transferRef: ref, entryIds: lines.map(l => l.entryId), components: [...new Set(lines.map(l => l.component))], total: sumMoney(lines.map(l => l.value.amount)), lines: lines.map(l => ({ entryId: l.entryId, component: l.component, amount: l.value.amount })) };
  });
  const decisionsResult: EquityResult["decisions"] = facts.decisions === null ? null : facts.decisions.map(line => {
    const s = lineState.find(x => x.line.lineId === line.lineId);
    const pvBase = { pieceRef: line.minutesRef, resolution: line.resolution, extract: line.extract };
    const base = { lineId: line.lineId, decisionId: line.decisionId, type: line.type, component: line.component, organ: line.organ, label: line.label, voted: line.value.amount, decisionDate: line.value.date, effectDate: line.effectDate, timing: lineTiming(line),
      amends: line.amends, supersededBy: replacedBy.get(line.lineId)?.lineId ?? null };
    if (!inScope(line.component)) return { ...base, inScope: false, pv: { ...pvBase, status: "missing" as const, importId: null, documentVersionId: null, fileName: null, sha256: null, title: null, page: line.page, pageCount: null, proofId: null },
      reading: { status: "not_possible" as const, text: null, authorId: null, authoredAt: null, documentVersionId: null, page: null }, booked: { kind: "not_applicable" as const, reason: EQ_EXCLUSIONS[line.component]! }, entryIds: [], payment: { kind: "not_applicable" as const, reason: "Exclue" }, paymentIds: [],
      difference: { kind: "not_applicable" as const, reason: "Exclue" }, status: "excluded" as const, statusMeaning: EQ_DECISION_TEXT.excluded.meaning, proofIds: [line.proof.id], chain: [], paymentGroup: null, paymentState: null };
    if (!s) {
      // Superseded line: listed with its PV, never compared nor counted; its entries and payments belong to the decision in force.
      const pv = pvOf(facts, line), page = pv && line.page && line.page <= pv.pageCount ? pv.pages.find(p => p.page === line.page)! : null, last = finalOf(line), by = replacedBy.get(line.lineId)!;
      const reading = work.readings.find(r => r.lineId === line.lineId), readingValid = !!reading && !!pv && !!page && reading.importId === pv.importId && reading.page === line.page;
      const reason = `Remplacée par ${by.lineId} (décision du ${by.value.date})${last.lineId !== by.lineId ? ", décision en vigueur " + last.lineId : ""}`;
      return { ...base, inScope: true, pv: { ...pvBase, status: !pv ? "missing" as const : !page ? "page_invalid" as const : "available" as const, importId: pv?.importId ?? null, documentVersionId: pv?.documentVersionId ?? null, fileName: pv?.fileName ?? null, sha256: pv?.sha256 ?? null, title: pv?.title ?? null, page: line.page, pageCount: pv?.pageCount ?? null, proofId: page?.proof.id ?? null },
        reading: readingValid ? { status: "validated" as const, text: reading!.text, authorId: reading!.authorId, authoredAt: reading!.authoredAt, documentVersionId: reading!.documentVersionId, page: reading!.page } : { status: pv && page ? "pending" as const : "not_possible" as const, text: null, authorId: null, authoredAt: null, documentVersionId: null, page: null },
        booked: { kind: "not_applicable" as const, reason }, entryIds: [], payment: { kind: "not_applicable" as const, reason }, paymentIds: [], difference: { kind: "not_applicable" as const, reason },
        status: "superseded" as const, statusMeaning: reason + ". " + EQ_DECISION_TEXT.superseded.meaning, proofIds: [line.proof.id, ...(page ? [page.proof.id] : [])], chain: [], paymentGroup: null, paymentState: null };
    }
    const pvStatus = !s.pv ? "missing" as const : !s.page ? "page_invalid" as const : "available" as const;
    const pv = { ...pvBase, status: pvStatus, importId: s.pv?.importId ?? null, documentVersionId: s.pv?.documentVersionId ?? null, fileName: s.pv?.fileName ?? null, sha256: s.pv?.sha256 ?? null, title: s.pv?.title ?? null, page: line.page, pageCount: s.pv?.pageCount ?? null, proofId: s.page?.proof.id ?? null };
    const reading = s.readingValid ? { status: "validated" as const, text: s.reading!.text, authorId: s.reading!.authorId, authoredAt: s.reading!.authoredAt, documentVersionId: s.reading!.documentVersionId, page: s.reading!.page }
      : { status: pvStatus === "available" ? "pending" as const : "not_possible" as const, text: null, authorId: null, authoredAt: null, documentVersionId: null, page: null };
    const what = `${line.lineId} (${EQ_DECISION_TYPE_LABELS[line.type]}, ${EQ_COMPONENT_LABELS[line.component]}, voté ${line.value.amount.amount} EUR, effet au ${line.effectDate})`;
    const proofIds = [line.proof.id, ...(s.page ? [s.page.proof.id] : []), ...s.entries.map(e => e.proof.id), ...s.payments.map(p => p.proof.id)];
    if (pvStatus === "missing") add("PV_MISSING", "minutes", line.component, line.lineId, `Décision ${what} : ${line.minutesRef ? "PV « " + line.minutesRef + " » non fourni" : "aucune référence de PV au registre"}. Décision non appuyée ; aucune lecture possible.`, { kind: "unknown", reason: "PV absent" }, [line.proof.id]);
    if (pvStatus === "page_invalid") add("PV_MISSING", "minutes", line.component, line.lineId, `Décision ${what} : ${line.page ? "page " + line.page + " absente du PV « " + line.minutesRef + " » (" + s.pv!.pageCount + " page(s))" : "page du PV « " + line.minutesRef + " » non indiquée"}.`, { kind: "unknown", reason: "Page introuvable" }, [line.proof.id]);
    if (pvStatus === "available" && !s.readingValid) add("READING_PENDING", "minutes", line.component, line.lineId, `Décision ${what} : lecture du PV « ${line.minutesRef} » page ${line.page} non validée.`, { kind: "unknown", reason: "Lecture à valider" }, [line.proof.id, s.page!.proof.id]);
    const payment: KnownAmount = s.payments.length ? known(sumMoney(s.payments.map(p => p.value.amount))) : facts.payments === null && line.type === "distribution" ? { kind: "unknown", reason: "SOURCE REQUISE : règlements" } : { kind: "not_applicable", reason: "Aucun règlement rattaché" };
    const booked: KnownAmount = s.entries.length ? known(sumMoney(s.entries.map(e => e.value.amount))) : { kind: "not_applicable", reason: "Aucune écriture rattachée" };
    let status: z.infer<typeof decisionStatus>, difference: KnownAmount;
    if (s.timing !== "in_period") {
      status = s.entries.length ? "effect_outside_period" : s.timing === "after_closing" ? "not_expected" : "prior_period";
      difference = { kind: "not_applicable", reason: EQ_DECISION_TEXT[status].meaning };
    } else if (!s.entries.length) {
      status = "without_entry"; difference = { kind: "unknown", reason: "Aucune écriture rattachée" };
      add("DECISION_WITHOUT_ENTRY", "decisions", line.component, line.lineId, `Décision ${what} sans aucune écriture rattachée dans l’exercice.`, known(line.value.amount), proofIds);
    } else {
      const allocation = reviewed.allocations.find(a => a.id === line.lineId)!;
      difference = allocation.difference;
      status = difference.kind !== "known" ? "reading_required" : cents(difference.value) !== 0n ? "amount_divergent" : "matched";
      if (status === "amount_divergent" && difference.kind === "known") add("AMOUNT_DIVERGENT", "decisions", line.component, line.lineId, `Décision ${what} : comptabilisé ${booked.kind === "known" ? booked.value.amount : "?"} − voté ${line.value.amount.amount} = ${difference.value.amount} EUR (PV « ${line.minutesRef} » page ${line.page}).`, difference, proofIds);
    }
    const chainText = s.chain.length ? ` Remplace ${s.chain.map(c => c.lineId).join(" → ")} : écritures et règlements de ces lignes rapprochés ici.` : postClosing(line) ? ` Modification de ${line.amends} décidée le ${line.value.date}, après la clôture (effet déclaré au ${line.effectDate}) : signal postérieur, non compté pour l’exercice ; la décision en vigueur à la clôture reste ${line.amends}.` : "";
    return { ...base, inScope: true, pv, reading, booked, entryIds: s.entries.map(e => e.entryId), payment, paymentIds: s.payments.map(p => p.paymentId), difference, status, statusMeaning: EQ_DECISION_TEXT[status].meaning + chainText, proofIds,
      chain: s.chain.map(c => c.lineId), paymentGroup: postClosing(line) ? null : groupKey(line), paymentState: postClosing(line) ? null : groupPayment.get(groupKey(line)) ?? null };
  });
  const paymentsResult: EquityResult["payments"] = facts.payments === null ? null : facts.payments.map(p => {
    const linked = (facts.decisions ?? []).some(d => d.lineId === p.decisionRef);
    if (!linked && facts.decisions !== null) add("PAYMENT_WITHOUT_DECISION", "decisions", null, p.paymentId, `Règlement ${p.paymentId} de ${p.value.amount.amount} EUR au ${p.value.date} : décision « ${p.decisionRef} » absente du registre.`, known(p.value.amount), [p.proof.id]);
    return { paymentId: p.paymentId, decisionRef: p.decisionRef, amount: p.value.amount, date: p.value.date, label: p.label, linked, proofId: p.proof.id };
  });
  // Provided statement ↔ statement rebuilt from the balance and the entries, cell by cell; an absent cell is never read as zero.
  const statementCells: EquityResult["statement"]["cells"] = [];
  if (facts.variation) {
    for (const c of componentsResult.filter(x => x.inScope)) {
      const columns = ["ouverture", ...EQ_NATURES.filter(n => c.movements[n] || facts.variation!.some(v => v.component === c.component && v.column === n)), "cloture"] as (typeof EQ_VARIATION_COLUMNS[number])[];
      for (const column of columns) {
        const provided = facts.variation.find(v => v.component === c.component && v.column === column) ?? null;
        const rebuilt = column === "ouverture" ? c.opening : column === "cloture" ? c.closing : c.movements[column as EqNature] ?? money(0n);
        const proofIds = [...(provided ? [provided.proof.id] : [])];
        if (!provided && rebuilt && cents(rebuilt) === 0n && column !== "ouverture" && column !== "cloture") continue;
        let difference: KnownAmount;
        if (!rebuilt) difference = { kind: "unknown", reason: "Composante incomplète : valeur reconstituée non établie" };
        else if (!provided) { difference = { kind: "unknown", reason: "Cellule absente du tableau fourni" };
          if (cents(rebuilt) !== 0n) add("STATEMENT_DIFFERENCE", "statement", c.component, c.component + ":" + column, `${c.label} / ${column === "ouverture" ? "Ouverture" : column === "cloture" ? "Clôture" : EQ_NATURE_LABELS[column as EqNature]} : ${rebuilt.amount} EUR reconstitué, absent du tableau fourni.`, difference, c.evidence.slice(0, 10).map(p => p.id)); }
        else { const delta = money(cents(provided.value.amount) - cents(rebuilt)); difference = known(delta);
          if (cents(delta) !== 0n) add("STATEMENT_DIFFERENCE", "statement", c.component, c.component + ":" + column, `${c.label} / ${column === "ouverture" ? "Ouverture" : column === "cloture" ? "Clôture" : EQ_NATURE_LABELS[column as EqNature]} : fourni ${provided.value.amount.amount} − reconstitué ${rebuilt.amount} = ${delta.amount} EUR.`, difference, proofIds); }
        statementCells.push({ component: c.component, column, provided: provided?.value.amount ?? null, rebuilt, difference, proofId: provided?.proof.id ?? null });
      }
    }
  }
  const inScopeComponents = componentsResult.filter(c => c.inScope), computed = inScopeComponents.filter(c => c.status === "computed"), complete = inScopeComponents.length > 0 && computed.length === inScopeComponents.length;
  const incompleteReason = { kind: "unknown" as const, reason: "Total non calculé : au moins une composante est incomplète." };
  const inScopeEntries = facts.entries.filter(e => inScope(e.component));
  const totals: EquityResult["totals"] = { complete, inScopeComponents: inScopeComponents.length, computedComponents: computed.length,
    opening: complete ? known(sumMoney(computed.map(c => c.opening!))) : incompleteReason, movements: Object.fromEntries(EQ_NATURES.filter(n => inScopeEntries.some(e => e.nature === n)).map(n => [n, sumMoney(inScopeEntries.filter(e => e.nature === n).map(e => e.value.amount))])) as Record<EqNature, Money>,
    movementsTotal: sumMoney(inScopeEntries.map(e => e.value.amount)), expected: complete ? known(sumMoney(computed.map(c => c.expected!))) : incompleteReason, closing: complete ? known(sumMoney(computed.map(c => c.closing!))) : incompleteReason,
    difference: complete ? known(sumMoney(computed.map(c => c.difference.kind === "known" ? c.difference.value : money(0n)))) : incompleteReason, transfersEffect: sumMoney(inScopeEntries.filter(e => e.transferRef).map(e => e.value.amount)) };
  const ratios = { equityToCapital: ratiosComplete ? reviewed.ratios.equityToCapital : { kind: "unknown" as const, reason: "Capitaux propres incomplets : une composante n’a aucun compte établi." },
    reservesToCapital: ratiosComplete ? reviewed.ratios.reservesToCapital : { kind: "unknown" as const, reason: "Capitaux propres incomplets : une composante n’a aucun compte établi." },
    meaning: "Rapports arithmétiques exacts (numérateur / dénominateur en centimes) sur les soldes de clôture. Ils ne valent aucune conclusion juridique." };
  // Controls and their denominators exist before any exception.
  const excludedEntries = facts.entries.filter(e => !inScope(e.component)).map(e => ({ id: "M:" + e.entryId, reason: EQ_EXCLUSIONS[e.component]! }));
  const excludedLines = [...(facts.decisions ?? []).filter(d => !inScope(d.component)).map(d => ({ id: "D:" + d.lineId, reason: EQ_EXCLUSIONS[d.component]! })),
    ...(decisionsResult ?? []).filter(d => d.status === "superseded").map(d => ({ id: "D:" + d.lineId, reason: d.statusMeaning }))].sort((a, b) => a.id < b.id ? -1 : 1);
  const decisionsTested = (decisionsResult ?? []).filter(d => d.inScope && d.status !== "superseded" && (d.timing === "in_period" || d.entryIds.length));
  const decisionsDone = decisionsTested.filter(d => ["matched", "amount_divergent", "without_entry", "effect_outside_period"].includes(d.status)).length;
  const entriesTested = entriesResult.filter(e => e.inScope), entriesDone = entriesTested.filter(e => e.decisionStatus !== "source_missing").length;
  const linesInScope = (decisionsResult ?? []).filter(d => d.inScope && d.status !== "superseded"), linesRead = linesInScope.filter(d => d.reading.status === "validated").length;
  const knownCells = statementCells.filter(c => c.difference.kind === "known").length;
  const has = (control: EquityControlId) => exceptions.some(e => e.controlId === control && !EQ_UNCERTAINTY_CODES.includes(e.code));
  const outcome = (control: EquityControlId, numerator: number, denominator: number) => has(control) ? "exceptions_detected" as const : !denominator || numerator !== denominator ? "inconclusive" as const : "no_exception_detected" as const;
  const componentExclusions = componentsResult.filter(c => !c.inScope).map(c => ({ id: c.component, reason: c.exclusionReason! }));
  const controls: EquityResult["controls"] = [
    { id: "bridge", label: "Pont par composante : ouverture + mouvements = clôture", unit: "composantes calculées / composantes des capitaux propres fournies", numerator: computed.length, denominator: inScopeComponents.length, exclusions: componentExclusions, outcome: outcome("bridge", computed.length, inScopeComponents.length) },
    { id: "statement", label: "Tableau de variation fourni ↔ reconstitué", unit: facts.variation ? "cellules comparées / cellules à comparer" : "tableau fourni absent : aucune cellule comparée", numerator: knownCells, denominator: statementCells.length, exclusions: componentExclusions, outcome: outcome("statement", knownCells, statementCells.length) },
    { id: "decisions", label: "Décisions ↔ comptabilisation (sans écriture, montant divergent, effet hors période)", unit: facts.decisions ? "lignes de décision rapprochées / lignes à effet dans l’exercice ou comptabilisées" : "registre des décisions absent", numerator: decisionsDone, denominator: decisionsTested.length, exclusions: excludedLines, outcome: outcome("decisions", decisionsDone, decisionsTested.length) },
    { id: "entries", label: "Écritures ↔ décisions (écriture sans décision, effet hors période)", unit: "écritures rapprochées ou sans décision requise / écritures de l’exercice des capitaux propres", numerator: entriesDone, denominator: entriesTested.length, exclusions: excludedEntries, outcome: outcome("entries", entriesDone, entriesTested.length) },
    { id: "minutes", label: "Décisions appuyées par le PV lu à la page citée", unit: facts.decisions ? "lignes de décision dont la lecture est validée / lignes de décision du registre" : "registre des décisions absent", numerator: linesRead, denominator: linesInScope.length, exclusions: excludedLines, outcome: outcome("minutes", linesRead, linesInScope.length) },
  ];
  // Deterministic presentation order: programme control, then component, then target.
  exceptions.sort((x, y) => controlIds.indexOf(x.controlId) - controlIds.indexOf(y.controlId) || EQ_COMPONENTS.indexOf(x.component ?? "autres_fonds_propres") - EQ_COMPONENTS.indexOf(y.component ?? "autres_fonds_propres") || x.targetId.localeCompare(y.targetId) || x.code.localeCompare(y.code));
  // PV pages cited by any line, superseded lines included: every proof reference of the result resolves.
  const pageProofs = allLines.flatMap(l => { const pv = pvOf(facts, l), page = pv && l.page && l.page <= pv.pageCount ? pv.pages.find(x => x.page === l.page) : undefined; return page ? [page.proof] : []; });
  // Framing, other-equity presentation and legal markers (rule 1.1.0): declared by a person, cited, computed here, never in the browser.
  const framing = { ...work.framing, socialFormLabel: work.framing.socialForm ? SOCIAL_FORM_LABELS[work.framing.socialForm] : "Forme sociale non documentée" };
  const closingByAccount = new Map(facts.balances.filter(b => b.point === "closing").map(b => [b.account, b.value.amount] as const));
  const presentation = buildPresentation({ period, anticipationDeclared: work.framing.anticipationAnc202407, declarations: work.instruments, closingByAccount,
    otherEquityAccounts: facts.accounts.filter(a => a.component === "autres_fonds_propres").map(a => ({ account: a.account, label: a.label })) });
  const legalComponents = Object.fromEntries((["capital", "reserve_legale", "report_a_nouveau", "resultat", "ecarts_reevaluation"] as const)
    .flatMap(k => { const x = componentsResult.find(r => r.component === k); return x ? [[k, { opening: x.opening, closing: x.closing }]] : []; }));
  const legal = legalMarkers({ socialForm: work.framing.socialForm, period, components: legalComponents, equityClosing: totals.closing,
    decisions: facts.decisions === null ? null : lineState.filter(s => s.timing === "in_period").map(s => ({ type: s.line.type, component: s.line.component, voted: s.line.value.amount, decisionDate: s.line.value.date })) });
  return frozen(equityResultSchema.parse({ schemaVersion: CAPITAUX_RESULT_SCHEMA_VERSION, scope, runId, mode: scope.mode, startDate: period.startDate, closingDate: period.closingDate, reviewDate: period.asOfDate,
    convention: { ...work.convention, meaning: EQ_CONVENTION_MEANING }, method: { decisionNatures: EQ_DECISION_NATURES, transferNatures: EQ_TRANSFER_NATURES, meaning: EQ_METHOD_TEXT },
    cartography, components: componentsResult, natures: EQ_NATURES.filter(n => facts.entries.some(e => e.nature === n && inScope(e.component))), totals, entries: entriesResult, transfers, decisions: decisionsResult, payments: paymentsResult,
    statement: { provided: !!facts.variation, cells: statementCells }, ratios, legalConclusion: { kind: "unknown", reason: reviewed.legalConclusion.kind === "unknown" ? reviewed.legalConclusion.reason : "SOURCE REQUISE : règle juridique applicable" }, legalMeaning: EQ_LEGAL_TEXT_V2,
    exceptions, controls, evidence: [...new Map([...facts.balances, ...facts.entries, ...(facts.variation ?? []), ...(facts.decisions ?? []), ...(facts.payments ?? [])].map(f => [f.proof.id, f.proof] as const)
      .concat(pageProofs.map(p => [p.id, p] as const))).values()], limitations: EQUITY_LIMITATIONS_V2, conclusion: null, framing, presentation, legal }));
}
export function equityOutcome(result: EquityResult): "no_exception_detected" | "exceptions_detected" | "inconclusive" {
  return result.controls.some(c => c.outcome === "exceptions_detected") ? "exceptions_detected" : result.controls.some(c => c.outcome === "inconclusive") ? "inconclusive" : "no_exception_detected";
}
export function equityResultEvidence(result: EquityResult): EvidenceLink[] {
  return result.evidence;
}
export { EquitySourceError };

import { z } from "zod";
import { dateSchema, proofSchema } from "./cycle-review";
import { knownAmountSchema, scopeSchema, type EvidenceLink } from "./model";
import { PV_EVENT_TYPES, PV_TREATMENTS, type ProvisionEventType, type ProvisionTreatment } from "./provision-population";

export { formatCents } from "./stock-contract";
/**
 * Contract of the provisions and commitments register (Mission 16). Browser-safe: no engine and no server-only import,
 * so the workspace can type the server result without recomputing it. Amounts are integer euro CENTS carried as strings.
 */
export const PROVISION_PROCEDURE = "provisions.register" as const;
const id = z.string().trim().min(1).max(200), text = z.string().trim().min(1).max(4000);
const cents = z.string().regex(/^-?(0|[1-9]\d*)$/);
export const provisionCitationInputSchema = z.object({ documentId: id, rowId: id.optional() }).strict();
export type ProvisionCitationInput = z.infer<typeof provisionCitationInputSchema>;
export const provisionCitationSchema = z.object({ documentVersionId: id, importId: id, fileName: z.string().min(1).max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  rowId: id.optional(), row: z.number().int().positive().optional(), cell: z.string().max(40).optional(), page: z.number().int().positive().optional(), zone: z.string().max(80).optional() }).strict();
export type ProvisionCitation = z.infer<typeof provisionCitationSchema>;
/**
 * The preparer's only input before calculation: whether the lawyers' information on proceedings and litigation was
 * obtained (NEP 501 §§ 07-08), cited from a frozen piece, or why not. It documents the work; it never infers an outcome.
 */
export const provisionDraftSchema = z.object({ lawyers: z.discriminatedUnion("status", [
  z.object({ status: z.literal("obtained"), citation: provisionCitationInputSchema }).strict(),
  z.object({ status: z.literal("not_obtained"), reason: z.string().trim().min(10).max(2000) }).strict(),
]) }).strict();
export type ProvisionDraft = z.infer<typeof provisionDraftSchema>;
const lawyersWorkSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("obtained"), citation: provisionCitationSchema }).strict(),
  z.object({ status: z.literal("not_obtained"), reason: z.string().trim().min(10).max(2000) }).strict(),
]);
export const provisionWorkSchema = z.object({ schemaVersion: z.literal("provisions-1"), lawyers: lawyersWorkSchema,
  configuredBy: id, configuredAt: z.string().refine(v => Number.isFinite(Date.parse(v)), "Horodatage requis") }).strict();
export type ProvisionWork = z.infer<typeof provisionWorkSchema>;
export const provisionDraftFromWork = (w: ProvisionWork): ProvisionDraft => ({ lawyers: w.lawyers.status === "obtained"
  ? { status: "obtained", citation: { documentId: w.lawyers.citation.documentVersionId, ...(w.lawyers.citation.rowId ? { rowId: w.lawyers.citation.rowId } : {}) } }
  : { status: "not_obtained", reason: w.lawyers.reason } });

export const PV_STATES = ["ouvert", "nouveau", "clos", "exclu"] as const;
export type ProvisionState = typeof PV_STATES[number];
export const PV_STATE_LABELS: Record<ProvisionState, string> = { ouvert: "Ouvert à l’ouverture", nouveau: "Nouveau dans l’exercice", clos: "Clos pendant l’exercice", exclu: "Hors population" };
export const PV_STATUSES = ["consistent", "closed", "no_entry", "difference", "annex_gap", "unsupported", "inconclusive", "excluded"] as const;
export type ProvisionStatus = typeof PV_STATUSES[number];
export const PV_STATUS_LABELS: Record<ProvisionStatus, string> = {
  consistent: "Comparaisons concordantes", closed: "Clos — provision soldée", no_entry: "Sans écriture — suivi hors bilan", difference: "Différence à examiner",
  annex_gap: "Écart événement / annexe", unsupported: "Justificatif manquant", inconclusive: "Non concluant", excluded: "Hors population",
};
/** Kind of discrepancy a status carries, so the interface never relies on colour alone. */
export const PV_STATUS_KIND: Record<ProvisionStatus, "ok" | "off" | "difference" | "annex" | "unsupported" | "uncertain" | "apart"> = {
  consistent: "ok", closed: "ok", no_entry: "off", difference: "difference", annex_gap: "annex", unsupported: "unsupported", inconclusive: "uncertain", excluded: "apart",
};
export const PV_TYPE_LABELS: Record<ProvisionEventType, string> = { litige: "Litige", garantie: "Garantie", restructuration: "Restructuration", fiscal: "Risque fiscal", social: "Risque social",
  environnement: "Environnement", contrat_deficitaire: "Contrat déficitaire", autre_risque: "Autre risque", engagement_donne: "Engagement donné", engagement_recu: "Engagement reçu" };
export const PV_TREATMENT_LABELS: Record<ProvisionTreatment, string> = { provision: "Provision (PCG art. 321-5)", passif_eventuel: "Passif éventuel — annexe (art. 321-6, 322-5)",
  engagement_hors_bilan: "Engagement hors bilan — annexe (art. 836-1)", passif_non_comptabilise: "Passif non évaluable de façon fiable (art. 322-4)", aucun: "Aucun traitement retenu" };
export const PV_MOVEMENT_KINDS = ["dotation", "utilisation", "reprise"] as const;
export type ProvisionMovementKind = typeof PV_MOVEMENT_KINDS[number];
export const PV_MOVEMENT_LABELS: Record<ProvisionMovementKind, string> = { dotation: "Dotation", utilisation: "Utilisation (reprise utilisée)", reprise: "Reprise non utilisée" };
export const PV_RUBRICS = ["provision", "passif_eventuel", "engagement_donne", "engagement_recu", "passif_non_comptabilise"] as const;
export type ProvisionRubric = typeof PV_RUBRICS[number];
export const PV_RUBRIC_LABELS: Record<ProvisionRubric, string> = { provision: "Provisions", passif_eventuel: "Passifs éventuels", engagement_donne: "Engagements donnés", engagement_recu: "Engagements reçus", passif_non_comptabilise: "Passif non comptabilisé (art. 322-4)" };
export const PV_AMOUNT_STATUSES = ["publie", "non_chiffre", "non_fourni_prejudice"] as const;
export type ProvisionAmountStatus = typeof PV_AMOUNT_STATUSES[number];
export const PV_PIECE_KINDS = ["contrat", "dossier_risque", "correspondance", "estimation", "decision", "jugement", "ecriture", "autre"] as const;
export type ProvisionPieceKind = typeof PV_PIECE_KINDS[number];
export const PV_PIECE_LABELS: Record<ProvisionPieceKind, string> = { contrat: "Contrat", dossier_risque: "Dossier de risque", correspondance: "Correspondance", estimation: "Estimation", decision: "Décision", jugement: "Jugement ou protocole", ecriture: "Pièce d’écriture", autre: "Autre pièce" };
/** Rubric expected for each treatment when the annex mentions an event. */
export const PV_RUBRIC_FOR: Record<ProvisionTreatment, ProvisionRubric[]> = { provision: ["provision"], passif_eventuel: ["passif_eventuel"], engagement_hors_bilan: ["engagement_donne", "engagement_recu"], passif_non_comptabilise: ["passif_non_comptabilise"], aucun: [] };

export const PV_EXCEPTION_CODES = ["ESTIMATE_DIFFERENCE", "BRIDGE_DIFFERENCE", "CLOSED_WITH_BALANCE", "TREATMENT_BALANCE_MISMATCH", "ANNEX_MISSING", "ANNEX_AMOUNT_DIFFERENCE", "ANNEX_RUBRIC_MISMATCH",
  "ANNEX_EVENT_UNKNOWN", "OPENING_FRAMING_DIFFERENCE", "FRAMING_DIFFERENCE", "LEDGER_BRIDGE_DIFFERENCE",
  "MOVEMENT_UNSUPPORTED", "DECISION_UNSUPPORTED", "ESTIMATE_MISSING", "BRIDGE_UNKNOWN", "ANNEX_NOT_PROVIDED", "ANNEX_SOURCE_MISSING", "FRAMING_INCOMPLETE", "LAWYERS_INFO_MISSING"] as const;
export type ProvisionExceptionCode = typeof PV_EXCEPTION_CODES[number];
/** Missing evidence or unknown amounts: the result is inconclusive on them, never an anomaly and never zero. */
export const PV_UNCERTAINTY_CODES: ProvisionExceptionCode[] = ["MOVEMENT_UNSUPPORTED", "DECISION_UNSUPPORTED", "ESTIMATE_MISSING", "BRIDGE_UNKNOWN", "ANNEX_NOT_PROVIDED", "ANNEX_SOURCE_MISSING", "FRAMING_INCOMPLETE", "LAWYERS_INFO_MISSING"];
export const PV_FINDING_LABELS: Record<ProvisionExceptionCode, string> = {
  ESTIMATE_DIFFERENCE: "Estimation documentée ≠ provision", BRIDGE_DIFFERENCE: "Pont ≠ clôture déclarée", CLOSED_WITH_BALANCE: "Clos avec solde de provision", TREATMENT_BALANCE_MISMATCH: "Solde de provision sans traitement « provision »",
  ANNEX_MISSING: "Absent de l’annexe", ANNEX_AMOUNT_DIFFERENCE: "Montant annexe ≠ référence", ANNEX_RUBRIC_MISMATCH: "Rubrique annexe ≠ traitement", ANNEX_EVENT_UNKNOWN: "Annexe sans événement au registre",
  OPENING_FRAMING_DIFFERENCE: "Ouverture ≠ grand livre", FRAMING_DIFFERENCE: "Clôture ≠ grand livre", LEDGER_BRIDGE_DIFFERENCE: "Pont du grand livre ≠ mouvements",
  MOVEMENT_UNSUPPORTED: "Mouvement sans justificatif", DECISION_UNSUPPORTED: "Décision sans pièce", ESTIMATE_MISSING: "Estimation absente", BRIDGE_UNKNOWN: "Mouvements inconnus",
  ANNEX_NOT_PROVIDED: "Information non fournie (préjudice invoqué)", ANNEX_SOURCE_MISSING: "Annexe non fournie", FRAMING_INCOMPLETE: "Cadrage incomplet", LAWYERS_INFO_MISSING: "Informations des avocats non obtenues",
};
export const PV_MASKED = "Masqué — habilitation confidentielle requise";

const lineRef = { importId: id, rowId: id, documentVersionId: id, fileName: z.string().min(1).max(300), row: z.number().int().positive().nullable(), key: id, amountCents: cents, date: dateSchema };
export const provisionLineSchema = z.object(lineRef).strict();
export type ProvisionLine = z.infer<typeof provisionLineSchema>;
const maybeText = z.string().max(4000).nullable();
export const provisionEventResultSchema = z.object({
  eventId: id, label: z.string().max(300), type: z.enum(PV_EVENT_TYPES), treatment: z.enum(PV_TREATMENTS), state: z.enum(PV_STATES), inScope: z.boolean(), reason: z.string().max(2000),
  /** Confidential events are masked server-side for readers without the dedicated capability (`masked` true then). */
  confidential: z.boolean(), masked: z.boolean(),
  birthDate: dateSchema, closedDate: dateSchema.nullable(), decisionDate: dateSchema.nullable(), account: z.string().max(20).nullable(),
  obligation: maybeText, counterparty: maybeText, method: maybeText, author: z.string().max(300), decision: maybeText,
  decisionPiece: z.object({ ref: id, supported: z.boolean() }).strict().nullable(), register: provisionLineSchema,
  bridge: z.object({ opening: cents, dotations: cents.nullable(), utilisations: cents.nullable(), reprises: cents.nullable(), computedClosing: cents.nullable(), declaredClosing: cents.nullable(), difference: cents.nullable(), journal: z.boolean() }).strict().nullable(),
  movements: z.array(z.object({ ...lineRef, kind: z.enum(PV_MOVEMENT_KINDS), account: z.string().max(20), pieceRef: z.string().max(200), supported: z.boolean(), justification: maybeText }).strict()),
  estimates: z.array(z.object({ ...lineRef, scenario: z.string().max(300), retained: z.boolean(), method: z.string().max(2000), author: z.string().max(300), pieceRef: z.string().max(200), supported: z.boolean(), appreciation: z.string().max(2000) }).strict()),
  estimateCount: z.number().int().nonnegative(), retainedEstimateCents: cents.nullable(), estimateDifferenceCents: cents.nullable(), commitmentCents: cents.nullable(),
  annex: z.object({ status: z.enum(["not_provided", "not_expected", "missing", "present"]), expected: z.boolean(),
    lines: z.array(z.object({ ...lineRef, rubric: z.enum(PV_RUBRICS), amountStatus: z.enum(PV_AMOUNT_STATUSES), publishedCents: cents.nullable(), referenceCents: cents.nullable(), referenceKind: z.enum(["provision", "commitment", "estimate"]).nullable(), differenceCents: cents.nullable() }).strict()) }).strict(),
  chronology: z.array(z.object({ date: dateSchema, kind: z.enum(["naissance", "decision", "estimation", "mouvement", "piece", "annexe", "cloture"]), label: z.string().max(400), ref: z.string().max(400).nullable() }).strict()),
  pieces: z.array(z.object({ ...lineRef, kind: z.enum(PV_PIECE_KINDS), label: maybeText, confidential: z.boolean() }).strict()),
  status: z.enum(PV_STATUSES), findings: z.array(z.object({ code: z.enum(PV_EXCEPTION_CODES), label: z.string().max(300) }).strict()),
}).strict();
export type ProvisionEventResult = z.infer<typeof provisionEventResultSchema>;
export const provisionAccountSchema = z.object({ account: z.string().max(20), label: z.string().max(300), events: z.array(id),
  registerOpeningCents: cents, registerClosingCents: cents.nullable(), dotations: cents.nullable(), utilisations: cents.nullable(), reprises: cents.nullable(),
  ledgerOpeningCents: cents.nullable(), ledgerClosingCents: cents.nullable(), openingDifference: cents.nullable(), closingDifference: cents.nullable(), ledgerBridgeDifference: cents.nullable(),
  status: z.enum(["framed", "difference", "incomplete", "ledger_missing"]), ledger: provisionLineSchema.nullable() }).strict();
export type ProvisionAccount = z.infer<typeof provisionAccountSchema>;
export const provisionResultSchema = z.object({
  schemaVersion: z.literal("provisions-result-1"), scope: scopeSchema, runId: id, startDate: dateSchema, closingDate: dateSchema,
  lawyers: lawyersWorkSchema, sources: z.object({ movements: z.boolean(), estimates: z.boolean(), annex: z.boolean(), support: z.boolean() }).strict(),
  events: z.array(provisionEventResultSchema), accounts: z.array(provisionAccountSchema),
  categories: z.array(z.object({ category: z.enum(["risques", "charges", "autres"]), label: z.string(), opening: cents, dotations: cents.nullable(), utilisations: cents.nullable(), reprises: cents.nullable(), closing: cents.nullable() }).strict()),
  totals: z.object({ opening: cents, dotations: cents.nullable(), utilisations: cents.nullable(), reprises: cents.nullable(), computedClosing: cents.nullable(), declaredClosing: cents.nullable(),
    ledgerOpening: cents, ledgerClosing: cents, events: z.number().int().nonnegative(), inScope: z.number().int().nonnegative(), excluded: z.number().int().nonnegative(), noEntry: z.number().int().nonnegative() }).strict(),
  annexOrphans: z.array(z.object({ ...lineRef, eventId: id, rubric: z.enum(PV_RUBRICS), amountStatus: z.enum(PV_AMOUNT_STATUSES), publishedCents: cents.nullable() }).strict()),
  exceptions: z.array(z.object({ id, code: z.enum(PV_EXCEPTION_CODES), label: text, message: text, eventId: z.string().nullable(), amount: knownAmountSchema,
    /** True when the message or amount reveals confidential content (estimates, scenarios): masked for readers without the capability. */
    sensitive: z.boolean() }).strict()),
  evidence: z.array(proofSchema), method: text, limitations: z.array(text),
}).strict();
export type ProvisionResult = z.infer<typeof provisionResultSchema>;

export function provisionOutcome(r: ProvisionResult): "no_exception_detected" | "exceptions_detected" | "inconclusive" {
  if (r.exceptions.some(e => !PV_UNCERTAINTY_CODES.includes(e.code))) return "exceptions_detected";
  return r.exceptions.length ? "inconclusive" : "no_exception_detected";
}
export const provisionResultEvidence = (r: ProvisionResult): EvidenceLink[] => r.evidence.map(e => ({ ...e }));
export const PV_METHOD_TEXT = "Pont par événement : provision à l’ouverture + dotations − utilisations − reprises non utilisées = provision de clôture calculée, comparée à la clôture déclarée au registre. Comparaison estimation / écriture : estimation retenue documentée (hypothèse citée) − provision de clôture calculée, pour les seuls événements que l’entité traite en provision. Comparaison événement / annexe : présence et montant des informations publiées pour les passifs éventuels et engagements hors bilan, et pour toute ligne d’annexe rattachée à un événement. Cadrage par compte de provisions : sommes du registre et des mouvements comparées aux soldes d’ouverture et de clôture du grand livre. Méthodes internes de comparaison : la probabilité, la qualification de l’obligation et le traitement comptable restent des décisions humaines citées ; aucune formule probabilité × montant n’est appliquée.";
export const PV_LIMITATIONS = [
  "Une différence entre estimation documentée et provision est une différence à examiner, jamais une anomalie validée ni une correction proposée.",
  "L’outil ne qualifie aucune obligation (probable, possible, éventuelle) et ne déduit aucune issue juridique : il lit le traitement retenu par l’entité et la pièce qui le fonde.",
  "Aucune formule probabilité × montant n’est appliquée ; les scénarios sont affichés tels que documentés, l’hypothèse retenue est celle que la pièce désigne (PCG art. 323-2).",
  "Le caractère significatif d’une information en annexe (PCG art. 832-14) et la faible probabilité qui dispense de mentionner un passif éventuel (art. 832-13) relèvent du jugement humain.",
  "L’exhaustivité du registre n’est pas établie par l’outil : le cadrage avec le grand livre et l’annexe la signale seulement là où une différence apparaît.",
  "Les événements postérieurs à la clôture sont hors population ; leur incidence éventuelle sur les comptes relève d’une revue distincte.",
];

import { z } from "zod";
import { isCivilDate } from "@/lib/canonical-model/period";
import { moneySchema } from "./model";

/**
 * Mission 19 — professional file: work programme, traceable manual work and closing view.
 * Browser-safe contract: vocabulary, commands and limits. The server folds an append-only journal; React never recomputes a state.
 * Nothing here produces an audit opinion: the closing validation is a recorded human decision, refused while work remains.
 */
export const CLOSING_SCHEMA = "closing-1";

/** Assertions as listed by NEP 500 §09, in its three categories (flows of transactions, period-end balances, presentation in the annex). */
export const CL_ASSERTIONS = ["flux_realite", "flux_exhaustivite", "flux_mesure", "flux_separation", "flux_classification",
  "solde_existence", "solde_droits", "solde_exhaustivite", "solde_evaluation",
  "annexe_realite_droits", "annexe_exhaustivite", "annexe_presentation", "annexe_mesure_evaluation"] as const;
export type ClosingAssertion = typeof CL_ASSERTIONS[number];
export const CL_ASSERTION_GROUPS = [
  { id: "flux", label: "Flux d’opérations et événements" }, { id: "solde", label: "Soldes de fin de période" }, { id: "annexe", label: "Présentation et informations de l’annexe" },
] as const;
export const CL_ASSERTION_LABELS: Record<ClosingAssertion, string> = {
  flux_realite: "Réalité", flux_exhaustivite: "Exhaustivité", flux_mesure: "Mesure", flux_separation: "Séparation des exercices", flux_classification: "Classification",
  solde_existence: "Existence", solde_droits: "Droits et obligations", solde_exhaustivite: "Exhaustivité", solde_evaluation: "Évaluation et imputation",
  annexe_realite_droits: "Réalité, droits et obligations", annexe_exhaustivite: "Exhaustivité", annexe_presentation: "Présentation et intelligibilité", annexe_mesure_evaluation: "Mesure et évaluation",
};
export const assertionGroup = (a: ClosingAssertion) => a.split("_")[0] as "flux" | "solde" | "annexe";
export const assertionLabel = (a: ClosingAssertion) => CL_ASSERTION_LABELS[a] + " · " + ({ flux: "flux", solde: "solde", annexe: "annexe" } as const)[assertionGroup(a)];

export const CL_CYCLES = ["clients", "achats", "tresorerie", "immobilisations", "stocks", "provisions", "capitaux_propres", "participations", "fiscal", "paie", "exceptionnel", "transversal", "informatique"] as const;
export type ClosingCycle = typeof CL_CYCLES[number];
export const CL_CYCLE_LABELS: Record<ClosingCycle, string> = {
  clients: "Clients et ventes", achats: "Achats et fournisseurs", tresorerie: "Trésorerie", immobilisations: "Immobilisations", stocks: "Stocks", provisions: "Provisions et engagements",
  capitaux_propres: "Capitaux propres", participations: "Participations", fiscal: "TVA et IS", paie: "Paie et personnel", exceptionnel: "Résultat exceptionnel", transversal: "Transversal et clôture", informatique: "Systèmes d’information",
};

/** Tooled procedures: the existing cycle sheets. The file only observes them (state, version, review); it never recalculates a cycle. */
export const CL_FAMILIES = ["clients", "cash", "fa", "eq", "fx", "st", "pv"] as const;
export type CycleFamily = typeof CL_FAMILIES[number];
export const CL_ENGINE_PROCEDURES = [
  { id: "clients.frame", cycle: "clients", family: "clients", label: "Cadrage Clients", route: "/clients-framing" },
  { id: "clients.sales", cycle: "clients", family: "clients", label: "Ventes, encaissements et avoirs", route: "/clients-framing" },
  { id: "payables.frame", cycle: "achats", family: "clients", label: "Cadrage Fournisseurs", route: "/payables" },
  { id: "payables.purchases", cycle: "achats", family: "clients", label: "Achats et rattachement", route: "/payables" },
  { id: "payables.rpne", cycle: "achats", family: "clients", label: "Recherche de passifs non enregistrés", route: "/payables" },
  { id: "cash.reconciliation", cycle: "tresorerie", family: "cash", label: "Pont bancaire et apurement", route: "/tresorerie" },
  { id: "fixed_assets.review", cycle: "immobilisations", family: "fa", label: "Mouvements et recalcul documenté", route: "/immobilisations" },
  { id: "stocks.count", cycle: "stocks", family: "st", label: "Quantités, coûts et revue de valeur", route: "/stocks" },
  { id: "provisions.register", cycle: "provisions", family: "pv", label: "Registre des risques et engagements", route: "/provisions" },
  { id: "capitaux_propres.review", cycle: "capitaux_propres", family: "eq", label: "Décisions et PV versionnés", route: "/capitaux-propres" },
  { id: "equity.review", cycle: "capitaux_propres", family: "clients", label: "Décisions et mouvements", route: "/equity" },
  { id: "investments.review", cycle: "participations", family: "clients", label: "Droits, distributions et valeur", route: "/participations" },
  { id: "tva.reconciliation", cycle: "fiscal", family: "fx", label: "TVA par période déclarative", route: "/fiscal" },
  { id: "is.computation", cycle: "fiscal", family: "fx", label: "IS par exercice", route: "/fiscal" },
  { id: "exceptional.review", cycle: "exceptionnel", family: "clients", label: "Revue par événement", route: "/resultat-exceptionnel" },
] as const satisfies readonly { id: string; cycle: ClosingCycle; family: CycleFamily; label: string; route: string }[];
export type EngineProcedureId = typeof CL_ENGINE_PROCEDURES[number]["id"];
export const CL_ENGINE_IDS = CL_ENGINE_PROCEDURES.map(p => p.id) as unknown as readonly [EngineProcedureId, ...EngineProcedureId[]];
export const engineProcedure = (id: string) => CL_ENGINE_PROCEDURES.find(p => p.id === id) ?? null;

export const CL_NATURES = ["engine", "controle_interne", "itgc", "confirmation", "observation_physique", "estimation", "evenements_posterieurs", "detail"] as const;
export type ClosingNature = typeof CL_NATURES[number];
export const CL_NATURE_LABELS: Record<ClosingNature, string> = {
  engine: "Feuille de cycle outillée", controle_interne: "Contrôle interne", itgc: "Contrôles généraux informatiques (ITGC)", confirmation: "Confirmation de tiers",
  observation_physique: "Observation physique", estimation: "Estimation comptable", evenements_posterieurs: "Événements postérieurs", detail: "Autre procédure manuelle",
};
/** Controls separate design, implementation (NEP 315 §34, « mis en œuvre ») and operating test (NEP 330 §08, §14-16); every other manual procedure has a single execution step. */
export const CONTROL_STEPS = ["description", "mise_en_oeuvre", "test_fonctionnement"] as const;
export const CL_STEPS = [...CONTROL_STEPS, "execution"] as const;
export type ClosingStep = typeof CL_STEPS[number];
export const CL_STEP_LABELS: Record<ClosingStep, string> = { description: "Description (conception)", mise_en_oeuvre: "Mise en œuvre (mise en place)", test_fonctionnement: "Test de fonctionnement", execution: "Exécution" };
export const isControl = (nature: ClosingNature) => nature === "controle_interne" || nature === "itgc";
export const stepsFor = (nature: ClosingNature): readonly ClosingStep[] => nature === "engine" ? [] : isControl(nature) ? CONTROL_STEPS : ["execution"];

export const CL_RESULTS = ["sans_exception", "exceptions", "non_concluant"] as const;
export const CL_RESULT_LABELS: Record<typeof CL_RESULTS[number], string> = { sans_exception: "Sans exception relevée", exceptions: "Exceptions relevées", non_concluant: "Non concluant" };
/** A management representation is one piece among others: it never replaces evidence on its own. */
export const CL_PIECE_KINDS = ["document", "reponse_tiers", "declaration_direction"] as const;
export type PieceKind = typeof CL_PIECE_KINDS[number];
export const CL_PIECE_KIND_LABELS: Record<PieceKind, string> = { document: "Document", reponse_tiers: "Réponse de tiers", declaration_direction: "Déclaration de la direction" };
/** Internal method scale (user parameter of the firm), never computed and never defaulted. */
export const CL_RISK_LEVELS = ["eleve", "modere", "faible"] as const;
export const CL_RISK_LEVEL_LABELS: Record<typeof CL_RISK_LEVELS[number], string> = { eleve: "Élevé", modere: "Modéré", faible: "Faible" };
export const CL_REACH = ["conception_mise_en_oeuvre", "fonctionnement"] as const;
export const CL_REACH_LABELS: Record<typeof CL_REACH[number], string> = { conception_mise_en_oeuvre: "Conception et mise en œuvre seulement", fonctionnement: "Fonctionnement sur la période testée" };

const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.string().refine(isCivilDate, "Date civile ISO requise");
const riskId = z.string().regex(/^R-\d{2,3}$/), procedureId = z.string().regex(/^P-\d{2,3}$/);
const pieceVersionId = z.string().regex(/^PC-\d{1,4}-v\d{1,3}$/);
export const citationInputSchema = z.object({ pieceVersionId, page: z.number().int().min(1).max(100000).optional(), zone: text(120).optional() }).strict();
export type CitationInput = z.infer<typeof citationInputSchema>;
const citations = (min: number) => z.array(citationInputSchema).min(min).max(20);
const seq = z.number().int().min(0).max(1_000_000);
const periodSchema = z.object({ startDate: date, closingDate: date, asOfDate: date, currency: z.literal("EUR"), validation: z.enum(["provisional", "confirmed"]) }).strict();
const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("procedure"), id: procedureId }).strict(),
  z.object({ kind: z.literal("misstatement"), id: z.string().regex(/^A-\d{1,4}$/) }).strict(),
  z.object({ kind: z.literal("contradiction"), id: z.string().regex(/^C-\d{1,4}$/) }).strict(),
  z.object({ kind: z.literal("dossier") }).strict(),
]);
/** A misstatement amount is known or explicitly unknown with its reason: never a silent zero. */
const amountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), value: moneySchema }).strict(),
  z.object({ kind: z.literal("unknown"), reason: text(300) }).strict(),
]);

export const closingCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("open"), expectedSeq: seq, period: periodSchema, entity: text(120) }).strict(),
  z.object({ command: z.literal("set_risk"), expectedSeq: seq, riskId, cycle: z.enum(CL_CYCLES), label: text(200), assertions: z.array(z.enum(CL_ASSERTIONS)).min(1).max(13),
    assessment: z.object({ level: z.enum(CL_RISK_LEVELS), rationale: text(1000) }).strict().nullable() }).strict(),
  z.object({ command: z.literal("set_procedure"), expectedSeq: seq, procedureId, riskIds: z.array(riskId).min(1).max(20), assertions: z.array(z.enum(CL_ASSERTIONS)).min(1).max(13),
    nature: z.enum(CL_NATURES), label: text(200), owner: text(80), engine: z.enum(CL_ENGINE_IDS).optional() }).strict(),
  z.object({ command: z.literal("set_population"), expectedSeq: seq, procedureId, population: z.discriminatedUnion("status", [
    z.object({ status: z.literal("defined"), description: text(500), size: z.number().int().min(1).max(10_000_000).nullable(), citations: citations(0) }).strict(),
    z.object({ status: z.literal("absent"), reason: text(500) }).strict()]) }).strict(),
  z.object({ command: z.literal("set_applicability"), expectedSeq: seq, procedureId, applicable: z.boolean(), reason: text(1000).optional(), citations: citations(0) }).strict(),
  z.object({ command: z.literal("set_itgc_scope"), expectedSeq: seq, procedureId, systems: z.array(text(80)).min(1).max(20), processes: z.array(text(80)).min(1).max(20), from: date, to: date, method: text(1500), citations: citations(0) }).strict(),
  z.object({ command: z.literal("record_work"), expectedSeq: seq, procedureId, step: z.enum(CL_STEPS), performedOn: date, object: text(500), done: text(1500), itemsExamined: z.number().int().min(1).max(10_000_000).nullable(),
    result: z.enum(CL_RESULTS), citations: citations(0) }).strict(),
  z.object({ command: z.literal("request_piece"), expectedSeq: seq, procedureId, description: text(300), requestedFrom: text(120) }).strict(),
  z.object({ command: z.literal("close_piece_request"), expectedSeq: seq, requestId: z.string().regex(/^D-\d{1,4}$/), outcome: z.enum(["received", "cancelled"]), pieceVersionId: pieceVersionId.optional(), reason: text(500).optional() }).strict(),
  z.object({ command: z.literal("conclude_procedure"), expectedSeq: seq, procedureId, text: text(2000), reach: z.enum(CL_REACH).optional(), citations: citations(0) }).strict(),
  z.object({ command: z.literal("review_procedure"), expectedSeq: seq, procedureId, decision: z.enum(["approved", "changes_requested"]), text: text(1000) }).strict(),
  z.object({ command: z.literal("raise_review_point"), expectedSeq: seq, target, text: text(1000) }).strict(),
  z.object({ command: z.literal("answer_review_point"), expectedSeq: seq, pointId: z.string().regex(/^RP-\d{1,4}$/), text: text(1500), citations: citations(0) }).strict(),
  z.object({ command: z.literal("close_review_point"), expectedSeq: seq, pointId: z.string().regex(/^RP-\d{1,4}$/), text: text(1000) }).strict(),
  z.object({ command: z.literal("record_misstatement"), expectedSeq: seq, procedureId: procedureId.optional(), cycle: z.enum(CL_CYCLES), description: text(500), amount: amountSchema, citations: citations(1) }).strict(),
  z.object({ command: z.literal("correct_misstatement"), expectedSeq: seq, misstatementId: z.string().regex(/^A-\d{1,4}$/), text: text(1000), citations: citations(1) }).strict(),
  z.object({ command: z.literal("assess_misstatement"), expectedSeq: seq, misstatementId: z.string().regex(/^A-\d{1,4}$/), text: text(1500) }).strict(),
  z.object({ command: z.literal("record_limitation"), expectedSeq: seq, cycle: z.enum(CL_CYCLES), description: text(1000), procedureIds: z.array(procedureId).max(20) }).strict(),
  z.object({ command: z.literal("assess_limitation"), expectedSeq: seq, limitationId: z.string().regex(/^L-\d{1,4}$/), text: text(1500) }).strict(),
  z.object({ command: z.literal("record_contradiction"), expectedSeq: seq, left: citationInputSchema, right: citationInputSchema, description: text(1000), procedureIds: z.array(procedureId).max(20) }).strict(),
  z.object({ command: z.literal("resolve_contradiction"), expectedSeq: seq, contradictionId: z.string().regex(/^C-\d{1,4}$/), text: text(1500), citations: citations(1) }).strict(),
  z.object({ command: z.literal("validate_closing"), expectedSeq: seq, text: text(1500) }).strict(),
  z.object({ command: z.literal("reopen"), expectedSeq: seq, reason: text(1000) }).strict(),
]);
export type ClosingCommand = z.infer<typeof closingCommandSchema>;
export type ClosingCommandName = ClosingCommand["command"];
/** Permission required by each command; signing also needs the server-side closing authority. */
export const CL_COMMAND_PERMISSION: Record<ClosingCommandName, "prepare" | "review" | "sign"> = {
  open: "prepare", set_risk: "prepare", set_procedure: "prepare", set_population: "prepare", set_applicability: "prepare", set_itgc_scope: "prepare", record_work: "prepare",
  request_piece: "prepare", close_piece_request: "prepare", conclude_procedure: "prepare", review_procedure: "review", raise_review_point: "review", answer_review_point: "prepare",
  close_review_point: "review", record_misstatement: "prepare", correct_misstatement: "prepare", assess_misstatement: "review", record_limitation: "prepare", assess_limitation: "review",
  record_contradiction: "prepare", resolve_contradiction: "prepare", validate_closing: "sign", reopen: "sign",
};
export const pieceUploadSchema = z.object({ expectedSeq: seq, label: text(160), kind: z.enum(CL_PIECE_KINDS), pieceId: z.string().regex(/^PC-\d{1,4}$/).optional() }).strict();

/** Server-resolved citation: file name and hash come from the stored piece, never from the browser. */
export interface ResolvedCitation { pieceVersionId: string; pieceId: string; version: number; fileName: string; label: string; sha256: string; kind: PieceKind; page?: number; zone?: string }
export type ClosingAmount = z.infer<typeof amountSchema>;

export const CL_METHOD = "Programme de travail relié aux risques et assertions ; travaux manuels journalisés (qui, quand, sur quoi, avec quelle pièce et quelle version) ; états dérivés du journal et des feuilles de cycle observées ; aucune opinion générée.";
export const CL_NO_OPINION = "PROBANT ne génère aucune opinion d’audit. Une feuille verrouillée ne vaut pas audit complet ; la validation de clôture appartient au professionnel habilité.";
export const CL_HASH_NOTICE = "Le chaînage d’empreintes du journal est un contrôle d’intégrité local : ce n’est ni une signature ni une preuve inviolable.";

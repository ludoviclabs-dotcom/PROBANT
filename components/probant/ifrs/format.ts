import type { Money } from "@/lib/canonical-model/money";
import type { ReviewKind } from "@/lib/auth/review-kind";
import type { ContractStatus, LeaseQualification, QualificationReason, QualifiedContract } from "@/lib/ifrs/leases/qualification";
import type { LeaseWorkspaceView, StepState } from "@/lib/ifrs/leases/view-model";
import type { ImportBatch } from "@/lib/workpapers/imports";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import type { ExecutionProfile } from "@/lib/runtime/profile";

/** Réponse de `GET /api/workpapers/locations-ifrs16` (ou du scénario synthétique) : le navigateur ne recalcule rien. */
export interface LeaseView {
  synthetic?: boolean; label?: string; actorId: string | null; permissions: string[]; reviewKind?: ReviewKind; executionProfile?: ExecutionProfile | null;
  runs: WorkpaperRun[]; imports: (ImportBatch & { rowCount?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
  sourcesCurrent: Record<string, boolean>; ruleCurrent: Record<string, boolean>;
  qualification: Record<string, LeaseQualification | null>; qualificationIssues: Record<string, string>;
  workspace: Record<string, LeaseWorkspaceView>; emptyWorkspace: LeaseWorkspaceView;
  capability: { engine: string; realExecution: "allowed" | "blocked_rule_review_required"; rule: { id: string; version: string; basisStatus: "review_required" | "validated" }; requiredTypes: readonly string[] };
}

export const STATUS_LABELS: Record<ContractStatus, string> = { non_location: "Non-location documentée", exemption_documentee: "Exemption documentée", eligible_v1: "Calculable sur ce périmètre",
  a_qualifier: "Données à compléter", hors_scope_v1: "Hors périmètre V1" };
/** Une forme par statut, en plus de la couleur : l'état ne repose jamais sur la seule teinte. */
export const STATUS_GLYPH: Record<ContractStatus, string> = { non_location: "○", exemption_documentee: "◇", eligible_v1: "●", a_qualifier: "△", hors_scope_v1: "×" };
export const SHEET_STATE_LABELS: Record<string, string> = { draft: "brouillon", ready: "population figée", executed: "calculée", awaiting_review: "soumise à relecture", changes_requested: "reprise demandée",
  approved: "approuvée", locked: "verrouillée", superseded: "remplacée", blocked: "calcul bloqué", failed: "calcul en échec" };
export const STEP_LABELS: Record<StepState, string> = { done: "fait", current: "à faire maintenant", todo: "à venir", blocked: "bloqué" };
export const STEP_GLYPH: Record<StepState, string> = { done: "✓", current: "→", todo: "·", blocked: "!" };
export const TYPE_LABELS: Record<string, string> = { lease_contracts: "Contrats", lease_assumptions: "Hypothèses", lease_schedule: "Échéances et règlements", lease_ledger: "Comptabilité (612 / 613 / 614)", lease_opening: "Ouverture historique" };

/** Colonnes de la matrice de complétude ; chaque motif de qualification se range dans une seule colonne. */
export const MATRIX_COLUMNS = [
  { id: "identification", label: "Identification" }, { id: "components", label: "Composantes" }, { id: "term", label: "Durée" }, { id: "rate", label: "Taux" },
  { id: "schedule", label: "Échéancier" }, { id: "exemption", label: "Exemption" }, { id: "scope", label: "Périmètre V1" },
] as const;
export type MatrixColumn = typeof MATRIX_COLUMNS[number]["id"];
const FIELD_COLUMN: Record<string, MatrixColumn> = {
  identifiedAsset: "identification", controlOfUse: "identification", identificationEvidence: "identification", serviceComponents: "components",
  termMonths: "term", termJudgement: "term", endDate: "term", signatureDate: "term", rateKind: "rate", rateBasis: "rate", annualEffectiveRate: "rate", rateDate: "rate", rateJustification: "rate",
  schedule: "schedule", lowValueExemption: "exemption", lowValueNewValue: "exemption", lowValueJudgement: "exemption",
};
const CODE_COLUMN: Record<string, MatrixColumn> = { R01: "identification", X07: "components", X20: "term", X18: "term", Q01: "term", Q02: "term", X19: "rate",
  X13: "schedule", Q06: "schedule", Q09: "schedule", Q10: "schedule", X17: "schedule", R03: "exemption", X22: "exemption", X23: "exemption", Q08: "exemption" };
export function reasonColumn(r: QualificationReason): MatrixColumn | null {
  if (r.effect === "info") return null;
  return (r.field && FIELD_COLUMN[r.field]) || CODE_COLUMN[r.code] || "scope";
}
export type CellState = "confirmed" | "to_complete" | "out_of_scope" | "not_applicable" | "documented";
export const CELL_LABELS: Record<CellState, string> = { confirmed: "confirmé", to_complete: "à compléter", out_of_scope: "hors V1", not_applicable: "non applicable", documented: "documenté" };
export const CELL_GLYPH: Record<CellState, string> = { confirmed: "✓", to_complete: "△", out_of_scope: "×", not_applicable: "—", documented: "◇" };
/** État d'une cellule : jamais une moyenne ; un seul motif bloquant suffit à la marquer. Un contrat arrêté avant une colonne la rend « non applicable ». */
export function cellState(c: QualifiedContract, column: MatrixColumn): CellState {
  const reasons = c.reasons.filter(r => reasonColumn(r) === column);
  if (reasons.some(r => r.effect === "hors_scope_v1")) return "out_of_scope";
  if (reasons.some(r => r.effect === "a_qualifier")) return "to_complete";
  if (reasons.some(r => r.effect === "non_location" || r.effect === "exemption")) return "documented";
  if (c.status === "non_location") return column === "identification" ? "documented" : "not_applicable";
  if (c.status === "exemption_documentee") return column === "identification" ? "confirmed" : "not_applicable";
  return "confirmed";
}

/** Montant en euros depuis la chaîne serveur : groupement par espaces fines, jamais de conversion en nombre flottant. */
export function moneyFr(m: Money | null | undefined): string {
  if (!m) return "—";
  const negative = m.amount.startsWith("-"), [whole, cents] = m.amount.replace("-", "").split(".");
  return (negative ? "−" : "") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + cents + " €";
}
export const dateFr = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : iso;
export const plural = (n: number, one: string, many = one + "s") => n + " " + (n > 1 ? many : one);

const MESSAGES: Record<string, string> = {
  L16_DURABLE_DISABLED: "Atelier Locations fermé sur ce serveur : profil personnel local (npm run local:start) ou recette jetable requis. Le scénario synthétique reste consultable.",
  L16_DURABLE_UNAVAILABLE: "Service indisponible. Aucune donnée n'a été modifiée ; réessayez la même commande.",
  DEMONSTRATION_DISABLED: "Scénario synthétique fermé sur ce serveur.",
  SESSION_INVALID: "Votre session a expiré. Reconnectez-vous pour reprendre.",
  AUTHENTICATION_REQUIRED: "Connexion requise. Connectez-vous pour reprendre.",
  L16_SOURCE_REPLACED_REVISION_REQUIRED: "Source remplacée ou ajoutée après le gel : créez une révision. La version figée reste lisible.",
  L16_RULE_REPLACED_REVISION_REQUIRED: "Règle remplacée depuis la création de la feuille : créez une révision sur le gabarit courant.",
  L16_REVISION_REPLACED: "Une révision plus récente existe : cette version est en lecture seule.",
  L16_WORK_REQUIRED: "Enregistrez d'abord les politiques et confirmations.",
  L16_CURRENT_SOURCES_REQUIRED: "Les sources requises courantes ne sont pas toutes présentes.",
  L16_CITATION_INVALID: "Citation invalide : la ligne citée n'appartient pas à une source approuvée admise.",
  L16_IMPORT_SCHEMA_INVALID: "Source refusée : un champ hors dictionnaire ou une valeur mal formée (voir le dictionnaire des sources).",
  L16_DUPLICATE_CONTRACT: "Source refusée : identifiant de contrat en double.",
  IDEMPOTENCY_KEY_REUSED: "Commande déjà envoyée avec un autre contenu : rechargez avant de reprendre.",
  WORKPAPER_PERIOD_INVALID: "Exercice invalide pour ce dossier.",
  L16_QUERY_INVALID: "Adresse invalide : dossier ou exercice mal formé.",
};
export function leaseFailureMessage(code: string | undefined, status: number): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (status === 403) return "Accès refusé pour ce dossier ou cette action (" + (code ?? "403") + ").";
  if (status === 404) return "Feuille ou version introuvable (" + (code ?? "404") + ").";
  return "Échec de la commande (" + (code ?? status) + ").";
}

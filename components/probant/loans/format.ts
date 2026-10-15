import type { KnownAmount } from "@/lib/canonical-model/money";
import type { ReviewKind } from "@/lib/auth/review-kind";
import type { ImportBatch } from "@/lib/workpapers/imports";
import type { LoanFact, LoanReview, LoanSource } from "@/lib/workpapers/loan-review";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import type { ExecutionProfile } from "@/lib/runtime/profile";
import { eur } from "../cash/format";

export { dateFr, eur, plural, STATE_LABELS } from "../cash/format";

/** Server response of GET /api/workpapers/emprunts (or of the read-only example). The browser never recalculates. */
export interface LoanView {
  actorId: string; permissions: string[]; reviewKind?: ReviewKind; executionProfile?: ExecutionProfile | null; synthetic?: boolean;
  runs: WorkpaperRun[]; facts: Record<string, LoanFact[]>; factsIssues?: Record<string, string>; sourcesCurrent: Record<string, boolean>;
  imports: (ImportBatch & { rowCount?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
  lineageCurrent?: Record<string, { id: string; version: number; revision: number }>;
}

/** Amount as stated by the server: an unknown or not-applicable amount keeps its reason, never a zero. */
export function amountLabel(a: KnownAmount, options: { signed?: boolean } = {}) {
  return a.kind === "known" ? eur(a.value, options) : a.kind === "unknown" ? "Inconnu" : "Sans objet";
}
export function amountTitle(a: KnownAmount) { return a.kind === "known" ? undefined : a.reason; }
export const sourceOf = (f: LoanFact) => f.details.source as LoanSource | undefined;
export const isZero = (a: KnownAmount) => a.kind === "known" && /^-?0\.00$/.test(a.value.amount);

export type Tone = "ok" | "explain" | "unknown" | "excluded";
export const STATUS_LABELS: Record<LoanReview["status"], string> = { documented: "Documenté", explain: "À expliquer", inconclusive: "Non concluant", excluded: "Exclu et nommé" };
export const STATUS_TONE: Record<LoanReview["status"], Tone> = { documented: "ok", explain: "explain", inconclusive: "unknown", excluded: "excluded" };
export const OUTCOME_TEXT = {
  no_exception_detected: "Aucune différence relevée sur la population testée",
  exceptions_detected: "Des différences demandent une explication",
  inconclusive: "Non concluant sur une partie de la population",
} as const;
export const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

const MESSAGES: Record<string, string> = {
  LOAN_DURABLE_DISABLED: "Feuille Emprunts fermée sur ce serveur : profil personnel local (npm run local:start) ou recette jetable requis. L’exemple synthétique reste consultable.",
  LOAN_DURABLE_UNAVAILABLE: "Service Emprunts indisponible. Aucune donnée n’a été modifiée ; réessayez la même commande.",
  SESSION_INVALID: "Votre session a expiré. Reconnectez-vous pour reprendre.",
  LOAN_CURRENT_SOURCES_REQUIRED: "Toutes les sources Emprunts approuvées courantes doivent être figées ensemble (une version par type). Rechargez la feuille.",
  LOAN_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée ou ajoutée après le gel : créez une révision sur les sources courantes.",
  CLIENT_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée après le gel : créez une révision sur les sources courantes.",
  LOAN_REVISION_REPLACED: "Une révision plus récente de cette feuille existe : ouvrez-la.",
  LOAN_CITATION_INVALID: "La pièce citée doit être une ligne approuvée des sources figées de cette version.",
  LOAN_SOURCE_AFTER_REVIEW: "Une pièce est datée après la date de revue.",
  LOAN_EVENT_AFTER_REVIEW: "Une écriture ou un paiement est daté après la date de revue.",
  LOAN_SOURCE_ROW_INVALID: "Ligne illisible ou identifiant en double dans la source.",
  LOAN_DETAILS_JSON_INVALID: "La colonne Details doit contenir un objet JSON valide.",
  LOAN_CONTRACT_DATES_INVALID: "Contrat : dates incohérentes (début, maturité, effet) ou date de ligne différente de la date d’effet.",
  LOAN_SCHEDULE_DATES_INVALID: "Échéancier : intervalle ou date d’exigibilité incohérents.",
  LOAN_REVISION_DATES_INVALID: "Dates de révision non triées ou en double.",
  LOAN_AMOUNT_NOT_APPLICABLE: "Colonne Amount sans objet pour cette source : 0.00 attendu.",
  LOAN_RATE_FIXING_DATE_INVALID: "Révision de taux : la date de fixation de l’index doit précéder ou égaler la date de révision et la date de l’avis.",
  LOAN_BALANCE_ROW_INVALID: "Balance : la clé doit être le compte et la date celle de la clôture.",
  LOAN_COMPLETE_SOURCE_ASSOCIATIONS_REQUIRED: "Toutes les lignes approuvées doivent être associées à la feuille.",
  LOAN_POPULATION_PERIOD_REQUIRED: "La population se fige sur l’exercice de la feuille.",
  LOAN_REQUEST_INVALID: "Requête refusée : champ inattendu ou mal formé.",
  WORKPAPER_PERIOD_INVALID: "La période ne correspond pas à l’exercice sélectionné.",
  INPUTS_ALREADY_FROZEN: "Les sources sont déjà figées pour cette version.",
  STALE_REVIEW: "La version soumise a changé : rechargez avant de relire.",
  SELF_APPROVAL_FORBIDDEN: "La revue doit être faite par une autre identité, sauf relecture personnelle nommée du profil local.",
  IDEMPOTENCY_KEY_REUSED: "Requête déjà utilisée pour un autre contenu : rechargez.",
  EXPORT_SNAPSHOT_CONFLICT: "La version affichée n’est plus la version serveur : rechargez avant d’exporter.",
  DEMONSTRATION_DISABLED: "Exemple synthétique non activé sur ce serveur.",
};
export function loanFailureMessage(code: string | undefined, status?: number) {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (status === 401) return MESSAGES.SESSION_INVALID;
  if (status === 403) return "Accès refusé : dossier hors périmètre ou permission insuffisante.";
  if (status === 409) return "La version ou une source a changé : comparez avec la version serveur avant de reprendre.";
  return "Demande refusée" + (code ? " (" + code + ")" : "") + ". Vérifiez les sources et paramètres transcrits.";
}

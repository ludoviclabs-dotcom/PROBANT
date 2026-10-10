import type { ClosingEvaluation, JournalLine, ProcedureStatus, StepState } from "@/lib/workpapers/closing-evaluate";
import type { PieceVersion } from "@/lib/workpapers/closing-journal";
import type { ResolvedCitation } from "@/lib/workpapers/closing-contract";
import { formatCents } from "@/lib/workpapers/stock-contract";

export { dateFr, plural } from "../fiscal/format";
/** Server response of GET /api/workpapers/closing: the browser renders the evaluation, it never recomputes a state, a count or an amount. */
export interface ClosingView {
  actorId: string; permissions: ("read" | "prepare" | "review" | "sign" | "download")[]; closingAuthority: boolean; dossierId: string; periodId: string;
  seq: number; headHash: string; hashNotice: string; pieces: PieceVersion[]; evaluation: ClosingEvaluation; journal: JournalLine[];
}
export type ClosingTab = "programme" | "pieces" | "anomalies" | "revue" | "cloture" | "journal";
export const TONE: Record<ProcedureStatus, "ok" | "open" | "danger" | "muted" | "info"> = {
  revue: "ok", cycle_verrouille: "ok", conclue: "info", cycle_approuve: "info", en_cours: "open", cycle_en_cours: "open", a_faire: "open", changements: "danger", perimee: "danger",
  population_absente: "danger", perimetre_requis: "danger", cycle_bloque: "danger", cycle_absent: "open", non_applicable: "muted",
};
export const STEP_STATE_LABELS: Record<StepState, string> = { absent: "non documentée", documente: "documentée", sans_preuve: "sans pièce", preuve_remplacee: "pièce remplacée", declaration_seule: "déclaration seule" };
/** Absolute server time in French (Europe/Paris), never a relative time computed on the client clock. */
export const stampFr = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const euros = (amount: string) => { const [whole, cents = "00"] = amount.replace("-", "").split("."); return formatCents((amount.startsWith("-") ? "-" : "") + (BigInt(whole) * 100n + BigInt(cents.padEnd(2, "0"))).toString()); };
export const citationText = (c: ResolvedCitation) => c.label + " · v" + c.version + (c.page ? " · p. " + c.page : "") + (c.zone ? " · " + c.zone : "");
const MESSAGES: Record<string, string> = {
  CL_DURABLE_DISABLED: "Dossier de clôture durable fermé : réservé à la recette jetable (drapeau désactivé ou production).",
  CL_DURABLE_UNAVAILABLE: "Service indisponible. Aucune donnée n’a été modifiée ; réessayez.",
  CL_STALE_SEQ: "Le journal a avancé depuis votre lecture (autre action enregistrée) : rechargez avant de reprendre.",
  CL_FILE_NOT_OPENED: "Ouvrez d’abord le dossier : entité et exercice.",
  CL_FILE_ALREADY_OPENED: "Ce dossier est déjà ouvert pour cet exercice.",
  CL_FILE_CLOSED: "Dossier validé : toute modification passe par une réouverture motivée du professionnel habilité.",
  CL_FILE_NOT_CLOSED: "Aucune validation de clôture en cours à rouvrir.",
  CL_CLOSING_BLOCKED: "Validation refusée : des travaux, points de revue, contradictions ou incohérences restent ouverts (voir « Travaux restants »).",
  CL_CLOSING_AUTHORITY_FORBIDDEN: "Validation réservée au professionnel habilité : cette identité ne détient pas l’habilitation de clôture.",
  CL_RISK_UNKNOWN: "Risque inconnu : créez-le avant d’y rattacher une procédure.",
  CL_ASSERTION_NOT_IN_RISK: "Une procédure ne couvre que des assertions de ses risques.",
  CL_RISK_ASSERTION_IN_USE: "Assertion encore couverte par une procédure : modifiez d’abord la procédure.",
  CL_ENGINE_REQUIRED: "Une feuille outillée désigne la procédure de cycle observée.",
  CL_ENGINE_ONLY_FOR_ENGINE: "Seule une feuille outillée désigne une procédure de cycle.",
  CL_ENGINE_ALREADY_LINKED: "Cette feuille de cycle est déjà rattachée à une autre procédure du programme.",
  CL_NATURE_LOCKED: "Nature figée : des travaux ou une conclusion existent déjà.",
  CL_ENGINE_POPULATION_FROM_CYCLE: "La population d’une feuille outillée vient de son cycle.",
  CL_ENGINE_WORK_IN_CYCLE: "Les travaux d’une feuille outillée se documentent dans son cycle.",
  CL_ENGINE_CONCLUDED_IN_CYCLE: "Une feuille outillée se conclut et se revoit dans son cycle.",
  CL_NA_REASON_REQUIRED: "Une procédure non applicable exige son motif.",
  CL_NA_REASON_UNEXPECTED: "Pas de motif pour une procédure déclarée applicable.",
  CL_ITGC_ONLY: "Le périmètre et la méthode ITGC ne concernent que les procédures ITGC.",
  CL_ITGC_SCOPE_REQUIRED: "ITGC : définissez d’abord le périmètre (systèmes, processus, période) et la méthode. Une checklist ne vaut pas couverture.",
  CL_DATES_INVALID: "Période invalide : la fin précède le début.",
  CL_PROCEDURE_NOT_APPLICABLE: "Procédure déclarée non applicable : aucun travail ni conclusion.",
  CL_STEP_INVALID: "Étape inadaptée à la nature de la procédure.",
  CL_DATE_FUTURE: "La date de réalisation ne peut pas être postérieure à aujourd’hui.",
  CL_CONTROL_DESIGN_REQUIRED: "Le test de fonctionnement exige une description et une mise en œuvre documentées.",
  CL_POPULATION_REQUIRED: "Définissez la population : sur quoi porte le travail.",
  CL_POPULATION_ABSENT: "Population absente : aucun travail d’exécution ni conclusion tant qu’elle n’est pas obtenue.",
  CL_REQUEST_UNKNOWN: "Demande de pièce inconnue.", CL_REQUEST_CLOSED: "Demande déjà close.",
  CL_REQUEST_CLOSURE_INVALID: "Reçue : citez la pièce ; annulée : donnez le motif.",
  CL_PIECE_NOT_NEW: "La pièce reçue doit avoir été déposée après la demande.",
  CL_PIECE_UNKNOWN: "Pièce inconnue dans ce dossier.",
  CL_PIECE_VERSION_SUPERSEDED: "Cette version de pièce a été remplacée : citez la version courante.",
  CL_PIECE_UNCHANGED: "Contenu identique à la version courante : aucune nouvelle version.",
  CL_PIECE_KIND_LOCKED: "Une nouvelle version garde la nature de la pièce.",
  CL_CITATION_DUPLICATE: "Même pièce citée deux fois au même endroit.",
  CL_REACH_REQUIRED: "Pour un contrôle, précisez la portée : conception et mise en œuvre, ou fonctionnement.",
  CL_REACH_UNEXPECTED: "La portée ne concerne que les contrôles.",
  CL_WORK_INCOMPLETE: "Étapes requises non documentées pour cette conclusion.",
  CL_EVIDENCE_SUPERSEDED: "Un travail cite une pièce remplacée : réexaminez-le avant de conclure.",
  CL_EVIDENCE_REQUIRED: "Un travail sans pièce ne fonde pas une conclusion.",
  CL_PIECE_REQUEST_OPEN: "Pièce encore attendue pour cette procédure : clôturez la demande (reçue ou annulée motivée).",
  CL_REPRESENTATION_ONLY: "Une déclaration de la direction ne suffit pas seule : citez un élément corroborant (NEP 580 §04, lecture de méthode interne).",
  CL_CONCLUSION_REQUIRED: "Aucune conclusion à revoir.",
  CL_CONCLUSION_STALE: "Conclusion périmée : le travail a changé depuis ; une nouvelle conclusion est requise.",
  CL_SELF_REVIEW_FORBIDDEN: "Revue par une autre personne : vous êtes l’auteur de ce travail ou de cette conclusion.",
  CL_REVIEW_POINT_OPEN: "Un point de revue reste ouvert sur cette procédure.",
  CL_TARGET_UNKNOWN: "Élément visé inconnu.", CL_REVIEW_POINT_UNKNOWN: "Point de revue inconnu.", CL_REVIEW_POINT_CLOSED: "Point de revue déjà clos.",
  CL_ANSWER_REQUIRED: "Le point doit recevoir une réponse avant d’être clos.",
  CL_SELF_CLOSE_FORBIDDEN: "Un point est clos par une autre personne que l’auteur de la réponse.",
  CL_MISSTATEMENT_UNKNOWN: "Anomalie inconnue.", CL_MISSTATEMENT_ALREADY_CORRECTED: "Anomalie déjà corrigée.",
  CL_NEW_EVIDENCE_REQUIRED: "Une correction cite une preuve nouvelle : une pièce déposée après l’anomalie, autre que celle qui l’a révélée.",
  CL_LIMITATION_UNKNOWN: "Limite inconnue.", CL_CONTRADICTION_UNKNOWN: "Contradiction inconnue.", CL_CONTRADICTION_RESOLVED: "Contradiction déjà résolue.",
  CL_CONTRADICTION_SAME_PIECE: "Une contradiction oppose deux pièces différentes.",
  CL_FILE_TYPE_UNSUPPORTED: "Type de fichier refusé (PDF, tableur, texte ou image seulement).",
  CL_FILE_LIMIT: "Pièce limitée à 3 Mio pour cette recette.",
  CL_STATE_LIMIT: "Dossier trop volumineux pour cette recette.",
  CL_REQUEST_INVALID: "Requête invalide : un champ manque ou dépasse sa longueur.",
  CL_PERIOD_INVALID: "Exercice invalide.", WORKPAPER_PERIOD_INVALID: "L’exercice ne correspond pas à l’identifiant de période.",
  WORKPAPER_FORBIDDEN: "Accès refusé pour ce dossier ou cette action.", SESSION_INVALID: "Session expirée : reconnectez-vous.",
  IDEMPOTENCY_KEY_REUSED: "Clé de requête déjà utilisée pour une autre action.",
  CL_JOURNAL_CORRUPTED: "Journal altéré : lecture refusée. Aucune donnée n’a été modifiée.",
};
export const closingFailureMessage = (code?: string) => (code && MESSAGES[code]) ?? "Action refusée par le serveur (" + (code ?? "erreur inconnue") + ").";

import type { SourceLocator } from "@/lib/workpapers/model";
import type { FaMovement, FaTable } from "@/lib/workpapers/fixed-asset-sources";
export { dateFr, eur, knownLabel, locatorText, plural, STATE_LABELS } from "../cash/format";

export const TABLE_LABELS: Record<FaTable, string> = { gross: "Brut", amortization: "Amortissements", impairment: "Dépréciations" };
export const TABLE_UNITS: Record<FaTable, string> = { gross: "valeurs brutes", amortization: "amortissements cumulés", impairment: "dépréciations cumulées" };
export const MOVEMENT_LABELS: Record<FaMovement, string> = { opening: "Ouverture", addition: "Entrée", disposal: "Sortie", reversal: "Reprise", reclassification: "Reclassement", closing: "Clôture" };
export const STATUS_LABELS = { in_progress: "En cours", in_service: "Mis en service", disposed: "Sorti" } as const;
export const SOURCE_TYPE_LABELS = { fa_register: "Registre des immobilisations", fa_ledger: "GL / balance à la clôture", fa_parameters: "Paramètres d’amortissement", fa_support: "Pièces de mouvement" } as const;
export const TREATMENT_LABELS: Record<string, string> = { standard: "Standard", credit_bail: "Crédit-bail", reevaluation: "Réévalué", financier: "Financier", devise: "Devise", autre_complexe: "Complexe" };

const MESSAGES: Record<string, string> = {
  FA_DURABLE_DISABLED: "Ce parcours doit être activé dans un environnement de recette jetable.",
  FA_DURABLE_UNAVAILABLE: "Le service est indisponible. Réessayez la même commande.",
  SESSION_INVALID: "Votre session a expiré. Reconnectez-vous pour reprendre.",
  AUTHENTICATION_REQUIRED: "Connectez-vous pour accéder à ce dossier.",
  FORBIDDEN: "Votre identité ne dispose pas de la permission nécessaire.", WORKPAPER_FORBIDDEN: "Ce dossier n’appartient pas à votre périmètre autorisé.",
  FA_SOURCES_REQUIRED: "Source manquante bloquante : approuvez le registre et le GL / balance ; paramètres et pièces sont facultatifs mais nécessaires au recalcul et aux pièces.",
  FA_CURRENT_SOURCES_REQUIRED: "Les sources affichées ne sont plus les sources courantes. Rechargez avant de figer.",
  FA_NO_ASSET_IN_SCOPE: "Aucun actif au traitement standard dans le registre : rien à tester sur cet écran.",
  FA_COLUMN_REQUIRED: "Une colonne obligatoire du mapping n’est pas renseignée.",
  FA_MOVEMENT_SIGN_INVALID: "Signe incohérent : ouverture, entrée, sortie, reprise et clôture sont positives dans le sens de leur tableau.",
  FA_RECLASSIFICATION_ZERO: "Un reclassement doit porter un montant signé non nul.",
  FA_MOVEMENT_OUTSIDE_PERIOD: "Un mouvement du registre doit être daté dans l’exercice.",
  FA_OPENING_DATE_REQUIRED: "L’ouverture doit être datée du début d’exercice.", FA_CLOSING_DATE_REQUIRED: "La clôture (ou le solde GL) doit être datée de la clôture.",
  FA_TABLE_INVALID: "Tableau attendu : brut, amortissement ou depreciation.", FA_MOVEMENT_INVALID: "Mouvement attendu : ouverture, entree, sortie, reprise, reclassement ou cloture.",
  FA_STATUS_INVALID: "Statut attendu : en_cours, en_service ou sorti.", FA_TREATMENT_INVALID: "Traitement attendu : standard, credit_bail, reevaluation, financier, devise ou autre_complexe.",
  FA_REVERSAL_TABLE_INVALID: "Une reprise n’est admise que dans le tableau des dépréciations.",
  FA_ENDPOINT_DUPLICATE: "Deux ouvertures ou deux clôtures pour le même actif et le même tableau.",
  FA_UNIT_INCONSISTENT: "Un même actif porte des statuts, familles ou traitements différents selon les lignes.",
  FA_ACCOUNT_INCONSISTENT: "Un même actif porte deux comptes différents pour un même tableau.",
  FA_ASSET_REQUIRED: "Identifiant d’actif absent sur une ligne.", FA_FAMILY_REQUIRED: "Famille absente sur une ligne du registre.", FA_ACCOUNT_REQUIRED: "Compte GL absent sur une ligne du registre.",
  FA_ASSET_UNKNOWN: "Actif inconnu : cette ligne vise un actif absent du registre. Corrigez la source ou importez le registre complet.",
  FA_LEDGER_TABLE_MISMATCH: "Un compte du GL est déclaré pour un autre tableau que dans le registre : la convention de signe ne peut pas s’appliquer.",
  FA_RESIDUAL_NEGATIVE: "La valeur résiduelle ne peut pas être négative.", FA_DURATION_INVALID: "Durée en mois entière, de 1 à 1200, ou laissée vide (source requise).",
  FA_PRORATA_INVALID: "Prorata n/d : entiers, d > 0 et n ≤ d, ou laissés vides (source requise).", FA_PARAMETERS_DUPLICATE: "Deux lignes de paramètres pour le même actif.",
  FA_SUPPORT_KIND_INVALID: "Nature de pièce attendue : acquisition, cession ou mise_en_service.", FA_SUPPORT_SIGN_INVALID: "Le montant d’une pièce doit être positif.",
  FA_SUPPORT_AFTER_REVIEW: "Une pièce doit être datée au plus tard de la date de revue.",
  FA_KEY_INVALID_OR_DUPLICATE: "Identifiant de ligne absent ou dupliqué.",
  FA_METHOD_DUPLICATE: "Deux méthodes portent le même identifiant.", FA_METHOD_PERIOD_INVALID: "La validité d’une méthode doit commencer avant de finir.",
  FA_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée. Rechargez puis créez une nouvelle révision.", FA_SOURCE_HEAD_CONFLICT: "Une autre source a été approuvée entre-temps. Rechargez avant d’approuver.",
  UNRESOLVED_BLOCKING_NOTE: "Documentez le traitement des points bloquants avant l’approbation.", SELF_APPROVAL_FORBIDDEN: "Une autre identité autorisée doit approuver cette version.",
  PREPARATION_INCOMPLETE: "Une conclusion et un résultat exécuté sont nécessaires avant la soumission.", PREPARATION_EDIT_FORBIDDEN: "Cette version ne peut plus être modifiée par votre identité. Créez une révision si nécessaire.",
  WORKPAPER_TRANSITION_FORBIDDEN: "Cette action ne correspond plus à l’état de la feuille. Rechargez sa version courante.", WORKPAPER_ALREADY_EXISTS: "La feuille Immobilisations existe déjà pour cette période : rechargez.",
  MAPPING_COLUMNS_INVALID: "Vérifiez les noms des colonnes du mapping dans votre fichier.", FA_FILE_LIMIT: "Le fichier dépasse la limite de 3 Mio de cette recette.", FA_STATE_LIMIT: "La feuille dépasse les bornes de cette recette.",
  FA_REQUEST_INVALID: "Requête refusée : champs inattendus ou incomplets.", IDEMPOTENCY_KEY_REUSED: "Cette clé de commande a déjà servi pour un autre contenu.",
  FA_GROSS_CLOSING_REQUIRED: "Chaque actif doit avoir une valeur brute de clôture (même nulle) pour entrer dans la population.",
};
export function fixedAssetFailureMessage(code?: string, locator?: SourceLocator & { column?: string; value?: string }) {
  const base = code && MESSAGES[code] ? MESSAGES[code] : "L’opération a été refusée. Rechargez la feuille et vérifiez ses sources, sa période et vos permissions.";
  const where = locator ? [locator.row && "ligne " + locator.row, locator.column && "colonne « " + locator.column + " »", locator.value && "valeur « " + locator.value + " »"].filter(Boolean).join(", ") : "";
  return where ? base + " (" + where + ")" : base;
}

import type { SourceLocator } from "@/lib/workpapers/model";
import { EQ_COMPONENT_LABELS, EQ_DECISION_TYPE_LABELS, EQ_NATURE_LABELS, type EqComponent, type EqDecisionType, type EqNature } from "@/lib/workpapers/equity-sources";
export { dateFr, eur, knownLabel, locatorText, plural, STATE_LABELS } from "../cash/format";

export const COMPONENT_LABELS: Record<EqComponent, string> = EQ_COMPONENT_LABELS;
export const NATURE_LABELS: Record<EqNature, string> = EQ_NATURE_LABELS;
export const DECISION_TYPE_LABELS: Record<EqDecisionType, string> = EQ_DECISION_TYPE_LABELS;
export const SOURCE_TYPE_LABELS = { eq_balances: "Balance d’ouverture et de clôture", eq_entries: "Écritures de l’exercice (GL)", eq_variation: "Tableau de variation fourni", eq_decisions: "Registre des décisions (PV, actes)", eq_payments: "Règlements des distributions", eq_minutes: "PV et actes (PDF)" } as const;
export const TIMING_LABELS = { before_period: "Effet antérieur à l’exercice", in_period: "Effet dans l’exercice", after_closing: "Effet postérieur à la clôture" } as const;
export function columnLabel(column: string) { return column === "ouverture" ? "Ouverture" : column === "cloture" ? "Clôture" : NATURE_LABELS[column as EqNature] ?? column; }

const MESSAGES: Record<string, string> = {
  EQ_DURABLE_DISABLED: "Ce parcours doit être activé dans un environnement de recette jetable.",
  EQ_DURABLE_UNAVAILABLE: "Le service est indisponible. Réessayez la même commande.",
  SESSION_INVALID: "Votre session a expiré. Reconnectez-vous pour reprendre.",
  AUTHENTICATION_REQUIRED: "Connectez-vous pour accéder à ce dossier.",
  FORBIDDEN: "Votre identité ne dispose pas de la permission nécessaire.", WORKPAPER_FORBIDDEN: "Ce dossier n’appartient pas à votre périmètre autorisé.",
  EQ_SOURCES_REQUIRED: "Source manquante bloquante : approuvez la balance d’ouverture et de clôture et les écritures de l’exercice ; tableau fourni, registre des décisions, règlements et PV sont conditionnels.",
  EQ_CURRENT_SOURCES_REQUIRED: "Les sources affichées ne sont plus les sources courantes. Rechargez avant de figer.",
  EQ_NO_ITEM_IN_SCOPE: "Aucune écriture ni décision sur une composante de capitaux propres : rien à tester sur cet écran.",
  EQ_COLUMN_REQUIRED: "Une colonne obligatoire du mapping n’est pas renseignée.",
  EQ_COMPONENT_INVALID: "Composante attendue : capital, primes, ecarts_reevaluation, ecart_equivalence, reserve_legale, reserves_statutaires, reserves_reglementees, autres_reserves, report_a_nouveau, resultat, subventions_investissement, provisions_reglementees ou autres_fonds_propres.",
  EQ_NATURE_INVALID: "Nature attendue : affectation_resultat, distribution, augmentation_capital, reduction_capital, incorporation_reserves, resultat_exercice, subventions, provisions_reglementees, reclassement_interne ou autre.",
  EQ_DECISION_TYPE_INVALID: "Type de décision attendu : affectation_resultat, distribution, augmentation_capital, reduction_capital, incorporation_reserves ou autre_decision.",
  EQ_EFFECT_DATE_REQUIRED: "Date d’effet absente ou illisible : elle doit être explicite, jamais déduite de la date comptable.",
  EQ_BALANCE_DATE_INVALID: "Une ligne de balance doit être datée de l’ouverture ou de la clôture de l’exercice.", EQ_BALANCE_DUPLICATE: "Deux soldes du même compte à la même date.",
  EQ_ENTRY_OUTSIDE_PERIOD: "Une écriture doit être datée dans l’exercice ; la date d’effet, elle, peut être hors période.", EQ_ENTRY_ZERO: "Une écriture doit porter un montant non nul.",
  EQ_LABEL_REQUIRED: "Un mouvement de nature « autre » exige un libellé explicatif.",
  EQ_TRANSFER_UNBALANCED: "Transfert interne déséquilibré : ses lignes doivent s’annuler (au moins deux lignes). Un mouvement qui sort des capitaux propres n’est pas un transfert.",
  EQ_TRANSFER_NATURE_INVALID: "Seuls l’affectation du résultat, l’incorporation de réserves et les reclassements internes peuvent porter une référence de transfert.",
  EQ_TRANSFER_SCOPE_INVALID: "Un transfert interne ne peut pas toucher les autres fonds propres : il changerait le total des capitaux propres.",
  EQ_ACCOUNT_REQUIRED: "Compte absent sur une ligne.", EQ_ACCOUNT_COMPONENT_INCONSISTENT: "Un même compte est rattaché à deux composantes différentes (entre lignes ou entre sources).",
  EQ_VARIATION_COLUMN_INVALID: "Colonne du tableau attendue : ouverture, cloture ou une nature de mouvement.", EQ_VARIATION_DATE_INVALID: "Tableau fourni : ouverture datée du début d’exercice, autres colonnes datées de la clôture.", EQ_VARIATION_DUPLICATE: "Deux cellules pour la même composante et la même colonne.",
  EQ_DECISION_ID_REQUIRED: "Identifiant de décision absent.", EQ_DECISION_ZERO: "Une ligne de décision doit porter un montant non nul.", EQ_DECISION_AFTER_REVIEW: "Une décision doit être datée au plus tard de la date de revue.",
  EQ_MINUTES_REF_INVALID: "Référence de PV invalide (lettres, chiffres, point, tiret, souligné).", EQ_PAGE_INVALID: "Page du PV : entier positif, ou vide (page non indiquée).",
  EQ_PAYMENT_SIGN_INVALID: "Le montant d’un règlement doit être positif.", EQ_PAYMENT_AFTER_REVIEW: "Un règlement doit être daté au plus tard de la date de revue.", EQ_PAYMENT_DECISION_REQUIRED: "Un règlement doit citer la ligne de décision qu’il exécute.",
  EQ_PDF_FORMAT_INVALID: "Le PV doit être un fichier PDF.", EQ_PDF_SIGNATURE_INVALID: "Le fichier n’est pas un PDF (signature absente).", EQ_PDF_INVALID: "PDF illisible : déposez la version d’origine.", EQ_PDF_ENCRYPTED: "PDF chiffré refusé : déposez une version non protégée.",
  EQ_MINUTES_PAGES_INVALID: "Le PV doit compter de 1 à 200 pages.", EQ_MINUTES_AFTER_REVIEW: "Le PV doit être daté au plus tard de la date de revue.", EQ_MINUTES_DUPLICATE: "Deux PV portent la même référence de pièce.",
  EQ_IMPORT_FIELDS_INVALID: "Requête d’import refusée : champs inattendus.",
  EQ_READING_PV_REQUIRED: "Lecture impossible : le PV cité par cette décision n’est pas fourni.", EQ_READING_PAGE_INVALID: "Lecture impossible : la page citée est absente du PV.", EQ_READING_LINE_UNKNOWN: "Ligne de décision inconnue dans le registre figé.", EQ_READING_DUPLICATE: "Deux lectures pour la même ligne de décision.",
  EQ_CITATION_REQUIRED: "Une décision humaine doit citer une pièce et sa version.", EQ_CITATION_SOURCE_REQUIRED: "La pièce citée doit appartenir aux sources figées de cette version.", EQ_CITATION_PAGE_INVALID: "Page citée invalide : obligatoire et comprise dans le PV, interdite pour une source tabulaire.",
  EQ_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée ou ajoutée. Rechargez puis créez une nouvelle révision.", EQ_SOURCE_HEAD_CONFLICT: "Une autre source a été approuvée entre-temps. Rechargez avant d’approuver.",
  UNRESOLVED_BLOCKING_NOTE: "Documentez le traitement des points bloquants avant l’approbation.", SELF_APPROVAL_FORBIDDEN: "Une autre identité autorisée doit approuver cette version.",
  PREPARATION_INCOMPLETE: "Une conclusion et un résultat exécuté sont nécessaires avant la soumission.", PREPARATION_EDIT_FORBIDDEN: "Cette version ne peut plus être modifiée par votre identité. Créez une révision si nécessaire.",
  WORKPAPER_TRANSITION_FORBIDDEN: "Cette action ne correspond plus à l’état de la feuille. Rechargez sa version courante.", WORKPAPER_ALREADY_EXISTS: "La feuille Capitaux propres existe déjà pour cette période : rechargez.",
  MAPPING_COLUMNS_INVALID: "Vérifiez les noms des colonnes du mapping dans votre fichier.", EQ_FILE_LIMIT: "Le fichier dépasse la limite de 3 Mio de cette recette.", EQ_STATE_LIMIT: "La feuille dépasse les bornes de cette recette.",
  EQ_REQUEST_INVALID: "Requête refusée : champs inattendus ou incomplets.", IDEMPOTENCY_KEY_REUSED: "Cette clé de commande a déjà servi pour un autre contenu.",
};
export function equityFailureMessage(code?: string, locator?: SourceLocator & { column?: string; value?: string }) {
  const base = code && MESSAGES[code] ? MESSAGES[code] : "L’opération a été refusée. Rechargez la feuille et vérifiez ses sources, sa période et vos permissions.";
  const where = locator ? [locator.row && "ligne " + locator.row, locator.page && "page " + locator.page, locator.column && "colonne « " + locator.column + " »", locator.value && "valeur « " + locator.value + " »"].filter(Boolean).join(", ") : "";
  return where ? base + " (" + where + ")" : base;
}

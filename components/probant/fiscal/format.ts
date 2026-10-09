import type { SourceLocator } from "@/lib/workpapers/model";
export { dateFr, eur, knownLabel, locatorText, plural, STATE_LABELS } from "../cash/format";

const NBSP = " ", NARROW = " ", MINUS = "−";
/** Exact integer cents displayed in French EUR; an unknown amount is never shown as zero. */
export function cents(value: number | string | null | undefined, options: { signed?: boolean } = {}) {
  if (value === null || value === undefined) return "Inconnu";
  const n = BigInt(value), abs = n < 0n ? -n : n, whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NARROW);
  return (n < 0n ? MINUS : options.signed && n > 0n ? "+" : "") + whole + "," + (abs % 100n).toString().padStart(2, "0") + NBSP + "EUR";
}
/** User input « -100,00 » / « 1 250.5 » → exact cents string, or null when unreadable (never zero by default). */
export function parseEurInput(raw: string): string | null {
  const s = raw.replace(/\s| | /g, "").replace("−", "-");
  if (!/^-?\d{1,11}([.,]\d{1,2})?$/.test(s)) return null;
  const [whole, decimals = ""] = s.replace(",", ".").replace("-", "").split(".");
  const value = BigInt(whole) * 100n + BigInt(decimals.padEnd(2, "0") || "0");
  return (s.startsWith("-") && value !== 0n ? "-" : "") + value.toString();
}
export const rate = (bp: number | null) => bp === null ? "Non dérivable" : (bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + NBSP + "%";
export function locatorLabel(locator?: SourceLocator | null) {
  if (!locator) return "Document entier";
  return [locator.sheet && "feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page, locator.zone].filter(Boolean).join(", ") || "Document entier";
}
export const OUTCOME_LABELS: Record<string, string> = {
  passed: "Sans écart ni signal", reconciliation_difference: "Écart", potential_tax_risk: "Risque potentiel", review_recommendation: "À examiner", missing_information: "Information manquante", inconclusive: "Non concluant", confirmed_non_compliance: "Hors périmètre",
  no_exception_detected: "Aucun écart", exceptions_detected: "Exceptions", known: "Calculé", unknown: "Inconnu", not_provided: "Source non fournie",
};
export const TIER_LABELS: Record<string, string> = { ledger_only: "FEC seul — signal", ledger_and_declaration: "FEC + déclaration — réconciliation", ledger_declaration_and_invoice: "FEC + déclaration + pièces — contrôle renforcé", insufficient: "Preuve insuffisante" };
export const COVERAGE_LABELS: Record<string, string> = { covered: "Sources couvrantes sur toute la période", partially_covered: "Sources partiellement couvrantes", not_covered: "Sources non couvrantes" };
export const CATEGORY_LABELS: Record<string, string> = { source: "Source normative", profile: "Profil à confirmer", document: "Pièce requise", scope: "Hors périmètre", input: "Donnée requise" };
export const REGIME_LABELS: Record<string, string> = { real_normal: "Réel normal (CA3)", mini_real: "Mini-réel (CA3)", real_simplified: "Réel simplifié (CA12)", franchise: "Franchise (hors périmètre)", exempt: "Exonéré (hors périmètre)", unknown: "Inconnu" };
export const GROUP_LABELS: Record<string, string> = { none: "Assujetti isolé", member: "Membre d’un groupe TVA (hors périmètre)", representative: "Représentant d’un groupe TVA (hors périmètre)", unknown: "Inconnu" };
export const FREQUENCY_LABELS: Record<string, string> = { monthly: "Mensuelle", quarterly: "Trimestrielle", annual: "Annuelle" };
/** French titles of the TAX-06 controls (the engine keeps its own unaccented technical titles). */
export const CONTROL_LABELS: Record<string, string> = {
  "VAT.BASE.BY_RATE": "Bases HT par taux", "VAT.THEORETICAL.BY_RATE": "TVA théorique par taux constaté", "VAT.COLLECTED.ACCOUNTED": "TVA collectée comptabilisée", "VAT.DEDUCTIBLE.ACCOUNTED": "TVA déductible comptabilisée",
  "VAT.DECLARED": "TVA déclarée", "VAT.NET": "TVA nette comptabilisée ↔ déclarée", "VAT.CREDIT": "Crédit de TVA", "VAT.CREDIT.CARRYFORWARD": "Report de crédit lu sur la déclaration", "VAT.PERIOD.SHIFT": "Rattachement à la période",
  "VAT.RATE.UNUSUAL": "Taux constaté inhabituel", "VAT.PIECE.DUPLICATE": "Pièce en double", "VAT.PIECE.MISSING": "Pièce absente de l’inventaire", "VAT.ENTRY.NO_REFERENCE": "Écriture sans référence de pièce",
  "VAT.ACCOUNT.ABNORMAL_BALANCE": "Compte de TVA au sens inhabituel", "VAT.REVERSE_CHARGE.CANDIDATE": "Autoliquidation candidate", "VAT.FORM.COHERENCE": "Cohérence interne CA3 / CA12",
};
export const SIGNAL_LABELS: Record<string, string> = { missing_piece_reference: "Pièce non référencée ou absente", missing_piece_date: "Date de pièce absente", duplicate_piece_candidate: "Pièce en double (candidat)", period_shift_candidate: "Décalage de période (candidat)",
  reverse_charge_candidate: "Autoliquidation (candidat)", unusual_rate_candidate: "Taux inhabituel (candidat)", rate_not_derivable: "Taux non dérivable", base_not_linked: "Base HT non rattachée" };
export const SOURCE_LABELS: Record<string, string> = { fx_fec: "FEC / grand livre", fx_vat_return: "Déclaration CA3 / CA12", fx_invoices: "Inventaire des factures", fx_vat_payments: "Paiements au Trésor", fx_support: "Pièces justificatives" };

const MESSAGES: Record<string, string> = {
  FX_DURABLE_DISABLED: "Ce parcours doit être activé dans un environnement de recette jetable.", FX_DURABLE_UNAVAILABLE: "Le service est indisponible. Réessayez la même commande.",
  SESSION_INVALID: "Votre session a expiré. Reconnectez-vous pour reprendre.", AUTHENTICATION_REQUIRED: "Connectez-vous pour accéder à ce dossier.",
  FORBIDDEN: "Votre identité ne dispose pas de la permission nécessaire.", WORKPAPER_FORBIDDEN: "Ce dossier n’appartient pas à votre périmètre autorisé.",
  FX_CURRENT_SOURCES_REQUIRED: "Les sources affichées ne sont plus les sources courantes de cette période. Rechargez avant de figer.",
  FX_NO_VAT_ENTRY_IN_PERIOD: "Aucune écriture de TVA datée dans cette période déclarative : rien à rapprocher.",
  FX_FEC_REQUIRED: "Le FEC de l’exercice est requis avant de figer une période.", FX_VINTAGE_MISMATCH: "Le millésime choisi diffère de celui de la déclaration de la période : aucun millésime n’est substitué.",
  FX_PERIOD_FREQUENCY_INVALID: "La période déclarative doit compter 1, 3 ou 12 mois civils entiers selon la périodicité.", FX_DECLARATIVE_PERIOD_OUTSIDE_EXERCISE: "La période déclarative doit être comprise dans l’exercice.",
  FX_PERIOD_IMMUTABLE: "La période déclarative identifie la feuille : créez une feuille pour une autre période.",
  FX_CITATION_REQUIRED: "Une décision humaine doit citer une pièce et sa version.", FX_CITATION_SOURCE_REQUIRED: "La pièce citée doit appartenir aux sources figées de cette version.", FX_CITATION_ROW_INVALID: "La ligne citée n’existe pas dans cette version de la pièce.",
  FX_SOURCE_REPLACED_REVISION_REQUIRED: "Une source dont dépend cette période a été remplacée ou ajoutée. Rechargez puis créez une nouvelle révision.", FX_SOURCE_HEAD_CONFLICT: "Une autre version a été approuvée entre-temps. Rechargez avant d’approuver.",
  FX_FEC_ENCODING_UTF8_REQUIRED: "Le FEC doit être encodé en UTF-8.", FX_FEC_LINE_LIMIT: "FEC limité à 20 000 lignes pour cette recette.", FX_FILE_FORMAT_UNSUPPORTED: "Format de fichier non accepté pour ce type de pièce.",
  FX_DECLARATION_UNREADABLE: "Déclaration illisible : utilisez le gabarit PROBANT (JSON, CSV ou XLSX).", FX_DECLARATION_TYPE_NOT_ENABLED: "Seules les déclarations de TVA sont acceptées dans ce sous-lot.",
  FX_COLUMN_REQUIRED: "Une colonne obligatoire du mapping n’est pas renseignée.", FX_KEY_INVALID_OR_DUPLICATE: "Identifiant absent ou en double.", FX_PAYMENT_PERIOD_INVALID: "Période du paiement illisible : début et fin requis.", FX_PAYMENT_SIGN_INVALID: "Le montant d’un paiement doit être positif.",
  FX_IMPORT_FIELDS_INVALID: "Requête d’import refusée : champs inattendus.", FX_FILE_LIMIT: "Le fichier dépasse la limite de 3 Mio de cette recette.", FX_STATE_LIMIT: "La feuille dépasse les bornes de cette recette.",
  UNRESOLVED_BLOCKING_NOTE: "Documentez le traitement des points bloquants avant l’approbation.", SELF_APPROVAL_FORBIDDEN: "Une autre identité autorisée doit approuver cette version.",
  PREPARATION_INCOMPLETE: "Une conclusion et un résultat exécuté sont nécessaires avant la soumission.", PREPARATION_EDIT_FORBIDDEN: "Cette version ne peut plus être modifiée par votre identité. Créez une révision si nécessaire.",
  WORKPAPER_TRANSITION_FORBIDDEN: "Cette action ne correspond plus à l’état de la feuille. Rechargez sa version courante.", WORKPAPER_ALREADY_EXISTS: "Une feuille existe déjà pour cette période déclarative : sélectionnez-la.",
  MAPPING_COLUMNS_INVALID: "Vérifiez les noms des colonnes du mapping dans votre fichier.", FX_REQUEST_INVALID: "Requête refusée : champs inattendus ou incomplets.", IDEMPOTENCY_KEY_REUSED: "Cette clé de commande a déjà servi pour un autre contenu.",
};
export function fiscalFailureMessage(code?: string, locator?: SourceLocator & { column?: string; value?: string }) {
  const base = code && MESSAGES[code] ? MESSAGES[code] : "L’opération a été refusée (" + (code ?? "erreur") + "). Rechargez la feuille et vérifiez ses sources, sa période et vos permissions.";
  const where = locator ? [locator.row && "ligne " + locator.row, locator.page && "page " + locator.page, locator.column && "colonne « " + locator.column + " »", locator.value && "valeur « " + locator.value + " »"].filter(Boolean).join(", ") : "";
  return where ? base + " (" + where + ")" : base;
}

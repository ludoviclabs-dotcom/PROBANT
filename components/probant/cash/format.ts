import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import type { SourceLocator } from "@/lib/workpapers/model";

const NARROW_NBSP = " ", NBSP = " ", MINUS = "−";
/** French tabular display of an exact EUR string; never parses through floating point. */
export function eur(value: Money | string | null | undefined, options: { signed?: boolean } = {}) {
  if (value === null || value === undefined) return "Non calculé";
  const raw = typeof value === "string" ? value : value.amount, negative = raw.startsWith("-"), [whole, decimals = "00"] = raw.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP);
  const zero = /^0+$/.test(whole) && /^0+$/.test(decimals);
  return (negative ? MINUS : options.signed && !zero ? "+" : "") + grouped + "," + decimals.padEnd(2, "0") + NBSP + "EUR";
}
export function plural(count: number, singular: string, pluralForm = singular + "s") { return count + NBSP + (count > 1 ? pluralForm : singular); }
export const KIND_PLURALS = { receipt_in_transit: "Remises non créditées", outstanding_payment: "Paiements non débités", other: "Autres suspens" } as const;
export const STATE_LABELS: Record<string, string> = { draft: "brouillon", ready: "prête à exécuter", executed: "exécutée", awaiting_review: "en attente de revue", changes_requested: "correction demandée", approved: "approuvée", locked: "verrouillée", superseded: "remplacée", blocked: "bloquée", failed: "en échec", not_started: "non commencée" };
export function knownLabel(amount: KnownAmount) { return amount.kind === "known" ? eur(amount.value) : amount.reason; }
export function locatorText(locator?: SourceLocator | null) {
  if (!locator) return "Document entier";
  return [locator.sheet && "feuille " + locator.sheet, locator.row && "ligne " + locator.row, locator.cell && "cellule " + locator.cell, locator.page && "page " + locator.page].filter(Boolean).join(", ") || "Document entier";
}
export function dateFr(date: string) { const [y, m, d] = date.split("-"); return d && m && y ? `${d}/${m}/${y}` : date; }
export const KIND_LABELS = { receipt_in_transit: "Remise non créditée", outstanding_payment: "Paiement non débité", other: "Autre suspens" } as const;
export const SOURCE_TYPE_LABELS = { cash_ledger: "GL de trésorerie à la clôture", cash_statement: "Relevés bancaires à la clôture", cash_erb: "État de rapprochement (ERB)", cash_settlements: "Relevés postérieurs", cash_support: "Pièces de correction" } as const;

const MESSAGES: Record<string, string> = {
  CASH_DURABLE_DISABLED: "Ce parcours doit être activé dans un environnement de recette jetable.",
  CASH_DURABLE_UNAVAILABLE: "Le service est indisponible. Réessayez la même commande.",
  SESSION_INVALID: "Votre session a expiré. Reconnectez-vous pour reprendre.",
  AUTHENTICATION_REQUIRED: "Connectez-vous pour accéder à ce dossier.",
  FORBIDDEN: "Votre identité ne dispose pas de la permission nécessaire.", WORKPAPER_FORBIDDEN: "Ce dossier n’appartient pas à votre périmètre autorisé.",
  CASH_CURRENCY_UNSUPPORTED: "Devise non gérée : les montants bancaires doivent être en EUR ; aucune conversion implicite n’est faite.",
  CASH_CURRENCY_CODE_INVALID: "La devise du compte doit être un code à trois lettres (ex. EUR, USD).",
  CASH_ITEM_SIGN_INCONSISTENT: "Signe incohérent : une remise non créditée doit être positive et un paiement non débité négatif. Vérifiez la convention de signe du mapping.",
  CASH_ACCOUNT_UNKNOWN: "Mauvaise banque : cette ligne vise une banque ou un compte absent du GL de clôture. Corrigez la source ou importez le GL complet.",
  CASH_ACCOUNT_IDENTITY_DUPLICATE: "Deux comptes du GL portent la même banque et la même référence : l’identité du compte est ambiguë.",
  CASH_STATEMENT_DUPLICATE: "Deux soldes de relevé à la clôture pour le même compte.", CASH_ERB_BALANCE_DUPLICATE: "L’ERB contient deux soldes de même nature pour ce compte.",
  CASH_CLOSING_BALANCE_DATE_REQUIRED: "Les soldes du GL, du relevé et de l’ERB doivent être datés de la clôture.",
  CASH_SUSPENSE_AFTER_CLOSING: "Un suspens de l’ERB doit être daté au plus tard de la clôture.",
  CASH_SUPPORT_OUTSIDE_POST_CLOSING: "Une pièce de correction doit être datée après la clôture et au plus tard à la date de revue.",
  CASH_CORRECTION_REFERENCE_UNKNOWN: "Une correction doit s’appuyer sur une pièce de correction importée, pas sur un mouvement bancaire.",
  CASH_SETTLEMENT_OUTSIDE_POST_CLOSING: "Les relevés postérieurs doivent être datés après la clôture et au plus tard à la date de revue.",
  CASH_NATURE_INVALID: "Nature du compte attendue : banque, caisse ou vmp.", CASH_ERB_KIND_INVALID: "Nature de ligne ERB attendue : solde_comptable, solde_banque, remise_non_creditee, paiement_non_debite ou autre_suspens.",
  CASH_KEY_INVALID_OR_DUPLICATE: "Identifiant de ligne absent ou dupliqué.", CASH_BANK_REQUIRED: "Banque absente sur une ligne.", CASH_ACCOUNT_REQUIRED: "Référence de compte absente sur une ligne.",
  CASH_SOURCES_REQUIRED: "Approuvez le GL, les relevés à la clôture et l’ERB ; relevés postérieurs et pièces de correction sont facultatifs.",
  CASH_CURRENT_SOURCES_REQUIRED: "Les sources affichées ne sont plus les sources courantes. Rechargez avant de figer.",
  CASH_NO_BANK_ACCOUNT_IN_SCOPE: "Aucun compte bancaire EUR dans le GL : rien à rapprocher sur cet écran.",
  CASH_OVERALLOCATION: "Double allocation : ce règlement ou ce suspens est déjà utilisé au-delà de son montant.",
  CASH_ALLOCATION_DUPLICATE: "Ce règlement est déjà alloué à ce suspens.", CASH_ALLOCATION_ACCOUNT_MISMATCH: "Mauvaise banque : le règlement et le suspens n’appartiennent pas au même compte.",
  CASH_ALLOCATION_SIGN_MISMATCH: "Signe incohérent : une remise s’apure par un crédit, un paiement par un débit.", CASH_ALLOCATION_ITEM_NOT_TESTED: "Ce suspens est exclu du test ou son compte est hors périmètre.",
  SETTLEMENT_OUTSIDE_DOCUMENTED_WINDOW: "Le règlement n’appartient pas à la fenêtre documentée : documentez la fenêtre avec les relevés postérieurs avant d’allouer.",
  CASH_WINDOW_EVIDENCE_INVALID: "La fenêtre doit être documentée par un relevé postérieur importé et approuvé.", POST_CLOSING_WINDOW_INVALID: "Fenêtre invalide : début après la clôture, fin au plus tard à la date de revue.", WINDOW_SOURCE_REQUIRED: "Une fenêtre documentée exige au moins un relevé postérieur.",
  CASH_CORRECTION_ACCOUNT_MISMATCH: "La pièce de correction concerne un autre compte.", CASH_CORRECTION_AND_ALLOCATION_CONFLICT: "Un suspens ne peut pas être à la fois alloué et corrigé.", CORRECTION_EVIDENCE_REQUIRED: "Correction : pièce du même compte, datée au plus tard de la revue, et motif requis.",
  CASH_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée. Rechargez puis créez une nouvelle révision.", CASH_SOURCE_HEAD_CONFLICT: "Une autre source a été approuvée entre-temps. Rechargez avant d’approuver.",
  UNRESOLVED_BLOCKING_NOTE: "Documentez le traitement des points bloquants avant l’approbation.", SELF_APPROVAL_FORBIDDEN: "Une autre identité autorisée doit approuver cette version.",
  PREPARATION_INCOMPLETE: "Une conclusion et un résultat exécuté sont nécessaires avant la soumission.", PREPARATION_EDIT_FORBIDDEN: "Cette version ne peut plus être modifiée par votre identité. Créez une révision si nécessaire.",
  WORKPAPER_TRANSITION_FORBIDDEN: "Cette action ne correspond plus à l’état de la feuille. Rechargez sa version courante.", WORKPAPER_ALREADY_EXISTS: "La feuille Trésorerie existe déjà pour cette période : rechargez.",
  MAPPING_COLUMNS_INVALID: "Vérifiez les noms des colonnes du mapping dans votre fichier.", CASH_FILE_LIMIT: "Le fichier dépasse la limite de 3 Mio de cette recette.", CASH_STATE_LIMIT: "La feuille dépasse les bornes de cette recette.",
  CASH_REQUEST_INVALID: "Requête refusée : champs inattendus ou incomplets.", IDEMPOTENCY_KEY_REUSED: "Cette clé de commande a déjà servi pour un autre contenu.",
};
export function cashFailureMessage(code?: string, locator?: SourceLocator & { column?: string; value?: string }) {
  const base = code && MESSAGES[code] ? MESSAGES[code] : "L’opération a été refusée. Rechargez la feuille et vérifiez ses sources, sa période et vos permissions.";
  const where = locator ? [locator.row && "ligne " + locator.row, locator.column && "colonne « " + locator.column + " »", locator.value && "valeur « " + locator.value + " »"].filter(Boolean).join(", ") : "";
  return where ? base + " (" + where + ")" : base;
}

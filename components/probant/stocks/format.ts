import type { ImportBatch } from "@/lib/workpapers/imports";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { ST_STATUS_KIND, type StockStatus } from "@/lib/workpapers/stock-contract";

export { dateFr, plural, STATE_LABELS, locatorLabel } from "../fiscal/format";
/** Server response of GET /api/workpapers/stocks (the browser never recomputes a quantity). */
export interface StockView {
  actorId: string; permissions: string[]; runs: WorkpaperRun[]; sourcesCurrent: Record<string, boolean>; expectedSources: string[];
  lineageCurrent: Record<string, { id: string; version: number; revision: number }>; currentVersions: Record<string, number>;
  versions: Record<string, { importId: string; documentVersionId: string; fileName: string; sha256: string; approvedAt: string; current: boolean }[]>;
  imports: (ImportBatch & { rowCount?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
}
export type Kind = (typeof ST_STATUS_KIND)[StockStatus];
export const KIND_LABELS: Record<Kind, string> = { ok: "Sans écart", quantity: "Écart de quantité", ownership: "Écart de propriété", blocked: "Bloqué", uncertain: "Non concluant", apart: "Présenté à part" };
export const KIND_ORDER: Kind[] = ["quantity", "ownership", "blocked", "uncertain", "ok", "apart"];
export const SOURCE_LABELS: Record<string, string> = { st_count: "Feuilles de comptage", st_system: "État théorique à la clôture", st_movements: "Mouvements intercalaires", st_support: "Pièces citables", st_costs: "Coûts unitaires documentés", st_ledger: "Grand livre des comptes de stocks" };
const MESSAGES: Record<string, string> = {
  ST_DURABLE_DISABLED: "Parcours Stocks durable fermé : réservé à la recette jetable (drapeau désactivé ou production).",
  ST_DURABLE_UNAVAILABLE: "Service Stocks indisponible. Aucune donnée n’a été modifiée ; réessayez.",
  ST_CURRENT_SOURCES_REQUIRED: "Les sources nommées ne sont plus les versions approuvées courantes : rechargez la feuille.",
  ST_SOURCES_REQUIRED: "Une feuille de comptage et un état théorique approuvés sont requis (au plus un journal de mouvements et un lot de pièces).",
  ST_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée ou ajoutée : créez une révision sur les sources courantes.",
  ST_SOURCE_HEAD_CONFLICT: "Une autre version de cette source a été approuvée entretemps : rechargez avant d’approuver.",
  ST_NO_OWN_STOCK_UNIT: "Aucune référence de stock propre à tester : tout est présenté à part ou sur des sites non visités.",
  ST_CITATION_SOURCE_REQUIRED: "La pièce citée doit appartenir aux sources figées de la feuille.",
  ST_CITATION_ROW_INVALID: "La ligne citée n’existe pas dans la version figée.",
  ST_CITATION_REQUIRED: "Une décision humaine doit citer une pièce figée et sa version.",
  ST_CATEGORY_INVALID: "Statut de propriété inconnu (propre, tiers, consignation_recue, consignation_deposee, transit, en_cours, exclue).",
  ST_COUNT_UNIT_MIXED: "Une même référence / site / lot est comptée dans deux unités dans la feuille : aucune conversion implicite.",
  ST_SITE_COUNT_DATE_MIXED: "Un site a deux dates de comptage dans la feuille : une seule date par site.",
  ST_SYSTEM_DATE_CLOSING_REQUIRED: "L’état théorique doit être daté de la clôture.",
  ST_SYSTEM_UNIT_DUPLICATE: "Une référence / site / lot apparaît deux fois dans l’état théorique.",
  ST_EXCLUSION_REASON_REQUIRED: "Une référence exclue doit porter son motif.",
  ST_MOVEMENT_OUTSIDE_COVERAGE: "Mouvement daté hors de la période couverte déclarée pour le journal.",
  ST_COVERAGE_INVALID: "Période couverte du journal invalide (bornes dans l’exercice et jusqu’à la date de revue).",
  ST_DIRECTION_INVALID: "Sens de mouvement inconnu (entree ou sortie).",
  ST_QUANTITY_NEGATIVE: "Quantité négative refusée : un retour se saisit comme mouvement.",
  ST_COUNT_DATE_OUTSIDE: "Date de comptage hors de l’exercice ou postérieure à la date de revue.",
  ST_COLUMN_NOT_FOUND: "Colonne nommée dans le mapping absente du fichier : corrigez le nom ou videz le champ.",
  ST_COST_METHOD_INVALID: "Méthode de coût inconnue (cmp, peps, identification_specifique, cout_standard, prix_de_detail).",
  ST_COST_DUPLICATE: "Deux coûts pour la même référence et le même lot.",
  ST_LEDGER_ACCOUNT_INVALID: "Compte du grand livre hors classe 3 (stocks et en-cours).",
  ST_LEDGER_DATE_CLOSING_REQUIRED: "Le solde du grand livre doit être daté de la clôture.",
  ST_SYSTEM_VALUE_REQUIRED: "Une ligne théorique détenue par l’entité doit porter sa valeur une fois la colonne valeur mappée.",
  ST_SYSTEM_ACCOUNT_REQUIRED: "Une ligne valorisée doit porter un compte de stock (classe 3).",
  ST_VALUE_FORMAT_INVALID: "Valeur illisible : deux décimales au plus, selon le séparateur choisi.",
  EXPLICIT_SHEET_REQUIRED: "Classeur XLSX : indiquez explicitement la feuille à lire.",
  SELF_APPROVAL_FORBIDDEN: "La revue doit être faite par une autre identité que le préparateur.",
  IDEMPOTENCY_KEY_REUSED: "Requête déjà utilisée pour un autre contenu : rechargez.",
};
export function stockFailureMessage(code: string, locator?: { row?: number; column?: string; value?: string; sheet?: string }) {
  const where = locator ? " (" + [locator.sheet ? "feuille " + locator.sheet : "", locator.row ? "ligne " + locator.row : "", locator.column ? "colonne « " + locator.column + " »" : "", locator.value ? "valeur « " + locator.value + " »" : ""].filter(Boolean).join(", ") + ")" : "";
  return (MESSAGES[code] ?? "Refus du serveur : " + code) + where;
}
export const unitLabel = (u: { reference: string; site: string; lot: string }) => u.reference + " · " + u.site + (u.lot ? " · lot " + u.lot : "");

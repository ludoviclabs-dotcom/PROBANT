import type { ImportBatch } from "@/lib/workpapers/imports";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { PV_STATUS_KIND, type ProvisionStatus } from "@/lib/workpapers/provision-contract";

export { dateFr, plural, STATE_LABELS, locatorLabel } from "../fiscal/format";
/** Server response of GET /api/workpapers/provisions (the browser never recomputes an amount, and never unmasks one). */
export interface ProvisionView {
  actorId: string; permissions: string[]; confidentialAccess: boolean; runs: WorkpaperRun[]; sourcesCurrent: Record<string, boolean>; expectedSources: string[];
  lineageCurrent: Record<string, { id: string; version: number; revision: number }>; currentVersions: Record<string, number>;
  versions: Record<string, { importId: string; documentVersionId: string; fileName: string; sha256: string; approvedAt: string; current: boolean; confidential: boolean }[]>;
  imports: (ImportBatch & { rowCount?: number; maskedRows?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
}
export type Kind = (typeof PV_STATUS_KIND)[ProvisionStatus];
export const KIND_LABELS: Record<Kind, string> = { difference: "Différence à examiner", annex: "Écart avec l’annexe", unsupported: "Justificatif manquant", uncertain: "Non concluant", ok: "Concordant", off: "Sans écriture", apart: "Hors population" };
export const KIND_ORDER: Kind[] = ["difference", "annex", "unsupported", "uncertain", "ok", "off", "apart"];
export const SOURCE_LABELS: Record<string, string> = { pv_register: "Registre des risques et engagements", pv_movements: "Mouvements de provisions", pv_estimates: "Estimations et scénarios", pv_ledger: "Grand livre (comptes 15)", pv_annex: "Annexe publiée", pv_support: "Pièces citables" };
const MESSAGES: Record<string, string> = {
  PV_DURABLE_DISABLED: "Registre Provisions durable fermé : réservé à la recette jetable (drapeau désactivé ou production).",
  PV_DURABLE_UNAVAILABLE: "Service Provisions indisponible. Aucune donnée n’a été modifiée ; réessayez.",
  PV_CURRENT_SOURCES_REQUIRED: "Les sources nommées ne sont plus les versions approuvées courantes : rechargez la feuille.",
  PV_SOURCES_REQUIRED: "Un registre et un grand livre approuvés sont requis (au plus une version courante de chaque source).",
  PV_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée ou ajoutée : créez une révision sur les sources courantes.",
  PV_SOURCE_HEAD_CONFLICT: "Une autre version de cette source a été approuvée entretemps : rechargez avant d’approuver.",
  PV_NO_EVENT_IN_EXERCISE: "Aucun événement ouvert, nouveau ou clos pendant l’exercice : rien à tester.",
  PV_CITATION_SOURCE_REQUIRED: "La pièce citée doit appartenir aux sources figées de la feuille.",
  PV_CITATION_ROW_INVALID: "La ligne citée n’existe pas dans la version figée.",
  PV_CITATION_REQUIRED: "Une décision humaine doit citer une pièce figée et sa version.",
  PV_CONFIDENTIAL_FORBIDDEN: "Original confidentiel : téléchargement réservé à une habilitation dédiée.",
  PV_TREATMENT_INVALID: "Traitement inconnu (provision, passif_eventuel, engagement_hors_bilan, passif_non_comptabilise, aucun).",
  PV_EVENT_TYPE_INVALID: "Type d’événement inconnu (litige, garantie, restructuration, fiscal, social, environnement, contrat_deficitaire, autre_risque, engagement_donne, engagement_recu).",
  PV_ACCOUNT_REQUIRED: "Une provision (ou une provision d’ouverture non nulle) doit porter un compte de provisions (15).",
  PV_ACCOUNT_INVALID: "Compte hors des comptes de provisions (15).",
  PV_PROVISION_FIELDS_REQUIRED: "Une provision indique sa clôture déclarée et sa méthode d’estimation.",
  PV_TREATMENT_PROVISION_INCONSISTENT: "Clôture de provision non nulle pour un événement non traité en provision.",
  PV_COMMITMENT_TREATMENT_INVALID: "Un montant d’engagement n’est admis que pour un engagement hors bilan.",
  PV_OBLIGATION_REQUIRED: "L’obligation doit être décrite pour chaque événement.",
  PV_AUTHOR_REQUIRED: "L’auteur de l’évaluation est requis.",
  PV_LABEL_REQUIRED: "Un libellé public de l’événement est requis (il n’est jamais masqué).",
  PV_CONFIDENTIAL_FLAG_INVALID: "Colonne de confidentialité : oui ou non.",
  PV_CLOSED_DATE_INVALID: "Date de clôture du dossier invalide (antérieure à la naissance ou postérieure à la date de revue).",
  PV_COVERAGE_EXERCISE_REQUIRED: "Le journal des mouvements doit couvrir l’exercice entier (du début à la clôture).",
  PV_MOVEMENT_KIND_INVALID: "Nature de mouvement inconnue (dotation, utilisation, reprise).",
  PV_MOVEMENT_OUTSIDE_EXERCISE: "Mouvement daté hors de l’exercice.",
  PV_MOVEMENT_AMOUNT_INVALID: "Un mouvement est un montant strictement positif ; son sens est donné par sa nature.",
  PV_MOVEMENT_ACCOUNT_MISMATCH: "Mouvement sur un autre compte que celui de son événement : reclassement non couvert par ce lot.",
  PV_EVENT_UNKNOWN: "Ligne rattachée à un événement absent du registre : complétez le registre.",
  PV_ESTIMATE_PIECE_REQUIRED: "Une estimation documentée cite sa pièce.",
  PV_ESTIMATE_RETAINED_DUPLICATE: "Deux estimations retenues pour le même événement : une seule hypothèse retenue.",
  PV_ESTIMATE_METHOD_REQUIRED: "Une estimation indique sa méthode.",
  PV_SCENARIO_REQUIRED: "Chaque estimation nomme son scénario.",
  PV_RETAINED_FLAG_INVALID: "Colonne « retenue » : oui ou non.",
  PV_LEDGER_ACCOUNT_INVALID: "Compte du grand livre hors des comptes de provisions (15).",
  PV_LEDGER_DATE_CLOSING_REQUIRED: "Le solde du grand livre doit être daté de la clôture.",
  PV_LEDGER_OPENING_REQUIRED: "Le solde d’ouverture du compte est requis (0 si aucun).",
  PV_RUBRIC_INVALID: "Rubrique d’annexe inconnue (provision, passif_eventuel, engagement_donne, engagement_recu, passif_non_comptabilise).",
  PV_AMOUNT_STATUS_INVALID: "Statut du montant publié inconnu (publie, non_chiffre, non_fourni_prejudice).",
  PV_ANNEX_AMOUNT_STATUS_INCONSISTENT: "Ligne non chiffrée ou non fournie : le montant doit valoir 0 (il est alors inconnu, jamais nul).",
  PV_PIECE_KIND_INVALID: "Nature de pièce inconnue (contrat, dossier_risque, correspondance, estimation, decision, jugement, ecriture, autre).",
  PV_AMOUNT_FORMAT_INVALID: "Montant illisible : deux décimales au plus, selon le séparateur choisi.",
  PV_AMOUNT_NEGATIVE: "Montant négatif refusé.",
  PV_COLUMN_NOT_FOUND: "Colonne nommée dans le mapping absente du fichier : corrigez le nom ou videz le champ.",
  PV_COLUMN_REQUIRED: "Colonne obligatoire non renseignée dans le mapping.",
  EXPLICIT_SHEET_REQUIRED: "Classeur XLSX : indiquez explicitement la feuille à lire.",
  SELF_APPROVAL_FORBIDDEN: "La revue doit être faite par une autre identité que le préparateur.",
  IDEMPOTENCY_KEY_REUSED: "Requête déjà utilisée pour un autre contenu : rechargez.",
};
export function provisionFailureMessage(code: string, locator?: { row?: number; column?: string; value?: string; sheet?: string }) {
  const where = locator ? " (" + [locator.sheet ? "feuille " + locator.sheet : "", locator.row ? "ligne " + locator.row : "", locator.column ? "colonne « " + locator.column + " »" : "", locator.value ? "valeur « " + locator.value + " »" : ""].filter(Boolean).join(", ") + ")" : "";
  return (MESSAGES[code] ?? "Refus du serveur : " + code) + where;
}

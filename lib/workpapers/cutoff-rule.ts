import { contractualApplicability, frenchGaapText, resolveFrenchGaap, type ApplicabilityStatus, type ContractualScopeStatus, type FrenchGaapTextId } from "@/lib/knowledge/french-gaap";

/**
 * Texte français applicable au rattachement d'un événement (Mission C11).
 *
 * Le résolveur C04 dit quel texte régit l'exercice ; pour une vente, ANC 2026-03 ne régit en outre que les contrats
 * conclus ou renouvelés après son entrée en vigueur (art. 4). Ce module ne comptabilise rien : il cite le texte et ses
 * articles, ou dit quelle information manque. La grille de cut-off (fait générateur contre clôture) reste une méthode
 * interne PROBANT ; elle n'est pas attribuée à une norme.
 */
export const CUTOFF_METHOD_TEXT = "Méthode interne PROBANT : date du fait générateur (livraison du bien, réalisation de la prestation, cause de l’avoir) comparée à la clôture, puis comparée à ce qui est comptabilisé ou régularisé. Les articles cités fondent le rattachement ; la grille n’est pas une norme.";

export type CutoffRuleStatus =
  /** Texte et articles déterminés. */
  | "resolved"
  /** ANC 2026-03 régit l'exercice, mais le contrat de vente n'est pas daté ou l'est au jour de l'entrée en vigueur. */
  | "contract_information_required"
  /** Aucune édition lue ne couvre l'exercice : les articles ne sont pas cités. */
  | "no_text_read";

export interface CutoffRule {
  status: CutoffRuleStatus;
  textId: FrenchGaapTextId | null;
  label: string | null;
  articles: string | null;
  /** Statut du texte retenu pour l'exercice, ou motif contractuel quand le texte antérieur reste applicable au contrat. */
  basis: ApplicabilityStatus | "contract_before_entry_into_force" | null;
  /** Statut d'ANC 2026-03 pour l'exercice (obligatoire, anticipé, option ouverte…). */
  anc202603: ApplicabilityStatus;
  contract: { status: ContractualScopeStatus | "not_applicable"; date: string | null; entryIntoForce: string | null };
  editions: { url: string; sha256: string | null; access: string }[];
  method: string;
  reasons: string[];
}

export interface CutoffRuleQuery {
  startDate: string; closingDate: string; flow: "purchase" | "sale";
  /** Options d'anticipation déclarées pour le dossier ; la pièce d'adoption est vérifiée ailleurs. */
  anticipated?: readonly FrenchGaapTextId[];
  /** Date de conclusion ou de dernier renouvellement du contrat de vente, si elle est sourcée. */
  contractDate?: string | null;
}

/** Textes antérieurs à ANC 2026-03 qui portent le rattachement, du plus récent au plus ancien. */
const BASELINE: FrenchGaapTextId[] = ["pcg-2026-01-01", "anc-2022-06", "pcg-2024"];
const APPLIED: ApplicabilityStatus[] = ["mandatory", "anticipation_elected", "superseded"];

function describe(textId: FrenchGaapTextId) {
  const t = frenchGaapText(textId);
  return { textId, label: t.label, articles: t.numbering.cutoff ?? null, editions: t.editions.map((e) => ({ url: e.url, sha256: e.sha256, access: e.access })) };
}

export function resolveCutoffRule(q: CutoffRuleQuery): CutoffRule {
  const resolution = resolveFrenchGaap({ startDate: q.startDate, closingDate: q.closingDate, anticipated: q.anticipated ?? [] });
  const statusOf = (id: FrenchGaapTextId) => resolution.texts.find((t) => t.textId === id)!.status;
  const anc = statusOf("anc-2026-03");
  const ancApplied = anc === "mandatory" || anc === "anticipation_elected";
  const contractDate = q.contractDate ?? null;
  const none = { textId: null, label: null, articles: null, editions: [] };
  const common = { anc202603: anc, method: CUTOFF_METHOD_TEXT };
  // Texte antérieur applicable à l'exercice, lu dans sa propre définition : la supersession par ANC 2026-03
  // efface sa numérotation de la résolution d'exercice, mais il régit encore les contrats antérieurs.
  const baselineId = BASELINE.find((id) => APPLIED.includes(statusOf(id)) && frenchGaapText(id).numbering.cutoff);
  if (statusOf("anc-2026-03") === "unknown") return { status: "no_text_read", ...none, basis: null, contract: { status: "not_applicable", date: contractDate, entryIntoForce: null }, ...common, reasons: ["Période invalide : aucun texte résolu."] };
  if (ancApplied && q.flow === "sale") {
    const scope = contractualApplicability("anc-2026-03", contractDate);
    const contract = { status: scope.status, date: contractDate, entryIntoForce: scope.entryIntoForce };
    const ancReason = anc === "mandatory" ? "ANC 2026-03 s’applique à l’exercice (ouvert à compter du 01/01/2027)." : "ANC 2026-03 appliqué par anticipation (option déclarée pour l’exercice en cours au 03/09/2026).";
    if (scope.status === "in_scope") return { status: "resolved", ...describe("anc-2026-03"), basis: anc, contract, ...common, reasons: [ancReason, scope.reason] };
    if (scope.status === "out_of_scope" && baselineId) return { status: "resolved", ...describe(baselineId), basis: "contract_before_entry_into_force", contract, ...common, reasons: [ancReason, scope.reason] };
    return { status: "contract_information_required", ...none, basis: null, contract, ...common,
      reasons: [ancReason, scope.reason, `Texte du contrat indéterminé : ANC 2026-03 (${frenchGaapText("anc-2026-03").numbering.cutoff}) ou texte antérieur (${baselineId ? frenchGaapText(baselineId).numbering.cutoff : "non lu"}).`] };
  }
  const retained = ancApplied ? "anc-2026-03" as const : resolution.numbering.cutoff?.textId;
  const contract = { status: "not_applicable" as const, date: contractDate, entryIntoForce: null };
  if (!retained) return { status: "no_text_read", ...none, basis: null, contract, ...common,
    reasons: [`Aucune édition lue ne couvre un exercice ouvert le ${q.startDate} : articles de rattachement non cités ; la grille interne reste applicable, sans fondement normatif affiché.`] };
  const reasons = [`${frenchGaapText(retained).label} : ${statusOf(retained) === "anticipation_elected" ? "appliqué par anticipation" : "applicable à l’exercice"}.`];
  if (ancApplied && q.flow === "purchase") reasons.push("Achat : le champ contractuel d’ANC 2026-03 vise les contrats de vente ; l’art. 511-3 s’applique dès l’exercice.");
  if (anc === "anticipation_available") reasons.push("ANC 2026-03 : option d’anticipation ouverte et non déclarée, texte non appliqué.");
  return { status: "resolved", ...describe(retained), basis: statusOf(retained), contract, ...common, reasons };
}

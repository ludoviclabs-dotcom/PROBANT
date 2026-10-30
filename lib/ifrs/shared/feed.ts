import type { AdjustmentBundle } from "./bundle";
import type { BundleSelection, selectionStanding } from "./selection";

/**
 * Contrat stable exposé à une présentation IFRS 18 éventuelle (L16-03 § 7, C00 § 12) : un retraitement **sélectionné et à jour** ne livre que
 * ses contributions au résultat de l'exercice et le manifeste des identités économiques qu'il couvre. Les composantes de bilan (droit d'utilisation,
 * dette, effet d'ouverture) n'en sortent jamais comme lignes de résultat. Refus :
 * - `L16_BUNDLE_NOT_SELECTED` : aucune sélection de cette version ;
 * - `L16_BUNDLE_STALE` : sélection d'une autre version, ou à réexaminer (source, règle, révision) ;
 * - `L16_BASE_UNKNOWN` : base dont les retraitements inclus sont inconnus ;
 * - `L16_BUNDLE_ALREADY_INCLUDED` : base qui inclut déjà une identité du retraitement.
 */
export interface Ifrs16ResultFeed {
  schemaVersion: "ifrs16-feed-1"; logicalId: string; bundleHash: string; period: AdjustmentBundle["period"];
  base: Pick<BundleSelection["base"], "baseKind" | "sourceRefs">; identities: string[];
  resultContributions: AdjustmentBundle["resultContributions"]; taxStatus: "not_computed";
}
export function ifrs16ResultFeed(bundle: AdjustmentBundle, selection: BundleSelection | null, standing: ReturnType<typeof selectionStanding>): Ifrs16ResultFeed {
  if (!selection || selection.logicalId !== bundle.logicalId) throw new Error("L16_BUNDLE_NOT_SELECTED");
  if (selection.bundleHash !== bundle.bundleHash || standing.status !== "current") throw new Error("L16_BUNDLE_STALE");
  const included = selection.base.includedAdjustments;
  if (included.kind === "unknown") throw new Error("L16_BASE_UNKNOWN");
  if (included.identities.some(i => bundle.identities.includes(i))) throw new Error("L16_BUNDLE_ALREADY_INCLUDED");
  return { schemaVersion: "ifrs16-feed-1", logicalId: bundle.logicalId, bundleHash: bundle.bundleHash, period: bundle.period, base: { baseKind: selection.base.baseKind, sourceRefs: selection.base.sourceRefs },
    identities: [...bundle.identities], resultContributions: bundle.resultContributions.map(c => ({ ...c })), taxStatus: "not_computed" };
}

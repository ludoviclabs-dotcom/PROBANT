import { assertScope, type WorkpaperScope, type WorkpaperState } from "@/lib/workpapers/model";
import { assertAdjustmentBundle, type AdjustmentBundle } from "./bundle";
import { assertManifestFor, type PreparationManifest } from "./manifest";

/**
 * Sélection d'un retraitement pour une base (C00 § 7). « Proposé » = feuille exécutée ; « revu » = feuille approuvée ou verrouillée ;
 * « sélectionné » = décision du journal de clôture, seul consommateur en V1 (commandes ajoutées en L16-05). Cette logique est pure :
 * le journal l'appelle dans sa transaction, avec sa version attendue et sa clé d'idempotence.
 * La sélection ne prouve pas la comptabilisation, et le verrouillage ne vaut pas « comptabilisé ».
 */
export interface BundleSelection {
  logicalId: string; runId: string; revision: number; runVersion: number; contentHash: string; bundleHash: string;
  identities: string[]; base: PreparationManifest; selectedBy: string; selectedAt: string;
}
/** Version exacte de la feuille, lue par le serveur au moment de la décision. */
export interface SheetStanding {
  runId: string; rootId: string; revision: number; version: number; state: WorkpaperState; contentHash: string;
  latestRevision: boolean; sourcesCurrent: boolean; ruleCurrent: boolean;
}
export interface SelectBundleRequest {
  scope: WorkpaperScope; period: { startDate: string; closingDate: string };
  expected: { runId: string; version: number; contentHash: string; bundleHash: string };
  bundle: unknown; manifest: unknown; sheet: SheetStanding; actorId: string; at: string;
}
export type SelectionEffect = "selected" | "replaced" | "replayed";

/** Motifs de réexamen d'une sélection : seule la lignée concernée est touchée ; une simple consultation ne périme rien. */
export function selectionStanding(selection: BundleSelection, sheet: SheetStanding | null): { status: "current" } | { status: "to_reexamine"; reasons: string[] } {
  const reasons: string[] = [];
  if (!sheet) reasons.push("feuille introuvable");
  else {
    if (!sheet.latestRevision || sheet.runId !== selection.runId) reasons.push("révision remplacée");
    if (sheet.contentHash !== selection.contentHash) reasons.push("contenu de la feuille modifié");
    if (!["approved", "locked"].includes(sheet.state)) reasons.push("feuille non revue");
    if (!sheet.sourcesCurrent) reasons.push("source remplacée ou ajoutée");
    if (!sheet.ruleCurrent) reasons.push("règle remplacée");
  }
  return reasons.length ? { status: "to_reexamine", reasons } : { status: "current" };
}

/**
 * Décide une sélection. Refus motivés :
 * - `L16_BUNDLE_INVALID`, `L16_BUNDLE_UNBALANCED` : contenu ;
 * - `WORKPAPER_SCOPE_MISMATCH` : autre dossier, autre organisation ou scénario (jamais sélectionnable pour une base réelle) ;
 * - `L16_PERIOD_MISMATCH`, `L16_BASE_UNKNOWN`, `L16_BASE_MISMATCH` : base ;
 * - `L16_BUNDLE_NOT_REVIEWED` : feuille ni approuvée ni verrouillée ;
 * - `L16_BUNDLE_STALE` : version, empreinte ou lignée différente de la version exacte, source ou règle remplacée ;
 * - `L16_BUNDLE_ALREADY_INCLUDED` : la base, ou une autre lignée sélectionnée, inclut déjà une identité de ce retraitement ;
 * - `L16_BUNDLE_CONTENT_CONFLICT` : même lignée, révision et version avec un autre contenu.
 * Une nouvelle version de la même lignée remplace la précédente ; la même sélection rejouée ne change rien et ne double aucun montant.
 */
export function decideBundleSelection(current: readonly BundleSelection[], request: SelectBundleRequest): { selections: BundleSelection[]; effect: SelectionEffect; replaced: BundleSelection | null } {
  const bundle: AdjustmentBundle = assertAdjustmentBundle(request.bundle);
  assertScope(request.scope, bundle.scope);
  if (bundle.period.startDate !== request.period.startDate || bundle.period.closingDate !== request.period.closingDate) throw new Error("L16_PERIOD_MISMATCH");
  const { sheet, expected } = request;
  if (!["approved", "locked"].includes(sheet.state) || bundle.status !== "reviewed") throw new Error("L16_BUNDLE_NOT_REVIEWED");
  if (expected.runId !== sheet.runId || expected.version !== sheet.version || expected.contentHash !== sheet.contentHash || expected.bundleHash !== bundle.bundleHash
    || bundle.runId !== sheet.runId || bundle.revision !== sheet.revision || bundle.logicalId !== "ifrs16.leases:" + sheet.rootId || bundle.contentHash !== sheet.contentHash
    || !sheet.latestRevision || !sheet.sourcesCurrent || !sheet.ruleCurrent) throw new Error("L16_BUNDLE_STALE");
  const base = assertManifestFor(request.manifest, { baseKind: bundle.expectedBase.baseKind, sourceRefs: bundle.expectedBase.sourceRefs, period: bundle.period });
  if (base.includedAdjustments.kind === "declared" && base.includedAdjustments.identities.some(x => bundle.identities.includes(x))) throw new Error("L16_BUNDLE_ALREADY_INCLUDED");
  const same = current.find(s => s.logicalId === bundle.logicalId) ?? null;
  if (same && same.runId === bundle.runId && same.bundleHash === bundle.bundleHash && same.contentHash === bundle.contentHash) return { selections: [...current], effect: "replayed", replaced: null };
  if (same && same.runId === bundle.runId && same.revision === bundle.revision && same.runVersion === bundle.runVersion) throw new Error("L16_BUNDLE_CONTENT_CONFLICT");
  if (current.some(s => s.logicalId !== bundle.logicalId && s.identities.some(x => bundle.identities.includes(x)))) throw new Error("L16_BUNDLE_ALREADY_INCLUDED");
  const selection: BundleSelection = { logicalId: bundle.logicalId, runId: bundle.runId, revision: bundle.revision, runVersion: bundle.runVersion, contentHash: bundle.contentHash,
    bundleHash: bundle.bundleHash, identities: [...bundle.identities], base, selectedBy: request.actorId, selectedAt: request.at };
  return { selections: [...current.filter(s => s.logicalId !== bundle.logicalId), selection].sort((a, b) => (a.logicalId < b.logicalId ? -1 : 1)), effect: same ? "replaced" : "selected", replaced: same };
}

/** Retrait d'une sélection de la lignée ; les versions antérieures restent dans le journal pour preuve. */
export function withdrawBundleSelection(current: readonly BundleSelection[], logicalId: string) {
  if (!current.some(s => s.logicalId === logicalId)) throw new Error("L16_NOT_FOUND");
  return current.filter(s => s.logicalId !== logicalId);
}

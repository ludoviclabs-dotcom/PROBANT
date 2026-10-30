import type { Money } from "@/lib/canonical-model/money";
import { materializeBundle, type AdjustmentBundle } from "@/lib/ifrs/shared/bundle";
import type { PreparationManifest } from "@/lib/ifrs/shared/manifest";
import { decideBundleSelection, selectionStanding, withdrawBundleSelection, type BundleSelection, type SheetStanding } from "@/lib/ifrs/shared/selection";
import type { CitationInput, ResolvedCitation } from "./closing-contract";
import type { ClosingState, Stamp } from "./closing-journal";
import { leaseRuleCurrent } from "./lease-adapter";
import type { LeaseResult } from "./lease-review";
import { contentHash, type NoteCitation, type WorkpaperRun, type WorkpaperScope } from "./model";

/**
 * Travaux IFRS du dossier de clôture (C14, L16-05) : le journal y décide la sélection d'un retraitement revu pour une base déclarée, son retrait
 * et la comptabilisation documentée par une pièce du dossier. La section est à part des cycles : rien n'entre dans les anomalies, leurs totaux
 * ni les effets C05 ; un retraitement accepté ne vaut pas correction d'erreur ; une lignée non sélectionnée est signalée sans bloquer la clôture.
 */
export const IFRS_WORKS_NOTICE = "Travaux IFRS : section distincte des anomalies et des effets C05, jamais additionnée à leurs totaux. Un retraitement sélectionné reste une proposition de reporting pour la base déclarée : ce n'est ni une correction d'erreur ni une comptabilisation, que seule une pièce citée documente. Impôt non calculé.";
export const IFRS_PROCEDURES = { "ifrs16.leases": "Locations IFRS 16 — preneur, périmètre V1" } as const;

/** Feuille de référentiel observée par le dossier : version de tête, fraîcheur lue par la règle de la procédure, retraitement matérialisé. */
export interface FrameworkSheet { run: WorkpaperRun; standing: SheetStanding; bundle: AdjustmentBundle | null; ledgerCitation: NoteCitation | null }
export interface IfrsPosting extends Stamp { logicalId: string; bundleHash: string; text: string; citations: ResolvedCitation[] }
export interface IfrsState { selections: BundleSelection[]; postings: Record<string, IfrsPosting> }
export const postingKey = (logicalId: string, bundleHash: string) => logicalId + "|" + bundleHash;

/**
 * Observation des feuilles IFRS de l'exercice : une tête par version de feuille, la dernière révision de chaque lignée repérée, la fraîcheur
 * des sources par l'adaptateur de la procédure (null = têtes non lues : non à jour), la règle par l'adaptateur Locations. Rien n'est recalculé.
 */
export function observeFramework(runs: { run: WorkpaperRun }[], sourcesCurrent: (run: WorkpaperRun) => boolean | null): FrameworkSheet[] {
  const latest = new Map<string, number>();
  for (const { run } of runs) latest.set(run.rootId, Math.max(latest.get(run.rootId) ?? 0, run.revision));
  return runs.filter(({ run }) => run.template.id === "ifrs16.leases").map(({ run }) => {
    const result = run.result?.execution === "completed" ? run.result.result as LeaseResult : null, bundle = result?.bundle ? materializeBundle(result.bundle, run) : null;
    // The base citation is the frozen ledger source the adjustment expects, as the framing proofs name it (file name and hash from the server).
    const ref = bundle?.expectedBase.sourceRefs[0], proof = ref ? result!.contracts.flatMap(c => c.framing.lines.map(l => l.proof)).find(p => p.importId === ref.importId && p.documentVersionId === ref.documentVersionId) : undefined;
    return { run, bundle, ledgerCitation: proof ? { documentVersionId: proof.documentVersionId, importId: proof.importId, fileName: proof.fileName, sha256: proof.sha256 } : null,
      standing: { runId: run.id, rootId: run.rootId, revision: run.revision, version: run.version, state: run.state, contentHash: contentHash(run), latestRevision: latest.get(run.rootId) === run.revision,
        sourcesCurrent: sourcesCurrent(run) === true, ruleCurrent: leaseRuleCurrent(run) } };
  });
}

type SelectCommand = { rootId: string; runId: string; version: number; contentHash: string; bundleHash: string; base: { includedAdjustments: PreparationManifest["includedAdjustments"]; limits: string } };
/**
 * Sélection décidée par le journal, sur la version exacte lue par le navigateur. Le manifeste de la base est complété par le serveur : nature et
 * sources attendues par le retraitement, exercice, auteur, date et pièce citée viennent de la feuille et de la session, jamais du corps de la requête.
 */
export function decideIfrsSelection(s: ClosingState, command: SelectCommand, ctx: { actorId: string; at: string; scope: WorkpaperScope; sheets: FrameworkSheet[] }) {
  const sheet = ctx.sheets.find(x => x.run.rootId === command.rootId && x.run.id === command.runId);
  if (!sheet) throw new Error("L16_NOT_FOUND");
  if (!sheet.bundle) throw new Error("L16_BUNDLE_NOT_REVIEWED");
  if (!sheet.ledgerCitation) throw new Error("L16_BASE_UNKNOWN");
  const manifest = { baseKind: sheet.bundle.expectedBase.baseKind, sourceRefs: sheet.bundle.expectedBase.sourceRefs, period: { startDate: s.opened!.period.startDate, closingDate: s.opened!.period.closingDate },
    includedAdjustments: command.base.includedAdjustments, declaredBy: ctx.actorId, declaredAt: ctx.at, limits: command.base.limits, citation: sheet.ledgerCitation };
  const decided = decideBundleSelection(s.ifrs.selections, { scope: ctx.scope, period: manifest.period, expected: { runId: command.runId, version: command.version, contentHash: command.contentHash, bundleHash: command.bundleHash },
    bundle: sheet.bundle, manifest, sheet: sheet.standing, actorId: ctx.actorId, at: ctx.at });
  return { selection: decided.selections.find(x => x.logicalId === sheet.bundle!.logicalId)!, effect: decided.effect, replaced: decided.replaced ? { runId: decided.replaced.runId, bundleHash: decided.replaced.bundleHash } : null };
}
export function decideIfrsWithdrawal(s: ClosingState, command: { rootId: string; runId: string; bundleHash: string }) {
  const logicalId = "ifrs16.leases:" + command.rootId;
  withdrawBundleSelection(s.ifrs.selections, logicalId, { runId: command.runId, bundleHash: command.bundleHash });
  return { logicalId, runId: command.runId, bundleHash: command.bundleHash };
}
/** Comptabilisation documentée : une pièce du dossier pour la version sélectionnée ; la sélection seule ne la prouve pas. */
export function decideIfrsPosting(s: ClosingState, command: { rootId: string; bundleHash: string; text: string; citations: CitationInput[] }, resolve: (c: CitationInput) => ResolvedCitation) {
  const logicalId = "ifrs16.leases:" + command.rootId, selected = s.ifrs.selections.find(x => x.logicalId === logicalId);
  if (!selected) throw new Error("L16_NOT_FOUND");
  if (selected.bundleHash !== command.bundleHash) throw new Error("L16_BUNDLE_STALE");
  return { logicalId, bundleHash: command.bundleHash, text: command.text, citations: command.citations.map(resolve) };
}

export interface IfrsLineage {
  procedure: keyof typeof IFRS_PROCEDURES; label: string; rootId: string; logicalId: string; runId: string; revision: number; version: number; state: string; contentHash: string;
  sourcesCurrent: boolean; ruleCurrent: boolean; outcome: string | null;
  bundle: null | { status: AdjustmentBundle["status"]; bundleHash: string; contracts: number; lines: number; debit: Money; credit: Money; taxStatus: "not_computed" };
  selection: { status: "non_selectionne" | "selectionne" | "a_reexaminer"; reasons: string[]; runId: string | null; revision: number | null; runVersion: number | null; bundleHash: string | null; by: string | null; at: string | null;
    base: null | { baseKind: string; included: string; limits: string; citation: string } };
  posting: { status: "non_documentee" | "documentee"; text: string | null; by: string | null; at: string | null; citations: string[] };
  /** Lignée revue sans sélection : signalée pour décision, jamais un bloqueur de la clôture des cycles. */
  toDecide: boolean;
  previous: { runId: string; revision: number; version: number; state: string }[];
}
export interface IfrsWorks {
  notice: string; lineages: IfrsLineage[];
  /** Sélections dont la lignée n'est plus observée : conservées et listées, à retirer. */
  orphanSelections: { logicalId: string; runId: string; bundleHash: string; by: string; at: string }[];
  denominators: { lineages: number; reviewed: number; selected: number; toReexamine: number; postingsDocumented: number };
}

/** Section « Travaux IFRS » : par lignée, version de tête, retraitement, sélection et sa fraîcheur, comptabilisation documentée ou non. */
export function projectIfrsWorks(sheets: FrameworkSheet[], s: ClosingState): IfrsWorks {
  const byRoot = new Map<string, FrameworkSheet[]>();
  for (const sheet of sheets) byRoot.set(sheet.run.rootId, [...(byRoot.get(sheet.run.rootId) ?? []), sheet]);
  const lineages: IfrsLineage[] = [...byRoot.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([rootId, all]) => {
    const ordered = [...all].sort((a, b) => b.run.revision - a.run.revision), head = ordered[0], run = head.run, logicalId = "ifrs16.leases:" + rootId;
    const result = run.result?.execution === "completed" ? run.result.result as LeaseResult : null, selected = s.ifrs.selections.find(x => x.logicalId === logicalId) ?? null;
    const standing = selected ? selectionStanding(selected, all.find(x => x.run.id === selected.runId)?.standing ?? null) : null;
    const posting = selected ? s.ifrs.postings[postingKey(logicalId, selected.bundleHash)] ?? null : null;
    const reviewed = ["approved", "locked"].includes(run.state) && head.standing.sourcesCurrent && head.standing.ruleCurrent && !!head.bundle;
    return { procedure: "ifrs16.leases", label: IFRS_PROCEDURES["ifrs16.leases"], rootId, logicalId, runId: run.id, revision: run.revision, version: run.version, state: run.state, contentHash: head.standing.contentHash,
      sourcesCurrent: head.standing.sourcesCurrent, ruleCurrent: head.standing.ruleCurrent, outcome: result?.outcome ?? null,
      bundle: head.bundle && result?.bundleTotals ? { status: head.bundle.status, bundleHash: head.bundle.bundleHash, contracts: new Set(head.bundle.lines.map(l => l.contractId)).size, lines: head.bundle.lines.length,
        debit: result.bundleTotals.debit, credit: result.bundleTotals.credit, taxStatus: "not_computed" } : null,
      selection: selected ? { status: standing?.status === "current" ? "selectionne" : "a_reexaminer", reasons: standing?.status === "to_reexamine" ? standing.reasons : [], runId: selected.runId, revision: selected.revision,
        runVersion: selected.runVersion, bundleHash: selected.bundleHash, by: selected.selectedBy, at: selected.selectedAt,
        base: { baseKind: selected.base.baseKind, included: selected.base.includedAdjustments.kind === "declared" ? (selected.base.includedAdjustments.identities.length ? selected.base.includedAdjustments.identities.length + " identité(s) déjà incluse(s) déclarée(s)" : "aucun retraitement IFRS 16 déjà inclus, déclaré") : "inconnu",
          limits: selected.base.limits, citation: selected.base.citation.fileName + " · " + selected.base.citation.sha256.slice(0, 12) } }
        : { status: "non_selectionne", reasons: [], runId: null, revision: null, runVersion: null, bundleHash: null, by: null, at: null, base: null },
      posting: posting ? { status: "documentee", text: posting.text, by: posting.by, at: posting.at, citations: posting.citations.map(c => c.fileName + " v" + c.version) } : { status: "non_documentee", text: null, by: null, at: null, citations: [] },
      toDecide: reviewed && !selected, previous: ordered.slice(1).map(x => ({ runId: x.run.id, revision: x.run.revision, version: x.run.version, state: x.run.state })) };
  });
  const observed = new Set(lineages.map(l => l.logicalId));
  return { notice: IFRS_WORKS_NOTICE, lineages,
    orphanSelections: s.ifrs.selections.filter(x => !observed.has(x.logicalId)).map(x => ({ logicalId: x.logicalId, runId: x.runId, bundleHash: x.bundleHash, by: x.selectedBy, at: x.selectedAt })),
    denominators: { lineages: lineages.length, reviewed: lineages.filter(l => ["approved", "locked"].includes(l.state)).length, selected: lineages.filter(l => l.selection.status === "selectionne").length,
      toReexamine: lineages.filter(l => l.selection.status === "a_reexaminer").length, postingsDocumented: lineages.filter(l => l.posting.status === "documentee").length } };
}

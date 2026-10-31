import type { Finding, Severity } from "@/lib/canonical-model/finding";
import { resolveProcedure, type ProcedureProposal } from "@/lib/audit/procedures";
import { SEVERITIES, emptyCounts, plural, type SeverityCounts } from "@/lib/synthese-view/common";

/**
 * File de travail des « Tests complémentaires » : quels constats appellent une réponse au risque, combien de procédures
 * le résolveur propose et combien restent à définir par le professionnel. Le périmètre (familles droit dur et
 * présomption d'audit, gravité informative exclue) et chaque procédure viennent de `lib/audit/procedures` ; cette vue
 * ne fait que compter et ordonner ce que le résolveur rend. Aucune procédure n'est inventée ici.
 */

/** Un constat appelle une réponse au risque s'il n'est ni un paramètre interne ni de gravité informative. */
export function isTestTarget(finding: Pick<Finding, "family" | "severity">): boolean {
  return finding.family !== "internal" && finding.severity !== "informatif";
}

export interface QueueItem {
  finding: Finding;
  proposal: ProcedureProposal;
}

export interface Exclusions {
  total: number;
  /** Paramètres internes, quelle que soit leur gravité. */
  internal: number;
  /** Parmi les paramètres internes, ceux qui sont aussi de gravité informative. */
  internalInformative: number;
  /** Constats informatifs d'une autre famille (droit dur ou présomption). */
  informativeOnly: number;
}

export interface WorkQueue {
  /** Constats du dossier, toutes familles et gravités. */
  total: number;
  /** Constats qui appellent une réponse, dans l'ordre du snapshot. */
  items: QueueItem[];
  excluded: Exclusions;
  resolved: number;
  toDefine: number;
  bySeverity: SeverityCounts;
}

export function buildWorkQueue(findings: readonly Finding[]): WorkQueue {
  const items = findings.filter(isTestTarget).map((finding) => ({ finding, proposal: resolveProcedure(finding) }));
  const internal = findings.filter((f) => f.family === "internal");
  const bySeverity = emptyCounts();
  for (const { finding } of items) bySeverity[finding.severity] += 1;
  return {
    total: findings.length,
    items,
    excluded: {
      total: findings.length - items.length,
      internal: internal.length,
      internalInformative: internal.filter((f) => f.severity === "informatif").length,
      informativeOnly: findings.filter((f) => f.family !== "internal" && f.severity === "informatif").length,
    },
    resolved: items.filter((i) => i.proposal.status === "resolved").length,
    toDefine: items.filter((i) => i.proposal.status === "to_define").length,
    bySeverity,
  };
}

/** « 4 exclus : 4 paramètres internes, dont 2 informatifs » ; chaîne vide quand rien n'est exclu. */
export function exclusionSentence(excluded: Exclusions): string {
  if (excluded.total === 0) return "Aucun constat exclu.";
  const parts: string[] = [];
  if (excluded.internal > 0) {
    const head = `${excluded.internal} ${plural(excluded.internal, "paramètre interne", "paramètres internes")}`;
    parts.push(excluded.internalInformative > 0 ? `${head}, dont ${excluded.internalInformative} ${plural(excluded.internalInformative, "informatif")}` : head);
  }
  if (excluded.informativeOnly > 0) {
    parts.push(`${excluded.informativeOnly} ${plural(excluded.informativeOnly, "constat informatif", "constats informatifs")} d’une autre famille`);
  }
  return `${excluded.total} ${plural(excluded.total, "exclu")} : ${parts.join(" ; ")}`;
}

/** Gravités présentes dans la file, de la plus forte à la plus faible, avec leur nombre. */
export function severityTally(counts: SeverityCounts): { severity: Severity; count: number }[] {
  return SEVERITIES.map((severity) => ({ severity, count: counts[severity] })).filter((s) => s.count > 0);
}

export type QueueShow = "all" | "to_define";

export function filterQueue(items: readonly QueueItem[], show: QueueShow): QueueItem[] {
  return show === "to_define" ? items.filter((i) => i.proposal.status === "to_define") : [...items];
}

export interface QueueIndex {
  /** Constats analytiques, un par ligne. */
  primary: QueueItem[];
  /** Écarts du rapprochement multi-documents, regroupés sous une ligne repliable. */
  reconciliation: QueueItem[];
  reconciliationBySeverity: { severity: Severity; count: number }[];
}

/**
 * Index de lecture : les écarts du rapprochement (souvent nombreux et de même procédure) sont regroupés sous une ligne
 * qui se déplie ; les autres constats gardent chacun leur ligne, dans l'ordre du snapshot.
 */
export function buildQueueIndex(items: readonly QueueItem[]): QueueIndex {
  const reconciliation = items.filter((i) => i.finding.origine === "rapprochement");
  const counts = emptyCounts();
  for (const { finding } of reconciliation) counts[finding.severity] += 1;
  return {
    primary: items.filter((i) => i.finding.origine !== "rapprochement"),
    reconciliation,
    reconciliationBySeverity: severityTally(counts),
  };
}

/**
 * Constat sélectionné après un changement de filtre : la sélection est gardée si elle reste visible, sinon le premier
 * constat de la liste filtrée est retenu (aucun, si la liste est vide).
 */
export function keepSelection(items: readonly QueueItem[], selectedId: string | null): string | null {
  if (selectedId && items.some((i) => i.finding.id === selectedId)) return selectedId;
  return items[0]?.finding.id ?? null;
}

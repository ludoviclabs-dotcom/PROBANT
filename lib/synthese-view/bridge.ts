import type { Finding, Severity } from "@/lib/canonical-model/finding";
import { MINUS, formatEuroCents } from "@/lib/format/fr";
import { effectStageLabel } from "@/lib/synthesis/effect-labels";
import type { ExposureClusterView, ExposureDimension } from "@/lib/synthesis/types";
import type { WaterfallStep } from "@/lib/visualization/types";
import { SEVERITIES, plural } from "./common";
import { REVIEW_WORD, type ReviewStage } from "./review";

/**
 * Pont d'exposition. Les étapes viennent de `datasets.waterfall.steps` : un pont par poste et par sens
 * (détecté → … → anomalies non corrigées), puis l'effet sur le résultat (signé → impôt → net). Chaque pont est
 * réconcilié au centime par le moteur ; ici on ne fait que les situer sur une échelle, SANS jamais additionner
 * deux ponts. Un montant inconnu (impôt, net sans taux ni qualification) reste inconnu : il n'a pas de barre.
 */

export type BridgeTone =
  | "detected"
  | "repeats"
  | "superseded"
  | "undetermined"
  | "dismissed"
  | "pending"
  | "corrected"
  | "initial"
  | "uncorrected"
  | "effect"
  | "tax"
  | "net";

export interface BridgeColumn {
  id: string;
  label: string;
  kind: WaterfallStep["kind"];
  tone: BridgeTone;
  /** Montant signé de l'étape, en centimes ; null = inconnu. */
  amountCents: number | null;
  /** Bornes du segment dessiné (centimes cumulés). */
  from: number;
  to: number;
  note?: string;
}

export interface BridgeGroup {
  group: string;
  columns: BridgeColumn[];
  lo: number;
  hi: number;
  ticks: { value: number; label: string }[];
}

function toneOf(id: string): BridgeTone {
  if (id === "tax") return "tax";
  if (id === "net") return "net";
  if (id === "uncorrected-resultat") return "effect";
  const suffix = id.slice(id.lastIndexOf("-") + 1);
  switch (suffix) {
    case "detected":
    case "repeats":
    case "superseded":
    case "undetermined":
    case "dismissed":
    case "initial":
    case "pending":
    case "corrected":
    case "uncorrected":
      return suffix;
    default:
      return "detected";
  }
}

/** Montant compact pour l'axe : « −200 k€ », « 1,2 M€ », « 0 € ». */
export function compactEuros(cents: number): string {
  const abs = Math.abs(cents) / 100;
  const sign = cents < 0 ? MINUS : "";
  const trim = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} M€`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)} k€`;
  return `${sign}${trim(abs)} €`;
}

/** Graduations « rondes » (1, 2, 5 × 10ⁿ) couvrant [lo, hi] ; toujours le zéro quand il est dans l'intervalle. */
export function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [0];
  const raw = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v));
  return ticks;
}

export function buildBridgeGroups(steps: readonly WaterfallStep[]): BridgeGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, WaterfallStep[]>();
  for (const step of steps) {
    const key = step.group ?? "";
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(step);
  }

  return order.map((group) => {
    let level = 0;
    const columns = byGroup.get(group)!.map((step): BridgeColumn => {
      const amount = step.amountCents;
      let from: number;
      let to: number;
      if (step.kind === "start") {
        from = 0;
        to = amount ?? 0;
        level = to;
      } else if (step.kind === "delta") {
        from = level;
        to = level + (amount ?? 0);
        if (amount !== null) level = to;
      } else {
        from = 0;
        to = amount ?? 0;
        if (amount !== null) level = amount;
      }
      return { id: step.id, label: step.label, kind: step.kind, tone: toneOf(step.id), amountCents: amount, from, to, note: step.note };
    });
    const values = [0, ...columns.flatMap((c) => [c.from, c.to])];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    return { group, columns, lo, hi, ticks: niceTicks(lo, hi).map((value) => ({ value, label: value === 0 ? "0 €" : compactEuros(value) })) };
  });
}

/* ── Effets chiffrés (annotation marginale) ─────────────────────────────── */

export interface EffectRow {
  id: string;
  findingIds: string[];
  title: string;
  severity: Severity;
  /** Montant signé retenu ; null si le groupe est indéterminé (aucune somme, bornes seulement). */
  signedCents: number | null;
  bounds: { minCents: number; maxCents: number } | null;
  stage: ReviewStage | null;
  indeterminate: boolean;
  status: string;
}

export function buildEffectRows(clusters: readonly ExposureClusterView[], findings: readonly Finding[]): EffectRow[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const strongest = (ids: readonly string[]): Severity => {
    const severities = ids.map((id) => byId.get(id)?.severity).filter((s): s is Severity => Boolean(s));
    return SEVERITIES.find((s) => severities.includes(s)) ?? "informatif";
  };
  const rows = clusters.map((cluster): EffectRow => {
    const determined = cluster.status === "determined" && cluster.retainedCents !== null;
    const head = byId.get(cluster.retainedFindingId ?? cluster.findingIds[0]);
    const stage = determined ? cluster.reviewStage : null;
    return {
      id: determined && cluster.retainedFindingId ? cluster.retainedFindingId : cluster.findingIds.join(" / "),
      findingIds: [...cluster.findingIds],
      title: head?.titre ?? cluster.findingIds.join(", "),
      severity: strongest(cluster.findingIds),
      signedCents: determined ? (cluster.direction === "decrease" ? -(cluster.retainedCents as number) : (cluster.retainedCents as number)) : null,
      bounds: determined ? null : cluster.boundsCents,
      stage,
      indeterminate: !determined,
      status: determined ? REVIEW_WORD[stage ?? "pending"] : "agrégation indéterminée",
    };
  });
  const weight = (r: EffectRow) => Math.abs(r.signedCents ?? r.bounds?.maxCents ?? 0);
  return rows.sort((a, b) => weight(b) - weight(a));
}

/** Titre-phrase du pont : ce que les constats portent, par poste et sens, et où en est l'arbitrage. */
export function bridgeTitle(exposure: Pick<ExposureDimension, "stages" | "clusters">): string {
  if (exposure.clusters.length === 0) return "Aucun constat ne porte d’effet financier explicite.";
  const n = exposure.clusters.length;
  const stages = exposure.stages.filter((s) => s.initialCents > 0 || s.detectedCents > 0).map((s) => `${effectStageLabel(s)} ${formatEuroCents(s.detectedCents)}`);
  const decided = exposure.clusters.filter((c) => c.status === "determined" && c.reviewStage !== "pending").length;
  const open = exposure.clusters.filter((c) => c.status !== "determined").length;
  const progress = decided === 0 ? "Aucun n’est encore arbitré." : `${decided} ${plural(decided, "arbitré", "arbitrés")} sur ${n}.`;
  return `${n} ${plural(n, "effet chiffré", "effets chiffrés")} : ${stages.join(", ")}. ${progress}${open ? ` ${open} ${plural(open, "groupe reste indéterminé", "groupes restent indéterminés")}.` : ""}`;
}

/**
 * Exposition financière — identité économique, versions, empreintes, agrégation (C05).
 *
 * Principe fondateur : un constat ne contribue à l'exposition QUE s'il porte un
 * `financialEffect` explicite. Un écart mesuré contre un seuil (EUR, %, jours) n'est
 * jamais présumé être un impact comptable : il reste un signal.
 *
 * Trois objets distincts :
 *   - IDENTITÉ ÉCONOMIQUE : le sous-jacent décrit (document, écritures, période, poste,
 *     assertion, cause, sens) — ou l'identité explicite portée par l'effet ;
 *   - VERSION D'ÉVALUATION : une évaluation successive du même sous-jacent, démontrée
 *     par `supersedesFindingId` ;
 *   - EMPREINTE DE CONTENU : identité + montant + base + taux + version.
 *
 * Pipeline (aucune suppression silencieuse, détail conservé) :
 *   1. RÉPÉTITIONS EXACTES — même identité ET même empreinte : comptées une fois ;
 *   2. MÊME IDENTITÉ, CONTENUS DISTINCTS — succession de versions démontrée : dernière
 *      version retenue ; sinon CONFLIT : agrégation indéterminée (bornes), revue requise ;
 *   3. CHEVAUCHEMENT d'identités distinctes (même poste, même période, même document,
 *      écritures partiellement communes) sans allocation fiable : INDÉTERMINÉ, bornes
 *      [plus grand membre, somme des membres], détail conservé. Le maximum n'est jamais
 *      présenté comme une somme comptable ;
 *   4. SENS OPPOSÉS dans un même groupe : aucune compensation, indéterminé.
 *
 * Les agrégats déterminés sont tenus par poste et par sens ; ils ne sont jamais
 * additionnés entre actif, passif et résultat.
 *
 * PROJECTION PARTAGÉE (C05) : `projectExposure` est l'unique calcul des effets. La Synthèse,
 * la cartographie des risques, la revue par cloison et les exports le lisent ; un périmètre
 * (cycle, silo, cloison) se lit par `restrictExposure`, sans recalcul ni moteur parallèle.
 */

import type { DossierSnapshot } from "@/lib/canonical-model";
import type { Finding, FinancialEffect } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { statusAfterReviewEvents } from "@/lib/dossier/review";
import { applyRatePct, assertCents, sumCents } from "./money";
import { canonicalCompare, stableHash } from "./canonical";
import type {
  AggregationPolicy,
  AmountStatus,
  EffectDirection,
  EffectReviewStage,
  EffectStage,
  EffectTarget,
  ExposureClusterMember,
  ExposureClusterView,
  ExposureDimension,
  NetEffectByTarget,
  TaxEffectBlock,
} from "./types";

/** Statuts de revue par étape (alignés sur lib/dossier/review). */
export const DISMISSED_REVIEW = new Set(["ecarte", "dismissed", "superseded"]);
export const CORRECTED_REVIEW = new Set(["corrige", "corrected"]);
export const PROPOSED_REVIEW = new Set(["valide", "confirmed"]);
/** Statuts de revue qui ferment un constat (partagé avec le moteur et le registre des cycles). */
export const CLOSED_REVIEW = new Set([
  "valide", "ecarte", "corrige", "confirmed", "dismissed", "corrected", "superseded",
]);

/** Étape de revue d'un statut : écarté, corrigé (comptabilisé), proposé (validé), sinon en attente. */
export function reviewStageOf(status: string): EffectReviewStage {
  if (DISMISSED_REVIEW.has(status)) return "dismissed";
  if (CORRECTED_REVIEW.has(status)) return "corrected";
  if (PROPOSED_REVIEW.has(status)) return "proposed";
  return "pending";
}

export const AGGREGATION_POLICY: AggregationPolicy = {
  policyId: "probant-exposure-aggregation",
  version: "2.1.0",
  exactRepeatRule: "count_once",
  sameIdentityDistinctContentRule: "version_chain_or_conflict",
  overlapRule: "indeterminate_with_bounds",
  oppositeDirectionsRule: "no_netting_indeterminate",
};

/** Un effet rattaché à son constat porteur, prêt pour la déduplication. */
export interface EffectRecord {
  findingId: string;
  cloison: CloisonId;
  /** Empreinte du document source (fingerprint du dossier). */
  sourceDocument: string;
  /** Identifiants d'écritures/pièces, triés, dédupliqués. */
  entryIds: string[];
  effect: FinancialEffect;
  /** Statut de revue du constat porteur (dernier événement, sinon statut porté) ; sert à réconcilier les répétitions exactes. */
  reviewStatus: string;
  /** Identité économique. */
  identity: string;
  /** Empreinte de contenu. */
  contentFingerprint: string;
}

/**
 * Signal mesuré en EUR SANS effet explicite : l'écart au seuil n'est pas un impact comptable. Il peut
 * peser sur la priorité qualitative (risques), jamais sur un montant : son effet comptable reste inconnu.
 */
export function isEurSignalWithoutEffect(f: Finding): boolean {
  return !f.financialEffect && f.mesure.unite === "EUR" && f.mesure.constate !== f.mesure.seuil;
}

/** Identité économique : explicite si l'effet la porte, sinon dérivée des attributs du sous-jacent. */
export function economicIdentity(record: Pick<EffectRecord, "sourceDocument" | "entryIds" | "effect">): string {
  const e = record.effect;
  if (e.economicIdentity) return `explicit:${e.economicIdentity}`;
  return [record.sourceDocument, record.entryIds.join("+"), e.period, e.target, e.assertion, e.rootCause, e.direction].join("|");
}

/** Empreinte de contenu : identité + montant + base + taux + version. Deux empreintes égales = répétition exacte. */
export function contentFingerprint(record: Pick<EffectRecord, "sourceDocument" | "entryIds" | "effect">): string {
  const e = record.effect;
  return stableHash({
    identity: economicIdentity(record),
    amountCents: e.amountCents,
    direction: e.direction,
    basis: e.basis,
    taxRatePct: e.taxRatePct ?? null,
    taxQualification: e.taxQualification ?? null,
    evaluationVersion: e.evaluationVersion ?? null,
  });
}

/** Construit les EffectRecords d'un jeu de constats (tri stable par id). */
export function collectEffects(
  findings: Finding[],
  sourceDocument: string,
  statusOf?: ReadonlyMap<string, string>,
): { records: EffectRecord[]; withoutEffect: string[] } {
  const records: EffectRecord[] = [];
  const withoutEffect: string[] = [];

  for (const f of [...findings].sort((a, b) => canonicalCompare(a.id, b.id))) {
    if (!f.financialEffect) {
      withoutEffect.push(f.id);
      continue;
    }
    assertCents(f.financialEffect.amountCents, `financialEffect de ${f.id}`);
    if (f.financialEffect.amountCents < 0) {
      throw new Error(`financialEffect de ${f.id} : amountCents doit être ≥ 0 (le sens est porté par direction)`);
    }
    if (f.financialEffect.correction) {
      assertCents(f.financialEffect.correction.amountCents, `correction de ${f.id}`);
      if (f.financialEffect.correction.amountCents < 0 || f.financialEffect.correction.amountCents > f.financialEffect.amountCents) {
        throw new Error(`correction de ${f.id} : montant attendu entre 0 et l'effet (${f.financialEffect.amountCents})`);
      }
    }
    const entryIds = [...new Set(f.lignesSource.map((l) => String(l)))].sort();
    const base = { findingId: f.id, cloison: f.cloison, sourceDocument, entryIds, effect: f.financialEffect, reviewStatus: statusOf?.get(f.id) ?? f.statutRevue ?? "en_attente" };
    records.push({ ...base, identity: economicIdentity(base), contentFingerprint: contentFingerprint(base) });
  }

  return { records, withoutEffect };
}

/** Deux identités distinctes se chevauchent-elles matériellement ? */
function overlaps(a: EffectRecord, b: EffectRecord): boolean {
  if (a.effect.target !== b.effect.target) return false;
  if (a.effect.period !== b.effect.period) return false;
  if (a.sourceDocument !== b.sourceDocument) return false;
  const setB = new Set(b.entryIds);
  return a.entryIds.some((id) => setB.has(id));
}

/** Nœud du graphe de chevauchement : une identité, avec son représentant ou son conflit. */
interface IdentityNode {
  identity: string;
  target: EffectTarget;
  direction: EffectDirection | "mixed";
  /** Représentant retenu (version la plus récente) ; null en cas de conflit. */
  retained: EffectRecord | null;
  minCents: number;
  maxCents: number;
  members: ExposureClusterMember[];
  /** Pour le chevauchement : toutes les écritures des contenus distincts. */
  entryIds: string[];
  sourceDocument: string;
  period: string;
  conflictReason?: string;
}

export interface DeduplicationResult {
  grossCents: number;
  exactRepeatsCents: number;
  /** Montant des versions d'évaluation remplacées par une version ultérieure démontrée. */
  supersededVersionsCents: number;
  determinedCents: number;
  boundsCents: { minCents: number; maxCents: number };
  status: "determined" | "indeterminate";
  clusters: ExposureClusterView[];
  /** Contributions écartées (répétitions exactes, versions remplacées). Les conflits et chevauchements ne sont pas écartés : ils sont indéterminés. */
  excluded: { id: string; reason: string }[];
}

const member = (r: EffectRecord, role: ExposureClusterMember["role"]): ExposureClusterMember => ({
  findingId: r.findingId,
  identity: r.identity,
  contentFingerprint: r.contentFingerprint,
  amountCents: r.effect.amountCents,
  direction: r.effect.direction,
  target: r.effect.target,
  cloison: r.cloison,
  evaluationVersion: r.effect.evaluationVersion ?? null,
  role,
});

/**
 * Succession de versions démontrée : chaque contenu, sauf le premier, désigne par
 * `supersedesFindingId` son PRÉDÉCESSEUR DIRECT dans l'ordre des versions (strictement
 * croissantes). Deux branches issues d'une même version (v2 → v1 et v3 → v1) ne sont pas
 * ordonnées entre elles : la succession n'est pas démontrée, c'est un conflit.
 */
function versionChain(contents: EffectRecord[]): EffectRecord[] | null {
  const ids = new Set(contents.map((c) => c.findingId));
  const sorted = [...contents].sort((a, b) => {
    const va = a.effect.evaluationVersion ?? 0, vb = b.effect.evaluationVersion ?? 0;
    return va !== vb ? va - vb : canonicalCompare(a.findingId, b.findingId);
  });
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i], prev = sorted[i - 1];
    const vCur = cur.effect.evaluationVersion ?? 0, vPrev = prev.effect.evaluationVersion ?? 0;
    const target = cur.effect.supersedesFindingId;
    if (!target || !ids.has(target) || vCur <= vPrev || target !== prev.findingId) return null;
  }
  return sorted;
}

/** Exécute le pipeline C05. Invariant à l'ordre d'entrée (tris canoniques partout). */
export function deduplicateEffects(records: EffectRecord[]): DeduplicationResult {
  const excluded: { id: string; reason: string }[] = [];
  const grossCents = sumCents(records.map((r) => r.effect.amountCents), "exposition brute");

  // ── Étape 1 : répétitions exactes (même identité ET même empreinte) ────────
  const byIdentity = new Map<string, EffectRecord[]>();
  for (const r of [...records].sort((a, b) => canonicalCompare(a.findingId, b.findingId))) {
    byIdentity.set(r.identity, [...(byIdentity.get(r.identity) ?? []), r]);
  }
  let exactRepeatsCents = 0;
  let supersededVersionsCents = 0;
  const nodes: IdentityNode[] = [];

  for (const [identity, group] of [...byIdentity.entries()].sort(([a], [b]) => canonicalCompare(a, b))) {
    const byFingerprint = new Map<string, EffectRecord[]>();
    for (const r of group) byFingerprint.set(r.contentFingerprint, [...(byFingerprint.get(r.contentFingerprint) ?? []), r]);
    const contents: EffectRecord[] = [];
    const members: ExposureClusterMember[] = [];
    let reviewConflict: string | undefined;
    for (const [, same] of [...byFingerprint.entries()].sort(([a], [b]) => canonicalCompare(a, b))) {
      const [first, ...repeats] = same;
      contents.push(first);
      // Répétitions exactes : comptées une fois SI leurs décisions de revue concordent. Des décisions divergentes
      // (ex. l'une confirmée, l'autre écartée) ne sont jamais départagées par l'ordre des identifiants : conflit explicite.
      const statuses = new Set(same.map((r) => r.reviewStatus));
      if (statuses.size > 1) reviewConflict = `répétitions exactes (${same.map((r) => r.findingId).join(", ")}) aux décisions de revue divergentes (${[...statuses].sort().join(" / ")}) : conflit à arbitrer, aucune décision retenue par défaut`;
      for (const dup of repeats) {
        exactRepeatsCents += dup.effect.amountCents;
        excluded.push({ id: dup.findingId, reason: statuses.size > 1 ? `répétition exacte de ${first.findingId} : montant compté une fois, décision de revue en conflit` : `répétition exacte de ${first.findingId} (même identité économique et même contenu) : comptée une fois` });
        members.push(member(dup, "exact_repeat"));
      }
    }
    const sample = contents[0];
    const base = {
      identity,
      target: sample.effect.target,
      entryIds: [...new Set(contents.flatMap((c) => c.entryIds))].sort(),
      sourceDocument: sample.sourceDocument,
      period: sample.effect.period,
    };
    // ── Étape 2 : contenus distincts sous la même identité ───────────────────
    if (reviewConflict) {
      // Les répétitions gardent leur rôle (contenu identique, montant compté une fois) ; c'est la décision
      // de revue qui est en conflit : le groupe n'a aucun représentant retenu.
      for (const c of contents) members.push(member(c, "conflicting"));
      const amounts = contents.map((c) => c.effect.amountCents);
      nodes.push({ ...base, direction: new Set(contents.map((c) => c.effect.direction)).size > 1 ? "mixed" : sample.effect.direction, retained: null, minCents: Math.min(...amounts), maxCents: Math.max(...amounts), members, conflictReason: reviewConflict });
      continue;
    }
    if (contents.length === 1) {
      members.push(member(sample, "retained"));
      nodes.push({ ...base, direction: sample.effect.direction, retained: sample, minCents: sample.effect.amountCents, maxCents: sample.effect.amountCents, members });
      continue;
    }
    const chain = versionChain(contents);
    if (chain) {
      const latest = chain[chain.length - 1];
      for (const old of chain.slice(0, -1)) {
        supersededVersionsCents += old.effect.amountCents;
        excluded.push({ id: old.findingId, reason: `version d'évaluation remplacée par ${latest.findingId} (succession démontrée)` });
        members.push(member(old, "superseded"));
      }
      members.push(member(latest, "retained"));
      nodes.push({ ...base, direction: latest.effect.direction, retained: latest, minCents: latest.effect.amountCents, maxCents: latest.effect.amountCents, members });
      continue;
    }
    const directions = new Set(contents.map((c) => c.effect.direction));
    const amounts = contents.map((c) => c.effect.amountCents);
    for (const c of contents) members.push(member(c, "conflicting"));
    nodes.push({
      ...base,
      direction: directions.size > 1 ? "mixed" : sample.effect.direction,
      retained: null,
      minCents: Math.min(...amounts),
      maxCents: Math.max(...amounts),
      members,
      conflictReason: directions.size > 1
        ? "même identité économique, sens opposés : conflit, aucune compensation"
        : `même identité économique, ${contents.length} montants divergents sans succession de versions démontrée : conflit à arbitrer`,
    });
  }

  // ── Étape 3 : chevauchement d'identités distinctes → composantes connexes ──
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const root = find(p); parent.set(x, root); return root; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  for (const n of nodes) parent.set(n.identity, n.identity);
  const asRecord = (n: IdentityNode): EffectRecord => ({ findingId: "", cloison: "resultat", reviewStatus: "", sourceDocument: n.sourceDocument, entryIds: n.entryIds, effect: { amountCents: 0, direction: "increase", target: n.target, assertion: "exactitude", rootCause: "", period: n.period, basis: "measured" }, identity: n.identity, contentFingerprint: "" });
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (overlaps(asRecord(nodes[i]), asRecord(nodes[j]))) union(nodes[i].identity, nodes[j].identity);

  const components = new Map<string, IdentityNode[]>();
  for (const n of nodes) { const root = find(n.identity); components.set(root, [...(components.get(root) ?? []), n]); }

  const clusters: ExposureClusterView[] = [];
  const determinedParts: number[] = [];
  const minParts: number[] = [];
  const maxParts: number[] = [];

  for (const [, comp] of [...components.entries()].sort(([a], [b]) => canonicalCompare(a, b))) {
    const sorted = [...comp].sort((a, b) => canonicalCompare(a.identity, b.identity));
    const members = sorted.flatMap((n) => n.members).sort((a, b) => canonicalCompare(a.findingId, b.findingId));
    const directions = new Set(sorted.map((n) => n.direction));
    const direction: EffectDirection | "mixed" = directions.size === 1 ? sorted[0].direction : "mixed";
    const clusterId = stableHash(sorted.map((n) => n.identity));
    const base = { clusterId, findingIds: members.map((m) => m.findingId), identities: sorted.map((n) => n.identity), target: sorted[0].target, direction, members };
    const minCents = Math.max(...sorted.map((n) => n.minCents));
    const maxCents = sumCents(sorted.map((n) => n.maxCents), `bornes ${clusterId}`);
    minParts.push(minCents); maxParts.push(maxCents);

    const soleRetained = sorted.length === 1 ? sorted[0].retained : null;
    if (soleRetained) {
      const r = soleRetained;
      determinedParts.push(r.effect.amountCents);
      const reviewStage = reviewStageOf(r.reviewStatus);
      const correctedCents = reviewStage === "corrected" ? (r.effect.correction?.amountCents ?? r.effect.amountCents) : null;
      clusters.push({ ...base, status: "determined", retainedCents: r.effect.amountCents, boundsCents: { minCents, maxCents }, retainedFindingId: r.findingId, reviewStage, correctedCents });
      continue;
    }
    if (sorted.length === 1) {
      clusters.push({ ...base, status: "conflict", retainedCents: null, boundsCents: { minCents, maxCents }, retainedFindingId: null, reviewStage: null, correctedCents: null, reason: sorted[0].conflictReason, members: members.map((m) => ({ ...m })) });
      continue;
    }
    const reason = direction === "mixed"
      ? "sens opposés sur des écritures partiellement communes : aucune compensation, agrégation indéterminée"
      : "écritures partiellement communes entre identités distinctes sans allocation fiable du montant par ligne : ni le maximum ni la somme ne décrit l'effet unique, agrégation indéterminée";
    clusters.push({
      ...base,
      status: "indeterminate",
      retainedCents: null,
      boundsCents: { minCents, maxCents },
      retainedFindingId: null,
      reviewStage: null,
      correctedCents: null,
      reason: sorted.some((n) => n.conflictReason) ? `${reason} ; un membre est lui-même en conflit` : reason,
      members: members.map((m) => (m.role === "retained" ? { ...m, role: "overlapping" } : m)),
    });
  }

  const determinedCents = sumCents(determinedParts, "exposition déterminée");
  return {
    grossCents,
    exactRepeatsCents,
    supersededVersionsCents,
    determinedCents,
    boundsCents: { minCents: sumCents(minParts, "borne basse"), maxCents: sumCents(maxParts, "borne haute") },
    status: clusters.every((c) => c.status === "determined") ? "determined" : "indeterminate",
    clusters,
    excluded,
  };
}

/* ── Pont par poste et sens ───────────────────────────────────────────────── */

const emptyStage = (target: EffectTarget, direction: EffectDirection): EffectStage => ({
  target, direction,
  detectedCents: 0, exactRepeatsCents: 0, supersededCents: 0, undeterminedCents: 0, determinedCents: 0, dismissedCents: 0,
  initialCents: 0, pendingCents: 0, proposedCents: 0, correctedCents: 0, residualCents: 0,
  indeterminateClusterIds: [],
});

/**
 * Pont par poste et sens d'un ensemble de groupes, lu membre par membre (rôle) puis groupe par groupe
 * (étape de revue du représentant). Même fonction pour le dossier entier et pour un périmètre : un
 * périmètre ne recalcule rien, il ne fait que choisir des groupes.
 */
export function summarizeStages(clusters: readonly ExposureClusterView[]): EffectStage[] {
  const map = new Map<string, EffectStage>();
  const at = (target: EffectTarget, direction: EffectDirection) => {
    const key = `${target}|${direction}`;
    let st = map.get(key);
    if (!st) map.set(key, (st = emptyStage(target, direction)));
    return st;
  };
  for (const c of clusters) {
    for (const m of c.members) {
      const st = at(m.target, m.direction);
      st.detectedCents += m.amountCents;
      if (m.role === "exact_repeat") st.exactRepeatsCents += m.amountCents;
      else if (m.role === "superseded") st.supersededCents += m.amountCents;
      else if (m.role === "retained") st.determinedCents += m.amountCents;
      else {
        st.undeterminedCents += m.amountCents;
        if (!st.indeterminateClusterIds.includes(c.clusterId)) st.indeterminateClusterIds.push(c.clusterId);
      }
    }
    if (c.status !== "determined" || c.retainedFindingId === null || c.retainedCents === null) continue;
    const retained = c.members.find((m) => m.findingId === c.retainedFindingId && m.role === "retained")!;
    const st = at(retained.target, retained.direction);
    const amount = c.retainedCents;
    if (c.reviewStage === "dismissed") { st.dismissedCents += amount; continue; }
    st.initialCents += amount;
    if (c.reviewStage === "corrected") {
      const corrected = c.correctedCents ?? amount;
      st.correctedCents += corrected;
      st.residualCents += amount - corrected;
    } else if (c.reviewStage === "proposed") st.proposedCents += amount;
    else st.pendingCents += amount;
  }
  for (const st of map.values()) st.indeterminateClusterIds.sort(canonicalCompare);
  return [...map.values()].sort((a, b) => canonicalCompare(`${a.target}|${a.direction}`, `${b.target}|${b.direction}`));
}

/** Lecture d'un périmètre (cycle, silo, cloison) dans la projection partagée. */
export interface ScopedExposure {
  /** Pont par poste et sens des groupes touchant le périmètre (chaque groupe compté une fois). */
  stages: EffectStage[];
  /** Groupes en conflit ou à chevauchement touchant le périmètre : aucun montant retenu, bornes conservées. */
  indeterminateClusters: ExposureClusterView[];
  /** Tous les groupes touchant le périmètre. */
  clusters: ExposureClusterView[];
}

/**
 * Restreint la projection aux groupes dont au moins un membre appartient au périmètre. Un groupe
 * commun à deux périmètres figure dans chacun : les sous-totaux de périmètres ne s'additionnent pas,
 * seul le dossier entier est dédupliqué globalement.
 */
export function restrictExposure(exposure: Pick<ExposureDimension, "clusters">, findingIds: Iterable<string>): ScopedExposure {
  const ids = new Set(findingIds);
  const clusters = exposure.clusters.filter((c) => c.findingIds.some((id) => ids.has(id)));
  return {
    stages: summarizeStages(clusters),
    indeterminateClusters: clusters.filter((c) => c.status !== "determined"),
    clusters,
  };
}

/* ── Projection complète : déduplication, étapes, fiscalité, net ─────────── */

/** Effet d'ajustement soumis à l'incidence fiscale : proposé, ou résiduel après correction partielle. */
export interface EffectAdjustment {
  findingId: string;
  target: EffectTarget;
  signedCents: number;
  proposed: boolean;
}

export interface ExposureProjection {
  exposure: ExposureDimension;
  records: EffectRecord[];
  dedup: DeduplicationResult;
  adjustments: EffectAdjustment[];
  taxKnown: { findingId: string; target: EffectTarget; taxCents: number }[];
  taxUnknown: { findingId: string; reason: string }[];
}

const signed = (cents: number, direction: EffectDirection) => (direction === "decrease" ? -cents : cents);

/**
 * Projection unique des effets financiers explicites (C05). `statusOf` : statut de revue de chaque
 * constat (dernier événement, sinon statut porté). Invariante à l'ordre d'entrée.
 */
export function projectExposure(
  findings: Finding[],
  sourceDocument: string,
  statusOf?: ReadonlyMap<string, string>,
): ExposureProjection {
  const { records, withoutEffect } = collectEffects(findings, sourceDocument, statusOf);
  const dedup = deduplicateEffects(records);
  const recordOf = new Map(records.map((r) => [r.findingId, r]));
  const stages = summarizeStages(dedup.clusters);

  const reviewedParts: number[] = [];
  const dismissedParts: number[] = [];
  const pendingParts: number[] = [];
  const adjustments: EffectAdjustment[] = [];
  for (const cluster of dedup.clusters) {
    if (cluster.status !== "determined" || cluster.retainedFindingId === null || cluster.retainedCents === null) continue;
    const r = recordOf.get(cluster.retainedFindingId)!;
    const amount = cluster.retainedCents;
    if (cluster.findingIds.every((id) => CLOSED_REVIEW.has(recordOf.get(id)?.reviewStatus ?? "en_attente"))) reviewedParts.push(amount);
    if (cluster.reviewStage === "dismissed") dismissedParts.push(amount);
    else if (cluster.reviewStage === "pending") pendingParts.push(amount);
    else if (cluster.reviewStage === "proposed") adjustments.push({ findingId: r.findingId, target: cluster.target, signedCents: signed(amount, r.effect.direction), proposed: true });
    else if (cluster.reviewStage === "corrected") {
      const residual = amount - (cluster.correctedCents ?? amount);
      if (residual > 0) adjustments.push({ findingId: r.findingId, target: cluster.target, signedCents: signed(residual, r.effect.direction), proposed: false });
    }
  }

  // Incidence fiscale : taux explicite ET qualification fiscale. Un taux sans qualification ne valide aucun net ;
  // une différence temporaire attend le moteur fiscal (C10) ; sans taux, inconnu.
  const taxKnown: ExposureProjection["taxKnown"] = [];
  const taxUnknown: ExposureProjection["taxUnknown"] = [];
  for (const a of adjustments) {
    const e = recordOf.get(a.findingId)!.effect;
    const q = e.taxQualification;
    if (q === "non_deductible" || q === "reclassification") taxKnown.push({ findingId: a.findingId, target: a.target, taxCents: 0 });
    else if (q === "deductible" && e.taxRatePct !== undefined) taxKnown.push({ findingId: a.findingId, target: a.target, taxCents: applyRatePct(a.signedCents, e.taxRatePct) });
    else if (q === "temporary_difference") taxUnknown.push({ findingId: a.findingId, reason: "différence temporaire : incidence fiscale à calculer par le moteur fiscal (scénario avant/après), non disponible" });
    else if (e.taxRatePct === undefined) taxUnknown.push({ findingId: a.findingId, reason: "taux d'impôt absent : incidence fiscale inconnue" });
    else taxUnknown.push({ findingId: a.findingId, reason: "taux explicite sans qualification fiscale (déductibilité non établie) : aucun net validé" });
  }
  const taxStatusOf = (known: number, unknown: number): AmountStatus => (unknown === 0 ? "known" : known === 0 ? "unknown" : "partial");
  const tax: TaxEffectBlock = {
    status: adjustments.length === 0 ? "known" : taxStatusOf(taxKnown.length, taxUnknown.length),
    knownCents: sumCents(taxKnown.map((t) => t.taxCents), "effet d'impôt connu"),
    knownFindingIds: taxKnown.map((t) => t.findingId),
    unknown: taxUnknown,
  };
  const targets = [...new Set(adjustments.map((a) => a.target))].sort(canonicalCompare);
  const netByTarget: NetEffectByTarget[] = targets.map((target) => {
    const mine = adjustments.filter((a) => a.target === target);
    const knownIds = new Set(taxKnown.filter((t) => t.target === target).map((t) => t.findingId));
    const unknownCount = mine.filter((a) => !knownIds.has(a.findingId)).length;
    const taxStatus = taxStatusOf(knownIds.size, unknownCount);
    const uncorrectedSignedCents = sumCents(mine.map((a) => a.signedCents), `anomalies non corrigées ${target}`);
    const proposedSignedCents = sumCents(mine.filter((a) => a.proposed).map((a) => a.signedCents), `ajustement proposé ${target}`);
    const knownTax = sumCents(taxKnown.filter((t) => t.target === target).map((t) => t.taxCents), `impôt connu ${target}`);
    const knownSubset = sumCents(mine.filter((a) => knownIds.has(a.findingId)).map((a) => a.signedCents), `sous-ensemble connu ${target}`);
    return {
      target,
      proposedSignedCents,
      uncorrectedSignedCents,
      taxStatus,
      taxKnownCents: knownTax,
      netAfterKnownTaxCents: taxStatus === "known" ? uncorrectedSignedCents - knownTax : null,
      partialNetKnownSubsetCents: knownSubset - knownTax,
    };
  });

  const exposure: ExposureDimension = {
    grossDetectedExposureCents: dedup.grossCents,
    exactRepeatsCents: dedup.exactRepeatsCents,
    supersededVersionsCents: dedup.supersededVersionsCents,
    determinedExposureCents: dedup.determinedCents,
    exposureBoundsCents: dedup.boundsCents,
    aggregationStatus: dedup.status,
    reviewedExposureCents: sumCents(reviewedParts, "exposition revue"),
    dismissedExposureCents: sumCents(dismissedParts, "exposition écartée"),
    pendingReviewExposureCents: sumCents(pendingParts, "exposition en attente"),
    stages,
    tax,
    netByTarget,
    taxIncidence: { provider: "none", method: "before_after_is_scenario", pendingFindingIds: taxUnknown.map((t) => t.findingId) },
    clusters: dedup.clusters,
    findingsWithoutEffect: withoutEffect,
    policy: AGGREGATION_POLICY,
  };
  return { exposure, records, dedup, adjustments, taxKnown, taxUnknown };
}

/** Statut de revue de chaque constat : dernier événement, sinon statut porté par le constat. */
export function reviewStatusMap(findings: Finding[], reviewEvents: DossierSnapshot["reviewEvents"]): Map<string, string> {
  return new Map(findings.map((f) => [f.id, statusAfterReviewEvents(f, reviewEvents)]));
}

/** Projection d'un DossierSnapshot : mêmes entrées que la Synthèse, donc mêmes groupes et mêmes montants. */
export function projectSnapshotExposure(snapshot: Pick<DossierSnapshot, "findings" | "reviewEvents" | "dossier">): ExposureProjection {
  return projectExposure(snapshot.findings, snapshot.dossier.fecFingerprint, reviewStatusMap(snapshot.findings, snapshot.reviewEvents));
}

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
 */

import type { Finding, FinancialEffect } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { assertCents, sumCents } from "./money";
import { canonicalCompare, stableHash } from "./canonical";
import type {
  AggregationPolicy,
  EffectDirection,
  EffectTarget,
  ExposureClusterMember,
  ExposureClusterView,
} from "./types";

export const AGGREGATION_POLICY: AggregationPolicy = {
  policyId: "probant-exposure-aggregation",
  version: "2.0.0",
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
  /** Identité économique. */
  identity: string;
  /** Empreinte de contenu. */
  contentFingerprint: string;
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
    const base = { findingId: f.id, cloison: f.cloison, sourceDocument, entryIds, effect: f.financialEffect };
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
  determinedCents: number;
  boundsCents: { minCents: number; maxCents: number };
  status: "determined" | "indeterminate";
  clusters: ExposureClusterView[];
  /** Ventilation par cloison de l'exposition déterminée. */
  byCloison: Partial<Record<CloisonId, number>>;
  /** Contributions écartées (répétitions exactes, versions remplacées). Les conflits et chevauchements ne sont pas écartés : ils sont indéterminés. */
  excluded: { id: string; reason: string }[];
}

const member = (r: EffectRecord, role: ExposureClusterMember["role"]): ExposureClusterMember => ({
  findingId: r.findingId,
  identity: r.identity,
  contentFingerprint: r.contentFingerprint,
  amountCents: r.effect.amountCents,
  direction: r.effect.direction,
  evaluationVersion: r.effect.evaluationVersion ?? null,
  role,
});

/**
 * Succession de versions démontrée : chaque contenu, sauf le premier, désigne par
 * `supersedesFindingId` un constat du même groupe de version strictement inférieure
 * (ou non versionnée). Retourne la chaîne ordonnée, ou null si la succession n'est pas démontrée.
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
    if (!target || !ids.has(target) || vCur <= vPrev) return null;
    const superseded = contents.find((c) => c.findingId === target)!;
    if ((superseded.effect.evaluationVersion ?? 0) >= vCur) return null;
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
  const nodes: IdentityNode[] = [];

  for (const [identity, group] of [...byIdentity.entries()].sort(([a], [b]) => canonicalCompare(a, b))) {
    const byFingerprint = new Map<string, EffectRecord[]>();
    for (const r of group) byFingerprint.set(r.contentFingerprint, [...(byFingerprint.get(r.contentFingerprint) ?? []), r]);
    const contents: EffectRecord[] = [];
    const members: ExposureClusterMember[] = [];
    for (const [, same] of [...byFingerprint.entries()].sort(([a], [b]) => canonicalCompare(a, b))) {
      const [first, ...repeats] = same;
      contents.push(first);
      for (const dup of repeats) {
        exactRepeatsCents += dup.effect.amountCents;
        excluded.push({ id: dup.findingId, reason: `répétition exacte de ${first.findingId} (même identité économique et même contenu) : comptée une fois` });
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
    if (contents.length === 1) {
      members.push(member(sample, "retained"));
      nodes.push({ ...base, direction: sample.effect.direction, retained: sample, minCents: sample.effect.amountCents, maxCents: sample.effect.amountCents, members });
      continue;
    }
    const chain = versionChain(contents);
    if (chain) {
      const latest = chain[chain.length - 1];
      for (const old of chain.slice(0, -1)) {
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
  const asRecord = (n: IdentityNode): EffectRecord => ({ findingId: "", cloison: "resultat", sourceDocument: n.sourceDocument, entryIds: n.entryIds, effect: { amountCents: 0, direction: "increase", target: n.target, assertion: "exactitude", rootCause: "", period: n.period, basis: "measured" }, identity: n.identity, contentFingerprint: "" });
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (overlaps(asRecord(nodes[i]), asRecord(nodes[j]))) union(nodes[i].identity, nodes[j].identity);

  const components = new Map<string, IdentityNode[]>();
  for (const n of nodes) { const root = find(n.identity); components.set(root, [...(components.get(root) ?? []), n]); }

  const clusters: ExposureClusterView[] = [];
  const byCloison: Partial<Record<CloisonId, number>> = {};
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
      byCloison[r.cloison] = (byCloison[r.cloison] ?? 0) + r.effect.amountCents;
      clusters.push({ ...base, status: "determined", retainedCents: r.effect.amountCents, boundsCents: { minCents, maxCents }, retainedFindingId: r.findingId });
      continue;
    }
    if (sorted.length === 1) {
      clusters.push({ ...base, status: "conflict", retainedCents: null, boundsCents: { minCents, maxCents }, retainedFindingId: null, reason: sorted[0].conflictReason, members: members.map((m) => ({ ...m })) });
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
      reason: sorted.some((n) => n.conflictReason) ? `${reason} ; un membre est lui-même en conflit` : reason,
      members: members.map((m) => (m.role === "retained" ? { ...m, role: "overlapping" } : m)),
    });
  }

  const determinedCents = sumCents(determinedParts, "exposition déterminée");
  return {
    grossCents,
    exactRepeatsCents,
    determinedCents,
    boundsCents: { minCents: sumCents(minParts, "borne basse"), maxCents: sumCents(maxParts, "borne haute") },
    status: clusters.every((c) => c.status === "determined") ? "determined" : "indeterminate",
    clusters,
    byCloison,
    excluded,
  };
}

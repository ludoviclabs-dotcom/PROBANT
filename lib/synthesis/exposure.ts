/**
 * Exposition financière — effets explicites, déduplication, agrégation.
 *
 * Principe fondateur : un constat ne contribue à l'exposition QUE s'il porte
 * un `financialEffect` explicite. La présomption historique
 * `|constaté − seuil| = impact comptable` est supprimée — un écart de ratio,
 * un délai en jours ou un seuil de détection ne sont pas des impacts
 * comptables. Les constats sans effet sont listés, jamais présumés.
 *
 * Pipeline de déduplication (cinq étapes, aucune suppression silencieuse) :
 *   1. doublons EXACTS — même `stableEffectKey` ⇒ une seule contribution ;
 *   2. graphe de CHEVAUCHEMENT — deux effets se recouvrent s'ils visent le
 *      même poste et la même période en partageant pièce ou lignes sources ;
 *   3. CLUSTERS — composantes connexes du graphe ;
 *   4. POLITIQUE d'agrégation — cluster cohérent (même sens) : montant
 *      maximal retenu (le même sous-jacent détecté par plusieurs règles ne
 *      compte qu'une fois, à hauteur de sa pire estimation) ;
 *   5. AMBIGUÏTÉ — sens opposés ou causes distinctes dans un même cluster :
 *      contribution conservatrice (max) ET marquage review_required. On
 *      n'écrase jamais un effet en silence.
 */

import type { Finding, FinancialEffect } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { assertCents, sumCents } from "./money";
import type {
  AggregationPolicy,
  ExposureClusterView,
} from "./types";

export const AGGREGATION_POLICY: AggregationPolicy = {
  policyId: "probant-exposure-aggregation",
  version: "1.0.0",
  coherentClusterRule: "max_magnitude",
  ambiguousClusterRule: "max_magnitude_and_review_required",
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
  key: string;
}

/**
 * Clé stable d'un effet : document source, écritures/pièce, période, poste
 * visé, assertion, cause racine, sens. Deux constats produisant la même clé
 * décrivent LE MÊME effet économique — quelle que soit la règle qui l'a vu.
 */
export function stableEffectKey(record: Omit<EffectRecord, "key">): string {
  const e = record.effect;
  return [
    record.sourceDocument,
    record.entryIds.join("+"),
    e.period,
    e.target,
    e.assertion,
    e.rootCause,
    e.direction,
  ].join("|");
}

/** Construit les EffectRecords d'un jeu de constats (tri stable par id). */
export function collectEffects(
  findings: Finding[],
  sourceDocument: string,
): { records: EffectRecord[]; withoutEffect: string[] } {
  const records: EffectRecord[] = [];
  const withoutEffect: string[] = [];

  for (const f of [...findings].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!f.financialEffect) {
      withoutEffect.push(f.id);
      continue;
    }
    assertCents(f.financialEffect.amountCents, `financialEffect de ${f.id}`);
    if (f.financialEffect.amountCents < 0) {
      throw new Error(
        `financialEffect de ${f.id} : amountCents doit être ≥ 0 (le sens est porté par direction)`,
      );
    }
    const entryIds = [...new Set(f.lignesSource.map((l) => String(l)))].sort();
    const base = {
      findingId: f.id,
      cloison: f.cloison,
      sourceDocument,
      entryIds,
      effect: f.financialEffect,
    };
    records.push({ ...base, key: stableEffectKey(base) });
  }

  return { records, withoutEffect };
}

/** Étape 2 : deux effets se chevauchent-ils ? */
function overlaps(a: EffectRecord, b: EffectRecord): boolean {
  if (a.effect.target !== b.effect.target) return false;
  if (a.effect.period !== b.effect.period) return false;
  if (a.sourceDocument !== b.sourceDocument) return false;
  // Chevauchement matériel : au moins une écriture/pièce en commun.
  const setB = new Set(b.entryIds);
  return a.entryIds.some((id) => setB.has(id));
}

export interface DeduplicationResult {
  /** Somme brute (tous les effets, avant toute déduplication). */
  grossCents: number;
  /** Somme après déduplication exacte et agrégation par cluster. */
  deduplicatedCents: number;
  clusters: ExposureClusterView[];
  /** Ventilation par cloison de l'exposition dédupliquée. */
  byCloison: Partial<Record<CloisonId, number>>;
  /** Contributions écartées (doublons exacts, membres non retenus). */
  excluded: { id: string; reason: string }[];
}

/** Exécute les étapes 1 à 5 du pipeline. */
export function deduplicateEffects(records: EffectRecord[]): DeduplicationResult {
  const excluded: { id: string; reason: string }[] = [];

  const grossCents = sumCents(
    records.map((r) => r.effect.amountCents),
    "exposition brute",
  );

  // ── Étape 1 : doublons exacts (même clé stable) ─────────────────────────
  const byKey = new Map<string, EffectRecord[]>();
  for (const r of records) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }
  const representatives: EffectRecord[] = [];
  for (const [key, group] of [...byKey.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const [first, ...rest] = group; // déjà triés par findingId (collectEffects)
    representatives.push(first);
    for (const dup of rest) {
      excluded.push({
        id: dup.findingId,
        reason: `doublon exact de ${first.findingId} (clé ${key})`,
      });
    }
  }

  // ── Étapes 2-3 : graphe de chevauchement → composantes connexes ─────────
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const r of representatives) parent.set(r.key, r.key);
  for (let i = 0; i < representatives.length; i++) {
    for (let j = i + 1; j < representatives.length; j++) {
      if (overlaps(representatives[i], representatives[j])) {
        union(representatives[i].key, representatives[j].key);
      }
    }
  }

  const clusterMembers = new Map<string, EffectRecord[]>();
  for (const r of representatives) {
    const root = find(r.key);
    const list = clusterMembers.get(root) ?? [];
    list.push(r);
    clusterMembers.set(root, list);
  }

  // ── Étapes 4-5 : politique d'agrégation, ambiguïté ──────────────────────
  const clusters: ExposureClusterView[] = [];
  const byCloison: Partial<Record<CloisonId, number>> = {};
  const deduplicatedParts: number[] = [];

  for (const [root, members] of [...clusterMembers.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const sorted = [...members].sort((a, b) => a.key.localeCompare(b.key));
    const directions = new Set(sorted.map((m) => m.effect.direction));
    const rootCauses = new Set(sorted.map((m) => m.effect.rootCause));
    const ambiguous =
      sorted.length > 1 && (directions.size > 1 || rootCauses.size > 1);

    // max_magnitude : le représentant retenu est l'effet le plus élevé ;
    // en cas d'égalité, la clé la plus petite (tri stable) l'emporte.
    const retained = sorted.reduce((best, m) =>
      m.effect.amountCents > best.effect.amountCents ? m : best,
    );
    for (const m of sorted) {
      if (m !== retained && sorted.length > 1) {
        excluded.push({
          id: m.findingId,
          reason: ambiguous
            ? `cluster ambigu ${root} : non retenu par la politique conservatrice (max), revue requise`
            : `chevauche ${retained.findingId} (cluster ${root}) : politique max_magnitude`,
        });
      }
    }

    const retainedCents = retained.effect.amountCents;
    deduplicatedParts.push(retainedCents);
    byCloison[retained.cloison] =
      (byCloison[retained.cloison] ?? 0) + retainedCents;

    clusters.push({
      clusterId: root,
      findingIds: sorted.map((m) => m.findingId),
      effectKeys: sorted.map((m) => m.key),
      retainedCents,
      ambiguous,
      ambiguityReason: ambiguous
        ? directions.size > 1
          ? "sens opposés dans un même cluster de chevauchement"
          : "causes racines distinctes dans un même cluster de chevauchement"
        : undefined,
    });
  }

  return {
    grossCents,
    deduplicatedCents: sumCents(deduplicatedParts, "exposition dédupliquée"),
    clusters,
    byCloison,
    excluded,
  };
}

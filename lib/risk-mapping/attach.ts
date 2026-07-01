/**
 * Rattachement factuel constat → cycle d'audit.
 *
 * Les constats démo ne portent pas `cycleSlug`. Le rattachement repose donc,
 * dans l'ordre, sur trois faits vérifiables :
 *   1. `cycle.probantSiloIds` contient `finding.siloId` ;
 *   2. sinon `cycle.probantCloisons` contient `finding.cloison` ;
 *   3. sinon, pour chaque compte de `finding.comptesConcernes`,
 *      `siloForCompte(compte)` puis rapprochement de ce silo à `probantSiloIds`.
 *
 * Un même constat peut alimenter plusieurs cycles (aucun rattachement exclusif).
 * Les constats sans rattachement sont conservés dans un bucket dédié : ils ne
 * sont jamais perdus silencieusement.
 *
 * Module isomorphe : aucun import React ni `fs`, aucun appel `loader.ts`.
 */

import type { Finding } from "@/lib/canonical-model/finding";
import { siloForCompte } from "@/lib/canonical-model/taxonomy";
import type { AuditCycle } from "@/lib/audit-cycles/types";

/**
 * Résultat du rattachement : la map cycle→constats et la liste des constats
 * qu'aucun cycle n'a pu revendiquer (bucket « non rattaché »).
 */
export interface AttachmentResult {
  /** Indexée par `cycle.slug` ; un cycle sans constat n'apparaît pas. */
  byCycle: Map<string, Finding[]>;
  /** Constats rattachés à aucun cycle (ni silo, ni cloison, ni compte). */
  unattached: Finding[];
}

/**
 * Retourne l'ensemble des slugs de cycles auxquels un constat se rattache.
 * L'ordre des règles (silo, puis cloison, puis compte) reflète la précision
 * décroissante du lien ; on cumule néanmoins tous les cycles concernés pour ne
 * pas masquer un rattachement transversal.
 */
export function cyclesForFinding(f: Finding, cycles: AuditCycle[]): string[] {
  const slugs = new Set<string>();

  for (const cycle of cycles) {
    if (cycle.probantSiloIds.includes(f.siloId)) {
      slugs.add(cycle.slug);
    }
  }

  if (slugs.size === 0) {
    for (const cycle of cycles) {
      if (cycle.probantCloisons.includes(f.cloison)) {
        slugs.add(cycle.slug);
      }
    }
  }

  if (slugs.size === 0) {
    const silosViaComptes = new Set<string>();
    for (const compte of f.comptesConcernes) {
      const silo = siloForCompte(compte);
      if (silo) silosViaComptes.add(silo.id);
    }
    if (silosViaComptes.size > 0) {
      for (const cycle of cycles) {
        if (cycle.probantSiloIds.some((id) => silosViaComptes.has(id))) {
          slugs.add(cycle.slug);
        }
      }
    }
  }

  return [...slugs];
}

/**
 * Premier cycle rattaché à un constat (précision décroissante), ou `undefined`
 * si aucun. Utilitaire de commodité : le rattachement complet passe par
 * `cyclesForFinding` / `attachFindingsToCycles`.
 */
export function cycleForFinding(
  f: Finding,
  cycles: AuditCycle[],
): AuditCycle | undefined {
  const slugs = cyclesForFinding(f, cycles);
  if (slugs.length === 0) return undefined;
  const first = slugs[0];
  return cycles.find((c) => c.slug === first);
}

/**
 * Rattache tous les constats à leurs cycles. Un constat peut apparaître dans
 * plusieurs cycles ; les constats orphelins sont isolés dans `unattached`.
 */
export function attachFindingsToCycles(
  cycles: AuditCycle[],
  findings: Finding[],
): AttachmentResult {
  const byCycle = new Map<string, Finding[]>();
  const unattached: Finding[] = [];

  for (const f of findings) {
    const slugs = cyclesForFinding(f, cycles);
    if (slugs.length === 0) {
      unattached.push(f);
      continue;
    }
    for (const slug of slugs) {
      const bucket = byCycle.get(slug);
      if (bucket) {
        bucket.push(f);
      } else {
        byCycle.set(slug, [f]);
      }
    }
  }

  return { byCycle, unattached };
}

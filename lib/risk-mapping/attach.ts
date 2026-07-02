/**
 * Rattachement factuel constat → cycle d'audit.
 *
 * Si le constat porte déjà `cycleSlug` (posé avec certitude par le moteur de
 * rapprochement — cf. `cyclesForFinding`, règle 0), il est utilisé tel quel.
 * Les constats du moteur d'analyse FEC classique n'ont pas ce champ : le
 * rattachement repose alors, dans l'ordre, sur trois faits vérifiables :
 *   1. `cycle.probantSiloIds` contient `finding.siloId` ;
 *   2. sinon, pour chaque compte de `finding.comptesConcernes`,
 *      `siloForCompte(compte)` puis rapprochement de ce silo à `probantSiloIds`
 *      (précision fine : un compte 411 identifie creances-clients avec certitude) ;
 *   3. sinon `cycle.probantCloisons` contient `finding.cloison` (repli large —
 *      bilan-actif est partagé par ~10 cycles ; cloison = dernier recours).
 *
 * Un même constat peut alimenter plusieurs cycles (aucun rattachement exclusif),
 * sauf via `cycleSlug` qui est par nature exclusif (un seul cycle). Les
 * constats sans rattachement sont conservés dans un bucket dédié : ils ne
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
 *
 * Règle 0 (prioritaire, exclusive) : si `f.cycleSlug` est renseigné et
 * correspond au `slug` d'un des cycles fournis, on le retourne seul aussitôt.
 * Un constat issu du moteur de rapprochement (lib/rapprochement/to-findings.ts)
 * connaît déjà avec certitude son cycle cible — c'est le moteur qui l'a posé
 * au moment de produire le constat — donc inutile (et risqué) de le
 * redécouvrir par heuristique : cela évite un rattachement erroné ou multiple
 * via la règle 3 (cloison), large et partagée par ~10 cycles, quand le
 * `siloId` du rapprochement (ex. "rapprochement-clients") ne figure pas dans
 * `probantSiloIds` du cycle cible et que `comptesConcernes` ne contient pas de
 * compte PCG numérique exploitable (ex. seulement un nom de tiers).
 *
 * Sinon (pas de `cycleSlug`, ou `cycleSlug` ne correspondant à aucun cycle
 * fourni — ex. constats du moteur FEC classique), on applique les trois
 * règles heuristiques historiques, du plus précis au plus large ; on s'arrête
 * dès qu'une règle trouve un ou plusieurs cycles pour éviter qu'une cloison
 * partagée (ex. bilan-actif) gonfle artificiellement les scores :
 *   1. `cycle.probantSiloIds` contient `finding.siloId` ;
 *   2. sinon, pour chaque compte de `finding.comptesConcernes`,
 *      `siloForCompte(compte)` puis rapprochement de ce silo à `probantSiloIds`
 *      (précision fine : un compte 411 identifie creances-clients avec certitude) ;
 *   3. sinon `cycle.probantCloisons` contient `finding.cloison` (repli large —
 *      bilan-actif est partagé par ~10 cycles ; cloison = dernier recours).
 *
 * Un même constat peut alimenter plusieurs cycles (aucun rattachement exclusif),
 * sauf via la règle 0 qui est par construction exclusive (un seul cycle, le
 * plus précis possible). Les constats sans rattachement sont conservés dans un
 * bucket dédié : ils ne sont jamais perdus silencieusement.
 */
export function cyclesForFinding(f: Finding, cycles: AuditCycle[]): string[] {
  if (f.cycleSlug && cycles.some((cycle) => cycle.slug === f.cycleSlug)) {
    return [f.cycleSlug];
  }

  const slugs = new Set<string>();

  for (const cycle of cycles) {
    if (cycle.probantSiloIds.includes(f.siloId)) {
      slugs.add(cycle.slug);
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

  if (slugs.size === 0) {
    for (const cycle of cycles) {
      if (cycle.probantCloisons.includes(f.cloison)) {
        slugs.add(cycle.slug);
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

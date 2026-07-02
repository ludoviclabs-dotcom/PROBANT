"use client";

import { useEffect, useState } from "react";
import { AUDIT_CYCLES } from "@/lib/rapprochement/catalog";
import { LIVE_RAPPROCHEMENT_KEY } from "@/components/probant/CycleUploadPanel";

/**
 * Hook client de couverture documentaire du dépôt multi-documents.
 *
 * Lit `sessionStorage[LIVE_RAPPROCHEMENT_KEY]` — un objet `{ [cycle.id]:
 * SiloView }` écrit par `CycleUploadPanel` à chaque rapprochement réussi — et
 * croise les clés présentes avec `AUDIT_CYCLES` (catalogue déclaratif du
 * dépôt) pour dériver la liste des `config.cycleSlug` couverts.
 *
 * État initial `null` = sentinelle (pattern `useRiskAdjustments` /
 * `CloisonsViewLive`) : on distingue « pas encore hydraté » de « rien de
 * déposé », pour ne jamais afficher un flash « 0/N » avant la lecture du
 * storage côté client.
 *
 * `total` est TOUJOURS dérivé de `AUDIT_CYCLES.length` — jamais une valeur
 * codée en dur — pour rester exact si le catalogue évolue.
 */

export interface DepositCoverage {
  total: number;
  coveredCycleSlugs: string[];
  coveredDepositIds: string[];
}

/** Lit et parse best-effort les clés de cycles déposés depuis sessionStorage. */
function readCoveredDepositIds(): string[] {
  try {
    const raw = sessionStorage.getItem(LIVE_RAPPROCHEMENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.keys(parsed as Record<string, unknown>);
  } catch {
    return [];
  }
}

export function useDepositCoverage(): DepositCoverage | null {
  const [coverage, setCoverage] = useState<DepositCoverage | null>(null);

  useEffect(() => {
    const coveredDepositIds = readCoveredDepositIds();
    const coveredIdSet = new Set(coveredDepositIds);
    const coveredCycleSlugs = AUDIT_CYCLES.filter((c) => coveredIdSet.has(c.id)).map(
      (c) => c.config.cycleSlug,
    );
    setCoverage({
      total: AUDIT_CYCLES.length,
      coveredCycleSlugs,
      coveredDepositIds,
    });
  }, []);

  return coverage;
}

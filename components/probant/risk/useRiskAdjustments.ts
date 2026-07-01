"use client";

import { useCallback, useEffect, useState } from "react";
import type { RiskAdjustmentMap } from "@/lib/risk-mapping";
import {
  RISK_ADJUSTMENTS_KEY,
  emptyAdjustments,
  mergeAdjustment,
  parseAdjustments,
  serializeAdjustments,
  type AdjustmentPatch,
} from "@/lib/risk-mapping";

/**
 * Hook client de persistance des ajustements de risque en `sessionStorage`.
 *
 * Toute la logique (fusion, bornage, sérialisation) délègue aux fonctions PURES
 * de `lib/risk-mapping/adjustments.ts` : ce hook ne fait qu'orchestrer la
 * lecture/écriture du storage et exposer l'état React. L'auto reste toujours
 * recalculé ailleurs (scoring) ; l'ajustement est une surcouche additive bornée.
 *
 * État initial `null` = sentinelle (pattern `CloisonsViewLive`) : on distingue
 * « pas encore hydraté » de « map vide », pour éviter tout écrasement du storage
 * par un premier rendu serveur.
 */
export function useRiskAdjustments(): {
  adjustments: RiskAdjustmentMap;
  setAdjustment: (slug: string, patch: AdjustmentPatch) => void;
  resetCycle: (slug: string) => void;
  resetAll: () => void;
} {
  const [adjustments, setAdjustments] = useState<RiskAdjustmentMap | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RISK_ADJUSTMENTS_KEY);
      setAdjustments(parseAdjustments(raw));
    } catch {
      setAdjustments(emptyAdjustments());
    }
  }, []);

  /** Persiste une map (best-effort : un storage indisponible n'interrompt rien). */
  const persist = useCallback((next: RiskAdjustmentMap) => {
    try {
      sessionStorage.setItem(RISK_ADJUSTMENTS_KEY, serializeAdjustments(next));
    } catch {
      /* storage indisponible : l'état React reste la source de vérité de la session */
    }
  }, []);

  const setAdjustment = useCallback(
    (slug: string, patch: AdjustmentPatch) => {
      setAdjustments((prev) => {
        const base = prev ?? emptyAdjustments();
        const next = mergeAdjustment(base, slug, patch, new Date().toISOString());
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetCycle = useCallback(
    (slug: string) => {
      setAdjustments((prev) => {
        const base = prev ?? emptyAdjustments();
        if (!(slug in base)) {
          return base;
        }
        const next: RiskAdjustmentMap = { ...base };
        delete next[slug];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetAll = useCallback(() => {
    const next = emptyAdjustments();
    persist(next);
    setAdjustments(next);
  }, [persist]);

  return {
    adjustments: adjustments ?? emptyAdjustments(),
    setAdjustment,
    resetCycle,
    resetAll,
  };
}

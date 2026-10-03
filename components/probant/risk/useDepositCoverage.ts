"use client";

import { useMemo } from "react";
import { AUDIT_CYCLES } from "@/lib/rapprochement/catalog";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";

export interface DepositCoverage {
  total: number;
  coveredCycleSlugs: string[];
  coveredDepositIds: string[];
}

export function useDepositCoverage(): DepositCoverage {
  const snapshot = useActiveDossierSnapshot();
  return useMemo(() => {
    const coveredDepositIds = snapshot.uploadExecutions?.filter((run) => run.state === "active").map((run) => run.cycleId) ?? [];
    const covered = new Set(coveredDepositIds);
    return {
      total: AUDIT_CYCLES.length,
      coveredDepositIds,
      coveredCycleSlugs: AUDIT_CYCLES
        .filter((cycle) => covered.has(cycle.id))
        .map((cycle) => cycle.config.cycleSlug),
    };
  }, [snapshot.uploadExecutions]);
}

"use client";

import { useMemo } from "react";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { CloisonsWorkspace } from "./CloisonsWorkspace";

export function ActiveCloisons() {
  const snapshot = useActiveDossierSnapshot();
  const activeDossier = snapshot.dossier;
  const meta = {
    label: activeDossier.societe.raisonSociale,
    exercice: activeDossier.societe.exercice,
  };
  // Même projection des effets que la Synthèse et la cartographie des risques (C05).
  const exposure = useMemo(() => projectSnapshotExposure(snapshot).exposure, [snapshot]);

  return (
    <CloisonsWorkspace
      silos={activeDossier.silos}
      meta={meta}
      scenario={snapshot.calculationContext.scenarioMeta ?? null}
      exposure={exposure}
    />
  );
}

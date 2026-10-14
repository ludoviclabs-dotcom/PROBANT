"use client";

import { useMemo } from "react";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { sirenRenseigne } from "@/lib/dossier/siren";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { CloisonsWorkspace } from "./CloisonsWorkspace";

export function ActiveCloisons() {
  const snapshot = useActiveDossierSnapshot();
  const activeDossier = snapshot.dossier;
  // Identité et origine du dossier actif, comme le bandeau du tableau de bord.
  const meta = {
    label: activeDossier.societe.raisonSociale,
    exercice: activeDossier.societe.exercice,
    siren: sirenRenseigne(activeDossier.societe.siren),
    sourceKind: snapshot.sourceKind,
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

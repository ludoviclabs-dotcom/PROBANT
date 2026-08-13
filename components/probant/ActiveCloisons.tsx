
"use client";

import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { CloisonsWorkspace } from "./CloisonsWorkspace";

export function ActiveCloisons() {
  const snapshot = useActiveDossierSnapshot();
  const activeDossier = snapshot.dossier;
  const meta = {
    label: activeDossier.societe.raisonSociale,
    exercice: activeDossier.societe.exercice,
  };

  return (
    <CloisonsWorkspace
      silos={activeDossier.silos}
      meta={meta}
      scenario={snapshot.calculationContext.scenarioMeta ?? null}
    />
  );
}


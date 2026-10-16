"use client";

import { useMemo, type ReactNode } from "react";
import { charteFonts } from "@/app/fonts";
import { ReferentielEdition } from "@/components/referentiel/ReferentielEdition";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { priorityCycle, projectCycleRows, projectSourceState } from "@/lib/dossier/cycle-registry";
import { formatClosing, formatPeriod } from "@/lib/format/period";
import { SYNTHESIS_ENGINE_VERSION } from "@/lib/synthesis/versions";
import { BottomBar } from "./BottomBar";
import { ContextRibbon, type RibbonData } from "./ContextRibbon";
import { DemoBanner } from "./DemoBanner";
import { InstrumentRail, type RailBadge } from "./InstrumentRail";
import s from "./shell.module.css";

/**
 * Châssis des écrans du dossier : bandeau « Mode démo », rail (barre basse sous 760 px), ruban de contexte.
 * Il ne lit que le snapshot actif et la projection du registre des cycles ; les pages gardent leur propre
 * contenu et leur propre titre. La zone `main` reste le conteneur de défilement.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const snapshot = useActiveDossierSnapshot();
  const dossier = snapshot.dossier;

  const sources = useMemo(() => projectSourceState(snapshot), [snapshot]);
  const priority = useMemo(() => priorityCycle(projectCycleRows(snapshot)), [snapshot]);

  const ribbon: RibbonData = {
    societe: dossier.societe.raisonSociale,
    siren: dossier.societe.siren,
    exercice: dossier.societe.exercice,
    periode: dossier.period ? formatPeriod(dossier.period.startDate, dossier.period.closingDate) : formatClosing(dossier.societe.dateCloture),
    id: dossier.id,
    fec: sources.fecFingerprint ? sources.fecFingerprint.slice(0, 12) : null,
    documents: sources.documents,
    kindLabel: sources.kindLabel,
    blockingAdmissibility: sources.blockingAdmissibility,
    workpapers: sources.workpapers,
    priority: priority ? { action: priority.nextAction.label, cycle: priority.entry.label } : null,
  };

  const badges: Partial<Record<string, RailBadge>> = {};
  if (sources.blockingAdmissibility > 0) badges["/dashboard/depot"] = { count: sources.blockingAdmissibility, blocking: true };
  if (snapshot.findings.length > 0) badges["/dashboard/cloisons"] = { count: snapshot.findings.length };

  return (
    <div className={`${charteFonts} ${s.shell}`}>
      {snapshot.sourceKind === "demo" && <DemoBanner societe={dossier.societe.raisonSociale} />}
      <div className={s.body}>
        <InstrumentRail
          badges={badges}
          version={
            <>
              Référentiel <ReferentielEdition identifiant={dossier.referentielVersion} placement="above" /> · moteur {SYNTHESIS_ENGINE_VERSION}
            </>
          }
        />
        <div className={s.column}>
          <main className={s.main}>
            <ContextRibbon data={ribbon} />
            {children}
          </main>
          <BottomBar />
        </div>
      </div>
    </div>
  );
}

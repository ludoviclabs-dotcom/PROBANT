"use client";

import { Suspense } from "react";
import { Sidebar } from "@/components/probant/Sidebar";
import { OnboardingCta } from "@/components/probant/OnboardingCta";
import {
  ActiveDossierProvider,
  useActiveDossierSnapshot,
} from "@/lib/dossier/client";

const SOURCE_LABEL = {
  demo: "Demo",
  session: "Session",
  persistent: "Persistent",
} as const;

function DashboardChrome({ children }: { children: React.ReactNode }) {
  const snapshot = useActiveDossierSnapshot();
  const dossier = snapshot.dossier;
  const badges: Record<string, number> = {
    "/dashboard/depot": snapshot.admissibilityFindings.filter(
      (finding) => finding.severity === "bloquant",
    ).length,
    "/dashboard/cloisons": snapshot.findings.length,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-4 border-b border-[var(--pb-border)] bg-[var(--pb-surface)] px-6 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-[var(--pb-text)]">
                {dossier.societe.raisonSociale}
              </h1>
              <span className="rounded-md border border-[#3b82f6]/50 bg-[#0a1628] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#60a5fa]">
                {SOURCE_LABEL[snapshot.sourceKind]}
              </span>
              <OnboardingCta variant="banner" />
            </div>
            <div className="tnum mt-0.5 flex items-center gap-3 text-[11px] text-[var(--pb-text-faint)]">
              <span>SIREN {dossier.societe.siren}</span>
              <span>·</span>
              <span>Exercice {dossier.societe.exercice}</span>
              <span>·</span>
              <span>FEC {dossier.fecFingerprint.slice(0, 12)}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4 text-[11px] text-[var(--pb-text-muted)]">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                Référentiel
              </div>
              <div className="tnum font-semibold text-[var(--pb-text)]">
                v.{dossier.referentielVersion}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <OnboardingCta variant="floating" />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ActiveDossierProvider>
        <DashboardChrome>{children}</DashboardChrome>
      </ActiveDossierProvider>
    </Suspense>
  );
}

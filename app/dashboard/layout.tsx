"use client";

import { Suspense, useEffect, useState } from "react";
import { Menu } from "lucide-react";
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
  // Tiroir de navigation (< md) : fermé par défaut, Échap le referme.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);
  const badges: Record<string, number> = {
    "/dashboard/depot": snapshot.admissibilityFindings.filter(
      (finding) => finding.severity === "bloquant",
    ).length,
    "/dashboard/cloisons": snapshot.findings.length,
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {navOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[45] bg-black/60 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <Sidebar badges={badges} open={navOpen} onNavigate={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--pb-border)] bg-[var(--pb-surface)] px-4 py-3 md:gap-4 md:px-6">
          <button
            type="button"
            aria-label="Ouvrir la navigation"
            aria-controls="dashboard-nav"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((o) => !o)}
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:text-[var(--pb-text)] md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-[var(--pb-text)]">
                {dossier.societe.raisonSociale}
              </h1>
              <span className="rounded-md border border-[#3b82f6]/50 bg-[#0a1628] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#60a5fa]">
                {SOURCE_LABEL[snapshot.sourceKind]}
              </span>
              <div className="max-sm:hidden">
                <OnboardingCta variant="banner" />
              </div>
            </div>
            <div className="tnum mt-0.5 flex items-center gap-3 whitespace-nowrap text-[11px] text-[var(--pb-text-faint)]">
              <span>SIREN {dossier.societe.siren}</span>
              <span>·</span>
              <span>Exercice {dossier.societe.exercice}</span>
              <span className="max-sm:hidden">·</span>
              <span className="max-sm:hidden">FEC {dossier.fecFingerprint.slice(0, 12)}</span>
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

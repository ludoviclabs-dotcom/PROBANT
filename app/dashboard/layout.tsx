import { Sidebar } from "@/components/probant/Sidebar";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { computeCounts } from "@/lib/canonical-model";
import { shortHash } from "@/lib/evidence/hash";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const d = DEMO_DOSSIER;
  const counts = computeCounts(d);
  const silosFindings = d.silos.reduce((n, s) => n + s.findings.length, 0);

  const badges: Record<string, number> = {
    "/dashboard/depot": counts.bloquantesAdmissibilite,
    "/dashboard/cloisons": silosFindings,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex shrink-0 items-center gap-4 border-b border-[var(--pb-border)] bg-[var(--pb-surface)] px-6 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-[var(--pb-text)]">
                {d.societe.raisonSociale}
              </h1>
              {d.demoMode && (
                <span className="rounded-md border border-[#eab308]/50 bg-[#292207] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#eab308]">
                  Mode démo · données fictives
                </span>
              )}
            </div>
            <div className="tnum mt-0.5 flex items-center gap-3 text-[11px] text-[var(--pb-text-faint)]">
              <span>SIREN {d.societe.siren}</span>
              <span>·</span>
              <span>Exercice {d.societe.exercice}</span>
              <span>·</span>
              <span>FEC {shortHash(d.fecFingerprint)}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4 text-[11px] text-[var(--pb-text-muted)]">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                Référentiel
              </div>
              <div className="tnum font-semibold text-[var(--pb-text)]">
                v.{d.referentielVersion}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

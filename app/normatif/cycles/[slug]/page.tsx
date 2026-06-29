import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  BookMarked,
  Scale,
  Gauge,
  LineChart,
  FlaskConical,
  ShieldAlert,
  GitCompare,
  Link2,
} from "lucide-react";
import { loadAllCycles, loadCycle } from "@/lib/audit-cycles/loader";
import { CYCLE_FAMILY_LABEL, REVIEW_STATUS_LABEL } from "@/lib/audit-cycles/types";
import { siloById } from "@/lib/canonical-model";
import { NormativeStatusBadge } from "@/components/normatif/NormativeStatusBadge";
import { MaterialityPanel } from "@/components/normatif/MaterialityPanel";
import { RatioPanel } from "@/components/normatif/RatioPanel";
import { RiskMatrix } from "@/components/normatif/RiskMatrix";
import { TestDetailPanel } from "@/components/normatif/TestDetailPanel";
import { AnalyticalProceduresPanel } from "@/components/normatif/AnalyticalProceduresPanel";
import { IFRSvsPCGPanel } from "@/components/normatif/IFRSvsPCGPanel";

export async function generateStaticParams() {
  const cycles = await loadAllCycles();
  return cycles.map((c) => ({ slug: c.slug }));
}

export default async function CycleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let cycle;
  try {
    cycle = await loadCycle(slug);
  } catch {
    notFound();
  }

  const linkedSilos = (cycle.probantSiloIds ?? [])
    .map((id) => siloById(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Fil d'Ariane + en-tête */}
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[var(--pb-text-faint)]">
        <Link href="/normatif/cycles" className="hover:text-[var(--pb-text)]">
          Cycles d'audit
        </Link>
        <span>/</span>
        <span>{CYCLE_FAMILY_LABEL[cycle.family]}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--pb-text)]">{cycle.title}</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
            {cycle.summary}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-[#eab308]/30 bg-[#292207] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#eab308]">
          {REVIEW_STATUS_LABEL[cycle.reviewStatus]}
        </span>
      </div>

      {/* Comptes PCG */}
      {cycle.pcgAccounts?.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--pb-text-faint)]">Comptes PCG :</span>
          {cycle.pcgAccounts.map((c) => (
            <code
              key={c}
              className="tnum rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[11px] text-[var(--pb-text-muted)]"
            >
              {c}
            </code>
          ))}
        </div>
      )}

      {/* Cross-link PROBANT */}
      {linkedSilos.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--pb-accent)]/30 bg-[var(--pb-accent)]/5 p-3">
          <div className="flex items-center gap-2 text-[12px] text-[var(--pb-text-muted)]">
            <Link2 className="h-4 w-4 text-[var(--pb-accent)]" />
            Ce cycle est analysé automatiquement dans PROBANT :
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {linkedSilos.map((s) => (
              <Link
                key={s.id}
                href="/dashboard/cloisons"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--pb-text)] transition-colors hover:border-[var(--pb-accent)]"
              >
                Silo {s.label}
                <ArrowUpRight className="h-3.5 w-3.5 text-[var(--pb-accent)]" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Normes applicables */}
      <Section icon={BookMarked} title="Normes applicables">
        <div className="flex flex-wrap gap-2">
          {(cycle.applicableStandards ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2.5 py-1.5"
              title={s.note}
            >
              <span className="text-[12px] font-medium text-[var(--pb-text)]">{s.label}</span>
              <NormativeStatusBadge status={s.status} short />
            </div>
          ))}
        </div>
      </Section>

      {/* Seuils */}
      {(cycle.thresholds ?? []).length > 0 && (
        <Section icon={Scale} title="Seuils & règles">
          <div className="space-y-2">
            {cycle.thresholds.map((t, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-3 py-2"
              >
                <div>
                  <span className="text-[12px] font-medium text-[var(--pb-text)]">{t.label}</span>
                  <p className="text-[11px] text-[var(--pb-text-muted)]">{t.value}</p>
                  {t.caveat && (
                    <p className="text-[10px] italic text-[var(--pb-text-faint)]">{t.caveat}</p>
                  )}
                </div>
                <NormativeStatusBadge status={t.status} short />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Matérialité */}
      <Section icon={Gauge} title="Seuils de signification & matérialité">
        <MaterialityPanel materiality={cycle.materiality} />
      </Section>

      {/* Ratios */}
      <Section icon={LineChart} title="Ratios clés & bornes d'alerte">
        <RatioPanel ratios={cycle.ratios} />
      </Section>

      {/* Procédures analytiques */}
      <Section icon={LineChart} title="Procédures analytiques">
        <AnalyticalProceduresPanel procedures={cycle.analyticalProcedures} />
      </Section>

      {/* Tests de détail */}
      <Section icon={FlaskConical} title="Tests de détail">
        <TestDetailPanel tests={cycle.detailTests} />
      </Section>

      {/* Risques */}
      <Section icon={ShieldAlert} title="Matrice des risques">
        <RiskMatrix risks={cycle.risks} />
      </Section>

      {/* IFRS vs PCG */}
      <Section icon={GitCompare} title="Différences IFRS vs PCG">
        <IFRSvsPCGPanel differences={cycle.ifrsVsPcg} />
      </Section>

      {/* Points clés */}
      {(cycle.keyPoints ?? []).length > 0 && (
        <Section icon={BookMarked} title="Points clés">
          <ul className="space-y-1.5">
            {cycle.keyPoints.map((k, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-[var(--pb-text-muted)]">
                <span className="text-[var(--pb-accent)]">•</span>
                {k}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Sources officielles */}
      <Section icon={BookMarked} title="Sources officielles">
        <div className="space-y-1.5">
          {(cycle.officialSources ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[12px]">
              <Link
                href={`/normatif/sources/${s.id}`}
                className="font-medium text-[var(--pb-text)] hover:text-[var(--pb-accent)]"
              >
                {s.label}
              </Link>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--pb-accent)] hover:underline"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Cycles connexes */}
      {(cycle.relatedCycles ?? []).length > 0 && (
        <Section icon={Link2} title="Cycles connexes">
          <div className="flex flex-wrap gap-2">
            {cycle.relatedCycles.map((rc) => (
              <Link
                key={rc}
                href={`/normatif/cycles/${rc}`}
                className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2.5 py-1 text-[12px] text-[var(--pb-text-muted)] transition-colors hover:text-[var(--pb-text)]"
              >
                {rc}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Export */}
      <div className="mt-8 flex items-center gap-3 border-t border-[var(--pb-border)] pt-4">
        <a
          href={`/api/normatif/export?format=md&slug=${cycle.slug}`}
          className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface)] px-3 py-2 text-[12px] font-medium text-[var(--pb-text-muted)] transition-colors hover:text-[var(--pb-text)]"
        >
          Exporter cette fiche (Markdown)
        </a>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2.5 flex items-center gap-2 text-[14px] font-semibold text-[var(--pb-text)]">
        <Icon className="h-4 w-4 text-[var(--pb-text-faint)]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

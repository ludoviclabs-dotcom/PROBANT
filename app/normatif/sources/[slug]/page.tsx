import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { loadAllCycles, loadAllSources } from "@/lib/audit-cycles/loader";
import { NormativeStatusBadge } from "@/components/normatif/NormativeStatusBadge";

export async function generateStaticParams() {
  const sources = await loadAllSources();
  return sources.map((s) => ({ slug: s.id }));
}

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [sources, cycles] = await Promise.all([loadAllSources(), loadAllCycles()]);
  const source = sources.find((s) => s.id === slug);
  if (!source) notFound();

  const referencing = cycles.filter((c) =>
    [
      ...(c.applicableStandards ?? []),
      ...(c.officialSources ?? []),
    ].some((s) => s.id === slug),
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link
        href="/normatif/sources"
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-[var(--pb-text-faint)] hover:text-[var(--pb-text)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Sources normatives
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--pb-text-faint)]">
            {source.type}
          </span>
          <h1 className="mt-2 text-xl font-bold text-[var(--pb-text)]">{source.label}</h1>
        </div>
        <NormativeStatusBadge status={source.status} />
      </div>

      {source.summary && (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
          {source.summary}
        </p>
      )}

      <div className="mt-4 space-y-2 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 text-[12px]">
        {source.article && (
          <Row label="Article">{source.article}</Row>
        )}
        {source.paragraph && (
          <Row label="Paragraphe">{source.paragraph}</Row>
        )}
        {source.effectiveDate && (
          <Row label="Entrée en vigueur">{source.effectiveDate}</Row>
        )}
        <Row label="Lien officiel">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--pb-accent)] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {source.url}
            </a>
          ) : (
            <span className="text-[#eab308]">URL manquante — à compléter</span>
          )}
        </Row>
        {source.note && <Row label="Note">{source.note}</Row>}
      </div>

      <h2 className="mb-2 mt-6 text-[14px] font-semibold text-[var(--pb-text)]">
        Cycles rattachés ({referencing.length})
      </h2>
      {referencing.length === 0 ? (
        <p className="text-[12px] text-[var(--pb-text-faint)]">
          Aucun cycle ne référence directement cette source.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {referencing.map((c) => (
            <Link
              key={c.slug}
              href={`/normatif/cycles/${c.slug}`}
              className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2.5 py-1 text-[12px] text-[var(--pb-text-muted)] transition-colors hover:text-[var(--pb-text)]"
            >
              {c.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 text-[var(--pb-text-faint)]">{label}</span>
      <span className="text-[var(--pb-text-muted)]">{children}</span>
    </div>
  );
}

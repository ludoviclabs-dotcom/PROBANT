import type { SourceNormative } from "@/lib/canonical-model";

/**
 * Chronologie des versions — bâtie sur les dates d'effet RÉELLES des textes
 * cités (aucune version inventée). Chaque jalon agrège les sources entrées en
 * vigueur cette année-là.
 */
export function VersionTimeline({ sources }: { sources: SourceNormative[] }) {
  const byDate = new Map<string, number>();
  for (const s of sources) {
    byDate.set(s.effectiveDate, (byDate.get(s.effectiveDate) ?? 0) + 1);
  }
  const points = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <h3 className="text-sm font-semibold text-[var(--pb-text)]">
        Chronologie des versions
      </h3>
      <p className="mt-0.5 text-[11px] text-[var(--pb-text-muted)]">
        Dates d'effet des textes cités — réelles, non inventées.
      </p>
      <div className="relative mt-6 flex items-start justify-between">
        <div className="absolute left-0 right-0 top-1.5 h-px bg-[var(--pb-border-strong)]" />
        {points.map(([date, n]) => (
          <div key={date} className="relative flex flex-1 flex-col items-center">
            <span className="z-10 h-3 w-3 rounded-full border-2 border-[var(--pb-bg)] bg-[var(--pb-accent)]" />
            <span className="tnum mt-2 text-[12px] font-semibold text-[var(--pb-text)]">
              {date.slice(0, 4)}
            </span>
            <span className="text-[10px] text-[var(--pb-text-faint)]">
              {n} texte{n > 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

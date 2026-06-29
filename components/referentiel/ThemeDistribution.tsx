import type { SourceNormative } from "@/lib/canonical-model";
import { THEME_META, THEME_ORDER } from "./themes";

/**
 * Répartition des sources par thème — barres horizontales en CSS pur
 * (aucune dépendance de graphe), couleurs cohérentes avec le thème dark.
 */
export function ThemeDistribution({ sources }: { sources: SourceNormative[] }) {
  const counts = THEME_ORDER.map((t) => ({
    theme: t,
    hex: THEME_META[t].hex,
    n: sources.filter((s) => s.theme === t).length,
  })).filter((c) => c.n > 0);
  const max = Math.max(1, ...counts.map((c) => c.n));

  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <h3 className="text-sm font-semibold text-[var(--pb-text)]">
        Répartition par thème
      </h3>
      <p className="mt-0.5 text-[11px] text-[var(--pb-text-muted)]">
        {sources.length} sources normatives versionnées.
      </p>
      <div className="mt-3 space-y-1.5">
        {counts.map((c) => (
          <div key={c.theme} className="flex items-center gap-2">
            <span className="w-36 shrink-0 truncate text-[11px] text-[var(--pb-text-muted)]">
              {c.theme}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--pb-surface-2)]">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(c.n / max) * 100}%`, backgroundColor: c.hex }}
              />
            </div>
            <span className="tnum w-5 shrink-0 text-right text-[11px] font-semibold text-[var(--pb-text)]">
              {c.n}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

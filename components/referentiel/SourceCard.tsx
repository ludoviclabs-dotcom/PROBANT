import type { SourceNormative } from "@/lib/canonical-model";
import { REGISTRY_META, THEME_META, registryOf } from "./themes";

/**
 * Carte normative compacte : code de référence, thème, criticité (barre de
 * registre) et date de version. La citation n'est pas affichée par défaut —
 * elle apparaît en tooltip au survol.
 */
export function SourceCard({ source }: { source: SourceNormative }) {
  const theme = source.theme;
  const registry = registryOf(theme);
  const themeHex = theme ? THEME_META[theme].hex : REGISTRY_META[registry].hex;
  const barHex = REGISTRY_META[registry].hex;

  return (
    <div
      className="group relative rounded-xl border border-l-4 border-[var(--pb-border)] bg-[var(--pb-surface)] p-3 transition-colors hover:border-[var(--pb-border-strong)]"
      style={{ borderLeftColor: barHex }}
    >
      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-[13px] font-semibold text-[var(--pb-text)]">
          {source.ref}
        </code>
        <span className="tnum shrink-0 rounded-md border border-[var(--pb-border)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-faint)]">
          v.{source.effectiveDate}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {theme && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ color: themeHex, backgroundColor: `${themeHex}1f` }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: themeHex }}
            />
            {theme}
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
          {REGISTRY_META[registry].short}
        </span>
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[10px] text-[var(--pb-accent)] hover:underline"
          >
            source ↗
          </a>
        )}
      </div>

      {/* Citation — visible uniquement au survol */}
      <div className="pointer-events-none absolute left-2 right-2 top-full z-20 mt-1 rounded-lg border border-[var(--pb-border-strong)] bg-[var(--pb-surface-3)] p-3 text-[11px] leading-relaxed text-[var(--pb-text-muted)] opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {source.citation}
      </div>
    </div>
  );
}

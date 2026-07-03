import { BookOpen, Scale } from "lucide-react";
import type { SourceNormative } from "@/lib/canonical-model";
import { REGISTRY_META, THEME_META, registryOf } from "./themes";

/**
 * Carte normative : barre latérale colorée par THÈME (identification en un
 * coup d'œil), extrait de paraphrase tronqué en aperçu, badge nature (droit
 * dur / méthode) avec icône. La citation complète reste disponible en
 * tooltip au survol (aperçu tronqué → texte intégral).
 *
 * Le dimming (cross-highlight) est porté par CE composant en style inline ;
 * l'animation d'entrée (keyframe) est appliquée par le parent sur un wrapper
 * englobant — jamais les deux sur le même élément (une `animation` CSS prime
 * sur un style inline, ce qui écraserait l'opacité de dimming en continu).
 */
export function SourceCard({
  source,
  dimmed = false,
}: {
  source: SourceNormative;
  dimmed?: boolean;
}) {
  const theme = source.theme;
  const registry = registryOf(theme);
  const themeHex = theme ? THEME_META[theme].hex : REGISTRY_META[registry].hex;
  const isDroitDur = registry === "droit-dur";

  return (
    <div
      className="group relative flex overflow-hidden rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] hover:-translate-y-0.5 hover:border-[var(--pb-border-strong)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.35)]"
      style={{
        opacity: dimmed ? 0.3 : 1,
        filter: dimmed ? "grayscale(55%)" : "none",
        transition: "opacity 200ms ease, filter 200ms ease, transform 200ms ease, box-shadow 200ms ease",
      }}
    >
      <span
        className="w-1 shrink-0 group-hover:w-1.5"
        style={{ backgroundColor: themeHex, transition: "width 200ms ease" }}
      />
      <div className="min-w-0 flex-1 p-3">
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
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: themeHex }} />
              {theme}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pb-surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--pb-text-faint)]">
            {isDroitDur ? <Scale className="h-2.5 w-2.5" /> : <BookOpen className="h-2.5 w-2.5" />}
            {REGISTRY_META[registry].short}
          </span>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 text-[10px] text-[var(--pb-accent)] hover:underline"
            >
              source ↗
            </a>
          )}
        </div>

        <p className="mt-2 line-clamp-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
          {source.citation}
        </p>
      </div>

      {/* Citation intégrale — visible uniquement au survol */}
      <div className="pointer-events-none absolute left-2 right-2 top-full z-20 mt-1 rounded-lg border border-[var(--pb-border-strong)] bg-[var(--pb-surface-3)] p-3 text-[11px] leading-relaxed text-[var(--pb-text-muted)] opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {source.citation}
      </div>
    </div>
  );
}

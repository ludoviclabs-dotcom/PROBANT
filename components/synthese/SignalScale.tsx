import type { SignalView } from "@/lib/synthese-view/measures";
import type { Variant } from "./SectionHead";
import s from "./synthese.module.css";

const BANDS = [
  { at: 0, label: "faible" },
  { at: 20, label: "modéré" },
  { at: 40, label: "notable" },
  { at: 60, label: "élevé" },
] as const;

/**
 * Signal heuristique : une échelle linéaire graduée de 0 à 100, jamais une jauge ni un anneau. Il est subordonné
 * au verdict et le dit : paramètre interne, non opposable, pas un score de conformité.
 */
export function SignalScale({ signal, variant }: { signal: SignalView; variant: Variant }) {
  const pos = `${signal.index}%`;
  if (variant === "A") {
    return (
      <div data-a="txt" className={s.signalA}>
        <div className={s.signalHead}>
          <span className={s.signalTitle}>Signal heuristique</span>
          <span className={s.signalMeta}>paramètre interne · non opposable</span>
        </div>
        <div className={s.signalValue}>
          <span className={s.signalNumber}>{signal.index}</span>
          <span className={s.signalOutOf}>/100</span>
          <span className={s.signalBand}>{signal.band}</span>
        </div>
        <div role="img" aria-label={signal.aria} className={s.scaleA}>
          <div className={s.segments}>
            {signal.segments.map((on, i) => (
              <span key={i} className={s.segment} data-on={on ? "" : undefined} />
            ))}
          </div>
          <div aria-hidden="true" className={s.needle} style={{ left: pos }} />
          <div aria-hidden="true" className={s.bandLabels}>
            {BANDS.map((band) => (
              <span key={band.label} className={s.bandLabel} data-active={band.label === signal.band ? "" : undefined} style={{ left: `${band.at}%` }}>
                {band.label}
              </span>
            ))}
          </div>
        </div>
        <p className={s.signalCaption}>100·W/(W+52), poids 25/8/2/0,5. Signal subordonné au verdict ; ce n’est pas un score de conformité.</p>
      </div>
    );
  }
  return (
    <div className={s.signalB}>
      <div className={s.signalHeadB}>
        <span>
          Signal heuristique · <span className={s.inkText}>{signal.index}</span>/100 · {signal.band}
        </span>
        <span>non opposable</span>
      </div>
      <div role="img" aria-label={signal.aria} className={s.scaleB}>
        <div aria-hidden="true" className={s.scaleFine} />
        <div aria-hidden="true" className={s.scaleCoarse} />
        <div aria-hidden="true" className={s.scaleFill} style={{ width: pos }} />
        <div aria-hidden="true" className={s.scaleNeedle} style={{ left: pos }} />
      </div>
      <div aria-hidden="true" className={s.scaleTicks}>
        {[0, 20, 40, 60, 80, 100].map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <p className={s.signalCaption}>100·W/(W+52), poids 25/8/2/0,5 · seuils 20/40/60 · ce n’est pas un score de conformité.</p>
    </div>
  );
}

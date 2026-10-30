import type { CriticityBand } from "@/lib/risk-mapping";
import { BAND_LABEL } from "@/lib/risk-mapping/view";
import s from "./risk.module.css";

/**
 * Niveau de criticité selon la charte : une pastille carrée dont la LUMINOSITÉ porte le rang (critique en signal,
 * élevé en encre, modéré en encre 2, faible en gris, non évalué hachuré) et, toujours, le mot. La teinte seule ne
 * porte jamais l'information.
 */

/** Couleur SVG d'une bande (jetons de l'ambiance) ; « non évalué » se dessine en contour tireté, sans remplissage. */
export const BAND_COLOR: Record<CriticityBand, string> = {
  critique: "var(--pb-signal)",
  élevé: "var(--pb-ink)",
  modéré: "var(--pb-ink-2)",
  faible: "var(--pb-sev-informatif)",
  non_évalué: "var(--pb-ink-3)",
};

export function BandSwatch({ band }: { band: CriticityBand }) {
  return <span aria-hidden="true" className={s.swatch} data-band={band} />;
}

/** Pastille + mot. `value` ajoute l'entier du composite devant (colonne du registre). */
export function BandMark({ band, value }: { band: CriticityBand; value?: string }) {
  return (
    <span className={s.level}>
      {value !== undefined && <span className={s.levelValue}>{value}</span>}
      <BandSwatch band={band} />
      {BAND_LABEL[band]}
    </span>
  );
}

import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { formatInt } from "@/lib/format/fr";
import { plural } from "@/lib/synthese-view/common";
import type { AdmissibilityMeasure, CoverageMeasure, ReviewMeasure } from "@/lib/synthese-view/measures";
import { useCountTo } from "./useCountTo";
import s from "./synthese.module.css";

const TICK_COLOR: Record<string, string> = {
  pending: "var(--pb-rule-strong)",
  proposed: "var(--pb-verif)",
  corrected: "var(--pb-verif)",
  dismissed: "var(--pb-ink-2)",
};

/**
 * Trois mesures de décision en ligne continue, séparées par des filets : admissibilité du FEC, couverture de
 * l'analyse, avancement de la revue. Chaque mesure = un chiffre ou un mot en mono, un mini-graphe de traits, une
 * ligne de texte. Aucun pourcentage de couverture sans dénominateur qualifié.
 */
export function MeasureStrip({
  admissibility,
  coverage,
  review,
  worksNote,
}: {
  admissibility: AdmissibilityMeasure;
  coverage: CoverageMeasure;
  review: ReviewMeasure;
  /** Phrase sur la couverture des travaux (feuilles réalisées), pour que « non établie » reste visible. */
  worksNote: string;
}) {
  const shown = Math.round(useCountTo(review.reviewed));
  return (
    <div className={s.measures}>
      <div data-a="txt" className={s.measure}>
        <div className={s.measureHead}>
          <span className={s.measureLabel}>Admissibilité du FEC</span>
          <span className={s.measureRef}>A.47 A-1</span>
        </div>
        <div className={s.measureValue}>
          {admissibility.glyph && <SeverityGlyph severity={admissibility.glyph} size={12} />}
          <span className={s.measureWord}>{admissibility.word}</span>
        </div>
        <svg viewBox="0 0 180 20" width="100%" height={20} preserveAspectRatio="none" aria-hidden="true" focusable="false" className={s.measureSvg}>
          {admissibility.ticks.map((tick, i) => (
            <line
              key={tick.zone}
              x1={5 + i * 10}
              y1={tick.flagged ? 0 : 8}
              x2={5 + i * 10}
              y2={20}
              strokeWidth={tick.flagged ? 3 : 1}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: tick.flagged ? "var(--pb-signal)" : "var(--pb-sev-informatif)" }}
            />
          ))}
        </svg>
        <p className={s.measureText}>{admissibility.text}</p>
      </div>

      <div data-a="txt" className={s.measure}>
        <div className={s.measureHead}>
          <span className={s.measureLabel}>Couverture de l’analyse</span>
          <span className={s.measureRef}>C03</span>
        </div>
        <div role="img" aria-label={coverage.aria}>
          <div className={s.measureValue}>
            <span className={s.measureWord}>{coverage.word}</span>
          </div>
          <svg viewBox="0 0 180 20" width="100%" height={20} preserveAspectRatio="none" aria-hidden="true" focusable="false" className={s.measureSvg}>
            <line x1={0} y1={6} x2={180} y2={6} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--pb-ink-2)" }} />
            <line x1={0} y1={15} x2={180} y2={15} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--pb-sev-informatif)" }} />
            {coverage.populations.map((population, i) =>
              population.ratio === null ? null : (
                <line key={population.id} x1={0} y1={i === 0 ? 6 : 15} x2={Math.max(1, (population.ratio / 100) * 180)} y2={i === 0 ? 6 : 15} strokeWidth={3} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--pb-verif)" }} />
              ),
            )}
            <line x1={0.5} y1={2} x2={0.5} y2={20} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--pb-ink-2)" }} />
          </svg>
          <ul className={s.populations}>
            {coverage.populations.map((population) => (
              <li key={population.id}>
                {population.label} · {population.state}
                {population.ratio !== null && <span className={s.mono}> · {population.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className={s.measureText}>{worksNote}</p>
      </div>

      <div data-a="txt" className={s.measure}>
        <div className={s.measureHead}>
          <span className={s.measureLabel}>Avancement de la revue</span>
          <span className={s.measureRef}>{review.pct} %</span>
        </div>
        <div className={s.measureValue}>
          <span className={s.measureWord} aria-hidden="true">{shown}</span>
          <span className={s.measureTotal}>/{review.total}</span>
          <span className="sr-only" role="status">{review.reviewed} {plural(review.reviewed, "constat arbitré", "constats arbitrés")} sur {review.total}</span>
        </div>
        <svg viewBox="0 0 180 20" width="100%" height={20} preserveAspectRatio="none" aria-hidden="true" focusable="false" className={s.measureSvg}>
          {review.ticks.map((tick, i) => (
            <line
              key={tick.id}
              x1={2 + (review.ticks.length > 1 ? i * (176 / (review.ticks.length - 1)) : 0)}
              y1={tick.stage === "pending" ? 10 : 2}
              x2={2 + (review.ticks.length > 1 ? i * (176 / (review.ticks.length - 1)) : 0)}
              y2={20}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: TICK_COLOR[tick.stage] }}
            />
          ))}
        </svg>
        <p className={s.measureText}>{review.text}</p>
      </div>
    </div>
  );
}

/** Texte « couverture des travaux » : l'absence de feuille est dite, jamais comblée. */
export function worksCoverageNote(rows: number): string {
  return rows > 0 ? `${formatInt(rows)} procédure${rows > 1 ? "s" : ""} réalisée${rows > 1 ? "s" : ""} dans ce dossier · détail dans la méthode` : "couverture des travaux non établie : aucune procédure réalisée dans ce dossier";
}

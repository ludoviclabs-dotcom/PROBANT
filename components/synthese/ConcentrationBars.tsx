import { SEVERITY_LABEL } from "@/lib/canonical-model/finding";
import { SEVERITIES } from "@/lib/synthese-view/common";
import type { Concentration } from "@/lib/synthese-view/concentration";
import { isFiltering, matches, type CrossFilter } from "./filter";
import s from "./synthese.module.css";

/** Motif de segment par gravité : aplat, hachures 135°, filets horizontaux, semis de points. */
const SEGMENT_BACKGROUND = {
  bloquant: "var(--pb-sev-bloquant)",
  majeur: "repeating-linear-gradient(135deg, var(--pb-signal) 0 2px, color-mix(in srgb, var(--pb-sev-majeur) 40%, transparent) 2px 5px)",
  mineur: "var(--pb-sev-mineur)",
  informatif: "radial-gradient(circle, var(--pb-ink-3) 1px, transparent 1.3px) 0 0 / 5px 5px",
} as const;

/**
 * Concentration par cycle : barres triées par nombre de constats, segmentées par gravité, avec l'exposition chiffrée
 * en bout de ligne (par poste et par sens, jamais additionnée) et la courbe de concentration cumulée, diagonale =
 * répartition uniforme. Suit le filtre croisé : ce qui n'y répond pas s'atténue.
 */
export function ConcentrationBars({ data, filter }: { data: Concentration; filter: CrossFilter }) {
  const fx = isFiltering(filter);
  const max = Math.max(1, ...data.rows.map((r) => r.n));
  const AXIS = { x0: 16, y0: 168, size: 152 };
  const point = (p: { x: number; y: number }) => `${(AXIS.x0 + p.x * AXIS.size).toFixed(1)} ${(AXIS.y0 - p.y * AXIS.size).toFixed(1)}`;
  const marker = data.curve[Math.min(data.topCount, data.curve.length - 1)];

  return (
    <figure data-anim-group="cc" className={s.concentrationFigure}>
      <figcaption>
        <h3 className={s.figTitle}>{data.title}</h3>
        <p className={s.figMethod}>
          Barres triées par nombre de constats, segmentées par gravité · exposition initiale en bout de ligne, par poste et sens · {data.total} constats rattachés à un cycle
          {data.unassigned > 0 ? `, ${data.unassigned} non rattaché${data.unassigned > 1 ? "s" : ""} (admissibilité du FEC)` : ""}
        </p>
      </figcaption>
      <div className={s.concentrationBody}>
        {data.rows.length === 0 && <p className={s.emptyNote}>Aucun constat n’est rattaché à un cycle.</p>}
        <div role={data.rows.length > 0 ? "list" : undefined} aria-label={data.rows.length > 0 ? "Constats par cycle" : undefined} className={s.bars} hidden={data.rows.length === 0}>
          {data.rows.map((row) => {
            const inFilter = row.members.filter((m) => matches(filter, m));
            const kept = row.counts;
            const breakdown = SEVERITIES.filter((sev) => kept[sev] > 0).map((sev) => `${kept[sev]} ${SEVERITY_LABEL[sev].toLowerCase()}`).join(", ");
            return (
              <div key={row.id} role="listitem" data-a="bar" className={s.barRow}>
                <span className={s.barLabel} data-dim={fx && inFilter.length === 0 ? "" : undefined}>{row.label}</span>
                <div className={s.barTrack} style={{ width: `${(row.n / max) * 100}%` }}>
                  {SEVERITIES.map((sev) => {
                    if (!kept[sev]) return null;
                    const filteredCount = inFilter.filter((m) => m.severity === sev).length;
                    return <span key={sev} className={s.barSegment} title={`${SEVERITY_LABEL[sev]} : ${kept[sev]}`} style={{ flex: kept[sev], background: SEGMENT_BACKGROUND[sev], opacity: fx && filteredCount === 0 ? 0.2 : 1 }} />;
                  })}
                </div>
                <span className={`${s.mono} ${s.barCount}`}>{fx ? `${inFilter.length}/${row.n}` : row.n}<span className="sr-only"> constats, dont {breakdown}</span></span>
                <span className={s.barExposure}>
                  {row.effects.length === 0 && row.indeterminate === 0 ? "—" : null}
                  {row.effects.map((effect) => (
                    <span key={effect.key} title={effect.label}>{effect.text}</span>
                  ))}
                  {row.indeterminate > 0 && <span>indéterminé</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className={s.lorenz}>
          <svg viewBox="0 0 184 184" width={184} height={184} aria-hidden="true" focusable="false">
            <line x1={AXIS.x0} y1={AXIS.y0} x2={AXIS.x0 + AXIS.size} y2={AXIS.y0 - AXIS.size} strokeWidth={1} strokeDasharray="3 3" style={{ stroke: "var(--pb-rule-strong)" }} />
            <line x1={AXIS.x0} y1={AXIS.y0} x2={AXIS.x0 + AXIS.size} y2={AXIS.y0} strokeWidth={1} style={{ stroke: "var(--pb-rule-strong)" }} />
            <line x1={AXIS.x0} y1={AXIS.y0 - AXIS.size} x2={AXIS.x0} y2={AXIS.y0} strokeWidth={1} style={{ stroke: "var(--pb-rule-strong)" }} />
            {data.curve.length > 1 && <path d={`M${data.curve.map(point).join("L")}`} fill="none" strokeWidth={1.4} style={{ stroke: "var(--pb-ink)" }} />}
            {data.rows.length > 0 && (
              <>
                <circle cx={AXIS.x0 + marker.x * AXIS.size} cy={AXIS.y0 - marker.y * AXIS.size} r={3.5} strokeWidth={1.4} style={{ fill: "var(--pb-bg)", stroke: "var(--pb-ink)" }} />
                <line x1={AXIS.x0 + marker.x * AXIS.size} y1={AXIS.y0 - marker.y * AXIS.size} x2={AXIS.x0 + marker.x * AXIS.size} y2={AXIS.y0} strokeWidth={1} strokeDasharray="2 2" style={{ stroke: "var(--pb-ink-3)" }} />
              </>
            )}
          </svg>
          <p className={s.lorenzText}>
            {data.rows.length > 0 ? `${data.topCount} cycles sur ${data.rows.length} (${Math.round((100 * data.topCount) / data.rows.length)} %) → ${data.topShare} % des constats. Diagonale : répartition uniforme.` : "Aucune courbe sans constat rattaché."}
          </p>
        </div>
      </div>
    </figure>
  );
}

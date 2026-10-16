import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { SEVERITY_LABEL } from "@/lib/canonical-model/finding";
import type { Multiples, Strata, FriezeItem } from "@/lib/synthese-view/exploration";
import { FAMILY } from "@/components/charte/severity";
import s from "./synthese.module.css";

/** Fond de barre par gravité : aplat, hachures, filets, points (même langage que le Sankey et la concentration). */
const SEVERITY_BAR = {
  bloquant: "var(--pb-sev-bloquant)",
  majeur: "repeating-linear-gradient(135deg, var(--pb-signal) 0 2px, color-mix(in srgb, var(--pb-sev-majeur) 40%, transparent) 2px 5px)",
  mineur: "var(--pb-sev-mineur)",
  informatif: "radial-gradient(circle, var(--pb-ink-3) 1px, transparent 1.3px) 0 0 / 5px 5px",
} as const;

/**
 * Petits multiples par cloison : ils remplacent le donut et le radar. Une même échelle pour toutes les cloisons,
 * quatre barres (une par gravité), le nombre à droite.
 */
export function SmallMultiples({ data }: { data: Multiples }) {
  return (
    <div className={s.explBlock}>
      <p className={s.explLead}>{data.title}</p>
      <div className={s.multiples}>
        {data.panels.map((panel) => (
          <div key={panel.id} className={s.multiple}>
            <div className={s.multipleHead}>
              <span>{panel.label}</span>
              <span className={s.mono}>{panel.n}</span>
            </div>
            {panel.rows.map((row) => (
              <div key={row.severity} className={s.multipleRow}>
                <SeverityGlyph severity={row.severity} />
                <div className={s.multipleTrack} title={`${SEVERITY_LABEL[row.severity]} : ${row.n}`}>
                  <div style={{ height: "100%", width: `${row.ratio * 100}%`, background: SEVERITY_BAR[row.severity] }} />
                </div>
                <span className={s.mono}>{row.n}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Strates normatives : une ligne par famille, le trait de la famille à la longueur du nombre de constats. */
export function NormativeStrata({ data }: { data: Strata }) {
  return (
    <div className={s.explBlock}>
      <p className={s.explLead}>{data.title}</p>
      {data.rows.map((row) => {
        const spec = FAMILY[row.family];
        return (
          <div key={row.family} className={s.strataRow}>
            <div>
              <div className={s.strataLabel}>{row.label}</div>
              <div className={s.strataSub}>{row.sub}</div>
            </div>
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" width="100%" height={8} aria-hidden="true" focusable="false">
              <line x1={0} y1={4} x2={row.length} y2={4} strokeWidth={spec.width} strokeDasharray={spec.dash === "none" ? undefined : spec.dash} vectorEffect="non-scaling-stroke" style={{ stroke: spec.color }} />
              <line x1={row.length} y1={0} x2={row.length} y2={8} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: spec.color }} />
            </svg>
            <span className={`${s.mono} ${s.alignRight}`}>{row.n}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Frise des référentiels : les repères datés des sources citées par les constats (date d'entrée en vigueur du
 * registre `lib/referentiel`), puis l'édition du référentiel chargée. Citations et dates en statut « revue requise ».
 */
export function StandardsFrieze({ items }: { items: readonly FriezeItem[] }) {
  return (
    <div className={s.explBlock}>
      <p className={s.explLead}>
        {items.length} repères datés fondent les règles appliquées au dossier. Citations et dates en statut « revue requise » : à valider par un expert.
      </p>
      <div role="region" aria-label="Frise des référentiels" tabIndex={0} className={s.scrollX}>
        <ol className={s.frieze}>
          <li aria-hidden="true" className={s.friezeAxis} />
          {items.map((item) => (
            <li key={item.key} className={s.friezeItem} data-side={item.side} style={{ left: `${item.left}%` }}>
              <span className={`${s.mono} ${s.friezeYear}`}>{item.year}</span>
              <span className={s.friezeTitle}>{item.title}</span>
              <span className={s.friezeSub}>{item.sub}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { SEVERITY_LABEL, type Finding, type Severity } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { FAMILY_ORDER, FAMILY_TEXT, SEVERITIES, plural, type CloisonDef } from "@/lib/synthese-view/common";
import { SANKEY, type SankeyLayout } from "@/lib/synthese-view/sankey";
import { isFiltering, type CrossFilter } from "./filter";
import type { Variant } from "./SectionHead";
import s from "./synthese.module.css";

const SEVERITY_FILL: Record<Severity, string> = {
  bloquant: "var(--pb-sev-bloquant)",
  majeur: "var(--pb-sev-majeur)",
  mineur: "var(--pb-sev-mineur)",
  informatif: "var(--pb-sev-informatif)",
};

/**
 * Sankey cloison → gravité : épaisseur = nombre de constats, gravité codée par luminosité, MOTIF et libellé
 * (aplat, hachures, filets, points). Cliquer un flux, un nœud ou un bouton filtre toute la section ; les autres
 * flux passent à 12 %. Le survol donne le détail (nombre, répartition par famille de règles). Les boutons et
 * l'alternative tabulaire offrent les mêmes lectures au clavier et aux lecteurs d'écran.
 */
export function CloisonSankey({
  layout,
  clos,
  findings,
  filter,
  onToggleClo,
  onToggleSev,
  onToggleBand,
  title,
  variant,
}: {
  layout: SankeyLayout;
  clos: readonly CloisonDef[];
  findings: readonly Finding[];
  filter: CrossFilter;
  onToggleClo: (id: CloisonId) => void;
  onToggleSev: (sev: Severity) => void;
  onToggleBand: (clo: CloisonId, sev: Severity) => void;
  title: string;
  variant: Variant;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<string | null>(null);
  const { height: H, xLeft, xRight } = SANKEY;
  const fx = isFiltering(filter);
  const cloLabel = new Map(clos.map((c) => [c.id, c.label]));

  const tipBand = hover ? layout.bands.find((b) => b.key === hover) : undefined;
  const tipText = tipBand
    ? (() => {
        const members = findings.filter((f) => f.cloison === tipBand.clo && f.severity === tipBand.sev);
        const families = FAMILY_ORDER.map((family) => [family, members.filter((f) => f.family === family).length] as const)
          .filter(([, n]) => n > 0)
          .map(([family, n]) => `${n} ${FAMILY_TEXT[family].label.toLowerCase()}`)
          .join(" · ");
        return { title: `${cloLabel.get(tipBand.clo)} → ${SEVERITY_LABEL[tipBand.sev]}`, text: `${tipBand.n} ${plural(tipBand.n, "constat")} · ${families}` };
      })()
    : null;

  const aria = `Diagramme de Sankey : ${layout.left.map((n) => `${n.label} ${n.n}`).join(", ")}. Gravités : ${layout.right.map((n) => `${SEVERITY_LABEL[n.id as Severity]} ${n.n}`).join(", ")}.`;

  return (
    <figure data-anim-group="sankey" data-tour="synthese-sankey" className={s.figure}>
      {variant === "B" && (
        <>
          <span aria-hidden="true" className={s.cornerTL} />
          <span aria-hidden="true" className={s.cornerTR} />
        </>
      )}
      <figcaption className={s.figCaption}>
        <h3 className={s.figTitle}>{title}</h3>
        <p className={s.figMethod}>Flux cloison → gravité · épaisseur proportionnelle au nombre de constats · gravité encodée par luminosité, motif et libellé</p>
      </figcaption>

      <div role="region" aria-label="Diagramme cloison → gravité, défilement horizontal" tabIndex={0} className={s.chartScroll}>
        <div className={s.sankeyBox}>
          <svg viewBox={`0 0 1000 ${H}`} width="100%" role="img" aria-label={aria} className={s.sankeySvg}>
            <defs>
              <pattern id={`hM-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fillOpacity="0.4" style={{ fill: "var(--pb-sev-majeur)" }} />
                <rect width="2.2" height="6" style={{ fill: "var(--pb-signal)" }} />
              </pattern>
              <pattern id={`hm-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse">
                <rect width="4" height="4" fillOpacity="0.22" style={{ fill: "var(--pb-sev-mineur)" }} />
                <rect width="4" height="1.2" style={{ fill: "var(--pb-sev-mineur)" }} />
              </pattern>
              <pattern id={`dI-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse">
                <circle cx="2.5" cy="2.5" r="1.1" style={{ fill: "var(--pb-ink-3)" }} />
              </pattern>
            </defs>
            {layout.bands.map((band) => {
              const match = (!filter.clo || filter.clo === band.clo) && (!filter.sev || filter.sev === band.sev);
              const on = hover ? hover === band.key : match;
              const fill = band.sev === "bloquant" ? "var(--pb-sev-bloquant)" : band.sev === "majeur" ? `url(#hM-${uid})` : band.sev === "mineur" ? `url(#hm-${uid})` : `url(#dI-${uid})`;
              return (
                <g key={band.key}>
                  <path
                    data-a="band"
                    data-tour-flow={band.key}
                    d={band.d}
                    fillOpacity={on ? (hover || fx ? 1 : 0.82) : 0.12}
                    className={s.band}
                    style={{ fill }}
                    onMouseEnter={() => setHover(band.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onToggleBand(band.clo, band.sev)}
                  />
                  <path data-a="flow" d={band.edge} fill="none" strokeOpacity={on ? 0.6 : 0.1} strokeWidth={0.8} pathLength={1} strokeDasharray={1} className={s.bandEdge} style={{ stroke: "var(--pb-ink)" }} />
                </g>
              );
            })}
            {layout.left.map((n) => (
              <g key={n.id}>
                <rect x={xLeft - 4} y={n.y} width={4} height={Math.max(n.h, 1)} style={{ fill: !filter.clo || filter.clo === n.id ? "var(--pb-ink)" : "var(--pb-rule-strong)" }} />
                <rect x={0} y={n.hitY} width={xLeft} height={n.hitH} fill="transparent" className={s.hit} onClick={() => onToggleClo(n.id as CloisonId)} />
              </g>
            ))}
            {layout.right.map((n) => (
              <g key={n.id}>
                <rect x={xRight} y={n.y} width={4} height={n.h} style={{ fill: !filter.sev || filter.sev === n.id ? SEVERITY_FILL[n.id as Severity] : "var(--pb-rule-strong)" }} />
                <rect x={xRight} y={n.hitY} width={1000 - xRight} height={n.hitH} fill="transparent" className={s.hit} onClick={() => onToggleSev(n.id as Severity)} />
              </g>
            ))}
          </svg>
          <div aria-hidden="true" className={s.sankeyLabels}>
            {layout.left.map((n) => (
              <div key={n.id} className={s.sankeyLabel} data-side="l" data-dim={filter.clo && filter.clo !== n.id ? "" : undefined} style={{ top: `${n.centerPct}%` }}>
                <span>{n.label}</span>
                <span className={s.sankeyCount}>{n.n}</span>
              </div>
            ))}
            {layout.right.map((n) => (
              <div key={n.id} className={s.sankeyLabel} data-side="r" data-dim={filter.sev && filter.sev !== n.id ? "" : undefined} style={{ top: `${n.centerPct}%` }}>
                <SeverityGlyph severity={n.id as Severity} />
                <span>{SEVERITY_LABEL[n.id as Severity]}</span>
                <span className={s.sankeyCount}>{n.n}</span>
              </div>
            ))}
          </div>
          {tipText && tipBand && (
            <div role="status" className={s.tip} style={{ left: "50%", top: `${tipBand.anchorPct}%`, transform: "translate(-50%, calc(-100% - 12px))" }}>
              <div className={s.tipTitle}>{tipText.title}</div>
              <div className={s.tipText}>{tipText.text}</div>
            </div>
          )}
        </div>
      </div>

      {variant === "B" && (
        <p aria-hidden="true" className={s.readout}>
          {tipText ? `x = ${tipText.title.split(" → ")[0]} · y = ${tipText.title.split(" → ")[1]} · ${tipText.text}` : "x = cloison · y = gravité · survolez un flux"}
        </p>
      )}

      <div className={s.filterRows}>
        <span role="group" aria-label="Filtrer par cloison" className={s.filterRow}>
          <span aria-hidden="true" className={s.filterRowKey}>Cloison</span>
          {clos.map((c) => (
            <button key={c.id} type="button" aria-pressed={filter.clo === c.id} className={s.textToggle} onClick={() => onToggleClo(c.id)}>
              {c.short}
            </button>
          ))}
        </span>
        <span role="group" aria-label="Filtrer par gravité" className={s.filterRow}>
          <span aria-hidden="true" className={s.filterRowKey}>Gravité</span>
          {SEVERITIES.map((sev) => (
            <button key={sev} type="button" aria-pressed={filter.sev === sev} className={s.textToggle} onClick={() => onToggleSev(sev)}>
              {SEVERITY_LABEL[sev]}
            </button>
          ))}
        </span>
      </div>

      <details className={s.altTable}>
        <summary>Alternative tableau : cloison × gravité</summary>
        <div role="region" aria-label="Tableau cloison × gravité" tabIndex={0} className={s.scrollX}>
          <table className={s.dataTable}>
            <thead>
              <tr>
                <th scope="col">Cloison</th>
                {SEVERITIES.map((sev) => (
                  <th key={sev} scope="col" className={s.alignRight}>{SEVERITY_LABEL[sev]}</th>
                ))}
                <th scope="col" className={s.alignRight}>Total</th>
              </tr>
            </thead>
            <tbody>
              {clos.map((c) => {
                const counts = SEVERITIES.map((sev) => layout.bands.find((b) => b.clo === c.id && b.sev === sev)?.n ?? 0);
                return (
                  <tr key={c.id}>
                    <th scope="row">{c.label}</th>
                    {counts.map((n, i) => (
                      <td key={SEVERITIES[i]} className={s.alignRight}>{n}</td>
                    ))}
                    <td className={s.alignRight}>{counts.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

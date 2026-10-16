"use client";

import { useId, useState } from "react";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { formatEuroCents } from "@/lib/format/fr";
import type { BridgeColumn, BridgeGroup, EffectRow } from "@/lib/synthese-view/bridge";
import s from "./synthese.module.css";

const SLOT = 720 / 7;
const BAR = 44;
const TOP = 16;
const BOTTOM = 270;
const HEIGHT = 300;

interface Paint {
  fill: string;
  stroke: string;
  dash?: string;
}

/** Peinture d'une colonne : le motif dit la nature de l'étape, la couleur n'est qu'un renfort. */
function paintOf(column: BridgeColumn, uid: string): Paint {
  if (column.amountCents === null) return { fill: "none", stroke: "var(--pb-ink-3)", dash: "3 3" };
  switch (column.tone) {
    case "detected":
    case "effect":
      return { fill: "var(--pb-ink-2)", stroke: "none" };
    case "repeats":
    case "superseded":
    case "dismissed":
      return { fill: "none", stroke: "var(--pb-ink-3)", dash: "3 3" };
    case "undetermined":
      return { fill: `url(#hm-${uid})`, stroke: "var(--pb-sev-mineur)" };
    case "pending":
      return { fill: `url(#hW-${uid})`, stroke: "var(--pb-signal)" };
    case "corrected":
      return { fill: "var(--pb-ink-3)", stroke: "none" };
    case "initial":
    case "uncorrected":
      return { fill: "none", stroke: "var(--pb-ink)", dash: "4 3" };
    case "tax":
      return { fill: "color-mix(in srgb, var(--pb-ink) 8%, transparent)", stroke: "var(--pb-ink-2)" };
    default:
      return { fill: "var(--pb-ink)", stroke: "none" };
  }
}

function amountText(column: BridgeColumn): string {
  if (column.amountCents === null) return "inconnu";
  return formatEuroCents(column.amountCents, { sign: column.kind === "delta" });
}

/**
 * Pont d'exposition : un graphique par poste et par sens (jamais additionnés entre eux), puis l'effet sur le résultat.
 * Hachuré : en attente d'arbitrage ; tirets : écarté, doublon ou sous-total ; aplat sombre : total. Un montant
 * inconnu n'a pas de barre : la colonne dit « inconnu ». À droite, l'annotation marginale (ajustement proposé,
 * effets chiffrés un à un, constats exclus). Les chiffres viennent du snapshot ; rien n'est recalculé ici.
 */
export function ExposureBridge({
  groups,
  title,
  effects,
  proposedText,
  netText,
  note,
  excludedNote,
  tableRows,
  onOpenChain,
}: {
  groups: readonly BridgeGroup[];
  title: string;
  effects: readonly EffectRow[];
  proposedText: string;
  netText: string | null;
  note: string;
  excludedNote: string;
  tableRows: readonly { group: string; label: string; amount: string; note: string }[];
  onOpenChain: (id: string) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<{ g: number; c: number } | null>(null);

  return (
    <div className={s.bridgeRow}>
      <figure data-anim-group="wf" className={s.bridgeFigure}>
        <figcaption>
          <h3 className={s.figTitle}>{title}</h3>
          <p className={s.figMethod}>Un pont par poste et par sens, jamais additionnés · répétitions exactes comptées une fois, groupes indéterminés hors agrégat · effet d’impôt connu seulement avec taux explicite et qualification</p>
        </figcaption>

        <div role="region" aria-label="Ponts d’exposition, défilement horizontal" tabIndex={0} className={s.bridgeGroups}>
          {groups.map((group, gi) => {
            const width = group.columns.length * SLOT;
            const span = group.hi - group.lo || 100;
            const y = (value: number) => TOP + ((group.hi - value) * (BOTTOM - TOP)) / span;
            const hovered = hover?.g === gi ? hover.c : null;
            const aria = `${group.group} : ${group.columns.map((c) => `${c.label} ${amountText(c)}`).join(" ; ")}.`;
            return (
              <div key={group.group} data-waterfall-group={group.group} className={s.bridgeGroup} style={{ minWidth: width + 56 }}>
                <div className={s.bridgeGroupTitle}>{group.group}</div>
                <div className={s.bridgeChart}>
                  <div className={s.bridgeAxis} aria-hidden="true">
                    {group.ticks.map((tick) => (
                      <span key={tick.value} style={{ top: `${(y(tick.value) / HEIGHT) * 100}%` }}>{tick.label}</span>
                    ))}
                  </div>
                  <div className={s.bridgePlot} style={{ width }}>
                    <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" role="img" aria-label={aria} className={s.bridgeSvg}>
                      <defs>
                        <pattern id={`hW-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                          <rect width="6" height="6" fillOpacity="0.16" style={{ fill: "var(--pb-signal)" }} />
                          <rect width="1.6" height="6" style={{ fill: "var(--pb-signal)" }} />
                        </pattern>
                        <pattern id={`hm-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse">
                          <rect width="4" height="4" fillOpacity="0.22" style={{ fill: "var(--pb-sev-mineur)" }} />
                          <rect width="4" height="1.2" style={{ fill: "var(--pb-sev-mineur)" }} />
                        </pattern>
                      </defs>
                      {group.ticks.map((tick) => (
                        <line key={tick.value} x1={0} y1={y(tick.value)} x2={width} y2={y(tick.value)} strokeWidth={1} strokeDasharray={tick.value === 0 ? undefined : "2 4"} style={{ stroke: tick.value === 0 ? "var(--pb-ink-3)" : "var(--pb-rule)" }} />
                      ))}
                      {group.columns.map((column, ci) => {
                        const cx = SLOT * ci + SLOT / 2;
                        const x = cx - BAR / 2;
                        const top = y(Math.max(column.from, column.to));
                        const height = Math.max(1, y(Math.min(column.from, column.to)) - top);
                        const paint = paintOf(column, uid);
                        const last = ci === group.columns.length - 1;
                        const level = y(column.to);
                        return (
                          <g key={column.id}>
                            {column.amountCents === null ? (
                              <rect data-a="bar" x={x} y={y(column.to) - 6} width={BAR} height={12} fill="none" strokeWidth={1} strokeDasharray="3 3" style={{ stroke: "var(--pb-ink-3)" }} />
                            ) : (
                              <rect data-a="bar" x={x} y={top} width={BAR} height={height} fill={paint.fill} strokeWidth={1} strokeDasharray={paint.dash} style={{ stroke: paint.stroke, transition: "opacity 200ms ease" }} />
                            )}
                            {!last && column.kind !== "total" && <line x1={x + BAR} y1={level} x2={x + SLOT} y2={level} strokeWidth={1} strokeDasharray="2 3" style={{ stroke: "var(--pb-sev-informatif)" }} />}
                            <rect x={SLOT * ci} y={0} width={SLOT} height={HEIGHT} fill="transparent" onMouseEnter={() => setHover({ g: gi, c: ci })} onMouseLeave={() => setHover(null)} />
                          </g>
                        );
                      })}
                      {hovered !== null && (
                        <line x1={SLOT * hovered + SLOT / 2} y1={0} x2={SLOT * hovered + SLOT / 2} y2={HEIGHT} strokeWidth={1} strokeOpacity={0.5} style={{ pointerEvents: "none", stroke: "var(--pb-ink)" }} />
                      )}
                    </svg>
                    <div aria-hidden="true" className={s.bridgeValues}>
                      {group.columns.map((column, ci) => {
                        const below = column.to < column.from || (column.kind !== "delta" && column.to < 0);
                        const cx = SLOT * ci + SLOT / 2;
                        const edge = below ? y(Math.min(column.from, column.to)) + 6 : y(Math.max(column.from, column.to)) - 6;
                        return (
                          <span key={column.id} data-unknown={column.amountCents === null ? "" : undefined} style={{ left: `${(cx / width) * 100}%`, top: `${(edge / HEIGHT) * 100}%`, transform: below ? "translate(-50%, 0)" : "translate(-50%, -100%)" }}>
                            {amountText(column)}
                          </span>
                        );
                      })}
                    </div>
                    {hovered !== null && (
                      <div role="status" className={s.tip} style={{ left: `${((SLOT * hovered + SLOT / 2) / width) * 100}%`, top: `${(y(Math.max(group.columns[hovered].from, group.columns[hovered].to)) / HEIGHT) * 100}%`, transform: "translate(-50%, calc(-100% - 28px))" }}>
                        <div className={s.tipTitle}>{group.columns[hovered].label}</div>
                        <div className={s.tipText}>
                          {amountText(group.columns[hovered])}
                          {group.columns[hovered].note ? ` · ${group.columns[hovered].note}` : ""}
                        </div>
                      </div>
                    )}
                    <div aria-hidden="true" className={s.bridgeLabels} style={{ gridTemplateColumns: `repeat(${group.columns.length}, minmax(0, 1fr))` }}>
                      {group.columns.map((column) => (
                        <span key={column.id}>{column.label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <details className={s.altTable}>
          <summary>Alternative tableau : étapes des ponts</summary>
          <div role="region" aria-label="Tableau des étapes des ponts" tabIndex={0} className={s.scrollX}>
            <table className={s.dataTable}>
              <thead>
                <tr>
                  <th scope="col">Poste et sens</th>
                  <th scope="col">Étape</th>
                  <th scope="col" className={s.alignRight}>Montant</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => (
                  <tr key={`${row.group}-${i}`}>
                    <td>{row.group}</td>
                    <th scope="row">{row.label}</th>
                    <td className={`${s.alignRight} ${s.mono}`}>{row.amount}</td>
                    <td className={s.soft}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>

      <aside aria-label="Annotation de l’exposition" className={s.marginNote}>
        <div className={s.noteKey}>Ajustement proposé · résultat</div>
        <div aria-live="polite" className={s.noteValue}>{proposedText}</div>
        {netText && <div className={s.noteNet}>{netText}</div>}
        <p className={s.noteBody}>{note}</p>
        <ul className={s.effectList}>
          {effects.map((effect) => (
            <li key={effect.id}>
              <SeverityGlyph severity={effect.severity} />
              <button type="button" className={s.linkButton} onClick={() => onOpenChain(effect.findingIds[0])}>
                {effect.id}
              </button>
              <span className={s.mono}>
                {effect.signedCents !== null ? formatEuroCents(effect.signedCents, { sign: true }) : effect.bounds ? `${formatEuroCents(effect.bounds.minCents)} à ${formatEuroCents(effect.bounds.maxCents)}` : "—"}
              </span>
              <span className={s.effectStatus} data-validated={effect.stage === "proposed" || effect.stage === "corrected" ? "" : undefined}>
                {effect.title} · {effect.status}
              </span>
            </li>
          ))}
        </ul>
        <p className={s.noteExcluded}>{excludedNote}</p>
      </aside>
    </div>
  );
}

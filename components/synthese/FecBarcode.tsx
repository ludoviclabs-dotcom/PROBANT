"use client";

import { useState } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { SEVERITY_LABEL } from "@/lib/canonical-model/finding";
import { formatInt } from "@/lib/format/fr";
import { FAMILY_TEXT } from "@/lib/synthese-view/common";
import type { Barcode } from "@/lib/synthese-view/barcode";
import s from "./synthese.module.css";

/**
 * Code-barres de positions du FEC : une bande par famille de règles, une graduation par ligne du fichier citée en
 * source d'un constat. La position est celle de la ligne dans le fichier ; le survol donne la ligne, le constat et
 * sa gravité. Pas de longueur de fichier inventée : l'axe dit ce qu'il borne.
 */
export function FecBarcode({ data }: { data: Barcode }) {
  const [hover, setHover] = useState<{ row: number; tick: number } | null>(null);
  const at = (line: number) => (line / data.axisMax) * 1000;

  return (
    <figure data-anim-group="bc" className={s.barcodeFigure}>
      <figcaption>
        <h3 className={s.figTitle}>{data.title}</h3>
        <p className={s.figMethod}>{data.method}</p>
      </figcaption>
      {data.rows.length === 0 ? (
        <p className={s.emptyNote}>Aucune ligne du fichier n’est citée par un constat.</p>
      ) : (
        <div role="region" aria-label="Code-barres des positions dans le FEC" tabIndex={0} className={`${s.scrollX} ${s.barcodeScroll}`}>
          <div className={s.barcode}>
            {data.rows.map((row, ri) => {
              const tip = hover?.row === ri ? row.ticks[hover.tick] : null;
              return (
                <div key={row.family} className={s.barcodeRow}>
                  <span className={s.barcodeLabel}>
                    <FamilyRule family={row.family} />
                    {FAMILY_TEXT[row.family].label}
                  </span>
                  <div className={s.barcodeTrack}>
                    <svg viewBox="0 0 1000 20" preserveAspectRatio="none" width="100%" height={20} aria-hidden="true" focusable="false">
                      <line x1={0} y1={10} x2={1000} y2={10} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--pb-rule-strong)" }} />
                      {row.ticks.map((tick, ti) => (
                        <g key={`${tick.findingId}-${tick.line}`}>
                          <line data-a="tick" x1={at(tick.line)} y1={1} x2={at(tick.line)} y2={19} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ stroke: tick.severity === "bloquant" ? "var(--pb-signal)" : "var(--pb-ink-2)" }} />
                          <rect x={at(tick.line) - 8} y={0} width={16} height={20} fill="transparent" className={s.crosshair} onMouseEnter={() => setHover({ row: ri, tick: ti })} onMouseLeave={() => setHover(null)} />
                        </g>
                      ))}
                    </svg>
                    {tip && (
                      <div role="status" className={s.tipMono} style={{ left: `${(tip.line / data.axisMax) * 100}%` }}>
                        L{tip.line} · {tip.findingId} · {SEVERITY_LABEL[tip.severity]}
                      </div>
                    )}
                  </div>
                  <span className={`${s.mono} ${s.barcodeCount}`} data-zero={row.ticks.length === 0 ? "" : undefined}>{row.ticks.length}</span>
                </div>
              );
            })}
            <div className={s.barcodeAxisRow}>
              <span className={s.barcodeAxisLabel}>ligne du fichier</span>
              <div aria-hidden="true" className={s.barcodeAxis}>
                {data.axisLabels.map((label, i) => (
                  <span key={label} style={{ left: `${(label / data.axisMax) * 100}%`, transform: i === 0 ? "none" : label === data.axisMax ? "translateX(-100%)" : "translateX(-50%)" }}>
                    {formatInt(label)}
                  </span>
                ))}
              </div>
              <span />
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

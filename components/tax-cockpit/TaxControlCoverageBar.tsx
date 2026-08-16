"use client";

/**
 * Barre empilée des contrôles exécutés par sortie (Vérifié / Incohérence /
 * Risque potentiel / Donnée manquante / Non concluant). Les segments viennent
 * du dataset ; chaque segment est doublé d'une légende texte chiffrée.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { TaxChartCard } from "./TaxSourceFootnote";

export function TaxControlCoverageBar({
  dataset,
}: {
  dataset: TaxCockpitDatasets["coverage"];
}) {
  const total = dataset.totalControls;
  return (
    <TaxChartCard dataset={dataset} eyebrow="Calcul">
      {total === 0 ? (
        <p style={{ margin: 0, fontSize: FONT.table, color: T.muted }}>
          Aucun contrôle exécuté sur ce périmètre.
        </p>
      ) : (
        <div role="img" aria-label={dataset.summary}>
          <div
            style={{
              display: "flex",
              height: 16,
              borderRadius: 6,
              overflow: "hidden",
              border: `1px solid ${T.border}`,
              background: T.surface3,
            }}
          >
            {dataset.segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <div
                  key={segment.key}
                  className="pbz-anim"
                  style={{
                    width: `${(segment.count / total) * 100}%`,
                    background: TONE_COLOR[segment.tone],
                    transition: "width .4s ease",
                  }}
                />
              ))}
          </div>
          <ul
            style={{
              margin: "10px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 18px",
              fontSize: FONT.meta,
              color: T.muted,
            }}
          >
            {dataset.segments.map((segment) => (
              <li key={segment.key}>
                <span aria-hidden="true" style={{ color: TONE_COLOR[segment.tone] }}>
                  {TONE_PREFIX[segment.tone]}{" "}
                </span>
                {segment.label} : <strong className="tnum">{segment.count}</strong>
              </li>
            ))}
            <li>
              Total : <strong className="tnum">{total}</strong> contrôle(s)
            </li>
          </ul>
        </div>
      )}
    </TaxChartCard>
  );
}

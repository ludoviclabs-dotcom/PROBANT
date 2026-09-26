"use client";

/**
 * Barre empilée des contrôles exécutés par sortie (Vérifié / Incohérence /
 * Risque potentiel / Donnée manquante / Non concluant). Les segments viennent
 * du dataset ; chaque segment est doublé d'une légende texte chiffrée. Ligne
 * « toutes cellules » de l'infographie de couverture de l'acte III.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { AMOUNT, INK_FAINT } from "./cockpit-style";

export function TaxControlCoverageBar({
  dataset,
  labelWidth = 132,
}: {
  dataset: TaxCockpitDatasets["coverage"];
  labelWidth?: number;
}) {
  const total = dataset.totalControls;
  if (total === 0) {
    return (
      <p style={{ margin: 0, fontSize: FONT.table, color: T.muted }}>
        Aucun contrôle exécuté sur ce périmètre.
      </p>
    );
  }
  return (
    <div role="group" aria-label={dataset.title}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            width: labelWidth,
            flexShrink: 0,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: INK_FAINT,
          }}
        >
          Tous contrôles
        </div>
        <div
          role="img"
          aria-label={dataset.summary}
          style={{
            flex: "1 1 240px",
            minWidth: 0,
            display: "flex",
            height: 10,
            borderRadius: 5,
            overflow: "hidden",
            background: "rgba(255,255,255,.04)",
          }}
        >
          {dataset.segments
            .filter((segment) => segment.count > 0)
            .map((segment, index) => (
              <div
                key={segment.key}
                title={`${segment.label} : ${segment.count} contrôle(s)`}
                className="pbz-bar"
                style={{
                  width: `${(segment.count / total) * 100}%`,
                  background: TONE_COLOR[segment.tone],
                  animationDelay: `${index * 60}ms`,
                }}
              />
            ))}
        </div>
      </div>
      <ul
        style={{
          margin: "12px 0 0",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 22px",
          fontSize: FONT.meta,
          color: T.muted,
        }}
      >
        {dataset.segments.map((segment) => (
          <li key={segment.key}>
            <span aria-hidden="true" style={{ color: TONE_COLOR[segment.tone] }}>
              {TONE_PREFIX[segment.tone]}{" "}
            </span>
            {segment.label} : <strong style={{ ...AMOUNT, fontWeight: 500, color: T.text }}>{segment.count}</strong>
          </li>
        ))}
        <li style={{ color: INK_FAINT }}>
          Total : <strong style={{ ...AMOUNT, fontWeight: 500, color: T.text }}>{total}</strong> contrôle(s)
        </li>
      </ul>
    </div>
  );
}

"use client";

/**
 * Barres de comparaison multi-opérandes (IS : calculé/déclaré/comptabilisé ;
 * TVA : théorique/comptabilisé/déclaré). Une valeur `null` est rendue
 * « non disponible » — jamais une barre à zéro. Aucun montant recalculé.
 */

import type { TaxComparisonBarRow } from "@/lib/tax/cockpit";
import { formatCents } from "@/lib/synthesis/money";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";

const OPERAND_COLORS = [T.accent, T.violet, "#2dd4bf"] as const;

export function ComparisonBars({
  rows,
  ariaLabel,
}: {
  rows: readonly TaxComparisonBarRow[];
  ariaLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: FONT.table, color: T.muted }}>
        Aucune donnée disponible sur ce périmètre.
      </p>
    );
  }
  const maxAbs = Math.max(
    1,
    ...rows.flatMap((row) => row.values.map((value) => Math.abs(value.amountCents ?? 0))),
  );
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {rows.map((row) => (
        <div key={row.id}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: FONT.table, fontWeight: 600, color: T.text }}>
              {row.label}
            </span>
            <span
              style={{
                fontSize: FONT.meta,
                fontWeight: 600,
                color: TONE_COLOR[row.tone],
                whiteSpace: "nowrap",
              }}
            >
              <span aria-hidden="true">{TONE_PREFIX[row.tone]} </span>
              {row.statusLabel}
              {row.differenceCents !== null && row.differenceCents !== 0 && (
                <span style={{ fontFamily: "monospace" }}>
                  {" "}
                  ({formatCents(row.differenceCents)})
                </span>
              )}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {row.values.map((value, index) => {
              const color = OPERAND_COLORS[index % OPERAND_COLORS.length];
              const available = value.amountCents !== null;
              const width = available ? (Math.abs(value.amountCents!) / maxAbs) * 100 : 0;
              return (
                <div
                  key={value.key}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span
                    style={{
                      width: 110,
                      flexShrink: 0,
                      fontSize: FONT.meta,
                      color: T.muted,
                      textAlign: "right",
                    }}
                  >
                    {value.label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 4,
                      background: T.surface3,
                      border: `1px solid ${T.border}`,
                      overflow: "hidden",
                    }}
                  >
                    {available && (
                      <div
                        className="pbz-anim"
                        style={{
                          height: "100%",
                          width: `${width}%`,
                          background: color,
                          transition: "width .4s ease",
                        }}
                      />
                    )}
                  </div>
                  <span
                    style={{
                      width: 120,
                      flexShrink: 0,
                      fontSize: FONT.meta,
                      fontFamily: "monospace",
                      color: available ? T.text : T.muted,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {available ? formatCents(value.amountCents!) : "non disponible"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

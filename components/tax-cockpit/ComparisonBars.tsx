"use client";

/**
 * Barres de comparaison multi-opérandes (IS : recalculé/déclaré ; TVA :
 * théorique/comptabilisé/déclaré ; CFE : avis/comptabilisé/réglé). Une valeur
 * `null` est rendue « non disponible » sur une piste pointillée — jamais une
 * barre à zéro. Aucun montant recalculé.
 */

import type { TaxComparisonBarRow } from "@/lib/tax/cockpit";
import { formatCents } from "@/lib/synthesis/money";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { AMOUNT, INK_FAINT } from "./cockpit-style";

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
  let barIndex = 0;
  return (
    <div role="img" aria-label={ariaLabel} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {rows.map((row) => (
        <div key={row.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: FONT.table, fontWeight: 500, color: T.text }}>{row.label}</span>
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
                <span style={AMOUNT}> ({formatCents(row.differenceCents)})</span>
              )}
            </span>
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {row.values.map((value, index) => {
              const color = OPERAND_COLORS[index % OPERAND_COLORS.length];
              const available = value.amountCents !== null;
              const width = available ? (Math.abs(value.amountCents!) / maxAbs) * 100 : 0;
              const delay = barIndex++ * 80;
              return (
                <div key={value.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 96,
                      flexShrink: 0,
                      fontSize: FONT.meta,
                      color: INK_FAINT,
                      textAlign: "right",
                    }}
                  >
                    {value.label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 9,
                      borderRadius: 3,
                      background: "rgba(255,255,255,.04)",
                      border: available ? undefined : "1px dashed rgba(234,179,8,.4)",
                      overflow: "hidden",
                    }}
                  >
                    {available && width > 0 && (
                      <div
                        className="pbz-bar"
                        style={{
                          height: "100%",
                          width: `${width}%`,
                          borderRadius: 3,
                          background: color,
                          animationDelay: `${delay}ms`,
                        }}
                      />
                    )}
                  </div>
                  <span
                    style={{
                      ...AMOUNT,
                      width: 112,
                      flexShrink: 0,
                      fontSize: FONT.meta,
                      color: available && value.amountCents !== 0 ? T.text : T.muted,
                      textAlign: "right",
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

"use client";

/**
 * Acte III — l'exposition. Une seule infographie de couverture (matrice impôt
 * × cycle de micro-barres + barre empilée « tous cycles ») remplace les quatre
 * panneaux d'analyse qui répétaient la même information. En dessous, la zone
 * de travail : toutes les lignes de réconciliation et tous les contrôles,
 * filtrables par sortie ; un clic ouvre le tiroir de détail.
 */

import { useMemo, useState } from "react";
import {
  TAX_OUTCOME_LABEL,
  TAX_OUTCOME_ORDER,
  TAX_TYPE_LABEL,
  type TaxCockpitDatasets,
  type TaxRiskMatrixCell,
} from "@/lib/tax/cockpit";
import { BODY, C, MONO, OUTCOME_COLOR, OUTCOME_MARK, SANS, SERIF } from "./fiscal-style";
import { SourcesBlock } from "./TaxSources";

const PAGE_SIZE = 100;
const GRID = "minmax(44px, 74px) minmax(0, 2.2fr) minmax(0, 1.3fr) minmax(0, 2fr) minmax(64px, 130px)";

const SEGMENT_COLOR: Readonly<Record<string, string>> = {
  passed: C.green,
  difference: C.red,
  risk: C.orange,
  missing: C.amber,
  inconclusive: C.accent,
};
const SEGMENT_MARK: Readonly<Record<string, string>> = {
  passed: "✓",
  difference: "✖",
  risk: "⚠",
  missing: "⚠",
  inconclusive: "•",
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".16em",
  color: C.faint,
};

export function TaxExposure({
  datasets,
  outcomeFilter,
  onOutcomeFilterChange,
  activeRowId,
  onOpenRow,
  onAnnounce,
}: {
  datasets: TaxCockpitDatasets;
  outcomeFilter: string;
  onOutcomeFilterChange: (outcome: string) => void;
  activeRowId: string | null;
  onOpenRow: (rowId: string, opener: HTMLElement) => void;
  onAnnounce?: (message: string) => void;
}) {
  const { riskMatrix, coverage, findings } = datasets;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const presentOutcomes = useMemo(() => {
    const present = new Set(Object.values(findings.outcomeByRowId));
    return TAX_OUTCOME_ORDER.filter((outcome) => present.has(outcome));
  }, [findings.outcomeByRowId]);

  const filteredRows = useMemo(
    () =>
      outcomeFilter === "tous"
        ? findings.rows
        : findings.rows.filter((row) => findings.outcomeByRowId[row.id] === outcomeFilter),
    [findings.rows, findings.outcomeByRowId, outcomeFilter],
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  const chip = (on: boolean): React.CSSProperties => ({
    border: on ? "1px solid rgba(91,157,255,.6)" : "1px solid rgba(255,255,255,.1)",
    borderRadius: 999,
    background: on ? "rgba(91,157,255,.14)" : "transparent",
    color: on ? C.text : C.muted,
    cursor: "pointer",
    fontFamily: BODY,
    fontSize: 11.5,
    padding: "5px 12px",
  });

  return (
    <section
      aria-labelledby="tax-exposure-title"
      className="fx-section"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 0" }}
    >
      <div style={eyebrow}>Acte III · L&apos;exposition</div>
      <h2
        id="tax-exposure-title"
        className="fx-h-act"
        style={{ margin: "12px 0 0", fontFamily: SERIF, fontSize: 32, fontWeight: 400, color: C.text }}
      >
        Couverture des contrôles et lignes à traiter
      </h2>
      <p style={{ margin: "8px 0 0", maxWidth: "84ch", fontSize: 12.5, lineHeight: 1.7, color: C.muted }}>
        Les {coverage.totalControls} contrôles exécutés, croisés par impôt et par cycle de revue. La micro-barre
        de chaque cellule décompose ses sorties ; le filet coloré sous la cellule reprend la sortie la plus
        prioritaire de l&apos;intersection.
      </p>

      {riskMatrix.cells.length === 0 ? (
        <p style={{ margin: "28px 0 0", fontSize: 13, color: C.muted }}>Aucun contrôle exécuté sur ce périmètre.</p>
      ) : (
        <div role="group" aria-label={riskMatrix.title} style={{ marginTop: 28 }}>
          {riskMatrix.taxes.map((taxType) => (
            <div
              key={taxType}
              className="fx-matrix-row"
              style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "stretch" }}
            >
              <div
                className="fx-matrix-label"
                style={{
                  width: 132,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: SANS,
                  fontSize: 13,
                  color: C.textSoft,
                }}
              >
                {TAX_TYPE_LABEL[taxType]}
              </div>
              <div className="fx-matrix-cells" style={{ flex: 1, minWidth: 0, display: "flex", gap: 10 }}>
                {riskMatrix.cells
                  .filter((cell) => cell.taxType === taxType)
                  .map((cell) => (
                    <MatrixCell key={`${cell.taxType}:${cell.cycle}`} cell={cell} onAnnounce={onAnnounce} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {coverage.totalControls > 0 && (
        <>
          <div style={{ marginTop: 22, display: "flex", gap: 10, alignItems: "center" }}>
            <div
              className="fx-matrix-label"
              style={{ width: 132, flexShrink: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.faint }}
            >
              Tous cycles
            </div>
            <div
              role="img"
              aria-label={coverage.summary}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                height: 10,
                borderRadius: 5,
                overflow: "hidden",
                background: C.track,
              }}
            >
              {coverage.segments
                .filter((segment) => segment.count > 0)
                .map((segment, index) => (
                  <div
                    key={segment.key}
                    title={`${segment.label} : ${segment.count} contrôle(s)`}
                    style={{
                      width: `${(segment.count / coverage.totalControls) * 100}%`,
                      background: SEGMENT_COLOR[segment.key] ?? C.accent,
                      transformOrigin: "left",
                      animation: `fxBarIn .6s cubic-bezier(.2,.7,.3,1) ${index * 0.06}s both`,
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
              fontSize: 11.5,
              color: C.muted,
            }}
          >
            {coverage.segments.map((segment) => (
              <li key={segment.key}>
                <span aria-hidden="true" style={{ color: SEGMENT_COLOR[segment.key] }}>
                  {SEGMENT_MARK[segment.key]}
                </span>{" "}
                {segment.label} : <span style={{ fontFamily: MONO, color: C.text }}>{segment.count}</span>
              </li>
            ))}
            <li style={{ color: C.faint }}>
              Total : <span style={{ fontFamily: MONO, color: C.text }}>{coverage.totalControls}</span> contrôles
            </li>
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.6, color: C.faint }}>
            Une sortie « non concluant » n&apos;est pas une anomalie : c&apos;est une procédure supplémentaire à
            programmer (ISA 330). Le niveau de preuve retenu est le plus faible niveau nécessaire à la
            conclusion, jamais une moyenne.
          </p>
          <SourcesBlock dataset={riskMatrix} />
        </>
      )}

      <div
        style={{
          marginTop: 48,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontFamily: SANS, fontSize: 15, fontWeight: 600, color: C.text }}>
          Lignes de réconciliation et contrôles
        </h3>
        <div role="group" aria-label="Filtrer les lignes par statut" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            aria-pressed={outcomeFilter === "tous"}
            onClick={() => {
              onOutcomeFilterChange("tous");
              setVisibleCount(PAGE_SIZE);
            }}
            style={chip(outcomeFilter === "tous")}
          >
            Tous
          </button>
          {presentOutcomes.map((outcome) => (
            <button
              key={outcome}
              type="button"
              aria-pressed={outcomeFilter === outcome}
              onClick={() => {
                onOutcomeFilterChange(outcome);
                setVisibleCount(PAGE_SIZE);
              }}
              style={chip(outcomeFilter === outcome)}
            >
              {TAX_OUTCOME_LABEL[outcome]}
            </button>
          ))}
        </div>
      </div>

      <div role="table" aria-label={`Tableau d'exploration : ${findings.title}`} aria-describedby="tax-findings-note">
        <div role="rowgroup">
          <div
            role="row"
            className="fx-find-head"
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: GRID,
              gap: "0 14px",
              padding: "0 12px 10px",
              borderBottom: "1px solid rgba(255,255,255,.08)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: C.faint,
            }}
          >
            <div role="columnheader">Impôt</div>
            <div role="columnheader">Contrôle</div>
            <div role="columnheader">Sortie</div>
            <div role="columnheader">Lecture</div>
            <div role="columnheader" style={{ textAlign: "right" }}>
              Montant
            </div>
          </div>
        </div>
        <div role="rowgroup">
          {visibleRows.length === 0 ? (
            <div role="row">
              <div role="cell" style={{ padding: "18px 12px", fontSize: 13, color: C.muted }}>
                Aucune ligne pour ce filtre.
              </div>
            </div>
          ) : (
            visibleRows.map((row) => {
              const detail = findings.details[row.id];
              const outcome = findings.outcomeByRowId[row.id];
              const color = OUTCOME_COLOR[outcome] ?? C.accent;
              const rawLabel = String(row.cells.label ?? row.id);
              const controlId = detail?.controlId ?? null;
              const title =
                controlId && rawLabel.startsWith(`${controlId} — `) ? rawLabel.slice(controlId.length + 3) : rawLabel;
              const active = activeRowId === row.id;
              return (
                <div
                  key={row.id}
                  role="row"
                  tabIndex={0}
                  className="fx-find-row"
                  onClick={(event) => onOpenRow(row.id, event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenRow(row.id, event.currentTarget);
                    }
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    gap: "0 14px",
                    alignItems: "center",
                    padding: "17px 12px",
                    borderBottom: "1px solid rgba(255,255,255,.05)",
                    cursor: "pointer",
                    background: active ? "rgba(255,255,255,.05)" : "transparent",
                    transition: "background .18s ease",
                  }}
                >
                  <div role="cell" className="fx-c-tax" style={{ fontSize: 11.5, color: C.faint }}>
                    {String(row.cells.tax)}
                  </div>
                  <div role="cell" className="fx-c-ctrl" style={{ fontSize: 13, color: C.text, minWidth: 0 }}>
                    {title}
                    {controlId && (
                      <div style={{ marginTop: 2, fontFamily: MONO, fontSize: 10.5, color: C.faint, overflowWrap: "anywhere" }}>
                        {controlId}
                      </div>
                    )}
                  </div>
                  <div role="cell" className="fx-c-out" style={{ fontSize: 12, fontWeight: 600, color }}>
                    <span aria-hidden="true">{OUTCOME_MARK[outcome]} </span>
                    {String(row.cells.status)}
                  </div>
                  <div
                    role="cell"
                    className="fx-c-read"
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: C.muted,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {detail?.reading ?? "—"}
                  </div>
                  <div
                    role="cell"
                    className="fx-c-amt"
                    style={{
                      textAlign: "right",
                      fontFamily: MONO,
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 13,
                      color: C.textSoft,
                    }}
                  >
                    {detail?.amountDisplay ?? "—"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {filteredRows.length > visibleCount && (
        <button
          type="button"
          className="fx-btn-ghost"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          style={{
            marginTop: 12,
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 9,
            background: "transparent",
            padding: "8px 14px",
            fontFamily: BODY,
            fontSize: 12.5,
            color: C.textSoft,
            cursor: "pointer",
          }}
        >
          Afficher {Math.min(PAGE_SIZE, filteredRows.length - visibleCount)} ligne(s) de plus (
          {filteredRows.length - visibleCount} restantes)
        </button>
      )}
      <p id="tax-findings-note" style={{ margin: "14px 0 0", fontSize: 11.5, color: C.faint }}>
        {visibleRows.length} ligne(s) affichée(s) · {coverage.totalControls} contrôles exécutés au total sur
        l&apos;exercice
      </p>
      <SourcesBlock dataset={findings} />
      <div style={{ height: 40 }} />
    </section>
  );
}

function MatrixCell({ cell, onAnnounce }: { cell: TaxRiskMatrixCell; onAnnounce?: (message: string) => void }) {
  const worst = cell.outcomeBreakdown[0];
  const color = worst ? (OUTCOME_COLOR[worst.outcome] ?? C.accent) : C.accent;
  const breakdownText = cell.outcomeBreakdown.map((entry) => `${entry.count} ${entry.label.toLowerCase()}`).join(" · ");
  let at = 0;
  const stops = cell.outcomeBreakdown.map((entry) => {
    const from = (at / cell.controlCount) * 100;
    at += entry.count;
    return `${OUTCOME_COLOR[entry.outcome] ?? C.accent} ${from.toFixed(2)}% ${((at / cell.controlCount) * 100).toFixed(2)}%`;
  });
  const description = `${TAX_TYPE_LABEL[cell.taxType]} × ${cell.cycle} — ${cell.controlCount} contrôle(s) : ${breakdownText}. Sortie la plus prioritaire : ${cell.worstOutcomeLabel ?? "aucune"}.`;
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={description}
      title={description}
      className="fx-cell"
      onFocus={() => onAnnounce?.(description)}
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 10,
        background: "rgba(255,255,255,.035)",
        padding: "12px 14px",
        cursor: "default",
        borderBottom: `3px solid ${color}`,
        transition: "background .2s ease, transform .2s ease, box-shadow .2s ease",
      }}
    >
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".1em", color: C.muted }}>{cell.cycle}</div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 18, color: C.text }}>
          {cell.controlCount}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>
          <span aria-hidden="true">{worst ? OUTCOME_MARK[worst.outcome] : ""} </span>
          {cell.worstOutcomeLabel}
        </span>
      </div>
      <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4, color: C.muted }}>{breakdownText}</div>
      <div
        aria-hidden="true"
        style={{
          marginTop: 10,
          height: 4,
          borderRadius: 3,
          overflow: "hidden",
          background: `linear-gradient(90deg, ${stops.join(", ")})`,
          transformOrigin: "left",
          animation: "fxBarIn .5s cubic-bezier(.2,.7,.3,1) both",
        }}
      />
    </div>
  );
}

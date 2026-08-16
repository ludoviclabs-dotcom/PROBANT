"use client";

/**
 * NIVEAU 4 — exploration : toutes les lignes de réconciliation et tous les
 * contrôles exécutés. Chaque ligne peut être dépliée pour lire la source, la
 * formule, les données utilisées, les limites, la preuve et l'historique de
 * revue. Le filtre par statut est contrôlé par le parent (synchronisé à
 * l'URL). La pagination est un simple découpage d'affichage : les données ne
 * sont jamais recalculées.
 */

import { Fragment, useMemo, useState } from "react";
import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { TAX_OUTCOME_LABEL, TAX_OUTCOME_ORDER } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR } from "@/components/synthesis/tokens";
import { TaxMethodologyPopover, TaxSourceFootnote } from "./TaxSourceFootnote";

const PAGE_SIZE = 100;

export function TaxFindingTable({
  dataset,
  outcomeFilter,
  onOutcomeFilterChange,
}: {
  dataset: TaxCockpitDatasets["findings"];
  outcomeFilter: string;
  onOutcomeFilterChange: (outcome: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const presentOutcomes = useMemo(() => {
    const present = new Set(Object.values(dataset.outcomeByRowId));
    return TAX_OUTCOME_ORDER.filter((outcome) => present.has(outcome));
  }, [dataset.outcomeByRowId]);

  const filteredRows = useMemo(
    () =>
      outcomeFilter === "tous"
        ? dataset.rows
        : dataset.rows.filter((row) => dataset.outcomeByRowId[row.id] === outcomeFilter),
    [dataset.rows, dataset.outcomeByRowId, outcomeFilter],
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  return (
    <section
      aria-label={dataset.title}
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        background: T.surface2,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: FONT.body, fontWeight: 600, color: T.text }}>
          {dataset.title} · <span className="tnum">{filteredRows.length}</span> ligne(s)
        </h3>
        <TaxMethodologyPopover dataset={dataset} />
      </div>

      <div
        role="group"
        aria-label="Filtrer les lignes par statut"
        style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}
      >
        <FilterButton
          label="Tous"
          pressed={outcomeFilter === "tous"}
          onClick={() => {
            onOutcomeFilterChange("tous");
            setVisibleCount(PAGE_SIZE);
          }}
        />
        {presentOutcomes.map((outcome) => (
          <FilterButton
            key={outcome}
            label={TAX_OUTCOME_LABEL[outcome]}
            pressed={outcomeFilter === outcome}
            onClick={() => {
              onOutcomeFilterChange(outcome);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        ))}
      </div>

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.table }}
          aria-label={`Tableau d'exploration : ${dataset.title}`}
        >
          <caption
            style={{
              captionSide: "top",
              textAlign: "left",
              fontSize: FONT.meta,
              color: T.muted,
              paddingBottom: 6,
            }}
          >
            {dataset.summary}
          </caption>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.borderStrong}` }}>
              <th scope="col" style={headerStyle}>
                <span
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clip: "rect(0 0 0 0)",
                  }}
                >
                  Détail
                </span>
              </th>
              {dataset.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={{ ...headerStyle, textAlign: column.align ?? "left" }}
                >
                  {column.label}
                  {column.unit ? ` (${column.unit})` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={dataset.columns.length + 1}
                  style={{ padding: 14, color: T.muted, fontSize: FONT.table }}
                >
                  Aucune ligne pour ce filtre.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const detail = dataset.details[row.id];
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "4px 6px" }}>
                        <button
                          type="button"
                          className="pbz-focusable"
                          aria-expanded={expanded}
                          aria-label={`Détail de la ligne « ${String(row.cells.label ?? row.id)} »`}
                          onClick={() => setExpandedId(expanded ? null : row.id)}
                          style={{
                            border: `1px solid ${T.border}`,
                            borderRadius: 6,
                            background: "transparent",
                            color: T.muted,
                            cursor: "pointer",
                            fontSize: FONT.meta,
                            padding: "1px 7px",
                          }}
                        >
                          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                        </button>
                      </td>
                      {dataset.columns.map((column) => (
                        <td
                          key={column.key}
                          style={{
                            padding: "6px 10px",
                            textAlign: column.align ?? "left",
                            color: row.emphasis ? TONE_COLOR[row.emphasis] : T.text,
                            fontFamily: column.align === "right" ? "monospace" : undefined,
                            whiteSpace: column.align === "right" ? "nowrap" : undefined,
                          }}
                        >
                          {row.cells[column.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                    {expanded && detail && (
                      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td
                          colSpan={dataset.columns.length + 1}
                          style={{ padding: "10px 14px", background: T.surface3 }}
                        >
                          <dl
                            style={{
                              margin: 0,
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                              gap: "8px 20px",
                              fontSize: FONT.meta,
                              color: T.muted,
                            }}
                          >
                            <DetailEntry term="Formule / normalisations" value={detail.formula} />
                            <DetailEntry
                              term="Données utilisées"
                              value={detail.usedData.length > 0 ? detail.usedData.join(" · ") : "—"}
                            />
                            <DetailEntry
                              term="Limites"
                              value={detail.limits.length > 0 ? detail.limits.join(" ") : "Aucune limite spécifique documentée sur cette ligne."}
                            />
                            <DetailEntry term="Preuve" value={detail.evidence} />
                            <DetailEntry
                              term="Sources"
                              value={detail.sources.length > 0 ? detail.sources.join(" · ") : "—"}
                            />
                            <DetailEntry term="Historique de revue" value={detail.review} />
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filteredRows.length > visibleCount && (
        <button
          type="button"
          className="pbz-focusable"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          style={{
            marginTop: 10,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            background: T.surface3,
            color: T.text,
            cursor: "pointer",
            fontSize: FONT.meta,
            padding: "6px 12px",
          }}
        >
          Afficher {Math.min(PAGE_SIZE, filteredRows.length - visibleCount)} ligne(s) de plus (
          {filteredRows.length - visibleCount} restantes)
        </button>
      )}
      <TaxSourceFootnote dataset={dataset} />
    </section>
  );
}

const headerStyle: React.CSSProperties = {
  padding: "7px 10px",
  textAlign: "left",
  fontSize: FONT.meta,
  fontWeight: 600,
  color: T.muted,
  whiteSpace: "nowrap",
};

function DetailEntry({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt style={{ color: T.muted, fontWeight: 600 }}>{term}</dt>
      <dd style={{ margin: "2px 0 0", overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}

function FilterButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="pbz-focusable"
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        border: `1px solid ${pressed ? T.accent : T.border}`,
        borderRadius: 999,
        background: pressed ? "rgba(91,157,255,.14)" : "transparent",
        color: pressed ? T.text : T.muted,
        cursor: "pointer",
        fontSize: FONT.meta,
        padding: "3px 11px",
      }}
    >
      {label}
    </button>
  );
}

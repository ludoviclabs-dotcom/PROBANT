"use client";

/**
 * ACTE III — zone de travail : toutes les lignes de réconciliation et tous
 * les contrôles exécutés. Un clic sur une ligne (ou Entrée sur son libellé)
 * ouvre un panneau latéral avec la source, la formule, les données utilisées,
 * les limites, la preuve et l'historique de revue. Le filtre par statut est
 * contrôlé par le parent (synchronisé à l'URL). La pagination est un simple
 * découpage d'affichage : les données ne sont jamais recalculées.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ReviewEventAction } from "@/lib/canonical-model";
import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { TAX_OUTCOME_LABEL, TAX_OUTCOME_ORDER, TAX_OUTCOME_TONE } from "@/lib/tax/cockpit";
import { FONT, T, TONE_COLOR, TONE_PREFIX } from "@/components/synthesis/tokens";
import { AMOUNT, BLOCK_TITLE, FAMILY, HAIRLINE, INK_FAINT } from "./cockpit-style";
import { SourcesDisclosure } from "./TaxSourceFootnote";

const PAGE_SIZE = 100;
/** Largeurs relatives Impôt · Contrôle · Sortie · Lecture · Écart. */
const COLUMN_WIDTHS = ["74px", "30%", "16%", "auto", "140px"] as const;

/** Décisions proposées depuis le panneau latéral (sous-ensemble des actions de revue). */
const DRAWER_ACTIONS: readonly { readonly value: ReviewEventAction; readonly label: string }[] = [
  { value: "confirm", label: "Confirmer" },
  { value: "dismiss", label: "Écarter" },
  { value: "request_evidence", label: "Demander une preuve" },
  { value: "attach_evidence", label: "Rattacher un justificatif" },
];

export interface DecisionDraft {
  readonly rowId: string;
  readonly action: ReviewEventAction;
  readonly comment: string;
}

type Row = TaxCockpitDatasets["findings"]["rows"][number];

function outcomeOf(dataset: TaxCockpitDatasets["findings"], row: Row) {
  const outcome = dataset.outcomeByRowId[row.id] as keyof typeof TAX_OUTCOME_TONE | undefined;
  const tone = outcome ? TAX_OUTCOME_TONE[outcome] : "neutral";
  return { tone, label: String(row.cells.status ?? "—") };
}

/** Lecture courte d'une ligne : opérandes d'un rapprochement, ou constat du contrôle. */
function readingOf(dataset: TaxCockpitDatasets["findings"], row: Row): string {
  const left = String(row.cells.left ?? "—");
  const right = String(row.cells.right ?? "—");
  if (left !== "—" || right !== "—") return `${left} ↔ ${right}`;
  return dataset.details[row.id]?.formula ?? "—";
}

export function TaxFindingTable({
  dataset,
  outcomeFilter,
  onOutcomeFilterChange,
  onPrepareDecision,
  reviewHistory,
}: {
  dataset: TaxCockpitDatasets["findings"];
  outcomeFilter: string;
  onOutcomeFilterChange: (outcome: string) => void;
  /** Pré-remplit la barre de décision (lignes de contrôle uniquement). */
  onPrepareDecision?: (draft: DecisionDraft) => void;
  reviewHistory?: (rowId: string) => readonly string[];
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const drawerId = useId();
  const triggers = useRef(new Map<string, HTMLButtonElement>());

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
  const openRow = openId ? dataset.rows.find((row) => row.id === openId) ?? null : null;

  const close = useCallback(() => {
    const trigger = openId ? triggers.current.get(openId) : null;
    setOpenId(null);
    trigger?.focus();
  }, [openId]);

  const pickFilter = (next: string) => {
    onOutcomeFilterChange(next);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section aria-label={dataset.title}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h3 style={BLOCK_TITLE}>Lignes de réconciliation et contrôles</h3>
        <div role="group" aria-label="Filtrer les lignes par statut" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <FilterButton label="Tous" pressed={outcomeFilter === "tous"} onClick={() => pickFilter("tous")} />
          {presentOutcomes.map((outcome) => (
            <FilterButton
              key={outcome}
              label={TAX_OUTCOME_LABEL[outcome]}
              pressed={outcomeFilter === outcome}
              onClick={() => pickFilter(outcome)}
            />
          ))}
        </div>
      </div>

      <div style={{ position: "relative", overflowX: "auto", marginTop: 16 }}>
        <table
          aria-label={`Tableau d'exploration : ${dataset.title}`}
          style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", tableLayout: "fixed", fontSize: FONT.table }}
        >
          <caption style={visuallyHidden}>{dataset.summary}</caption>
          <colgroup>
            {COLUMN_WIDTHS.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
              {["Impôt", "Contrôle", "Sortie", "Lecture", "Écart"].map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  style={{
                    padding: "0 12px 10px",
                    textAlign: index === 4 ? "right" : "left",
                    fontSize: 11,
                    fontWeight: 400,
                    textTransform: "uppercase",
                    letterSpacing: ".1em",
                    color: INK_FAINT,
                  }}
                >
                  {label}
                  {index === 4 && <span style={visuallyHidden}> (€)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 14, color: T.muted }}>
                  Aucune ligne pour ce filtre.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const { tone, label } = outcomeOf(dataset, row);
                const selected = openId === row.id;
                const title = String(row.cells.label ?? row.id);
                return (
                  <tr
                    key={row.id}
                    className="pbz-row"
                    onClick={() => setOpenId(row.id)}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,.05)",
                      cursor: "pointer",
                      background: selected ? "rgba(255,255,255,.05)" : undefined,
                    }}
                  >
                    <td style={{ ...cellStyle, fontSize: FONT.meta, color: INK_FAINT }}>{row.cells.tax}</td>
                    <td style={cellStyle}>
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) triggers.current.set(row.id, node);
                          else triggers.current.delete(row.id);
                        }}
                        className="pbz-focusable"
                        aria-expanded={selected}
                        aria-controls={selected ? drawerId : undefined}
                        aria-label={`Détail de la ligne « ${title} »`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenId(selected ? null : row.id);
                        }}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          textAlign: "left",
                          fontSize: FONT.table,
                          lineHeight: 1.45,
                          color: T.text,
                          cursor: "pointer",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {title}
                      </button>
                    </td>
                    <td style={{ ...cellStyle, fontSize: FONT.meta, fontWeight: 600, color: TONE_COLOR[tone] }}>
                      <span aria-hidden="true">{TONE_PREFIX[tone]} </span>
                      {label}
                    </td>
                    <td style={{ ...cellStyle, fontSize: FONT.meta, lineHeight: 1.5, color: T.muted }}>
                      <span style={clamp2}>{readingOf(dataset, row)}</span>
                    </td>
                    <td style={{ ...cellStyle, ...AMOUNT, textAlign: "right", color: "#c7d3e4" }}>
                      {row.cells.difference ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p style={{ margin: "14px 0 0", fontSize: FONT.meta, color: INK_FAINT }}>
        <span style={AMOUNT}>{filteredRows.length}</span> ligne(s) affichée(s) · {dataset.summary}
      </p>
      {filteredRows.length > visibleCount && (
        <button
          type="button"
          className="pbz-focusable"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          style={{
            marginTop: 10,
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 8,
            background: "transparent",
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
      <SourcesDisclosure dataset={dataset} style={{ marginTop: 10 }} />

      {openRow && (
        <TaxFindingDrawer
          id={drawerId}
          dataset={dataset}
          row={openRow}
          onClose={close}
          onPrepareDecision={
            onPrepareDecision && openRow.id.startsWith("control:")
              ? (action, comment) => {
                  onPrepareDecision({ rowId: openRow.id, action, comment });
                  setOpenId(null);
                }
              : undefined
          }
          history={reviewHistory?.(openRow.id) ?? []}
        />
      )}
    </section>
  );
}

function TaxFindingDrawer({
  id,
  dataset,
  row,
  onClose,
  onPrepareDecision,
  history,
}: {
  id: string;
  dataset: TaxCockpitDatasets["findings"];
  row: Row;
  onClose: () => void;
  onPrepareDecision?: (action: ReviewEventAction, comment: string) => void;
  history: readonly string[];
}) {
  const detail = dataset.details[row.id];
  const { tone, label } = outcomeOf(dataset, row);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `${id}-title`;
  const [comment, setComment] = useState("");

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, row.id]);

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="pbz-motion"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        maxWidth: "92vw",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        background: "#14171e",
        borderLeft: "1px solid rgba(255,255,255,.1)",
        boxShadow: "-28px 0 60px rgba(0,0,0,.5)",
        animation: "pbzSlideIn .28s cubic-bezier(.2,.7,.3,1) both",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 22px 16px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".14em", color: INK_FAINT }}>
            {row.cells.tax}
          </div>
          <h2
            id={titleId}
            style={{ margin: "6px 0 0", fontFamily: FAMILY.sans, fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: T.text, overflowWrap: "anywhere" }}
          >
            {row.cells.label}
          </h2>
          <div style={{ marginTop: 8, fontSize: FONT.meta, fontWeight: 600, color: TONE_COLOR[tone] }}>
            <span aria-hidden="true">{TONE_PREFIX[tone]} </span>
            {label}
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="pbz-focusable"
          aria-label="Fermer le détail"
          onClick={onClose}
          style={{ border: 0, borderRadius: 8, background: "rgba(255,255,255,.05)", padding: 6, color: T.muted, cursor: "pointer", lineHeight: 0 }}
        >
          <X aria-hidden="true" size={15} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: FONT.meta, color: INK_FAINT }}>Écart</span>
          <span style={{ ...AMOUNT, fontSize: 24, color: T.text }}>{row.cells.difference ?? "—"}</span>
        </div>
        {(row.cells.left !== "—" || row.cells.right !== "—") && (
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 12, fontSize: FONT.meta, color: T.muted }}>
            <span>Valeur A <span style={AMOUNT}>{row.cells.left}</span></span>
            <span>Valeur B <span style={AMOUNT}>{row.cells.right}</span></span>
          </div>
        )}
        {detail && (
          <dl style={{ margin: "22px 0 0", display: "flex", flexDirection: "column", gap: 16, fontSize: FONT.meta }}>
            <DetailEntry term="Formule / normalisations" value={detail.formula} />
            <DetailEntry
              term="Données utilisées"
              value={detail.usedData.length > 0 ? detail.usedData.join(" · ") : "—"}
              mono
            />
            <DetailEntry
              term="Limites"
              value={detail.limits.length > 0 ? detail.limits.join(" ") : "Aucune limite spécifique documentée sur cette ligne."}
            />
            <DetailEntry term="Preuve" value={detail.evidence} />
            <DetailEntry term="Sources" value={detail.sources.length > 0 ? detail.sources.join(" · ") : "—"} mono />
            <DetailEntry term="Historique de revue" value={history.length > 0 ? history.join(" · ") : detail.review} />
          </dl>
        )}
        {onPrepareDecision ? (
          <>
            <label
              style={{ marginTop: 22, display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: INK_FAINT }}
            >
              Commentaire de revue
              <textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Documenter la décision…"
                style={{
                  marginTop: 8,
                  display: "block",
                  width: "100%",
                  resize: "vertical",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.03)",
                  padding: "10px 12px",
                  fontSize: FONT.table,
                  textTransform: "none",
                  letterSpacing: 0,
                  color: T.text,
                }}
              />
            </label>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DRAWER_ACTIONS.map((action, index) => (
                <button
                  key={action.value}
                  type="button"
                  className="pbz-focusable"
                  onClick={() => onPrepareDecision(action.value, comment)}
                  style={
                    index === 0
                      ? { border: 0, borderRadius: 9, background: T.accent, padding: "9px 14px", fontSize: FONT.table, fontWeight: 600, color: "#061019", cursor: "pointer" }
                      : { border: "1px solid rgba(255,255,255,.12)", borderRadius: 9, background: "transparent", padding: "9px 14px", fontSize: FONT.table, color: "#c7d3e4", cursor: "pointer" }
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: FONT.meta, lineHeight: 1.5, color: INK_FAINT }}>
              La décision est préparée dans la barre de revue ; elle n&apos;est ajoutée à la chaîne append-only
              qu&apos;à l&apos;enregistrement.
            </p>
          </>
        ) : (
          <p style={{ margin: "22px 0 0", fontSize: FONT.meta, lineHeight: 1.6, color: T.muted }}>
            Ligne de rapprochement : la décision de revue se prend sur le contrôle qui l&apos;exploite.
          </p>
        )}
      </div>
    </div>
  );
}

function DetailEntry({ term, value, mono = false }: { term: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: INK_FAINT }}>{term}</dt>
      <dd
        style={{
          margin: "6px 0 0",
          lineHeight: 1.65,
          color: "#c7d3e4",
          overflowWrap: "anywhere",
          fontFamily: mono ? FAMILY.mono : undefined,
          fontSize: mono ? 11.5 : FONT.meta,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function FilterButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="pbz-focusable"
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        border: `1px solid ${pressed ? "rgba(91,157,255,.6)" : "rgba(255,255,255,.1)"}`,
        borderRadius: 999,
        background: pressed ? "rgba(91,157,255,.14)" : "transparent",
        color: pressed ? T.text : T.muted,
        cursor: "pointer",
        fontSize: FONT.meta,
        padding: "5px 12px",
      }}
    >
      {label}
    </button>
  );
}

const cellStyle: React.CSSProperties = { padding: "17px 12px", verticalAlign: "top" };

const clamp2: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

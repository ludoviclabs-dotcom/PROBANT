"use client";

/**
 * Acte II — le calcul. Le waterfall « résultat comptable → résultat fiscal →
 * IS » est la pièce maîtresse (pleine largeur, 1200 px). Un sélecteur segmenté
 * IS / TVA / CFE pilote le contenu en dessous. Chaque bloc est précédé d'une
 * phrase de lecture issue du dataset ; les sources et la méthodologie sont
 * repliées derrière « Sources et méthodologie ↓ ». Aucun montant n'est
 * recalculé ici : positions et largeurs de barres sont du pur dessin.
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { formatCents } from "@/lib/synthesis/money";
import {
  buildDifferenceReadings,
  buildTaxStatusLines,
  TAX_TYPE_LABEL,
  type TaxCockpitDatasets,
  type TaxCockpitScope,
  type TaxCockpitWaterfallStep,
  type TaxComparisonBarRow,
} from "@/lib/tax/cockpit";
import { C, MONO, SANS, SERIF, TONE, TONE_MARK } from "./fiscal-style";
import { SourcesBlock, SourcesToggle, SourcesPanel } from "./TaxSources";

export type CalculationScope = Exclude<TaxCockpitScope, "all">;

const SCOPES: readonly CalculationScope[] = ["corporate_income_tax", "vat", "cfe"];
const NOT_AVAILABLE = "non disponible";

const STEP_HINT: Readonly<Record<string, string>> = {
  accounting_result: "Point de départ : résultat comptable du FEC, avant tout retraitement fiscal.",
  reintegrations_confirmed: "Charges non déductibles réintégrées, confirmées par la revue.",
  reintegrations_proposed:
    "Candidat de revue : magnitude affichée, jamais ajoutée au cumul tant que la décision n'est pas prise.",
  deductions_confirmed: "Produits non imposables et déductions extra-comptables confirmées.",
  deductions_proposed: "Candidat de déduction : hors cumul tant que la décision n'est pas prise.",
  tax_result_before_deficits: "Somme des étapes confirmées uniquement.",
  deficits_offset: "Déficits reportables imputés sur l'exercice.",
};

const eyebrow = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".16em",
  color: C.faint,
  ...extra,
});

export function TaxCalculation({
  bundles,
  scope,
  onScopeChange,
}: {
  bundles: Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>>;
  scope: CalculationScope;
  onScopeChange: (scope: CalculationScope) => void;
}) {
  const all = bundles.all;
  return (
    <section
      aria-labelledby="tax-calc-title"
      className="fx-section"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px 0" }}
    >
      <div style={eyebrow()}>Acte II · Le calcul</div>
      <h2
        id="tax-calc-title"
        className="fx-h-act"
        style={{ margin: "12px 0 0", fontFamily: SERIF, fontSize: 32, fontWeight: 400, color: C.text }}
      >
        {all.waterfall.title}
      </h2>
      <p style={{ margin: "8px 0 0", maxWidth: "92ch", fontSize: 12.5, lineHeight: 1.6, color: C.muted }}>
        Chaque barre démarre là où la précédente s&apos;arrête : la position lit le cumul, la longueur lit le
        montant. Barres hachurées = candidats de revue, affichés pour leur magnitude mais{" "}
        <strong style={{ color: C.textSoft, fontWeight: 500 }}>hors cumul</strong> tant qu&apos;ils ne sont
        pas confirmés.
      </p>

      <Waterfall dataset={all.waterfall} />

      <div
        role="group"
        aria-label="Filtrer le cockpit par impôt"
        style={{
          marginTop: 56,
          display: "inline-flex",
          gap: 2,
          borderRadius: 10,
          background: C.track,
          padding: 3,
        }}
      >
        {SCOPES.map((candidate) => {
          const on = candidate === scope;
          return (
            <button
              key={candidate}
              type="button"
              aria-pressed={on}
              onClick={() => onScopeChange(candidate)}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "9px 18px",
                cursor: "pointer",
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: on ? 600 : 500,
                background: on ? "rgba(255,255,255,.09)" : "transparent",
                color: on ? C.text : C.muted,
                transition: "background .25s ease, color .25s ease",
              }}
            >
              {TAX_TYPE_LABEL[candidate]}
            </button>
          );
        })}
      </div>

      <div
        key={scope}
        className="fx-split"
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))",
          gap: 40,
          animation: "fxFadeIn .25s ease-out both",
        }}
      >
        {scope === "corporate_income_tax" && <IncomeTaxPanel bundles={bundles} />}
        {scope === "vat" && <VatPanel bundles={bundles} />}
        {scope === "cfe" && <CfePanel bundles={bundles} />}
      </div>
    </section>
  );
}

/* ───────────────────────── Waterfall ───────────────────────── */

function stepColor(step: TaxCockpitWaterfallStep): string {
  if (step.status === "proposed") return C.amber;
  if (step.kind === "base") return C.accent;
  if (step.kind === "subtotal") return C.violet;
  if (step.kind === "total") return C.green;
  return step.direction === "subtract" ? C.orange : C.amber;
}

function Waterfall({ dataset }: { dataset: TaxCockpitDatasets["waterfall"] }) {
  const steps = dataset.steps;
  const blocked = steps.length === 0 || steps.some((step) => step.status === "unavailable");
  // Axe signé : l'origine (zéro) reste dans le domaine, un résultat ou un cumul
  // négatif se place donc à sa vraie coordonnée au lieu de s'inverser.
  const totals = steps.filter((step) => step.status !== "unavailable").map((step) => step.runningTotalCents);
  const lo = Math.min(0, ...totals);
  const span = Math.max(1, Math.max(0, ...totals) - lo);
  const pos = (cents: number) => ((cents - lo) / span) * 100;
  const len = (cents: number) => (Math.abs(cents) / span) * 100;

  return (
    <div style={{ marginTop: 32 }}>
      {blocked && (
        <p
          style={{
            margin: "0 0 14px",
            borderRadius: 12,
            background: C.fill,
            padding: "14px 18px",
            fontSize: 12.5,
            lineHeight: 1.65,
            color: C.body,
          }}
        >
          {dataset.summary}
        </p>
      )}
      <div role="img" aria-label={dataset.summary} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, index) => {
          const totalLike = step.kind === "base" || step.kind === "subtotal" || step.kind === "total";
          const unavailable = step.status === "unavailable";
          const proposed = step.status === "proposed";
          const color = stepColor(step);
          const amount = totalLike ? step.runningTotalCents : step.deltaCents;
          const before = index > 0 ? steps[index - 1].runningTotalCents : 0;
          const empty = !totalLike && step.deltaCents === 0;
          const barHeight = totalLike ? 18 : 14;
          const animationDelay = `${Math.min(index, 9) * 0.12}s`;
          const hint = STEP_HINT[step.id];
          const tooltip = unavailable
            ? NOT_AVAILABLE
            : [hint, !proposed ? `Cumul après étape : ${formatCents(step.runningTotalCents)}.` : undefined]
                .filter(Boolean)
                .join(" ");

          let fill: React.ReactNode = null;
          if (!unavailable && !empty) {
            if (totalLike) {
              fill = (
                <div
                  style={{
                    position: "absolute",
                    left: `${pos(Math.min(0, step.runningTotalCents))}%`,
                    top: 0,
                    height: "100%",
                    width: `${len(step.runningTotalCents)}%`,
                    borderRadius: 4,
                    background:
                      step.kind === "base"
                        ? "linear-gradient(90deg, #5B9DFF, #4785E0)"
                        : step.kind === "subtotal"
                          ? "linear-gradient(90deg, #A78BFA, #8B6EF0)"
                          : "linear-gradient(90deg, #22C55E, #1AA64F)",
                    transformOrigin: "left",
                    animation: `fxBarIn .5s cubic-bezier(.2,.7,.3,1) ${animationDelay} both`,
                  }}
                />
              );
            } else if (proposed) {
              // Un candidat « soustractif » s'étend de (cumul − montant) au cumul ; un candidat
              // additif, du cumul à (cumul + montant). Le cumul retenu, lui, ne bouge pas.
              const proposedStart = step.direction === "subtract" ? before - step.deltaCents : before;
              fill = (
                <div
                  style={{
                    position: "absolute",
                    left: `min(${pos(proposedStart)}%, calc(100% - 14px))`,
                    top: 0,
                    height: "100%",
                    width: `max(14px, ${len(step.deltaCents)}%)`,
                    borderRadius: 3,
                    border: "1px dashed rgba(234,179,8,.6)",
                    background: "repeating-linear-gradient(45deg, rgba(234,179,8,.35) 0 4px, transparent 4px 8px)",
                    animation: `fxFadeIn .5s ease-out ${animationDelay} both`,
                  }}
                />
              );
            } else {
              const start = Math.min(before, step.runningTotalCents);
              fill = (
                <div
                  style={{
                    position: "absolute",
                    left: `${pos(start)}%`,
                    top: 0,
                    height: "100%",
                    width: `${len(step.deltaCents)}%`,
                    borderRadius: 4,
                    background: color,
                    transformOrigin: step.direction === "subtract" ? "right" : "left",
                    animation: `fxBarIn .5s cubic-bezier(.2,.7,.3,1) ${animationDelay} both`,
                  }}
                />
              );
            }
          }

          let caption: string;
          if (unavailable) caption = NOT_AVAILABLE;
          else if (step.kind === "base") caption = "Base de départ";
          else if (proposed) {
            caption = empty
              ? "Aucun candidat — cumul inchangé"
              : `Candidat de revue — hors cumul retenu${step.readingLabel ? ` · ${step.readingLabel.replace(/^[+−]\s/u, "").replace(" du résultat comptable", "")}` : ""}`;
          } else caption = step.readingLabel ?? (empty ? "Aucun montant — cumul inchangé" : "");

          return (
            <div
              key={step.id}
              className="fx-wf-row"
              title={tooltip || undefined}
              style={{
                padding: "8px 10px",
                margin: "0 -10px",
                marginTop: step.kind === "subtotal" && index > 0 ? 6 : undefined,
                borderRadius: 10,
                transition: "background .18s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span
                  style={
                    totalLike
                      ? { fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.text }
                      : { fontSize: 13.5, color: C.body }
                  }
                >
                  {step.kind === "delta" && !unavailable ? (step.direction === "subtract" ? "− " : "+ ") : ""}
                  {step.label}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: totalLike ? 19 : 17,
                    fontWeight: totalLike ? 500 : 400,
                    color: unavailable || empty ? C.faint : color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {unavailable ? NOT_AVAILABLE : formatCents(Math.abs(amount))}
                </span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: barHeight,
                  borderRadius: 4,
                  background: C.fill,
                  position: "relative",
                  overflow: proposed ? "hidden" : undefined,
                  border: proposed && empty ? "1px dashed rgba(234,179,8,.22)" : undefined,
                  ...(proposed && empty ? { background: "transparent" } : {}),
                }}
              >
                {fill}
              </div>
              <div
                style={{
                  marginTop: 5,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 11,
                  color: C.faint,
                }}
              >
                <span style={proposed && !empty ? { color: "#A8973F" } : undefined}>{caption}</span>
                {!unavailable && (
                  <span style={{ fontFamily: MONO, whiteSpace: "nowrap" }}>
                    {proposed ? "cumul inchangé" : `cumul ${formatCents(step.runningTotalCents)}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <WaterfallTotals dataset={dataset} />
    </div>
  );
}

function WaterfallTotals({ dataset }: { dataset: TaxCockpitDatasets["waterfall"] }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  return (
    <>
      <div
        style={{
          marginTop: 28,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: 44,
          borderTop: `1px solid ${C.lineStrong}`,
          paddingTop: 24,
        }}
      >
        <div>
          <div style={eyebrow({ letterSpacing: ".14em" })}>Résultat fiscal retenu</div>
          <div
            className="fx-big"
            style={{
              marginTop: 6,
              fontFamily: MONO,
              fontVariantNumeric: "tabular-nums",
              fontSize: 52,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "-.02em",
              color: C.text,
            }}
          >
            {dataset.confirmedTaxResultCents === null ? NOT_AVAILABLE : formatCents(dataset.confirmedTaxResultCents)}
          </div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div style={eyebrow({ letterSpacing: ".14em" })}>Borne intégrant les candidats</div>
          <div
            style={{
              marginTop: 6,
              fontFamily: MONO,
              fontVariantNumeric: "tabular-nums",
              fontSize: 26,
              color: C.muted,
            }}
          >
            {dataset.proposedTaxResultCents === null ? NOT_AVAILABLE : formatCents(dataset.proposedTaxResultCents)}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SourcesToggle dataset={dataset} open={sourcesOpen} onToggle={() => setSourcesOpen((o) => !o)} />
        </div>
      </div>
      {sourcesOpen && <SourcesPanel dataset={dataset} />}
    </>
  );
}

/* ───────────────────────── Panneaux par impôt ───────────────────────── */

const heading = (text: string) => (
  <h3 style={{ margin: 0, fontFamily: SANS, fontSize: 15, fontWeight: 600, color: C.text }}>{text}</h3>
);
const reading = (text: string) => (
  <p style={{ margin: "6px 0 0", maxWidth: "56ch", fontSize: 12.5, lineHeight: 1.65, color: C.muted }}>{text}</p>
);

function IncomeTaxPanel({ bundles }: { bundles: Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>> }) {
  const dataset = bundles.all.corporateReconciliation;
  const scoped = bundles.corporate_income_tax;
  const readings = buildDifferenceReadings(dataset.bars, formatCents);
  return (
    <>
      <div>
        {heading(dataset.title)}
        {reading(dataset.summary)}
        {readings.map((text) => (
          <p key={text} style={{ margin: "6px 0 0", maxWidth: "56ch", fontSize: 12.5, lineHeight: 1.65, color: C.red }}>
            <span aria-hidden="true">{TONE_MARK.critical} </span>
            {text}
          </p>
        ))}
        <ComparisonBars rows={dataset.bars} ariaLabel={dataset.summary} />
        <SourcesBlock dataset={dataset} />
      </div>
      <DocumentsColumn scoped={scoped} />
    </>
  );
}

function DocumentsColumn({ scoped }: { scoped: TaxCockpitDatasets }) {
  const documents = scoped.capability.documents;
  const documentsItem = scoped.capability.items.find((item) => item.id === "documents");
  return (
    <div>
      {heading("Documents mobilisés par le calcul")}
      {reading(
        `Pièces disponibles : ${documentsItem?.value ?? String(documents.length)}. Une pièce absente de PROBANT ne présume pas d'un défaut de dépôt auprès de l'administration.`,
      )}
      <ul style={{ margin: "20px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
        {documents.map((document, index) => (
          <li
            key={document.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 2px",
              borderBottom: index === documents.length - 1 ? undefined : `1px solid ${C.lineSoft}`,
            }}
          >
            <Check size={14} color={C.green} aria-hidden="true" />
            <span style={{ flex: 1, fontSize: 13, color: C.text }}>{document.label}</span>
            <span className="sr-only">disponible</span>
          </li>
        ))}
      </ul>
      <Callouts dataset={scoped.requiredDocuments} />
    </div>
  );
}

function Callouts({ dataset }: { dataset: TaxCockpitDatasets["requiredDocuments"] }) {
  if (dataset.rows.length === 0) return null;
  return (
    <>
      {dataset.rows.map((row) => (
        <div key={row.id} style={{ marginTop: 22, borderRadius: 12, background: C.fill, padding: "16px 18px" }}>
          <div style={eyebrow({ letterSpacing: ".14em" })}>{String(row.cells.kind)}</div>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.65, color: C.body }}>
            {String(row.cells.piece)}
          </p>
          {row.cells.controls && (
            <p style={{ margin: "6px 0 0", fontFamily: MONO, fontSize: 11, color: C.faint, overflowWrap: "anywhere" }}>
              {String(row.cells.controls)}
            </p>
          )}
        </div>
      ))}
    </>
  );
}

function VatPanel({ bundles }: { bundles: Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>> }) {
  const dataset = bundles.all.vatReconciliation;
  const scoped = bundles.vat;
  const differences = dataset.bars.filter((bar) => bar.differenceCents !== null && bar.differenceCents !== 0);
  return (
    <>
      <div>
        {heading(dataset.title)}
        {reading(dataset.summary)}
        <ComparisonBars rows={dataset.bars} ariaLabel={dataset.summary} />
        <SourcesBlock dataset={dataset} />
      </div>
      <div>
        {heading("Écarts relevés")}
        {reading(
          differences.length === 0
            ? "Aucun écart relevé entre la TVA comptabilisée et la TVA déclarée sur les agrégats comparés."
            : `${differences.length} agrégat(s) présentent un écart entre la TVA comptabilisée et la TVA déclarée ; les valeurs théoriques absentes restent « non disponible ».`,
        )}
        {differences.length > 0 && (
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 1 }}>
            {differences.map((bar, index) => (
              <div
                key={bar.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "14px 2px",
                  borderBottom: index === differences.length - 1 ? undefined : `1px solid ${C.lineSoft}`,
                }}
              >
                <span style={{ fontSize: 13, color: C.body }}>
                  {bar.label}
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: TONE[bar.tone] }}>
                    <span aria-hidden="true">{TONE_MARK[bar.tone]} </span>
                    {bar.statusLabel}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 20,
                    color: TONE[bar.tone],
                  }}
                >
                  {formatCents(bar.differenceCents!)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, borderRadius: 12, background: C.fill, padding: "16px 18px" }}>
          <div style={eyebrow({ letterSpacing: ".14em" })}>Ce qu&apos;un écart n&apos;est pas</div>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.65, color: C.body }}>
            Un écart n&apos;est ni un redressement ni une exposition certaine. L&apos;analyse ligne à ligne fait
            foi — voir l&apos;acte III.
          </p>
        </div>
        <Callouts dataset={scoped.requiredDocuments} />
      </div>
    </>
  );
}

function CfePanel({ bundles }: { bundles: Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>> }) {
  const scoped = bundles.cfe;
  const lines = scoped.findings.rows.filter((row) => scoped.findings.details[row.id]?.controlId === null);
  const status = buildTaxStatusLines(scoped).find((line) => line.tax === "CFE");
  return (
    <>
      <div>
        {heading("CFE : avis reçu, charge comptabilisée")}
        {reading(
          `${scoped.coverage.totalControls} contrôle(s) exécuté(s) sur la CFE, dont ${lines.length} rapprochement(s) entre l'avis, la charge et les règlements comptabilisés.`,
        )}
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 1 }}>
          {lines.map((row) => (
            <div
              key={row.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                padding: "14px 2px",
                borderBottom: `1px solid ${C.lineSoft}`,
              }}
            >
              <span style={{ fontSize: 13, color: C.body }}>{String(row.cells.label)}</span>
              <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14, color: C.text, whiteSpace: "nowrap" }}>
                {String(row.cells.left)} / {String(row.cells.right)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "14px 2px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 13, color: C.body }}>Contrôles exécutés</span>
            <span style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>{scoped.coverage.totalControls}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "14px 2px" }}>
            <span style={{ fontSize: 13, color: C.body }}>Statut le plus prioritaire</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: status ? TONE[status.tone] : C.muted }}>
              {status ? (
                <>
                  <span aria-hidden="true">{TONE_MARK[status.tone]} </span>
                  {status.label}
                </>
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
        <SourcesBlock dataset={scoped.findings} />
      </div>
      <div>
        {heading("Analyse recommandée")}
        {reading(
          "Une sortie « non concluant » n'est pas une anomalie : c'est une procédure supplémentaire à programmer (ISA 330).",
        )}
        <Callouts dataset={scoped.requiredDocuments} />
      </div>
    </>
  );
}

/* ───────────────────────── Barres de comparaison ───────────────────────── */

const OPERAND_COLORS = [C.accent, C.violet, C.teal] as const;

function ComparisonBars({ rows, ariaLabel }: { rows: readonly TaxComparisonBarRow[]; ariaLabel: string }) {
  if (rows.length === 0) {
    return <p style={{ margin: "20px 0 0", fontSize: 13, color: C.muted }}>Aucune donnée disponible sur ce périmètre.</p>;
  }
  const max = Math.max(
    1,
    ...rows.flatMap((row) => row.values.map((value) => Math.abs(value.amountCents ?? 0))),
  );
  let order = 0;
  return (
    <div role="img" aria-label={ariaLabel} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 18 }}>
      {rows.map((row) => (
        <div key={row.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{row.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: TONE[row.tone], textAlign: "right" }}>
              <span aria-hidden="true">{TONE_MARK[row.tone]} </span>
              {row.statusLabel}
              {row.differenceCents !== null && row.differenceCents !== 0 && ` (${formatCents(row.differenceCents)})`}
            </span>
          </div>
          {row.values.map((value, index) => {
            const available = value.amountCents !== null;
            const delay = `${(order++ % 6) * 0.08}s`;
            return (
              <div key={value.key} style={{ marginTop: index === 0 ? 8 : 4, display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className="fx-op-label"
                  style={{ width: 96, flexShrink: 0, textAlign: "right", fontSize: 11, color: C.faint }}
                >
                  {value.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 9,
                    borderRadius: 3,
                    background: C.track,
                    border: available ? undefined : "1px dashed rgba(234,179,8,.4)",
                  }}
                >
                  {available && (
                    <div
                      style={{
                        height: "100%",
                        width: `${(Math.abs(value.amountCents!) / max) * 100}%`,
                        borderRadius: 3,
                        background: OPERAND_COLORS[index % OPERAND_COLORS.length],
                        transformOrigin: "left",
                        animation: `fxBarIn .5s ease-out ${delay} both`,
                      }}
                    />
                  )}
                </div>
                <span
                  className="fx-op-value"
                  style={{
                    width: 104,
                    flexShrink: 0,
                    textAlign: "right",
                    fontFamily: MONO,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: available ? 12 : 11,
                    color: available ? C.text : C.muted,
                  }}
                >
                  {available ? formatCents(value.amountCents!) : NOT_AVAILABLE}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

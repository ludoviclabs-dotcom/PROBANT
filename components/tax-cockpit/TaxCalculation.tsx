"use client";

/**
 * Acte II — le calcul. Le pont « résultat comptable → résultat fiscal → IS » en registre (une ligne par étape du
 * moteur : libellé, barre, montant, cumul), puis une bascule textuelle IS / TVA / CFE qui pilote le détail en
 * dessous. Aucun montant n'est recalculé ici : positions et longueurs de barres sont du pur dessin, les libellés
 * des moteurs passent par la projection d'affichage (accents) indexée par code.
 */

import { useId, useState } from "react";
import p from "@/components/charte/page.module.css";
import { formatCents } from "@/lib/synthesis/money";
import {
  buildDifferenceReadings,
  buildTaxStatusLines,
  describeRequiredInput,
  displayLimitationMessage,
  displayReconciliationLineLabel,
  displayVatComparisonLabel,
  displayWaterfallStepLabel,
  TAX_TYPE_LABEL,
  type TaxCockpitDatasets,
  type TaxCockpitScope,
  type TaxCockpitWaterfallStep,
  type TaxComparisonBarRow,
} from "@/lib/tax/cockpit";
import { ActLine } from "./ActLine";
import { OutcomeGlyph, OutcomeMark, outcomeOfLabel } from "./OutcomeMark";
import { SourcesBlock, SourcesPanel, SourcesToggle } from "./TaxSources";
import x from "./fiscalite.module.css";

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

type Bundles = Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>>;

export function TaxCalculation({
  bundles,
  scope,
  onScopeChange,
}: {
  bundles: Bundles;
  scope: CalculationScope;
  onScopeChange: (scope: CalculationScope) => void;
}) {
  const all = bundles.all;
  return (
    <section aria-labelledby="tax-calc-title" className={x.act}>
      <ActLine numeral="II" name="Le calcul" />
      <h2 id="tax-calc-title" className={x.actTitle}>
        {all.waterfall.title}
      </h2>
      <p className={x.lede}>
        Chaque barre démarre là où la précédente s&apos;arrête : la position lit le cumul, la longueur le montant.
        Hachuré : candidat de revue, montré pour sa grandeur mais <strong>hors cumul</strong> tant qu&apos;il n&apos;est
        pas confirmé.
      </p>

      <Waterfall dataset={all.waterfall} />

      <div role="group" aria-label="Filtrer le cockpit par impôt" className={x.taxSwitch}>
        {SCOPES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`${p.toggle} ${x.taxToggle}`}
            aria-pressed={candidate === scope}
            onClick={() => onScopeChange(candidate)}
          >
            {TAX_TYPE_LABEL[candidate]}
          </button>
        ))}
      </div>

      <div key={scope} className={x.panel}>
        {scope === "corporate_income_tax" && <IncomeTaxPanel bundles={bundles} />}
        {scope === "vat" && <VatPanel bundles={bundles} />}
        {scope === "cfe" && <CfePanel bundles={bundles} />}
      </div>
    </section>
  );
}

/* ───────────────────────── Pont (waterfall) ───────────────────────── */

type BarKind = "total" | "add" | "subtract" | "candidate";

function Waterfall({ dataset }: { dataset: TaxCockpitDatasets["waterfall"] }) {
  const steps = dataset.steps;
  const blocked = steps.length === 0 || steps.some((step) => step.status === "unavailable");
  // Axe signé : l'origine (zéro) reste dans le domaine, un résultat ou un cumul négatif se place donc à sa vraie
  // coordonnée au lieu de s'inverser. Pur dessin : aucune valeur affichée n'en dépend.
  const totals = steps.filter((step) => step.status !== "unavailable").map((step) => step.runningTotalCents);
  const lo = Math.min(0, ...totals);
  const span = Math.max(1, Math.max(0, ...totals) - lo);
  const pos = (cents: number) => ((cents - lo) / span) * 100;
  const len = (cents: number) => (Math.abs(cents) / span) * 100;

  return (
    <div className={x.wfBlock}>
      {blocked && <p className={x.blockedNote}>{dataset.summary}</p>}
      {steps.length > 0 && (
        <ol className={x.wf} aria-label="Pont du résultat comptable à l'IS">
          {steps.map((step, index) => (
            <WaterfallRow
              key={step.id}
              step={step}
              before={index > 0 ? steps[index - 1].runningTotalCents : 0}
              pos={pos}
              len={len}
              delay={Math.min(index, 9)}
            />
          ))}
        </ol>
      )}
      <WaterfallTotals dataset={dataset} />
    </div>
  );
}

function WaterfallRow({
  step,
  before,
  pos,
  len,
  delay,
}: {
  step: TaxCockpitWaterfallStep;
  before: number;
  pos: (cents: number) => number;
  len: (cents: number) => number;
  delay: number;
}) {
  const totalLike = step.kind === "base" || step.kind === "subtotal" || step.kind === "total";
  const unavailable = step.status === "unavailable";
  const proposed = step.status === "proposed";
  const empty = !totalLike && step.deltaCents === 0;
  const label = displayWaterfallStepLabel(step.id, step.label);
  const hint = STEP_HINT[step.id];
  const tooltip = unavailable
    ? NOT_AVAILABLE
    : [hint, !proposed ? `Cumul après étape : ${formatCents(step.runningTotalCents)}.` : undefined].filter(Boolean).join(" ");

  let bar: { kind: BarKind; left: string; width: string } | null = null;
  if (!unavailable && !empty) {
    if (totalLike) {
      bar = { kind: "total", left: `${pos(Math.min(0, step.runningTotalCents))}%`, width: `${len(step.runningTotalCents)}%` };
    } else if (proposed) {
      // Un candidat « soustractif » s'étend de (cumul − montant) au cumul ; un candidat additif, du cumul à
      // (cumul + montant). Le cumul retenu, lui, ne bouge pas.
      // Largeur minimale de 2,5 % pour rester visible ; la barre reste dans la piste.
      const start = step.direction === "subtract" ? before - step.deltaCents : before;
      const width = Math.max(2.5, len(step.deltaCents));
      bar = { kind: "candidate", left: `${Math.max(0, Math.min(pos(start), 100 - width))}%`, width: `${width}%` };
    } else {
      const start = Math.min(before, step.runningTotalCents);
      bar = { kind: step.direction === "subtract" ? "subtract" : "add", left: `${pos(start)}%`, width: `${len(step.deltaCents)}%` };
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

  // Total : montant signé (un résultat déficitaire reste négatif) ; étape : grandeur, le sens est dans le libellé.
  const amount = unavailable ? NOT_AVAILABLE : totalLike ? formatCents(step.runningTotalCents) : formatCents(Math.abs(step.deltaCents));

  return (
    <li
      className={x.wfRow}
      title={tooltip || undefined}
      data-kind={totalLike ? step.kind : "delta"}
      data-status={step.status}
      data-empty={empty ? "" : undefined}
    >
      <span className={x.wfLabel}>
        <span className={x.wfName}>
          {step.kind === "delta" && !unavailable ? (step.direction === "subtract" ? "− " : "+ ") : ""}
          {label}
          {proposed && !empty && <span className={x.wfTag}>candidat</span>}
        </span>
        {caption && <span className={x.wfCaption}>{caption}</span>}
      </span>
      <span className={x.wfTrack} aria-hidden="true">
        {bar && (
          <span
            className={x.wfBar}
            data-bar={bar.kind}
            style={{ left: bar.left, width: bar.width, animationDelay: `${delay * 60}ms` }}
          />
        )}
      </span>
      <span className={x.wfAmount} data-muted={unavailable || empty ? "" : undefined}>
        {amount}
      </span>
      <span className={x.wfCumul}>
        {unavailable ? "" : proposed ? "cumul inchangé" : `cumul ${formatCents(step.runningTotalCents)}`}
      </span>
    </li>
  );
}

function WaterfallTotals({ dataset }: { dataset: TaxCockpitDatasets["waterfall"] }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <div className={x.wfTotals}>
        <dl className={x.totals}>
          <div>
            <dt className={p.key}>Résultat fiscal retenu</dt>
            <dd>{dataset.confirmedTaxResultCents === null ? NOT_AVAILABLE : formatCents(dataset.confirmedTaxResultCents)}</dd>
          </div>
          <div data-candidate="">
            <dt className={p.key}>Borne intégrant les candidats</dt>
            <dd>{dataset.proposedTaxResultCents === null ? NOT_AVAILABLE : formatCents(dataset.proposedTaxResultCents)}</dd>
          </div>
        </dl>
        <SourcesToggle dataset={dataset} open={sourcesOpen} onToggle={() => setSourcesOpen((o) => !o)} controls={panelId} />
      </div>
      {sourcesOpen && <SourcesPanel dataset={dataset} id={panelId} />}
    </>
  );
}

/* ───────────────────────── Détail par impôt ───────────────────────── */

function IncomeTaxPanel({ bundles }: { bundles: Bundles }) {
  const dataset = bundles.all.corporateReconciliation;
  const scoped = bundles.corporate_income_tax;
  const bars = dataset.bars.map((bar) => ({ ...bar, label: displayReconciliationLineLabel(bar.lineKey, bar.label) }));
  const readings = buildDifferenceReadings(bars, formatCents);
  return (
    <div className={p.split}>
      <div className={p.splitMain}>
        <h3 className={x.panelTitle}>{dataset.title}</h3>
        <p className={x.reading}>{dataset.summary}</p>
        {readings.map((text) => (
          <p key={text} className={x.diffReading}>
            <OutcomeGlyph outcome="reconciliation_difference" />
            <span>{text}</span>
          </p>
        ))}
        <ComparisonTable rows={bars} title={dataset.title} summary={dataset.summary} firstColumn="Rapprochement" />
        <SourcesBlock dataset={dataset} />
      </div>
      <aside className={`${p.splitAside} ${x.aside}`} aria-label="Documents et données du calcul IS">
        <DocumentsColumn scoped={scoped} />
      </aside>
    </div>
  );
}

function DocumentsColumn({ scoped }: { scoped: TaxCockpitDatasets }) {
  const documents = scoped.capability.documents;
  const documentsItem = scoped.capability.items.find((item) => item.id === "documents");
  return (
    <>
      <h3 className={x.asideTitle}>Documents mobilisés par le calcul</h3>
      <p className={x.reading}>
        Pièces disponibles : <span className={x.mono}>{documentsItem?.value ?? String(documents.length)}</span>. Une pièce
        absente de PROBANT ne présume pas d&apos;un défaut de dépôt auprès de l&apos;administration.
      </p>
      {documents.length > 0 && (
        <ul className={x.docList}>
          {documents.map((document) => (
            <li key={document.label}>
              <span>{document.label}</span>
              <span className={p.soft}>disponible</span>
            </li>
          ))}
        </ul>
      )}
      <Callouts dataset={scoped.requiredDocuments} />
    </>
  );
}

const MISSING_INPUT = /^(profile|parameter|field|period|source_version):/u;

/** Données attendues et limitations des moteurs : la phrase humaine d'abord, le code en petit, en mono. */
function Callouts({ dataset }: { dataset: TaxCockpitDatasets["requiredDocuments"] }) {
  if (dataset.rows.length === 0) return null;
  return (
    <ul className={x.callouts} aria-label={dataset.title}>
      {dataset.rows.map((row) => {
        const kind = String(row.cells.kind);
        const piece = String(row.cells.piece);
        const controls = row.cells.controls ? String(row.cells.controls) : "";
        let body: React.ReactNode;
        let code: string | null = null;
        if (row.id.startsWith("document:")) {
          body = piece;
        } else if (MISSING_INPUT.test(row.id)) {
          const described = describeRequiredInput(row.id);
          code = described.code;
          body = described.sentence ?? null;
        } else {
          body = displayLimitationMessage(row.id, piece);
        }
        return (
          <li key={row.id} className={x.callout} data-kind={kind}>
            <p className={p.key}>{kind}</p>
            {body && <p className={x.calloutText}>{body}</p>}
            {code && <p className={x.calloutCode}>{code}</p>}
            {controls && controls !== "—" && <p className={x.calloutCode}>{controls}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function VatPanel({ bundles }: { bundles: Bundles }) {
  const dataset = bundles.all.vatReconciliation;
  const scoped = bundles.vat;
  const bars = dataset.bars.map((bar) => ({ ...bar, label: displayVatComparisonLabel(bar.id, bar.label) }));
  const differences = bars.filter((bar) => bar.differenceCents !== null && bar.differenceCents !== 0);
  return (
    <div className={p.split}>
      <div className={p.splitMain}>
        <h3 className={x.panelTitle}>{dataset.title}</h3>
        <p className={x.reading}>{dataset.summary}</p>
        <ComparisonTable rows={bars} title={dataset.title} summary={dataset.summary} firstColumn="Agrégat" />
        <SourcesBlock dataset={dataset} />
      </div>
      <aside className={`${p.splitAside} ${x.aside}`} aria-label="Écarts TVA et données attendues">
        <h3 className={x.asideTitle}>Écarts relevés</h3>
        <p className={x.reading}>
          {differences.length === 0
            ? "Aucun écart relevé entre la TVA comptabilisée et la TVA déclarée sur les agrégats comparés."
            : `${differences.length} agrégat(s) présentent un écart entre la TVA comptabilisée et la TVA déclarée ; les valeurs théoriques absentes restent « non disponible ».`}
        </p>
        {differences.length > 0 && (
          <ul className={x.diffList}>
            {differences.map((bar) => (
              <li key={bar.id}>
                <span>
                  {bar.label}
                  <span className={x.diffStatus}>
                    <StatusWord label={bar.statusLabel} />
                  </span>
                </span>
                <span className={x.diffAmount}>{formatCents(bar.differenceCents!)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={x.aside2}>
          <p className={p.key}>Ce qu&apos;un écart n&apos;est pas</p>
          <p className={x.calloutText}>
            Un écart n&apos;est ni un redressement ni une exposition certaine. L&apos;analyse ligne à ligne fait foi —
            voir l&apos;acte III.
          </p>
        </div>
        <Callouts dataset={scoped.requiredDocuments} />
      </aside>
    </div>
  );
}

function CfePanel({ bundles }: { bundles: Bundles }) {
  const scoped = bundles.cfe;
  const lines = scoped.findings.rows.filter((row) => scoped.findings.details[row.id]?.controlId === null);
  const status = buildTaxStatusLines(scoped).find((line) => line.tax === "CFE");
  return (
    <div className={p.split}>
      <div className={p.splitMain}>
        <h3 className={x.panelTitle}>CFE : avis reçu, charge comptabilisée</h3>
        <p className={x.reading}>
          {`${scoped.coverage.totalControls} contrôle(s) exécuté(s) sur la CFE, dont ${lines.length} rapprochement(s) entre l'avis, la charge et les règlements comptabilisés.`}
        </p>
        <dl className={x.factList}>
          {lines.map((row) => (
            <div key={row.id}>
              <dt>{displayReconciliationLineLabel(scoped.findings.details[row.id]?.lineKey, String(row.cells.label))}</dt>
              <dd className={x.mono}>
                {String(row.cells.left)} / {String(row.cells.right)}
              </dd>
            </div>
          ))}
          <div>
            <dt>Contrôles exécutés</dt>
            <dd className={x.mono}>{scoped.coverage.totalControls}</dd>
          </div>
          <div>
            <dt>Statut le plus prioritaire</dt>
            <dd>{status ? <OutcomeMark outcome={outcomeOfLabel(status.label)} label={status.label} /> : "—"}</dd>
          </div>
        </dl>
        <SourcesBlock dataset={scoped.findings} />
      </div>
      <aside className={`${p.splitAside} ${x.aside}`} aria-label="Analyse recommandée et données attendues CFE">
        <h3 className={x.asideTitle}>Analyse recommandée</h3>
        <p className={x.reading}>
          Une sortie « non concluant » n&apos;est pas une anomalie : c&apos;est une procédure supplémentaire à programmer
          (ISA 330).
        </p>
        <Callouts dataset={scoped.requiredDocuments} />
      </aside>
    </div>
  );
}

/* ───────────────────────── Registre de comparaison ───────────────────────── */

/** Libellé de statut d'un dataset : glyphe + mot si c'est une sortie de la taxonomie, sinon le mot seul. */
function StatusWord({ label }: { label: string }) {
  const outcome = outcomeOfLabel(label);
  return outcome === "none" ? <span className={p.soft}>{label}</span> : <OutcomeMark outcome={outcome} label={label} />;
}

function ComparisonTable({
  rows,
  title,
  summary,
  firstColumn,
}: {
  rows: readonly TaxComparisonBarRow[];
  title: string;
  summary: string;
  firstColumn: string;
}) {
  if (rows.length === 0) {
    return <p className={x.empty}>Aucune donnée disponible sur ce périmètre.</p>;
  }
  // Opérandes communs à toutes les lignes (TVA : théorique / comptabilisé / déclaré) → en-têtes ; sinon (IS :
  // recalculé / déclaré, calculé / comptabilisé) → « Valeur A / B » et les opérandes sous chaque libellé.
  const signature = (row: TaxComparisonBarRow) => row.values.map((value) => value.label).join("|");
  const shared = rows.every((row) => signature(row) === signature(rows[0]));
  const width = Math.max(...rows.map((row) => row.values.length));
  const headers = shared
    ? rows[0].values.map((value) => value.label)
    : Array.from({ length: width }, (_, index) => `Valeur ${String.fromCharCode(65 + index)}`);

  return (
    <div role="region" aria-label={`${title}, défilement horizontal`} tabIndex={0} className={`${p.scrollX} ${x.tableRegion}`}>
      <table className={`${p.register} ${x.compareTable}`}>
        <caption className="sr-only">{summary}</caption>
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            {headers.map((header) => (
              <th key={header} scope="col" className={p.num}>
                {header}
              </th>
            ))}
            <th scope="col">Sortie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const outcome = outcomeOfLabel(row.statusLabel);
            const hasDifference = row.differenceCents !== null && row.differenceCents !== 0;
            return (
              <tr key={row.id} data-flag={outcome === "reconciliation_difference" ? "" : undefined}>
                <th scope="row">
                  {row.label}
                  {!shared && (
                    <span className={x.operands}>{row.values.map((value) => value.label.toLowerCase()).join(" · ")}</span>
                  )}
                </th>
                {headers.map((header, index) => {
                  const value = row.values[index];
                  const available = value !== undefined && value.amountCents !== null;
                  return (
                    <td key={header} className={p.num} data-muted={available ? undefined : ""}>
                      {available ? formatCents(value.amountCents!) : NOT_AVAILABLE}
                    </td>
                  );
                })}
                <td>
                  <StatusWord label={row.statusLabel} />
                  {hasDifference && (
                    <span className={x.rowDifference} data-signal={outcome === "reconciliation_difference" ? "" : undefined}>
                      écart {formatCents(row.differenceCents!)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

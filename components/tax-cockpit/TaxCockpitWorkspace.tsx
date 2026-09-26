"use client";

/**
 * Orchestrateur client du cockpit fiscalité (TAX-08) — refonte narrative.
 *
 * Trois actes + décision, dans l'ordre de la revue :
 * - ACTE 0 : barre de contexte sticky (stepper, statut d'attention unique) ;
 * - ACTE I : le verdict (phrase de synthèse, métriques, prochaine action) ;
 * - ACTE II : le calcul (waterfall pleine largeur, réconciliations par impôt) ;
 * - ACTE III : l'exposition (couverture impôt × cycle, lignes à traiter) ;
 * - ACTE IV : la décision (barre sticky bas, exports regroupés).
 *
 * Les datasets sont pré-construits côté serveur pour chaque périmètre : le
 * sélecteur d'impôt ne fait que choisir un paquet — aucun calcul métier ici.
 * Le verdict et le waterfall portent sur le dossier entier ; le périmètre
 * filtre ce qui suit le sélecteur. Filtres synchronisés à l'URL (`?impot=`,
 * `?statut=`) sans rechargement.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReviewEvent } from "@/lib/canonical-model";
import { buildTaxEvidenceFindings } from "@/lib/evidence/tax-package";
import type { TaxSupplementalEvidence } from "@/lib/evidence/tax-types";
import type { TaxCockpitDatasets, TaxCockpitScope, TaxCockpitSource } from "@/lib/tax/cockpit";
import { TAX_TYPE_LABEL } from "@/lib/tax/cockpit";
import { FONT, T, focusStyle } from "@/components/synthesis/tokens";
import { AccountingToTaxWaterfall } from "./AccountingToTaxWaterfall";
import { CfeReconciliation } from "./CfeReconciliation";
import { ACT_TITLE, cockpitCss, EYEBROW, FAMILY, INK_FAINT, SECTION } from "./cockpit-style";
import { CorporateTaxReconciliation } from "./CorporateTaxReconciliation";
import { Reveal } from "./Reveal";
import { TaxCapabilityPanel } from "./TaxCapabilityPanel";
import { TaxEvidenceExportToolbar } from "./TaxEvidenceExportToolbar";
import { TaxExposurePanel } from "./TaxExposurePanel";
import { TaxFindingTable, type DecisionDraft } from "./TaxFindingTable";
import { TaxMissingDataPanel } from "./TaxMissingDataPanel";
import type { ProofLayerTarget } from "./TaxProofChainScene";
import { evidenceFindingIdFor, REVIEW_ACTIONS, TaxReviewPanel, type TaxReviewDraft } from "./TaxReviewPanel";
import { TaxRiskMatrix } from "./TaxRiskMatrix";
import { TaxSummaryHeader, type ReviewStep, type ReviewStepId } from "./TaxSummaryHeader";
import { VatReconciliationChart } from "./VatReconciliationChart";

const SCOPE_LABEL: Readonly<Record<TaxCockpitScope, string>> = {
  all: "Tous les impôts",
  corporate_income_tax: TAX_TYPE_LABEL.corporate_income_tax,
  vat: TAX_TYPE_LABEL.vat,
  cfe: TAX_TYPE_LABEL.cfe,
};

const STEP_TARGET: Readonly<Record<ReviewStepId, string>> = {
  donnees: "tax-act-verdict",
  controles: "tax-act-calcul",
  analyse: "tax-act-exposition",
  decision: "tax-act-decision",
};

function writeUrl(scope: TaxCockpitScope, outcome: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (scope === "all") url.searchParams.delete("impot");
  else url.searchParams.set("impot", scope);
  if (outcome === "tous") url.searchParams.delete("statut");
  else url.searchParams.set("statut", outcome);
  window.history.replaceState(null, "", url.toString());
}

function scrollToSection(id: string) {
  const node = document.getElementById(id);
  if (!node) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  node.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

/** États du stepper, dérivés des compteurs du dataset et du nombre d'événements de revue. */
function reviewSteps(overview: TaxCockpitDatasets, reviewCount: number): ReviewStep[] {
  const documents = overview.capability.items.find((item) => item.id === "documents");
  const dataReady = documents?.tone !== "warning";
  const controlsRun = overview.coverage.totalControls > 0;
  const decided = reviewCount > 0;
  return [
    { id: "donnees", label: "Données", state: dataReady ? "done" : "current" },
    { id: "controles", label: "Contrôles", state: !dataReady ? "todo" : controlsRun ? "done" : "current" },
    { id: "analyse", label: "Analyse", state: !dataReady || !controlsRun ? "todo" : decided ? "done" : "current" },
    { id: "decision", label: "Décision", state: decided ? "current" : "todo" },
  ];
}

export function TaxCockpitWorkspace({
  bundles,
  initialScope,
  initialOutcome,
  evidenceSource,
  show3d = true,
}: {
  bundles: Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>>;
  initialScope: TaxCockpitScope;
  initialOutcome: string;
  evidenceSource?: TaxCockpitSource;
  show3d?: boolean;
}) {
  const [scope, setScope] = useState<TaxCockpitScope>(initialScope);
  const [outcome, setOutcome] = useState(initialOutcome);
  const [reviewEvents, setReviewEvents] = useState<readonly ReviewEvent[]>([]);
  const [supplementalEvidence, setSupplementalEvidence] = useState<readonly TaxSupplementalEvidence[]>([]);
  const [draft, setDraft] = useState<TaxReviewDraft | null>(null);
  const overview = bundles.all;
  const datasets = bundles[scope];

  const evidenceFindings = useMemo(
    () => (evidenceSource ? buildTaxEvidenceFindings({ source: evidenceSource }) : []),
    [evidenceSource],
  );

  const changeScope = useCallback(
    (next: TaxCockpitScope) => {
      setScope(next);
      writeUrl(next, outcome);
    },
    [outcome],
  );
  const changeOutcome = useCallback(
    (next: string) => {
      setOutcome(next);
      writeUrl(scope, next);
    },
    [scope],
  );

  const prepareDecision = useCallback((next: DecisionDraft) => {
    setDraft((previous) => ({ ...next, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const prepareNextAction = useCallback(() => {
    const controlIds = overview.capability.nextAction?.controlIds ?? [];
    const row = overview.findings.rows.find((candidate) =>
      controlIds.some((controlId) => String(candidate.cells.label ?? "").startsWith(`${controlId} —`)),
    );
    if (!row) return;
    setDraft((previous) => ({ rowId: row.id, nonce: (previous?.nonce ?? 0) + 1 }));
  }, [overview]);

  const reviewHistory = useCallback(
    (rowId: string) => {
      const findingId = evidenceFindingIdFor(evidenceFindings, rowId);
      if (!findingId) return [];
      return reviewEvents
        .filter((event) => event.findingId === findingId)
        .map((event) => {
          const label =
            REVIEW_ACTIONS.find((action) => action.value === event.action)?.label ?? event.action ?? "Événement de revue";
          return event.comment ? `${label} — ${event.comment}` : label;
        });
    },
    [evidenceFindings, reviewEvents],
  );

  const steps = reviewSteps(overview, reviewEvents.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", color: T.text, fontSize: FONT.body }}>
      <style>{focusStyle + cockpitCss}</style>

      <TaxSummaryHeader
        summary={overview.summary}
        steps={steps}
        attentionOpen={reviewEvents.length === 0}
        onStepSelect={(step) => scrollToSection(STEP_TARGET[step])}
      />

      <TaxCapabilityPanel
        datasets={overview}
        show3d={show3d}
        onPrepareNextAction={evidenceSource ? prepareNextAction : undefined}
        onNavigate={(target: ProofLayerTarget) => scrollToSection(target)}
      />

      <section id="tax-act-calcul" aria-label="Acte II · Le calcul" style={{ ...SECTION, scrollMarginTop: 72 }}>
        <Reveal>
          <AccountingToTaxWaterfall dataset={overview.waterfall} />
        </Reveal>

        <div
          id="tax-reconciliation"
          style={{ marginTop: 56, display: "flex", alignItems: "center", gap: "10px 18px", flexWrap: "wrap", scrollMarginTop: 72 }}
        >
          <ScopeTabs scope={scope} onChange={changeScope} />
          <p style={{ margin: 0, fontSize: FONT.meta, color: INK_FAINT }}>
            Le périmètre filtre les réconciliations, la couverture et les lignes ci-dessous.
          </p>
        </div>

        <div
          key={scope}
          className="pbz-fade"
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))",
            gap: "48px 40px",
          }}
        >
          {(scope === "all" || scope === "corporate_income_tax") && (
            <CorporateTaxReconciliation dataset={datasets.corporateReconciliation} />
          )}
          {(scope === "all" || scope === "vat") && <VatReconciliationChart dataset={datasets.vatReconciliation} />}
          {(scope === "all" || scope === "cfe") && <CfeReconciliation dataset={datasets.cfeReconciliation} />}
          <TaxExposurePanel dataset={datasets.exposure} periods={datasets.periods} />
          <div style={{ gridColumn: "1 / -1" }}>
            <TaxMissingDataPanel dataset={datasets.requiredDocuments} />
          </div>
        </div>
      </section>

      <section
        id="tax-act-exposition"
        aria-labelledby="tax-act-exposition-title"
        style={{ ...SECTION, scrollMarginTop: 72 }}
      >
        <Reveal>
          <div style={EYEBROW}>Acte III · L&apos;exposition</div>
          <h2 id="tax-act-exposition-title" style={ACT_TITLE}>
            Couverture des contrôles et lignes à traiter
          </h2>
          <p style={{ margin: "8px 0 0", maxWidth: "84ch", fontSize: 13, lineHeight: 1.7, color: T.muted }}>
            Les {datasets.coverage.totalControls} contrôles exécutés sur le périmètre «&nbsp;{SCOPE_LABEL[scope]}&nbsp;»,
            croisés par impôt et par cycle de revue. La micro-barre de chaque cellule décompose ses sorties ; le
            filet coloré reprend la sortie la plus prioritaire de l&apos;intersection.
          </p>
        </Reveal>
        <div style={{ marginTop: 20 }}>
          <TaxRiskMatrix dataset={datasets.riskMatrix} coverage={datasets.coverage} />
        </div>
        <div style={{ marginTop: 48 }}>
          <TaxFindingTable
            dataset={datasets.findings}
            outcomeFilter={outcome}
            onOutcomeFilterChange={changeOutcome}
            onPrepareDecision={evidenceSource ? prepareDecision : undefined}
            reviewHistory={reviewHistory}
          />
        </div>
      </section>

      <div aria-hidden="true" style={{ flex: 1, minHeight: 56 }} />

      {evidenceSource && (
        <TaxReviewPanel
          source={evidenceSource}
          events={reviewEvents}
          evidence={supplementalEvidence}
          draft={draft}
          onChange={(events, evidence) => {
            setReviewEvents(events);
            setSupplementalEvidence(evidence);
          }}
          exports={
            <TaxEvidenceExportToolbar
              source={evidenceSource}
              reviewEvents={reviewEvents}
              supplementalEvidence={supplementalEvidence}
            />
          }
        />
      )}
    </div>
  );
}

/** Sélecteur segmenté du périmètre, avec indicateur glissant. */
function ScopeTabs({
  scope,
  onChange,
}: {
  scope: TaxCockpitScope;
  onChange: (next: TaxCockpitScope) => void;
}) {
  const buttons = useRef(new Map<TaxCockpitScope, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const node = buttons.current.get(scope);
    if (node) setIndicator({ left: node.offsetLeft, width: node.offsetWidth });
  }, [scope]);

  return (
    <div
      role="group"
      aria-label="Filtrer le cockpit par impôt"
      style={{
        position: "relative",
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 2,
        borderRadius: 10,
        background: "rgba(255,255,255,.04)",
        padding: 3,
      }}
    >
      {indicator && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: indicator.left,
            width: indicator.width,
            borderRadius: 8,
            background: "rgba(255,255,255,.09)",
            transition: "left .25s ease, width .25s ease",
          }}
        />
      )}
      {(Object.keys(SCOPE_LABEL) as TaxCockpitScope[]).map((candidate) => {
        const pressed = candidate === scope;
        return (
          <button
            key={candidate}
            ref={(node) => {
              if (node) buttons.current.set(candidate, node);
              else buttons.current.delete(candidate);
            }}
            type="button"
            className="pbz-focusable"
            aria-pressed={pressed}
            onClick={() => onChange(candidate)}
            style={{
              position: "relative",
              border: 0,
              borderRadius: 8,
              padding: "9px 18px",
              cursor: "pointer",
              fontFamily: FAMILY.sans,
              fontSize: 13,
              fontWeight: pressed ? 600 : 500,
              // Repli sans mesure (rendu serveur) : le bouton actif porte son propre fond.
              background: pressed && !indicator ? "rgba(255,255,255,.09)" : "transparent",
              color: pressed ? T.text : T.muted,
              transition: "color .25s ease",
            }}
          >
            {SCOPE_LABEL[candidate]}
          </button>
        );
      })}
    </div>
  );
}

"use client";

/**
 * Orchestrateur client du cockpit fiscalité (TAX-08).
 *
 * Quatre niveaux : DÉCISION (capacité), CALCUL (4 visualisations principales
 * maximum), ANALYSE (matrices et tableaux), EXPLORATION (repliée par défaut).
 * Les datasets sont pré-construits côté serveur pour chaque périmètre : le
 * filtre « impôt » se contente de sélectionner un paquet — aucun calcul métier
 * ici. Filtres synchronisés à l'URL (`?impot=`, `?statut=`) sans rechargement.
 */

import { useCallback, useState } from "react";
import type { TaxCockpitDatasets, TaxCockpitScope } from "@/lib/tax/cockpit";
import { TAX_TYPE_LABEL } from "@/lib/tax/cockpit";
import { FONT, T, focusStyle } from "@/components/synthesis/tokens";
import { AccountingToTaxWaterfall } from "./AccountingToTaxWaterfall";
import { CorporateTaxReconciliation } from "./CorporateTaxReconciliation";
import { TaxCapabilityPanel } from "./TaxCapabilityPanel";
import { TaxControlCoverageBar } from "./TaxControlCoverageBar";
import { TaxFindingTable } from "./TaxFindingTable";
import { TaxMissingDataPanel } from "./TaxMissingDataPanel";
import { TaxRiskMatrix } from "./TaxRiskMatrix";
import { TaxSummaryHeader } from "./TaxSummaryHeader";
import { TaxChartCard } from "./TaxSourceFootnote";
import { VatReconciliationChart } from "./VatReconciliationChart";

const SCOPE_LABEL: Readonly<Record<TaxCockpitScope, string>> = {
  all: "Tous les impôts",
  corporate_income_tax: TAX_TYPE_LABEL.corporate_income_tax,
  vat: TAX_TYPE_LABEL.vat,
  cfe: TAX_TYPE_LABEL.cfe,
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

export function TaxCockpitWorkspace({
  bundles,
  initialScope,
  initialOutcome,
}: {
  bundles: Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>>;
  initialScope: TaxCockpitScope;
  initialOutcome: string;
}) {
  const [scope, setScope] = useState<TaxCockpitScope>(initialScope);
  const [outcome, setOutcome] = useState(initialOutcome);
  const datasets = bundles[scope];

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

  return (
    <div
      style={{
        padding: "24px clamp(12px, 2.5vw, 28px) 60px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        color: T.text,
      }}
    >
      <style>{focusStyle}</style>

      <TaxSummaryHeader summary={datasets.summary} />

      <div role="group" aria-label="Filtrer le cockpit par impôt" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(Object.keys(SCOPE_LABEL) as TaxCockpitScope[]).map((candidate) => {
          const pressed = candidate === scope;
          return (
            <button
              key={candidate}
              type="button"
              className="pbz-focusable"
              aria-pressed={pressed}
              onClick={() => changeScope(candidate)}
              style={{
                border: `1px solid ${pressed ? T.accent : T.border}`,
                borderRadius: 999,
                background: pressed ? "rgba(91,157,255,.14)" : "transparent",
                color: pressed ? T.text : T.muted,
                cursor: "pointer",
                fontSize: FONT.meta,
                padding: "4px 13px",
              }}
            >
              {SCOPE_LABEL[candidate]}
            </button>
          );
        })}
      </div>

      <section>
        <h2 id="tax-level-decision" style={levelHeadingStyle}>
          Capacité et décision
        </h2>
        <TaxCapabilityPanel dataset={datasets.capability} />
      </section>

      <section>
        <h2 id="tax-level-calcul" style={levelHeadingStyle}>
          Calcul
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 14,
          }}
        >
          <AccountingToTaxWaterfall dataset={datasets.waterfall} />
          <CorporateTaxReconciliation dataset={datasets.corporateReconciliation} />
          <VatReconciliationChart dataset={datasets.vatReconciliation} />
          <TaxControlCoverageBar dataset={datasets.coverage} />
        </div>
        <div style={{ marginTop: 14 }}>
          <TaxChartCard dataset={datasets.exposure} eyebrow="Calcul" tableOpen>
            <p style={{ margin: 0, fontSize: FONT.meta, color: T.muted }}>
              Grandeurs de revue — un écart n&apos;est ni un redressement ni une exposition
              certaine ; l&apos;analyse ligne à ligne fait foi (niveau Exploration).
            </p>
          </TaxChartCard>
        </div>
      </section>

      <section>
        <h2 id="tax-level-analyse" style={levelHeadingStyle}>
          Analyse
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 14,
          }}
        >
          <TaxRiskMatrix dataset={datasets.riskMatrix} />
          <TaxChartCard dataset={datasets.findingsByNature} eyebrow="Analyse" tableOpen>
            <p style={{ margin: 0, fontSize: FONT.meta, color: T.muted }}>
              Une sortie par contrôle exécuté, dans l&apos;ordre de présentation de la taxonomie.
            </p>
          </TaxChartCard>
          <TaxChartCard dataset={datasets.controlsByEvidence} eyebrow="Analyse" tableOpen>
            <p style={{ margin: 0, fontSize: FONT.meta, color: T.muted }}>
              Le niveau de preuve est le plus faible niveau nécessaire à la conclusion — jamais une
              moyenne.
            </p>
          </TaxChartCard>
          <TaxChartCard dataset={datasets.periods} eyebrow="Analyse" tableOpen>
            <p style={{ margin: 0, fontSize: FONT.meta, color: T.muted }}>
              Statut déclaratif au sens du dossier PROBANT, sans présumer des dépôts effectués.
            </p>
          </TaxChartCard>
        </div>
        <div style={{ marginTop: 14 }}>
          <TaxMissingDataPanel dataset={datasets.requiredDocuments} />
        </div>
      </section>

      <section>
        <h2 id="tax-level-exploration" style={levelHeadingStyle}>
          Exploration
        </h2>
        <details>
          <summary
            className="pbz-focusable"
            style={{
              cursor: "pointer",
              fontSize: FONT.table,
              color: T.muted,
              padding: "6px 2px",
              listStyle: "revert",
            }}
          >
            Toutes les lignes de réconciliation et tous les contrôles ({datasets.findings.rows.length})
          </summary>
          <div style={{ marginTop: 10 }}>
            <TaxFindingTable
              dataset={datasets.findings}
              outcomeFilter={outcome}
              onOutcomeFilterChange={changeOutcome}
            />
          </div>
        </details>
      </section>
    </div>
  );
}

const levelHeadingStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: FONT.meta,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".1em",
  color: T.muted,
};

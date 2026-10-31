"use client";

/**
 * Orchestrateur client du cockpit fiscalité — charte « instruments ».
 *
 * Barre de contexte (collante dès 760 px), trois actes (le verdict, le calcul, l'exposition), panneau de détail
 * et barre de décision collante en bas. Les datasets sont pré-construits côté serveur pour chaque périmètre ; ce
 * composant ne fait que choisir, afficher et synchroniser les filtres à l'URL (`?impot=`, `?statut=`) — aucun
 * calcul métier ici. La racine `data-ambiance` et les polices sont posées par la page (`InstrumentPage`).
 */

import { useCallback, useRef, useState } from "react";
import {
  buildReviewStepper,
  type TaxCockpitDatasets,
  type TaxCockpitScope,
  type TaxCockpitSource,
} from "@/lib/tax/cockpit";
import { TaxCalculation, type CalculationScope } from "./TaxCalculation";
import { TaxContextBar } from "./TaxContextBar";
import { TaxDecisionBar } from "./TaxDecisionBar";
import { TaxExposure } from "./TaxExposure";
import { TaxFindingDrawer } from "./TaxFindingDrawer";
import { TaxVerdict } from "./TaxVerdict";
import { useTaxReviewSession } from "./useTaxReviewSession";
import x from "./fiscalite.module.css";

function writeUrl(scope: CalculationScope | null, outcome: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (scope === null) url.searchParams.delete("impot");
  else url.searchParams.set("impot", scope);
  if (outcome === "tous") url.searchParams.delete("statut");
  else url.searchParams.set("statut", outcome);
  window.history.replaceState(null, "", url.toString());
}

export function TaxCockpitWorkspace({
  bundles,
  initialScope,
  initialOutcome,
  evidenceSource,
}: {
  bundles: Readonly<Record<TaxCockpitScope, TaxCockpitDatasets>>;
  initialScope: TaxCockpitScope;
  initialOutcome: string;
  evidenceSource?: TaxCockpitSource;
}) {
  const all = bundles.all;
  const [scope, setScope] = useState<CalculationScope>(
    initialScope === "all" ? "corporate_income_tax" : initialScope,
  );
  // L'URL ne porte `impot` que si l'utilisateur (ou le lien) a choisi un impôt.
  const [scopeChosen, setScopeChosen] = useState(initialScope !== "all");
  const [outcome, setOutcome] = useState(initialOutcome);
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const session = useTaxReviewSession(evidenceSource);
  const [findingId, setFindingId] = useState("");
  const [focusSignal, setFocusSignal] = useState(0);
  const selectedFindingId = findingId || session.findings[0]?.id || "";

  const changeScope = useCallback(
    (next: CalculationScope) => {
      setScope(next);
      setScopeChosen(true);
      writeUrl(next, outcome);
    },
    [outcome],
  );
  const changeOutcome = useCallback(
    (next: string) => {
      setOutcome(next);
      writeUrl(scopeChosen ? scope : null, next);
    },
    [scope, scopeChosen],
  );

  const openRow = useCallback((rowId: string, element: HTMLElement) => {
    opener.current = element;
    setDrawerRowId(rowId);
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawerRowId(null);
    const element = opener.current;
    opener.current = null;
    if (element?.isConnected) requestAnimationFrame(() => element.focus());
  }, []);

  const treatNextAction = useCallback(
    (controlIds: readonly string[]) => {
      const target = session.findings.find((finding) => controlIds.includes(finding.rule.id));
      if (target) setFindingId(target.id);
      setFocusSignal((signal) => signal + 1);
    },
    [session.findings],
  );

  const steps = buildReviewStepper(all, session.events.length);
  const drawerRow = drawerRowId ? all.findings.rows.find((row) => row.id === drawerRowId) : undefined;
  const drawerDetail = drawerRowId ? all.findings.details[drawerRowId] : undefined;

  return (
    <div className={x.workspace}>
      <TaxContextBar summary={all.summary} steps={steps} />

      <TaxVerdict datasets={all} onTreatNextAction={evidenceSource ? treatNextAction : undefined} />

      <TaxCalculation bundles={bundles} scope={scope} onScopeChange={changeScope} />

      <TaxExposure
        datasets={all}
        outcomeFilter={outcome}
        onOutcomeFilterChange={changeOutcome}
        activeRowId={drawerRowId}
        onOpenRow={openRow}
      />

      {drawerRow && drawerDetail && (
        <TaxFindingDrawer
          row={drawerRow}
          detail={drawerDetail}
          outcome={all.findings.outcomeByRowId[drawerRow.id]}
          session={evidenceSource ? session : undefined}
          onClose={closeDrawer}
        />
      )}

      {evidenceSource && (
        <TaxDecisionBar
          source={evidenceSource}
          session={session}
          findingId={selectedFindingId}
          onFindingChange={setFindingId}
          focusSignal={focusSignal}
        />
      )}
    </div>
  );
}

/**
 * Projection des snapshots fiscaux vers les datasets du cockpit (TAX-08).
 *
 * Règle identique à `lib/visualization/build-datasets.ts` : si un chiffre est
 * affiché sur /dashboard/fiscalite, il vient d'un dataset, et le dataset vient
 * d'un snapshot moteur. Les composants React n'effectuent AUCUN calcul métier.
 *
 * Prudences reprises des moteurs :
 * - une valeur absente reste `null` et s'affiche « non disponible », jamais 0 ;
 * - les étapes `proposed` du waterfall IS restent hors du cumul retenu ;
 * - une somme d'écarts est une grandeur de revue, pas un redressement ;
 * - aucun score fiscal global : seul `headlineStatus` (+ version de politique)
 *   est restitué.
 */
import type {
  EvidenceStrength,
  TaxControlOutcome,
  TaxRecommendation,
  TaxReconciliationLine,
  TaxSourceRef,
  TaxType,
} from "@/lib/canonical-model";
import { formatCents } from "@/lib/synthesis/money";
import type {
  VisualizationColumn,
  VisualizationDataset,
  VisualizationRow,
} from "@/lib/visualization/types";
import {
  AMOUNT_STATUS_LABEL,
  CONCLUSIVE_OUTCOMES,
  EVIDENCE_STRENGTH_LABEL,
  NON_CONCLUSIVE_OUTCOMES,
  TAX_OUTCOME_LABEL,
  TAX_OUTCOME_ORDER,
  TAX_OUTCOME_TONE,
  TAX_TYPE_LABEL,
  TAX_TYPE_SHORT_LABEL,
} from "./labels";
import type {
  TaxCapabilityItem,
  TaxCockpitDatasets,
  TaxCockpitScope,
  TaxCockpitSource,
  TaxCockpitSummary,
  TaxCockpitWaterfallStep,
  TaxComparisonBarRow,
  TaxCoverageSegment,
  TaxFindingRowDetail,
  TaxRiskMatrixCell,
} from "./types";

type Tone = "critical" | "warning" | "positive" | "neutral";

const NOT_AVAILABLE = "non disponible";

/** Libellés des types de documents attendus par le catalogue de contrôles. */
const DOCUMENT_TYPE_LABEL: Readonly<Record<string, string>> = {
  fec: "FEC",
  balance: "Balance générale",
  liasse_2050_2059: "Liasse fiscale 2050-2059 (dont 2058-A)",
  liasse_2033: "Liasse simplifiée 2033",
  declaration_2065: "Déclaration 2065",
  declaration_tva_ca3: "Déclaration de TVA CA3",
  declaration_tva_ca12: "Déclaration de TVA CA12",
  invoice: "Factures d'achat",
  tax_notice: "Avis de CFE",
};

/**
 * Rattachement déterministe contrôle → cycle de revue. Table statique assumée :
 * elle organise la lecture (matrice impôt × cycle), elle ne qualifie rien.
 */
const CONTROL_CYCLE_RULES: readonly (readonly [prefix: string, cycle: string])[] = [
  ["VAT.COLLECTED", "Clients & ventes"],
  ["VAT.BASE", "Clients & ventes"],
  ["VAT.THEORETICAL", "Clients & ventes"],
  ["VAT.RATE", "Clients & ventes"],
  ["VAT.DEDUCTIBLE", "Fournisseurs & achats"],
  ["VAT.REVERSE_CHARGE", "Fournisseurs & achats"],
  ["VAT.PIECE", "Fournisseurs & achats"],
  ["VAT.ACCOUNT", "Comptes de TVA"],
  ["VAT.ENTRY", "Comptes de TVA"],
  ["VAT.CREDIT", "Déclaratif TVA"],
  ["VAT.DECLARED", "Déclaratif TVA"],
  ["VAT.NET", "Déclaratif TVA"],
  ["VAT.FORM", "Déclaratif TVA"],
  ["VAT.PERIOD", "Déclaratif TVA"],
  ["IS.RATE", "Résultat fiscal & IS"],
  ["IS.", "Résultat fiscal & IS"],
  ["CFE.", "Impôts & taxes locaux"],
];

function cycleOfControl(controlId: string): string {
  const rule = CONTROL_CYCLE_RULES.find(([prefix]) => controlId.startsWith(prefix));
  return rule ? rule[1] : "Autres contrôles";
}

function formatSourceRef(ref: TaxSourceRef): string {
  return ref.locator ? `${ref.sourceVersionId} — ${ref.locator}` : ref.sourceVersionId;
}

function cents(amount: number | null): string {
  return amount === null ? NOT_AVAILABLE : formatCents(amount);
}

/** Ligne de rapprochement unifiée (IS + TVA + CFE) alimentant l'exploration. */
interface UnifiedReconciliationRow {
  readonly id: string;
  readonly taxType: TaxType;
  readonly engineLabel: string;
  readonly lineKey: string;
  readonly label: string;
  readonly leftCents: number | null;
  readonly rightCents: number | null;
  readonly differenceCents: number | null;
  readonly toleranceCents: number;
  readonly status: "matched" | "different" | "not_comparable" | "missing_operand";
  readonly normalizationNotes: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly traceStepIds: readonly string[];
  readonly leftRef: string;
  readonly rightRef: string;
}

/** Contrôle exécuté unifié (résultat de moteur, pas de planification). */
interface UnifiedControlRow {
  readonly id: string;
  readonly taxType: TaxType;
  readonly controlId: string;
  readonly title: string;
  readonly outcome: TaxControlOutcome;
  readonly evidenceStrength: EvidenceStrength;
  readonly detail: string;
  readonly differenceCents: number | null;
  readonly sourceRefs: readonly TaxSourceRef[];
}

const LINE_STATUS_OUTCOME: Readonly<
  Record<UnifiedReconciliationRow["status"], TaxControlOutcome>
> = {
  matched: "passed",
  different: "reconciliation_difference",
  missing_operand: "missing_information",
  not_comparable: "inconclusive",
};

function scopeIncludes(scope: TaxCockpitScope, taxType: TaxType): boolean {
  return scope === "all" || scope === taxType;
}

function collectReconciliationRows(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
): UnifiedReconciliationRow[] {
  const rows: UnifiedReconciliationRow[] = [];
  const operandRef = (
    operand: TaxReconciliationLine["leftOperand"],
  ): string =>
    operand === null
      ? "opérande absent du dossier"
      : operand.fieldCode
        ? `${operand.snapshotId} · case ${operand.fieldCode}`
        : operand.snapshotId;
  const push = (
    taxType: TaxType,
    engineLabel: string,
    lines: readonly TaxReconciliationLine[],
  ) => {
    if (!scopeIncludes(scope, taxType)) return;
    for (const line of lines) {
      rows.push({
        id: line.id,
        taxType,
        engineLabel,
        lineKey: line.lineKey,
        label: line.label,
        leftCents: line.leftOperand?.amountCents ?? null,
        rightCents: line.rightOperand?.amountCents ?? null,
        differenceCents: line.differenceAmountCents,
        toleranceCents: line.toleranceAmountCents,
        status: line.status,
        normalizationNotes: line.normalizationNotes,
        evidenceRefs: line.evidenceRefs,
        traceStepIds: line.traceStepIds,
        leftRef: operandRef(line.leftOperand),
        rightRef: operandRef(line.rightOperand),
      });
    }
  };

  if (source.corporateTax) {
    push("corporate_income_tax", "Moteur IS (TAX-05)", source.corporateTax.reconciliationLines);
  }
  if (source.vat) {
    push("vat", "Moteur TVA (TAX-06)", source.vat.reconciliationLines);
  }
  if (source.cfe) {
    push("cfe", "Moteur CFE (TAX-07)", source.cfe.reconciliationLines);
  }
  return rows;
}

function collectControlRows(source: TaxCockpitSource, scope: TaxCockpitScope): UnifiedControlRow[] {
  const rows: UnifiedControlRow[] = [];
  if (source.corporateTax && scopeIncludes(scope, "corporate_income_tax")) {
    const snapshot = source.corporateTax.snapshot;
    rows.push({
      id: `control:${snapshot.id}`,
      taxType: "corporate_income_tax",
      controlId: `IS.COMPUTATION.RESULT_AND_TAX.${snapshot.regime === "standard" ? "2058A" : "2033B"}`,
      title: "Calcul du résultat fiscal et de l'impôt sur les sociétés",
      outcome: snapshot.outcome,
      evidenceStrength: snapshot.evidenceStrength,
      detail: `Impôt brut ${AMOUNT_STATUS_LABEL.computed.toLowerCase()} : ${cents(snapshot.grossTaxCents)} (${snapshot.taxImpactStatus === "not_computed" ? "non calculé" : "statut " + snapshot.taxImpactStatus}).`,
      differenceCents: null,
      sourceRefs: snapshot.sourceRefs,
    });
  }
  if (source.vat && scopeIncludes(scope, "vat")) {
    for (const control of source.vat.snapshot.controls) {
      rows.push({
        id: `control:${control.resultHash}`,
        taxType: "vat",
        controlId: control.controlId,
        title: control.title,
        outcome: control.outcome,
        evidenceStrength: control.evidenceStrength,
        detail: control.detail,
        differenceCents: control.differenceCents,
        sourceRefs: control.sourceRefs,
      });
    }
  }
  if (source.cfe && scopeIncludes(scope, "cfe")) {
    for (const control of source.cfe.snapshot.controls) {
      rows.push({
        id: `control:${control.resultHash}`,
        taxType: "cfe",
        controlId: control.controlId,
        title: control.title,
        outcome: control.outcome,
        evidenceStrength: control.evidenceStrength,
        detail: control.detail,
        differenceCents: control.differenceCents,
        sourceRefs: control.sourceRefs,
      });
    }
  }
  return rows;
}

function countOutcomes(
  controls: readonly UnifiedControlRow[],
): Record<TaxControlOutcome, number> {
  const counts: Record<TaxControlOutcome, number> = {
    passed: 0,
    confirmed_non_compliance: 0,
    reconciliation_difference: 0,
    potential_tax_risk: 0,
    missing_information: 0,
    inconclusive: 0,
    review_recommendation: 0,
  };
  for (const control of controls) counts[control.outcome] += 1;
  return counts;
}

function worstOutcome(outcomes: readonly TaxControlOutcome[]): TaxControlOutcome | null {
  for (const candidate of TAX_OUTCOME_ORDER) {
    if (outcomes.includes(candidate)) return candidate;
  }
  return null;
}

function periodLabel(source: TaxCockpitSource): string {
  const accounting = source.periods.find((period) => period.taxType === "corporate_income_tax");
  const reference = accounting ?? source.periods[0];
  if (!reference) return `exercice ${source.fiscalYear}`;
  return `exercice ${source.fiscalYear} (${reference.startDate} → ${reference.endDate})`;
}

function mergedRecommendations(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
): TaxRecommendation[] {
  const seen = new Set<string>();
  const merged: TaxRecommendation[] = [];
  const prefix =
    scope === "corporate_income_tax" ? "IS." : scope === "vat" ? "VAT." : scope === "cfe" ? "CFE." : null;
  for (const matrix of source.capabilityMatrices) {
    for (const recommendation of matrix.recommendations) {
      const scoped =
        prefix === null ||
        recommendation.controlIds.some((controlId) => controlId.startsWith(prefix));
      if (!scoped || seen.has(recommendation.ruleId)) continue;
      seen.add(recommendation.ruleId);
      merged.push(recommendation);
    }
  }
  return merged.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority === "required" ? -1 : 1;
    return left.ruleId.localeCompare(right.ruleId);
  });
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

function buildSummary(source: TaxCockpitSource): TaxCockpitSummary {
  const headline = source.synthesis.headlineStatus;
  const engineVersions: string[] = [];
  if (source.corporateTax) engineVersions.push(source.corporateTax.snapshot.engineVersion);
  if (source.vat) engineVersions.push(source.vat.snapshot.engineVersion);
  if (source.cfe) engineVersions.push(source.cfe.snapshot.engineVersion);
  const label =
    headline === "no_conclusion" ? "Aucune conclusion" : TAX_OUTCOME_LABEL[headline];
  const tone: Tone = headline === "no_conclusion" ? "neutral" : TAX_OUTCOME_TONE[headline];
  return {
    entityName: source.entityName,
    dossierId: source.dossierId,
    fiscalYear: source.fiscalYear,
    periodLabel: periodLabel(source),
    currency: "EUR",
    generatedAt: source.synthesis.generatedAt,
    headlineLabel: label,
    headlineTone: tone,
    headlineDetail:
      headline === "no_conclusion"
        ? "Aucun contrôle fiscal n'a produit de résultat sur ce périmètre."
        : "Statut d'attention le plus prioritaire parmi les sorties de contrôles (ordre de présentation de la taxonomie, pas une note globale).",
    headlinePolicyVersion: source.synthesis.headlinePolicyVersion,
    snapshotHash: source.synthesis.snapshotHash,
    engineVersions,
  };
}

function buildCapability(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
  controls: readonly UnifiedControlRow[],
): TaxCockpitDatasets["capability"] {
  const counts = countOutcomes(controls);
  const concluded = CONCLUSIVE_OUTCOMES.reduce((total, outcome) => total + counts[outcome], 0);
  const notConcluded = NON_CONCLUSIVE_OUTCOMES.reduce(
    (total, outcome) => total + counts[outcome],
    0,
  );
  const applicableTaxes = source.periods
    .map((period) => period.taxType)
    .filter((taxType, index, list) => list.indexOf(taxType) === index)
    .filter((taxType) => scopeIncludes(scope, taxType));
  const documents = source.availableDocuments.filter((doc) => scopeIncludes(scope, doc.taxType));
  const recommendations = mergedRecommendations(source, scope);
  const nextAction = recommendations[0] ?? null;
  const coverage = source.synthesis.coverage;

  const items: TaxCapabilityItem[] = [
    {
      id: "applicable-taxes",
      label: "Impôts applicables",
      value: String(applicableTaxes.length),
      tone: "neutral",
      detail: applicableTaxes.map((taxType) => TAX_TYPE_LABEL[taxType]).join(" · ") || "aucun",
    },
    {
      id: "documents",
      label: "Documents disponibles",
      value:
        scope === "all"
          ? `${coverage.availableDocumentCount}/${coverage.requiredDocumentCount}`
          : String(documents.length),
      tone:
        scope === "all" && coverage.availableDocumentCount < coverage.requiredDocumentCount
          ? "warning"
          : "neutral",
      detail:
        documents
          .map((doc) => DOCUMENT_TYPE_LABEL[doc.documentType] ?? doc.documentType)
          .filter((label, index, list) => list.indexOf(label) === index)
          .join(" · ") || "aucun document fiscal",
    },
    {
      id: "controls-concluded",
      label: "Contrôles conclus",
      value: String(concluded),
      tone: "neutral",
      detail: "Sorties : Vérifié, Incohérence, Risque potentiel, Anomalie confirmée.",
    },
    {
      id: "controls-not-concluded",
      label: "Contrôles non conclus",
      value: String(notConcluded),
      tone: notConcluded > 0 ? "warning" : "positive",
      detail: "Sorties : Donnée manquante, Non concluant, Analyse recommandée.",
    },
    {
      id: "confirmed-anomalies",
      label: "Anomalies confirmées",
      value: String(counts.confirmed_non_compliance),
      tone: counts.confirmed_non_compliance > 0 ? "critical" : "positive",
      detail:
        counts.confirmed_non_compliance === 0
          ? "Aucune non-conformité confirmée par une revue humaine."
          : "Non-conformités confirmées après revue humaine.",
    },
    {
      id: "potential-risks",
      label: "Risques potentiels",
      value: String(counts.potential_tax_risk + counts.reconciliation_difference),
      tone:
        counts.potential_tax_risk + counts.reconciliation_difference > 0 ? "warning" : "positive",
      detail: `${counts.reconciliation_difference} incohérence(s) de rapprochement · ${counts.potential_tax_risk} risque(s) potentiel(s) à qualifier.`,
    },
    {
      id: "missing-data",
      label: "Données manquantes",
      value: String(counts.missing_information),
      tone: counts.missing_information > 0 ? "warning" : "positive",
      detail: `${source.synthesis.limitations.length} limitation(s) documentée(s) par les moteurs.`,
    },
    {
      id: "next-action",
      label: "Prochaine action",
      value: nextAction ? nextAction.title : "Aucune action proposée",
      tone: nextAction?.priority === "required" ? "warning" : "neutral",
      detail: nextAction?.action,
    },
  ];

  const columns: VisualizationColumn[] = [
    { key: "label", label: "Indicateur" },
    { key: "value", label: "Valeur", align: "right" },
    { key: "detail", label: "Détail" },
  ];
  return {
    id: `tax-capability-${scope}`,
    title: "Capacité et décision",
    summary: `Périmètre ${scope === "all" ? "tous impôts" : TAX_TYPE_LABEL[scope]} : ${applicableTaxes.length} impôt(s) applicable(s), ${concluded} contrôle(s) conclu(s), ${notConcluded} non conclu(s), ${counts.missing_information} donnée(s) manquante(s).`,
    columns,
    rows: items.map((item) => ({
      id: item.id,
      cells: { label: item.label, value: item.value, detail: item.detail ?? "—" },
      emphasis: item.tone === "critical" ? "critical" : item.tone === "warning" ? "warning" : undefined,
    })),
    sourceMetricIds: [source.synthesis.id],
    methodology:
      "Compteurs issus des sorties de contrôles des moteurs IS, TVA et CFE, agrégés dans le snapshot de synthèse fiscale. Aucune pondération, aucun score : chaque compteur est un dénombrement.",
    sourceRefs: [`Synthèse fiscale ${source.synthesis.snapshotHash.slice(0, 12)}`],
    items,
    nextAction,
  };
}

function buildWaterfall(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
): TaxCockpitDatasets["waterfall"] {
  const included = scopeIncludes(scope, "corporate_income_tax") && source.corporateTax;
  const snapshot = included ? source.corporateTax!.snapshot : null;
  const steps: TaxCockpitWaterfallStep[] = snapshot
    ? snapshot.waterfall.steps.map((step) => ({
        id: step.code,
        label: step.label,
        kind: step.kind,
        deltaCents: step.deltaCents,
        runningTotalCents: step.runningTotalCents,
        status: step.status,
        note:
          step.status === "proposed"
            ? "Candidat de revue — hors cumul retenu"
            : step.status === "unavailable"
              ? NOT_AVAILABLE
              : undefined,
      }))
    : [];
  const columns: VisualizationColumn[] = [
    { key: "label", label: "Étape" },
    { key: "delta", label: "Variation", unit: "€", align: "right" },
    { key: "running", label: "Cumul retenu", unit: "€", align: "right" },
    { key: "status", label: "Statut" },
  ];
  return {
    id: `tax-waterfall-${scope}`,
    title: "Du résultat comptable au résultat fiscal et à l'IS",
    summary: snapshot
      ? snapshot.status === "computed"
        ? `Résultat comptable ${cents(snapshot.accountingResultCents)}, résultat fiscal retenu ${cents(snapshot.waterfall.confirmedTaxResultCents)}, borne proposée ${cents(snapshot.waterfall.proposedTaxResultCents)}, impôt brut ${cents(snapshot.grossTaxCents)}. Montants en euros, ${periodLabel(source)}.`
        : "Le calcul d'impôt sur les sociétés est bloqué : les données nécessaires sont absentes du dossier. Chaque étape reste « non disponible » — aucun montant n'est inventé."
      : "Aucun calcul d'impôt sur les sociétés disponible sur ce périmètre : le passage résultat comptable → résultat fiscal ne peut pas être affiché.",
    columns,
    rows: steps.map((step) => ({
      id: step.id,
      cells: {
        label: step.label,
        delta:
          step.status === "unavailable"
            ? NOT_AVAILABLE
            : step.kind === "subtotal" || step.kind === "total"
              ? "—"
              : formatCents(step.deltaCents),
        running: step.status === "unavailable" ? NOT_AVAILABLE : formatCents(step.runningTotalCents),
        status:
          step.status === "proposed"
            ? "Candidat (hors cumul)"
            : step.status === "unavailable"
              ? NOT_AVAILABLE
              : AMOUNT_STATUS_LABEL.computed,
      },
      emphasis: step.status === "proposed" ? "warning" : undefined,
    })),
    sourceMetricIds: snapshot ? snapshot.trace.map((step) => step.id) : [],
    methodology:
      "Chaînage produit par le moteur IS (TAX-05) : résultat comptable, retraitements confirmés puis candidats, imputation des déficits plafonnée, base imposable et impôt brut. Les étapes « candidat » portent leur montant mais ne modifient jamais le cumul retenu.",
    sourceRefs: snapshot ? snapshot.sourceRefs.map(formatSourceRef) : [],
    steps,
    // Un calcul bloqué ne publie pas de résultat : « non disponible », jamais 0.
    confirmedTaxResultCents:
      snapshot && snapshot.status === "computed"
        ? snapshot.waterfall.confirmedTaxResultCents
        : null,
    proposedTaxResultCents:
      snapshot && snapshot.status === "computed"
        ? snapshot.waterfall.proposedTaxResultCents
        : null,
  };
}

const CORPORATE_COMPARISON_OPERANDS: Readonly<Record<string, readonly [string, string]>> = {
  declared_tax_result_before_deficits: ["Recalculé", "Déclaré"],
  declared_deficit_offset: ["Recalculé", "Déclaré"],
  declared_final_tax_result: ["Recalculé", "Déclaré"],
  declared_normal_rate_base: ["Recalculé", "Déclaré (2065)"],
  declared_reduced_rate_base: ["Recalculé", "Déclaré (2065)"],
  accounted_tax_charge: ["Calculé", "Comptabilisé"],
  accounted_tax_liability: ["Calculé", "Comptabilisé"],
};

function reconciliationBars(rows: readonly UnifiedReconciliationRow[]): TaxComparisonBarRow[] {
  return rows.map((row) => {
    const outcome = LINE_STATUS_OUTCOME[row.status];
    const [leftLabel, rightLabel] = CORPORATE_COMPARISON_OPERANDS[row.lineKey] ?? [
      "Valeur A",
      "Valeur B",
    ];
    return {
      id: row.id,
      label: row.label,
      values: [
        { key: "left", label: leftLabel, amountCents: row.leftCents },
        { key: "right", label: rightLabel, amountCents: row.rightCents },
      ],
      differenceCents: row.differenceCents,
      statusLabel: TAX_OUTCOME_LABEL[outcome],
      tone: TAX_OUTCOME_TONE[outcome],
    };
  });
}

function reconciliationDatasetRows(rows: readonly UnifiedReconciliationRow[]): VisualizationRow[] {
  return rows.map((row) => {
    const outcome = LINE_STATUS_OUTCOME[row.status];
    const tone = TAX_OUTCOME_TONE[outcome];
    return {
      id: row.id,
      cells: {
        label: row.label,
        left: cents(row.leftCents),
        right: cents(row.rightCents),
        difference: cents(row.differenceCents),
        tolerance: formatCents(row.toleranceCents),
        status: TAX_OUTCOME_LABEL[outcome],
      },
      emphasis: tone === "critical" ? "critical" : tone === "warning" ? "warning" : undefined,
    };
  });
}

const RECONCILIATION_COLUMNS: VisualizationColumn[] = [
  { key: "label", label: "Rapprochement" },
  { key: "left", label: "Valeur calculée", unit: "€", align: "right" },
  { key: "right", label: "Valeur comparée", unit: "€", align: "right" },
  { key: "difference", label: "Écart", unit: "€", align: "right" },
  { key: "tolerance", label: "Tolérance", unit: "€", align: "right" },
  { key: "status", label: "Statut" },
];

function buildCorporateReconciliation(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
  reconciliationRows: readonly UnifiedReconciliationRow[],
): TaxCockpitDatasets["corporateReconciliation"] {
  const rows = reconciliationRows.filter((row) => row.taxType === "corporate_income_tax");
  const differences = rows.filter((row) => row.status === "different").length;
  return {
    id: `tax-is-reconciliation-${scope}`,
    title: "IS : calculé, déclaré, comptabilisé",
    summary:
      rows.length === 0
        ? "Aucune ligne de rapprochement IS disponible sur ce périmètre."
        : `${rows.length} rapprochement(s) IS entre valeurs recalculées, déclarées et comptabilisées ; ${differences} écart(s) hors tolérance. Montants en euros, ${periodLabel(source)}.`,
    columns: RECONCILIATION_COLUMNS,
    rows: reconciliationDatasetRows(rows),
    sourceMetricIds: rows.map((row) => row.id),
    methodology:
      "Lignes de rapprochement produites par le moteur IS (TAX-05). Tolérance nulle : une identité arithmétique ne supporte aucune tolérance. Un écart désigne une différence à analyser, jamais la valeur correcte.",
    sourceRefs: source.corporateTax
      ? source.corporateTax.snapshot.sourceRefs.map(formatSourceRef)
      : [],
    bars: reconciliationBars(rows),
  };
}

function buildVatReconciliation(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
): TaxCockpitDatasets["vatReconciliation"] {
  const included = scopeIncludes(scope, "vat") && source.vat;
  const comparison = included ? source.vat!.snapshot.datasets.comparison : null;
  const bars: TaxComparisonBarRow[] = comparison
    ? comparison.rows.map((row) => {
        const missing =
          row.theoreticalCents === null || row.accountedCents === null || row.declaredCents === null;
        return {
          id: row.key,
          label: row.label,
          values: [
            { key: "theoretical", label: "Théorique", amountCents: row.theoreticalCents },
            { key: "accounted", label: "Comptabilisé", amountCents: row.accountedCents },
            { key: "declared", label: "Déclaré", amountCents: row.declaredCents },
          ],
          differenceCents:
            row.accountedCents !== null && row.declaredCents !== null
              ? row.accountedCents - row.declaredCents
              : null,
          statusLabel: missing ? TAX_OUTCOME_LABEL.missing_information : "Comparé",
          tone: missing ? "warning" : "neutral",
        };
      })
    : [];
  return {
    id: `tax-vat-reconciliation-${scope}`,
    title: "TVA : théorique, comptabilisée, déclarée",
    summary: comparison
      ? `Réconciliation TVA ${source.vat!.snapshot.period.startDate} → ${source.vat!.snapshot.period.endDate} : ${comparison.rows.length} agrégat(s) comparé(s) entre TVA théorique, comptabilisée et déclarée. Montants en euros. Une valeur absente reste « non disponible », jamais zéro.`
      : "Aucune réconciliation de TVA disponible sur ce périmètre.",
    columns: [
      { key: "label", label: "Agrégat" },
      { key: "theoretical", label: "Théorique", unit: "€", align: "right" },
      { key: "accounted", label: "Comptabilisé", unit: "€", align: "right" },
      { key: "declared", label: "Déclaré", unit: "€", align: "right" },
    ],
    rows: comparison
      ? comparison.rows.map((row) => ({
          id: row.key,
          cells: {
            label: row.label,
            theoretical: cents(row.theoreticalCents),
            accounted: cents(row.accountedCents),
            declared: cents(row.declaredCents),
          },
        }))
      : [],
    sourceMetricIds: source.vat ? [source.vat.snapshot.id] : [],
    methodology:
      "Jeu de données `comparison` du moteur TVA (TAX-06) : TVA théorique (base × taux constaté), TVA comptabilisée (comptes 4457/4456) et TVA déclarée (CA3/CA12). Le moteur n'affirme jamais qu'un taux est légalement correct : il constate des écarts.",
    sourceRefs: source.vat ? source.vat.snapshot.sourceRefs.map(formatSourceRef) : [],
    bars,
  };
}

function buildExposure(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
  reconciliationRows: readonly UnifiedReconciliationRow[],
): VisualizationDataset {
  const rows: VisualizationRow[] = [];
  const accepted = source.synthesis.reviewSummary.accepted;
  rows.push({
    id: "confirmed-exposure",
    cells: {
      label: "Exposition confirmée (ajustements acceptés en revue)",
      amount: accepted === 0 ? "aucun ajustement accepté" : String(accepted),
      note: `${source.synthesis.reviewSummary.pending} proposition(s) en attente de revue.`,
    },
  });
  for (const taxType of ["corporate_income_tax", "vat", "cfe"] as const) {
    if (!scopeIncludes(scope, taxType)) continue;
    const lines = reconciliationRows.filter(
      (row) => row.taxType === taxType && row.status === "different",
    );
    const totalCents = lines.reduce(
      (total, row) => total + Math.abs(row.differenceCents ?? 0),
      0,
    );
    rows.push({
      id: `differences-${taxType}`,
      cells: {
        label: `Écarts de rapprochement relevés — ${TAX_TYPE_LABEL[taxType]}`,
        amount: lines.length === 0 ? "aucun écart" : formatCents(totalCents),
        note: `${lines.length} ligne(s) hors tolérance.`,
      },
      emphasis: lines.length > 0 ? "warning" : undefined,
    });
  }
  if (scopeIncludes(scope, "corporate_income_tax") && source.corporateTax) {
    const snapshot = source.corporateTax.snapshot;
    rows.push({
      id: "proposed-reintegrations",
      cells: {
        label: "Réintégrations IS candidates (proposées, non confirmées)",
        amount: formatCents(snapshot.reintegrationsProposedCents),
        note: "Effet potentiel sur le résultat fiscal, soumis à revue humaine.",
      },
    });
    rows.push({
      id: "proposed-deductions",
      cells: {
        label: "Déductions IS candidates (proposées, non confirmées)",
        amount: formatCents(snapshot.deductionsProposedCents),
        note: "Effet potentiel sur le résultat fiscal, soumis à revue humaine.",
      },
    });
  }
  return {
    id: `tax-exposure-${scope}`,
    title: "Exposition fiscale : confirmée et proposée",
    summary: `Sommes de revue en euros, ${periodLabel(source)} : ajustements confirmés par revue, écarts de rapprochement relevés par impôt et retraitements candidats proposés par le moteur IS.`,
    columns: [
      { key: "label", label: "Nature" },
      { key: "amount", label: "Montant", unit: "€", align: "right" },
      { key: "note", label: "Lecture" },
    ],
    rows,
    sourceMetricIds: reconciliationRows
      .filter((row) => row.status === "different")
      .map((row) => row.id),
    methodology:
      "La somme des valeurs absolues des écarts hors tolérance est une grandeur de revue : elle ne constitue ni un redressement, ni une exposition certaine. Chaque écart peut refléter un décalage de période, un périmètre différent ou une erreur — l'analyse ligne à ligne fait foi (niveau Exploration).",
  };
}

function buildCoverage(
  scope: TaxCockpitScope,
  controls: readonly UnifiedControlRow[],
): TaxCockpitDatasets["coverage"] {
  const counts = countOutcomes(controls);
  const segments: TaxCoverageSegment[] = [
    { key: "passed", label: TAX_OUTCOME_LABEL.passed, count: counts.passed, tone: "positive" },
    {
      key: "difference",
      label: TAX_OUTCOME_LABEL.reconciliation_difference,
      count: counts.reconciliation_difference + counts.confirmed_non_compliance,
      tone: "critical",
    },
    {
      key: "risk",
      label: TAX_OUTCOME_LABEL.potential_tax_risk,
      count: counts.potential_tax_risk,
      tone: "warning",
    },
    {
      key: "missing",
      label: TAX_OUTCOME_LABEL.missing_information,
      count: counts.missing_information,
      tone: "warning",
    },
    {
      key: "inconclusive",
      label: `${TAX_OUTCOME_LABEL.inconclusive} / ${TAX_OUTCOME_LABEL.review_recommendation}`,
      count: counts.inconclusive + counts.review_recommendation,
      tone: "neutral",
    },
  ];
  const total = controls.length;
  return {
    id: `tax-coverage-${scope}`,
    title: "Contrôles exécutés par sortie",
    summary: `${total} contrôle(s) exécuté(s) sur ce périmètre : ${segments
      .map((segment) => `${segment.count} ${segment.label}`)
      .join(", ")}.`,
    columns: [
      { key: "label", label: "Sortie" },
      { key: "count", label: "Contrôles", unit: "nb", align: "right" },
    ],
    rows: segments.map((segment) => ({
      id: segment.key,
      cells: { label: segment.label, count: segment.count },
      emphasis:
        segment.tone === "critical" && segment.count > 0
          ? "critical"
          : segment.tone === "warning" && segment.count > 0
            ? "warning"
            : undefined,
    })),
    sourceMetricIds: controls.map((control) => control.id),
    methodology:
      "Dénombrement des sorties de contrôles réellement exécutés par les moteurs. Un contrôle non exécutable n'apparaît pas ici : il est porté par le panneau « données manquantes » et la matrice de capacité.",
    segments,
    totalControls: total,
  };
}

function buildRiskMatrix(
  scope: TaxCockpitScope,
  controls: readonly UnifiedControlRow[],
): TaxCockpitDatasets["riskMatrix"] {
  const taxes = controls
    .map((control) => control.taxType)
    .filter((taxType, index, list) => list.indexOf(taxType) === index);
  const cycles = controls
    .map((control) => cycleOfControl(control.controlId))
    .filter((cycle, index, list) => list.indexOf(cycle) === index)
    .sort((left, right) => left.localeCompare(right, "fr"));
  const cells: TaxRiskMatrixCell[] = [];
  for (const taxType of taxes) {
    for (const cycle of cycles) {
      const cellControls = controls.filter(
        (control) => control.taxType === taxType && cycleOfControl(control.controlId) === cycle,
      );
      if (cellControls.length === 0) continue;
      const worst = worstOutcome(cellControls.map((control) => control.outcome));
      cells.push({
        taxType,
        cycle,
        controlCount: cellControls.length,
        worstOutcomeLabel: worst ? TAX_OUTCOME_LABEL[worst] : null,
        tone: worst ? TAX_OUTCOME_TONE[worst] : "neutral",
        controlTitles: cellControls.map((control) => control.title),
      });
    }
  }
  return {
    id: `tax-risk-matrix-${scope}`,
    title: "Matrice impôt × cycle",
    summary: `${cells.length} croisement(s) impôt × cycle couverts par des contrôles exécutés ; chaque cellule porte le nombre de contrôles et le statut le plus prioritaire (ordre de présentation de la taxonomie).`,
    columns: [
      { key: "tax", label: "Impôt" },
      { key: "cycle", label: "Cycle" },
      { key: "count", label: "Contrôles", unit: "nb", align: "right" },
      { key: "worst", label: "Statut le plus prioritaire" },
    ],
    rows: cells.map((cell) => ({
      id: `${cell.taxType}:${cell.cycle}`,
      cells: {
        tax: TAX_TYPE_LABEL[cell.taxType],
        cycle: cell.cycle,
        count: cell.controlCount,
        worst: cell.worstOutcomeLabel ?? "—",
      },
      emphasis:
        cell.tone === "critical" ? "critical" : cell.tone === "warning" ? "warning" : undefined,
    })),
    sourceMetricIds: controls.map((control) => control.id),
    methodology:
      "Rattachement statique et documenté de chaque contrôle à un cycle de revue (table `CONTROL_CYCLE_RULES`). La cellule affiche le statut le plus prioritaire de l'ordre de présentation — un ordre d'attention, pas une gravité calculée.",
    taxes,
    cycles,
    cells,
  };
}

function buildFindingsByNature(
  scope: TaxCockpitScope,
  controls: readonly UnifiedControlRow[],
): VisualizationDataset {
  const counts = countOutcomes(controls);
  return {
    id: `tax-findings-by-nature-${scope}`,
    title: "Sorties de contrôles par nature",
    summary: `Répartition des ${controls.length} sortie(s) de contrôles entre les sept statuts du langage fiscal.`,
    columns: [
      { key: "label", label: "Statut" },
      { key: "count", label: "Contrôles", unit: "nb", align: "right" },
    ],
    rows: TAX_OUTCOME_ORDER.map((outcome) => ({
      id: outcome,
      cells: { label: TAX_OUTCOME_LABEL[outcome], count: counts[outcome] },
      emphasis:
        counts[outcome] > 0 && TAX_OUTCOME_TONE[outcome] === "critical"
          ? "critical"
          : counts[outcome] > 0 && TAX_OUTCOME_TONE[outcome] === "warning"
            ? "warning"
            : undefined,
    })),
    sourceMetricIds: controls.map((control) => control.id),
    methodology:
      "Un contrôle produit exactement une sortie parmi les sept statuts de la taxonomie fiscale. L'ordre des lignes suit l'ordre de présentation déterministe de la taxonomie.",
  };
}

function buildControlsByEvidence(
  scope: TaxCockpitScope,
  controls: readonly UnifiedControlRow[],
): VisualizationDataset {
  const strengths: readonly EvidenceStrength[] = [
    "direct",
    "corroborated",
    "derived",
    "insufficient",
  ];
  return {
    id: `tax-controls-by-evidence-${scope}`,
    title: "Contrôles par niveau de preuve",
    summary: `Niveau de preuve atteint par les ${controls.length} contrôle(s) exécuté(s) : le niveau est le plus faible niveau nécessaire à la conclusion, jamais une moyenne.`,
    columns: [
      { key: "label", label: "Niveau de preuve" },
      { key: "concluded", label: "Conclus", unit: "nb", align: "right" },
      { key: "notConcluded", label: "Non conclus", unit: "nb", align: "right" },
    ],
    rows: strengths.map((strength) => {
      const matching = controls.filter((control) => control.evidenceStrength === strength);
      const concluded = matching.filter((control) =>
        CONCLUSIVE_OUTCOMES.includes(control.outcome),
      ).length;
      return {
        id: strength,
        cells: {
          label: EVIDENCE_STRENGTH_LABEL[strength],
          concluded,
          notConcluded: matching.length - concluded,
        },
      };
    }),
    sourceMetricIds: controls.map((control) => control.id),
    methodology:
      "Niveaux de preuve de la taxonomie fiscale : direct, corroboré, dérivé, insuffisant. Un niveau insuffisant interdit les sorties « Vérifié » et « Anomalie confirmée ».",
  };
}

function buildPeriods(source: TaxCockpitSource, scope: TaxCockpitScope): VisualizationDataset {
  const periods = source.periods.filter((period) => scopeIncludes(scope, period.taxType));
  return {
    id: `tax-periods-${scope}`,
    title: "Périodes concernées",
    summary: `${periods.length} période(s) fiscale(s) dans le dossier pour ce périmètre.`,
    columns: [
      { key: "tax", label: "Impôt" },
      { key: "start", label: "Début" },
      { key: "end", label: "Fin" },
      { key: "frequency", label: "Fréquence" },
      { key: "status", label: "Statut déclaratif" },
    ],
    rows: periods.map((period) => ({
      id: period.id,
      cells: {
        tax: TAX_TYPE_LABEL[period.taxType],
        start: period.startDate,
        end: period.endDate,
        frequency:
          period.frequency === "annual"
            ? "annuelle"
            : period.frequency === "quarterly"
              ? "trimestrielle"
              : period.frequency === "monthly"
                ? "mensuelle"
                : period.frequency,
        status:
          period.status === "filed"
            ? "déposée"
            : period.status === "open"
              ? "ouverte"
              : period.status === "amended"
                ? "rectifiée"
                : period.status === "closed"
                  ? "close"
                  : "inconnue",
      },
    })),
    sourceMetricIds: periods.map((period) => period.id),
    methodology:
      "Périodes canoniques (TAX-02) du dossier. Le statut déclaratif décrit la période dans PROBANT ; il ne présume pas des dépôts effectués auprès de l'administration.",
  };
}

function buildRequiredDocuments(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
): VisualizationDataset {
  interface MissingEntry {
    readonly code: string;
    readonly controlIds: string[];
  }
  const missingByCode = new Map<string, MissingEntry>();
  for (const matrix of source.capabilityMatrices) {
    for (const control of matrix.controls) {
      if (!scopeIncludes(scope, control.taxType)) continue;
      for (const missing of control.missingData) {
        const entry = missingByCode.get(missing) ?? { code: missing, controlIds: [] };
        if (!entry.controlIds.includes(control.controlId)) entry.controlIds.push(control.controlId);
        missingByCode.set(missing, entry);
      }
    }
  }
  const entries = [...missingByCode.values()].sort((left, right) =>
    left.code.localeCompare(right.code),
  );
  const limitations = source.synthesis.limitations;
  const rows: VisualizationRow[] = entries.map((entry) => {
    const [kind, rawCode] = entry.code.includes(":")
      ? (entry.code.split(":", 2) as [string, string])
      : ["donnée", entry.code];
    const label =
      kind === "document"
        ? DOCUMENT_TYPE_LABEL[rawCode] ?? rawCode
        : `${rawCode} (${kind})`;
    return {
      id: entry.code,
      cells: {
        piece: label,
        kind:
          kind === "document"
            ? "Pièce à fournir"
            : kind === "parameter" || kind === "profile"
              ? "Fait à confirmer"
              : "Donnée attendue",
        controls: entry.controlIds.join(" · "),
      },
      emphasis: "warning",
    };
  });
  for (const limitation of limitations) {
    rows.push({
      id: limitation.id,
      cells: {
        piece: limitation.message,
        kind:
          limitation.resolvability === "user_can_supply"
            ? "Pièce à fournir"
            : limitation.resolvability === "human_review"
              ? "Revue humaine requise"
              : limitation.resolvability === "future_engine"
                ? "Capacité future du moteur"
                : "Non résoluble",
        controls: limitation.relatedIds.join(" · ") || "—",
      },
    });
  }
  return {
    id: `tax-required-documents-${scope}`,
    title: "Données manquantes et pièces requises",
    summary: `${entries.length} donnée(s) attendue(s) par le planificateur de contrôles et ${limitations.length} limitation(s) documentée(s). Une pièce absente de PROBANT ne signifie pas qu'elle n'a pas été produite à l'administration.`,
    columns: [
      { key: "piece", label: "Pièce ou donnée" },
      { key: "kind", label: "Nature" },
      { key: "controls", label: "Contrôles concernés" },
    ],
    rows,
    sourceMetricIds: source.capabilityMatrices.map((matrix) => matrix.matrixHash),
    methodology:
      "Codes `missingData` de la matrice de capacité (TAX-04) et limitations des moteurs. Chaque ligne indique les contrôles bloqués ou dégradés par l'absence.",
  };
}

function buildFindings(
  source: TaxCockpitSource,
  scope: TaxCockpitScope,
  reconciliationRows: readonly UnifiedReconciliationRow[],
  controls: readonly UnifiedControlRow[],
): TaxCockpitDatasets["findings"] {
  const details: Record<string, TaxFindingRowDetail> = {};
  const outcomeByRowId: Record<string, string> = {};
  const rows: VisualizationRow[] = [];

  for (const line of reconciliationRows) {
    const outcome = LINE_STATUS_OUTCOME[line.status];
    outcomeByRowId[line.id] = outcome;
    details[line.id] = {
      formula:
        line.normalizationNotes.length > 0
          ? line.normalizationNotes.join(" ")
          : "Différence = valeur calculée − valeur comparée, après normalisations tracées.",
      usedData: [line.leftRef, line.rightRef],
      limits:
        line.status === "missing_operand"
          ? ["Un opérande est absent du dossier : la ligne ne peut pas conclure."]
          : line.status === "not_comparable"
            ? ["Les périmètres des deux opérandes ne sont pas comparables."]
            : [],
      evidence: line.evidenceRefs.join(" · ") || "—",
      sources: [line.engineLabel],
      review: "Aucune décision de revue enregistrée sur cette ligne.",
    };
    rows.push({
      id: line.id,
      cells: {
        tax: TAX_TYPE_SHORT_LABEL[line.taxType],
        label: line.label,
        left: cents(line.leftCents),
        right: cents(line.rightCents),
        difference: cents(line.differenceCents),
        status: TAX_OUTCOME_LABEL[outcome],
        evidence: "—",
        source: line.engineLabel,
      },
      emphasis:
        TAX_OUTCOME_TONE[outcome] === "critical"
          ? "critical"
          : TAX_OUTCOME_TONE[outcome] === "warning"
            ? "warning"
            : undefined,
    });
  }

  for (const control of controls) {
    outcomeByRowId[control.id] = control.outcome;
    details[control.id] = {
      formula: control.detail,
      usedData: [],
      limits: [],
      evidence: EVIDENCE_STRENGTH_LABEL[control.evidenceStrength],
      sources: control.sourceRefs.map(formatSourceRef),
      review: "Aucune décision de revue enregistrée sur ce contrôle.",
    };
    rows.push({
      id: control.id,
      cells: {
        tax: TAX_TYPE_SHORT_LABEL[control.taxType],
        label: `${control.controlId} — ${control.title}`,
        left: "—",
        right: "—",
        difference: control.differenceCents === null ? "—" : formatCents(control.differenceCents),
        status: TAX_OUTCOME_LABEL[control.outcome],
        evidence: EVIDENCE_STRENGTH_LABEL[control.evidenceStrength],
        source: control.sourceRefs.map((ref) => ref.sourceId).join(" · ") || "—",
      },
      emphasis:
        TAX_OUTCOME_TONE[control.outcome] === "critical"
          ? "critical"
          : TAX_OUTCOME_TONE[control.outcome] === "warning"
            ? "warning"
            : undefined,
    });
  }

  return {
    id: `tax-findings-${scope}`,
    title: "Exploration : lignes de réconciliation et contrôles",
    summary: `${reconciliationRows.length} ligne(s) de réconciliation et ${controls.length} contrôle(s) exécuté(s) sur ce périmètre, avec source, formule, données utilisées, limites et preuve.`,
    columns: [
      { key: "tax", label: "Impôt" },
      { key: "label", label: "Ligne ou contrôle" },
      { key: "left", label: "Valeur A", unit: "€", align: "right" },
      { key: "right", label: "Valeur B", unit: "€", align: "right" },
      { key: "difference", label: "Écart", unit: "€", align: "right" },
      { key: "status", label: "Statut" },
      { key: "evidence", label: "Preuve" },
      { key: "source", label: "Source" },
    ],
    rows,
    sourceMetricIds: rows.map((row) => row.id),
    methodology:
      "Restitution ligne à ligne des sorties des moteurs, sans agrégation. Le détail de chaque ligne expose la formule ou les normalisations, les données utilisées, les limites et l'historique de revue.",
    details,
    outcomeByRowId,
  };
}

export function buildTaxCockpitDatasets(
  source: TaxCockpitSource,
  scope: TaxCockpitScope = "all",
): TaxCockpitDatasets {
  const reconciliationRows = collectReconciliationRows(source, scope);
  const controls = collectControlRows(source, scope);
  return {
    scope,
    summary: buildSummary(source),
    capability: buildCapability(source, scope, controls),
    waterfall: buildWaterfall(source, scope),
    corporateReconciliation: buildCorporateReconciliation(source, scope, reconciliationRows),
    vatReconciliation: buildVatReconciliation(source, scope),
    exposure: buildExposure(source, scope, reconciliationRows),
    coverage: buildCoverage(scope, controls),
    riskMatrix: buildRiskMatrix(scope, controls),
    findingsByNature: buildFindingsByNature(scope, controls),
    controlsByEvidence: buildControlsByEvidence(scope, controls),
    periods: buildPeriods(source, scope),
    requiredDocuments: buildRequiredDocuments(source, scope),
    findings: buildFindings(source, scope, reconciliationRows, controls),
  };
}

/**
 * Contrats du cockpit fiscalité (TAX-08).
 *
 * `TaxCockpitSource` regroupe les snapshots produits par les moteurs fiscaux
 * (TAX-05 IS, TAX-06 TVA, TAX-07 CFE, planner TAX-04) et la synthèse fiscale.
 * `TaxCockpitDatasets` est la projection de ces snapshots vers le contrat
 * `VisualizationDataset` de la Synthèse : les composants React rendent ces
 * datasets et ne recalculent rien — même règle que `lib/visualization`.
 */
import type {
  FiscalSynthesisSnapshot,
  TaxCapabilityMatrix,
  TaxDocumentSnapshot,
  TaxPeriod,
  TaxProfile,
  TaxRecommendation,
  TaxType,
} from "@/lib/canonical-model";
import type { CorporateTaxComputationResult } from "../corporate-tax";
import type { VatReconciliationResult } from "../vat";
import type { CfeReconciliationResult } from "@/lib/tax-engine/cfe/engine";
import type { VisualizationDataset } from "@/lib/visualization/types";

/** Périmètre d'affichage — synchronisé à l'URL (`?impot=`). */
export type TaxCockpitScope = "all" | "corporate_income_tax" | "vat" | "cfe";

export const TAX_COCKPIT_SCOPES: readonly TaxCockpitScope[] = [
  "all",
  "corporate_income_tax",
  "vat",
  "cfe",
];

export interface TaxCockpitDocumentRef {
  readonly documentType: string;
  readonly formNumber: string | null;
  readonly taxType: TaxType;
  readonly status: string;
}

export interface TaxCockpitSource {
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly entityName: string;
  readonly fiscalYear: number;
  readonly generatedAt: string;
  /** Profil et documents immuables réutilisés par le paquet de preuve TAX-09. */
  readonly profile: TaxProfile;
  readonly documentSnapshots: readonly TaxDocumentSnapshot[];
  readonly synthesis: FiscalSynthesisSnapshot;
  readonly corporateTax: CorporateTaxComputationResult | null;
  readonly vat: VatReconciliationResult | null;
  readonly cfe: CfeReconciliationResult | null;
  readonly capabilityMatrices: readonly TaxCapabilityMatrix[];
  readonly periods: readonly TaxPeriod[];
  readonly availableDocuments: readonly TaxCockpitDocumentRef[];
}

/** Item du panneau capacité & décision (NIVEAU 1). */
export interface TaxCapabilityItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tone: "critical" | "warning" | "positive" | "neutral";
  readonly detail?: string;
}

/** Étape de waterfall fiscal — copie conforme du moteur, jamais recalculée. */
export interface TaxCockpitWaterfallStep {
  readonly id: string;
  readonly label: string;
  readonly kind: "base" | "delta" | "subtotal" | "total";
  readonly deltaCents: number;
  readonly runningTotalCents: number;
  /** `proposed` = candidat de revue, hors cumul retenu (règle TAX-05). */
  readonly status: "computed" | "proposed" | "declared" | "unavailable";
  readonly note?: string;
  /** Sens d'une étape « delta » : `add` (réintégration) ou `subtract` (déduction, déficit). */
  readonly direction: "add" | "subtract" | null;
  /**
   * Lecture relative à la base (« + 7,3 % du résultat comptable »), formatée côté
   * projection en arithmétique entière — jamais calculée dans React.
   */
  readonly readingLabel: string | null;
}

/** Barre de comparaison à deux ou trois opérandes (IS et TVA). */
export interface TaxComparisonBarRow {
  readonly id: string;
  readonly label: string;
  readonly values: readonly {
    readonly key: string;
    readonly label: string;
    readonly amountCents: number | null;
  }[];
  readonly differenceCents: number | null;
  readonly statusLabel: string;
  readonly tone: "critical" | "warning" | "positive" | "neutral";
}

export interface TaxCoverageSegment {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly tone: "critical" | "warning" | "positive" | "neutral";
}

export interface TaxRiskMatrixCell {
  readonly taxType: TaxType;
  readonly cycle: string;
  readonly controlCount: number;
  /** Pire statut au sens de l'ordre d'attention de la taxonomie — texte, jamais couleur seule. */
  readonly worstOutcomeLabel: string | null;
  readonly tone: "critical" | "warning" | "positive" | "neutral";
  readonly controlTitles: readonly string[];
  /** Décomposition des sorties de la cellule, dans l'ordre d'attention de la taxonomie. */
  readonly outcomeBreakdown: readonly {
    readonly outcome: string;
    readonly label: string;
    readonly count: number;
    readonly tone: "critical" | "warning" | "positive" | "neutral";
  }[];
}

/** Ligne d'exploration (NIVEAU 4) avec son détail preuve/formule/limites. */
export interface TaxFindingRowDetail {
  /** Identifiant de contrôle du moteur (`null` pour une ligne de rapprochement). */
  readonly controlId: string | null;
  /** Libellé long de l'impôt (« Impôt sur les sociétés »). */
  readonly taxLabel: string;
  /** Lecture factuelle : wording imposé de la taxonomie ou détail du moteur. */
  readonly reading: string;
  /** Montant porteur de la ligne (écart si la sortie n'est pas « Vérifié », sinon valeur). */
  readonly amountDisplay: string;
  readonly formula: string;
  readonly usedData: readonly string[];
  readonly limits: readonly string[];
  readonly evidence: string;
  readonly sources: readonly string[];
  readonly review: string;
}

export interface TaxCockpitSummary {
  readonly entityName: string;
  readonly dossierId: string;
  readonly fiscalYear: number;
  readonly periodLabel: string;
  readonly currency: "EUR";
  /** Bornes de l'exercice (ISO `AAAA-MM-JJ`), `null` si aucune période n'est connue. */
  readonly periodStartDate: string | null;
  readonly periodEndDate: string | null;
  readonly generatedAt: string;
  readonly headlineLabel: string;
  readonly headlineTone: "critical" | "warning" | "positive" | "neutral";
  readonly headlineDetail: string;
  readonly headlinePolicyVersion: string;
  readonly snapshotHash: string;
  readonly engineVersions: readonly string[];
}

export interface TaxCockpitDatasets {
  readonly scope: TaxCockpitScope;
  readonly summary: TaxCockpitSummary;
  readonly capability: VisualizationDataset & {
    readonly items: readonly TaxCapabilityItem[];
    readonly nextAction: TaxRecommendation | null;
    /** Pièces disponibles au dossier (libellés dédoublonnés). */
    readonly documents: readonly { readonly label: string }[];
  };
  readonly waterfall: VisualizationDataset & {
    readonly steps: readonly TaxCockpitWaterfallStep[];
    readonly confirmedTaxResultCents: number | null;
    readonly proposedTaxResultCents: number | null;
  };
  readonly corporateReconciliation: VisualizationDataset & {
    readonly bars: readonly TaxComparisonBarRow[];
  };
  readonly vatReconciliation: VisualizationDataset & {
    readonly bars: readonly TaxComparisonBarRow[];
  };
  readonly exposure: VisualizationDataset;
  readonly coverage: VisualizationDataset & {
    readonly segments: readonly TaxCoverageSegment[];
    readonly totalControls: number;
  };
  readonly riskMatrix: VisualizationDataset & {
    readonly taxes: readonly TaxType[];
    readonly cycles: readonly string[];
    readonly cells: readonly TaxRiskMatrixCell[];
  };
  readonly findingsByNature: VisualizationDataset;
  readonly controlsByEvidence: VisualizationDataset;
  readonly periods: VisualizationDataset;
  readonly requiredDocuments: VisualizationDataset;
  readonly findings: VisualizationDataset & {
    readonly details: Readonly<Record<string, TaxFindingRowDetail>>;
    readonly outcomeByRowId: Readonly<Record<string, string>>;
  };
}

/**
 * Contrat de visualisation — VisualizationDataset.
 *
 * TOUS les graphiques de la Synthèse reçoivent un `VisualizationDataset`
 * construit par `build-datasets.ts` depuis le `SynthesisSnapshot`. Aucun
 * composant ne recompte les findings, ne refait une somme ou ne réinterprète
 * un statut : si un chiffre est affiché, il vient d'un dataset, et le dataset
 * vient du snapshot. C'est ce qui rend la règle « aucune divergence
 * graphique / snapshot » testable — le test compare dataset et snapshot, et
 * le composant n'a rien d'autre à afficher que le dataset.
 *
 * Le dataset porte aussi son ALTERNATIVE TABULAIRE : `columns` + `rows` sont
 * le tableau de données rendu sous chaque graphique (AccessibleChartTable),
 * et `summary` est le résumé textuel lu par les lecteurs d'écran. Un dataset
 * sans résumé ni tableau ne compile pas.
 */

export type CellValue = string | number | null;

export interface VisualizationColumn {
  key: string;
  label: string;
  /** Unité d'affichage de la colonne (€, %, nb…) — vide si sans objet. */
  unit?: string;
  /** Alignement conseillé (les montants à droite). */
  align?: "left" | "right";
}

export interface VisualizationRow {
  /** Clé stable de la ligne (tri, réordonnancement, React key). */
  id: string;
  cells: Record<string, CellValue>;
  /**
   * Accent visuel optionnel — l'information portée par la couleur doit
   * TOUJOURS exister aussi en texte dans les cellules (jamais couleur seule).
   */
  emphasis?: "critical" | "warning" | "positive" | "muted";
}

export interface VisualizationDataset {
  id: string;
  title: string;
  /** Résumé textuel complet pour lecteur d'écran — obligatoire. */
  summary: string;
  columns: VisualizationColumn[];
  rows: VisualizationRow[];
  /** metricIds de la calculationTrace du snapshot dont ce dataset dérive. */
  sourceMetricIds: string[];
  /** Méthodologie affichée par MethodologyPopover (formule, exclusions). */
  methodology?: string;
  /** Références de sources affichées par SourceFootnote. */
  sourceRefs?: string[];
}

/** Étape d'un waterfall : delta signé ou sous-total. */
export interface WaterfallStep {
  id: string;
  label: string;
  /** Montant en CENTIMES (signe = sens de l'étape) — jamais recalculé. */
  amountCents: number;
  kind: "start" | "delta" | "subtotal" | "total";
  note?: string;
}

/** Item du niveau décision (DecisionHeader). */
export interface DecisionItem {
  id: string;
  label: string;
  value: string;
  /** Statut catégoriel — doublé du texte, jamais couleur seule. */
  tone: "critical" | "warning" | "positive" | "neutral";
  detail?: string;
}

/**
 * Paquet complet des datasets de la page Synthèse. Construit une seule fois
 * par `buildSynthesisDatasets`, consommé par les composants.
 */
export interface SynthesisDatasets {
  /** Niveau décision : admissibilité, blocages, couverture, revue, exposition validée, prochaine action. */
  decision: {
    verdictHeadline: string;
    verdictDetail: string;
    verdictTone: DecisionItem["tone"];
    items: DecisionItem[];
    snapshotHash: string;
    engineVersion: string;
    generatedAt: string;
  };
  admissibility: VisualizationDataset;
  fecQuality: VisualizationDataset;
  coverage: VisualizationDataset;
  riskHeatmap: VisualizationDataset;
  waterfall: VisualizationDataset & { steps: WaterfallStep[] };
  review: VisualizationDataset;
  concentration: VisualizationDataset;
  limitations: VisualizationDataset;
  normativePyramid: VisualizationDataset;
  standardsTimeline: VisualizationDataset;
  evidenceFlow: VisualizationDataset;
}

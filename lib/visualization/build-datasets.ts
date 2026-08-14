/**
 * Construction des VisualizationDatasets depuis le SynthesisSnapshot.
 *
 * SEUL point de calcul de la couche visualisation. Les composants reçoivent
 * ces datasets et les affichent — ils ne recomptent jamais les findings, ne
 * refont aucune somme, ne réinterprètent aucun statut. La cohérence
 * graphique/snapshot est testée ici (build-datasets.test.ts) en comparant
 * chaque chiffre de dataset au champ du snapshot dont il dérive.
 *
 * Fonctions pures : mêmes entrées ⇒ mêmes datasets.
 */

import type { Finding, Severity } from "@/lib/canonical-model/finding";
import { FEC_COLUMNS } from "@/lib/canonical-model/fec";
import { CLOISONS } from "@/lib/canonical-model/taxonomy";
import type { Societe } from "@/lib/canonical-model";
import { formatCents } from "@/lib/synthesis/money";
import type { SynthesisSnapshot } from "@/lib/synthesis/types";
import type {
  DecisionItem,
  SynthesisDatasets,
  VisualizationDataset,
  VisualizationRow,
  WaterfallStep,
} from "./types";

export interface BuildInputs {
  synthesis: SynthesisSnapshot;
  societe: Societe;
  /** Constats du dossier — pour les axes que le snapshot n'agrège pas (assertions). */
  findings: Finding[];
  admissibilityFindings: Finding[];
}

const SEVERITIES: Severity[] = ["bloquant", "majeur", "mineur", "informatif"];
const SEVERITY_LABEL: Record<Severity, string> = {
  bloquant: "Bloquant", majeur: "Majeur", mineur: "Mineur", informatif: "Informatif",
};

function cloisonLabel(id: string): string {
  return CLOISONS.find((c) => c.id === id)?.label ?? id;
}

/* ── FEC : correspondance règle d'admissibilité → zones concernées ────────── */
/**
 * Correspondance de PRÉSENTATION entre les règles d'admissibilité du moteur
 * et les zones FEC qu'elles contrôlent. Elle ne crée aucune vérité métier :
 * elle localise sur la matrice des 18 zones les alertes déjà produites.
 * Une règle absente d'ici marque la ligne « dossier entier ».
 */
const RULE_FIELD_MAP: Record<string, readonly string[]> = {
  "R-HL-002": [...FEC_COLUMNS], // présence des 18 rubriques
  "R-HL-003": [...FEC_COLUMNS], // ordre des rubriques
  // R_HL_004.run (hard-law.ts) ne teste que `e.ecritureDate` — PieceDate,
  // DateLet et ValidDate ne sont jamais inspectées par cette règle.
  "R-HL-004": ["EcritureDate"],
  "R-HL-005": ["Debit", "Credit"],
  // R_HL_006.run ne teste que `e.compteNum`.
  "R-HL-006": ["CompteNum"],
  "R-HL-007": ["ValidDate"],
  "R-HL-008": ["Debit", "Credit"],
  "R-HL-009": ["Debit", "Credit", "Montantdevise"],
};

/** Format réglementaire d'affichage par zone (A47 A-1 — cf. data/fec/fields.yml). */
const FIELD_FORMAT: Record<string, string> = {
  EcritureDate: "AAAAMMJJ", PieceDate: "AAAAMMJJ", DateLet: "AAAAMMJJ", ValidDate: "AAAAMMJJ",
  Debit: "numérique", Credit: "numérique", Montantdevise: "numérique",
  Idevise: "code devise",
};

export function buildSynthesisDatasets(inputs: BuildInputs): SynthesisDatasets {
  const { synthesis: s, findings, admissibilityFindings } = inputs;

  /* ── Niveau décision ─────────────────────────────────────────────────── */
  const nextAction: Record<typeof s.verdict.status, string> = {
    rejected: "Corriger les alertes bloquantes d'admissibilité, puis redéposer le fichier.",
    insufficient_coverage: "Compléter la couverture (écritures / contrôles) avant toute conclusion.",
    blocking_open: "Traiter les alertes bloquantes ouvertes dans la revue par cloison.",
    under_review: "Poursuivre l'arbitrage des constats dans la revue par cloison.",
    reviewed: "Générer la note de synthèse et constituer le dossier de preuve.",
  };
  const verdictTone: DecisionItem["tone"] =
    s.verdict.status === "rejected" || s.verdict.status === "blocking_open"
      ? "critical"
      : s.verdict.status === "insufficient_coverage"
        ? "warning"
        : s.verdict.status === "reviewed"
          ? "positive"
          : "neutral";

  const decisionItems: DecisionItem[] = [
    {
      id: "admissibilite",
      label: "Admissibilité",
      value:
        s.admissibility.status === "rejected"
          ? "Rejetée"
          : s.admissibility.status === "admissible_with_alerts"
            ? "Admissible avec alertes"
            : "Admissible",
      tone: s.admissibility.status === "rejected" ? "critical" : s.admissibility.status === "admissible_with_alerts" ? "warning" : "positive",
      detail: `${s.admissibility.blockingCount} alerte(s) bloquante(s)`,
    },
    {
      id: "blocages",
      label: "Blocages ouverts",
      value: String(s.risk.openBlockingCount),
      tone: s.risk.openBlockingCount > 0 ? "critical" : "positive",
      detail:
        s.risk.openBlockingCount === s.risk.bySeverity.bloquant
          ? "constats de gravité bloquante, revue non close"
          : `sur ${s.risk.bySeverity.bloquant} constat(s) de gravité bloquante — le reste est déjà arbitré`,
    },
    {
      id: "couverture",
      label: "Couverture",
      value:
        s.coverage.status === "substantial" ? "Substantielle" : s.coverage.status === "partial" ? "Partielle" : "Nulle",
      tone: s.coverage.status === "substantial" ? "positive" : s.coverage.status === "partial" ? "warning" : "critical",
      detail: `contrôles conclus ${s.coverage.controlsConcluded}/${s.coverage.controlsEligible}`,
    },
    {
      id: "revue",
      label: "Revue",
      value: `${s.review.pct} %`,
      tone: s.review.pct === 100 ? "positive" : s.review.pct > 0 ? "neutral" : "warning",
      detail: `${s.review.reviewedCount}/${s.review.totalCount} constats arbitrés`,
    },
    {
      id: "exposition-validee",
      label: "Exposition validée",
      value: formatCents(s.exposure.validatedAdjustmentCents),
      tone: s.exposure.validatedAdjustmentCents === 0 ? "neutral" : "warning",
      detail: `effet net ${formatCents(s.exposure.netFinancialStatementEffectCents)}`,
    },
    {
      id: "prochaine-action",
      label: "Prochaine action",
      value: nextAction[s.verdict.status],
      tone: "neutral",
    },
  ];

  /* ── Admissibilité ───────────────────────────────────────────────────── */
  const admissibility: VisualizationDataset = {
    id: "admissibility",
    title: "Admissibilité du fichier",
    summary: `Statut ${decisionItems[0].value}. ${s.admissibility.blockingCount} alerte(s) bloquante(s) sur ${s.admissibility.alertFindingIds.length} alerte(s) d'admissibilité au total.`,
    columns: [
      { key: "constat", label: "Alerte d'admissibilité" },
      { key: "gravite", label: "Gravité" },
      { key: "regle", label: "Règle" },
    ],
    rows: admissibilityFindings.map((f) => ({
      id: f.id,
      cells: { constat: f.titre, gravite: SEVERITY_LABEL[f.severity], regle: f.ruleId },
      emphasis: f.severity === "bloquant" ? "critical" : "warning",
    })),
    sourceMetricIds: ["admissibility.status"],
    methodology:
      "Statut rejeté si au moins une alerte d'admissibilité bloquante ; admissible avec alertes sinon ; admissible si aucune alerte. Aucun score.",
    sourceRefs: ["LPF art. A.47 A-1 (format du FEC)"],
  };

  /* ── Matrice FEC des 18 zones ────────────────────────────────────────── */
  const firedRules = new Set(admissibilityFindings.map((f) => f.ruleId));
  const fieldAlerts = new Map<string, string[]>();
  for (const rule of firedRules) {
    for (const field of RULE_FIELD_MAP[rule] ?? []) {
      fieldAlerts.set(field, [...(fieldAlerts.get(field) ?? []), rule]);
    }
  }
  const globalRules = [...firedRules].filter((r) => !RULE_FIELD_MAP[r]).sort();

  const fecQuality: VisualizationDataset = {
    id: "fec-quality",
    title: "Matrice des 18 zones réglementaires du FEC",
    summary: `${fieldAlerts.size} zone(s) sur 18 concernée(s) par une alerte d'admissibilité${globalRules.length ? `, plus ${globalRules.length} règle(s) portant sur le dossier entier` : ""}.`,
    columns: [
      { key: "position", label: "N°", align: "right" },
      { key: "zone", label: "Zone (A.47 A-1)" },
      { key: "format", label: "Format" },
      { key: "statut", label: "Statut" },
    ],
    rows: FEC_COLUMNS.map((field, i) => {
      const alerts = fieldAlerts.get(field);
      return {
        id: field,
        cells: {
          position: i + 1,
          zone: field,
          format: FIELD_FORMAT[field] ?? "libre",
          statut: alerts ? `Alerte (${alerts.sort().join(", ")})` : "Aucune alerte",
        },
        emphasis: alerts ? "critical" : undefined,
      } satisfies VisualizationRow;
    }),
    sourceMetricIds: ["admissibility.status"],
    methodology:
      "Les 18 zones et leur ordre viennent de l'article A.47 A-1 du LPF. La colonne Statut localise les alertes d'admissibilité déjà produites par le moteur — la correspondance règle→zones est une présentation, pas un nouveau contrôle.",
    sourceRefs: ["LPF art. A.47 A-1", "data/fec/fields.yml (référentiel vérifié)"],
  };

  /* ── Couverture ──────────────────────────────────────────────────────── */
  const coverage: VisualizationDataset = {
    id: "coverage",
    title: "Couverture de l'analyse",
    summary: `Couverture ${decisionItems[2].value.toLowerCase()}. Écritures analysées : ${s.coverage.entriesAnalysed} sur ${s.coverage.entriesTotal}. Contrôles conclus : ${s.coverage.controlsConcluded} sur ${s.coverage.controlsEligible}, dont ${s.coverage.controlsNotConcluded} sans conclusion.`,
    columns: [
      { key: "dimension", label: "Dimension" },
      { key: "fait", label: "Réalisé", align: "right" },
      { key: "total", label: "Éligible", align: "right" },
      { key: "ratio", label: "Ratio", unit: "%", align: "right" },
    ],
    rows: [
      {
        id: "entries",
        cells: {
          dimension: "Écritures analysées",
          fait: s.coverage.entriesAnalysed,
          total: s.coverage.entriesTotal,
          ratio: Math.round(s.coverage.entriesRatio * 100),
        },
      },
      {
        id: "controls",
        cells: {
          dimension: "Contrôles conclus",
          fait: s.coverage.controlsConcluded,
          total: s.coverage.controlsEligible,
          ratio: Math.round(s.coverage.controlsRatio * 100),
        },
        emphasis: s.coverage.controlsNotConcluded > 0 ? "warning" : undefined,
      },
    ],
    sourceMetricIds: ["coverage.status"],
    methodology:
      "Le statut retient le plus faible des deux ratios (écritures, contrôles) : substantiel à partir de 95 %, partiel au-dessus de zéro, nul sinon.",
  };

  /* ── Heatmap cloison × assertion ─────────────────────────────────────── */
  const ASSERTION_LABEL: Record<string, string> = {
    existence: "Existence", exhaustivite: "Exhaustivité", exactitude: "Exactitude",
    evaluation: "Évaluation", droits_obligations: "Droits et obligations",
    presentation: "Présentation", rattachement: "Rattachement",
  };
  const assertionsPresent = [
    ...new Set(
      findings.map((f) => f.financialEffect?.assertion ?? "non_qualifiee"),
    ),
  ].sort();
  const heatmapRows: VisualizationRow[] = [];
  const cloisonsPresent = [...new Set(findings.map((f) => f.cloison))].sort();
  for (const clo of cloisonsPresent) {
    const cells: Record<string, string | number> = { cloison: cloisonLabel(clo) };
    for (const a of assertionsPresent) {
      cells[a] = findings.filter(
        (f) => f.cloison === clo && (f.financialEffect?.assertion ?? "non_qualifiee") === a,
      ).length;
    }
    heatmapRows.push({ id: clo, cells });
  }
  const riskHeatmap: VisualizationDataset = {
    id: "risk-heatmap",
    title: "Concentration cloison × assertion",
    summary: `${s.risk.totalFindings} constats répartis sur ${cloisonsPresent.length} cloison(s) et ${assertionsPresent.length} colonne(s) d'assertion. Les constats sans effet financier explicite figurent en colonne « non qualifiée ».`,
    columns: [
      { key: "cloison", label: "Cloison" },
      ...assertionsPresent.map((a) => ({
        key: a,
        label: ASSERTION_LABEL[a] ?? "Non qualifiée",
        align: "right" as const,
      })),
    ],
    rows: heatmapRows,
    sourceMetricIds: ["risk.heuristicSeverityIndex"],
    methodology:
      "Comptes de constats par cloison et par assertion d'audit (portée par l'effet financier explicite du constat). « Non qualifiée » = constat sans effet financier explicite : son assertion n'est pas présumée.",
  };

  /* ── Waterfall d'exposition ──────────────────────────────────────────── */
  const e = s.exposure;
  const duplicatesCents = e.grossDetectedExposureCents - e.deduplicatedExposureCents;
  const steps: WaterfallStep[] = [
    { id: "gross", label: "Exposition brute détectée", amountCents: e.grossDetectedExposureCents, kind: "start" },
    { id: "duplicates", label: "Doublons et chevauchements", amountCents: -duplicatesCents, kind: "delta", note: "politique max_magnitude par cluster" },
    { id: "dedup", label: "Exposition dédupliquée", amountCents: e.deduplicatedExposureCents, kind: "subtotal" },
    { id: "dismissed", label: "Constats écartés en revue", amountCents: -e.dismissedExposureCents, kind: "delta" },
    { id: "pending", label: "En attente d'arbitrage", amountCents: -e.pendingReviewExposureCents, kind: "delta", note: "ni confirmé ni écarté — hors ajustement à ce stade" },
    { id: "validated", label: "Ajustements confirmés (signés)", amountCents: e.validatedAdjustmentCents, kind: "subtotal", note: "somme signée : augmentation +, diminution −" },
    { id: "tax", label: "Effet d'impôt (taux explicites)", amountCents: -e.taxEffectCents, kind: "delta" },
    { id: "net", label: "Effet net sur les états financiers", amountCents: e.netFinancialStatementEffectCents, kind: "total" },
  ];
  const waterfall: SynthesisDatasets["waterfall"] = {
    id: "exposure-waterfall",
    title: "De l'exposition brute à l'effet net",
    summary: `Exposition brute ${formatCents(e.grossDetectedExposureCents)}, dédupliquée ${formatCents(e.deduplicatedExposureCents)} (doublons ${formatCents(duplicatesCents)}), écartée ${formatCents(e.dismissedExposureCents)}, en attente ${formatCents(e.pendingReviewExposureCents)}. Ajustements confirmés ${formatCents(e.validatedAdjustmentCents)}, effet d'impôt ${formatCents(e.taxEffectCents)}, effet net ${formatCents(e.netFinancialStatementEffectCents)}. ${e.findingsWithoutEffect.length} constat(s) sans effet financier explicite sont hors de ce graphique.`,
    columns: [
      { key: "etape", label: "Étape" },
      { key: "montant", label: "Montant", unit: "€", align: "right" },
      { key: "note", label: "Note" },
    ],
    rows: steps.map((st) => ({
      id: st.id,
      cells: { etape: st.label, montant: formatCents(st.amountCents), note: st.note ?? "" },
      emphasis: st.kind === "total" ? "positive" : st.kind === "subtotal" ? "muted" : undefined,
    })),
    steps,
    sourceMetricIds: [
      "exposure.deduplicatedExposureCents",
      "exposure.netFinancialStatementEffectCents",
    ],
    methodology:
      "Montants en centimes entiers issus du moteur de Synthèse. Seuls les constats portant un effet financier explicite contribuent ; la déduplication suit la politique max_magnitude (clusters ambigus inclus de façon conservatrice et marqués revue requise).",
  };

  /* ── Revue ───────────────────────────────────────────────────────────── */
  const review: VisualizationDataset = {
    id: "review-progress",
    title: "Progression de la revue",
    summary: `${s.review.reviewedCount} constat(s) arbitré(s) sur ${s.review.totalCount} (${s.review.pct} %).`,
    columns: [
      { key: "statut", label: "Statut de revue" },
      { key: "nombre", label: "Constats", align: "right" },
    ],
    rows: Object.entries(s.review.byStatus)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([st, n]) => ({ id: st, cells: { statut: st, nombre: n } })),
    sourceMetricIds: ["review.pct"],
    methodology:
      "Un constat est arbitré quand son dernier événement de revue porte un statut clos (validé, écarté, corrigé ou équivalents).",
  };

  /* ── Concentration par cloison ───────────────────────────────────────── */
  const concentration: VisualizationDataset = {
    id: "finding-concentration",
    title: "Concentration des constats et de l'exposition",
    summary: `Répartition des ${s.risk.totalFindings} constats et de l'exposition dédupliquée par cloison.`,
    columns: [
      { key: "cloison", label: "Cloison" },
      ...SEVERITIES.map((sev) => ({ key: sev, label: SEVERITY_LABEL[sev], align: "right" as const })),
      { key: "exposition", label: "Exposition", unit: "€", align: "right" },
    ],
    rows: Object.entries(s.risk.matrix)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clo, row]) => ({
        id: clo,
        cells: {
          cloison: cloisonLabel(clo),
          ...Object.fromEntries(SEVERITIES.map((sev) => [sev, row?.[sev] ?? 0])),
          exposition: formatCents(s.exposure.byCloison[clo as keyof typeof s.exposure.byCloison] ?? 0),
        },
        emphasis: (row?.bloquant ?? 0) > 0 ? "critical" : undefined,
      })),
    sourceMetricIds: ["risk.heuristicSeverityIndex", "exposure.deduplicatedExposureCents"],
  };

  /* ── Limitations ─────────────────────────────────────────────────────── */
  const limitations: VisualizationDataset = {
    id: "limitations",
    title: "Limites de l'analyse",
    summary: `${s.limitations.length} limitation(s) générée(s) par le moteur. ${e.findingsWithoutEffect.length} constat(s) sans effet chiffré.`,
    columns: [
      { key: "code", label: "Code" },
      { key: "message", label: "Limitation" },
    ],
    rows: s.limitations.map((l, i) => ({
      id: `${l.code}-${i}`,
      cells: { code: l.code, message: l.message },
      emphasis: "warning",
    })),
    sourceMetricIds: ["verdict.status"],
  };

  /* ── Pyramide normative ──────────────────────────────────────────────── */
  const normativePyramid: VisualizationDataset = {
    id: "normative-pyramid",
    title: "Pyramide normative des constats",
    summary: `${s.risk.byFamily.hardLaw} constat(s) opposable(s) (droit dur), ${s.risk.byFamily.methodology} présomption(s) d'audit, ${s.risk.byFamily.internal} paramètre(s) interne(s) non opposable(s).`,
    columns: [
      { key: "niveau", label: "Niveau normatif" },
      { key: "nombre", label: "Constats", align: "right" },
      { key: "portee", label: "Portée" },
    ],
    rows: [
      { id: "hardLaw", cells: { niveau: "Droit dur (opposable)", nombre: s.risk.byFamily.hardLaw, portee: "LPF, PCG, Code de commerce — fonde directement un constat" }, emphasis: "critical" },
      { id: "methodology", cells: { niveau: "Présomption d'audit", nombre: s.risk.byFamily.methodology, portee: "ISA / NEP — signal appelant une investigation" } },
      { id: "internal", cells: { niveau: "Paramètre interne", nombre: s.risk.byFamily.internal, portee: "Heuristique PROBANT, non opposable" }, emphasis: "muted" },
    ],
    sourceMetricIds: ["risk.heuristicSeverityIndex"],
    sourceRefs: ["lib/rules-engine — trois registres jamais confondus"],
  };

  /* ── Frise des référentiels ──────────────────────────────────────────── */
  const standardsTimeline: VisualizationDataset = {
    id: "standards-timeline",
    title: "Référentiels et versions appliqués",
    summary: `Snapshot généré le ${s.generatedAt} par le moteur ${s.engineVersion}, règles ${s.ruleSetVersion}, référentiel normatif ${s.referenceSetVersion}, politique d'agrégation ${s.policyVersion}.`,
    columns: [
      { key: "element", label: "Élément" },
      { key: "version", label: "Version" },
    ],
    rows: [
      { id: "schema", cells: { element: "Schéma du snapshot", version: s.schemaVersion } },
      { id: "engine", cells: { element: "Moteur de Synthèse", version: s.engineVersion } },
      { id: "rules", cells: { element: "Jeu de règles", version: s.ruleSetVersion } },
      { id: "referentiel", cells: { element: "Référentiel normatif", version: s.referenceSetVersion } },
      { id: "policy", cells: { element: "Politique d'agrégation", version: s.policyVersion } },
    ],
    sourceMetricIds: [],
    sourceRefs: ["docs/knowledge/REVIEW_REQUIRED.md — référentiel en revue requise"],
  };

  /* ── Chaîne de preuve ────────────────────────────────────────────────── */
  const evidenceFlow: VisualizationDataset = {
    id: "evidence-flow",
    title: "Chaîne de preuve",
    summary: `${s.evidence.sourceDocuments.length} document(s) source empreinté(s), ${s.risk.totalFindings} constat(s), ${s.review.reviewedCount} arbitrage(s), snapshot ${s.snapshotHash.slice(0, 12)}…. ${s.evidence.findingsWithoutEvidenceChain.length} constat(s) sans chaîne de preuve.`,
    columns: [
      { key: "maillon", label: "Maillon" },
      { key: "valeur", label: "Contenu" },
      { key: "empreinte", label: "Empreinte / trace" },
    ],
    rows: [
      ...s.evidence.sourceDocuments.map((d) => ({
        id: `doc-${d.id}`,
        cells: { maillon: "Document source", valeur: d.fileName, empreinte: `${d.fingerprint.slice(0, 16)}…` },
      })),
      { id: "findings", cells: { maillon: "Constats", valeur: `${s.risk.totalFindings} constat(s)`, empreinte: `${s.evidence.findingsWithoutEvidenceChain.length} sans chaîne de preuve` } },
      { id: "review", cells: { maillon: "Revue humaine", valeur: `${s.review.reviewedCount}/${s.review.totalCount} arbitré(s)`, empreinte: "événements de revue horodatés" } },
      { id: "snapshot", cells: { maillon: "Snapshot de synthèse", valeur: `généré le ${s.generatedAt}`, empreinte: s.snapshotHash } },
    ],
    sourceMetricIds: [],
    methodology:
      "Le hash du snapshot couvre le contenu (hors horodatage) : mêmes données ⇒ même empreinte, ce qui rend la synthèse rejouable et contestable.",
  };

  return {
    decision: {
      verdictHeadline: s.verdict.headline,
      verdictDetail: s.verdict.detail,
      verdictTone,
      items: decisionItems,
      snapshotHash: s.snapshotHash,
      engineVersion: s.engineVersion,
      generatedAt: s.generatedAt,
    },
    admissibility,
    fecQuality,
    coverage,
    riskHeatmap,
    waterfall,
    review,
    concentration,
    limitations,
    normativePyramid,
    standardsTimeline,
    evidenceFlow,
  };
}

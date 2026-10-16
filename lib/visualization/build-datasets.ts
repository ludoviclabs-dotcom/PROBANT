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
import { restrictExposure } from "@/lib/synthesis/exposure";
import { EFFECT_TARGET_LABEL, effectStageLabel, scopedEffectItems } from "@/lib/synthesis/effect-labels";
import type { SynthesisSnapshot } from "@/lib/synthesis/types";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { resolveAssertions } from "@/lib/audit/assertions";
import { NEP_500_SOURCE } from "@/lib/audit/assertions";
import { CL_ASSERTIONS, assertionLabel } from "@/lib/workpapers/closing-contract";
import { summarizeWorkpapers } from "@/lib/workpapers/mission-summary";
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
  /** Snapshot complet — pour la couverture des travaux (feuilles, pièces, versions). Optionnel. */
  dossier?: DossierSnapshot;
}

const WORK_STATE_LABEL: Record<string, string> = { draft: "Brouillon", ready: "Prêt", executed: "Exécuté", awaiting_review: "En revue", changes_requested: "Correction demandée", approved: "Travail approuvé", locked: "Verrouillé", superseded: "Remplacé", blocked: "Bloqué", failed: "Échec" };

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
    insufficient_coverage: s.coverage.status === "unqualified"
      ? "Qualifier les populations (dénombrer les écritures, déclarer le catalogue de contrôles) avant toute conclusion ; l'avancement des contrôles historiques n'est pas une couverture."
      : "Compléter la couverture (écritures / contrôles) avant toute conclusion.",
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
        s.coverage.status === "substantial" ? "Substantielle" : s.coverage.status === "partial" ? "Partielle" : s.coverage.status === "unqualified" ? "Non qualifiée" : "Nulle",
      tone: s.coverage.status === "substantial" ? "positive" : s.coverage.status === "partial" ? "warning" : "critical",
      detail: s.coverage.status === "unqualified"
        ? "aucun dénominateur qualifié"
        : s.coverage.populations.filter((p) => p.ratio !== null).map((p) => `${p.label.toLowerCase()} ${p.numerator}/${p.denominator}`).join(" · "),
    },
    {
      id: "revue",
      label: "Revue",
      value: `${s.review.pct} %`,
      tone: s.review.pct === 100 ? "positive" : s.review.pct > 0 ? "neutral" : "warning",
      detail: `${s.review.reviewedCount}/${s.review.totalCount} constats arbitrés`,
    },
    (() => {
      const res = s.exposure.netByTarget.find((n) => n.target === "resultat");
      const others = s.exposure.netByTarget.filter((n) => n.target !== "resultat");
      const proposed = res?.proposedSignedCents ?? 0;
      return {
        id: "exposition-validee",
        label: "Ajustement proposé (résultat)",
        value: res ? formatCents(proposed) : "aucun",
        tone: (proposed === 0 && others.length === 0 ? "neutral" : "warning") as "neutral" | "warning",
        detail: res
          ? `net après impôt ${res.netAfterKnownTaxCents === null ? `inconnu (${res.taxStatus === "partial" ? "incidence fiscale partiellement connue" : "incidence fiscale inconnue"})` : formatCents(res.netAfterKnownTaxCents)}${others.length ? ` · ${others.length} autre(s) poste(s) ajusté(s), non additionné(s)` : ""}`
          : s.exposure.aggregationStatus === "indeterminate" ? "exposition indéterminée : groupes à arbitrer" : "aucun ajustement proposé sur le résultat",
      };
    })(),
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

  /* ── Couverture (C03 : une ligne par population qualifiée séparément) ─── */
  const POPULATION_STATUS_LABEL: Record<string, string> = {
    missing: "Population manquante", known_empty: "Population connue vide", not_applicable: "Non applicable",
    unqualified: "Dénominateur non qualifié", untreated: "Non traitée", partial: "Partiellement traitée", complete: "Traitée",
  };
  const coverage: VisualizationDataset = {
    id: "coverage",
    title: "Couverture de l'analyse",
    summary: `Couverture ${decisionItems[2].value.toLowerCase()}. ${s.coverage.populations.map((p) => `${p.label} : ${POPULATION_STATUS_LABEL[p.status].toLowerCase()}${p.ratio !== null ? ` (${p.numerator} sur ${p.denominator}, ${Math.round(p.ratio * 100)} %)` : ` — ${p.basis}`}`).join(". ")}. Contrôles sans conclusion : ${s.coverage.controlsNotConcluded}.`,
    columns: [
      { key: "dimension", label: "Population" },
      { key: "statut", label: "État" },
      { key: "fait", label: "Réalisé", align: "right" },
      { key: "total", label: "Dénominateur", align: "right" },
      { key: "ratio", label: "Ratio", unit: "%", align: "right" },
      { key: "base", label: "Base du dénominateur" },
    ],
    rows: s.coverage.populations.map((p) => ({
      id: p.id,
      cells: {
        dimension: p.label,
        statut: POPULATION_STATUS_LABEL[p.status],
        fait: p.numerator,
        total: p.denominator,
        ratio: p.ratio === null ? null : Math.round(p.ratio * 100),
        base: p.basis,
      },
      emphasis: p.status === "missing" || p.status === "unqualified" ? "critical" : p.status === "partial" || p.status === "untreated" || (p.id === "controls" && s.coverage.controlsNotConcluded > 0) ? "warning" : p.status === "complete" ? "positive" : "muted",
    })),
    sourceMetricIds: ["coverage.status"],
    methodology:
      "Chaque population est qualifiée séparément : un ratio n'existe qu'avec un dénominateur dénombré (parseur) ou déclaré (catalogue de contrôles). Une population manquante n'est pas vide ; des contrôles comptés depuis les constats ne forment pas un dénominateur. Le statut retient le plus faible des ratios qualifiés : substantiel à partir de 95 % sans population manquante ni non qualifiée, partiel au-dessus de zéro, nul sinon, non qualifié sans dénominateur.",
  };

  /* ── Couverture des travaux (C03 : procédures réalisées, pièces, versions) ─ */
  const workRuns = new Map([...(inputs.dossier?.workpapers?.runs ?? []), ...(inputs.dossier?.workpaperProjection?.lockedRuns ?? [])].map((r) => [r.id, r] as const));
  const workRows: VisualizationRow[] = inputs.dossier ? summarizeWorkpapers(inputs.dossier).rows.map((r) => {
    const run = workRuns.get(r.id);
    const declared = run?.template.assertions.map((a) => `${a.label} (${a.validation})`) ?? [];
    const inconclusive = r.presentation.incomplete > 0 || r.presentation.contractOutdated;
    const travail = r.blocked ? "Bloqué : procédure non exécutée" : inconclusive ? "Non concluant sur une partie" : r.executed ? (r.presentation.exceptions ? "Exécuté · exceptions démontrées" : "Exécuté · aucune exception sur les éléments testés") : "Non exécuté";
    return {
      id: r.id,
      cells: {
        procedure: r.label,
        assertions: declared.length ? declared.join(" ; ") : "Aucune assertion déclarée par la feuille",
        etat: `${WORK_STATE_LABEL[r.state] ?? r.state}${r.stale ? " · périmé" : ""}`,
        travail,
        pieces: run?.evidence.length ?? 0,
        version: `r${r.revision} v${run?.version ?? "?"}`,
        revue: r.presentation.review,
      },
      emphasis: r.blocked ? "critical" : inconclusive || r.stale ? "warning" : r.state === "locked" ? "positive" : undefined,
    };
  }) : [];
  const workCoverage: VisualizationDataset = {
    id: "work-coverage",
    title: "Couverture des travaux",
    summary: workRows.length
      ? `${workRows.length} procédure(s) réalisée(s) dans ce dossier : ${workRows.map((r) => `${r.cells.procedure} — ${r.cells.travail}, ${r.cells.pieces} pièce(s), ${r.cells.version}`).join(" ; ")}. Une assertion peut être visée par plusieurs travaux ; aucune assertion sans travail n'est réputée couverte.`
      : "Aucune procédure réalisée dans ce dossier : couverture des travaux non établie. Aucune cellule n'est réputée couverte sans travail, pièce et version.",
    columns: [
      { key: "procedure", label: "Procédure" },
      { key: "assertions", label: "Assertions visées" },
      { key: "etat", label: "État" },
      { key: "travail", label: "Travail" },
      { key: "pieces", label: "Pièces", align: "right" },
      { key: "version", label: "Version" },
      { key: "revue", label: "Revue" },
    ],
    rows: workRows,
    sourceMetricIds: [],
    methodology:
      "Lecture seule des feuilles de travail du dossier (état, résultat, pièces rattachées, révision et version). Distincte de la matrice des constats : un constat n'est pas un travail, et un travail bloqué ou non concluant ne couvre pas l'assertion qu'il vise.",
  };

  /* ── Matrice des constats cloison × assertion NEP 500 §09 (C03) ────────── */
  // L'assertion vient du résolveur (règle, puis effet financier), jamais du seul montant. Un constat
  // peut porter plusieurs assertions : il compte dans chacune. Non résolu et conformité du fichier
  // restent hors des colonnes d'assertion.
  const resolved = findings.map((f) => ({ f, r: resolveAssertions(f) }));
  const assertionsPresent = CL_ASSERTIONS.filter((a) => resolved.some(({ r }) => r.assertions.includes(a)));
  const unresolvedCount = resolved.filter(({ r }) => r.basis === "unresolved").length;
  const conformityCount = resolved.filter(({ r }) => r.basis === "file_conformity").length;
  const heatmapRows: VisualizationRow[] = [];
  const cloisonsPresent = [...new Set(findings.map((f) => f.cloison))].sort();
  for (const clo of cloisonsPresent) {
    const inCloison = resolved.filter(({ f }) => f.cloison === clo);
    const cells: Record<string, string | number> = { cloison: cloisonLabel(clo) };
    for (const a of assertionsPresent) cells[a] = inCloison.filter(({ r }) => r.assertions.includes(a)).length;
    if (unresolvedCount) cells.non_resolue = inCloison.filter(({ r }) => r.basis === "unresolved").length;
    if (conformityCount) cells.conformite = inCloison.filter(({ r }) => r.basis === "file_conformity").length;
    heatmapRows.push({ id: clo, cells });
  }
  const riskHeatmap: VisualizationDataset = {
    id: "risk-heatmap",
    title: "Matrice des constats · cloison × assertion (NEP 500 §09)",
    summary: `${s.risk.totalFindings} constats répartis sur ${cloisonsPresent.length} cloison(s) et ${assertionsPresent.length} assertion(s) NEP 500 §09 ; ${unresolvedCount} constat(s) à l'assertion non résolue, ${conformityCount} contrôle(s) de conformité du fichier hors assertions. Un constat portant plusieurs assertions compte dans chacune ; une cellule vide signifie « aucun constat », pas « assertion couverte ».`,
    columns: [
      { key: "cloison", label: "Cloison" },
      ...assertionsPresent.map((a) => ({ key: a, label: assertionLabel(a), align: "right" as const })),
      ...(unresolvedCount ? [{ key: "non_resolue", label: "Non résolue", align: "right" as const }] : []),
      ...(conformityCount ? [{ key: "conformite", label: "Conformité du fichier (hors assertions)", align: "right" as const }] : []),
    ],
    rows: heatmapRows,
    sourceMetricIds: ["risk.heuristicSeverityIndex"],
    methodology:
      "Assertions de la NEP 500 §09 (flux, soldes, annexe), résolues par la règle du constat puis, à défaut, par l'effet financier explicite ; indépendantes du montant. Les signaux analytiques et seuils internes restent « non résolus » ; les contrôles d'admissibilité du FEC ne portent aucune assertion. Matrice de constats, pas de couverture : voir « Couverture des travaux ».",
    sourceRefs: [`${NEP_500_SOURCE.title}, ${NEP_500_SOURCE.section} — ${NEP_500_SOURCE.organisme}, ${NEP_500_SOURCE.url} (lu le ${NEP_500_SOURCE.consultedOn})`],
  };

  /* ── Waterfall d'exposition : un pont par poste et sens, puis l'effet sur le résultat ── */
  // Chaque pont se réconcilie au centime : détecté − répétitions − versions − hors agrégat − écarté = initial ;
  // initial − en attente − corrigé = non corrigé (proposé + résiduel). Aucun montant n'est additionné entre
  // postes ni entre sens ; seule la fin « effet sur le résultat » signe les sens du poste résultat (objet explicite).
  const e = s.exposure;
  const resultNet = e.netByTarget.find((n) => n.target === "resultat");
  const otherTargets = e.netByTarget.filter((n) => n.target !== "resultat");
  const clusterById = new Map(e.clusters.map((c) => [c.clusterId, c]));
  /** Déduction affichée : jamais de zéro négatif (« −0,00 € »). */
  const neg = (cents: number) => (cents === 0 ? 0 : -cents);
  const steps: WaterfallStep[] = [];
  for (const st of e.stages) {
    const group = effectStageLabel(st);
    const key = `${st.target}-${st.direction}`;
    const add = (step: Omit<WaterfallStep, "group">) => steps.push({ ...step, id: `${key}-${step.id}`, group });
    add({ id: "detected", label: "Effets explicites détectés", amountCents: st.detectedCents, kind: "start" });
    if (st.exactRepeatsCents) add({ id: "repeats", label: "Répétitions exactes (comptées une fois)", amountCents: neg(st.exactRepeatsCents), kind: "delta", note: "même identité économique et même contenu" });
    if (st.supersededCents) add({ id: "superseded", label: "Versions d'évaluation remplacées", amountCents: neg(st.supersededCents), kind: "delta", note: "succession de versions démontrée : seule la dernière version compte" });
    if (st.undeterminedCents) {
      const groups = st.indeterminateClusterIds.map((id) => clusterById.get(id)!);
      add({ id: "undetermined", label: `Groupes indéterminés (${groups.length}) hors agrégat`, amountCents: neg(st.undeterminedCents), kind: "delta", note: `conflit ou chevauchement sans allocation, détail conservé : ${groups.map((c) => `${c.findingIds.join(" / ")} bornes ${formatCents(c.boundsCents.minCents)} à ${formatCents(c.boundsCents.maxCents)}`).join(" ; ")}` });
    }
    add({ id: "dismissed", label: "Constats écartés en revue", amountCents: neg(st.dismissedCents), kind: "delta" });
    add({ id: "initial", label: "Exposition initiale", amountCents: st.initialCents, kind: "subtotal" });
    add({ id: "pending", label: "En attente d'arbitrage", amountCents: neg(st.pendingCents), kind: "delta", note: "ni confirmé ni écarté — hors ajustement à ce stade" });
    add({ id: "corrected", label: "Correction comptabilisée", amountCents: neg(st.correctedCents), kind: "delta", note: "hors anomalies non corrigées" });
    add({ id: "uncorrected", label: "Anomalies non corrigées", amountCents: st.proposedCents + st.residualCents, kind: "subtotal", note: `ajustement proposé ${formatCents(st.proposedCents)} + anomalie résiduelle après correction partielle ${formatCents(st.residualCents)}` });
  }
  const RESULT_GROUP = "Effet sur le résultat";
  const taxLabel = resultNet ? (resultNet.taxStatus === "known" ? "connu" : resultNet.taxStatus === "partial" ? "partiellement connu" : "inconnu") : "aucun ajustement";
  const scenarioIds = e.taxIncidence.computedFindingIds;
  const scenarioNote = scenarioIds.length ? ` ; scénario d'IS avant/après pour ${scenarioIds.join(", ")} (${e.taxIncidence.providerVersion})` : "";
  steps.push({ id: "uncorrected-resultat", group: RESULT_GROUP, label: "Anomalies non corrigées — résultat (signé)", amountCents: resultNet?.uncorrectedSignedCents ?? 0, kind: "start", note: `augmentations +, diminutions − du seul poste résultat${otherTargets.length ? ` ; ${otherTargets.map((n) => `${EFFECT_TARGET_LABEL[n.target]} ${formatCents(n.uncorrectedSignedCents)}`).join(", ")} : autres postes, non additionnés` : ""}` });
  steps.push({ id: "tax", group: RESULT_GROUP, label: `Effet d'impôt — résultat (${taxLabel})`, amountCents: resultNet && resultNet.taxStatus === "unknown" ? null : neg(resultNet?.taxKnownCents ?? 0), kind: "delta", note: !resultNet ? "aucun ajustement proposé ni anomalie résiduelle sur le résultat" : resultNet.taxStatus !== "known" ? `au moins un ajustement du résultat sans incidence fiscale établie (taux ou qualification absents, ou scénario d'IS non calculé)${scenarioNote}` : scenarioIds.length ? `incidence établie pour chaque effet du résultat${scenarioNote}` : "taux explicite et qualification fiscale pour chaque effet du résultat" });
  steps.push({ id: "net", group: RESULT_GROUP, label: "Effet net sur le résultat après impôt", amountCents: resultNet ? resultNet.netAfterKnownTaxCents : 0, kind: "total", note: resultNet && resultNet.netAfterKnownTaxCents === null ? `inconnu ; sous-total partiel sur les seuls effets qualifiés : ${formatCents(resultNet.partialNetKnownSubsetCents)}` : undefined });
  const undeterminedCount = e.clusters.filter((c) => c.status !== "determined").length;
  const bridgeSummary = e.stages.length
    ? e.stages.map((st) => `${effectStageLabel(st)} : détecté ${formatCents(st.detectedCents)}, exposition initiale ${formatCents(st.initialCents)}, anomalies non corrigées ${formatCents(st.proposedCents + st.residualCents)}${st.indeterminateClusterIds.length ? ` (${st.indeterminateClusterIds.length} groupe(s) indéterminé(s) hors agrégat)` : ""}`).join(" ; ")
    : "Aucun effet financier explicite";
  const netSummary = resultNet ? (resultNet.netAfterKnownTaxCents !== null ? formatCents(resultNet.netAfterKnownTaxCents) : "inconnu") : formatCents(0);
  const waterfall: SynthesisDatasets["waterfall"] = {
    id: "exposure-waterfall",
    title: "De l'exposition détectée à l'effet net",
    summary: `${bridgeSummary}. Postes et sens jamais additionnés entre eux${undeterminedCount ? ` ; ${undeterminedCount} groupe(s) à arbitrer` : ""}. Effet sur le résultat : anomalies non corrigées ${formatCents(resultNet?.uncorrectedSignedCents ?? 0)}, effet d'impôt ${resultNet ? (resultNet.taxStatus === "known" ? formatCents(resultNet.taxKnownCents) : taxLabel) : "sans objet"}, net après impôt ${netSummary}. ${e.findingsWithoutEffect.length} constat(s) sans effet financier explicite sont hors de ce graphique.`,
    columns: [
      { key: "groupe", label: "Poste et sens" },
      { key: "etape", label: "Étape" },
      { key: "montant", label: "Montant", unit: "€", align: "right" },
      { key: "note", label: "Note" },
    ],
    rows: steps.map((st) => ({
      id: st.id,
      cells: { groupe: st.group ?? "", etape: st.label, montant: st.amountCents === null ? "inconnu" : formatCents(st.amountCents), note: st.note ?? "" },
      emphasis: st.kind === "total" ? "positive" : st.kind === "subtotal" ? "muted" : undefined,
    })),
    steps,
    sourceMetricIds: [
      "exposure.determinedExposureCents",
      "exposure.netByTarget",
    ],
    methodology:
      "Montants en centimes entiers issus de la projection partagée des effets (lib/synthesis/exposure), la même que lisent la cartographie des risques et la revue par cloison. Seuls les constats portant un effet financier explicite contribuent. Un pont par poste et par sens : répétitions exactes comptées une fois ; même identité à contenus distincts retenue à sa dernière version démontrée, sinon conflit ; écritures partiellement communes sans allocation : indéterminé, hors agrégat, bornes et détail conservés ; une correction comptabilisée n'alimente jamais les anomalies non corrigées. Seul le poste résultat est signé (augmentations moins diminutions) pour l'effet net ; le net n'est établi que si chaque effet porte un taux explicite et une qualification fiscale, sinon il est inconnu et un sous-total partiel est nommé.",
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
    summary: `Répartition des ${s.risk.totalFindings} constats par cloison et exposition initiale par poste et sens (projection partagée : un groupe commun à deux cloisons figure dans chacune, les lignes ne s'additionnent pas).`,
    columns: [
      { key: "cloison", label: "Cloison" },
      ...SEVERITIES.map((sev) => ({ key: sev, label: SEVERITY_LABEL[sev], align: "right" as const })),
      { key: "exposition", label: "Exposition initiale (poste, sens)", align: "right" },
    ],
    rows: Object.entries(s.risk.matrix)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clo, row]) => {
        const scoped = restrictExposure(s.exposure, findings.filter((f) => f.cloison === clo).map((f) => f.id));
        const items = scopedEffectItems(scoped).map((it) => `${EFFECT_TARGET_LABEL[it.target]} ${it.sign} ${formatCents(it.initialCents)}`);
        if (scoped.indeterminateClusters.length) items.push(`${scoped.indeterminateClusters.length} groupe(s) indéterminé(s)`);
        return {
          id: clo,
          cells: {
            cloison: cloisonLabel(clo),
            ...Object.fromEntries(SEVERITIES.map((sev) => [sev, row?.[sev] ?? 0])),
            exposition: items.length ? items.join(" · ") : "—",
          },
          emphasis: (row?.bloquant ?? 0) > 0 ? ("critical" as const) : undefined,
        };
      }),
    sourceMetricIds: ["risk.heuristicSeverityIndex", "exposure.determinedExposureCents"],
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
    workCoverage,
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

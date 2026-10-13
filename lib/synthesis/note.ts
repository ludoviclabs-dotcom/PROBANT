/**
 * Générateur DÉTERMINISTE de note de synthèse — sans LLM.
 *
 * Entrée : un SynthesisSnapshot (+ métadonnées de société). Sortie : un
 * Markdown. Même snapshot ⇒ même note, au caractère près : chaque phrase est
 * une projection directe de champs du snapshot, aucune génération libre.
 *
 * Huit sections imposées : périmètre, qualité, couverture, constats,
 * exposition, travaux ouverts, limites, référentiels.
 */

import type { Societe } from "@/lib/canonical-model";
import { formatCents } from "./money";
import type { SynthesisSnapshot, Limitation } from "./types";

const SEVERITY_LABELS: [string, string][] = [
  ["bloquant", "bloquant(s)"],
  ["majeur", "majeur(s)"],
  ["mineur", "mineur(s)"],
  ["informatif", "informatif(s)"],
];

const TARGET_LABELS: Record<string, string> = { resultat: "Résultat", bilan_actif: "Bilan — actif", bilan_passif: "Bilan — passif", capitaux_propres: "Capitaux propres", presentation: "Présentation" };

const LIMITATION_LABEL: Record<Limitation["code"], string> = {
  limited_upload_comparison: "Comparaison limitée aux documents fournis",
  missing_document: "Document manquant",
  missing_evidence: "Preuve manquante",
  control_not_run: "Contrôle non exécuté",
  control_inconclusive: "Contrôle non conclusif",
  partial_coverage: "Couverture partielle",
  coverage_unqualified: "Couverture non qualifiée",
  parser_warning: "Avertissement de parsing",
  source_review_required: "Source en revue requise",
  exposure_indeterminate: "Exposition indéterminée",
  tax_incidence_unknown: "Incidence fiscale inconnue",
  internal_threshold: "Seuil interne non opposable",
  unsupported_format: "Format non pris en charge",
};

export function generateSynthesisNote(
  snapshot: SynthesisSnapshot,
  societe: Societe,
): string {
  const s = snapshot;
  const lines: string[] = [];
  const push = (l = "") => lines.push(l);

  push(`# Note de synthèse — ${societe.raisonSociale}`);
  push();
  push(`> Générée le ${s.generatedAt} par le moteur de Synthèse ${s.engineVersion}`);
  push(`> (génération déterministe, sans modèle de langage).`);
  push(`> Empreinte du snapshot : \`${s.snapshotHash}\``);
  push();

  /* 1. Périmètre */
  push(`## 1. Périmètre`);
  push();
  push(
    `Dossier \`${s.dossierId}\` — ${societe.raisonSociale}, SIREN ${societe.siren}, exercice ${societe.exercice}.`,
  );
  push(
    `${s.evidence.sourceDocuments.length} document(s) source, empreintes : ${
      s.sourceDocumentHashes.map((h) => `\`${h.slice(0, 12)}…\``).join(", ") || "aucune"
    }.`,
  );
  push();

  /* 2. Qualité (admissibilité) */
  push(`## 2. Qualité des données`);
  push();
  if (s.admissibility.status === "rejected") {
    push(
      `**Dossier non admissible** : ${s.admissibility.blockingCount} alerte(s) bloquante(s) d'admissibilité. Aucun résultat d'analyse ne doit être présenté comme fiable en l'état.`,
    );
  } else if (s.admissibility.status === "admissible_with_alerts") {
    push(
      `Admissible avec ${s.admissibility.alertFindingIds.length} alerte(s) non bloquante(s) d'admissibilité.`,
    );
  } else {
    push(`Admissible : aucune alerte d'admissibilité.`);
  }
  push();

  /* 3. Couverture */
  push(`## 3. Couverture`);
  push();
  push(
    `Écritures analysées : ${s.coverage.entriesAnalysed}/${s.coverage.entriesTotal} (ratio ${s.coverage.entriesRatio}). Contrôles conclus : ${s.coverage.controlsConcluded}/${s.coverage.controlsEligible} (ratio ${s.coverage.controlsRatio}).`,
  );
  push(
    s.coverage.status === "unqualified"
      ? "Couverture non qualifiée : aucun dénominateur qualifié (écritures non dénombrées ou contrôles comptés depuis les constats) ; aucun ratio n'est présenté."
      : s.coverage.status === "substantial"
      ? `Couverture substantielle.`
      : s.coverage.status === "partial"
        ? `**Couverture partielle** : les conclusions ne portent que sur la part analysée.`
        : `**Aucune couverture mesurable** : aucun verdict d'exploitabilité n'est prononcé.`,
  );
  push();

  /* 4. Constats */
  push(`## 4. Constats`);
  push();
  push(`${s.risk.totalFindings} constat(s) au total :`);
  push();
  for (const [key, label] of SEVERITY_LABELS) {
    push(`- ${s.risk.bySeverity[key as keyof typeof s.risk.bySeverity]} ${label}`);
  }
  push();
  push(
    `Répartition par nature : ${s.risk.byFamily.hardLaw} opposable(s) (droit dur), ${s.risk.byFamily.methodology} présomption(s) d'audit, ${s.risk.byFamily.internal} paramètre(s) interne(s).`,
  );
  push();

  /* 5. Exposition */
  push(`## 5. Exposition financière`);
  push();
  push(
    `Seuls les constats portant un effet financier explicite contribuent : ${
      s.risk.totalFindings - s.exposure.findingsWithoutEffect.length
    } contributeur(s), ${s.exposure.findingsWithoutEffect.length} constat(s) sans effet chiffré (exclus, listés en trace).`,
  );
  push();
  push(`| Agrégat | Montant |`);
  push(`|---|---|`);
  push(`| Exposition brute détectée | ${formatCents(s.exposure.grossDetectedExposureCents)} |`);
  push(`| Répétitions exactes (comptées une fois) | ${formatCents(s.exposure.exactRepeatsCents)} |`);
  push(`| Exposition déterminée | ${formatCents(s.exposure.determinedExposureCents)}${s.exposure.aggregationStatus === "indeterminate" ? ` (bornes totales ${formatCents(s.exposure.exposureBoundsCents.minCents)} à ${formatCents(s.exposure.exposureBoundsCents.maxCents)})` : ""} |`);
  push(`| Exposition revue | ${formatCents(s.exposure.reviewedExposureCents)} |`);
  push();
  push(`Effets par poste et par sens (jamais additionnés entre postes) :`);
  push();
  push(`| Poste | Sens | Initial | En attente | Proposé | Corrigé | Résiduel |`);
  push(`|---|---|---|---|---|---|---|`);
  for (const st of s.exposure.stages) {
    push(`| ${TARGET_LABELS[st.target]} | ${st.direction === "increase" ? "augmentation" : "diminution"} | ${formatCents(st.initialCents)} | ${formatCents(st.pendingCents)} | ${formatCents(st.proposedCents)} | ${formatCents(st.correctedCents)} | ${formatCents(st.residualCents)}${st.indeterminateClusterIds.length ? ` (+ ${st.indeterminateClusterIds.length} groupe(s) indéterminé(s))` : ""} |`);
  }
  if (s.exposure.stages.length === 0) push(`| — | — | — | — | — | — | — |`);
  push();
  for (const n of s.exposure.netByTarget) {
    push(
      `${TARGET_LABELS[n.target]} : ajustement proposé ${formatCents(n.proposedSignedCents)}, anomalies non corrigées ${formatCents(n.uncorrectedSignedCents)} ; incidence fiscale ${n.taxStatus === "known" ? "connue" : n.taxStatus === "partial" ? "partiellement connue" : "inconnue"} ; net après impôt ${n.netAfterKnownTaxCents === null ? `inconnu (sous-total partiel sur les seuls effets qualifiés : ${formatCents(n.partialNetKnownSubsetCents)})` : formatCents(n.netAfterKnownTaxCents)}.`,
    );
  }
  if (s.exposure.netByTarget.length > 0) push();
  const undetermined = s.exposure.clusters.filter((c) => c.status !== "determined");
  if (undetermined.length > 0) {
    push(
      `${undetermined.length} groupe(s) d'effets non déterminés (détail conservé, arbitrage humain requis) : ${undetermined
        .map((c) => `${c.findingIds.join(" / ")} — ${c.status === "conflict" ? "conflit" : "chevauchement"}, bornes ${formatCents(c.boundsCents.minCents)} à ${formatCents(c.boundsCents.maxCents)}`)
        .join(" ; ")}.`,
    );
    push();
  }

  /* 6. Travaux ouverts */
  push(`## 6. Travaux ouverts`);
  push();
  push(
    `Revue : ${s.review.reviewedCount}/${s.review.totalCount} constat(s) arbitré(s) (${s.review.pct} %).`,
  );
  const open = s.review.totalCount - s.review.reviewedCount;
  push(
    open > 0
      ? `${open} constat(s) restent à arbitrer.`
      : `Aucun constat en attente d'arbitrage.`,
  );
  if (s.evidence.findingsWithoutEvidenceChain.length > 0) {
    push(
      `${s.evidence.findingsWithoutEvidenceChain.length} constat(s) sans chaîne de preuve : ${s.evidence.findingsWithoutEvidenceChain.join(", ")}.`,
    );
  }
  push();

  /* 7. Limites */
  push(`## 7. Limites`);
  push();
  if (s.limitations.length === 0) {
    push(`Aucune limitation générée.`);
  } else {
    for (const lim of s.limitations) {
      push(`- **${LIMITATION_LABEL[lim.code]}** — ${lim.message}`);
    }
  }
  push();

  /* 8. Référentiels */
  push(`## 8. Référentiels et versions`);
  push();
  push(`| Élément | Version |`);
  push(`|---|---|`);
  push(`| Schéma du snapshot | ${s.schemaVersion} |`);
  push(`| Moteur de Synthèse | ${s.engineVersion} |`);
  push(`| Jeu de règles | ${s.ruleSetVersion} |`);
  push(`| Référentiel normatif | ${s.referenceSetVersion} |`);
  push(`| Politique d'agrégation | ${s.policyVersion} (${s.exposure.policy.policyId}) |`);
  push();
  push(
    `**Verdict : ${s.verdict.headline}.** ${s.verdict.detail}`,
  );
  push();

  return lines.join("\n");
}

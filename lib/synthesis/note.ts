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

const LIMITATION_LABEL: Record<Limitation["code"], string> = {
  missing_document: "Document manquant",
  control_not_run: "Contrôle non exécuté",
  control_inconclusive: "Contrôle non conclusif",
  partial_coverage: "Couverture partielle",
  parser_warning: "Avertissement de parsing",
  source_review_required: "Source en revue requise",
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
    s.coverage.status === "substantial"
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
  push(`| Exposition dédupliquée | ${formatCents(s.exposure.deduplicatedExposureCents)} |`);
  push(`| Exposition revue | ${formatCents(s.exposure.reviewedExposureCents)} |`);
  push(`| Ajustement validé | ${formatCents(s.exposure.validatedAdjustmentCents)} |`);
  push(`| Effet d'impôt | ${formatCents(s.exposure.taxEffectCents)} |`);
  push(`| Effet net sur les états financiers | ${formatCents(s.exposure.netFinancialStatementEffectCents)} |`);
  push();
  const ambiguous = s.exposure.clusters.filter((c) => c.ambiguous);
  if (ambiguous.length > 0) {
    push(
      `${ambiguous.length} cluster(s) d'effets ambigus (contribution conservatrice retenue, arbitrage humain requis) : ${ambiguous
        .map((c) => c.findingIds.join(" / "))
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

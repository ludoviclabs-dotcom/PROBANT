/**
 * Cœur heuristique du scoring de risque par cycle — assise doctrinale.
 *
 * Le modèle du risque d'audit (ISA 200/315/330) pose que le risque d'audit se
 * décompose en risque inhérent × risque de contrôle × risque de non-détection.
 * PROBANT projette cette doctrine sur quatre axes normalisés 0-100 :
 *
 *  - Gravité (ISA 320) : impact potentiel sur les états financiers, apprécié à
 *    l'aune de la matérialité. 100 % automatique, non ajustable.
 *  - Probabilité (ISA 315) : risque inhérent — probabilité d'anomalie
 *    significative. Auto + ajustement de jugement (historique, contrôle interne
 *    non dérivables des données).
 *  - Détectabilité (ISA 330) : capacité à détecter, INVERSE du risque de
 *    non-détection (score élevé = bonne détection = risque moindre). Auto +
 *    ajustement.
 *  - Exposition : exposition normative/réglementaire structurelle du cycle,
 *    calculable même sans constat (la fiche existe). 100 % automatique.
 *
 * Composite (criticité de type RPN, bornée [0,100]) :
 *   100 · (R^0.9 · P^0.7 · (1−D)^0.6 · (0.5+0.5·E))
 * où R, P, D, E sont les axes ramenés à [0,1]. La détectabilité entre en
 * (1−D) : mieux on détecte, plus le composite baisse. Ce composite est une
 * HEURISTIQUE interne jamais opposable (marqueur `isHeuristic`) : il hiérarchise
 * l'attention de l'auditeur, il ne conclut rien.
 *
 * « Non évalué » ≠ « 0 » : un cycle sans constat NI standard obligatoire a
 * `composite = null` (gris hachuré), jamais 0 (qui suggérerait à tort un risque
 * maîtrisé et prouvé). Sans constat mais avec standards obligatoires → partiel
 * (exposition normative seule).
 *
 * Fonctions PURES : aucun import React ni `fs`, aucun `Date.now()`.
 */

import type { Finding, FauxPositifRisk } from "@/lib/canonical-model/finding";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import type {
  AxisScore,
  CriticityBand,
  CycleRiskScore,
  EvaluationState,
  RiskAdjustment,
  RiskAxisId,
  RiskDriver,
  ScoreProvenance,
} from "./types";
import {
  ADJ_STEP,
  K_DENS,
  K_RISK,
  K_SEV,
  K_STD,
  WSEV,
} from "./types";

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Incidence chiffrée d'un constat en EUR (0 si l'unité n'est pas EUR). */
function findingInc(f: Finding): number {
  return f.mesure.unite === "EUR" ? Math.abs(f.mesure.constate - f.mesure.seuil) : 0;
}

/**
 * Contribution du risque de faux positif à la fiabilité d'un signal.
 * « faible » = signal robuste (pleine contribution), « élevé » = à confirmer.
 */
const FP_FIABILITE: Record<FauxPositifRisk, number> = {
  faible: 1,
  moyen: 0.6,
  eleve: 0.3,
};

function fauxPositifFiabilite(f: Finding): number {
  return f.fauxPositifRisk ? FP_FIABILITE[f.fauxPositifRisk] : FP_FIABILITE.moyen;
}

/**
 * Gravité (100 % auto). `0.6·gSeverity + 0.4·gIncidence`.
 *   gSeverity  = 100·ΣWSEV / (ΣWSEV + K_SEV)
 *   gIncidence = 100·clamp(Σ|constate−seuil| / significativité, 0, 3) / 3
 * Sans base de matérialité, la composante incidence est neutralisée et un
 * driver le signale (aucune base inventée).
 */
export function scoreGravite(
  findings: Finding[],
  materiality: MaterialityThresholds | null,
): AxisScore {
  const drivers: RiskDriver[] = [];

  const masse = findings.reduce((acc, f) => acc + WSEV[f.severity], 0);
  const gSeverity = masse > 0 ? (100 * masse) / (masse + K_SEV) : 0;

  if (findings.length > 0) {
    const bloquants = findings.filter((f) => f.severity === "bloquant");
    const majeurs = findings.filter((f) => f.severity === "majeur");
    drivers.push({
      label: "Masse de gravité des constats",
      detail:
        `${findings.length} constat(s) — ` +
        `${bloquants.length} bloquant(s), ${majeurs.length} majeur(s) ` +
        `(masse pondérée ${masse.toFixed(1)}).`,
      findingIds: findings.map((f) => f.id),
    });
  }

  let gIncidence = 0;
  if (materiality && materiality.significativite > 0) {
    const incFindings = findings.filter((f) => findingInc(f) > 0);
    const incidence = incFindings.reduce((acc, f) => acc + findingInc(f), 0);
    const ratio = clamp(incidence / materiality.significativite, 0, 3);
    gIncidence = (100 * ratio) / 3;
    if (incFindings.length > 0) {
      drivers.push({
        label: "Incidence chiffrée vs seuil de signification",
        detail:
          `Σ écarts ${Math.round(incidence).toLocaleString("fr-FR")} € ` +
          `contre seuil ${materiality.significativite.toLocaleString("fr-FR")} € ` +
          `(${materiality.source}) — ${(ratio * 100).toFixed(0)} % du seuil ` +
          `(plafonné à 300 %).`,
        findingIds: incFindings.map((f) => f.id),
      });
    }
  } else {
    drivers.push({
      label: "Seuil ISA 320 indisponible",
      detail:
        "Base de matérialité absente : composante d'incidence neutralisée, " +
        "aucune base inventée.",
      findingIds: [],
    });
  }

  const auto = clamp(0.6 * gSeverity + 0.4 * gIncidence, 0, 100);
  return {
    axis: "gravite",
    auto,
    adjustment: 0,
    value: auto,
    provenance: "auto",
    drivers,
  };
}

/**
 * Probabilité (auto, axe ajustable). Combine densité de constats, faisceau
 * d'indices, fiabilité (inverse du faux positif) et nombre de risques
 * inhérents/fraude déclarés dans la fiche cycle.
 */
export function scoreProbabilite(cycle: AuditCycle, findings: Finding[]): AxisScore {
  const drivers: RiskDriver[] = [];

  const densite = (100 * findings.length) / (findings.length + K_DENS);
  if (findings.length > 0) {
    drivers.push({
      label: "Densité de constats",
      detail: `${findings.length} constat(s) rattaché(s) à ce cycle.`,
      findingIds: findings.map((f) => f.id),
    });
  }

  const faisceauTotal = findings.reduce((acc, f) => acc + f.faisceau.length, 0);
  const faisceauScore = (100 * faisceauTotal) / (faisceauTotal + K_DENS);
  const faisceauFindings = findings.filter((f) => f.faisceau.length > 0);
  if (faisceauFindings.length > 0) {
    drivers.push({
      label: "Faisceau d'indices",
      detail: `${faisceauTotal} indice(s) cumulé(s) renforçant les constats.`,
      findingIds: faisceauFindings.map((f) => f.id),
    });
  }

  let fiabilite = 0;
  if (findings.length > 0) {
    const moyenne =
      findings.reduce((acc, f) => acc + fauxPositifFiabilite(f), 0) / findings.length;
    fiabilite = 100 * moyenne;
    const nonFaibles = findings.filter(
      (f) => f.fauxPositifRisk && f.fauxPositifRisk !== "faible",
    );
    drivers.push({
      label: "Fiabilité des signaux (inverse faux positif)",
      detail:
        `Fiabilité moyenne ${(moyenne * 100).toFixed(0)} % — ` +
        `${nonFaibles.length} constat(s) à confirmer.`,
      findingIds: findings.map((f) => f.id),
    });
  }

  const risquesInherents = cycle.risks.filter(
    (r) => r.category === "RISQUE_INHERENT" || r.category === "RISQUE_FRAUDE",
  );
  const risqueScore =
    (100 * risquesInherents.length) / (risquesInherents.length + K_RISK);
  if (risquesInherents.length > 0) {
    drivers.push({
      label: "Risques inhérents / fraude déclarés",
      detail:
        `${risquesInherents.length} risque(s) inhérent(s) ou de fraude ` +
        "documenté(s) dans la fiche cycle.",
      findingIds: [],
    });
  }

  const auto = clamp(
    0.4 * densite + 0.2 * faisceauScore + 0.2 * fiabilite + 0.2 * risqueScore,
    0,
    100,
  );
  return {
    axis: "probabilite",
    auto,
    adjustment: 0,
    value: auto,
    provenance: "auto",
    drivers,
  };
}

/**
 * Détectabilité (auto, axe ajustable, INVERSÉE). Score élevé = bonne détection.
 * Combine masse de preuve, part de constats issus du rapprochement, présence de
 * qualifications, dépassement de seuil confirmé et fiabilité des signaux.
 * Sans constat, la détectabilité n'est pas appréciable : renvoie 0 auto avec un
 * driver explicite (l'axe reste neutre au composite via P/R nuls).
 */
export function scoreDetectabilite(findings: Finding[]): AxisScore {
  const drivers: RiskDriver[] = [];

  if (findings.length === 0) {
    return {
      axis: "detectabilite",
      auto: 0,
      adjustment: 0,
      value: 0,
      provenance: "auto",
      drivers: [
        {
          label: "Détectabilité non appréciable",
          detail: "Aucun constat rattaché : la capacité de détection n'est pas mesurable.",
          findingIds: [],
        },
      ],
    };
  }

  const preuveTotal = findings.reduce((acc, f) => acc + f.preuve.length, 0);
  const preuveScore = (100 * preuveTotal) / (preuveTotal + K_DENS);
  const avecPreuve = findings.filter((f) => f.preuve.length > 0);
  if (avecPreuve.length > 0) {
    drivers.push({
      label: "Chaîne de preuve reconstituable",
      detail: `${preuveTotal} étape(s) de preuve documentée(s).`,
      findingIds: avecPreuve.map((f) => f.id),
    });
  }

  const rapprochement = findings.filter((f) => f.origine === "rapprochement");
  const partRapprochement = (100 * rapprochement.length) / findings.length;
  if (rapprochement.length > 0) {
    drivers.push({
      label: "Constats issus du rapprochement multi-documents",
      detail:
        `${rapprochement.length}/${findings.length} constat(s) confirmé(s) par ` +
        "confrontation de deux documents.",
      findingIds: rapprochement.map((f) => f.id),
    });
  }

  const qualifies = findings.filter((f) => f.qualification !== undefined);
  const partQualif = (100 * qualifies.length) / findings.length;
  if (qualifies.length > 0) {
    drivers.push({
      label: "Écarts qualifiés",
      detail: `${qualifies.length} constat(s) portent une qualification normée.`,
      findingIds: qualifies.map((f) => f.id),
    });
  }

  const depasse = findings.filter((f) => f.seuilApplique?.depasse === true);
  const partDepasse = (100 * depasse.length) / findings.length;
  if (depasse.length > 0) {
    drivers.push({
      label: "Dépassement de seuil confirmé",
      detail: `${depasse.length} constat(s) au-dessus du seuil de signification.`,
      findingIds: depasse.map((f) => f.id),
    });
  }

  const fiabiliteMoyenne =
    findings.reduce((acc, f) => acc + fauxPositifFiabilite(f), 0) / findings.length;
  const fiabilite = 100 * fiabiliteMoyenne;

  const auto = clamp(
    0.35 * preuveScore +
      0.2 * partRapprochement +
      0.15 * partQualif +
      0.1 * partDepasse +
      0.2 * fiabilite,
    0,
    100,
  );
  return {
    axis: "detectabilite",
    auto,
    adjustment: 0,
    value: auto,
    provenance: "auto",
    drivers,
  };
}

const HARDLAW_FAMILIES = new Set<AuditCycle["family"]>([
  "PASSIF_ENGAGEMENTS",
  "TRANSVERSAL",
]);

/**
 * Exposition (100 % auto). Exposition normative structurelle du cycle : famille
 * (les cycles à forte teneur réglementaire pèsent davantage), nombre de
 * standards obligatoires, cloison fiscale (`tva-fiscalite`). Calculable sans
 * constat : la fiche existe.
 */
export function scoreExposition(cycle: AuditCycle): AxisScore {
  const drivers: RiskDriver[] = [];

  const familyBase = HARDLAW_FAMILIES.has(cycle.family) ? 60 : 40;
  drivers.push({
    label: "Famille de cycle",
    detail:
      `Famille « ${cycle.family} » — socle d'exposition structurelle ` +
      `${familyBase}/100.`,
    findingIds: [],
  });

  const obligatoires = cycle.applicableStandards.filter(
    (s) => s.status === "OBLIGATOIRE",
  );
  const stdScore = 100 * (obligatoires.length / (obligatoires.length + K_STD));
  if (obligatoires.length > 0) {
    drivers.push({
      label: "Standards obligatoires applicables",
      detail: `${obligatoires.length} standard(s) au statut OBLIGATOIRE.`,
      findingIds: [],
    });
  }

  const fiscal = cycle.probantCloisons.includes("tva-fiscalite");
  const fiscalBonus = fiscal ? 15 : 0;
  if (fiscal) {
    drivers.push({
      label: "Cloison fiscale",
      detail: "Rattachement TVA & fiscalité — exposition réglementaire accrue.",
      findingIds: [],
    });
  }

  const auto = clamp(0.6 * familyBase + 0.4 * stdScore + fiscalBonus, 0, 100);
  return {
    axis: "exposition",
    auto,
    adjustment: 0,
    value: auto,
    provenance: "auto",
    drivers,
  };
}

/**
 * Composite heuristique borné [0,100] — MOYENNE GÉOMÉTRIQUE PONDÉRÉE des quatre
 * facteurs de risque (exposants sommant à 1) :
 *   100 · R^0.35 · P^0.25 · (1−D)^0.25 · Ê^0.15   avec Ê = 0.5 + 0.5·E
 *
 * Pourquoi pas un produit brut. La version précédente,
 * `100·R^0.9·P^0.7·(1−D)^0.6·(0.5+0.5E)`, avait des exposants dont la somme
 * dépassait 1 : multiplier quatre facteurs < 1 compressait mécaniquement le
 * résultat vers le bas (sur le dossier démo, aucun cycle ne dépassait ~21/100,
 * donc tous en bande « faible » — l'outil, censé HIÉRARCHISER le risque, ne
 * hiérarchisait plus rien). Une moyenne géométrique pondérée (agrégation
 * multicritère standard, exposants normalisés à 1) reste MONOTONE en chaque
 * facteur de risque et bornée [0,100], mais exploite toute l'échelle.
 *
 * Poids doctrinaux (somme = 1) : gravité 0.35 (impact, ISA 320), probabilité
 * 0.25 (risque inhérent, ISA 315), non-détection 0.25 (ISA 330, via 1−D car la
 * détectabilité est inversée), exposition 0.15. L'exposition passe par un
 * plancher `Ê = 0.5 + 0.5·E` : l'exposition structurelle contribue toujours
 * sans jamais annuler le composite à elle seule.
 *
 * Ces poids et cette forme relèvent du JUGEMENT : le composite est une
 * heuristique interne jamais opposable (`isHeuristic`). La calibration n'a PAS
 * été ajustée pour reproduire une distribution cible ; elle vise seulement une
 * agrégation défendable exploitant la pleine échelle. Extrêmes préservés :
 * tous facteurs au maximum → 100 ; gravité ou probabilité nulle → 0.
 */
export function composite(scores: Record<RiskAxisId, AxisScore>): number {
  const r = clamp(scores.gravite.value / 100, 0, 1);
  const p = clamp(scores.probabilite.value / 100, 0, 1);
  const d = clamp(scores.detectabilite.value / 100, 0, 1);
  const e = clamp(scores.exposition.value / 100, 0, 1);

  const eFloored = 0.5 + 0.5 * e;
  const raw =
    100 *
    Math.pow(r, 0.35) *
    Math.pow(p, 0.25) *
    Math.pow(1 - d, 0.25) *
    Math.pow(eFloored, 0.15);

  return clamp(raw, 0, 100);
}

/**
 * Bande de criticité dérivée d'un composite (null → « non_évalué »).
 * Bornes : faible [0,25[, modéré [25,55[, élevé [55,75[, critique [75,100].
 *
 * Le seuil « élevé » est à 55 (et non 50) : les composites d'un profil de
 * risque médian (facteurs ~50, détection moyenne) se situent autour de 50-54.
 * Les classer « élevé » sur-alarmerait ; « élevé » est réservé aux cycles dont
 * le composite dépasse nettement la médiane. Les bornes de bande relèvent du
 * jugement (le composite reste une heuristique interne non opposable) : ce
 * choix vise une hiérarchisation utile — une pyramide modéré > élevé — plutôt
 * qu'un classement massif en « élevé ».
 */
export function criticityBand(comp: number | null): CriticityBand {
  if (comp === null) return "non_évalué";
  if (comp >= 75) return "critique";
  if (comp >= 55) return "élevé";
  if (comp >= 25) return "modéré";
  return "faible";
}

/**
 * Applique l'ajustement additif borné à un axe ajustable, en clampant [0,100].
 * `value = clamp(auto + adjustment·ADJ_STEP, 0, 100)`. Les axes non ajustables
 * conservent `adjustment = 0` et `value = auto`.
 */
function applyAdjustment(axis: AxisScore, adjustment: number): AxisScore {
  const value = clamp(axis.auto + adjustment * ADJ_STEP, 0, 100);
  const provenance: ScoreProvenance = adjustment !== 0 ? "auto+ajusté" : "auto";
  return { ...axis, adjustment, value, provenance };
}

/**
 * Score complet d'un cycle. Combine les quatre axes automatiques, applique
 * l'ajustement de l'auditeur (probabilité, détectabilité uniquement), calcule le
 * composite et l'état d'évaluation.
 *
 * Distinction d'état :
 *   - non_évalué : 0 constat ET 0 standard obligatoire → composite = null.
 *   - partiel    : 0 constat MAIS ≥1 standard obligatoire → exposition seule.
 *   - évalué     : ≥1 constat rattaché.
 */
export function scoreCycle(
  cycle: AuditCycle,
  findings: Finding[],
  materiality: MaterialityThresholds | null,
  adjustment?: RiskAdjustment,
): CycleRiskScore {
  const gravite = scoreGravite(findings, materiality);
  const probabiliteAuto = scoreProbabilite(cycle, findings);
  const detectabiliteAuto = scoreDetectabilite(findings);
  const exposition = scoreExposition(cycle);

  const probabilite = applyAdjustment(
    probabiliteAuto,
    adjustment ? adjustment.probabilite : 0,
  );
  const detectabilite = applyAdjustment(
    detectabiliteAuto,
    adjustment ? adjustment.detectabilite : 0,
  );

  const hasStandardObligatoire = cycle.applicableStandards.some(
    (s) => s.status === "OBLIGATOIRE",
  );

  let evaluation: EvaluationState;
  if (findings.length > 0) {
    evaluation = "évalué";
  } else if (hasStandardObligatoire) {
    evaluation = "partiel";
  } else {
    evaluation = "non_évalué";
  }

  const axes: Record<RiskAxisId, AxisScore> =
    evaluation === "non_évalué"
      ? {
          gravite: { ...gravite, provenance: "non_évalué" },
          probabilite: { ...probabilite, provenance: "non_évalué" },
          detectabilite: { ...detectabilite, provenance: "non_évalué" },
          exposition: { ...exposition, provenance: "non_évalué" },
        }
      : {
          gravite,
          probabilite,
          detectabilite,
          exposition,
        };

  const comp = evaluation !== "évalué" ? null : composite(axes);

  return {
    cycleSlug: cycle.slug,
    family: cycle.family,
    axes,
    composite: comp,
    criticityBand: criticityBand(comp),
    evaluation,
    findingCount: findings.length,
    isHeuristic: true,
  };
}

import type { Finding, FinancialEffect } from "@/lib/canonical-model/finding";
import { CL_ASSERTIONS, CL_ASSERTION_GROUPS, CL_ASSERTION_LABELS, assertionGroup, type ClosingAssertion } from "@/lib/workpapers/closing-contract";

/**
 * Résolveur d'assertions — Mission C03.
 *
 * L'assertion d'un constat ne dépend plus de son effet financier : elle vient d'abord de la règle
 * qui l'a produit (objectif de contrôle), puis, à défaut, de l'effet financier explicite lorsque la
 * règle n'est pas connue. Un constat sans règle ni effet reste « non résolu » : son assertion n'est
 * pas présumée. Les contrôles de conformité du fichier (admissibilité FEC) ne portent aucune
 * assertion sur les comptes : ils sont classés à part, jamais dans une colonne d'assertion.
 *
 * Vocabulaire : les 13 assertions de la NEP 500 §09, en trois catégories, telles que déclarées par
 * `closing-contract.ts` (Mission 19) et relues sur le site de la H2A le 13/10/2026.
 */

/** Source officielle lue pour ce lot. Les dates d'application à un exercice donné restent à vérifier par le professionnel. */
export const NEP_500_SOURCE = {
  title: "NEP 500 — Caractère probant des éléments collectés",
  organisme: "H2A (Haute autorité de l'audit)",
  url: "https://h2a-france.org/normes/caractere-probant-des-elements-collectes/",
  section: "§09 (assertions, trois catégories)",
  homologation: "Arrêté du 28 décembre 2023, JO du 31 décembre 2023 (art. A. 821-74 du code de commerce)",
  consultedOn: "2026-10-13",
  nature: "Norme professionnelle (audit légal)",
} as const;

export type AssertionBasis = "rule" | "financial_effect" | "file_conformity" | "unresolved";

export interface AssertionResolution {
  /** Assertions NEP 500 §09 portées par le constat (plusieurs possibles). Vide si non résolu ou conformité du fichier. */
  assertions: ClosingAssertion[];
  basis: AssertionBasis;
  /** Objectif de contrôle en langage métier, lorsque la règle est connue. */
  objective: string | null;
  /** Explication courte de la résolution, affichable. */
  rationale: string;
}

interface RuleAssertionEntry { assertions: ClosingAssertion[]; objective: string; rationale: string }

/**
 * Correspondance règle → assertions. Chaque entrée dit pourquoi ; une règle absente de la table
 * n'est pas devinée. Les règles « signal analytique » ou « seuil interne » restent non résolues :
 * un indice ne désigne pas une assertion.
 */
export const RULE_ASSERTIONS: Record<string, RuleAssertionEntry> = {
  // Démonstration historique (lib/demo/dataset.ts) et moteur de règles (lib/rules-engine).
  "R-PCG-AMORT": { assertions: ["solde_evaluation"], objective: "Évaluation des immobilisations : continuité du plan d'amortissement", rationale: "Une rupture du plan modifie la valeur nette inscrite au bilan." },
  "R-PCG-PROV": { assertions: ["solde_exhaustivite", "solde_evaluation"], objective: "Exhaustivité et évaluation des provisions pour pertes", rationale: "Une perte probable non provisionnée est un passif absent ou sous-évalué." },
  "R-PCG-CCA": { assertions: ["flux_separation"], objective: "Rattachement des charges à la période", rationale: "Une charge non étalée est enregistrée sur la mauvaise période." },
  "R-ME-001": { assertions: ["flux_separation", "flux_realite"], objective: "Séparation des exercices et réalité des ventes de fin de période", rationale: "Des écritures tardives ou antidatées touchent la période et la réalité des opérations." },
  "R-ME-002": { assertions: ["flux_realite", "flux_mesure"], objective: "Réalité et mesure du chiffre d'affaires régularisé manuellement", rationale: "Des régularisations manuelles significatives peuvent enregistrer des opérations inexistantes ou mal mesurées." },
  "R-ME-003": { assertions: ["flux_separation", "flux_exhaustivite"], objective: "Rattachement des produits non encore facturés (compte 418)", rationale: "Un produit livré non facturé relève de la période et de l'exhaustivité des flux." },
  "R-IN-STOCK": { assertions: ["solde_evaluation"], objective: "Évaluation des stocks à rotation faible", rationale: "La dépréciation éventuelle porte sur le montant inscrit, pas sur l'existence." },
  "R-PCG-INCORP": { assertions: ["solde_existence", "solde_evaluation"], objective: "Conditions d'activation des frais de développement", rationale: "Sans conditions démontrées, l'actif n'a pas lieu d'être inscrit ou l'est pour un montant inapproprié." },
  "R-PCG-TITRES": { assertions: ["solde_evaluation"], objective: "Valeur d'inventaire des titres de participation", rationale: "Constat qualitatif de valorisation : l'assertion vient de la règle, pas d'un montant d'effet." },
  "R-PCG-CREANCES": { assertions: ["solde_evaluation"], objective: "Recouvrabilité d'une créance litigieuse échue", rationale: "Une créance litigieuse non dépréciée pose une question d'évaluation, pas de rattachement." },
  "R-ISA-CONFIRM": { assertions: ["solde_existence", "solde_exhaustivite"], objective: "Existence et exhaustivité des soldes bancaires", rationale: "Un écart de rapprochement non justifié peut cacher un solde inexistant ou un mouvement absent." },
  "R-CCOM-CAPITAL": { assertions: ["annexe_exhaustivite", "annexe_presentation"], objective: "Information requise lorsque les capitaux propres sont inférieurs à la moitié du capital", rationale: "L'obligation porte sur la décision et l'information données, pas sur un montant du bilan." },
  "R-PCG-CUTOFF-ACHATS": { assertions: ["flux_exhaustivite", "flux_separation"], objective: "Exhaustivité des charges à payer de fin d'exercice", rationale: "Des charges à payer sous-évaluées sont des flux absents de la bonne période." },
  "R-IN-CP": { assertions: ["solde_evaluation"], objective: "Évaluation de la provision pour congés payés", rationale: "Signal interne sur une estimation : l'assertion concernée est l'évaluation du passif, le signal ne la démontre pas." },
  "R-PCG-PCA": { assertions: ["flux_separation"], objective: "Rattachement des produits encaissés d'avance", rationale: "Un produit encaissé d'avance non neutralisé relève de la séparation des exercices." },
  "R-PCG-REPRISE": { assertions: ["solde_evaluation", "flux_realite"], objective: "Justification d'une reprise de provision", rationale: "Reprendre une provision sans extinction du risque sous-évalue le passif et enregistre un produit sans fondement." },
  "R-PCG-EXCEPTIONNEL": { assertions: ["flux_classification"], objective: "Classement des charges entre exploitation et exceptionnel", rationale: "Le constat porte sur le compte utilisé, pas sur la réalité ou le montant." },
  "R-PCG-ENGAGEMENTS": { assertions: ["annexe_exhaustivite"], objective: "Mention des engagements donnés en annexe", rationale: "L'information de l'annexe est incomplète." },
  // Scénarios de démonstration (lib/demo/scenarios.ts).
  "R-PCG-IMMO-INCORP": { assertions: ["solde_existence", "solde_evaluation"], objective: "Conditions d'activation des frais de recherche et développement", rationale: "Sans critères d'éligibilité démontrés, l'actif n'a pas lieu d'être inscrit ou l'est pour un montant inapproprié." },
  // C11 : référentiel français (PCG 512-4 et 513-3 ; ANC 2026-03 522-2 s'il régit le contrat), et non IFRS 15 par défaut.
  "R-ISA240-REVENU": { assertions: ["flux_realite", "flux_separation"], objective: "Reconnaissance du revenu à la livraison du bien ou à la réalisation de la prestation", rationale: "Un revenu enregistré avant la livraison ou la réalisation de la prestation est enregistré sans fait générateur ou sur la mauvaise période." },
  "R-PCG-PROVISIONS": { assertions: ["solde_exhaustivite", "solde_evaluation"], objective: "Exhaustivité et évaluation des provisions pour risques", rationale: "Un risque notifié non provisionné est un passif absent ou sous-évalué." },
  "R-PCG-DEPREC-STOCK": { assertions: ["solde_evaluation"], objective: "Dépréciation des articles sans mouvement", rationale: "La dépréciation porte sur le montant inscrit, pas sur l'existence." },
  "R-PCG-FNP": { assertions: ["flux_exhaustivite", "flux_separation"], objective: "Exhaustivité des factures non parvenues", rationale: "Des factures non parvenues sous-estimées sont des charges absentes de la bonne période." },
  "R-PCG-PROV-CP": { assertions: ["solde_evaluation"], objective: "Évaluation de la provision pour congés payés, charges incluses", rationale: "Une base incomplète sous-évalue le passif." },
  "R-INT-AMORT-REVISION": { assertions: ["solde_evaluation"], objective: "Révision des durées d'utilité", rationale: "Des durées non révisées peuvent fausser la valeur nette ; signal interne sur une estimation." },
  // Carte des événements transversaux (C11) : avoirs dont la cause précède la clôture.
  "R-PCG-AAE": { assertions: ["flux_separation", "flux_exhaustivite"], objective: "Rattachement des avoirs à établir (compte 4198)", rationale: "Une réduction de prix dont la cause précède la clôture diminue les produits de la période ; son omission surévalue le chiffre d'affaires." },
  "R-PCG-AAR": { assertions: ["flux_separation", "flux_exhaustivite"], objective: "Rattachement des avoirs à recevoir (compte 4098)", rationale: "Une réduction de prix obtenue dont la cause précède la clôture diminue les charges de la période." },
};

/** Écarts du rapprochement multi-documents (`R-RAPPRO-<qualification>`), par qualification de l'écart. */
export const RECONCILIATION_ASSERTIONS: Record<string, RuleAssertionEntry | null> = {
  rapprochement_solde: { assertions: ["solde_existence", "solde_exhaustivite"], objective: "Concordance des soldes entre les deux documents rapprochés", rationale: "Un écart de solde entre deux sources met en cause l'existence ou l'exhaustivité du solde." },
  perimetre: { assertions: ["solde_existence", "solde_exhaustivite"], objective: "Périmètre commun des deux documents rapprochés", rationale: "Un élément présent dans une seule source est soit inexistant, soit manquant dans l'autre." },
  lettrage: { assertions: ["solde_existence"], objective: "Lettrage des éléments rapprochés", rationale: "Un élément non lettré reste à démontrer comme solde existant." },
  anteriorite: { assertions: ["solde_evaluation"], objective: "Recouvrabilité des éléments anciens", rationale: "L'antériorité pose une question d'évaluation, pas d'existence." },
  provision_insuffisante: { assertions: ["solde_evaluation"], objective: "Évaluation de la dépréciation ou de la provision", rationale: "La provision comptabilisée est inférieure à l'appréciation documentée." },
  cutoff: { assertions: ["flux_separation"], objective: "Rattachement des éléments à la période", rationale: "L'écart tient à la période d'enregistrement." },
  valorisation: { assertions: ["solde_evaluation"], objective: "Valorisation des éléments rapprochés", rationale: "Les deux sources diffèrent sur le montant inscrit." },
  fiscal: { assertions: ["flux_mesure"], objective: "Mesure des bases et montants fiscaux rapprochés", rationale: "L'écart porte sur un montant déclaré contre un montant comptabilisé." },
  a_justifier: null,
};

/** Règles de conformité du fichier FEC (admissibilité) : aucune assertion sur les comptes. */
export const FILE_CONFORMITY_RULES = new Set(["R-HL-001", "R-HL-002", "R-HL-003", "R-HL-004", "R-HL-005", "R-HL-006", "R-HL-007", "R-HL-008", "R-HL-009", "R-HL-010"]);

/** Signaux analytiques et seuils internes : non résolus par construction (un indice ne désigne pas une assertion). */
export const SIGNAL_RULES = new Set(["R-IN-001", "R-IN-002", "R-IN-GEARING", "R-ISA-520-HONORAIRES", "R-ISA-520-FIN", "R-IN-MASSE-SAL"]);

/** Correspondance de l'ancien vocabulaire de l'effet financier vers la NEP 500 §09. */
export function assertionFromFinancialEffect(effect: Pick<FinancialEffect, "assertion" | "target">): ClosingAssertion {
  switch (effect.assertion) {
    case "existence": return "solde_existence";
    case "exhaustivite": return effect.target === "resultat" ? "flux_exhaustivite" : "solde_exhaustivite";
    case "exactitude": return "flux_mesure";
    case "evaluation": return "solde_evaluation";
    case "droits_obligations": return "solde_droits";
    case "presentation": return "annexe_presentation";
    case "rattachement": return "flux_separation";
  }
}

export function resolveAssertions(finding: Pick<Finding, "ruleId" | "financialEffect" | "family">): AssertionResolution {
  if (FILE_CONFORMITY_RULES.has(finding.ruleId)) {
    return { assertions: [], basis: "file_conformity", objective: "Conformité du fichier des écritures comptables", rationale: "Contrôle d'admissibilité du FEC : ne porte aucune assertion sur les comptes." };
  }
  const rule = RULE_ASSERTIONS[finding.ruleId] ?? (finding.ruleId.startsWith("R-RAPPRO-") ? RECONCILIATION_ASSERTIONS[finding.ruleId.slice("R-RAPPRO-".length)] : undefined);
  if (rule) return { assertions: rule.assertions, basis: "rule", objective: rule.objective, rationale: rule.rationale };
  if (finding.ruleId === "R-RAPPRO-a_justifier") {
    return { assertions: [], basis: "unresolved", objective: "Écart de rapprochement à justifier", rationale: "La nature de l'écart n'est pas qualifiée : aucune assertion n'est présumée avant justification." };
  }
  if (SIGNAL_RULES.has(finding.ruleId)) {
    return { assertions: [], basis: "unresolved", objective: null, rationale: "Signal analytique ou seuil interne : l'assertion n'est pas déterminée par la règle." };
  }
  if (finding.financialEffect) {
    return { assertions: [assertionFromFinancialEffect(finding.financialEffect)], basis: "financial_effect", objective: null, rationale: "Règle inconnue du résolveur : assertion reprise de l'effet financier explicite, à confirmer." };
  }
  return { assertions: [], basis: "unresolved", objective: null, rationale: "Règle inconnue et aucun effet financier explicite : assertion non résolue." };
}

export const ASSERTION_GROUP_LABELS: Record<"flux" | "solde" | "annexe", string> = Object.fromEntries(CL_ASSERTION_GROUPS.map(g => [g.id, g.label])) as Record<"flux" | "solde" | "annexe", string>;
export const ASSERTION_ORDER: readonly ClosingAssertion[] = CL_ASSERTIONS;
export const assertionLabelShort = (a: ClosingAssertion) => CL_ASSERTION_LABELS[a];
export const assertionCategory = (a: ClosingAssertion) => ASSERTION_GROUP_LABELS[assertionGroup(a)];

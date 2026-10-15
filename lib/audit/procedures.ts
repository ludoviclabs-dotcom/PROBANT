import type { Finding } from "@/lib/canonical-model/finding";
import { SILOS } from "@/lib/canonical-model/taxonomy";
import type { ClosingAssertion } from "@/lib/workpapers/closing-contract";
import { NEP_500_SOURCE, resolveAssertions, type AssertionResolution } from "./assertions";

/**
 * Résolveur de procédures — Mission C03.
 *
 * Une procédure complémentaire est proposée à partir de la règle du constat et de son objectif,
 * jamais du seul silo : deux constats Clients d'objectifs différents (créance litigieuse,
 * produit non facturé) reçoivent deux procédures différentes. Un constat dont la procédure n'est
 * pas connue reste « procédure à définir » : le résolveur rend ce qu'il sait (objectif, assertions,
 * population, source) et rien d'autre. Les références normatives sont celles lues sur le site de la
 * H2A ; leur applicabilité à l'exercice et au régime de la mission est rappelée, pas présumée.
 */

export type MissionRegime = "audit" | "examen_limite" | "non_renseigne";

export const REGIME_LABELS: Record<MissionRegime, string> = { audit: "Audit légal (NEP)", examen_limite: "Examen limité (NEP 2410)", non_renseigne: "Régime non renseigné" };

export interface NormativeReference { ref: string; title: string; section: string; url: string; applicability: string }

/** Références lues sur h2a-france.org le 13/10/2026. Les dates d'application à l'exercice restent à vérifier. */
export const REFERENCES = {
  nep500: { ref: "NEP 500 §09", title: NEP_500_SOURCE.title, section: NEP_500_SOURCE.section, url: NEP_500_SOURCE.url, applicability: NEP_500_SOURCE.homologation },
  nep501Inventaire: { ref: "NEP 501 §03-06", title: "NEP 501 — Caractère probant des éléments collectés, applications spécifiques", section: "§03-06 (inventaire physique)", url: "https://h2a-france.org/normes/caractere-probant-des-elements-collectes-applications-specifiques/", applicability: "Arrêté du 27 novembre 2024 (intitulé)" },
  nep501Litiges: { ref: "NEP 501 §07-08", title: "NEP 501 — Caractère probant des éléments collectés, applications spécifiques", section: "§07-08 (litiges et procès)", url: "https://h2a-france.org/normes/caractere-probant-des-elements-collectes-applications-specifiques/", applicability: "Arrêté du 27 novembre 2024 (intitulé)" },
  nep505: { ref: "NEP 505", title: "NEP 505 — Demandes de confirmation des tiers", section: "§04, §08-15", url: "https://h2a-france.org/normes/demandes-de-confirmation-des-tiers/", applicability: "Arrêté du 28 décembre 2023" },
  nep330: { ref: "NEP 330", title: "NEP 330 (révisée) — Procédures d'audit mises en œuvre à l'issue de l'évaluation des risques", section: "§08, §14-16, §19-23", url: "https://h2a-france.org/normes/procedures-daudit-mises-en-oeuvre-par-le-commissaire-aux-comptes-a-lissue-de-son-evaluation-des-risques/", applicability: "Exercices ouverts depuis le 19/11/2024" },
  nep2410: { ref: "NEP 2410 §08, §17-18", title: "NEP 2410 — Examen limité de comptes intermédiaires en application de dispositions légales ou réglementaires", section: "§08 (nature de l'examen limité), §17 (entretiens avec la direction), §18 (procédures analytiques)", url: "https://h2a-france.org/normes/examen-limite/", applicability: "Arrêté du 28 décembre 2023, JO du 31 décembre 2023 (art. A. 821-96 du code de commerce)" },
} as const satisfies Record<string, NormativeReference>;

export type ProcedureStatus = "resolved" | "to_define";

export interface ProcedureProposal {
  status: ProcedureStatus;
  /** Intitulé court de la procédure (ou « Procédure à définir »). */
  title: string;
  objective: string | null;
  assertions: ClosingAssertion[];
  assertionBasis: AssertionResolution["basis"];
  /** Population concernée : comptes et silo du constat, lignes source si connues. */
  population: { accounts: string[]; silo: string; sourceLines: number };
  /** Source normative du constat (telle que portée par la règle), jamais réécrite. */
  sourceOfFinding: { ref: string; effectiveDate: string; url?: string };
  /** Étapes proposées, vides si à définir. */
  steps: string[];
  /** Ce que le résolveur ne sait pas et laisse au professionnel. */
  leftToProfessional: string;
  references: NormativeReference[];
  /** Route de l'outil qui porte cette procédure, lorsqu'elle existe. */
  route: string | null;
}

interface ProcedureEntry { title: string; steps: string[]; references: NormativeReference[]; route?: string; leftToProfessional?: string }

const FILE_CONFORMITY_STEPS = (what: string) => [
  `Localiser : ${what} — les lignes concernées sont listées dans le constat (numéros de ligne du FEC).`,
  "Corriger à la source : dans le logiciel comptable ou l'export, jamais dans le fichier déposé.",
  "Redéposer le fichier corrigé et revalider l'admissibilité ; le constat ne se lève pas par un commentaire.",
];

/** Procédures connues, par règle. Les étapes sont des propositions ; aucune n'est une conclusion. */
export const RULE_PROCEDURES: Record<string, ProcedureEntry> = {
  "R-HL-004": { title: "Correction des dates hors format et revalidation", steps: FILE_CONFORMITY_STEPS("écritures dont EcritureDate n'est pas au format AAAAMMJJ"), references: [] },
  "R-HL-008": { title: "Correction des écritures déséquilibrées et revalidation", steps: FILE_CONFORMITY_STEPS("écritures dont la somme des débits diffère de la somme des crédits"), references: [] },
  "R-HL-001": { title: "Correction du nommage et revalidation", steps: FILE_CONFORMITY_STEPS("nom du fichier non conforme"), references: [] },
  "R-HL-002": { title: "Rubriques manquantes : correction et revalidation", steps: FILE_CONFORMITY_STEPS("rubriques obligatoires absentes"), references: [] },
  "R-HL-003": { title: "Ordre des rubriques : correction et revalidation", steps: FILE_CONFORMITY_STEPS("ordre des rubriques non conforme"), references: [] },
  "R-HL-005": { title: "Variante de montants : correction et revalidation", steps: FILE_CONFORMITY_STEPS("séparateur ou variante de montants indéterminée"), references: [] },
  "R-HL-006": { title: "Codification des comptes : rapprochement et revalidation", steps: FILE_CONFORMITY_STEPS("numéros de compte à rapprocher du plan comptable"), references: [] },
  "R-HL-007": { title: "Ordre de validation : justification et revalidation", steps: FILE_CONFORMITY_STEPS("écritures dont la date de validation n'est pas chronologique"), references: [] },
  "R-HL-009": { title: "Montants non numériques : correction et revalidation", steps: FILE_CONFORMITY_STEPS("montants non numériques ou lignes incomplètes"), references: [] },
  "R-HL-010": { title: "Reprise des soldes : identification et revalidation", steps: FILE_CONFORMITY_STEPS("absence d'écriture de reprise des soldes en tête"), references: [] },
  "R-PCG-CREANCES": { title: "Revue de recouvrabilité documentée", steps: [
    "Identifier la créance, son litige et les pièces : relances, courriers, position de l'avocat, échéancier éventuel.",
    "Apprécier la recouvrabilité à la clôture avec la direction et, le cas échéant, l'avocat (NEP 501 §07-08).",
    "Confronter l'appréciation à la dépréciation comptabilisée (compte 491) et documenter l'écart.",
    "Conclure par écrit : montant recouvrable retenu, pièce fondant la conclusion, écriture proposée ou maintien motivé.",
  ], references: [REFERENCES.nep500, REFERENCES.nep501Litiges] },
  "R-ME-003": { title: "Rattachement des produits non encore facturés", steps: [
    "Rapprocher les livraisons et prestations réalisées avant la clôture des factures émises après la clôture.",
    "Vérifier les factures à établir (compte 418) et leur contrepartie en produits de la période.",
    "Contrôler le cut-off : date du fait générateur contre date de facturation et d'enregistrement.",
  ], references: [REFERENCES.nep500], route: "/cutoff" },
  "R-ME-001": { title: "Test de séparation des exercices sur les ventes de fin de période", steps: [
    "Rapprocher les dates d'écriture des ventes de fin de période des bons de livraison ou de prestation.",
    "Inspecter les écritures manuelles de fin de période sur les comptes 70x : auteur, date de validation, pièce.",
    "Documenter chaque vente antidatée ou postdatée et son effet sur la période.",
  ], references: [REFERENCES.nep500], route: "/cutoff" },
  "R-ME-002": { title: "Analyse des régularisations manuelles du chiffre d'affaires", steps: [
    "Lister les régularisations manuelles sur comptes 70x et leurs pièces justificatives.",
    "Vérifier pour chacune la réalité de l'opération et son montant.",
  ], references: [REFERENCES.nep500] },
  "R-PCG-AMORT": { title: "Continuité du plan d'amortissement", steps: [
    "Rapprocher le plan d'amortissement N et N-1 par catégorie d'actif.",
    "Obtenir la justification du changement de plan et vérifier la note en annexe.",
  ], references: [REFERENCES.nep500], route: "/immobilisations" },
  "R-PCG-PROV": { title: "Perte à terminaison et provision", steps: [
    "Obtenir le suivi des contrats à marge et recalculer la perte à terminaison.",
    "Confirmer l'engagement ferme et la probabilité de sortie de ressources.",
    "Rapprocher la provision comptabilisée du registre des risques.",
  ], references: [REFERENCES.nep500], route: "/provisions" },
  "R-PCG-CCA": { title: "Recalcul de l'étalement des charges constatées d'avance", steps: [
    "Recalculer l'étalement prorata temporis des charges payées d'avance à partir des contrats.",
  ], references: [REFERENCES.nep500] },
  "R-IN-STOCK": { title: "Test de dépréciation des références à rotation faible", steps: [
    "Sélectionner les références à rotation faible et obtenir leur coût et leur valeur de réalisation.",
    "Apprécier la dépréciation nécessaire ; rapprocher de l'inventaire physique si disponible (NEP 501 §03-06).",
  ], references: [REFERENCES.nep500, REFERENCES.nep501Inventaire], route: "/stocks" },
  "R-PCG-INCORP": { title: "Conditions d'activation des frais de développement", steps: [
    "Obtenir la démonstration des conditions d'activation prévues par la source du constat (faisabilité, intention, ressources, avantages attendus).",
    "Apprécier, pour chaque projet activé, si les conditions sont documentées à la date d'activation.",
  ], references: [REFERENCES.nep500], route: "/immobilisations" },
  "R-PCG-TITRES": { title: "Dossier de valeur des titres de participation", steps: [
    "Obtenir les derniers comptes de la filiale, ses capitaux propres et ses perspectives.",
    "Comparer la valeur d'inventaire retenue et le coût d'acquisition ; apprécier la dépréciation.",
    "Documenter la méthode de valeur retenue et ses sources ; aucun montant n'est fixé par cette procédure.",
  ], references: [REFERENCES.nep500], route: "/participations" },
  "R-ISA-CONFIRM": { title: "Confirmation bancaire et apurement du rapprochement", steps: [
    "Obtenir le relevé ou la confirmation bancaire à la clôture (NEP 505).",
    "Rapprocher et apurer les éléments en suspens ; justifier chaque écart résiduel.",
  ], references: [REFERENCES.nep505, REFERENCES.nep500], route: "/tresorerie" },
  "R-CCOM-CAPITAL": { title: "Décision et information requises par le Code de commerce", steps: [
    "Vérifier l'existence et le délai de la décision de l'assemblée prévue par la source du constat.",
    "Vérifier l'information donnée en annexe et les formalités accomplies.",
  ], references: [REFERENCES.nep500], route: "/capitaux-propres", leftToProfessional: "La question de la continuité d'exploitation relève d'une appréciation distincte, non couverte par cette procédure." },
  "R-PCG-CUTOFF-ACHATS": { title: "Exhaustivité des charges à payer", steps: [
    "Examiner les factures reçues et les paiements effectués après la clôture ; rattacher ceux qui concernent l'exercice.",
    "Rapprocher les bons de réception non facturés des factures non parvenues (compte 408).",
  ], references: [REFERENCES.nep500], route: "/payables" },
  "R-IN-CP": { title: "Recalcul de la provision pour congés payés", steps: [
    "Obtenir les droits acquis à la clôture par salarié et les bases de charges.",
    "Recalculer la provision et comparer au montant comptabilisé ; expliquer l'écart.",
  ], references: [REFERENCES.nep500], route: "/paie-personnel/conges" },
  "R-PCG-PCA": { title: "Rattachement des produits encaissés d'avance", steps: [
    "Identifier les encaissements d'avance et la période de la prestation correspondante.",
    "Vérifier la neutralisation en produits constatés d'avance (compte 487).",
  ], references: [REFERENCES.nep500] },
  "R-PCG-REPRISE": { title: "Justification de la reprise de provision", steps: [
    "Obtenir la pièce établissant l'extinction ou la réduction du risque avant la reprise.",
    "Rapprocher la reprise du registre des risques et de l'annexe.",
  ], references: [REFERENCES.nep500], route: "/provisions" },
  "R-PCG-EXCEPTIONNEL": { title: "Revue de classement par événement", steps: [
    "Qualifier chaque événement enregistré en exceptionnel selon le référentiel applicable à l'exercice.",
    "Reclasser, le cas échéant, les charges récurrentes en exploitation et documenter la décision.",
  ], references: [REFERENCES.nep500], route: "/resultat-exceptionnel" },
  "R-PCG-IMMO-INCORP": { title: "Conditions d'activation des frais de recherche et développement", steps: [
    "Obtenir, projet par projet, la démonstration des critères d'éligibilité prévus par la source du constat.",
    "Apprécier si les critères sont documentés à la date d'activation ; sinon, proposer la correction.",
  ], references: [REFERENCES.nep500], route: "/immobilisations" },
  "R-ISA240-REVENU": { title: "Revue de la reconnaissance du revenu à la livraison ou à la réalisation de la prestation", steps: [
    "Lire les contrats concernés : biens et services vendus, période de service, date de conclusion ou de renouvellement (le champ d'ANC 2026-03 en dépend).",
    "Rapprocher le revenu enregistré des livraisons et prestations réellement réalisées à la clôture ; isoler la part à différer en produits constatés d'avance (487).",
    "Documenter le fait générateur retenu, le texte français applicable à l'exercice et au contrat, et l'effet sur la période.",
  ], references: [REFERENCES.nep500], route: "/cutoff" },
  "R-PCG-PROVISIONS": { title: "Risque notifié et provision", steps: [
    "Obtenir la notification, les échanges avec le tiers et, le cas échéant, la position de l'avocat (NEP 501 §07-08).",
    "Apprécier l'obligation à la clôture et son estimation ; rapprocher du registre des risques.",
    "Documenter la conclusion et l'écriture proposée ou le maintien motivé.",
  ], references: [REFERENCES.nep500, REFERENCES.nep501Litiges], route: "/provisions" },
  "R-PCG-DEPREC-STOCK": { title: "Dépréciation des articles sans mouvement", steps: [
    "Lister les articles sans mouvement et obtenir leur coût et leur valeur de réalisation.",
    "Apprécier la dépréciation nécessaire ; rapprocher de l'inventaire physique si disponible (NEP 501 §03-06).",
  ], references: [REFERENCES.nep500, REFERENCES.nep501Inventaire], route: "/stocks" },
  "R-PCG-FNP": { title: "Exhaustivité des factures non parvenues", steps: [
    "Examiner les factures reçues et les paiements effectués après la clôture ; rattacher ceux qui concernent l'exercice.",
    "Rapprocher les bons de réception non facturés des factures non parvenues (compte 408).",
  ], references: [REFERENCES.nep500], route: "/payables" },
  "R-PCG-PROV-CP": { title: "Recalcul de la provision pour congés payés, charges incluses", steps: [
    "Obtenir les droits acquis à la clôture par salarié et les bases de charges patronales applicables.",
    "Recalculer la provision charges incluses et comparer au montant comptabilisé ; expliquer l'écart.",
  ], references: [REFERENCES.nep500], route: "/paie-personnel/conges" },
  "R-INT-AMORT-REVISION": { title: "Révision des durées d'utilité", steps: [
    "Obtenir la politique d'amortissement et les éléments techniques sur l'utilisation réelle des équipements.",
    "Apprécier si une révision des durées s'impose ; documenter la décision et son effet prospectif.",
  ], references: [REFERENCES.nep500], route: "/immobilisations", leftToProfessional: "Signal interne : la révision des estimations relève de la direction et de son appréciation par le professionnel." },
  "R-PCG-AAE": { title: "Rattachement des avoirs à établir", steps: [
    "Rapprocher les avoirs émis après la clôture de leur cause (retour, défaut, accord commercial) et de sa date.",
    "Pour une cause antérieure à la clôture, vérifier l'avoir à établir (4198) et sa contrepartie (709, TVA 44587) ; pour une cause postérieure, aucun rattachement.",
    "Documenter le montant retenu et la pièce de la cause ; la grille ne fixe aucun montant probable à la place du professionnel.",
  ], references: [REFERENCES.nep500], route: "/cutoff" },
  "R-PCG-AAR": { title: "Rattachement des avoirs à recevoir", steps: [
    "Rapprocher les avoirs fournisseurs reçus après la clôture de leur cause et de sa date.",
    "Pour une cause antérieure à la clôture, vérifier l'avoir à recevoir (4098) et sa contrepartie (609 à 629, TVA 44586).",
  ], references: [REFERENCES.nep500], route: "/cutoff" },
  "R-PCG-ENGAGEMENTS": { title: "Recensement des engagements donnés", steps: [
    "Recenser cautions, garanties et engagements donnés auprès de la direction, des banques et des contrats.",
    "Vérifier leur mention en annexe.",
  ], references: [REFERENCES.nep500], route: "/provisions" },
};

/** Écart qualifié du rapprochement multi-documents : la procédure suit la qualification ; l'écart « à justifier » reste à définir. */
const RECONCILIATION_PROCEDURE: ProcedureEntry = {
  title: "Analyse de l'écart de rapprochement qualifié",
  steps: [
    "Retrouver, dans chacun des deux documents rapprochés, les lignes à l'origine de l'écart et leurs pièces.",
    "Confirmer la qualification de l'écart (périmètre, lettrage, antériorité, provision, cut-off, valorisation, fiscal) ou la corriger.",
    "Corriger la source ou documenter la justification ; relancer le rapprochement sur les documents corrigés.",
  ],
  references: [REFERENCES.nep500],
  route: "/dashboard/depot",
};

export function resolveProcedure(finding: Pick<Finding, "ruleId" | "financialEffect" | "family" | "comptesConcernes" | "siloId" | "lignesSource" | "source">): ProcedureProposal {
  const assertion = resolveAssertions(finding);
  const silo = SILOS.find(s => s.id === finding.siloId)?.label ?? finding.siloId;
  const population = { accounts: finding.comptesConcernes, silo, sourceLines: finding.lignesSource.length };
  const sourceOfFinding = { ref: finding.source.ref, effectiveDate: finding.source.effectiveDate, url: finding.source.url };
  const entry = RULE_PROCEDURES[finding.ruleId] ?? (finding.ruleId.startsWith("R-RAPPRO-") && finding.ruleId !== "R-RAPPRO-a_justifier" ? RECONCILIATION_PROCEDURE : undefined);
  if (!entry) {
    return {
      status: "to_define", title: "Procédure à définir", objective: assertion.objective, assertions: assertion.assertions, assertionBasis: assertion.basis, population, sourceOfFinding,
      steps: [], references: assertion.assertions.length ? [REFERENCES.nep500] : [], route: null,
      leftToProfessional: assertion.basis === "unresolved"
        ? "Aucune procédure connue pour cette règle : le professionnel définit la réponse au risque à partir du constat, des comptes et de la source, sans procédure générique."
        : "Assertion connue mais procédure non définie pour cette règle : la réponse reste à concevoir par le professionnel.",
    };
  }
  return {
    status: "resolved", title: entry.title, objective: assertion.objective, assertions: assertion.assertions, assertionBasis: assertion.basis, population, sourceOfFinding,
    steps: entry.steps, references: entry.references, route: entry.route ?? null,
    leftToProfessional: entry.leftToProfessional ?? "Les étapes sont des propositions : étendue, échantillon et conclusion relèvent du professionnel.",
  };
}

/** Références de régime affichées en tête de la page Tests ; rien n'est présumé sur le régime de la mission. */
export function regimeReferences(regime: MissionRegime, exercice: string): { label: string; note: string; references: NormativeReference[] } {
  const period = `Exercice ${exercice} : vérifier l'applicabilité de chaque texte à cet exercice (dates d'homologation ci-dessous, lues sur h2a-france.org le ${NEP_500_SOURCE.consultedOn}).`;
  if (regime === "audit") return { label: REGIME_LABELS.audit, note: `Les procédures proposées répondent à l'évaluation des risques (NEP 330) ; les assertions suivent la NEP 500 §09. ${period}`, references: [REFERENCES.nep330, REFERENCES.nep500] };
  if (regime === "examen_limite") return { label: REGIME_LABELS.examen_limite, note: `En examen limité, la norme repose essentiellement sur des entretiens avec la direction et des procédures analytiques (NEP 2410 §08, §17-18) ; les tests de détail proposés ci-dessous ne sont pas requis par la norme et restent un choix du professionnel. ${period}`, references: [REFERENCES.nep2410] };
  return { label: REGIME_LABELS.non_renseigne, note: `Le régime de la mission (audit légal ou examen limité) n'est pas renseigné dans ce dossier : les références de l'audit (NEP 330, NEP 500) et de l'examen limité (NEP 2410) sont rappelées sans en présumer. ${period}`, references: [REFERENCES.nep330, REFERENCES.nep500, REFERENCES.nep2410] };
}

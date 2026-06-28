import type { SourceNormative } from "@/lib/canonical-model";

/**
 * Référentiel normatif versionné.
 *
 * IMPORTANT : ce registre est la SEULE source de vérité des références et
 * citations utilisées par le moteur. Il est versionné (REFERENTIEL_VERSION)
 * et doit être revu avant toute mise en production — en particulier les
 * seuils chiffrés externes (catégories d'entreprises, nomination CAC, etc.)
 * qui doivent être confrontés au Code de commerce et à ses décrets en vigueur.
 *
 * Les citations sont des paraphrases fidèles destinées à l'affichage ; elles
 * ne se substituent pas au texte officiel opposable.
 */

export const REFERENTIEL_VERSION = "2024-01-01";

type SourceKey =
  | "LPF_A47A1"
  | "PCG_STRUCTURE"
  | "PCG_PERMANENCE"
  | "PCG_CUTOFF_418"
  | "PCG_CCA_PCA"
  | "PCG_AMORTISSEMENT"
  | "PCG_DEPRECIATION_STOCK"
  | "PCG_PROVISIONS"
  | "PCG_ERREURS"
  | "ISA_240"
  | "ISA_315"
  | "ISA_320"
  | "ISA_330"
  | "ISA_500"
  | "ISA_520"
  | "ISRE_2400";

export const SOURCES: Record<SourceKey, SourceNormative> = {
  LPF_A47A1: {
    ref: "LPF art. A.47 A-1",
    citation:
      "Les écritures comptables sont remises sous forme de fichiers à plat ou structurés, comportant 18 zones obligatoires dans l'ordre prescrit (JournalCode … Idevise). Les dates sont au format AAAAMMJJ, les montants en caractères sans séparateur de milliers, avec un séparateur de champ unique et non ambigu. Le fichier est unique par exercice, classé par ordre chronologique de validation, et nommé SirenFECAAAAMMJJ.",
    effectiveDate: "2014-01-01",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027803478",
  },
  PCG_STRUCTURE: {
    ref: "PCG art. 932-1",
    citation:
      "Les opérations sont réparties en huit classes de comptes : classes 1 à 5 au bilan, classes 6 et 7 au compte de résultat. Le numéro de compte doit respecter la codification du plan comptable général.",
    effectiveDate: "2024-01-01",
    url: "https://www.anc.gouv.fr/",
  },
  PCG_PERMANENCE: {
    ref: "PCG art. 121-5",
    citation:
      "La cohérence et la comparabilité des informations comptables impliquent la permanence des méthodes d'évaluation et de présentation d'un exercice à l'autre. Un changement n'est admis que s'il conduit à une meilleure information financière ou est imposé par la réglementation.",
    effectiveDate: "2024-01-01",
  },
  PCG_CUTOFF_418: {
    ref: "PCG cpt. 418",
    citation:
      "Le compte 418 « Clients - Produits non encore facturés » enregistre, à la clôture, les créances imputables à la période close dont les pièces justificatives ne sont pas encore établies. Il est contre-passé à l'ouverture de l'exercice suivant (rattachement des produits au bon exercice).",
    effectiveDate: "2024-01-01",
  },
  PCG_CCA_PCA: {
    ref: "PCG cpt. 486/487",
    citation:
      "Les charges constatées d'avance (486) et produits constatés d'avance (487) permettent de rattacher à l'exercice les seules charges et produits le concernant. Les charges/produits enregistrés mais relatifs à un exercice ultérieur en sont exclus.",
    effectiveDate: "2024-01-01",
  },
  PCG_AMORTISSEMENT: {
    ref: "PCG art. 214-13",
    citation:
      "Le plan d'amortissement est défini à la date d'entrée du bien selon le rythme de consommation des avantages économiques attendus. Sa modification suppose un changement justifié et documenté, à effet prospectif (changement d'estimation) ou rétrospectif (changement de méthode) selon sa nature.",
    effectiveDate: "2024-01-01",
  },
  PCG_DEPRECIATION_STOCK: {
    ref: "PCG art. 214-19 / 343-x",
    citation:
      "À l'inventaire, les stocks sont évalués unité par unité ou catégorie par catégorie. Une dépréciation est constatée lorsque la valeur actuelle devient inférieure à la valeur nette comptable.",
    effectiveDate: "2024-01-01",
  },
  PCG_PROVISIONS: {
    ref: "PCG art. 322-1 / 312-x",
    citation:
      "Une provision est comptabilisée lorsqu'il existe une obligation à l'égard d'un tiers à la clôture, dont il est probable ou certain qu'elle provoquera une sortie de ressources sans contrepartie au moins équivalente. Une perte sur contrat est provisionnée dès qu'elle devient probable.",
    effectiveDate: "2024-01-01",
  },
  PCG_ERREURS: {
    ref: "PCG art. 122-x",
    citation:
      "Les corrections d'erreurs résultent d'erreurs, d'omissions matérielles ou d'interprétations erronées. L'incidence des corrections significatives est présentée distinctement ; les changements d'estimation n'affectent que l'exercice en cours et les exercices futurs.",
    effectiveDate: "2024-01-01",
  },
  ISA_240: {
    ref: "ISA 240",
    citation:
      "L'auditeur retient une présomption de risque de fraude dans la reconnaissance du revenu et porte une attention spécifique aux écritures de journal et ajustements inhabituels, notamment ceux passés en fin de période ou hors processus standard.",
    effectiveDate: "2021-12-15",
  },
  ISA_315: {
    ref: "ISA 315 (révisée)",
    citation:
      "L'auditeur identifie et évalue les risques d'anomalies significatives par la connaissance de l'entité et de son environnement, y compris son contrôle interne.",
    effectiveDate: "2021-12-15",
  },
  ISA_320: {
    ref: "ISA 320",
    citation:
      "Le caractère significatif (matérialité) est déterminé en fonction des besoins d'information des utilisateurs ; un seuil de matérialité et, le cas échéant, des seuils de signification pour des flux particuliers sont fixés et révisés.",
    effectiveDate: "2009-12-15",
  },
  ISA_330: {
    ref: "ISA 330",
    citation:
      "L'auditeur conçoit et met en œuvre des réponses aux risques évalués, y compris des contrôles de substance, afin d'obtenir des éléments probants suffisants et appropriés.",
    effectiveDate: "2009-12-15",
  },
  ISA_500: {
    ref: "ISA 500",
    citation:
      "L'auditeur réunit des éléments probants suffisants et appropriés pour fonder ses conclusions ; la pertinence et la fiabilité de l'information utilisée comme élément probant sont appréciées.",
    effectiveDate: "2009-12-15",
  },
  ISA_520: {
    ref: "ISA 520",
    citation:
      "Les procédures analytiques consistent à apprécier l'information financière par l'étude de corrélations plausibles ; un écart significatif par rapport aux valeurs attendues fait l'objet d'investigations.",
    effectiveDate: "2009-12-15",
  },
  ISRE_2400: {
    ref: "ISRE 2400 (révisée)",
    citation:
      "La mission d'examen limité fournit une assurance limitée, obtenue principalement par des demandes d'informations et des procédures analytiques. Tout élément laissant penser à une anomalie significative déclenche des procédures complémentaires.",
    effectiveDate: "2013-12-31",
  },
};

/**
 * Seuils internes versionnés (registre house-style).
 *
 * Ces valeurs sont des PARAMÈTRES INTERNES PROBANT (famille `internal`),
 * pas des seuils réglementaires. Elles servent à hiérarchiser la vigilance.
 */
export const SEUILS_INTERNES = {
  /** Matérialité par défaut, en % du total bilan. */
  materialitePctBilan: 1.0,
  /** Matérialité par défaut, en % du chiffre d'affaires. */
  materialitePctCA: 0.5,
  /** Variation de CA jugée atypique d'un exercice à l'autre (%). */
  variationCaAtypiquePct: 25,
  /** Écart de taux d'amortissement jugé significatif (points). */
  ecartTauxAmortPts: 5,
  /** Nb de jours avant clôture où une écriture manuelle devient « tardive ». */
  fenetreEcritureTardiveJours: 5,
  /** Seuil de faisceau : nb de signaux concordants pour élever la gravité. */
  faisceauSeuilSignaux: 3,
} as const;

export type SeuilsInternes = typeof SEUILS_INTERNES;

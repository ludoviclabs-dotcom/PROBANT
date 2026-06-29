import type { SiloView, Finding, ReconstitutedStatement } from "@/lib/canonical-model";
import { SOURCES } from "@/lib/referentiel/sources";
import { DEMO_DOSSIER } from "./dataset";

export interface ScenarioMeta {
  id: string;
  label: string;
  secteur: string;
  forme: string;
  siren: string;
  exercice: string;
  description: string;
  anomaliesCount: number;
  risquesDominants: string[];
  silos: SiloView[];
}

function stmt(s: ReconstitutedStatement): ReconstitutedStatement {
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCÉNARIO 1 — STARTUP TECH
   SAS logicielle B2B, 4 ans d'existence, SIREN fictif
   Risques : activation R&D, reconnaissance CA SaaS, provisions sociales
   ═══════════════════════════════════════════════════════════════════════════ */

const findStartupRD: Finding = {
  id: "STARTUP-INCORP-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-IMMO-INCORP",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "immobilisations-incorporelles",
  titre: "Frais R&D activés sans justification des critères d'éligibilité",
  constat:
    "350 000 € de frais de développement sont inscrits à l'actif sans que les six critères du PCG art. 212-3 (faisabilité technique, intention d'achever, ressources disponibles, avantages économiques futurs, indicateurs de dépenses attribuables, capacité à utiliser ou vendre) soient documentés.",
  explication:
    "L'activation de frais de développement est une option, non un droit : elle requiert la démonstration simultanée de toutes les conditions. En l'absence de documentation, le risque est une surévaluation des actifs de 350 000 € et une sous-estimation des charges de l'exercice.",
  mesure: { constate: 350000, seuil: 0, unite: "EUR", libelle: "frais R&D activés sans dossier" },
  source: SOURCES.PCG_IMMO_INCORP,
  comptesConcernes: ["203", "2803"],
  lignesSource: [],
  faisceau: [
    "Absence de dossier technique documenté",
    "Perte d'exploitation sur les 4 derniers exercices",
    "Durée d'amortissement > 5 ans sans justification",
  ],
  annotation: "350 k€ activés — critères PCG 212-3 non démontrés",
  cibleRowId: "st-incorp-brut",
  preuve: [
    { etape: "Source", detail: "Grand livre cpt. 203 — écritures OD déc. 2024" },
    { etape: "Contrôle", detail: "Demande de documentation critères PCG art. 212-3 → non reçue" },
    { etape: "Règle", detail: "PCG art. 212-3 : activation conditionnelle à 6 critères cumulatifs" },
    { etape: "Résultat", detail: "Activation de 350 000 € sans justification — éventuel retraitement en charges" },
  ],
  statutRevue: "en_attente",
};

const findStartupCA: Finding = {
  id: "STARTUP-CA-1",
  family: "methodology",
  severity: "majeur",
  ruleId: "R-ISA240-REVENU",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "chiffre-affaires",
  titre: "Reconnaissance du revenu SaaS avant transfert du contrôle",
  constat:
    "840 000 € de revenus issus de contrats SaaS pluriannuels sont comptabilisés en totalité à la date de signature, sans étalement sur la durée de service. Les CCA correspondants ne sont pas constatés.",
  explication:
    "La comptabilisation du revenu exige que la prestation soit rendue. Pour les contrats d'abonnement, le chiffre d'affaires est acquis prorata temporis. L'absence de CCA entraîne une surestimation du CA de l'exercice et une présomption de fraude au titre de l'ISA 240.",
  mesure: { constate: 840000, seuil: 420000, unite: "EUR", libelle: "CA reconnu vs CA acquis (50 % contrats annuels)" },
  source: SOURCES.ISA_240,
  comptesConcernes: ["706", "487"],
  lignesSource: [],
  faisceau: [
    "0 € de produits constatés d'avance (cpt. 487) malgré des contrats pluriannuels",
    "Croissance CA +68 % non corrélée aux livraisons de fonctionnalités",
    "Présomption de fraude sur reconnaissance du revenu (ISA 240)",
  ],
  annotation: "PCA absents — 420 k€ à différer",
  cibleRowId: "st-ca-total",
  preuve: [
    { etape: "Source", detail: "CRM : 124 contrats SaaS signés — durée moyenne 18 mois" },
    { etape: "Contrôle", detail: "Balance cpt. 487 = 0 — aucun produit constaté d'avance" },
    { etape: "Règle", detail: "PCG cpt. 486/487 + ISA 240 § A26-A29 (présomption fraude revenu)" },
    { etape: "Résultat", detail: "Surestimation CA estimée à 420 000 € sur l'exercice" },
  ],
  statutRevue: "en_attente",
};

const findStartupProv: Finding = {
  id: "STARTUP-PROV-1",
  family: "hardLaw",
  severity: "mineur",
  ruleId: "R-PCG-PROVISIONS",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "provisions",
  titre: "Absence de provision pour risque prud'homal",
  constat:
    "Deux litiges prud'homaux sont ouverts (sommes réclamées : 27 000 € et 18 000 €). Aucune provision n'est comptabilisée au compte 1511 bien que les faits soient antérieurs à la clôture et que le risque soit estimable.",
  explication:
    "Dès qu'une obligation envers un tiers existe à la clôture et qu'une sortie de ressources est probable, la provision est obligatoire (PCG art. 322-1). Les litiges ouverts constituent des dettes conditionnelles qui doivent figurer au passif ou, au minimum, en annexe si le montant ne peut être estimé.",
  mesure: { constate: 0, seuil: 45000, unite: "EUR", libelle: "provision pour litiges sociaux attendue" },
  source: SOURCES.PCG_PROVISIONS,
  comptesConcernes: ["1511", "6815"],
  lignesSource: [],
  faisceau: [
    "2 procédures prud'homales ouvertes avant clôture",
    "Montant réclamé estimable à 45 000 €",
    "Cpt. 1511 soldé à 0 en clôture",
  ],
  annotation: "45 k€ de provision manquante",
  cibleRowId: "st-prov-sociale",
  preuve: [
    { etape: "Source", detail: "Courriers avocats reçus le 15/09 et 03/11/2024" },
    { etape: "Contrôle", detail: "Grand livre cpt. 1511 = 0 au 31/12/2024" },
    { etape: "Règle", detail: "PCG art. 322-1 : provision obligatoire si obligation + sortie probable + montant fiable" },
    { etape: "Résultat", detail: "Sous-provisionnement estimé à 45 000 €" },
  ],
  statutRevue: "en_attente",
};

const scenarioStartup: ScenarioMeta = {
  id: "startup-tech",
  label: "STARTUP TECH",
  secteur: "SaaS / Logiciel B2B",
  forme: "SAS",
  siren: "111222333",
  exercice: "2024",
  description:
    "Jeune éditeur logiciel en croissance. Trois anomalies caractéristiques : activation contestable de frais R&D, reconnaissance prématurée du revenu SaaS et absence de provision pour litiges prud'homaux.",
  anomaliesCount: 3,
  risquesDominants: ["Activation R&D", "Fraude sur revenu (ISA 240)", "Provisions sociales"],
  silos: [
    {
      siloId: "immobilisations-incorporelles",
      statement: stmt({
        titre: "Immobilisations incorporelles",
        unite: "EUR",
        rows: [
          { id: "st-incorp-brut", label: "Frais de développement (cpt. 203) — brut", compte: "203", valeur: 420000, kind: "ligne", flaggedBy: "STARTUP-INCORP-1", severity: "majeur" },
          { id: "st-incorp-amort", label: "Amortissements cumulés", compte: "2803", valeur: -70000, kind: "ligne" },
          { id: "st-incorp-vnc", label: "VNC frais de développement", valeur: 350000, kind: "sous-total" },
          { id: "st-incorp-log", label: "Logiciels acquis (cpt. 205)", compte: "205", valeur: 48000, kind: "ligne" },
          { id: "st-incorp-total", label: "Total immobilisations incorporelles nettes", valeur: 398000, kind: "total" },
        ],
      }),
      findings: [findStartupRD],
    },
    {
      siloId: "chiffre-affaires",
      statement: stmt({
        titre: "Chiffre d'affaires",
        unite: "EUR",
        rows: [
          { id: "st-ca-saas", label: "CA contrats SaaS pluriannuels (cpt. 706)", compte: "706", valeur: 840000, kind: "ligne", flaggedBy: "STARTUP-CA-1", severity: "majeur" },
          { id: "st-ca-ponctuel", label: "CA prestations ponctuelles", valeur: 180000, kind: "ligne" },
          { id: "st-ca-total", label: "Total chiffre d'affaires net", valeur: 1020000, kind: "total", flaggedBy: "STARTUP-CA-1", severity: "majeur" },
          { id: "st-ca-pca", label: "Produits constatés d'avance (cpt. 487)", compte: "487", valeur: 0, kind: "ligne", flaggedBy: "STARTUP-CA-1", severity: "majeur" },
        ],
      }),
      findings: [findStartupCA],
    },
    {
      siloId: "provisions",
      statement: stmt({
        titre: "Provisions pour risques et charges",
        unite: "EUR",
        rows: [
          { id: "st-prov-reorg", label: "Provisions pour restructuration (cpt. 1513)", compte: "1513", valeur: 0, kind: "ligne" },
          { id: "st-prov-sociale", label: "Provisions pour risques sociaux (cpt. 1511)", compte: "1511", valeur: 0, kind: "ligne", flaggedBy: "STARTUP-PROV-1", severity: "mineur" },
          { id: "st-prov-env", label: "Autres provisions pour risques", valeur: 12000, kind: "ligne" },
          { id: "st-prov-total", label: "Total provisions", valeur: 12000, kind: "total" },
        ],
      }),
      findings: [findStartupProv],
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   SCÉNARIO 2 — PME NÉGOCE
   SARL distribution B2B, 22 ans d'existence
   Risques : dépréciation stocks, créances douteuses, cut-off fournisseurs
   ═══════════════════════════════════════════════════════════════════════════ */

const findNegoceStock: Finding = {
  id: "NEGOCE-STOCK-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-DEPREC-STOCK",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "stocks",
  titre: "Absence de dépréciation sur articles sans mouvement depuis 18 mois",
  constat:
    "128 000 € de marchandises (157 références) présentent une ancienneté de stock supérieure à 18 mois sans aucun mouvement. Aucune dépréciation n'est constituée au compte 397.",
  explication:
    "À l'inventaire, la valeur actuelle d'un stock doit être appréciée article par article. Un article sans mouvement depuis 18 mois est présumé ne plus avoir de valeur réalisable proche de son coût d'acquisition — une dépréciation au moins partielle est requise.",
  mesure: { constate: 0, seuil: 128000, unite: "EUR", libelle: "dépréciation attendue (articles > 18 mois sans rotation)" },
  source: SOURCES.PCG_DEPRECIATION_STOCK,
  comptesConcernes: ["37", "397", "68733"],
  lignesSource: [],
  faisceau: [
    "157 références sans sortie depuis > 18 mois",
    "Taux de rotation global du stock : 1,4 vs sectoriel 4,2",
    "Aucune provision (cpt. 397) à la clôture",
    "Risque d'obsolescence technologique sur 43 références high-tech",
  ],
  annotation: "128 k€ sans rotation — dépréciation 0 €",
  cibleRowId: "neg-stock-deprec",
  preuve: [
    { etape: "Source", detail: "Fichier inventaire 31/12/2024 — colonne 'dernière sortie'" },
    { etape: "Transformation", detail: "Filtre : date dernière sortie < 01/07/2023 → 157 références, valeur 128 000 €" },
    { etape: "Règle", detail: "PCG art. 214-19 / 343-x : dépréciation si valeur actuelle < coût d'entrée" },
    { etape: "Résultat", detail: "Dépréciation 0 — sous-provisionnement estimé entre 60 000 € et 128 000 €" },
  ],
  statutRevue: "en_attente",
};

const findNegoceCreances: Finding = {
  id: "NEGOCE-CREANCE-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-CREANCES",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "creances-clients",
  titre: "Créances clients douteuses non dépréciées",
  constat:
    "Trois clients représentant 89 000 € TTC font l'objet de procédures collectives (liquidation judiciaire confirmée pour deux d'entre eux, redressement judiciaire pour le troisième). Aucune dépréciation n'est constatée au compte 4917.",
  explication:
    "Une créance dont le recouvrement est incertain doit être classée en créances douteuses et dépréciée à hauteur du risque estimé. Pour les clients en liquidation judiciaire, la dépréciation devrait être de 100 % en l'absence de dividende attendu.",
  mesure: { constate: 0, seuil: 89000, unite: "EUR", libelle: "dépréciation créances douteuses attendue" },
  source: SOURCES.PCG_CREANCES,
  comptesConcernes: ["411", "4916", "4917", "68174"],
  lignesSource: [],
  faisceau: [
    "Jugement liquidation judiciaire client A (nov. 2024, 47 000 €)",
    "Jugement liquidation judiciaire client B (oct. 2024, 24 000 €)",
    "Redressement judiciaire client C (déc. 2024, 18 000 €)",
    "Cpt. 4916 = 0 — aucun transfert en créances douteuses",
  ],
  annotation: "89 k€ — 3 procédures collectives, 0 dépréciation",
  cibleRowId: "neg-cr-douteuses",
  preuve: [
    { etape: "Source", detail: "INFOGREFFE : jugements publiés oct-nov-déc 2024" },
    { etape: "Contrôle", detail: "Balance cpt. 4916 et 4917 = 0 au 31/12/2024" },
    { etape: "Règle", detail: "PCG art. 214-17 : dépréciation à hauteur du risque de non-recouvrement" },
    { etape: "Résultat", detail: "Sous-dépréciation estimée à 89 000 € (dont 71 000 € à 100 %)" },
  ],
  statutRevue: "en_attente",
};

const findNegoceFNP: Finding = {
  id: "NEGOCE-FOURN-1",
  family: "hardLaw",
  severity: "mineur",
  ruleId: "R-PCG-FNP",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "dettes-fournisseurs",
  titre: "Factures non parvenues fournisseurs sous-estimées",
  constat:
    "Le rapprochement des bons de livraison de décembre avec les factures comptabilisées révèle 62 000 € HT de livraisons reçues avant le 31/12/2024 dont les factures ne sont pas encore enregistrées. Le compte 408 n'est pas alimenté.",
  explication:
    "Les biens reçus avant la clôture constituent une dette certaine dès la livraison, indépendamment de la réception de la facture. Le compte 408 doit être crédité pour rattacher la charge à l'exercice.",
  mesure: { constate: 0, seuil: 62000, unite: "EUR", libelle: "FNP manquantes identifiées" },
  source: SOURCES.PCG_FNP,
  comptesConcernes: ["401", "408", "607"],
  lignesSource: [],
  faisceau: [
    "23 BL décembre sans facture correspondante dans le journal achats",
    "Délai moyen de facturation fournisseur : 21 jours",
    "Cpt. 408 = 0 à la clôture",
  ],
  annotation: "62 k€ de FNP non rattachées",
  cibleRowId: "neg-fourn-fnp",
  preuve: [
    { etape: "Source", detail: "Journal des réceptions BL — 23 bons de livraison décembre sans facture" },
    { etape: "Transformation", detail: "Valorisation des BL non facturés : 62 000 € HT" },
    { etape: "Règle", detail: "PCG cpt. 408 — rattachement des charges à l'exercice de livraison" },
    { etape: "Résultat", detail: "Dettes fournisseurs sous-évaluées de 62 000 €" },
  ],
  statutRevue: "en_attente",
};

const scenarioNegoce: ScenarioMeta = {
  id: "pme-negoce",
  label: "PME NÉGOCE",
  secteur: "Distribution / Commerce B2B",
  forme: "SARL",
  siren: "444555666",
  exercice: "2024",
  description:
    "Distributeur B2B régional en phase de maturité. Trois anomalies classiques du cycle : stocks sans dépréciation, créances douteuses non provisionnées et factures non parvenues manquantes.",
  anomaliesCount: 3,
  risquesDominants: ["Dépréciation stocks", "Créances douteuses", "Cut-off fournisseurs"],
  silos: [
    {
      siloId: "stocks",
      statement: stmt({
        titre: "Stocks et en-cours",
        unite: "EUR",
        rows: [
          { id: "neg-stock-brut", label: "Marchandises brutes (cpt. 37)", compte: "37", valeur: 612000, kind: "ligne" },
          { id: "neg-stock-deprec", label: "Dépréciation stocks (cpt. 397)", compte: "397", valeur: 0, kind: "ligne", flaggedBy: "NEGOCE-STOCK-1", severity: "majeur" },
          { id: "neg-stock-net", label: "Stocks nets", valeur: 612000, kind: "sous-total" },
          { id: "neg-encours", label: "En-cours de production", valeur: 0, kind: "ligne" },
          { id: "neg-stock-total", label: "Total stocks nets", valeur: 612000, kind: "total" },
        ],
      }),
      findings: [findNegoceStock],
    },
    {
      siloId: "creances-clients",
      statement: stmt({
        titre: "Créances clients",
        unite: "EUR",
        rows: [
          { id: "neg-cr-brut", label: "Clients et comptes rattachés (cpt. 411)", compte: "411", valeur: 547000, kind: "ligne" },
          { id: "neg-cr-douteuses", label: "dont créances douteuses identifiées", valeur: 89000, kind: "ligne", flaggedBy: "NEGOCE-CREANCE-1", severity: "majeur" },
          { id: "neg-cr-deprec", label: "Dépréciation créances clients (cpt. 4917)", compte: "4917", valeur: 0, kind: "ligne", flaggedBy: "NEGOCE-CREANCE-1", severity: "majeur" },
          { id: "neg-cr-net", label: "Clients nets", valeur: 547000, kind: "total" },
        ],
      }),
      findings: [findNegoceCreances],
    },
    {
      siloId: "dettes-fournisseurs",
      statement: stmt({
        titre: "Dettes fournisseurs",
        unite: "EUR",
        rows: [
          { id: "neg-fourn-base", label: "Fournisseurs facturés (cpt. 401)", compte: "401", valeur: 384000, kind: "ligne" },
          { id: "neg-fourn-fnp", label: "Fournisseurs – factures non parvenues (cpt. 408)", compte: "408", valeur: 0, kind: "ligne", flaggedBy: "NEGOCE-FOURN-1", severity: "mineur" },
          { id: "neg-fourn-total", label: "Total dettes fournisseurs", valeur: 384000, kind: "total" },
        ],
      }),
      findings: [findNegoceFNP],
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   SCÉNARIO 3 — HOLDING INVESTISSEMENT
   SA holding, 25 ans d'existence, portefeuille de participations
   Risques : participation non dépréciée, CP < 50 %, hors-bilan caché
   ═══════════════════════════════════════════════════════════════════════════ */

const findHoldingPartic: Finding = {
  id: "HOLDING-FIN-1",
  family: "hardLaw",
  severity: "bloquant",
  ruleId: "R-PCG-TITRES",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "immobilisations-financieres",
  titre: "Participation principale non dépréciée malgré 3 exercices déficitaires",
  constat:
    "La filiale commerciale (cpt. 261 — valeur comptable 1 200 000 €) présente des capitaux propres négatifs depuis 3 exercices consécutifs (-380 000 € au 31/12/2024). La valeur d'utilité est nulle. Aucune dépréciation n'est constatée.",
  explication:
    "La valeur d'utilité d'un titre de participation s'apprécie notamment sur la quote-part de capitaux propres et les perspectives de rentabilité. Des capitaux propres négatifs sur 3 exercices et l'absence de plan de redressement rendent une dépréciation intégrale obligatoire.",
  mesure: { constate: 0, seuil: 1200000, unite: "EUR", libelle: "dépréciation participation obligatoire" },
  source: SOURCES.PCG_TITRES,
  comptesConcernes: ["261", "2961", "68662"],
  lignesSource: [],
  faisceau: [
    "Filiale déficitaire 3 ans consécutifs (N-2, N-1, N)",
    "Capitaux propres filiale : -380 000 € au 31/12/2024",
    "Aucun plan de redressement formalisé",
    "Cpt. 2961 = 0 — dépréciation nulle",
  ],
  annotation: "1,2 M€ — filiale déficitaire, 0 dépréciation",
  cibleRowId: "hld-partic-deprec",
  preuve: [
    { etape: "Source", detail: "Comptes filiale 2022-2024 reçus le 15/01/2025" },
    { etape: "Transformation", detail: "Valeur d'utilité = quote-part CP filiale = -380 000 € → valeur recouvrable = 0" },
    { etape: "Règle", detail: "PCG art. 221-3 / 332-3 : dépréciation si VU < VNC" },
    { etape: "Résultat", detail: "Dépréciation requise : 1 200 000 € — impact résultat N : -1 200 000 €" },
  ],
  statutRevue: "en_attente",
};

const findHoldingCP: Finding = {
  id: "HOLDING-CP-1",
  family: "hardLaw",
  severity: "bloquant",
  ruleId: "R-CCOM-CAPITAL",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "capitaux-propres",
  titre: "Capitaux propres inférieurs à la moitié du capital — procédure L.225-248 non engagée",
  constat:
    "Les capitaux propres s'établissent à 32 000 € au 31/12/2024 pour un capital social de 500 000 €, soit 6,4 % du capital (seuil légal : 50 %). La procédure d'information de l'AGE prévue à l'article L.225-248 n'a pas été engagée.",
  explication:
    "Lorsque les pertes réduisent les capitaux propres en dessous de la moitié du capital, l'assemblée générale doit être consultée dans les 4 mois sur la dissolution. À défaut, la situation doit être régularisée avant la clôture du deuxième exercice suivant. Le non-respect de cette obligation constitue une anomalie bloquante.",
  mesure: { constate: 32000, seuil: 250000, unite: "EUR", libelle: "capitaux propres vs 50 % du capital" },
  source: SOURCES.CCOM_CAPITAL,
  comptesConcernes: ["101", "106", "119", "12"],
  lignesSource: [],
  faisceau: [
    "CP = 32 000 € < 50 % × 500 000 € = 250 000 €",
    "Procédure L.225-248 non engagée dans les 4 mois de la clôture N-1",
    "Aucune mention en annexe de la situation",
    "Risque de dissolution judiciaire si non régularisation",
  ],
  annotation: "CP 32 k€ < 50 % capital (250 k€) — L.225-248",
  cibleRowId: "hld-cp-total",
  preuve: [
    { etape: "Source", detail: "Bilan N et N-1 — comptes 101 + 10x + 119 + 12" },
    { etape: "Calcul", detail: "CP = 32 000 € ; capital = 500 000 € ; ratio = 6,4 % < 50 %" },
    { etape: "Règle", detail: "C. com. art. L.225-248 : AGE dans 4 mois + régularisation sous 2 ans" },
    { etape: "Résultat", detail: "Procédure légale non respectée — alerte bloquante" },
  ],
  statutRevue: "en_attente",
};

const findHoldingEngag: Finding = {
  id: "HOLDING-ENGAG-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-ENGAGEMENTS",
  ruleVersion: "1.0.0",
  cloison: "annexe",
  siloId: "engagements-hors-bilan",
  titre: "Garantie bancaire de 800 000 € accordée à filiale — non déclarée en annexe",
  constat:
    "La société a accordé une garantie à première demande à la banque principale de sa filiale pour un encours maximum de 800 000 €. Cet engagement donné ne figure ni dans le tableau des engagements hors bilan, ni dans l'annexe.",
  explication:
    "Les engagements financiers significatifs donnés en faveur de tiers doivent figurer dans l'annexe, par catégorie et pour leur montant. L'omission d'une garantie de 800 000 € fausse l'image fidèle donnée aux tiers (créanciers, actionnaires) sur le risque maximal supporté.",
  mesure: { constate: 0, seuil: 800000, unite: "EUR", libelle: "engagement donné non déclaré" },
  source: SOURCES.PCG_ENGAGEMENTS,
  comptesConcernes: ["8016", "802"],
  lignesSource: [],
  faisceau: [
    "Acte de cautionnement signé le 12/03/2024 — non enregistré comptablement",
    "Hors-bilan annexe : 0 € déclaré",
    "Confirmation bancaire (ISA 505) révèle l'engagement",
  ],
  annotation: "800 k€ de garantie — hors-bilan non révélé",
  cibleRowId: "hld-engag-garantie",
  preuve: [
    { etape: "Source", detail: "Confirmation bancaire ISA 505 — mention : garantie holding 800 000 €" },
    { etape: "Contrôle", detail: "Annexe hors-bilan : vierge — aucun engagement déclaré" },
    { etape: "Règle", detail: "PCG art. 831-2 / 531-2 : engagement significatif donné = information obligatoire annexe" },
    { etape: "Résultat", detail: "Omission d'un engagement hors-bilan de 800 000 €" },
  ],
  statutRevue: "en_attente",
};

const scenarioHolding: ScenarioMeta = {
  id: "holding-invest",
  label: "HOLDING",
  secteur: "Holding / Portefeuille de participations",
  forme: "SA",
  siren: "777888999",
  exercice: "2024",
  description:
    "Structure holding confrontée à une filiale déficitaire. Trois anomalies à fort impact : participation non dépréciée (1,2 M€), procédure légale CP non engagée et garantie hors-bilan cachée.",
  anomaliesCount: 3,
  risquesDominants: ["Dépréciation participation (bloquant)", "Alerte capitaux propres (bloquant)", "Hors-bilan non déclaré"],
  silos: [
    {
      siloId: "immobilisations-financieres",
      statement: stmt({
        titre: "Immobilisations financières",
        unite: "EUR",
        rows: [
          { id: "hld-partic-brut", label: "Titres de participation — filiale commerciale (cpt. 261)", compte: "261", valeur: 1200000, kind: "ligne" },
          { id: "hld-partic-deprec", label: "Dépréciation titres de participation (cpt. 2961)", compte: "2961", valeur: 0, kind: "ligne", flaggedBy: "HOLDING-FIN-1", severity: "bloquant" },
          { id: "hld-partic-vnc", label: "VNC participations", valeur: 1200000, kind: "sous-total" },
          { id: "hld-prets", label: "Prêts aux filiales (cpt. 271)", compte: "271", valeur: 320000, kind: "ligne" },
          { id: "hld-fin-total", label: "Total immobilisations financières nettes", valeur: 1520000, kind: "total" },
        ],
      }),
      findings: [findHoldingPartic],
    },
    {
      siloId: "capitaux-propres",
      statement: stmt({
        titre: "Capitaux propres",
        unite: "EUR",
        rows: [
          { id: "hld-capital", label: "Capital social (cpt. 101)", compte: "101", valeur: 500000, kind: "ligne" },
          { id: "hld-reserves", label: "Réserves (cpt. 106)", compte: "106", valeur: 15000, kind: "ligne" },
          { id: "hld-rna", label: "Report à nouveau (cpt. 110/119)", compte: "119", valeur: -335000, kind: "ligne" },
          { id: "hld-resultat", label: "Résultat de l'exercice (cpt. 12)", compte: "12", valeur: -148000, kind: "ligne" },
          { id: "hld-cp-total", label: "Total capitaux propres", valeur: 32000, kind: "total", flaggedBy: "HOLDING-CP-1", severity: "bloquant" },
        ],
      }),
      findings: [findHoldingCP],
    },
    {
      siloId: "engagements-hors-bilan",
      statement: stmt({
        titre: "Engagements hors bilan",
        unite: "EUR",
        rows: [
          { id: "hld-engag-caution", label: "Cautions et avals déclarés", valeur: 0, kind: "ligne" },
          { id: "hld-engag-garantie", label: "Garanties à première demande accordées (non déclarées)", valeur: 800000, kind: "ligne", flaggedBy: "HOLDING-ENGAG-1", severity: "majeur" },
          { id: "hld-engag-total", label: "Total engagements donnés déclarés", valeur: 0, kind: "total" },
        ],
      }),
      findings: [findHoldingEngag],
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   SCÉNARIO 4 — CLINIQUE SANTÉ
   SAS exploitant une clinique privée, 8 ans d'existence
   Risques : provision CP inexacte, pénalités ARS, amortissements gelés
   ═══════════════════════════════════════════════════════════════════════════ */

const findCliniqueCP: Finding = {
  id: "CLINIQUE-PERS-1",
  family: "hardLaw",
  severity: "mineur",
  ruleId: "R-PCG-PROV-CP",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "charges-de-personnel",
  titre: "Provision congés payés calculée sans charges patronales",
  constat:
    "La provision pour congés payés (87 000 €, cpt. 4282) est calculée sur la base des salaires bruts uniquement, sans intégrer les charges sociales patronales afférentes (taux moyen 42 %). La sous-évaluation est estimée à 34 000 €.",
  explication:
    "Le coût complet de la provision pour congés payés inclut les charges sociales patronales qui seront dues lors de la prise des congés. Ne comptabiliser que les salaires bruts minore la provision et les charges de personnel de l'exercice.",
  mesure: { constate: 87000, seuil: 121000, unite: "EUR", libelle: "provision CP — brut vs coût employeur complet" },
  source: {
    ref: "PCG art. 324-1 / Code du travail L.3141-22",
    citation: "La provision pour congés payés doit représenter le coût total employeur des droits à congé acquis à la clôture, incluant les charges sociales patronales afférentes.",
    effectiveDate: "2024-01-01",
  },
  comptesConcernes: ["4282", "6412", "645"],
  lignesSource: [],
  faisceau: [
    "Taux charges patronales moyen : 42 %",
    "Provision brute : 87 000 € — coût total attendu : 121 000 €",
    "Charges sociales sur CP non provisionnées (cpt. 645) : 34 000 €",
  ],
  annotation: "Provision CP sous-évaluée : +34 k€ charges patronales",
  cibleRowId: "cl-prov-cp",
  preuve: [
    { etape: "Source", detail: "Journal de paie — état des congés acquis au 31/12/2024 : 87 000 € bruts" },
    { etape: "Calcul", detail: "87 000 × 42 % charges patronales = 36 540 € → arrondi expert : 34 000 €" },
    { etape: "Règle", detail: "PCG art. 324-1 : provision = coût total employeur (salaire + charges)" },
    { etape: "Résultat", detail: "Sous-évaluation provision : 34 000 € — charges personnels minorées" },
  ],
  statutRevue: "en_attente",
};

const findCliniqueProv: Finding = {
  id: "CLINIQUE-PROV-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-PROVISIONS",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "provisions",
  titre: "Pénalités ARS notifiées en novembre — absence de provision",
  constat:
    "L'Agence Régionale de Santé a notifié le 14/11/2024 une indemnité de 92 000 € pour non-respect des engagements de service minimum. La lettre de notification fait état d'une obligation certaine. Aucune provision n'est comptabilisée.",
  explication:
    "La notification de l'ARS constitue une obligation envers un tiers à la date de clôture, pour un montant certain et documenté. Les conditions d'une provision sont réunies (PCG art. 322-1) : obligation, sortie probable, montant fiable. L'absence de provision minore les charges et surestime le résultat.",
  mesure: { constate: 0, seuil: 92000, unite: "EUR", libelle: "provision pénalités ARS attendue" },
  source: SOURCES.PCG_PROVISIONS,
  comptesConcernes: ["1518", "6718"],
  lignesSource: [],
  faisceau: [
    "Lettre ARS du 14/11/2024 — obligation certaine et quantifiée",
    "Délai de recours : 2 mois (expiré au 14/01/2025)",
    "Compte 1518 = 0 à la clôture",
  ],
  annotation: "92 k€ pénalités ARS — obligation certaine, 0 provision",
  cibleRowId: "cl-prov-ars",
  preuve: [
    { etape: "Source", detail: "Courrier ARS ref. 2024/DIR/5821 du 14/11/2024 — montant : 92 000 €" },
    { etape: "Contrôle", detail: "Grand livre cpt. 1518 = 0 au 31/12/2024" },
    { etape: "Règle", detail: "PCG art. 322-1 : obligation + sortie probable + montant fiable = provision obligatoire" },
    { etape: "Résultat", detail: "Omission de provision de 92 000 € — résultat surestimé d'autant" },
  ],
  statutRevue: "en_attente",
};

const findCliniqueAmort: Finding = {
  id: "CLINIQUE-IMMO-1",
  family: "internal",
  severity: "mineur",
  ruleId: "R-INT-AMORT-REVISION",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "immobilisations-corporelles",
  titre: "Durées d'amortissement des équipements médicaux non révisées depuis 8 ans",
  constat:
    "Les équipements médicaux (scanners, IRM, matériels d'imagerie) sont amortis sur des durées fixées en 2016 (12 à 15 ans). Or les conditions d'utilisation et le marché de l'occasion ont évolué — la durée économique effective est estimée à 8 ans. Un écart de 7 points est constaté sur le taux d'amortissement global.",
  explication:
    "Le plan d'amortissement doit être révisé lorsque les hypothèses qui l'ont fondé changent. La non-révision entraîne une sous-dotation chronique et une surévaluation de la VNC des équipements. C'est un changement d'estimation comptable, à effet prospectif.",
  mesure: { constate: 7, seuil: 5, unite: "%", libelle: "écart taux d'amortissement (actuel vs économique)" },
  source: SOURCES.PCG_AMORTISSEMENT,
  comptesConcernes: ["2154", "28154"],
  lignesSource: [],
  faisceau: [
    "Durées fixées en 2016 — non révisées depuis 8 exercices",
    "Taux amorti actuel : 5,4 % vs taux économique estimé : 12,5 %",
    "Marché seconde main : valeur résiduelle des IRM < 10 % valeur brute",
  ],
  annotation: "Durées amort. gelées — révision prospective recommandée",
  cibleRowId: "cl-immo-amort",
  preuve: [
    { etape: "Source", detail: "Tableau des immobilisations 2016-2024 — durées inchangées" },
    { etape: "Analyse", detail: "Comparaison taux historique (6,7 %) vs taux recommandé secteur (12,5 %)" },
    { etape: "Règle", detail: "PCG art. 214-13 : révision plan amortissement si changement significatif d'utilisation" },
    { etape: "Résultat", detail: "Signal interne PROBANT — recommandation de révision prospective" },
  ],
  statutRevue: "en_attente",
};

const scenarioClinique: ScenarioMeta = {
  id: "clinique-sante",
  label: "CLINIQUE SANTÉ",
  secteur: "Santé / Médico-social",
  forme: "SAS",
  siren: "321654987",
  exercice: "2024",
  description:
    "Clinique privée sous régime ARS. Anomalies typiques du secteur : provision congés payés incomplète, pénalités réglementaires non provisionnées et durées d'amortissement des équipements lourds non révisées.",
  anomaliesCount: 3,
  risquesDominants: ["Coût employeur incomplet", "Provision réglementaire ARS", "Amortissements équipements"],
  silos: [
    {
      siloId: "charges-de-personnel",
      statement: stmt({
        titre: "Charges de personnel",
        unite: "EUR",
        rows: [
          { id: "cl-sal-bruts", label: "Salaires et appointements (cpt. 641)", compte: "641", valeur: 1840000, kind: "ligne" },
          { id: "cl-charges-soc", label: "Charges sociales patronales (cpt. 645)", compte: "645", valeur: 772800, kind: "ligne" },
          { id: "cl-prov-cp", label: "Provision congés payés (cpt. 4282 / 6412)", compte: "4282", valeur: 87000, kind: "ligne", flaggedBy: "CLINIQUE-PERS-1", severity: "mineur" },
          { id: "cl-pers-total", label: "Total charges de personnel", valeur: 2699800, kind: "total" },
        ],
      }),
      findings: [findCliniqueCP],
    },
    {
      siloId: "provisions",
      statement: stmt({
        titre: "Provisions pour risques et charges",
        unite: "EUR",
        rows: [
          { id: "cl-prov-retraite", label: "Provisions engagements retraite (cpt. 153)", compte: "153", valeur: 48000, kind: "ligne" },
          { id: "cl-prov-ars", label: "Provisions pénalités ARS (cpt. 1518)", compte: "1518", valeur: 0, kind: "ligne", flaggedBy: "CLINIQUE-PROV-1", severity: "majeur" },
          { id: "cl-prov-total", label: "Total provisions", valeur: 48000, kind: "total" },
        ],
      }),
      findings: [findCliniqueProv],
    },
    {
      siloId: "immobilisations-corporelles",
      statement: stmt({
        titre: "Immobilisations corporelles — équipements médicaux",
        unite: "EUR",
        rows: [
          { id: "cl-immo-brut", label: "Équipements médicaux bruts (cpt. 2154)", compte: "2154", valeur: 1840000, kind: "ligne" },
          { id: "cl-immo-amort", label: "Amortissements cumulés (cpt. 28154)", compte: "28154", valeur: -1472000, kind: "ligne", flaggedBy: "CLINIQUE-IMMO-1", severity: "mineur" },
          { id: "cl-immo-vnc", label: "VNC équipements médicaux", valeur: 368000, kind: "sous-total" },
          { id: "cl-immo-mob", label: "Autres immobilisations corporelles nettes", valeur: 214000, kind: "ligne" },
          { id: "cl-immo-total", label: "Total immobilisations corporelles nettes", valeur: 582000, kind: "total" },
        ],
      }),
      findings: [findCliniqueAmort],
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: "demo-sa",
    label: "DEMO SA",
    secteur: "Industrie / Production",
    forme: "SA",
    siren: "000000000",
    exercice: "2024",
    description:
      "Société de démonstration industrielle — couverture complète de toutes les cloisons (20 constats sur 20 silos). Idéal pour explorer l'intégralité des fonctionnalités.",
    anomaliesCount: DEMO_DOSSIER.silos.reduce((n, s) => n + s.findings.length, 0),
    risquesDominants: ["Amortissements", "Cut-off", "Provisions", "Fraude CA"],
    silos: DEMO_DOSSIER.silos,
  },
  scenarioStartup,
  scenarioNegoce,
  scenarioHolding,
  scenarioClinique,
];

export const SCENARIO_MAP: Record<string, ScenarioMeta> = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s]),
);

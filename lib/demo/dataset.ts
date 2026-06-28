import type {
  Dossier,
  Finding,
  ReconstitutedStatement,
  SiloView,
} from "@/lib/canonical-model";
import { REFERENTIEL_VERSION, SOURCES } from "@/lib/referentiel/sources";

/**
 * Dataset de démonstration — société fictive DEMO SA.
 *
 * Toutes les données sont fictives et servent à exposer l'intégralité de
 * l'interface (silos, états reconstruits, annotations, faisceau, preuve) sans
 * base de données ni credentials. Le bandeau « MODE DÉMO » l'indique en UI.
 */

const FECT = REFERENTIEL_VERSION;

function stmt(s: ReconstitutedStatement): ReconstitutedStatement {
  return s;
}

/* ───────────────────────── Immobilisations corporelles ──────────────────── */

const findImmo: Finding = {
  id: "DEMO-IMMO-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-AMORT",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "immobilisations-corporelles",
  titre: "Rupture du plan d'amortissement",
  constat:
    "Le taux d'amortissement des installations techniques (compte 215) passe de 20 % à 40 % sans justification ni mention en annexe.",
  explication:
    "Le plan d'amortissement reflète le rythme de consommation des avantages économiques. Une modification doit être justifiée et documentée (changement d'estimation à effet prospectif, ou changement de méthode à effet rétrospectif). Ici, la dotation double, réduisant la VNC de 96 000 € sans note.",
  mesure: { constate: 40, seuil: 20, unite: "%", libelle: "taux d'amortissement" },
  source: SOURCES.PCG_AMORTISSEMENT,
  comptesConcernes: ["215", "28154", "68112"],
  lignesSource: [1204, 1205],
  faisceau: [
    "dotation x2 vs N-1",
    "aucune note en annexe",
    "permanence des méthodes rompue",
  ],
  annotation: "Taux 40 % vs 20 % en N-1 — dotation doublée",
  cibleRowId: "immo-vnc",
  preuve: [
    { etape: "Source", detail: "FEC DEMO SA — journal OD, écriture 1204-1205" },
    { etape: "Transformation", detail: "Cumul dotations 215 / valeur brute" },
    { etape: "Règle", detail: "Comparaison taux N vs N-1 (PCG art. 214-13)" },
    { etape: "Résultat", detail: "Taux 40 % > 20 % attendu — écart +20 pts" },
  ],
  statutRevue: "en_attente",
};

const siloImmo: SiloView = {
  siloId: "immobilisations-corporelles",
  statement: stmt({
    titre: "Compte 215 — Installations techniques",
    unite: "EUR",
    note: "Valeur brute, amortissements cumulés et VNC reconstitués depuis le FEC.",
    rows: [
      { id: "immo-brut", label: "Valeur brute", compte: "215", valeur: 480000, kind: "ligne" },
      {
        id: "immo-amort",
        label: "Amortissements cumulés",
        compte: "28154",
        valeur: -192000,
        kind: "ligne",
      },
      {
        id: "immo-vnc",
        label: "Valeur nette comptable",
        compte: "215",
        valeur: 288000,
        kind: "total",
        flaggedBy: "DEMO-IMMO-1",
        severity: "majeur",
      },
    ],
  }),
  findings: [findImmo],
};

/* ──────────────────────────────── Provisions ────────────────────────────── */

const findProv: Finding = {
  id: "DEMO-PROV-1",
  family: "methodology",
  severity: "bloquant",
  ruleId: "R-PCG-PROV",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "provisions",
  titre: "Perte sur contrat probable non provisionnée",
  constat:
    "Un contrat déficitaire identifié (marge négative de 145 000 € à terminaison) n'a fait l'objet d'aucune provision pour risques.",
  explication:
    "Une perte sur contrat doit être provisionnée dès qu'elle devient probable, indépendamment de son échéance. L'absence de provision surévalue le résultat et le situation nette.",
  mesure: { constate: 0, seuil: 145000, unite: "EUR", libelle: "provision à constituer" },
  source: SOURCES.PCG_PROVISIONS,
  comptesConcernes: ["1515", "6815"],
  lignesSource: [],
  faisceau: [
    "contrat à marge négative",
    "aucune écriture en 151x",
    "engagement ferme au bilan",
  ],
  annotation: "Provision attendue ≈ 145 000 € — ligne absente",
  cibleRowId: "prov-risques",
  preuve: [
    { etape: "Source", detail: "Suivi contrats DEMO SA — affaire #C-2041" },
    { etape: "Transformation", detail: "Coûts à terminaison − produits à recevoir" },
    { etape: "Règle", detail: "Perte probable ⇒ provision (PCG art. 322-1)" },
    { etape: "Résultat", detail: "Provision constatée 0 € vs 145 000 € attendus" },
  ],
  statutRevue: "en_attente",
};

const siloProv: SiloView = {
  siloId: "provisions",
  statement: stmt({
    titre: "Classe 15 — Provisions pour risques et charges",
    unite: "EUR",
    rows: [
      { id: "prov-litiges", label: "Provisions pour litiges", compte: "1511", valeur: 32000, kind: "ligne" },
      { id: "prov-garanties", label: "Provisions pour garanties", compte: "1512", valeur: 18000, kind: "ligne" },
      {
        id: "prov-risques",
        label: "Provisions pour pertes sur contrats",
        compte: "1515",
        valeur: 0,
        kind: "ligne",
        flaggedBy: "DEMO-PROV-1",
        severity: "bloquant",
      },
      { id: "prov-total", label: "Total provisions", valeur: 50000, kind: "total" },
    ],
  }),
  findings: [findProv],
};

/* ─────────────────────── Charges constatées d'avance ─────────────────────── */

const findCCA: Finding = {
  id: "DEMO-CCA-1",
  family: "methodology",
  severity: "mineur",
  ruleId: "R-PCG-CCA",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "cca",
  titre: "Charge d'assurance non étalée (cut-off)",
  constat:
    "Une prime d'assurance annuelle de 24 000 € payée le 01/10/N est intégralement passée en charges, sans constatation d'avance pour les 9 mois relevant de N+1.",
  explication:
    "Les charges enregistrées mais relatives à un exercice ultérieur doivent être neutralisées via le compte 486. Ici, 18 000 € (9/12) auraient dû être constatés d'avance.",
  mesure: { constate: 0, seuil: 18000, unite: "EUR", libelle: "CCA à constater" },
  source: SOURCES.PCG_CCA_PCA,
  comptesConcernes: ["486", "616"],
  lignesSource: [842],
  faisceau: ["prime annuelle", "paiement T4", "aucun 486"],
  annotation: "9/12 de la prime relèvent de N+1 → 18 000 € manquants",
  cibleRowId: "cca-assurance",
  preuve: [
    { etape: "Source", detail: "FEC — pièce ASSUR-2024-10" },
    { etape: "Règle", detail: "Étalement prorata temporis (PCG cpt. 486)" },
    { etape: "Résultat", detail: "CCA constatée 0 € vs 18 000 € attendus" },
  ],
  statutRevue: "en_attente",
};

const siloCCA: SiloView = {
  siloId: "cca",
  statement: stmt({
    titre: "Compte 486 — Charges constatées d'avance",
    unite: "EUR",
    rows: [
      { id: "cca-loyers", label: "Loyers d'avance", compte: "486", valeur: 12000, kind: "ligne" },
      {
        id: "cca-assurance",
        label: "Assurances (part N+1 attendue)",
        compte: "486",
        valeur: 0,
        kind: "ligne",
        flaggedBy: "DEMO-CCA-1",
        severity: "mineur",
      },
      { id: "cca-total", label: "Total CCA", valeur: 12000, kind: "total" },
    ],
  }),
  findings: [findCCA],
};

/* ────────────────────────────── Chiffre d'affaires ──────────────────────── */

const findCA: Finding = {
  id: "DEMO-CA-1",
  family: "methodology",
  severity: "majeur",
  ruleId: "R-ME-001",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "chiffre-affaires",
  titre: "Ventes de décembre antidatées (cut-off / fraude)",
  constat:
    "312 000 € de ventes ont été comptabilisées par écritures manuelles le 31/12, dont la livraison intervient en janvier N+1 d'après les bons de livraison.",
  explication:
    "La reconnaissance du revenu fait l'objet d'une présomption de risque de fraude. Le rattachement de ventes au mauvais exercice gonfle le CA et le résultat. Des tests sur les bons de livraison et contrats sont requis.",
  mesure: { constate: 312000, seuil: 0, unite: "EUR", libelle: "CA potentiellement anticipé" },
  source: SOURCES.ISA_240,
  comptesConcernes: ["701", "4111"],
  lignesSource: [2310, 2311, 2312],
  faisceau: [
    "écritures manuelles 31/12",
    "livraison en janvier",
    "journal OD au lieu de ventes",
  ],
  annotation: "312 000 € rattachés à N — livraison N+1",
  cibleRowId: "ca-dec",
  preuve: [
    { etape: "Source", detail: "FEC — journal OD, écritures 2310-2312" },
    { etape: "Transformation", detail: "Croisement date écriture / date livraison" },
    { etape: "Règle", detail: "Cut-off et présomption revenu (ISA 240)" },
    { etape: "Résultat", detail: "312 000 € à requalifier en PCA / N+1" },
  ],
  statutRevue: "en_attente",
};

const siloCA: SiloView = {
  siloId: "chiffre-affaires",
  statement: stmt({
    titre: "Compte 70 — Chiffre d'affaires par trimestre",
    unite: "EUR",
    rows: [
      { id: "ca-t1", label: "T1", valeur: 1450000, kind: "ligne" },
      { id: "ca-t2", label: "T2", valeur: 1520000, kind: "ligne" },
      { id: "ca-t3", label: "T3", valeur: 1380000, kind: "ligne" },
      {
        id: "ca-dec",
        label: "T4 (dont 312 k€ manuel au 31/12)",
        valeur: 1990000,
        kind: "ligne",
        flaggedBy: "DEMO-CA-1",
        severity: "majeur",
      },
      { id: "ca-total", label: "CA annuel", valeur: 6340000, kind: "total" },
    ],
  }),
  findings: [findCA],
};

/* ──────────────────────────────────── Stocks ────────────────────────────── */

const findStock: Finding = {
  id: "DEMO-STOCK-1",
  family: "internal",
  severity: "mineur",
  ruleId: "R-IN-STOCK",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "stocks",
  titre: "Rotation faible sans dépréciation",
  constat:
    "Une catégorie de stock (référence M-118) représente 210 000 € avec une rotation > 540 jours et aucune dépréciation constatée.",
  explication:
    "À l'inventaire, une dépréciation s'impose lorsque la valeur actuelle devient inférieure à la VNC. Une rotation très faible est un indice de perte de valeur à investiguer (paramètre interne de vigilance).",
  mesure: { constate: 540, seuil: 365, unite: "jours", libelle: "jours de rotation" },
  source: SOURCES.PCG_DEPRECIATION_STOCK,
  comptesConcernes: ["370", "397"],
  lignesSource: [],
  faisceau: ["rotation > 540 j", "aucune 397", "stock dormant"],
  annotation: "Rotation 540 j — dépréciation non testée",
  cibleRowId: "stock-m118",
  preuve: [
    { etape: "Source", detail: "Balance stocks DEMO SA" },
    { etape: "Règle", detail: "Indice de perte de valeur (PCG art. 214-19)" },
    { etape: "Résultat", detail: "Test de dépréciation à mener" },
  ],
  statutRevue: "en_attente",
};

const siloStock: SiloView = {
  siloId: "stocks",
  statement: stmt({
    titre: "Classe 3 — Stocks par catégorie",
    unite: "EUR",
    rows: [
      { id: "stock-mp", label: "Matières premières", compte: "31", valeur: 340000, kind: "ligne" },
      {
        id: "stock-m118",
        label: "Produits finis — réf. M-118",
        compte: "355",
        valeur: 210000,
        kind: "ligne",
        flaggedBy: "DEMO-STOCK-1",
        severity: "mineur",
      },
      { id: "stock-deprec", label: "Dépréciations (397)", compte: "397", valeur: 0, kind: "ligne" },
      { id: "stock-total", label: "Stock net", valeur: 550000, kind: "total" },
    ],
  }),
  findings: [findStock],
};

/* ───────────────────────────── Admissibilité FEC ────────────────────────── */

const admissibilite: Finding[] = [
  {
    id: "DEMO-ADM-1",
    family: "hardLaw",
    severity: "bloquant",
    ruleId: "R-HL-004",
    ruleVersion: "1.0.0",
    cloison: "journaux",
    siloId: "journaux",
    titre: "3 écritures avec date hors format AAAAMMJJ",
    constat:
      "Trois écritures portent une EcritureDate au format JJ/MM/AAAA au lieu d'AAAAMMJJ.",
    explication:
      "Anomalie d'admissibilité : tant que le format n'est pas corrigé, l'exploitation chronologique du fichier et l'analyse en aval sont suspendues.",
    mesure: { constate: 3, seuil: 0, unite: "ratio", libelle: "dates non conformes" },
    source: SOURCES.LPF_A47A1,
    comptesConcernes: [],
    lignesSource: [517, 904, 1330],
    faisceau: ["format de date", "ingestion"],
    preuve: [
      { etape: "Échantillon", detail: 'L517: "31/12/2024", L904: "15/06/2024"' },
      { etape: "Règle", detail: "LPF A.47 A-1 — dates AAAAMMJJ" },
    ],
    statutRevue: "en_attente",
  },
];

export const DEMO_DOSSIER: Dossier = {
  id: "demo-sa-2024",
  societe: {
    raisonSociale: "DEMO SA",
    siren: "000000000",
    exercice: "2024",
    dateCloture: "20241231",
  },
  demoMode: true,
  fecFingerprint: "demo000000000fec20241231abcdef0123456789",
  referentielVersion: FECT,
  createdAt: "2024-12-31T18:00:00.000Z",
  admissibilite,
  silos: [siloImmo, siloProv, siloCA, siloCCA, siloStock],
};

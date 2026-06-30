import type {
  Dossier,
  Finding,
  ReconstitutedStatement,
  SiloView,
} from "@/lib/canonical-model";
import { REFERENTIEL_VERSION, SOURCES } from "@/lib/referentiel/sources";
import { computeMateriality } from "@/lib/audit/materiality";
import { buildAllRapprochementSilos } from "@/lib/rapprochement/demo";

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

/* ──────────────────── Immobilisations incorporelles ─────────────────────── */

const findIncorp: Finding = {
  id: "DEMO-INCORP-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-INCORP",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "immobilisations-incorporelles",
  titre: "Frais de développement activés sans conditions démontrées",
  constat:
    "85 000 € de frais de développement ont été inscrits à l'actif (compte 203) sans documentation des critères d'activation (faisabilité, ressources, avantages futurs probables).",
  explication:
    "L'activation des frais de développement est conditionnée à la démonstration de critères stricts. À défaut de dossier probant, ces frais doivent être comptabilisés en charges ; leur activation surévalue l'actif et le résultat.",
  mesure: { constate: 85000, seuil: 0, unite: "EUR", libelle: "frais activés à justifier" },
  source: SOURCES.PCG_IMMO_INCORP,
  comptesConcernes: ["203", "6811"],
  lignesSource: [318],
  faisceau: [
    "aucun dossier de faisabilité",
    "projet non individualisé",
    "activation en fin d'exercice",
  ],
  annotation: "85 000 € activés — critères PCG non démontrés",
  cibleRowId: "incorp-dev",
  preuve: [
    { etape: "Source", detail: "FEC — journal OD, écriture 318" },
    { etape: "Règle", detail: "Conditions d'activation (PCG art. 212-3)" },
    { etape: "Résultat", detail: "85 000 € à reclasser en charges sauf justification" },
  ],
  statutRevue: "en_attente",
};

const siloIncorp: SiloView = {
  siloId: "immobilisations-incorporelles",
  statement: stmt({
    titre: "Compte 20 — Immobilisations incorporelles",
    unite: "EUR",
    note: "Valeurs brutes et amortissements reconstitués depuis le FEC.",
    rows: [
      { id: "incorp-fonds", label: "Fonds commercial", compte: "207", valeur: 120000, kind: "ligne" },
      { id: "incorp-logiciels", label: "Logiciels", compte: "205", valeur: 40000, kind: "ligne" },
      {
        id: "incorp-dev",
        label: "Frais de développement activés",
        compte: "203",
        valeur: 85000,
        kind: "ligne",
        flaggedBy: "DEMO-INCORP-1",
        severity: "majeur",
      },
      { id: "incorp-amort", label: "Amortissements", compte: "280", valeur: -55000, kind: "ligne" },
      { id: "incorp-vnc", label: "Valeur nette comptable", valeur: 190000, kind: "total" },
    ],
  }),
  findings: [findIncorp],
};

/* ──────────────────── Immobilisations financières ───────────────────────── */

const findImmoFin: Finding = {
  id: "DEMO-IMMOFIN-1",
  family: "methodology",
  severity: "majeur",
  ruleId: "R-PCG-TITRES",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "immobilisations-financieres",
  titre: "Titres de participation non dépréciés",
  constat:
    "Les titres de la filiale A (300 000 €) ne sont pas dépréciés alors que la quote-part de capitaux propres détenue ressort à 180 000 € à la clôture.",
  explication:
    "À l'inventaire, les titres de participation sont comparés à leur valeur d'utilité. Lorsque celle-ci devient inférieure au coût d'acquisition, une dépréciation s'impose. L'écart de 120 000 € n'est pas constaté.",
  mesure: { constate: 0, seuil: 120000, unite: "EUR", libelle: "dépréciation à constituer" },
  source: SOURCES.PCG_TITRES,
  comptesConcernes: ["261", "2961", "6866"],
  lignesSource: [],
  faisceau: ["filiale en perte", "quote-part SN < coût", "aucune écriture en 2961"],
  annotation: "Quote-part SN 180 k€ < coût 300 k€ — dépréciation 0",
  cibleRowId: "immofin-titres",
  preuve: [
    { etape: "Source", detail: "Comptes filiale A + grand-livre 26" },
    { etape: "Transformation", detail: "Coût 300 k€ − valeur d'utilité 180 k€" },
    { etape: "Règle", detail: "Dépréciation des titres (PCG art. 221-3)" },
    { etape: "Résultat", detail: "Dépréciation attendue 120 k€ vs 0" },
  ],
  statutRevue: "en_attente",
};

const siloImmoFin: SiloView = {
  siloId: "immobilisations-financieres",
  statement: stmt({
    titre: "Comptes 26/27 — Immobilisations financières",
    unite: "EUR",
    rows: [
      {
        id: "immofin-titres",
        label: "Titres de participation — filiale A",
        compte: "261",
        valeur: 300000,
        kind: "ligne",
        flaggedBy: "DEMO-IMMOFIN-1",
        severity: "majeur",
      },
      { id: "immofin-prets", label: "Prêts et créances rattachées", compte: "274", valeur: 50000, kind: "ligne" },
      { id: "immofin-depots", label: "Dépôts et cautionnements", compte: "275", valeur: 12000, kind: "ligne" },
      { id: "immofin-deprec", label: "Dépréciations (296)", compte: "2961", valeur: 0, kind: "ligne" },
      { id: "immofin-total", label: "Total net", valeur: 362000, kind: "total" },
    ],
  }),
  findings: [findImmoFin],
};

/* ────────────────────────────── Créances clients ────────────────────────── */

const findClients: Finding = {
  id: "DEMO-CLIENTS-1",
  family: "methodology",
  severity: "majeur",
  ruleId: "R-PCG-CREANCES",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "creances-clients",
  titre: "Créance litigieuse échue non dépréciée",
  constat:
    "Une créance sur le client Z de 145 000 €, échue depuis plus de 180 jours et en litige, reste en clients ordinaires (411) sans transfert en douteux ni dépréciation.",
  explication:
    "Le risque de non-recouvrement doit être apprécié à la clôture : reclassement en créances douteuses (416) et constatation d'une dépréciation (491). Une confirmation directe (ISA 505) est par ailleurs recommandée.",
  mesure: { constate: 0, seuil: 145000, unite: "EUR", libelle: "dépréciation à constituer" },
  source: SOURCES.PCG_CREANCES,
  comptesConcernes: ["411", "416", "491"],
  lignesSource: [1620],
  faisceau: ["échéance > 180 j", "litige connu", "aucune 491"],
  annotation: "145 k€ échus > 180 j — aucune dépréciation",
  cibleRowId: "clients-litige",
  preuve: [
    { etape: "Source", detail: "Balance âgée clients DEMO SA" },
    { etape: "Règle", detail: "Dépréciation des créances (PCG art. 214-17)" },
    { etape: "Résultat", detail: "Dépréciation attendue ≈ 145 k€ vs 0" },
  ],
  statutRevue: "en_attente",
};

const siloClients: SiloView = {
  siloId: "creances-clients",
  statement: stmt({
    titre: "Compte 41 — Clients et comptes rattachés",
    unite: "EUR",
    rows: [
      { id: "clients-ordinaires", label: "Clients ordinaires", compte: "411", valeur: 820000, kind: "ligne" },
      {
        id: "clients-litige",
        label: "Créance en litige — client Z",
        compte: "411",
        valeur: 145000,
        kind: "ligne",
        flaggedBy: "DEMO-CLIENTS-1",
        severity: "majeur",
      },
      { id: "clients-douteux", label: "Clients douteux (416)", compte: "416", valeur: 0, kind: "ligne" },
      { id: "clients-deprec", label: "Dépréciations (491)", compte: "491", valeur: 0, kind: "ligne" },
      { id: "clients-total", label: "Total clients net", valeur: 965000, kind: "total" },
    ],
  }),
  findings: [findClients],
};

/* ──────────────────── Autres créances & trésorerie ──────────────────────── */

const findTreso: Finding = {
  id: "DEMO-TRESO-1",
  family: "methodology",
  severity: "mineur",
  ruleId: "R-ISA-CONFIRM",
  ruleVersion: "1.0.0",
  cloison: "bilan-actif",
  siloId: "autres-creances-tresorerie",
  titre: "Écart de rapprochement bancaire non justifié",
  constat:
    "Le solde comptable de la banque principale (512) ressort à 420 000 € contre 405 000 € au relevé, soit un écart de 15 000 € non lettré et sans confirmation bancaire obtenue.",
  explication:
    "Tout écart de rapprochement doit être analysé et justifié. La confirmation directe auprès de la banque (ISA 505) constitue l'élément probant de référence sur l'existence et le solde de la trésorerie.",
  mesure: { constate: 15000, seuil: 0, unite: "EUR", libelle: "écart de rapprochement" },
  source: SOURCES.ISA_505,
  comptesConcernes: ["512", "580"],
  lignesSource: [2105],
  faisceau: ["écart non lettré", "aucune confirmation bancaire", "rapprochement non documenté"],
  annotation: "Écart de rapprochement 15 k€ non justifié",
  cibleRowId: "treso-banque",
  preuve: [
    { etape: "Source", detail: "Grand-livre 512 + relevé bancaire déc." },
    { etape: "Transformation", detail: "Solde comptable 420 k€ − relevé 405 k€" },
    { etape: "Règle", detail: "Confirmation externe (ISA 505)" },
    { etape: "Résultat", detail: "Écart 15 k€ à justifier" },
  ],
  statutRevue: "en_attente",
};

const siloTreso: SiloView = {
  siloId: "autres-creances-tresorerie",
  statement: stmt({
    titre: "Comptes 50/51/53 — Trésorerie et VMP",
    unite: "EUR",
    rows: [
      {
        id: "treso-banque",
        label: "Banque principale",
        compte: "512",
        valeur: 420000,
        kind: "ligne",
        flaggedBy: "DEMO-TRESO-1",
        severity: "mineur",
      },
      { id: "treso-vmp", label: "Valeurs mobilières de placement", compte: "503", valeur: 95000, kind: "ligne" },
      { id: "treso-caisse", label: "Caisse", compte: "531", valeur: 8000, kind: "ligne" },
      { id: "treso-total", label: "Total trésorerie", valeur: 523000, kind: "total" },
    ],
  }),
  findings: [findTreso],
};

/* ──────────────────────────── Capitaux propres ──────────────────────────── */

const findCP: Finding = {
  id: "DEMO-CP-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-CCOM-CAPITAL",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "capitaux-propres",
  titre: "Capitaux propres inférieurs à la moitié du capital",
  constat:
    "Après imputation du résultat déficitaire, les capitaux propres ressortent à 220 000 € pour un capital social de 500 000 €, soit en deçà de la moitié du capital, sans trace de consultation de l'assemblée.",
  explication:
    "Lorsque les capitaux propres deviennent inférieurs à la moitié du capital, une AG doit être consultée dans les quatre mois et la situation régularisée sous deux exercices. L'information et la procédure doivent être tracées (continuité d'exploitation également concernée).",
  mesure: { constate: 220000, seuil: 250000, unite: "EUR", libelle: "capitaux propres vs ½ capital" },
  source: SOURCES.CCOM_CAPITAL,
  comptesConcernes: ["101", "106", "119", "129"],
  lignesSource: [],
  faisceau: ["report à nouveau négatif", "résultat déficitaire", "aucune AG tracée"],
  annotation: "CP 220 k€ < 250 k€ (½ capital)",
  cibleRowId: "cp-total",
  preuve: [
    { etape: "Source", detail: "Grand-livre classes 10-12" },
    { etape: "Transformation", detail: "Capital 500 k€ + réserves + RAN + résultat" },
    { etape: "Règle", detail: "Perte de la moitié du capital (C. com. L.225-248)" },
    { etape: "Résultat", detail: "CP 220 k€ < seuil 250 k€" },
  ],
  statutRevue: "en_attente",
};

const siloCP: SiloView = {
  siloId: "capitaux-propres",
  statement: stmt({
    titre: "Classes 10-12 — Capitaux propres",
    unite: "EUR",
    rows: [
      { id: "cp-capital", label: "Capital social", compte: "101", valeur: 500000, kind: "ligne" },
      { id: "cp-reserves", label: "Réserves", compte: "106", valeur: 60000, kind: "ligne" },
      { id: "cp-ran", label: "Report à nouveau", compte: "119", valeur: -180000, kind: "ligne" },
      { id: "cp-resultat", label: "Résultat de l'exercice", compte: "129", valeur: -160000, kind: "ligne" },
      {
        id: "cp-total",
        label: "Total capitaux propres",
        valeur: 220000,
        kind: "total",
        flaggedBy: "DEMO-CP-1",
        severity: "majeur",
      },
    ],
  }),
  findings: [findCP],
};

/* ──────────────────────────── Dettes financières ────────────────────────── */

const findDettesFin: Finding = {
  id: "DEMO-DETTESFIN-1",
  family: "internal",
  severity: "mineur",
  ruleId: "R-IN-GEARING",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "dettes-financieres",
  titre: "Levier d'endettement élevé — covenant à surveiller",
  constat:
    "Les dettes financières (1 600 000 €) rapportées aux capitaux propres (220 000 €) donnent un gearing de 7,3x, très au-dessus du seuil de vigilance interne de 3x.",
  explication:
    "Un levier élevé fait peser un risque sur la continuité et peut déclencher des covenants bancaires. Paramètre interne de vigilance (non opposable) appelant un examen des échéances et des clauses contractuelles.",
  mesure: { constate: 7.3, seuil: 3, unite: "ratio", libelle: "gearing (dettes / CP)" },
  source: SOURCES.ISA_315,
  comptesConcernes: ["164", "519", "1688"],
  lignesSource: [],
  faisceau: ["CP fortement dégradés", "concours bancaires courants", "échéances rapprochées"],
  annotation: "Gearing 7,3x — covenant à surveiller",
  cibleRowId: "dettesfin-emprunts",
  preuve: [
    { etape: "Source", detail: "Grand-livre 16/17 + capitaux propres" },
    { etape: "Transformation", detail: "Dettes 1 600 k€ / CP 220 k€" },
    { etape: "Règle", detail: "Seuil interne gearing > 3x (vigilance)" },
    { etape: "Résultat", detail: "Gearing 7,3x — examen des covenants" },
  ],
  statutRevue: "en_attente",
};

const siloDettesFin: SiloView = {
  siloId: "dettes-financieres",
  statement: stmt({
    titre: "Comptes 16/17 — Dettes financières",
    unite: "EUR",
    rows: [
      {
        id: "dettesfin-emprunts",
        label: "Emprunts auprès des établissements de crédit",
        compte: "164",
        valeur: 1600000,
        kind: "ligne",
        flaggedBy: "DEMO-DETTESFIN-1",
        severity: "mineur",
      },
      { id: "dettesfin-concours", label: "Concours bancaires courants", compte: "519", valeur: 120000, kind: "ligne" },
      { id: "dettesfin-interets", label: "Intérêts courus", compte: "1688", valeur: 18000, kind: "ligne" },
      { id: "dettesfin-total", label: "Total dettes financières", valeur: 1738000, kind: "total" },
    ],
  }),
  findings: [findDettesFin],
};

/* ──────────────────────────── Dettes fournisseurs ───────────────────────── */

const findFourn: Finding = {
  id: "DEMO-FOURN-1",
  family: "methodology",
  severity: "majeur",
  ruleId: "R-PCG-CUTOFF-ACHATS",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "dettes-fournisseurs",
  titre: "Charges à payer de fin d'exercice sous-évaluées (cut-off)",
  constat:
    "Les factures non parvenues (408) s'élèvent à 12 000 € alors que les bons de réception de décembre non facturés représentent environ 95 000 € de charges rattachables à l'exercice.",
  explication:
    "Les charges de la période dont la facture n'est pas parvenue doivent être rattachées via le compte 408. Leur sous-évaluation minore les charges et surévalue le résultat de l'exercice.",
  mesure: { constate: 12000, seuil: 95000, unite: "EUR", libelle: "FNP à constater" },
  source: SOURCES.PCG_FNP,
  comptesConcernes: ["401", "408", "607"],
  lignesSource: [2540, 2541],
  faisceau: ["réceptions déc. non facturées", "FNP figées vs N-1", "rattachement des charges"],
  annotation: "FNP 12 k€ vs ~95 k€ (réceptions déc.)",
  cibleRowId: "fourn-fnp",
  preuve: [
    { etape: "Source", detail: "Bons de réception déc. + grand-livre 408" },
    { etape: "Règle", detail: "Rattachement des charges — factures non parvenues (PCG cpt. 408)" },
    { etape: "Résultat", detail: "FNP constatées 12 k€ vs ~95 k€ attendues" },
  ],
  statutRevue: "en_attente",
};

const siloFourn: SiloView = {
  siloId: "dettes-fournisseurs",
  statement: stmt({
    titre: "Compte 40 — Fournisseurs et comptes rattachés",
    unite: "EUR",
    rows: [
      { id: "fourn-ordinaires", label: "Fournisseurs ordinaires", compte: "401", valeur: 540000, kind: "ligne" },
      { id: "fourn-effets", label: "Effets à payer", compte: "403", valeur: 60000, kind: "ligne" },
      {
        id: "fourn-fnp",
        label: "Factures non parvenues",
        compte: "408",
        valeur: 12000,
        kind: "ligne",
        flaggedBy: "DEMO-FOURN-1",
        severity: "majeur",
      },
      { id: "fourn-total", label: "Total fournisseurs", valeur: 612000, kind: "total" },
    ],
  }),
  findings: [findFourn],
};

/* ─────────────────────── Dettes fiscales & sociales ─────────────────────── */

const findFiscSoc: Finding = {
  id: "DEMO-FISCSOC-1",
  family: "internal",
  severity: "informatif",
  ruleId: "R-IN-CP",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "dettes-fiscales-sociales",
  titre: "Provision pour congés payés stable malgré la hausse de masse salariale",
  constat:
    "La dette pour congés payés (428) reste à 90 000 € alors que la masse salariale progresse de 18 % sur l'exercice, ce qui interroge l'exhaustivité de la charge à payer.",
  explication:
    "La provision pour congés payés évolue normalement avec la masse salariale et les droits acquis. Une stabilité en contexte de forte hausse salariale est un indice de sous-évaluation à investiguer (paramètre interne).",
  mesure: { constate: 0, seuil: 18, unite: "%", libelle: "évolution CP vs masse salariale" },
  source: SOURCES.ISA_520,
  comptesConcernes: ["428", "431", "4455"],
  lignesSource: [],
  faisceau: ["masse salariale +18 %", "CP à payer figés", "droits acquis non recalculés"],
  annotation: "Provision CP figée malgré +18 % de masse salariale",
  cibleRowId: "fiscsoc-cp",
  preuve: [
    { etape: "Source", detail: "Grand-livre 42/43/44 + journal de paie" },
    { etape: "Règle", detail: "Corrélation analytique (ISA 520)" },
    { etape: "Résultat", detail: "Exhaustivité des CP à payer à vérifier" },
  ],
  statutRevue: "en_attente",
};

const siloFiscSoc: SiloView = {
  siloId: "dettes-fiscales-sociales",
  statement: stmt({
    titre: "Comptes 42/43/44 — Dettes fiscales et sociales",
    unite: "EUR",
    rows: [
      { id: "fiscsoc-sociales", label: "Dettes sociales (organismes)", compte: "431", valeur: 145000, kind: "ligne" },
      {
        id: "fiscsoc-cp",
        label: "Congés payés à payer",
        compte: "428",
        valeur: 90000,
        kind: "ligne",
        flaggedBy: "DEMO-FISCSOC-1",
        severity: "informatif",
      },
      { id: "fiscsoc-tva", label: "TVA à décaisser", compte: "4455", valeur: 60000, kind: "ligne" },
      { id: "fiscsoc-total", label: "Total dettes fiscales & sociales", valeur: 295000, kind: "total" },
    ],
  }),
  findings: [findFiscSoc],
};

/* ───────────────────────── Produits constatés d'avance ──────────────────── */

const findPCA: Finding = {
  id: "DEMO-PCA-1",
  family: "methodology",
  severity: "mineur",
  ruleId: "R-PCG-PCA",
  ruleVersion: "1.0.0",
  cloison: "bilan-passif",
  siloId: "pca",
  titre: "Produit encaissé d'avance non neutralisé",
  constat:
    "Un contrat de maintenance annuel de 48 000 € encaissé le 01/10/N est intégralement comptabilisé en produits, sans constatation d'avance pour les 9 mois relevant de N+1 (36 000 €).",
  explication:
    "Les produits enregistrés mais rattachables à un exercice ultérieur doivent être neutralisés via le compte 487. L'absence de PCA surévalue le chiffre d'affaires et le résultat de l'exercice.",
  mesure: { constate: 0, seuil: 36000, unite: "EUR", libelle: "PCA à constater" },
  source: SOURCES.PCG_CCA_PCA,
  comptesConcernes: ["487", "706"],
  lignesSource: [2480],
  faisceau: ["contrat annuel encaissé en T4", "aucun 487", "rattachement des produits"],
  annotation: "9/12 du contrat relèvent de N+1 → 36 k€ manquants",
  cibleRowId: "pca-maintenance",
  preuve: [
    { etape: "Source", detail: "Contrat maintenance + pièce d'encaissement" },
    { etape: "Règle", detail: "Étalement prorata temporis (PCG cpt. 487)" },
    { etape: "Résultat", detail: "PCA constatée 0 € vs 36 000 € attendus" },
  ],
  statutRevue: "en_attente",
};

const siloPCA: SiloView = {
  siloId: "pca",
  statement: stmt({
    titre: "Compte 487 — Produits constatés d'avance",
    unite: "EUR",
    rows: [
      { id: "pca-divers", label: "PCA divers", compte: "487", valeur: 15000, kind: "ligne" },
      {
        id: "pca-maintenance",
        label: "Contrat maintenance (part N+1 attendue)",
        compte: "487",
        valeur: 0,
        kind: "ligne",
        flaggedBy: "DEMO-PCA-1",
        severity: "mineur",
      },
      { id: "pca-total", label: "Total PCA", valeur: 15000, kind: "total" },
    ],
  }),
  findings: [findPCA],
};

/* ──────────────────────── Achats & charges externes ─────────────────────── */

const findAchats: Finding = {
  id: "DEMO-ACHATS-1",
  family: "methodology",
  severity: "mineur",
  ruleId: "R-ISA-520-HONORAIRES",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "achats-charges-externes",
  titre: "Hausse atypique des honoraires",
  constat:
    "Le poste honoraires (622) passe de 95 000 € à 280 000 € (+195 %), concentré sur un prestataire unique apparu en cours d'exercice.",
  explication:
    "Une variation analytique très supérieure à l'évolution d'activité justifie des investigations : réalité de la prestation, rattachement, et risque de charges sans contrepartie ou de détournement.",
  mesure: { constate: 195, seuil: 25, unite: "%", libelle: "variation honoraires vs N-1" },
  source: SOURCES.ISA_520,
  comptesConcernes: ["622", "628"],
  lignesSource: [1880, 1881],
  faisceau: ["prestataire unique nouveau", "absence de contrat formalisé", "factures rondes"],
  annotation: "Honoraires +195 % vs N-1 — prestataire unique",
  cibleRowId: "achats-honoraires",
  preuve: [
    { etape: "Source", detail: "Grand-livre 622 N et N-1" },
    { etape: "Transformation", detail: "(280 − 95) / 95 = +195 %" },
    { etape: "Règle", detail: "Procédures analytiques (ISA 520)" },
    { etape: "Résultat", detail: "Variation à investiguer" },
  ],
  statutRevue: "en_attente",
};

const siloAchats: SiloView = {
  siloId: "achats-charges-externes",
  statement: stmt({
    titre: "Comptes 60-62 — Achats & charges externes",
    unite: "EUR",
    rows: [
      { id: "achats-mp", label: "Achats de matières (60)", compte: "601", valeur: 2100000, kind: "ligne" },
      { id: "achats-soustraitance", label: "Sous-traitance (611)", compte: "611", valeur: 320000, kind: "ligne" },
      {
        id: "achats-honoraires",
        label: "Honoraires (622)",
        compte: "622",
        valeur: 280000,
        kind: "ligne",
        flaggedBy: "DEMO-ACHATS-1",
        severity: "mineur",
      },
      { id: "achats-total", label: "Total achats & charges externes", valeur: 2700000, kind: "total" },
    ],
  }),
  findings: [findAchats],
};

/* ───────────────────────────── Charges de personnel ─────────────────────── */

const findPersonnel: Finding = {
  id: "DEMO-PERSO-1",
  family: "internal",
  severity: "informatif",
  ruleId: "R-IN-MASSE-SAL",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "charges-personnel",
  titre: "Masse salariale en hausse sans variation d'effectif",
  constat:
    "Les salaires bruts (641) progressent de 18 % (1 570 000 € → 1 850 000 €) alors que l'effectif moyen documenté est stable.",
  explication:
    "Une hausse de masse salariale déconnectée de l'effectif appelle un rapprochement avec le journal de paie (primes exceptionnelles, salariés fictifs, rétroactivité). Paramètre interne de vigilance.",
  mesure: { constate: 18, seuil: 10, unite: "%", libelle: "variation masse salariale" },
  source: SOURCES.ISA_520,
  comptesConcernes: ["641", "645"],
  lignesSource: [],
  faisceau: ["effectif stable", "hausse concentrée en fin d'exercice", "écart paie / compta"],
  annotation: "+18 % de masse salariale — effectif stable",
  cibleRowId: "perso-salaires",
  preuve: [
    { etape: "Source", detail: "Grand-livre 641 N et N-1 + DSN" },
    { etape: "Transformation", detail: "(1 850 − 1 570) / 1 570 = +18 %" },
    { etape: "Règle", detail: "Procédures analytiques (ISA 520)" },
    { etape: "Résultat", detail: "Rapprochement paie / comptabilité à mener" },
  ],
  statutRevue: "en_attente",
};

const siloPersonnel: SiloView = {
  siloId: "charges-personnel",
  statement: stmt({
    titre: "Comptes 63/64 — Charges de personnel",
    unite: "EUR",
    rows: [
      {
        id: "perso-salaires",
        label: "Salaires bruts",
        compte: "641",
        valeur: 1850000,
        kind: "ligne",
        flaggedBy: "DEMO-PERSO-1",
        severity: "informatif",
      },
      { id: "perso-charges", label: "Charges sociales", compte: "645", valeur: 720000, kind: "ligne" },
      { id: "perso-taxes", label: "Impôts & taxes sur rémunérations", compte: "631", valeur: 45000, kind: "ligne" },
      { id: "perso-total", label: "Total charges de personnel", valeur: 2615000, kind: "total" },
    ],
  }),
  findings: [findPersonnel],
};

/* ─────────────────── Dotations, amortissements & provisions ──────────────── */

const findDAP: Finding = {
  id: "DEMO-DAP-1",
  family: "methodology",
  severity: "mineur",
  ruleId: "R-PCG-REPRISE",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "dap",
  titre: "Reprise de provision sans extinction du risque",
  constat:
    "Une reprise de provision de 90 000 € (compte 78) améliore le résultat alors que le risque couvert (litige prud'homal) demeure ouvert à la clôture.",
  explication:
    "Une provision n'est reprise qu'à hauteur de la disparition ou de la réduction effective du risque. Une reprise prématurée majore artificiellement le résultat de l'exercice.",
  mesure: { constate: 90000, seuil: 0, unite: "EUR", libelle: "reprise à justifier" },
  source: SOURCES.PCG_PROVISIONS,
  comptesConcernes: ["781", "151"],
  lignesSource: [2620],
  faisceau: ["litige toujours ouvert", "reprise en fin d'exercice", "aucune décision de justice"],
  annotation: "Reprise 90 k€ sans extinction du risque",
  cibleRowId: "dap-reprises",
  preuve: [
    { etape: "Source", detail: "Grand-livre 78 + suivi des litiges" },
    { etape: "Règle", detail: "Reprise sur disparition du risque (PCG art. 322-1)" },
    { etape: "Résultat", detail: "Reprise 90 k€ à justifier ou annuler" },
  ],
  statutRevue: "en_attente",
};

const siloDAP: SiloView = {
  siloId: "dap",
  statement: stmt({
    titre: "Comptes 68/78 — Dotations & reprises",
    unite: "EUR",
    rows: [
      { id: "dap-amort", label: "Dotations aux amortissements", compte: "6811", valeur: 240000, kind: "ligne" },
      { id: "dap-deprec", label: "Dotations aux dépréciations", compte: "6817", valeur: 35000, kind: "ligne" },
      {
        id: "dap-reprises",
        label: "Reprises sur provisions",
        compte: "781",
        valeur: 90000,
        kind: "ligne",
        flaggedBy: "DEMO-DAP-1",
        severity: "mineur",
      },
      { id: "dap-total", label: "Dotations nettes des reprises", valeur: 185000, kind: "total" },
    ],
  }),
  findings: [findDAP],
};

/* ───────────────────────────── Résultat financier ───────────────────────── */

const findResFin: Finding = {
  id: "DEMO-RESFIN-1",
  family: "methodology",
  severity: "mineur",
  ruleId: "R-ISA-520-FIN",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "resultat-financier",
  titre: "Produit de participation incohérent avec la situation de la filiale",
  constat:
    "Un produit de participation de 120 000 € (compte 761) est comptabilisé au titre de la filiale A, dont les comptes font pourtant ressortir une perte et une situation nette dégradée.",
  explication:
    "La comptabilisation d'un dividende suppose une décision de distribution et une capacité distributive. L'incohérence avec la situation de la filiale (également non dépréciée) appelle un examen des justificatifs.",
  mesure: { constate: 120000, seuil: 0, unite: "EUR", libelle: "produit de participation à justifier" },
  source: SOURCES.ISA_520,
  comptesConcernes: ["761", "261"],
  lignesSource: [2705],
  faisceau: ["filiale en perte", "aucune décision d'AG transmise", "lien avec titres non dépréciés"],
  annotation: "Dividende 120 k€ d'une filiale en perte — cohérence ?",
  cibleRowId: "resfin-produits",
  preuve: [
    { etape: "Source", detail: "Grand-livre 76 + comptes filiale A" },
    { etape: "Règle", detail: "Procédures analytiques / cohérence (ISA 520)" },
    { etape: "Résultat", detail: "Justificatifs de distribution à obtenir" },
  ],
  statutRevue: "en_attente",
};

const siloResFin: SiloView = {
  siloId: "resultat-financier",
  statement: stmt({
    titre: "Comptes 66/76 — Résultat financier",
    unite: "EUR",
    rows: [
      { id: "resfin-interets", label: "Charges d'intérêts", compte: "661", valeur: -78000, kind: "ligne" },
      {
        id: "resfin-produits",
        label: "Produits de participation",
        compte: "761",
        valeur: 120000,
        kind: "ligne",
        flaggedBy: "DEMO-RESFIN-1",
        severity: "mineur",
      },
      { id: "resfin-total", label: "Résultat financier", valeur: 42000, kind: "total" },
    ],
  }),
  findings: [findResFin],
};

/* ──────────────────────────── Résultat exceptionnel ─────────────────────── */

const findResExc: Finding = {
  id: "DEMO-RESEXC-1",
  family: "methodology",
  severity: "mineur",
  ruleId: "R-PCG-EXCEPTIONNEL",
  ruleVersion: "1.0.0",
  cloison: "resultat",
  siloId: "resultat-exceptionnel",
  titre: "Charges récurrentes classées en exceptionnel",
  constat:
    "95 000 € de charges (compte 678) sont classés en exceptionnel alors qu'elles présentent un caractère récurrent lié à l'exploitation (pénalités commerciales).",
  explication:
    "Le résultat exceptionnel ne doit accueillir que les opérations non récurrentes étrangères à l'activité ordinaire. Un classement erroné fausse la lecture du résultat d'exploitation.",
  mesure: { constate: 95000, seuil: 0, unite: "EUR", libelle: "charges à reclasser en exploitation" },
  source: SOURCES.PCG_STRUCTURE,
  comptesConcernes: ["678", "671"],
  lignesSource: [2750],
  faisceau: ["charges récurrentes", "lien avec l'exploitation", "classement en 67"],
  annotation: "95 k€ « exceptionnels » récurrents — reclassement",
  cibleRowId: "resexc-autres",
  preuve: [
    { etape: "Source", detail: "Grand-livre 67 + nature des opérations" },
    { etape: "Règle", detail: "Classification courant / exceptionnel (PCG)" },
    { etape: "Résultat", detail: "95 k€ à reclasser en exploitation" },
  ],
  statutRevue: "en_attente",
};

const siloResExc: SiloView = {
  siloId: "resultat-exceptionnel",
  statement: stmt({
    titre: "Comptes 67/77 — Résultat exceptionnel",
    unite: "EUR",
    rows: [
      { id: "resexc-charges", label: "Charges exceptionnelles (671)", compte: "671", valeur: -40000, kind: "ligne" },
      {
        id: "resexc-autres",
        label: "Autres charges exceptionnelles (678)",
        compte: "678",
        valeur: -95000,
        kind: "ligne",
        flaggedBy: "DEMO-RESEXC-1",
        severity: "mineur",
      },
      { id: "resexc-produits", label: "Produits exceptionnels (771)", compte: "771", valeur: 30000, kind: "ligne" },
      { id: "resexc-total", label: "Résultat exceptionnel", valeur: -105000, kind: "total" },
    ],
  }),
  findings: [findResExc],
};

/* ───────────────────────── Engagements hors bilan ───────────────────────── */

const findEngag: Finding = {
  id: "DEMO-ENGAG-1",
  family: "hardLaw",
  severity: "majeur",
  ruleId: "R-PCG-ENGAGEMENTS",
  ruleVersion: "1.0.0",
  cloison: "annexe",
  siloId: "engagements-hors-bilan",
  titre: "Engagements donnés non mentionnés en annexe",
  constat:
    "Une caution donnée au profit de la filiale A (250 000 €) et les loyers de crédit-bail restant dus (180 000 €) ne figurent pas dans l'information annexe.",
  explication:
    "Les engagements financiers hors bilan significatifs (cautions, crédit-bail, retraites) doivent être mentionnés en annexe par catégorie et pour leur montant. Leur omission prive le lecteur d'une information essentielle sur les risques.",
  mesure: { constate: 0, seuil: 430000, unite: "EUR", libelle: "engagements à mentionner" },
  source: SOURCES.PCG_ENGAGEMENTS,
  comptesConcernes: ["8011", "8016"],
  lignesSource: [],
  faisceau: ["caution intra-groupe", "contrat de crédit-bail", "annexe muette"],
  annotation: "Caution 250 k€ + crédit-bail 180 k€ absents de l'annexe",
  cibleRowId: "engag-caution",
  preuve: [
    { etape: "Source", detail: "Contrats de caution et de crédit-bail" },
    { etape: "Règle", detail: "Information sur les engagements (PCG art. 831-2)" },
    { etape: "Résultat", detail: "430 k€ d'engagements à mentionner en annexe" },
  ],
  statutRevue: "en_attente",
};

const siloEngag: SiloView = {
  siloId: "engagements-hors-bilan",
  statement: stmt({
    titre: "Classe 8 — Engagements hors bilan",
    unite: "EUR",
    note: "Engagements donnés et reçus reconstitués (hors bilan).",
    rows: [
      {
        id: "engag-caution",
        label: "Caution donnée — filiale A",
        compte: "8011",
        valeur: 250000,
        kind: "ligne",
        flaggedBy: "DEMO-ENGAG-1",
        severity: "majeur",
      },
      { id: "engag-cb", label: "Crédit-bail — loyers restant dus", compte: "8016", valeur: 180000, kind: "ligne" },
      { id: "engag-recus", label: "Engagements reçus", compte: "802", valeur: 0, kind: "ligne" },
      { id: "engag-total", label: "Total engagements donnés", valeur: 430000, kind: "total" },
    ],
  }),
  findings: [findEngag],
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

/* ──────────────────── Rapprochements multi-documents (8 cycles) ──────────── */
/* Silos issus du module rapprochement (balance âgée ↔ GL, inventaire ↔ compta,*/
/* relevés ↔ 512, CA3 ↔ TVA, etc.). Seuil ISA 320 calculé sur le CA pour       */
/* pondérer le risque de faux positif de chaque écart.                        */

const silosRapprochement: SiloView[] = buildAllRapprochementSilos(
  computeMateriality({ chiffreAffaires: 6340000 }),
);

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
  silos: [
    // Bilan — Actif
    siloIncorp,
    siloImmo,
    siloImmoFin,
    siloStock,
    siloClients,
    siloCCA,
    siloTreso,
    // Bilan — Passif
    siloCP,
    siloProv,
    siloDettesFin,
    siloFourn,
    siloFiscSoc,
    siloPCA,
    // Compte de résultat
    siloCA,
    siloAchats,
    siloPersonnel,
    siloDAP,
    siloResFin,
    siloResExc,
    // Annexe
    siloEngag,
    // Rapprochements multi-documents (8 cycles)
    ...silosRapprochement,
  ],
};

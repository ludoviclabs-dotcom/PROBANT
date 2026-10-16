import type { Severity } from "@/lib/canonical-model/finding";

/**
 * Contenu éditorial de la landing. Les scènes de « revue par cloison » et la chaîne de preuve reprennent les
 * constats et les montants du dossier de démonstration DEMO SA (lib/demo/dataset.ts) : mêmes références,
 * mêmes seuils, mêmes sources. La landing ne calcule rien, elle raconte le dossier de démonstration.
 */

const INK = "var(--pb-ink)";
const INK_2 = "var(--pb-ink-2)";
const INK_3 = "var(--pb-ink-3)";
const RULE = "var(--pb-rule)";

/* ── 01 · Trois couches ─────────────────────────────────────────────────────── */

type LayerLine = [x1: number, y1: number, x2: number, y2: number, color: string, width: number, dash: string];

export interface LayerDrawing {
  lines: LayerLine[];
  rings: { cx: number; cy: number; r: number }[];
  squares: [number, number][];
  labels: string[];
}

export interface Layer extends LayerDrawing {
  n: string;
  tag: string;
  title: string;
  text: string;
}

const COUNTING_LINES: LayerLine[] = Array.from({ length: 16 }, (_, i) => {
  const x = 12 + i * 19;
  const h = i === 11 ? 86 : 18 + ((i * 37) % 30);
  return [x, 120, x, 120 - h, i === 11 ? INK : INK_3, i === 11 ? 1.5 : 1, "none"];
});

export const LAYERS: Layer[] = [
  {
    n: "01",
    tag: "versionné",
    title: "Socle normatif",
    text: "Règles opposables (LPF, PCG) et méthode d’audit (ISA, NEP), versionnées et citées. Les heuristiques internes restent à part.",
    lines: [
      [0, 24, 300, 24, INK, 2, "none"],
      [0, 58, 300, 58, INK, 2, "none"],
      [0, 92, 300, 92, INK_2, 1.5, "4 3"],
      [0, 126, 300, 126, INK_3, 1.2, "1 3"],
      [300, 14, 300, 136, RULE, 1, "none"],
    ],
    rings: [],
    squares: [[306, 20], [306, 54], [306, 88], [306, 122]],
    labels: ["LPF A.47 A-1", "PCG", "ISA · NEP", "seuils internes"],
  },
  {
    n: "02",
    tag: "calcule, compare",
    title: "Moteur de constat",
    text: "Empreinte du FEC, rapprochements par cycle, détection d’anomalies par cloison. Chaque écart porte son seuil, son montant et sa source.",
    lines: [[0, 120, 320, 120, RULE, 1, "none"], [196, 18, 196, 136, INK, 1, "4 3"], ...COUNTING_LINES],
    rings: [{ cx: 221, cy: 34, r: 12 }],
    squares: [],
    labels: ["lignes FEC", "seuil", "écart → constat"],
  },
  {
    n: "03",
    tag: "restitue",
    title: "Restitution par cloison",
    text: "Synthèse par gravité, dossier de preuve, décision Valider ou Écarter par l’auditeur. Aucun résultat n’est présenté comme un feu vert juridique.",
    lines: [
      [0, 22, 150, 22, INK_3, 6, "none"],
      [0, 50, 120, 50, INK_3, 6, "none"],
      [0, 78, 176, 78, INK, 6, "none"],
      [0, 106, 96, 106, INK_3, 6, "none"],
      [0, 134, 132, 134, INK_3, 6, "none"],
      [196, 78, 300, 78, INK, 1, "4 3"],
    ],
    rings: [{ cx: 186, cy: 78, r: 11 }],
    squares: [[302, 74]],
    labels: ["5 cloisons", "ligne cerclée", "source citée"],
  },
];

/* ── 02 · Revue par cloison ─────────────────────────────────────────────────── */

export type CloisonFamily = "droit dur" | "présomption d’audit" | "paramètre interne";

export interface CloisonScene {
  label: string;
  account: string;
  title: string;
  /** [compte, libellé, valeur] ; un compte vide marque une ligne de total. */
  rows: [account: string, label: string, value: string][];
  /** Indice de la ligne cerclée. */
  flag: number;
  ref: string;
  severity: Severity;
  family: CloisonFamily;
  findingTitle: string;
  found: string;
  threshold: string;
  source: string;
  bundle: string;
}

export const CLOISON_SCENES: CloisonScene[] = [
  {
    label: "Immobilisations corporelles",
    account: "215",
    title: "Compte 215 — Installations techniques",
    rows: [["215", "Valeur brute", "480 000"], ["28154", "Amortissements cumulés", "−192 000"], ["215", "Valeur nette comptable", "288 000"]],
    flag: 2,
    ref: "DEMO-IMMO-1",
    severity: "majeur",
    family: "droit dur",
    findingTitle: "Rupture du plan d’amortissement",
    found: "40 %",
    threshold: "20 % (taux N-1)",
    source: "PCG art. 214-13",
    bundle: "dotation ×2 vs N-1 · aucune note en annexe · permanence des méthodes rompue",
  },
  {
    label: "Provisions",
    account: "15",
    title: "Classe 15 — Provisions pour risques et charges",
    rows: [["1511", "Provisions pour litiges", "32 000"], ["1512", "Provisions pour garanties", "18 000"], ["1515", "Provisions pour pertes sur contrats", "0"], ["", "Total provisions", "50 000"]],
    flag: 2,
    ref: "DEMO-PROV-1",
    severity: "bloquant",
    family: "présomption d’audit",
    findingTitle: "Perte sur contrat probable non provisionnée",
    found: "0 €",
    threshold: "145 000 € à constituer",
    source: "PCG art. 322-1",
    bundle: "contrat à marge négative · aucune écriture en 151x · engagement ferme",
  },
  {
    label: "Chiffre d’affaires",
    account: "70",
    title: "Compte 70 — Chiffre d’affaires par trimestre",
    rows: [["70", "T1", "1 450 000"], ["70", "T2", "1 520 000"], ["70", "T3", "1 380 000"], ["70", "T4, dont 312 k€ saisis au 31/12", "1 990 000"], ["", "CA annuel", "6 340 000"]],
    flag: 3,
    ref: "DEMO-CA-1",
    severity: "majeur",
    family: "présomption d’audit",
    findingTitle: "Ventes de décembre antidatées (cut-off)",
    found: "312 000 €",
    threshold: "0 €",
    source: "ISA 240",
    bundle: "écritures manuelles au 31/12 · livraison en janvier · journal OD au lieu des ventes",
  },
  {
    label: "Charges constatées d’avance",
    account: "486",
    title: "Compte 486 — Charges constatées d’avance",
    rows: [["486", "Loyers d’avance", "12 000"], ["486", "Assurances (part 2025 attendue)", "0"], ["", "Total CCA", "12 000"]],
    flag: 1,
    ref: "DEMO-CCA-1",
    severity: "mineur",
    family: "présomption d’audit",
    findingTitle: "Charge d’assurance non étalée",
    found: "0 €",
    threshold: "18 000 € (9/12 de la prime)",
    source: "PCG cpt. 486",
    bundle: "prime annuelle · paiement au T4 · aucun 486",
  },
  {
    label: "Stocks",
    account: "3",
    title: "Classe 3 — Stocks par catégorie",
    rows: [["31", "Matières premières", "340 000"], ["355", "Produits finis, réf. M-118", "210 000"], ["397", "Dépréciations", "0"], ["", "Stock net", "550 000"]],
    flag: 1,
    ref: "DEMO-STOCK-1",
    severity: "mineur",
    family: "paramètre interne",
    findingTitle: "Rotation faible sans dépréciation",
    found: "540 jours",
    threshold: "365 jours (vigilance interne)",
    source: "PCG art. 214-19",
    bundle: "rotation > 540 j · aucune 397 · stock dormant",
  },
];

/* ── 03 · Dossier de preuve ─────────────────────────────────────────────────── */

export interface ProofCase {
  id: string;
  label: string;
  /** Source, transformation, règle, résultat : les quatre maillons avant la décision de l'auditeur. */
  chain: [string, string, string, string];
}

export const PROOF_CASES: ProofCase[] = [
  {
    id: "DEMO-CA-1",
    label: "DEMO-CA-1 · Chiffre d’affaires",
    chain: ["FEC, journal OD, écritures 2310 à 2312", "Croisement date d’écriture et date de livraison", "Cut-off et présomption sur le revenu (ISA 240)", "312 000 € à requalifier en produits 2025"],
  },
  {
    id: "DEMO-PROV-1",
    label: "DEMO-PROV-1 · Provisions",
    chain: ["Suivi des contrats, affaire #C-2041", "Coûts à terminaison − produits à recevoir", "Perte probable ⇒ provision (PCG art. 322-1)", "Provision constatée 0 € contre 145 000 € attendus"],
  },
  {
    id: "DEMO-IMMO-1",
    label: "DEMO-IMMO-1 · Immobilisations",
    chain: ["FEC, journal OD, écritures 1204 et 1205", "Cumul des dotations 215 rapporté à la valeur brute", "Comparaison des taux N et N-1 (PCG art. 214-13)", "Taux 40 % contre 20 % attendus, écart de 20 points"],
  },
];

export const PROOF_STEPS = ["Source", "Transformation", "Règle", "Résultat", "Décision"] as const;

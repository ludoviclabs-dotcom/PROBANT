/**
 * Taxonomie de restitution : cloisons (états) et silos (catégories analytiques).
 *
 * Le PCG répartit les opérations en huit classes de comptes : 1 à 5 au bilan,
 * 6 et 7 au résultat. La « restitution par cloison » de PROBANT reprend cette
 * structure ; chaque cloison éclate en silos thématiques (immobilisations,
 * provisions, CCA, etc.) reliés à des préfixes de comptes du plan comptable.
 */

export type CloisonId =
  | "bilan-actif"
  | "bilan-passif"
  | "resultat"
  | "flux"
  | "annexe"
  | "journaux"
  | "tva-fiscalite";

export interface Cloison {
  id: CloisonId;
  label: string;
  short: string;
  description: string;
}

export const CLOISONS: Cloison[] = [
  {
    id: "bilan-actif",
    label: "Bilan — Actif",
    short: "Actif",
    description: "Emplois : immobilisations, stocks, créances, trésorerie.",
  },
  {
    id: "bilan-passif",
    label: "Bilan — Passif",
    short: "Passif",
    description: "Ressources : capitaux propres, provisions, dettes.",
  },
  {
    id: "resultat",
    label: "Compte de résultat",
    short: "Résultat",
    description: "Charges (classe 6) et produits (classe 7) de l'exercice.",
  },
  {
    id: "flux",
    label: "Tableau de flux",
    short: "Flux",
    description: "Flux de trésorerie reconstitués.",
  },
  {
    id: "annexe",
    label: "Annexe",
    short: "Annexe",
    description: "Informations complémentaires et notes obligatoires.",
  },
  {
    id: "journaux",
    label: "Journaux & écritures",
    short: "Journaux",
    description: "Contrôles d'admissibilité et écritures atypiques.",
  },
  {
    id: "tva-fiscalite",
    label: "TVA & fiscalité",
    short: "TVA",
    description: "Cohérence TVA collectée / déductible et fiscalité.",
  },
];

export interface Silo {
  id: string;
  label: string;
  cloison: CloisonId;
  /** Préfixes de comptes PCG rattachés à ce silo. */
  comptes: string[];
  description: string;
}

/**
 * Catalogue des silos analytiques du MVP. L'ordre détermine l'affichage.
 */
export const SILOS: Silo[] = [
  // --- Bilan actif ---
  {
    id: "immobilisations-incorporelles",
    label: "Immobilisations incorporelles",
    cloison: "bilan-actif",
    comptes: ["20", "280", "290"],
    description: "Frais, fonds commercial, logiciels, et amortissements liés.",
  },
  {
    id: "immobilisations-corporelles",
    label: "Immobilisations corporelles",
    cloison: "bilan-actif",
    comptes: ["21", "281", "291"],
    description: "Terrains, constructions, installations, matériels.",
  },
  {
    id: "immobilisations-financieres",
    label: "Immobilisations financières",
    cloison: "bilan-actif",
    comptes: ["26", "27", "296", "297"],
    description: "Titres de participation, prêts, dépôts et cautionnements.",
  },
  {
    id: "stocks",
    label: "Stocks & en-cours",
    cloison: "bilan-actif",
    comptes: ["3", "39"],
    description: "Matières, marchandises, productions en cours et dépréciations.",
  },
  {
    id: "creances-clients",
    label: "Créances clients",
    cloison: "bilan-actif",
    comptes: ["411", "413", "416", "418", "491"],
    description: "Clients, effets à recevoir, douteux, factures à établir.",
  },
  {
    id: "rapprochement-clients",
    label: "Rapprochement créances clients",
    cloison: "bilan-actif",
    comptes: ["411"],
    description:
      "Confrontation balance âgée ↔ grand-livre auxiliaire : écarts de solde, périmètre et dépréciation.",
  },
  {
    id: "cca",
    label: "Charges constatées d'avance",
    cloison: "bilan-actif",
    comptes: ["486"],
    description: "Charges enregistrées rattachables à un exercice ultérieur.",
  },
  {
    id: "autres-creances-tresorerie",
    label: "Autres créances & trésorerie",
    cloison: "bilan-actif",
    comptes: ["44", "46", "50", "51", "53", "54"],
    description: "État, débiteurs divers, VMP et disponibilités.",
  },
  // --- Bilan passif ---
  {
    id: "capitaux-propres",
    label: "Capitaux propres",
    cloison: "bilan-passif",
    comptes: ["10", "11", "12", "13", "14"],
    description: "Capital, réserves, report à nouveau, résultat, subventions.",
  },
  {
    id: "provisions",
    label: "Provisions pour risques et charges",
    cloison: "bilan-passif",
    comptes: ["15"],
    description: "Provisions pour litiges, garanties, restructurations.",
  },
  {
    id: "dettes-financieres",
    label: "Dettes financières",
    cloison: "bilan-passif",
    comptes: ["16", "17", "519"],
    description: "Emprunts, dettes rattachées, concours bancaires.",
  },
  {
    id: "dettes-fournisseurs",
    label: "Dettes fournisseurs",
    cloison: "bilan-passif",
    comptes: ["401", "403", "408"],
    description: "Fournisseurs, effets à payer, factures non parvenues.",
  },
  {
    id: "dettes-fiscales-sociales",
    label: "Dettes fiscales & sociales",
    cloison: "bilan-passif",
    comptes: ["42", "43", "44"],
    description: "Personnel, organismes sociaux, État (hors TVA déductible).",
  },
  {
    id: "pca",
    label: "Produits constatés d'avance",
    cloison: "bilan-passif",
    comptes: ["487"],
    description: "Produits enregistrés rattachables à un exercice ultérieur.",
  },
  // --- Compte de résultat ---
  {
    id: "chiffre-affaires",
    label: "Chiffre d'affaires & production",
    cloison: "resultat",
    comptes: ["70", "71", "72"],
    description: "Ventes, production stockée et immobilisée.",
  },
  {
    id: "achats-charges-externes",
    label: "Achats & charges externes",
    cloison: "resultat",
    comptes: ["60", "61", "62"],
    description: "Achats, services extérieurs et autres charges externes.",
  },
  {
    id: "charges-personnel",
    label: "Charges de personnel",
    cloison: "resultat",
    comptes: ["63", "64"],
    description: "Impôts/taxes sur rémunérations, salaires, charges sociales.",
  },
  {
    id: "dap",
    label: "Dotations amortissements & provisions",
    cloison: "resultat",
    comptes: ["68", "78"],
    description: "Dotations et reprises sur amortissements et provisions.",
  },
  {
    id: "resultat-financier",
    label: "Résultat financier",
    cloison: "resultat",
    comptes: ["66", "76", "686", "786"],
    description: "Charges et produits financiers : intérêts, dividendes, change.",
  },
  {
    id: "resultat-exceptionnel",
    label: "Résultat exceptionnel",
    cloison: "resultat",
    comptes: ["67", "77"],
    description: "Charges et produits exceptionnels.",
  },
  // --- Annexe ---
  {
    id: "engagements-hors-bilan",
    label: "Engagements hors bilan",
    cloison: "annexe",
    comptes: ["80", "801", "802", "8016"],
    description:
      "Engagements donnés et reçus : cautions, avals, garanties, crédit-bail, retraites.",
  },
];

export function siloById(id: string): Silo | undefined {
  return SILOS.find((s) => s.id === id);
}

export function silosForCloison(cloison: CloisonId): Silo[] {
  return SILOS.filter((s) => s.cloison === cloison);
}

/** Retourne le silo dont un préfixe de compte correspond au numéro fourni. */
export function siloForCompte(compteNum: string): Silo | undefined {
  let best: Silo | undefined;
  let bestLen = 0;
  for (const silo of SILOS) {
    for (const prefix of silo.comptes) {
      if (compteNum.startsWith(prefix) && prefix.length > bestLen) {
        best = silo;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

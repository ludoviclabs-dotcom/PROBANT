import type { CloisonId } from "@/lib/canonical-model";
import type { RapprochementConfig, TypeDocument } from "./types";
import type { MappageColonnes } from "./adapters/tabular";
import { CONFIG_CLIENTS } from "./demo/clients";
import { CONFIG_FOURNISSEURS } from "./demo/fournisseurs";
import { CONFIG_IMMOBILISATIONS } from "./demo/immobilisations";
import { CONFIG_CAPITAUX_PROPRES } from "./demo/capitaux-propres";
import { CONFIG_DETTES_FINANCIERES } from "./demo/dettes-financieres";
import { CONFIG_PROVISIONS } from "./demo/provisions";
import { CONFIG_STOCKS } from "./demo/stocks";
import { CONFIG_PAIE } from "./demo/paie";
import { CONFIG_TRESORERIE } from "./demo/tresorerie";
import { CONFIG_IMPOTS_TAXES } from "./demo/impots-taxes";
import { CONFIG_RESULTAT_EXCEPTIONNEL } from "./demo/resultat-exceptionnel";

/**
 * Catalogue déclaratif des cycles d'audit ouverts au dépôt multi-documents.
 *
 * Chaque `AuditCycle` référence la `RapprochementConfig` déjà définie côté
 * démo (lib/rapprochement/demo/*) : source de vérité unique pour le moteur,
 * que les documents proviennent de la démo ou d'un dépôt réel.
 */
export interface AuditCycle {
  id: string;
  nom: string;
  description: string;
  famillesComptes: string[];
  cloison: CloisonId;
  config: RapprochementConfig;
}

export type DocumentFormatAccepte = "xlsx" | "csv" | "pdf";

export type ChampMappage = keyof MappageColonnes;

export interface DocumentType {
  id: string;
  cycleId: string;
  /** "source" = document A du rapprochement, "cible" = document B. */
  role: "source" | "cible";
  code: string;
  libelle: string;
  description: string;
  formats: DocumentFormatAccepte[];
  typeDocument: TypeDocument;
  champsRequis: ChampMappage[];
  champsOptionnels?: ChampMappage[];
}

export const AUDIT_CYCLES: AuditCycle[] = [
  {
    id: "immobilisations",
    nom: "Immobilisations",
    description: "Tableau des immobilisations & amortissements ↔ balance 2x/28x.",
    famillesComptes: ["20", "21", "28"],
    cloison: "bilan-actif",
    config: CONFIG_IMMOBILISATIONS,
  },
  {
    id: "capitaux-propres",
    nom: "Capitaux propres",
    description: "Tableau de variation des capitaux propres ↔ grand-livre classe 10.",
    famillesComptes: ["10"],
    cloison: "bilan-passif",
    config: CONFIG_CAPITAUX_PROPRES,
  },
  {
    id: "dettes-financieres",
    nom: "Financement & Emprunts",
    description: "Tableau d'amortissement des emprunts ↔ grand-livre classe 16.",
    famillesComptes: ["16"],
    cloison: "bilan-passif",
    config: CONFIG_DETTES_FINANCIERES,
  },
  {
    id: "provisions",
    nom: "Provisions & Engagements",
    description: "Tableau des provisions ↔ grand-livre classe 15.",
    famillesComptes: ["15"],
    cloison: "bilan-passif",
    config: CONFIG_PROVISIONS,
  },
  {
    id: "stocks",
    nom: "Stocks & Inventaires",
    description: "Inventaire physique ↔ comptabilité stocks (classe 3).",
    famillesComptes: ["3"],
    cloison: "bilan-actif",
    config: CONFIG_STOCKS,
  },
  {
    id: "clients",
    nom: "Ventes / Clients",
    description: "Balance âgée clients ↔ grand-livre auxiliaire 411.",
    famillesComptes: ["411"],
    cloison: "bilan-actif",
    config: CONFIG_CLIENTS,
  },
  {
    id: "fournisseurs",
    nom: "Achats / Fournisseurs",
    description: "Balance âgée fournisseurs ↔ grand-livre auxiliaire 401.",
    famillesComptes: ["401"],
    cloison: "bilan-passif",
    config: CONFIG_FOURNISSEURS,
  },
  {
    id: "paie",
    nom: "Paie & Personnel",
    description: "Journal de paie / DSN ↔ grand-livre 43x/64x.",
    famillesComptes: ["43", "64"],
    cloison: "resultat",
    config: CONFIG_PAIE,
  },
  {
    id: "tresorerie",
    nom: "Trésorerie & Banques",
    description: "Relevé bancaire ↔ grand-livre banque (512/53).",
    famillesComptes: ["512", "53"],
    cloison: "bilan-actif",
    config: CONFIG_TRESORERIE,
  },
  {
    id: "impots-taxes",
    nom: "Impôts, Taxes & TVA",
    description: "Déclaration TVA CA3 ↔ grand-livre compte 445.",
    famillesComptes: ["445"],
    cloison: "tva-fiscalite",
    config: CONFIG_IMPOTS_TAXES,
  },
  {
    id: "resultat-exceptionnel",
    nom: "Résultat exceptionnel",
    description: "Détail des charges/produits exceptionnels ↔ grand-livre 67/77.",
    famillesComptes: ["67", "77"],
    cloison: "resultat",
    config: CONFIG_RESULTAT_EXCEPTIONNEL,
  },
];

export const DOCUMENT_TYPES: DocumentType[] = [
  {
    id: "immobilisations-tableau",
    cycleId: "immobilisations",
    role: "source",
    code: "tableau_immobilisations",
    libelle: "Tableau des immobilisations",
    description: "Inventaire des immobilisations et amortissements (VNC par ligne).",
    formats: ["xlsx", "csv"],
    typeDocument: "tableau_immobilisations",
    champsRequis: ["piece", "compte", "montant"],
    champsOptionnels: ["libelle", "date"],
  },
  {
    id: "immobilisations-balance",
    cycleId: "immobilisations",
    role: "cible",
    code: "balance_immobilisations",
    libelle: "Balance immobilisations (2x/28x)",
    description: "Extrait de balance générale limité aux comptes 20/21/28.",
    formats: ["xlsx", "csv"],
    typeDocument: "balance_generale",
    champsRequis: ["piece", "compte", "montant"],
    champsOptionnels: ["libelle"],
  },
  {
    id: "clients-balance-agee",
    cycleId: "clients",
    role: "source",
    code: "balance_agee_clients",
    libelle: "Balance âgée clients",
    description: "Détail par client avec échéance (pour l'antériorité et la dépréciation).",
    formats: ["xlsx", "csv"],
    typeDocument: "balance_agee",
    champsRequis: ["tiers", "montant"],
    champsOptionnels: ["compte", "piece", "echeance", "libelle", "lettre"],
  },
  {
    id: "clients-grand-livre",
    cycleId: "clients",
    role: "cible",
    code: "grand_livre_411",
    libelle: "Grand-livre auxiliaire 411",
    description: "Soldes comptables par client, compte 411.",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["tiers", "montant"],
    champsOptionnels: ["echeance", "libelle", "lettre"],
  },
  {
    id: "fournisseurs-balance-agee",
    cycleId: "fournisseurs",
    role: "source",
    code: "balance_agee_fournisseurs",
    libelle: "Balance âgée fournisseurs",
    description: "Détail par fournisseur avec échéance.",
    formats: ["xlsx", "csv"],
    typeDocument: "balance_agee",
    champsRequis: ["tiers", "montant"],
    champsOptionnels: ["echeance", "libelle"],
  },
  {
    id: "fournisseurs-grand-livre",
    cycleId: "fournisseurs",
    role: "cible",
    code: "grand_livre_401",
    libelle: "Grand-livre auxiliaire 401",
    description: "Soldes comptables par fournisseur, compte 401.",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["tiers", "montant"],
    champsOptionnels: ["echeance", "libelle"],
  },
  {
    id: "capitaux-propres-tableau",
    cycleId: "capitaux-propres",
    role: "source",
    code: "tableau_variation_capitaux_propres",
    libelle: "Tableau de variation des capitaux propres",
    description: "Détail des mouvements de capitaux propres par compte (classe 10).",
    formats: ["xlsx", "csv"],
    typeDocument: "autre",
    champsRequis: ["compte", "montant"],
    champsOptionnels: ["piece", "libelle"],
  },
  {
    id: "capitaux-propres-grand-livre",
    cycleId: "capitaux-propres",
    role: "cible",
    code: "grand_livre_classe_10",
    libelle: "Grand-livre classe 10",
    description: "Soldes comptables de la classe 10 (capitaux propres).",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["compte", "montant"],
    champsOptionnels: ["piece", "libelle"],
  },
  {
    id: "dettes-financieres-tableau",
    cycleId: "dettes-financieres",
    role: "source",
    code: "tableau_amortissement_emprunts",
    libelle: "Tableau d'amortissement des emprunts",
    description: "Détail des emprunts et avances en cours (classe 16), par pièce.",
    formats: ["xlsx", "csv"],
    typeDocument: "autre",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "dettes-financieres-grand-livre",
    cycleId: "dettes-financieres",
    role: "cible",
    code: "grand_livre_classe_16",
    libelle: "Grand-livre classe 16",
    description: "Soldes comptables de la classe 16 (emprunts et dettes assimilées).",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "provisions-tableau",
    cycleId: "provisions",
    role: "source",
    code: "tableau_provisions",
    libelle: "Tableau des provisions",
    description: "Détail des provisions pour risques et charges (classe 15), par pièce.",
    formats: ["xlsx", "csv"],
    typeDocument: "autre",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "provisions-grand-livre",
    cycleId: "provisions",
    role: "cible",
    code: "grand_livre_classe_15",
    libelle: "Grand-livre classe 15",
    description: "Soldes comptables de la classe 15 (provisions).",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "stocks-inventaire",
    cycleId: "stocks",
    role: "source",
    code: "inventaire_physique",
    libelle: "Inventaire physique",
    description: "Relevé d'inventaire physique par référence (classe 3).",
    formats: ["xlsx", "csv"],
    typeDocument: "inventaire",
    champsRequis: ["piece", "compte", "montant"],
    champsOptionnels: ["libelle"],
  },
  {
    id: "stocks-comptabilite",
    cycleId: "stocks",
    role: "cible",
    code: "comptabilite_stocks",
    libelle: "Comptabilité stocks (classe 3)",
    description: "Soldes comptables des stocks par référence (classe 3).",
    formats: ["xlsx", "csv"],
    typeDocument: "balance_generale",
    champsRequis: ["piece", "compte", "montant"],
    champsOptionnels: ["libelle"],
  },
  {
    id: "paie-journal-dsn",
    cycleId: "paie",
    role: "source",
    code: "journal_paie_dsn",
    libelle: "Journal de paie / DSN",
    description: "Détail des cotisations et charges de personnel par organisme (43x/64x).",
    formats: ["xlsx", "csv"],
    typeDocument: "etat_paie",
    champsRequis: ["tiers", "montant"],
    champsOptionnels: ["compte", "piece", "libelle"],
  },
  {
    id: "paie-grand-livre",
    cycleId: "paie",
    role: "cible",
    code: "grand_livre_421_64",
    libelle: "Grand-livre 421/64",
    description: "Soldes comptables par organisme, comptes 421/43x/64x.",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["tiers", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "tresorerie-releve-bancaire",
    cycleId: "tresorerie",
    role: "source",
    code: "releve_bancaire",
    libelle: "Relevé bancaire",
    description: "Détail des mouvements bancaires par pièce (512/53).",
    formats: ["xlsx", "csv"],
    typeDocument: "rapprochement_bancaire",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "tresorerie-grand-livre",
    cycleId: "tresorerie",
    role: "cible",
    code: "grand_livre_banque_512",
    libelle: "Grand-livre banque (512)",
    description: "Soldes comptables par pièce, compte 512.",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "impots-taxes-declaration-tva",
    cycleId: "impots-taxes",
    role: "source",
    code: "declaration_tva_ca3",
    libelle: "Déclaration TVA CA3",
    description: "Détail de la TVA déclarée par période (compte 445).",
    formats: ["xlsx", "csv"],
    typeDocument: "liasse_fiscale",
    champsRequis: ["compte", "montant"],
    champsOptionnels: ["piece", "libelle"],
  },
  {
    id: "impots-taxes-grand-livre",
    cycleId: "impots-taxes",
    role: "cible",
    code: "grand_livre_445",
    libelle: "Grand-livre 445",
    description: "Soldes comptables du compte 445 (TVA).",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["compte", "montant"],
    champsOptionnels: ["piece", "libelle"],
  },
  {
    id: "resultat-exceptionnel-detail",
    cycleId: "resultat-exceptionnel",
    role: "source",
    code: "detail_charges_produits_exceptionnels",
    libelle: "Détail des charges/produits exceptionnels",
    description: "Détail des opérations exceptionnelles par pièce (67/77).",
    formats: ["xlsx", "csv"],
    typeDocument: "autre",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
  {
    id: "resultat-exceptionnel-grand-livre",
    cycleId: "resultat-exceptionnel",
    role: "cible",
    code: "grand_livre_67_77",
    libelle: "Grand-livre 67/77",
    description: "Soldes comptables des comptes 67/77 (résultat exceptionnel).",
    formats: ["xlsx", "csv"],
    typeDocument: "grand_livre",
    champsRequis: ["piece", "montant"],
    champsOptionnels: ["compte", "libelle"],
  },
];

export function documentTypesForCycle(cycleId: string): DocumentType[] {
  return DOCUMENT_TYPES.filter((d) => d.cycleId === cycleId);
}

export function cycleById(id: string): AuditCycle | undefined {
  return AUDIT_CYCLES.find((c) => c.id === id);
}

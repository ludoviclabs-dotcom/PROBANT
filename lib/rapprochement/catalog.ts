import type { CloisonId } from "@/lib/canonical-model";
import type { RapprochementConfig, TypeDocument } from "./types";
import type { MappageColonnes } from "./adapters/tabular";
import { CONFIG_CLIENTS } from "./demo/clients";
import { CONFIG_FOURNISSEURS } from "./demo/fournisseurs";
import { CONFIG_IMMOBILISATIONS } from "./demo/immobilisations";

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
];

export function documentTypesForCycle(cycleId: string): DocumentType[] {
  return DOCUMENT_TYPES.filter((d) => d.cycleId === cycleId);
}

export function cycleById(id: string): AuditCycle | undefined {
  return AUDIT_CYCLES.find((c) => c.id === id);
}

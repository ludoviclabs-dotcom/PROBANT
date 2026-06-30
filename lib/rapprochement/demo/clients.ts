import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { rapprocher } from "../engine";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig, ResultatRapprochement } from "../types";

/**
 * Cas de démonstration — cycle CLIENTS.
 *
 * Confronte la BALANCE ÂGÉE clients (détail par client, avec échéance) au
 * GRAND-LIVRE AUXILIAIRE du compte 411 (soldes comptables). Données fictives.
 *
 * Ce fichier illustre le SEUL point d'extension du module : pour un autre
 * cycle, on duplique ce patron (2 documents + 1 config), sans toucher au moteur.
 */

export const CLOTURE_DEMO = "20241231";

/** Document A — Balance âgée clients (état détaillé fourni par l'entité). */
export const BALANCE_AGEE_CLIENTS: DocumentSource = {
  id: "demo-balance-agee-clients",
  label: "Balance âgée clients",
  type: "balance_agee",
  format: "demo",
  lignes: [
    { tiers: "DUPONT SA", compte: "411", piece: "F-2023-0412", montant: 24850, echeance: "20231115", libelle: "DUPONT SA", lettre: false },
    { tiers: "MARTIN SARL", compte: "411", piece: "F-2024-1180", montant: 18200, echeance: "20241130", libelle: "MARTIN SARL", lettre: false },
    { tiers: "LEROY SAS", compte: "411", piece: "F-2024-0631", montant: 41000, echeance: "20240630", libelle: "LEROY SAS", lettre: false },
    { tiers: "BERNARD & Cie", compte: "411", piece: "F-2024-1201", montant: 12500, echeance: "20241201", libelle: "BERNARD & Cie", lettre: false },
    { tiers: "PETIT SA", compte: "411", piece: "F-2023-0901", montant: 7300, echeance: "20230901", libelle: "PETIT SA", lettre: true },
  ],
};

/** Document B — Grand-livre auxiliaire compte 411 (comptabilité). */
export const GRAND_LIVRE_411: DocumentSource = {
  id: "demo-grand-livre-411",
  label: "Grand-livre auxiliaire 411",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { tiers: "DUPONT SA", compte: "411", montant: 24850, echeance: "20231115", libelle: "DUPONT SA", lettre: false },
    { tiers: "MARTIN SARL", compte: "411", montant: 18200, echeance: "20241130", libelle: "MARTIN SARL", lettre: false },
    { tiers: "LEROY SAS", compte: "411", montant: 35000, echeance: "20240630", libelle: "LEROY SAS", lettre: false },
    { tiers: "PETIT SA", compte: "411", montant: 7300, echeance: "20230901", libelle: "PETIT SA", lettre: true },
    { tiers: "DURAND SA", compte: "411", montant: 9000, echeance: "20241015", libelle: "DURAND SA", lettre: false },
  ],
};

/** Configuration du rapprochement Clients (unique point d'extension cycle). */
export const CONFIG_CLIENTS: RapprochementConfig = {
  cycleSlug: "creances-clients", // lien vers la fiche cycle (base normative)
  siloId: "rapprochement-clients", // silo d'affichage dédié (distinct du silo Créances)
  cloison: "bilan-actif",
  cles: ["tiers", "montant", "periode"],
  toleranceEur: 500,
  seuilAncienneteJours: 360,
  detecterProvision: true, // cycle à créances : dépréciation des postes anciens
  sources: { provision_insuffisante: "PCG_CREANCES", anteriorite: "PCG_CREANCES" },
};

/** Exécute le rapprochement Clients de démo. */
export function runClientsRapprochement(): ResultatRapprochement {
  return rapprocher(BALANCE_AGEE_CLIENTS, GRAND_LIVRE_411, CONFIG_CLIENTS, {
    dateReference: CLOTURE_DEMO,
  });
}

/**
 * Assemble la `SiloView` Clients prête à afficher (Zone A état + Zone B constats).
 */
export function buildClientsRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(BALANCE_AGEE_CLIENTS, GRAND_LIVRE_411, CONFIG_CLIENTS, th, {
    dateReference: CLOTURE_DEMO,
  });
}

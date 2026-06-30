import type { ReconstitutedStatement, SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { rapprocher } from "../engine";
import { resultToFindings } from "../to-findings";
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
};

/** Exécute le rapprochement Clients de démo. */
export function runClientsRapprochement(): ResultatRapprochement {
  return rapprocher(BALANCE_AGEE_CLIENTS, GRAND_LIVRE_411, CONFIG_CLIENTS, {
    dateReference: CLOTURE_DEMO,
  });
}

/**
 * Assemble une `SiloView` prête à afficher dans Cloisons / Synthèse :
 * état de rapprochement (Zone A) + constats d'écarts (Zone B).
 */
export function buildClientsRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  const result = runClientsRapprochement();
  const findings = resultToFindings(result, th);

  const statement: ReconstitutedStatement = {
    titre: "Rapprochement créances clients — balance âgée ↔ grand-livre 411",
    unite: "EUR",
    note: "Confrontation du détail par client (balance âgée) aux soldes comptables (compte 411).",
    rows: [
      { id: "rappro-source", label: "Solde balance âgée clients", compte: "411", valeur: Math.round(result.totalSource), kind: "ligne" },
      { id: "rappro-cible", label: "Solde grand-livre auxiliaire 411", compte: "411", valeur: Math.round(result.totalCible), kind: "ligne" },
      {
        id: "rappro-ecart",
        label: "Écart de rapprochement",
        valeur: Math.round(result.ecartGlobal),
        kind: "total",
        flaggedBy: findings[0]?.id,
        severity: findings[0]?.severity,
      },
    ],
  };

  return { siloId: CONFIG_CLIENTS.siloId, statement, findings };
}

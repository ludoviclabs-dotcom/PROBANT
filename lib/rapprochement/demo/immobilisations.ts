import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle IMMOBILISATIONS — tableau des immobilisations & amortissements ↔ balance (2x/28x). */

export const TABLEAU_IMMOBILISATIONS: DocumentSource = {
  id: "demo-tableau-immobilisations",
  label: "Tableau des immobilisations",
  type: "tableau_immobilisations",
  format: "demo",
  lignes: [
    { piece: "MAT-01", compte: "215", montant: 180000, libelle: "Ligne de production 01 (VNC)" },
    { piece: "MAT-02", compte: "215", montant: 95000, libelle: "Ligne de production 02 (VNC)" },
    { piece: "VEH-01", compte: "2182", montant: 32000, libelle: "Véhicule utilitaire 01 (VNC)" },
    { piece: "MOB-01", compte: "2184", montant: 12000, libelle: "Mobilier de bureau (VNC)" },
  ],
};

export const BALANCE_IMMOBILISATIONS: DocumentSource = {
  id: "demo-balance-immobilisations",
  label: "Balance immobilisations (2x/28x)",
  type: "balance_generale",
  format: "demo",
  lignes: [
    { piece: "MAT-01", compte: "215", montant: 180000, libelle: "Ligne de production 01 (VNC)" },
    { piece: "MAT-02", compte: "215", montant: 80000, libelle: "Ligne de production 02 (VNC)" },
    { piece: "MOB-01", compte: "2184", montant: 12000, libelle: "Mobilier de bureau (VNC)" },
    { piece: "IMMO-X", compte: "2182", montant: 24000, libelle: "Immobilisation non rapprochée" },
  ],
};

export const CONFIG_IMMOBILISATIONS: RapprochementConfig = {
  cycleSlug: "immobilisations-corporelles",
  siloId: "rapprochement-immobilisations",
  cloison: "bilan-actif",
  cles: ["piece", "montant"],
  toleranceEur: 500,
  sources: { rapprochement_solde: "PCG_AMORTISSEMENT" },
};

export function buildImmobilisationsRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(
    TABLEAU_IMMOBILISATIONS,
    BALANCE_IMMOBILISATIONS,
    CONFIG_IMMOBILISATIONS,
    th,
  );
}

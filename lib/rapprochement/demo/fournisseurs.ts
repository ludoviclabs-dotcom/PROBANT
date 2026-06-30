import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle FOURNISSEURS — balance âgée fournisseurs ↔ grand-livre auxiliaire 401. */

export const CLOTURE_DEMO = "20241231";

export const BALANCE_AGEE_FOURNISSEURS: DocumentSource = {
  id: "demo-balance-agee-fournisseurs",
  label: "Balance âgée fournisseurs",
  type: "balance_agee",
  format: "demo",
  lignes: [
    { tiers: "ALPHA SARL", compte: "401", montant: 32000, echeance: "20241220", libelle: "ALPHA SARL" },
    { tiers: "BETA SAS", compte: "401", montant: 18500, echeance: "20241128", libelle: "BETA SAS" },
    { tiers: "GAMMA & Cie", compte: "401", montant: 9000, echeance: "20241205", libelle: "GAMMA & Cie" },
    { tiers: "EPSILON SA", compte: "401", montant: 14000, echeance: "20241210", libelle: "EPSILON SA" },
  ],
};

export const GRAND_LIVRE_401: DocumentSource = {
  id: "demo-grand-livre-401",
  label: "Grand-livre auxiliaire 401",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { tiers: "ALPHA SARL", compte: "401", montant: 32000, libelle: "ALPHA SARL" },
    { tiers: "BETA SAS", compte: "401", montant: 12000, libelle: "BETA SAS" },
    { tiers: "DELTA SA", compte: "401", montant: 7000, libelle: "DELTA SA" },
    { tiers: "EPSILON SA", compte: "401", montant: 14000, libelle: "EPSILON SA" },
  ],
};

export const CONFIG_FOURNISSEURS: RapprochementConfig = {
  cycleSlug: "dettes-fournisseurs",
  siloId: "rapprochement-fournisseurs",
  cloison: "bilan-passif",
  cles: ["tiers", "montant", "periode"],
  toleranceEur: 500,
};

export function buildFournisseursRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(
    BALANCE_AGEE_FOURNISSEURS,
    GRAND_LIVRE_401,
    CONFIG_FOURNISSEURS,
    th,
    { dateReference: CLOTURE_DEMO },
  );
}

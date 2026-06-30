import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle STOCKS — inventaire physique ↔ comptabilité (classe 3). */

export const INVENTAIRE_PHYSIQUE: DocumentSource = {
  id: "demo-inventaire-stocks",
  label: "Inventaire physique",
  type: "inventaire",
  format: "demo",
  lignes: [
    { piece: "REF-A", compte: "355", montant: 120000, libelle: "Réf. A — produits finis" },
    { piece: "REF-B", compte: "355", montant: 85000, libelle: "Réf. B — produits finis" },
    { piece: "REF-C", compte: "311", montant: 40000, libelle: "Réf. C — matières" },
    { piece: "REF-D", compte: "311", montant: 15000, libelle: "Réf. D — matières" },
  ],
};

export const COMPTABILITE_STOCKS: DocumentSource = {
  id: "demo-comptabilite-stocks",
  label: "Comptabilité stocks (classe 3)",
  type: "balance_generale",
  format: "demo",
  lignes: [
    { piece: "REF-A", compte: "355", montant: 120000, libelle: "Réf. A — produits finis" },
    { piece: "REF-B", compte: "355", montant: 72000, libelle: "Réf. B — produits finis" },
    { piece: "REF-C", compte: "311", montant: 40000, libelle: "Réf. C — matières" },
    { piece: "REF-E", compte: "311", montant: 9000, libelle: "Réf. E — matières" },
  ],
};

export const CONFIG_STOCKS: RapprochementConfig = {
  cycleSlug: "stocks-en-cours",
  siloId: "rapprochement-stocks",
  cloison: "bilan-actif",
  cles: ["piece", "montant"],
  toleranceEur: 500,
  sources: { rapprochement_solde: "PCG_DEPRECIATION_STOCK" },
};

export function buildStocksRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(INVENTAIRE_PHYSIQUE, COMPTABILITE_STOCKS, CONFIG_STOCKS, th);
}

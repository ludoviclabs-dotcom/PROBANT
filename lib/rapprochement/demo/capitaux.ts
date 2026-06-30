import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle CAPITAUX PROPRES — tableau de variation ↔ comptabilité (classe 10) / PV d'AG. */

export const TABLEAU_VARIATION_CP: DocumentSource = {
  id: "demo-tableau-variation-cp",
  label: "Tableau de variation des CP",
  type: "autre",
  format: "demo",
  lignes: [
    { tiers: "CAPITAL", compte: "101", montant: 500000, libelle: "Capital social" },
    { tiers: "RESERVES", compte: "106", montant: 60000, libelle: "Réserves" },
    { tiers: "RAN", compte: "119", montant: -180000, libelle: "Report à nouveau" },
    { tiers: "RESULTAT", compte: "129", montant: -160000, libelle: "Résultat de l'exercice" },
    { tiers: "DIVIDENDES", compte: "457", montant: 50000, libelle: "Dividendes distribués" },
  ],
};

export const COMPTABILITE_CP: DocumentSource = {
  id: "demo-comptabilite-cp",
  label: "Comptabilité capitaux propres (10x)",
  type: "balance_generale",
  format: "demo",
  lignes: [
    { tiers: "CAPITAL", compte: "101", montant: 500000, libelle: "Capital social" },
    { tiers: "RESERVES", compte: "106", montant: 45000, libelle: "Réserves" },
    { tiers: "RAN", compte: "119", montant: -180000, libelle: "Report à nouveau" },
    { tiers: "RESULTAT", compte: "129", montant: -160000, libelle: "Résultat de l'exercice" },
  ],
};

export const CONFIG_CAPITAUX: RapprochementConfig = {
  cycleSlug: "capitaux-propres",
  siloId: "rapprochement-capitaux",
  cloison: "bilan-passif",
  cles: ["tiers", "montant"],
  toleranceEur: 500,
};

export function buildCapitauxRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(TABLEAU_VARIATION_CP, COMPTABILITE_CP, CONFIG_CAPITAUX, th);
}

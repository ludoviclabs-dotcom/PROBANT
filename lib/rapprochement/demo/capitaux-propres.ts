import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle CAPITAUX PROPRES — tableau de variation des CP ↔ grand-livre classe 10. */

export const TABLEAU_VARIATION_CAPITAUX_PROPRES: DocumentSource = {
  id: "demo-tableau-variation-capitaux-propres",
  label: "Tableau de variation des capitaux propres",
  type: "autre",
  format: "demo",
  lignes: [
    { piece: "CP-101", compte: "101", montant: 300000, libelle: "Capital social SARL DURANDEAU" },
    { piece: "CP-1061", compte: "1061", montant: 30000, libelle: "Réserve légale" },
    { piece: "CP-108", compte: "108", montant: -18500, libelle: "Compte de l'exploitant" },
    { piece: "CP-109", compte: "109", montant: 5000, libelle: "Actionnaires, capital souscrit non appelé" },
  ],
};

export const GRAND_LIVRE_CLASSE_10: DocumentSource = {
  id: "demo-grand-livre-classe-10",
  label: "Grand-livre classe 10",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { piece: "CP-101", compte: "101", montant: 300000, libelle: "Capital social SARL DURANDEAU" },
    { piece: "CP-1061", compte: "1061", montant: 27500, libelle: "Réserve légale" },
    { piece: "CP-108", compte: "108", montant: -18500, libelle: "Compte de l'exploitant" },
  ],
};

export const CONFIG_CAPITAUX_PROPRES: RapprochementConfig = {
  cycleSlug: "capitaux-propres",
  siloId: "rapprochement-capitaux",
  cloison: "bilan-passif",
  cles: ["compte", "montant"],
  toleranceEur: 500,
};

export function buildCAPITAUX_PROPRESRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(
    TABLEAU_VARIATION_CAPITAUX_PROPRES,
    GRAND_LIVRE_CLASSE_10,
    CONFIG_CAPITAUX_PROPRES,
    th,
  );
}

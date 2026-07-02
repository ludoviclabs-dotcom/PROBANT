import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle RÉSULTAT EXCEPTIONNEL — détail des charges/produits exceptionnels ↔ grand-livre (67/77). */

export const DETAIL_CHARGES_PRODUITS_EXCEPTIONNELS: DocumentSource = {
  id: "demo-detail-charges-produits-exceptionnels",
  label: "Détail des charges/produits exceptionnels",
  type: "autre",
  format: "demo",
  lignes: [
    { piece: "EXC-01", compte: "675", montant: 45000, libelle: "Cession ligne de production obsolète" },
    { piece: "EXC-02", compte: "6712", montant: 8500, libelle: "Pénalité contractuelle litige client" },
    { piece: "EXC-03", compte: "775", montant: 52000, libelle: "Produit de cession véhicule utilitaire" },
    { piece: "EXC-04", compte: "7788", montant: 6200, libelle: "Indemnité assurance sinistre dégât des eaux" },
    { piece: "EXC-05", compte: "6713", montant: 3100, libelle: "Don exceptionnel association locale" },
  ],
};

export const GRAND_LIVRE_67_77: DocumentSource = {
  id: "demo-grand-livre-67-77",
  label: "Grand-livre 67/77",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { piece: "EXC-01", compte: "675", montant: 45000, libelle: "Cession ligne de production obsolète" },
    { piece: "EXC-02", compte: "6712", montant: 8500, libelle: "Pénalité contractuelle litige client" },
    { piece: "EXC-03", compte: "775", montant: 38000, libelle: "Produit de cession véhicule utilitaire" },
    { piece: "EXC-05", compte: "6713", montant: 3100, libelle: "Don exceptionnel association locale" },
  ],
};

export const CONFIG_RESULTAT_EXCEPTIONNEL: RapprochementConfig = {
  cycleSlug: "exceptionnel-cutoff",
  siloId: "rapprochement-resultat-exceptionnel",
  cloison: "resultat",
  cles: ["piece", "montant"],
  toleranceEur: 500,
};

export function buildRESULTAT_EXCEPTIONNELRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(
    DETAIL_CHARGES_PRODUITS_EXCEPTIONNELS,
    GRAND_LIVRE_67_77,
    CONFIG_RESULTAT_EXCEPTIONNEL,
    th,
  );
}

import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle PROVISIONS & ENGAGEMENTS — tableau des provisions ↔ grand-livre (15x). */

export const TABLEAU_PROVISIONS: DocumentSource = {
  id: "demo-tableau-provisions",
  label: "Tableau des provisions",
  type: "autre",
  format: "demo",
  lignes: [
    { piece: "PROV-01", compte: "1511", montant: 45000, libelle: "Provision litige prud'homal SARL DURAND" },
    { piece: "PROV-02", compte: "1515", montant: 28000, libelle: "Provision garantie clients" },
    { piece: "PROV-03", compte: "1518", montant: 15500, libelle: "Provision restructuration atelier" },
    { piece: "PROV-04", compte: "1512", montant: 9000, libelle: "Provision pour perte sur contrat" },
  ],
};

export const GRAND_LIVRE_CLASSE_15: DocumentSource = {
  id: "demo-grand-livre-classe-15",
  label: "Grand-livre classe 15",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { piece: "PROV-01", compte: "1511", montant: 45000, libelle: "Provision litige prud'homal SARL DURAND" },
    { piece: "PROV-02", compte: "1515", montant: 22000, libelle: "Provision garantie clients" },
    { piece: "PROV-03", compte: "1518", montant: 15500, libelle: "Provision restructuration atelier" },
    { piece: "PROV-05", compte: "1514", montant: 6000, libelle: "Provision pour amendes fiscales" },
  ],
};

export const CONFIG_PROVISIONS: RapprochementConfig = {
  cycleSlug: "provisions-risques-charges",
  siloId: "rapprochement-provisions",
  cloison: "bilan-passif",
  cles: ["piece", "montant"],
  toleranceEur: 500,
  sources: { rapprochement_solde: "PCG_PROVISIONS" },
};

export function buildPROVISIONSRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(
    TABLEAU_PROVISIONS,
    GRAND_LIVRE_CLASSE_15,
    CONFIG_PROVISIONS,
    th,
  );
}

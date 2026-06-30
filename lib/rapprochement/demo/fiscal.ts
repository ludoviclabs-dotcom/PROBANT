import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle FISCAL (TVA) — déclarations CA3 ↔ comptabilité (445) et CA déclaré ↔ CA comptable. */

export const DECLARATIONS_TVA: DocumentSource = {
  id: "demo-declarations-tva",
  label: "Déclarations TVA (CA3)",
  type: "liasse_fiscale",
  format: "demo",
  lignes: [
    { tiers: "CA-TAXABLE", compte: "70", montant: 6340000, libelle: "Base taxable déclarée" },
    { tiers: "TVA-COLLECTEE", compte: "44571", montant: 1268000, libelle: "TVA collectée déclarée" },
    { tiers: "TVA-DEDUCTIBLE", compte: "44566", montant: 540000, libelle: "TVA déductible déclarée" },
  ],
};

export const COMPTABILITE_TVA: DocumentSource = {
  id: "demo-comptabilite-tva",
  label: "Comptabilité TVA & CA",
  type: "balance_generale",
  format: "demo",
  lignes: [
    { tiers: "CA-TAXABLE", compte: "70", montant: 6028000, libelle: "CA comptabilisé" },
    { tiers: "TVA-COLLECTEE", compte: "44571", montant: 1268000, libelle: "TVA collectée comptable" },
    { tiers: "TVA-DEDUCTIBLE", compte: "44566", montant: 562000, libelle: "TVA déductible comptable" },
  ],
};

export const CONFIG_FISCAL: RapprochementConfig = {
  cycleSlug: "tva-fiscalite",
  siloId: "rapprochement-fiscal",
  cloison: "tva-fiscalite",
  cles: ["tiers", "montant"],
  toleranceEur: 500,
  sources: { rapprochement_solde: "CGI_TVA", perimetre: "CGI_TVA" },
};

export function buildFiscalRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(DECLARATIONS_TVA, COMPTABILITE_TVA, CONFIG_FISCAL, th);
}

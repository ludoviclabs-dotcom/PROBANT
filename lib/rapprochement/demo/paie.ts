import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle PAIE — livre de paie / DSN ↔ comptabilité (641/645/43). */

export const LIVRE_DE_PAIE: DocumentSource = {
  id: "demo-livre-de-paie",
  label: "Livre de paie / DSN",
  type: "etat_paie",
  format: "demo",
  lignes: [
    { tiers: "SALAIRES-BRUTS", compte: "641", montant: 1850000, libelle: "Salaires bruts" },
    { tiers: "CHARGES-PATRONALES", compte: "645", montant: 720000, libelle: "Charges patronales" },
    { tiers: "PRIME-EXCEPTIONNELLE", compte: "641", montant: 35000, libelle: "Prime exceptionnelle déc." },
  ],
};

export const COMPTABILITE_PAIE: DocumentSource = {
  id: "demo-comptabilite-paie",
  label: "Comptabilité paie (64/43)",
  type: "balance_generale",
  format: "demo",
  lignes: [
    { tiers: "SALAIRES-BRUTS", compte: "641", montant: 1850000, libelle: "Salaires bruts" },
    { tiers: "CHARGES-PATRONALES", compte: "645", montant: 695000, libelle: "Charges patronales" },
  ],
};

export const CONFIG_PAIE: RapprochementConfig = {
  cycleSlug: "charges-personnel",
  siloId: "rapprochement-paie",
  cloison: "resultat",
  cles: ["tiers", "montant"],
  toleranceEur: 500,
};

export function buildPaieRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(LIVRE_DE_PAIE, COMPTABILITE_PAIE, CONFIG_PAIE, th);
}

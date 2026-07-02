import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle PAIE & PERSONNEL — journal de paie / DSN ↔ grand-livre 43x/64x. */

export const JOURNAL_PAIE_DSN: DocumentSource = {
  id: "demo-journal-paie-dsn",
  label: "Journal de paie / DSN",
  type: "etat_paie",
  format: "demo",
  lignes: [
    { tiers: "URSSAF", compte: "437", piece: "DSN-2024-11", montant: 28400, libelle: "Cotisations URSSAF novembre" },
    { tiers: "CHARGES SOCIALES", compte: "64", piece: "OD-PAIE-11", montant: 104000, libelle: "Charges de personnel novembre" },
    { tiers: "CAISSE RETRAITE AGIRC-ARRCO", compte: "437", piece: "DSN-2024-11", montant: 9800, libelle: "Cotisations retraite complémentaire novembre" },
    { tiers: "MUTUELLE SANTE PLUS", compte: "431", piece: "DSN-2024-11", montant: 3200, libelle: "Cotisations mutuelle novembre" },
  ],
};

export const GRAND_LIVRE_421_64: DocumentSource = {
  id: "demo-grand-livre-421-64",
  label: "Grand-livre 421/64",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { tiers: "URSSAF", compte: "437", montant: 28400, libelle: "Cotisations URSSAF novembre" },
    { tiers: "CHARGES SOCIALES", compte: "64", montant: 104000, libelle: "Charges de personnel novembre" },
    { tiers: "CAISSE RETRAITE AGIRC-ARRCO", compte: "437", montant: 8900, libelle: "Cotisations retraite complémentaire novembre" },
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
  return buildRapprochementSilo(JOURNAL_PAIE_DSN, GRAND_LIVRE_421_64, CONFIG_PAIE, th);
}

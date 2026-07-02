import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle TRÉSORERIE — relevé bancaire ↔ grand-livre banque (512/53). */

export const RELEVE_BANCAIRE: DocumentSource = {
  id: "demo-releve-bancaire",
  label: "Relevé bancaire",
  type: "rapprochement_bancaire",
  format: "demo",
  lignes: [
    { piece: "VIR-3301", compte: "5121", montant: 48500, libelle: "Virement client SODEXA SA" },
    { piece: "CHQ-8820", compte: "5121", montant: 17750, libelle: "Remise chèque BOUTIN SARL" },
    { piece: "PRLV-1147", compte: "5121", montant: -6200, libelle: "Prélèvement loyer novembre" },
    { piece: "CB-9034", compte: "512", montant: -1380, libelle: "Frais bancaires trimestriels" },
    { piece: "VIR-3355", compte: "5121", montant: 9600, libelle: "Virement client ROBIN & FILS" },
  ],
};

export const GRAND_LIVRE_BANQUE_512: DocumentSource = {
  id: "demo-grand-livre-banque-512",
  label: "Grand-livre banque (512)",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { piece: "VIR-3301", compte: "5121", montant: 48500, libelle: "Virement client SODEXA SA" },
    { piece: "CHQ-8820", compte: "5121", montant: 12200, libelle: "Remise chèque BOUTIN SARL" },
    { piece: "PRLV-1147", compte: "5121", montant: -6200, libelle: "Prélèvement loyer novembre" },
    { piece: "VIR-3355", compte: "5121", montant: 9600, libelle: "Virement client ROBIN & FILS" },
  ],
};

export const CONFIG_TRESORERIE: RapprochementConfig = {
  cycleSlug: "disponibilites-banques",
  siloId: "rapprochement-tresorerie",
  cloison: "bilan-actif",
  cles: ["piece", "montant"],
  toleranceEur: 500,
  sources: { rapprochement_solde: "ISA_505" },
};

export function buildTRESORERIERapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(RELEVE_BANCAIRE, GRAND_LIVRE_BANQUE_512, CONFIG_TRESORERIE, th);
}

/** Alias de compatibilité (nom historique utilisé par demo/index.ts). */
export const buildTresorerieRapprochementSilo = buildTRESORERIERapprochementSilo;

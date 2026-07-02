import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle IMPÔTS, TAXES & TVA — déclaration TVA CA3 ↔ grand-livre compte 445. */

export const DECLARATION_TVA_CA3: DocumentSource = {
  id: "demo-declaration-tva-ca3",
  label: "Déclaration TVA CA3",
  type: "liasse_fiscale",
  format: "demo",
  lignes: [
    { piece: "CA3-2024-09", compte: "445", montant: 18400, libelle: "TVA due — septembre 2024" },
    { piece: "CA3-2024-10", compte: "445", montant: 21750, libelle: "TVA due — octobre 2024" },
    { piece: "CA3-2024-11", compte: "445", montant: 19300, libelle: "TVA due — novembre 2024" },
    { piece: "CA3-2024-12", compte: "445", montant: 22900, libelle: "TVA due — décembre 2024" },
  ],
};

export const GRAND_LIVRE_445: DocumentSource = {
  id: "demo-grand-livre-445",
  label: "Grand-livre 445",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { piece: "CA3-2024-09", compte: "445", montant: 18400, libelle: "TVA due — septembre 2024" },
    { piece: "CA3-2024-10", compte: "445", montant: 21750, libelle: "TVA due — octobre 2024" },
    { piece: "CA3-2024-11", compte: "445", montant: 18600, libelle: "TVA due — novembre 2024" },
    { piece: "CA3-2024-12", compte: "445", montant: 22900, libelle: "TVA due — décembre 2024" },
    { piece: "REG-2024-13", compte: "445", montant: 1450, libelle: "Régularisation TVA non déclarée" },
  ],
};

export const CONFIG_IMPOTS_TAXES: RapprochementConfig = {
  cycleSlug: "tva-etat",
  siloId: "rapprochement-fiscal",
  cloison: "tva-fiscalite",
  cles: ["compte", "montant"],
  toleranceEur: 500,
  sources: { rapprochement_solde: "CGI_TVA" },
};

export function buildIMPOTS_TAXESRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(
    DECLARATION_TVA_CA3,
    GRAND_LIVRE_445,
    CONFIG_IMPOTS_TAXES,
    th,
  );
}

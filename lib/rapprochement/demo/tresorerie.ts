import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle TRÉSORERIE — soldes comptables (512) ↔ relevés bancaires (rapprochement bancaire). */

export const SOLDES_COMPTABLES_512: DocumentSource = {
  id: "demo-soldes-comptables-512",
  label: "Soldes comptables (512)",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { tiers: "BNP", compte: "5121", montant: 420000, libelle: "BNP — compte courant" },
    { tiers: "SG", compte: "5122", montant: 85000, libelle: "Société Générale" },
    { tiers: "CAISSE-EPARGNE", compte: "5123", montant: 30000, libelle: "Caisse d'Épargne" },
  ],
};

export const RELEVES_BANCAIRES: DocumentSource = {
  id: "demo-releves-bancaires",
  label: "Relevés bancaires",
  type: "rapprochement_bancaire",
  format: "demo",
  lignes: [
    { tiers: "BNP", compte: "5121", montant: 405000, libelle: "BNP — relevé déc." },
    { tiers: "SG", compte: "5122", montant: 85000, libelle: "Société Générale — relevé déc." },
    { tiers: "LCL", compte: "5124", montant: 12000, libelle: "LCL — relevé déc." },
  ],
};

export const CONFIG_TRESORERIE: RapprochementConfig = {
  cycleSlug: "tresorerie-disponibilites",
  siloId: "rapprochement-tresorerie",
  cloison: "bilan-actif",
  cles: ["tiers", "montant"],
  toleranceEur: 500,
  // Le solde bancaire se prouve par confirmation directe (ISA 505).
  sources: { rapprochement_solde: "ISA_505", perimetre: "ISA_505" },
};

export function buildTresorerieRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(SOLDES_COMPTABLES_512, RELEVES_BANCAIRES, CONFIG_TRESORERIE, th);
}

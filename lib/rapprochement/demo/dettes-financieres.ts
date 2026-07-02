import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "../build";
import type { DocumentSource, RapprochementConfig } from "../types";

/** Cycle DETTES FINANCIÈRES — tableau d'amortissement des emprunts ↔ grand-livre (16x). */

export const TABLEAU_AMORTISSEMENT_EMPRUNTS: DocumentSource = {
  id: "demo-tableau-amortissement-emprunts",
  label: "Tableau d'amortissement des emprunts",
  type: "autre",
  format: "demo",
  lignes: [
    { piece: "EMP-2021-01", compte: "1641", montant: 240000, libelle: "Emprunt investissement machine-outil (CRCA)" },
    { piece: "EMP-2022-03", compte: "1641", montant: 95000, libelle: "Emprunt matériel de transport (BNP)" },
    { piece: "EMP-2023-02", compte: "1687", montant: 30000, libelle: "Avance compte courant associé" },
    { piece: "EMP-2019-04", compte: "1641", montant: 18000, libelle: "Emprunt extension entrepôt (Société Générale)" },
  ],
};

export const GRAND_LIVRE_CLASSE_16: DocumentSource = {
  id: "demo-grand-livre-classe-16",
  label: "Grand-livre classe 16",
  type: "grand_livre",
  format: "demo",
  lignes: [
    { piece: "EMP-2021-01", compte: "1641", montant: 240000, libelle: "Emprunt investissement machine-outil (CRCA)" },
    { piece: "EMP-2022-03", compte: "1641", montant: 88000, libelle: "Emprunt matériel de transport (BNP)" },
    { piece: "EMP-2023-02", compte: "1687", montant: 30000, libelle: "Avance compte courant associé" },
    { piece: "EMP-2024-05", compte: "1641", montant: 50000, libelle: "Emprunt non identifié au tableau d'amortissement" },
  ],
};

export const CONFIG_DETTES_FINANCIERES: RapprochementConfig = {
  cycleSlug: "dettes-financieres-emprunts",
  siloId: "rapprochement-dettes-financieres",
  cloison: "bilan-passif",
  cles: ["piece", "montant"],
  toleranceEur: 500,
};

export function buildDETTES_FINANCIERESRapprochementSilo(
  th: MaterialityThresholds | null = null,
): SiloView {
  return buildRapprochementSilo(
    TABLEAU_AMORTISSEMENT_EMPRUNTS,
    GRAND_LIVRE_CLASSE_16,
    CONFIG_DETTES_FINANCIERES,
    th,
  );
}

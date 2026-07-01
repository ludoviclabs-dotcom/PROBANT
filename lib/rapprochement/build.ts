import type { ReconstitutedStatement, SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { rapprocher, type EngineOptions } from "./engine";
import { resultToFindings } from "./to-findings";
import type { DocumentSource, RapprochementConfig } from "./types";

/**
 * Assemble une `SiloView` complète à partir de deux documents et d'une config :
 * état de rapprochement (Zone A) + constats d'écarts (Zone B). Générique — sert
 * tous les cycles à l'identique.
 */
export function buildRapprochementSilo(
  source: DocumentSource,
  cible: DocumentSource,
  config: RapprochementConfig,
  th: MaterialityThresholds | null = null,
  options: EngineOptions = {},
): SiloView {
  const result = rapprocher(source, cible, config, options);
  const findings = resultToFindings(result, th);

  // Relie le 1er constat à la ligne « écart de rapprochement » (connecteur visuel).
  if (findings[0]) findings[0] = { ...findings[0], cibleRowId: "rappro-ecart" };

  const labelS = config.labelSource ?? source.label;
  const labelC = config.labelCible ?? cible.label;

  const statement: ReconstitutedStatement = {
    titre: `Rapprochement — ${labelS} ↔ ${labelC}`,
    unite: "EUR",
    note: `Confrontation de « ${labelS} » et « ${labelC} ».`,
    documents: [
      { label: labelS, statut: "analyse" },
      { label: labelC, statut: "analyse" },
    ],
    rows: [
      { id: "rappro-source", label: `Solde ${labelS}`, valeur: Math.round(result.totalSource), kind: "ligne" },
      { id: "rappro-cible", label: `Solde ${labelC}`, valeur: Math.round(result.totalCible), kind: "ligne" },
      {
        id: "rappro-ecart",
        label: "Écart de rapprochement",
        valeur: Math.round(result.ecartGlobal),
        kind: "total",
        flaggedBy: findings[0]?.id,
        severity: findings[0]?.severity,
      },
    ],
  };

  return { siloId: config.siloId, statement, findings };
}

import type { SiloView } from "@/lib/canonical-model";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodIssues } from "@/lib/canonical-model/period";

export const UPLOAD_CONTRACT_VERSION = "2.0.0";
export interface UploadQualification {
  entity: string;
  period?: AccountingPeriod;
  comparisonBasisConfirmed: boolean;
  technicalToleranceEur: number;
  selection: "all_imported_rows";
  materialityAmount: number | null;
}
export interface UploadDocument {
  id: string;
  fileName: string;
  fingerprint: string;
  lineCount: number;
  parserVersion?: string;
  mappingVersion?: string;
}
export interface UploadExecution {
  id: string;
  identity: string;
  cycleId: string;
  version: number;
  contractVersion: string;
  state: "active" | "stale";
  staleReason?: string;
  status: "blocked" | "inconclusive" | "compared";
  qualification: UploadQualification;
  issues: string[];
  documents: UploadDocument[];
  generatedAt: string;
  silo: SiloView;
}

export function qualificationIssues(input: UploadQualification): string[] {
  const issues = [...periodIssues(input.period)];
  if (!input.entity.trim()) issues.push("Entité absente : identifier l’entité des deux documents.");
  if (input.period && input.period.validation !== "confirmed") issues.push("Période à confirmer pour les deux documents.");
  if (!input.comparisonBasisConfirmed) issues.push("Bases de comparaison à confirmer : même entité, période, périmètre et convention de signe.");
  if (!Number.isFinite(input.technicalToleranceEur) || input.technicalToleranceEur < 0) issues.push("Tolérance technique invalide.");
  if (input.selection !== "all_imported_rows") issues.push("Sélection non prise en charge.");
  if (input.materialityAmount !== null && (!Number.isFinite(input.materialityAmount) || input.materialityAmount <= 0)) issues.push("Seuil de signification invalide.");
  return issues;
}

export function uploadStatus(silo: SiloView, qualification: UploadQualification): UploadExecution["status"] {
  if (qualificationIssues(qualification).length || !silo.rapprochement) return "blocked";
  const counts = silo.rapprochement.lignes;
  return counts.ambigu.source + counts.ambigu.cible + counts.non_testable.source + counts.non_testable.cible > 0 ? "inconclusive" : "compared";
}

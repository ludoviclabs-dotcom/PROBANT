import type { Finding } from "./finding";
import type { AccountingPeriod } from "./period";

export interface CalculationScope { organizationId: string; dossierId: string; mode: "demo" | "real" }
export interface CalculationSourceRef {
  documentId: string;
  documentVersionId: string;
  normalizedHash: string;
  fingerprint?: string;
  parserVersion: string;
  mappingVersion: string;
}
/** Minimal result envelope for existing engines, not another procedure engine. */
export interface CalculationRun {
  id: string;
  calculationKey: string;
  ruleVersion: string;
  inputHash: string;
  scope: CalculationScope;
  period?: AccountingPeriod;
  execution: "completed" | "blocked" | "failed";
  outcome: "no_exception_detected" | "exceptions_detected" | "inconclusive";
  sourceRefs: CalculationSourceRef[];
  input: unknown;
  result: unknown;
  findings: Finding[];
  warnings: string[];
  blockedControls: string[];
}

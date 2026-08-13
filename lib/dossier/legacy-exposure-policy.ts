
import type { Finding, Severity } from "@/lib/canonical-model";

export const LEGACY_EXPOSURE_WEIGHTS: Record<Severity, number> = {
  bloquant: 25,
  majeur: 8,
  mineur: 2,
  informatif: 0.5,
};

export function findingFinancialIncidence(finding: Finding): number {
  return finding.mesure.unite === "EUR"
    ? Math.abs(finding.mesure.constate - finding.mesure.seuil)
    : 0;
}

export function computeLegacyExposureIndex(findings: Finding[]): number {
  const weighted = findings.reduce(
    (sum, finding) => sum + LEGACY_EXPOSURE_WEIGHTS[finding.severity],
    0,
  );
  return Math.round((100 * weighted) / (weighted + 52));
}


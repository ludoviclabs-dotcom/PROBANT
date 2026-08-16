import type { TaxDocumentSnapshot, TaxPeriod, TaxProfile } from "@/lib/canonical-model";
import {
  createTaxDeclarationField,
  createTaxDocumentSnapshot,
  createTaxPeriod,
  createTaxProfile,
} from "@/lib/tax";
import type { CorporateTaxComputationInput } from "../engine";

export const CREATED_AT = "2026-08-16T10:00:00.000Z";
const SOURCE_HASH = "b".repeat(64);

export const ORG = "org-a";
export const DOSSIER = "dossier-1";
export const ENTITY = "entity-1";

/** 10 000 000 centimes = 100 000,00 EUR. Les tests raisonnent toujours en centimes. */
export function euros(amount: number): number {
  return Math.round(amount * 100);
}

export function profile(overrides: Partial<Parameters<typeof createTaxProfile>[0]> = {}): TaxProfile {
  return createTaxProfile({
    id: "profile-1",
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    version: "1",
    jurisdiction: "FR",
    status: "confirmed",
    corporateIncomeTaxRegime: "standard",
    vatRegime: "real_normal",
    accountingPeriod: { startDate: "2026-01-01", endDate: "2026-12-31" },
    corporateIncomeTaxGroupStatus: "none",
    vatGroupStatus: "none",
    turnoverAmountCents: euros(5_000_000),
    // Par defaut le taux reduit est ecarte de facon deterministe : les scenarios
    // qui le testent surchargent explicitement ces trois faits.
    capitalPaidStatus: "partially_paid",
    ownershipStatus: "unknown",
    qualifyingIndividualOwnershipBasisPoints: null,
    vatLiabilityRatioStatus: "unknown",
    vatLiabilityRatioBasisPoints: null,
    establishments: [],
    parameters: [],
    confirmedBy: "reviewer-1",
    confirmedAt: CREATED_AT,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

/** Profil satisfaisant les trois conditions du taux reduit. */
export function eligibleProfile(overrides: Partial<Parameters<typeof createTaxProfile>[0]> = {}): TaxProfile {
  return profile({
    capitalPaidStatus: "fully_paid",
    ownershipStatus: "known",
    qualifyingIndividualOwnershipBasisPoints: 10_000,
    ...overrides,
  });
}

export function period(overrides: Partial<Parameters<typeof createTaxPeriod>[0]> = {}): TaxPeriod {
  return createTaxPeriod({
    id: "period-1",
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    taxType: "corporate_income_tax",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    fiscalYear: 2026,
    formVintage: 2026,
    frequency: "annual",
    accountingPeriodId: "accounting-period-1",
    status: "filed",
    version: "1",
    sourceRefs: ["form-2050-liasse-v2026"],
    createdAt: CREATED_AT,
    ...overrides,
  });
}

/**
 * Construit un snapshot de formulaire a partir d'une table `case -> centimes`.
 * Chaque champ est marque exploitable : les scenarios qui testent l'indisponibilite
 * retirent la case plutot que d'inventer un statut.
 */
export function formSnapshot(options: {
  readonly id: string;
  readonly formNumber: string;
  readonly documentType: string;
  readonly boxes: Readonly<Record<string, number>>;
  readonly formVintage?: number;
  readonly usable?: boolean;
}): TaxDocumentSnapshot {
  const formVintage = options.formVintage ?? 2026;
  return createTaxDocumentSnapshot({
    id: options.id,
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    logicalDocumentId: `logical-${options.id}`,
    sourceDocumentId: `source-${options.id}`,
    taxPeriodId: "period-1",
    taxPeriodVersion: "1",
    taxType: "corporate_income_tax",
    documentType: options.documentType,
    formNumber: options.formNumber,
    formVintage,
    snapshotVersion: "1",
    schemaVersion: "2026.1",
    parserName: "golden-fixture",
    parserVersion: "1",
    sourceHash: SOURCE_HASH,
    fields: Object.entries(options.boxes).map(([fieldCode, amountCents]) =>
      createTaxDeclarationField({
        id: `${options.id}:${fieldCode}`,
        organizationId: ORG,
        dossierId: DOSSIER,
        taxDocumentSnapshotId: options.id,
        formVintage,
        fieldCode,
        label: `Case ${fieldCode}`,
        dataType: "amount",
        rawValue: String(amountCents),
        amountCents,
        normalizedValue: null,
        percentageBasisPoints: null,
        unit: "cent",
        sign: "positive",
        documentHash: SOURCE_HASH,
        sourceLocation: {
          page: 1,
          sheet: null,
          cell: null,
          box: fieldCode,
          zone: `case-${fieldCode}`,
          structuredPath: null,
        },
        extractionMethod: "structured",
        parserVersion: "1",
        confidence: 1,
        processingStatus: options.usable === false ? "needs_manual_review" : "accepted",
        usableForAutomatedCalculation: options.usable !== false,
        reviewStatus: "verified",
        warnings: [],
        evidenceStrength: "direct",
      })),
    warnings: [],
    limitationIds: [],
    supersedesSnapshotId: null,
    status: "active",
    createdAt: CREATED_AT,
    createdBy: "reviewer-1",
  });
}

export function liasse2058A(boxes: Readonly<Record<string, number>>, formVintage?: number): TaxDocumentSnapshot {
  return formSnapshot({
    id: "snapshot-2058-a",
    formNumber: "2058-A-SD",
    documentType: "form_2058_a",
    boxes,
    formVintage,
  });
}

export function liasse2058B(boxes: Readonly<Record<string, number>>): TaxDocumentSnapshot {
  return formSnapshot({
    id: "snapshot-2058-b",
    formNumber: "2058-B-SD",
    documentType: "form_2058_b",
    boxes,
  });
}

export function declaration2065(boxes: Readonly<Record<string, number>>): TaxDocumentSnapshot {
  return formSnapshot({
    id: "snapshot-2065",
    formNumber: "2065-SD",
    documentType: "declaration_2065",
    boxes,
  });
}

export function liasse2033B(boxes: Readonly<Record<string, number>>): TaxDocumentSnapshot {
  return formSnapshot({
    id: "snapshot-2033-b",
    formNumber: "2033-B-SD",
    documentType: "form_2033_b",
    boxes,
  });
}

export function computationInput(
  overrides: Partial<CorporateTaxComputationInput> = {},
): CorporateTaxComputationInput {
  return {
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    executionId: "execution-1",
    snapshotId: "corporate-tax-snapshot-1",
    profile: profile(),
    period: period(),
    documentSnapshots: [],
    createdAt: CREATED_AT,
    createdBy: "reviewer-1",
    ...overrides,
  };
}

/** Liasse complete et coherente, utilisee comme base des scenarios nominaux. */
export function coherentLiasse(options: {
  readonly accountingProfitCents?: number;
  readonly accountingLossCents?: number;
  readonly reintegrationsCents?: number;
  readonly deductionsCents?: number;
  readonly deficitOffsetCents?: number;
}): TaxDocumentSnapshot {
  const profit = options.accountingProfitCents ?? 0;
  const loss = options.accountingLossCents ?? 0;
  const reintegrations = options.reintegrationsCents ?? 0;
  const deductions = options.deductionsCents ?? 0;
  const offset = options.deficitOffsetCents ?? 0;
  const beforeDeficits = profit - loss + reintegrations - deductions;
  const afterDeficits = beforeDeficits - offset;
  return liasse2058A({
    WA: profit,
    WS: loss,
    WR: reintegrations,
    XH: deductions,
    XI: beforeDeficits > 0 ? beforeDeficits : 0,
    XJ: beforeDeficits < 0 ? -beforeDeficits : 0,
    XL: offset,
    XN: afterDeficits > 0 ? afterDeficits : 0,
    XO: afterDeficits < 0 ? -afterDeficits : 0,
  });
}

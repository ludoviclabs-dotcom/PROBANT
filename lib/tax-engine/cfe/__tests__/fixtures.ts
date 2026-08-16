import type { FecEntry, TaxPeriod, TaxProfile } from "@/lib/canonical-model";
import { createTaxPeriod, createTaxProfile } from "@/lib/tax";
import { stableHash } from "@/lib/synthesis/canonical";
import type { CfeReconciliationInput } from "../engine";
import type { CfeNotice, CfeNoticeLine } from "../types";

export const CREATED_AT = "2026-08-16T10:00:00.000Z";
export const ORG = "org-a";
export const DOSSIER = "dossier-1";
export const ENTITY = "entity-1";

export function euros(amount: number): number {
  return Math.round(amount * 100);
}

export function cfeProfile(
  overrides: Partial<Parameters<typeof createTaxProfile>[0]> = {},
): TaxProfile {
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
    capitalPaidStatus: "fully_paid",
    ownershipStatus: "unknown",
    qualifyingIndividualOwnershipBasisPoints: null,
    vatLiabilityRatioStatus: "unknown",
    vatLiabilityRatioBasisPoints: null,
    establishments: [{
      establishmentId: "etab-paris",
      countryCode: "FR",
      postalCode: "75001",
      municipality: "Paris",
      isPrincipal: true,
      verificationStatus: "verified",
    }],
    parameters: [{
      key: "cfe_exemption",
      value: false,
      verificationStatus: "verified",
      sourceRefs: ["profil-fiscal"],
      verifiedBy: "reviewer-1",
      verifiedAt: CREATED_AT,
    }],
    confirmedBy: "reviewer-1",
    confirmedAt: CREATED_AT,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

export function cfePeriod(
  overrides: Partial<Parameters<typeof createTaxPeriod>[0]> = {},
): TaxPeriod {
  return createTaxPeriod({
    id: "cfe-period-2026",
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    taxType: "cfe",
    // La doctrine CFE publiee n'est effective qu'a compter du 29 avril 2026 :
    // les scenarios nominaux se placent donc apres cette date.
    startDate: "2026-05-01",
    endDate: "2026-12-31",
    fiscalYear: 2026,
    formVintage: 2026,
    frequency: "annual",
    accountingPeriodId: "accounting-period-1",
    status: "filed",
    version: "1",
    sourceRefs: ["bofip-cfe-v2026-04-29"],
    createdAt: CREATED_AT,
    ...overrides,
  });
}

export function cfeNotice(options: {
  readonly id?: string;
  readonly establishmentId?: string;
  readonly totalDueCents?: number | null;
  readonly lines?: readonly CfeNoticeLine[];
  readonly provenance?: CfeNotice["provenance"];
  readonly sourceDocumentId?: string | null;
  readonly periodStartDate?: string;
  readonly periodEndDate?: string;
  readonly taxYear?: number;
  readonly capturedBy?: string;
} = {}): CfeNotice {
  const provenance = options.provenance ?? "imported_document";
  const body = {
    establishmentId: options.establishmentId ?? "etab-paris",
    taxYear: options.taxYear ?? 2026,
    periodStartDate: options.periodStartDate ?? "2026-05-01",
    periodEndDate: options.periodEndDate ?? "2026-12-31",
    lines: options.lines ?? [],
    totalDueCents: options.totalDueCents === undefined ? euros(1_200) : options.totalDueCents,
    provenance,
    sourceDocumentId: options.sourceDocumentId === undefined
      ? (provenance === "imported_document" ? "tax-notice-doc-1" : null)
      : options.sourceDocumentId,
    capturedBy: options.capturedBy ?? "reviewer-1",
    capturedAt: CREATED_AT,
  };
  return Object.freeze({
    ...body,
    id: options.id ?? "cfe-notice-1",
    noticeHash: stableHash(body),
  });
}

let lineCounter = 0;

export function fecLine(overrides: Partial<FecEntry> & { compteNum: string }): FecEntry {
  lineCounter += 1;
  const debit = overrides.debit ?? 0;
  const credit = overrides.credit ?? 0;
  return {
    ligne: overrides.ligne ?? lineCounter,
    journalCode: overrides.journalCode ?? "OD",
    journalLib: overrides.journalLib ?? "Operations diverses",
    ecritureNum: overrides.ecritureNum ?? "E001",
    ecritureDate: overrides.ecritureDate ?? "20260615",
    compteNum: overrides.compteNum,
    compteLib: overrides.compteLib ?? `Compte ${overrides.compteNum}`,
    compAuxNum: "",
    compAuxLib: "",
    pieceRef: overrides.pieceRef ?? "CFE-2026",
    pieceDate: overrides.pieceDate ?? "20260615",
    ecritureLib: overrides.ecritureLib ?? "CFE 2026",
    debit,
    credit,
    ecritureLet: "",
    dateLet: "",
    validDate: "20261231",
    montant: debit - credit,
  };
}

/** Comptabilisation de la charge de CFE par le crédit d'un compte de dette. */
export function chargeEntry(options: {
  readonly ecritureNum?: string;
  readonly amountEuros: number;
}): readonly FecEntry[] {
  const shared = { ecritureNum: options.ecritureNum ?? "CH1", journalCode: "OD" };
  return [
    fecLine({ ...shared, compteNum: "635110", debit: options.amountEuros }),
    fecLine({ ...shared, compteNum: "447000", credit: options.amountEuros }),
  ];
}

/** Règlement de la CFE : la dette est débitée, la banque créditée. */
export function settlementEntry(options: {
  readonly ecritureNum?: string;
  readonly amountEuros: number;
}): readonly FecEntry[] {
  const shared = { ecritureNum: options.ecritureNum ?? "RG1", journalCode: "BQ" };
  return [
    fecLine({ ...shared, compteNum: "447000", debit: options.amountEuros }),
    fecLine({ ...shared, compteNum: "512000", credit: options.amountEuros }),
  ];
}

export function reconciliationInput(
  overrides: Partial<CfeReconciliationInput> = {},
): CfeReconciliationInput {
  return {
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    executionId: "execution-cfe-1",
    snapshotId: "cfe-snapshot-1",
    profile: cfeProfile(),
    period: cfePeriod(),
    notices: [],
    fecEntries: [],
    createdAt: CREATED_AT,
    createdBy: "reviewer-1",
    ...overrides,
  };
}

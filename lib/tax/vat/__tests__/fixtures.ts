import type { FecEntry, TaxDocumentSnapshot, TaxPeriod, TaxProfile } from "@/lib/canonical-model";
import {
  createTaxDeclarationField,
  createTaxDocumentSnapshot,
  createTaxPeriod,
  createTaxProfile,
} from "@/lib/tax";
import type { VatReconciliationInput } from "../engine";

export const CREATED_AT = "2026-08-16T10:00:00.000Z";
const SOURCE_HASH = "d".repeat(64);

export const ORG = "org-a";
export const DOSSIER = "dossier-1";
export const ENTITY = "entity-1";

/** Les tests raisonnent en euros ; le moteur, en centimes. */
export function euros(amount: number): number {
  return Math.round(amount * 100);
}

export function vatProfile(
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
    establishments: [],
    parameters: [],
    confirmedBy: "reviewer-1",
    confirmedAt: CREATED_AT,
    createdAt: CREATED_AT,
    ...overrides,
  });
}

export function vatPeriod(
  overrides: Partial<Parameters<typeof createTaxPeriod>[0]> = {},
): TaxPeriod {
  return createTaxPeriod({
    id: "vat-period-1",
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    taxType: "vat",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    fiscalYear: 2026,
    formVintage: 2026,
    frequency: "monthly",
    accountingPeriodId: "accounting-period-1",
    status: "filed",
    version: "1",
    sourceRefs: ["form-ca3-v2026"],
    createdAt: CREATED_AT,
    ...overrides,
  });
}

let lineCounter = 0;

/** Ligne FEC minimale mais complète. Les montants sont en euros décimaux. */
export function fecLine(overrides: Partial<FecEntry> & { compteNum: string }): FecEntry {
  lineCounter += 1;
  const debit = overrides.debit ?? 0;
  const credit = overrides.credit ?? 0;
  return {
    ligne: overrides.ligne ?? lineCounter,
    journalCode: overrides.journalCode ?? "VE",
    journalLib: overrides.journalLib ?? "Ventes",
    ecritureNum: overrides.ecritureNum ?? "E001",
    ecritureDate: overrides.ecritureDate ?? "20260315",
    compteNum: overrides.compteNum,
    compteLib: overrides.compteLib ?? `Compte ${overrides.compteNum}`,
    compAuxNum: overrides.compAuxNum ?? "",
    compAuxLib: overrides.compAuxLib ?? "",
    pieceRef: overrides.pieceRef ?? "FA-001",
    pieceDate: overrides.pieceDate ?? "20260315",
    ecritureLib: overrides.ecritureLib ?? "Vente",
    debit,
    credit,
    ecritureLet: overrides.ecritureLet ?? "",
    dateLet: overrides.dateLet ?? "",
    validDate: overrides.validDate ?? "20260331",
    montant: debit - credit,
  };
}

export function resetLineCounter(): void {
  lineCounter = 0;
}

/**
 * Écriture de vente : base HT au crédit d'un compte 70, TVA au crédit d'un
 * compte 4457. Les montants sont en euros décimaux, comme dans un vrai FEC.
 */
export function saleEntry(options: {
  readonly ecritureNum: string;
  readonly baseEuros: number;
  readonly vatEuros: number;
  readonly pieceRef?: string | null;
  readonly pieceDate?: string;
  readonly ecritureDate?: string;
  readonly vatAccount?: string;
}): readonly FecEntry[] {
  const shared = {
    journalCode: "VE",
    ecritureNum: options.ecritureNum,
    ecritureDate: options.ecritureDate ?? "20260315",
    pieceRef: options.pieceRef === null ? "" : options.pieceRef ?? `FA-${options.ecritureNum}`,
    pieceDate: options.pieceDate ?? "20260315",
  };
  return [
    fecLine({ ...shared, compteNum: "411000", debit: options.baseEuros + options.vatEuros }),
    fecLine({ ...shared, compteNum: "706000", credit: options.baseEuros }),
    fecLine({ ...shared, compteNum: options.vatAccount ?? "445710", credit: options.vatEuros }),
  ];
}

/** Écriture d'achat : base HT au débit d'un compte 60, TVA au débit d'un 4456. */
export function purchaseEntry(options: {
  readonly ecritureNum: string;
  readonly baseEuros: number;
  readonly vatEuros: number;
  readonly pieceRef?: string | null;
  readonly pieceDate?: string;
  readonly ecritureDate?: string;
}): readonly FecEntry[] {
  const shared = {
    journalCode: "AC",
    journalLib: "Achats",
    ecritureNum: options.ecritureNum,
    ecritureDate: options.ecritureDate ?? "20260315",
    pieceRef: options.pieceRef === null ? "" : options.pieceRef ?? `FF-${options.ecritureNum}`,
    pieceDate: options.pieceDate ?? "20260315",
  };
  return [
    fecLine({ ...shared, compteNum: "607000", debit: options.baseEuros }),
    fecLine({ ...shared, compteNum: "445660", debit: options.vatEuros }),
    fecLine({ ...shared, compteNum: "401000", credit: options.baseEuros + options.vatEuros }),
  ];
}

/** Avoir sur vente : sens inversé, montants négatifs après orientation. */
export function creditNoteEntry(options: {
  readonly ecritureNum: string;
  readonly baseEuros: number;
  readonly vatEuros: number;
}): readonly FecEntry[] {
  const shared = {
    journalCode: "VE",
    ecritureNum: options.ecritureNum,
    ecritureDate: "20260320",
    pieceRef: `AV-${options.ecritureNum}`,
    pieceDate: "20260320",
    ecritureLib: "Avoir",
  };
  return [
    fecLine({ ...shared, compteNum: "706000", debit: options.baseEuros }),
    fecLine({ ...shared, compteNum: "445710", debit: options.vatEuros }),
    fecLine({ ...shared, compteNum: "411000", credit: options.baseEuros + options.vatEuros }),
  ];
}

/** Autoliquidation : TVA collectée et déductible du même montant. */
export function reverseChargeEntry(options: {
  readonly ecritureNum: string;
  readonly baseEuros: number;
  readonly vatEuros: number;
}): readonly FecEntry[] {
  const shared = {
    journalCode: "AC",
    ecritureNum: options.ecritureNum,
    ecritureDate: "20260318",
    pieceRef: `FF-${options.ecritureNum}`,
    pieceDate: "20260318",
    ecritureLib: "Achat intracommunautaire",
  };
  return [
    fecLine({ ...shared, compteNum: "607000", debit: options.baseEuros }),
    fecLine({ ...shared, compteNum: "401000", credit: options.baseEuros }),
    fecLine({ ...shared, compteNum: "445710", credit: options.vatEuros }),
    fecLine({ ...shared, compteNum: "445660", debit: options.vatEuros }),
  ];
}

/** Snapshot de déclaration CA3 ou CA12 à partir d'une table `case -> centimes`. */
export function declarationSnapshot(options: {
  readonly formNumber: string;
  readonly documentType: string;
  readonly boxes: Readonly<Record<string, number>>;
  readonly formVintage?: number;
  readonly taxPeriodId?: string;
}): TaxDocumentSnapshot {
  const formVintage = options.formVintage ?? 2026;
  const id = `snapshot-${options.formNumber}`;
  return createTaxDocumentSnapshot({
    id,
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    logicalDocumentId: `logical-${id}`,
    sourceDocumentId: `source-${id}`,
    taxPeriodId: options.taxPeriodId ?? "vat-period-1",
    taxPeriodVersion: "1",
    taxType: "vat",
    documentType: options.documentType,
    formNumber: options.formNumber,
    formVintage,
    snapshotVersion: "1",
    schemaVersion: "2026.1",
    parserName: "vat-fixture",
    parserVersion: "1",
    sourceHash: SOURCE_HASH,
    fields: Object.entries(options.boxes).map(([fieldCode, amountCents]) =>
      createTaxDeclarationField({
        id: `${id}:${fieldCode}`,
        organizationId: ORG,
        dossierId: DOSSIER,
        taxDocumentSnapshotId: id,
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
        processingStatus: "accepted",
        usableForAutomatedCalculation: true,
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

export function ca3(boxes: Readonly<Record<string, number>>, taxPeriodId?: string): TaxDocumentSnapshot {
  return declarationSnapshot({
    formNumber: "3310-CA3-SD",
    documentType: "declaration_tva_ca3",
    boxes,
    taxPeriodId,
  });
}

export function ca12(boxes: Readonly<Record<string, number>>, taxPeriodId?: string): TaxDocumentSnapshot {
  return declarationSnapshot({
    formNumber: "3517-S-SD",
    documentType: "declaration_tva_ca12",
    boxes,
    taxPeriodId,
  });
}

export function reconciliationInput(
  overrides: Partial<VatReconciliationInput> = {},
): VatReconciliationInput {
  return {
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    executionId: "execution-vat-1",
    snapshotId: "vat-snapshot-1",
    profile: vatProfile(),
    period: vatPeriod(),
    fecEntries: [],
    documentSnapshots: [],
    createdAt: CREATED_AT,
    createdBy: "reviewer-1",
    ...overrides,
  };
}

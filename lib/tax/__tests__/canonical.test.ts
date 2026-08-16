import { describe, expect, it } from "vitest";
import { findingDomain, type Finding } from "@/lib/canonical-model";
import {
  createTaxComputationSnapshot,
  createTaxAdjustment,
  createTaxDeclarationField,
  createTaxPeriod,
  createTaxProfile,
  createTaxReconciliationLine,
  TaxPeriodSchema,
} from "@/lib/tax";
import {
  computationInput,
  adjustmentInput,
  fieldInput,
  fixtures,
  periodInput,
  profileInput,
  reconciliationInput,
} from "./fixtures";

describe("canonical tax model", () => {
  it("serializes deterministically and freezes snapshots", () => {
    const left = createTaxProfile(profileInput());
    const rightInput = profileInput();
    const right = createTaxProfile({
      createdAt: rightInput.createdAt,
      parameters: rightInput.parameters,
      establishments: rightInput.establishments,
      vatLiabilityRatioBasisPoints: rightInput.vatLiabilityRatioBasisPoints,
      vatLiabilityRatioStatus: rightInput.vatLiabilityRatioStatus,
      qualifyingIndividualOwnershipBasisPoints: rightInput.qualifyingIndividualOwnershipBasisPoints,
      ownershipStatus: rightInput.ownershipStatus,
      capitalPaidStatus: rightInput.capitalPaidStatus,
      turnoverAmountCents: rightInput.turnoverAmountCents,
      vatGroupStatus: rightInput.vatGroupStatus,
      corporateIncomeTaxGroupStatus: rightInput.corporateIncomeTaxGroupStatus,
      accountingPeriod: rightInput.accountingPeriod,
      vatRegime: rightInput.vatRegime,
      corporateIncomeTaxRegime: rightInput.corporateIncomeTaxRegime,
      status: rightInput.status,
      jurisdiction: rightInput.jurisdiction,
      version: rightInput.version,
      entityId: rightInput.entityId,
      dossierId: rightInput.dossierId,
      organizationId: rightInput.organizationId,
      id: rightInput.id,
      confirmedBy: rightInput.confirmedBy,
      confirmedAt: rightInput.confirmedAt,
    });
    expect(left.contentHash).toBe(right.contentHash);
    expect(left.canonicalJson).toBe(right.canonicalJson);
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.accountingPeriod)).toBe(true);
    expect(() => {
      (left as unknown as { status: string }).status = "confirmed";
    }).toThrow();
  });

  it("requires ordered periods, a fiscal year and a form vintage", () => {
    expect(() => createTaxPeriod(periodInput({ startDate: "2026-12-31", endDate: "2026-01-01" }))).toThrow();
    const valid = fixtures.period();
    const raw = structuredClone(valid) as unknown as Record<string, unknown>;
    delete raw.formVintage;
    expect(TaxPeriodSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects floating cent amounts in every monetary aggregate", () => {
    expect(() => createTaxProfile(profileInput({ turnoverAmountCents: 100.5 }))).toThrow();
    expect(() => createTaxDeclarationField(fieldInput({ amountCents: 100.5 }))).toThrow();
    expect(() => createTaxReconciliationLine(reconciliationInput({ differenceAmountCents: 0.5 }))).toThrow();
    expect(() => createTaxAdjustment(adjustmentInput({ baseAmountCents: 10.5 }))).toThrow();
    expect(() => createTaxComputationSnapshot(computationInput({
      outputs: [{ code: "bad", label: "Bad", amountCents: 10.25, currency: "EUR", status: "computed" }],
    }))).toThrow();
  });

  it("keeps legacy findings backward compatible", () => {
    const legacy = {
      id: "legacy-finding",
      family: "hardLaw",
      severity: "majeur",
      ruleId: "LEGACY",
      ruleVersion: "1",
      cloison: "bilan-actif",
      siloId: "legacy",
      titre: "Ancien constat",
      constat: "Constat historique",
      explication: "Sans domaine explicite",
      mesure: { constate: 0, seuil: 0, unite: "EUR", libelle: "Ecart" },
      source: { ref: "PCG", citation: "Reference", effectiveDate: "2024-01-01" },
      comptesConcernes: [],
      lignesSource: [],
      faisceau: [],
      preuve: [],
      statutRevue: "en_attente",
    } satisfies Finding;
    expect(findingDomain(legacy)).toBe("accounting");
    expect(JSON.parse(JSON.stringify(legacy))).not.toHaveProperty("domain");
  });
});


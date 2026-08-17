import { describe, expect, it } from "vitest";
import { listApplicableTaxRules, taxKnowledgeRegistry } from "@/lib/knowledge/tax-registry";
import { computeCorporateTax } from "@/lib/tax/corporate-tax";
import { reconcileVat } from "@/lib/tax/vat";
import {
  CORPORATE_TAX_GOLDEN_CASES,
  SYNTHETIC_TAX_FIXTURES,
  TAX_RELEASE_YEARS,
  VAT_GOLDEN_CASES,
  buildCorporateTaxGoldenInput,
  buildSyntheticTaxFixtureSet,
  buildSyntheticTaxPeriod,
  buildSyntheticTaxProfile,
  buildVatGoldenInput,
  runCorporateTaxGoldenCase,
  runVatGoldenCase,
} from "@/lib/tax/release";

const CONCLUSIVE_OUTCOMES = new Set([
  "passed",
  "confirmed_non_compliance",
  "reconciliation_difference",
  "potential_tax_risk",
]);

function controlOf(snapshot: { readonly controls: readonly { readonly controlId: string }[] }, id: string) {
  const control = snapshot.controls.find((candidate) => candidate.controlId === id);
  if (!control) throw new Error(`contrôle absent : ${id}`);
  return control as (typeof snapshot.controls)[number] & { readonly outcome: string };
}

function assertExactMonetaryValues(value: unknown, path = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertExactMonetaryValues(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key.endsWith("Cents") || key.endsWith("BasisPoints")) && child !== null) {
      expect(Number.isSafeInteger(child), `${path}.${key} doit être un entier sûr`).toBe(true);
    }
    assertExactMonetaryValues(child, `${path}.${key}`);
  }
}

describe("TAX-10 — corpus synthétique multi-millésimes", () => {
  it("couvre les dix familles documentaires en 2025, 2026 et 2027", () => {
    expect(SYNTHETIC_TAX_FIXTURES.map((fixture) => fixture.fiscalYear)).toEqual(TAX_RELEASE_YEARS);
    for (const fixture of SYNTHETIC_TAX_FIXTURES) {
      expect(fixture.files.map((file) => file.kind)).toEqual([
        "fec",
        "balance",
        "form_2058_a",
        "form_2033_b",
        "declaration_2065",
        "declaration_tva_ca3",
        "declaration_tva_ca12",
        "invoices",
        "tax_notice",
        "payroll_summary",
      ]);
      expect(fixture.files.every((file) => file.synthetic && file.sha256.length === 64)).toBe(true);
      expect(fixture.fixtureHash).toHaveLength(64);
      for (const snapshot of fixture.documentSnapshots) {
        const source = fixture.files.find((file) => file.kind === snapshot.documentType);
        expect(source, snapshot.documentType).toBeDefined();
        expect(snapshot.sourceHash, snapshot.documentType).toBe(source?.sha256);
        expect(snapshot.fields.every((field) => field.documentHash === source?.sha256)).toBe(true);
      }
    }
  });

  it("reconstruit exactement les mêmes hashes pour la même entrée", () => {
    for (const year of TAX_RELEASE_YEARS) {
      const first = buildSyntheticTaxFixtureSet(year);
      const second = buildSyntheticTaxFixtureSet(year);
      expect(first.fixtureHash).toBe(second.fixtureHash);
      expect(first.files.map((file) => file.sha256)).toEqual(second.files.map((file) => file.sha256));
    }
  });

  it("ne fait passer aucun montant fiscal par un flottant", () => {
    for (const fixture of SYNTHETIC_TAX_FIXTURES) {
      assertExactMonetaryValues(fixture.profile);
      assertExactMonetaryValues(fixture.documentSnapshots);
    }
    for (const golden of CORPORATE_TAX_GOLDEN_CASES) {
      assertExactMonetaryValues(runCorporateTaxGoldenCase(golden.id).snapshot);
    }
    for (const golden of VAT_GOLDEN_CASES) {
      assertExactMonetaryValues(runVatGoldenCase(golden.id).snapshot);
    }
  });
});

describe("TAX-10 — golden cases IS", () => {
  it("exécute les dix scénarios et fige statut, outcome et montants pivots", () => {
    for (const golden of CORPORATE_TAX_GOLDEN_CASES) {
      const { snapshot } = runCorporateTaxGoldenCase(golden.id);
      expect(snapshot.status, golden.id).toBe(golden.expectedStatus);
      expect(snapshot.outcome, golden.id).toBe(golden.expectedOutcome);
      expect(snapshot.snapshotHash, golden.id).toBe(golden.expectedSnapshotHash);
    }

    expect(runCorporateTaxGoldenCase("is-zero-adjustment").snapshot.grossTaxCents).toBe(2_500_000);
    expect(runCorporateTaxGoldenCase("is-reintegration").snapshot.taxResultBeforeDeficitsCents).toBe(12_000_000);
    expect(runCorporateTaxGoldenCase("is-deduction").snapshot.taxResultBeforeDeficitsCents).toBe(7_000_000);
    expect(runCorporateTaxGoldenCase("is-loss").snapshot.grossTaxCents).toBe(0);
    expect(runCorporateTaxGoldenCase("is-deficit").snapshot.taxableBaseCents).toBe(6_000_000);
    expect(runCorporateTaxGoldenCase("is-reduced-rate").snapshot.grossTaxCents).toBe(450_000);
    expect(runCorporateTaxGoldenCase("is-reduced-rate-unproven").snapshot.brackets.find((item) => item.code === "reduced_sme")?.allocatedBaseCents).toBe(0);
    expect(runCorporateTaxGoldenCase("is-inconsistent-return").snapshot.grossTaxCents).toBe(0);
    expect(runCorporateTaxGoldenCase("is-divergent-tax-charge").reconciliationLines.some((line) => line.status === "different")).toBe(true);
    expect(runCorporateTaxGoldenCase("is-missing-declaration").snapshot.taxImpactStatus).toBe("not_computed");
  });
});

describe("TAX-10 — golden cases TVA", () => {
  it("exécute les onze scénarios et fige les outcomes de prudence", () => {
    for (const golden of VAT_GOLDEN_CASES) {
      const { snapshot } = runVatGoldenCase(golden.id);
      expect(snapshot.status, golden.id).toBe(golden.expectedStatus);
      expect(snapshot.outcome, golden.id).toBe(golden.expectedOutcome);
      expect(snapshot.snapshotHash, golden.id).toBe(golden.expectedSnapshotHash);
    }

    expect(runVatGoldenCase("vat-ca3-exact").snapshot.netAccountedCents).toBe(10_000);
    expect(runVatGoldenCase("vat-collected-difference").reconciliationLines.some((line) => line.status === "different")).toBe(true);
    expect(runVatGoldenCase("vat-deductible-difference").reconciliationLines.some((line) => line.status === "different")).toBe(true);
    expect(controlOf(runVatGoldenCase("vat-missing-invoice").snapshot, "VAT.PIECE.MISSING").outcome).toBe("potential_tax_risk");
    expect(controlOf(runVatGoldenCase("vat-multiple-rates").snapshot, "VAT.RATE.UNUSUAL").outcome).toBe("review_recommendation");
    expect(runVatGoldenCase("vat-credit-note").snapshot.transactionCandidates.some((item) => item.vatAmountCents !== null && item.vatAmountCents < 0)).toBe(true);
    expect(runVatGoldenCase("vat-credit").snapshot.netAccountedCents).toBe(-30_000);
    expect(controlOf(runVatGoldenCase("vat-reverse-charge").snapshot, "VAT.REVERSE_CHARGE.CANDIDATE").outcome).toBe("review_recommendation");
    expect(controlOf(runVatGoldenCase("vat-shifted-period").snapshot, "VAT.PERIOD.SHIFT").outcome).toBe("review_recommendation");
    expect(runVatGoldenCase("vat-ca12").snapshot.declaration.formNumber).toBe("3517-S-SD");
    expect(runVatGoldenCase("vat-unknown-regime").snapshot.controls).toHaveLength(0);
  });
});

describe("TAX-10 — propriétés de sûreté", () => {
  it("est déterministe et insensible à la permutation des lignes FEC", () => {
    const corporate = () => computeCorporateTax(buildCorporateTaxGoldenInput("is-reintegration")).snapshot.snapshotHash;
    expect(corporate()).toBe(corporate());

    const input = buildVatGoldenInput("vat-ca3-exact");
    const direct = reconcileVat(input).snapshot;
    const permuted = reconcileVat({ ...input, fecEntries: [...input.fecEntries].reverse() }).snapshot;
    expect(permuted.snapshotHash).toBe(direct.snapshotHash);
    expect(permuted.netAccountedCents).toBe(direct.netAccountedCents);
  });

  it("ne conclut aucun contrôle sans entrée", () => {
    const corporateInput = buildCorporateTaxGoldenInput("is-missing-declaration");
    const corporate = computeCorporateTax(corporateInput).snapshot;
    expect(CONCLUSIVE_OUTCOMES.has(corporate.outcome)).toBe(false);

    const vatInput = buildVatGoldenInput("vat-ca3-exact");
    const vat = reconcileVat({
      ...vatInput,
      fecEntries: [],
      documentSnapshots: [],
      availableInvoiceRefs: undefined,
    }).snapshot;
    expect(vat.controls.every((control) => !CONCLUSIVE_OUTCOMES.has(control.outcome))).toBe(true);
  });

  it("n'applique aucune règle ni aucun barème hors période", () => {
    for (const year of [2025, 2027] as const) {
      expect(listApplicableTaxRules({ taxType: "corporate_income_tax", fiscalYear: year, formVintage: year })).toEqual([]);
      expect(listApplicableTaxRules({ taxType: "vat", fiscalYear: year, formVintage: year })).toEqual([]);

      const fixture = buildSyntheticTaxFixtureSet(year);
      const snapshot = computeCorporateTax({
        ...buildCorporateTaxGoldenInput("is-zero-adjustment"),
        profile: fixture.profile,
        period: fixture.corporatePeriod,
        documentSnapshots: [fixture.documentSnapshots.find((item) => item.documentType === "form_2058_a")!],
      }).snapshot;
      expect(snapshot.rateScheduleId).toBeNull();
      expect(snapshot.taxImpactStatus).toBe("not_computed");

      const vat = reconcileVat({
        ...buildVatGoldenInput("vat-ca3-exact"),
        profile: fixture.profile,
        period: fixture.vatPeriod,
        documentSnapshots: [fixture.documentSnapshots.find((item) => item.documentType === "declaration_tva_ca3")!],
      }).snapshot;
      expect(vat.status).toBe("blocked");
      expect(vat.outcome).toBe("missing_information");
      expect(vat.limitations.some((item) => item.code === "UNSUPPORTED_VAT_FORM_VINTAGE")).toBe(true);
      const sourcesByVersion = new Map(taxKnowledgeRegistry.sourceVersions.map((version) => [version.id, version]));
      expect(vat.sourceRefs.every((ref) => {
        const version = sourcesByVersion.get(ref.sourceVersionId);
        return version !== undefined &&
          (version.effectiveFrom === null || version.effectiveFrom <= fixture.vatPeriod.endDate) &&
          (version.effectiveTo === null || version.effectiveTo >= fixture.vatPeriod.startDate);
      })).toBe(true);
    }
  });

  it("ne rend aucune source secondaire obligatoire", () => {
    const sourcesById = new Map(taxKnowledgeRegistry.sources.map((source) => [source.id, source]));
    for (const rule of taxKnowledgeRegistry.rules.filter((candidate) => candidate.force === "mandatory")) {
      expect(sourcesById.get(rule.sourceId)?.nature, rule.id).not.toBe("secondary_analysis");
    }
  });

  it("ne confirme aucune déduction TVA sans la pièce requise", () => {
    const snapshot = runVatGoldenCase("vat-missing-invoice").snapshot;
    const missingPiece = controlOf(snapshot, "VAT.PIECE.MISSING");
    expect(missingPiece.outcome).not.toBe("passed");
    expect(snapshot.evidenceTier).not.toBe("ledger_declaration_and_invoice");
  });

  it("n'applique jamais le taux réduit IS sans tous les critères", () => {
    for (const overrides of [
      { capitalPaidStatus: "unknown" as const },
      { ownershipStatus: "unknown" as const, qualifyingIndividualOwnershipBasisPoints: null },
      { turnoverAmountCents: null },
    ]) {
      const input = buildCorporateTaxGoldenInput("is-reduced-rate");
      const snapshot = computeCorporateTax({
        ...input,
        profile: buildSyntheticTaxProfile(2026, {
          capitalPaidStatus: "fully_paid",
          ownershipStatus: "known",
          qualifyingIndividualOwnershipBasisPoints: 10_000,
          ...overrides,
        }),
      }).snapshot;
      const reduced = snapshot.brackets.find((item) => item.code === "reduced_sme");
      expect(reduced?.allocatedBaseCents).toBe(0);
      expect(reduced?.eligibility.status).not.toBe("eligible");
    }
  });

  it("le millésime porté par période et profil reste aligné", () => {
    for (const year of TAX_RELEASE_YEARS) {
      const profile = buildSyntheticTaxProfile(year);
      const period = buildSyntheticTaxPeriod(year, "corporate_income_tax");
      expect(profile.accountingPeriod.startDate).toBe(`${year}-01-01`);
      expect(period.fiscalYear).toBe(year);
      expect(period.formVintage).toBe(year);
    }
  });
});

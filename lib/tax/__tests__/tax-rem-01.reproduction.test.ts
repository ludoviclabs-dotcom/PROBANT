import { describe, expect, it } from "vitest";
import { computeCorporateTax } from "@/lib/tax/corporate-tax";
import {
  computationInput,
  euros,
  liasse2058A,
} from "@/lib/tax/corporate-tax/__tests__/fixtures";
import { buildVatGoldenInput } from "@/lib/tax/release/golden-cases";
import { readDeclarationBoxes } from "@/lib/tax/declaration-reading";
import { reconcileVat } from "@/lib/tax/vat";
import { buildRateBuckets } from "@/lib/tax/vat/rates";
import type { VatTransactionCandidate } from "@/lib/tax/vat/types";
import {
  ca3,
  reconciliationInput,
  saleEntry,
} from "@/lib/tax/vat/__tests__/fixtures";

const ZERO_RESULT_BOXES = {
  WR: 0,
  XH: 0,
  XI: 0,
  XJ: 0,
  XL: 0,
  XN: 0,
  XO: 0,
} as const;

function expectAccountingResultUnavailable(
  snapshot: ReturnType<typeof computeCorporateTax>["snapshot"],
): void {
  expect(snapshot.status).toBe("blocked");
  expect(snapshot.outcome).not.toBe("passed");
  expect(snapshot.taxImpactStatus).toBe("not_computed");
  expect(snapshot.grossTaxCents).toBeNull();
  expect(snapshot.brackets).toHaveLength(0);
  expect(snapshot.limitations.map((item) => item.code)).toContain(
    "ACCOUNTING_RESULT_UNAVAILABLE",
  );
}

describe("TAX-REM-01 — reproductions baseline IS", () => {
  it("A — ne conclut pas à zéro lorsque WA est absent et WS vaut zéro", () => {
    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({ WS: 0, ...ZERO_RESULT_BOXES })],
    })).snapshot;

    expectAccountingResultUnavailable(snapshot);
  });

  it("B — ne conclut pas à zéro lorsque WA vaut zéro et WS est absent", () => {
    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({ WA: 0, ...ZERO_RESULT_BOXES })],
    })).snapshot;

    expectAccountingResultUnavailable(snapshot);
  });

  it("C — ne transforme jamais une perte négative déjà signée en bénéfice", () => {
    const validLoss = liasse2058A({
      WA: 0,
      WS: euros(10_000),
      WR: 0,
      XH: 0,
      XI: 0,
      XJ: euros(10_000),
      XL: 0,
      XN: 0,
      XO: euros(10_000),
    });
    const inconsistentLoss = {
      ...validLoss,
      fields: validLoss.fields.map((field) => field.fieldCode === "WS"
        ? { ...field, amountCents: -euros(10_000), sign: "negative" as const }
        : field),
    };

    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [inconsistentLoss],
    })).snapshot;

    expectAccountingResultUnavailable(snapshot);
    expect(snapshot.accountingResultCents).not.toBe(euros(10_000));
  });
});

describe("TAX-REM-01 — frontières WA / WS", () => {
  it("calcule un bénéfice valide lorsque WA seul est non nul", () => {
    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(10_000),
        ...ZERO_RESULT_BOXES,
        XI: euros(10_000),
        XN: euros(10_000),
      })],
    })).snapshot;

    expect(snapshot.status).toBe("computed");
    expect(snapshot.accountingResultCents).toBe(euros(10_000));
  });

  it("calcule une perte valide lorsque WS seul est non nul", () => {
    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({
        WS: euros(10_000),
        ...ZERO_RESULT_BOXES,
        XJ: euros(10_000),
        XO: euros(10_000),
      })],
    })).snapshot;

    expect(snapshot.status).toBe("computed");
    expect(snapshot.accountingResultCents).toBe(-euros(10_000));
    expect(snapshot.grossTaxCents).toBe(0);
  });

  it("accepte une perte portée explicitement par sign=negative", () => {
    const loss = liasse2058A({
      WA: 0,
      WS: euros(10_000),
      ...ZERO_RESULT_BOXES,
      XJ: euros(10_000),
      XO: euros(10_000),
    });
    const explicitlySigned = {
      ...loss,
      fields: loss.fields.map((field) => field.fieldCode === "WS"
        ? { ...field, sign: "negative" as const }
        : field),
    };
    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [explicitlySigned],
    })).snapshot;

    expect(snapshot.status).toBe("computed");
    expect(snapshot.accountingResultCents).toBe(-euros(10_000));
    expect(snapshot.grossTaxCents).toBe(0);
  });

  it("bloque lorsque WA et WS sont absents", () => {
    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A(ZERO_RESULT_BOXES)],
    })).snapshot;

    expectAccountingResultUnavailable(snapshot);
  });

  it("accepte un résultat réellement nul lorsque WA et WS sont tous deux présents", () => {
    const snapshot = computeCorporateTax(computationInput({
      documentSnapshots: [liasse2058A({ WA: 0, WS: 0, ...ZERO_RESULT_BOXES })],
    })).snapshot;

    expect(snapshot.status).toBe("computed");
    expect(snapshot.accountingResultCents).toBe(0);
    expect(snapshot.limitations.map((item) => item.code)).not.toContain(
      "ACCOUNTING_RESULT_UNAVAILABLE",
    );
  });

  it("reste déterministe sur un gros montant bénéficiaire", () => {
    const input = computationInput({
      documentSnapshots: [liasse2058A({
        WA: euros(5_000_000),
        WS: 0,
        ...ZERO_RESULT_BOXES,
        XI: euros(5_000_000),
        XN: euros(5_000_000),
      })],
    });

    expect(computeCorporateTax(input).snapshot.snapshotHash).toBe(
      computeCorporateTax(input).snapshot.snapshotHash,
    );
  });
});

describe("TAX-REM-01 — statuts de lecture déclarative", () => {
  const read = (snapshot: ReturnType<typeof liasse2058A>, fieldCode: string) =>
    readDeclarationBoxes({
      snapshots: [snapshot],
      formNumber: "2058-A-SD",
      formVintage: 2026,
      fieldCodes: [fieldCode],
    });

  it("distingue valid, normalized_with_warning, invalid et missing", () => {
    const validSnapshot = liasse2058A({ WA: euros(1_000) });
    expect(read(validSnapshot, "WA").amounts[0]?.status).toBe("valid");
    expect(read(validSnapshot, "WS").issues[0]?.status).toBe("missing");

    const normalizedSnapshot = {
      ...validSnapshot,
      fields: validSnapshot.fields.map((field) => field.fieldCode === "WA"
        ? {
            ...field,
            warnings: ["DECLARATION_AMOUNT_SIGN_NORMALIZED"],
            processingStatus: "needs_manual_review" as const,
            usableForAutomatedCalculation: false,
          }
        : field),
    };
    expect(read(normalizedSnapshot, "WA").issues[0]?.status).toBe(
      "normalized_with_warning",
    );

    const invalidSnapshot = {
      ...validSnapshot,
      fields: validSnapshot.fields.map((field) => field.fieldCode === "WA"
        ? { ...field, amountCents: -euros(1_000) }
        : field),
    };
    expect(read(invalidSnapshot, "WA").issues[0]?.status).toBe("invalid");
  });
});

describe("TAX-REM-01 — reproduction baseline TVA", () => {
  const rateCandidate = (
    id: string,
    baseAmountCents: number | null,
    vatAmountCents: number,
  ): VatTransactionCandidate => ({
    id,
    direction: "collected",
    journalCode: "VE",
    ecritureNum: id,
    ecritureDate: "20260315",
    pieceRef: `FA-${id}`,
    pieceDate: "2026-03-15",
    baseAmountCents,
    vatAmountCents,
    observedRateBasisPoints: 2_000,
    baseAccounts: baseAmountCents === null ? [] : ["706000"],
    vatAccounts: ["445710"],
    linkage: baseAmountCents === null ? "vat_only" : "same_entry",
    signals: baseAmountCents === null ? ["base_not_linked"] : [],
    evidenceStrength: "derived",
    sourceLineNumbers: [1],
    candidateHash: id.padEnd(64, "0").slice(0, 64),
  });

  it("D — conserve l'absence de base HT sans fabriquer un écart certain", () => {
    const snapshot = reconcileVat(buildVatGoldenInput("vat-reverse-charge")).snapshot;
    const unresolved = snapshot.rateBuckets.find((bucket) =>
      bucket.direction === "collected" && bucket.status === "unresolved");
    const control = snapshot.controls.find((item) =>
      item.controlId === "VAT.THEORETICAL.BY_RATE");

    expect(unresolved).toBeDefined();
    expect(unresolved?.baseAmountCents).toBeNull();
    expect(unresolved?.vatTheoreticalCents).toBeNull();
    expect(unresolved?.differenceCents).toBeNull();
    expect(snapshot.transactionCandidates.some((candidate) =>
      candidate.signals.includes("base_not_linked"))).toBe(true);
    expect(control?.outcome).toBe("missing_information");
    expect(control?.differenceCents).toBeNull();
    expect(control?.detail.toLowerCase()).toMatch(/rattach|pi[eè]ce|base ht/u);
    expect(snapshot.outcome).not.toBe("reconciliation_difference");
    expect(snapshot.outcome).not.toBe("passed");
  });

  it("distingue une base HT présente à zéro d'une base absente", () => {
    const snapshot = reconcileVat(reconciliationInput({
      fecEntries: saleEntry({ ecritureNum: "ZERO", baseEuros: 0, vatEuros: 0 }),
      documentSnapshots: [ca3({
        "08": 0,
        "16": 0,
        "23": 0,
        "28": 0,
        "25": 0,
        "22": 0,
        "27": 0,
      })],
      availableInvoiceRefs: ["FA-ZERO"],
    })).snapshot;
    const unresolved = snapshot.rateBuckets.find((bucket) =>
      bucket.direction === "collected" && bucket.status === "unresolved");

    expect(unresolved?.baseAmountCents).toBe(0);
    expect(unresolved?.vatTheoreticalCents).toBeNull();
    expect(unresolved?.differenceCents).toBeNull();
    expect(snapshot.transactionCandidates.some((candidate) =>
      candidate.signals.includes("base_not_linked"))).toBe(false);
    expect(snapshot.transactionCandidates.some((candidate) =>
      candidate.signals.includes("rate_not_derivable"))).toBe(true);
  });

  it("préserve null même avec un taux connu, mais calcule zéro et une base positive", () => {
    const missing = buildRateBuckets({
      candidates: [rateCandidate("missing", null, 2_000)],
      direction: "collected",
    })[0];
    const zero = buildRateBuckets({
      candidates: [rateCandidate("zero", 0, 0)],
      direction: "collected",
    })[0];
    const positive = buildRateBuckets({
      candidates: [rateCandidate("positive", 10_000, 2_000)],
      direction: "collected",
    })[0];

    expect(missing).toMatchObject({
      rateBasisPoints: 2_000,
      baseAmountCents: null,
      vatTheoreticalCents: null,
      differenceCents: null,
    });
    expect(zero).toMatchObject({
      baseAmountCents: 0,
      vatTheoreticalCents: 0,
      differenceCents: 0,
    });
    expect(positive).toMatchObject({
      baseAmountCents: 10_000,
      vatTheoreticalCents: 2_000,
      differenceCents: 0,
    });
  });
});

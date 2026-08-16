import { describe, expect, it } from "vitest";

import type {
  TaxControlContext,
  TaxControlDefinition,
  TaxControlExecutionState,
  TaxControlInputDocument,
} from "@/lib/canonical-model";
import {
  buildTaxCapabilityMatrix,
  createTaxPeriod,
  createTaxProfile,
  TAX_CONTROL_DEFINITIONS,
  TaxCapabilityMatrixSchema,
} from "@/lib/tax";
import { stableHash } from "@/lib/synthesis/canonical";
import { periodInput, profileInput } from "./fixtures";

const PLANNER_VERSION = "tax-control-planner-1.0.0";

function document(
  documentType: string,
  options: Partial<TaxControlInputDocument> = {},
): TaxControlInputDocument {
  const snapshotId = options.snapshotId ?? `snapshot-${documentType}`;
  return {
    organizationId: "org-a",
    dossierId: "dossier-1",
    entityId: "entity-1",
    documentId: options.documentId ?? `document-${documentType}`,
    snapshotId,
    documentType,
    formVintage: 2026,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    status: "active",
    usableFieldCodes: [],
    evidenceStrength: "direct",
    contentHash: stableHash({ snapshotId, documentType }),
    ...options,
  };
}

function context(options: {
  taxType?: "corporate_income_tax" | "vat";
  profileOverrides?: Parameters<typeof profileInput>[0];
  periodOverrides?: Parameters<typeof periodInput>[0];
  documents?: readonly TaxControlInputDocument[];
  executionStates?: readonly TaxControlExecutionState[];
} = {}): TaxControlContext {
  const taxType = options.taxType ?? "corporate_income_tax";
  return {
    organizationId: "org-a",
    dossierId: "dossier-1",
    entityId: "entity-1",
    profile: createTaxProfile(profileInput(options.profileOverrides)),
    period: createTaxPeriod(periodInput({
      taxType,
      frequency: taxType === "vat" ? "monthly" : "annual",
      ...options.periodOverrides,
    })),
    documents: options.documents ?? [],
    executionStates: options.executionStates ?? [],
    plannerVersion: PLANNER_VERSION,
  };
}

function control(
  matrix: ReturnType<typeof buildTaxCapabilityMatrix>,
  controlId: string,
) {
  const result = matrix.controls.find((candidate) => candidate.controlId === controlId);
  if (!result) throw new Error(`CONTROL_NOT_FOUND:${controlId}`);
  return result;
}

describe("TaxControlPlanner capability matrix", () => {
  it("classe FEC seul et FEC + balance comme données manquantes, sans anomalie", () => {
    for (const documents of [
      [document("fec")],
      [document("fec"), document("balance")],
    ]) {
      const result = control(
        buildTaxCapabilityMatrix(context({ documents })),
        "IS.RECONCILIATION.2058A",
      );

      expect(result.status).toBe("missing_inputs");
      expect(result.outcome).toBeNull();
      expect(result.severity).toBeNull();
      expect(result.missingData).toContain("document:liasse_2050_2059");
      expect(result.recommendations.map((item) => item.ruleId)).toContain(
        "TAX.RECOMMENDATION.REQUEST_2058A",
      );
    }
  });

  it("rend le rapprochement 2058-A prêt avec FEC + liasse", () => {
    const matrix = buildTaxCapabilityMatrix(context({
      documents: [document("fec"), document("liasse_2050_2059")],
    }));
    const result = control(matrix, "IS.RECONCILIATION.2058A");

    expect(result.status).toBe("ready");
    expect(control(matrix, "IS.RECONCILIATION.2033B").status).toBe("not_applicable");
    expect(result.outcome).toBeNull();
    expect(result.evidenceStrength).toBe("corroborated");
    expect(result.usedData.map((item) => item.code)).toEqual(expect.arrayContaining([
      "fec",
      "liasse_2050_2059",
      "taxPeriod",
    ]));
  });

  it("distingue CA3 prête et TVA déductible inconclusive sans factures", () => {
    const fec = document("fec");
    const ca3 = document("declaration_tva_ca3", { usableFieldCodes: ["16", "23"] });
    const matrix = buildTaxCapabilityMatrix(context({ taxType: "vat", documents: [fec, ca3] }));

    expect(control(matrix, "VAT.FORM.CA3.RECONCILIATION").status).toBe("ready");
    const deductible = control(matrix, "VAT.DEDUCTIBLE.SUPPORT");
    expect(deductible.status).toBe("inconclusive");
    expect(deductible.outcome).toBeNull();
    expect(deductible.missingData).toEqual(["document:invoice"]);
    expect(deductible.recommendations.map((item) => item.ruleId)).toEqual([
      "TAX.RECOMMENDATION.REQUEST_INVOICES",
    ]);
  });

  it("rend la revue de TVA déductible prête avec FEC + CA3 + factures", () => {
    const matrix = buildTaxCapabilityMatrix(context({
      taxType: "vat",
      documents: [
        document("fec"),
        document("declaration_tva_ca3", { usableFieldCodes: ["16", "23"] }),
        document("invoice"),
      ],
    }));

    const result = control(matrix, "VAT.DEDUCTIBLE.SUPPORT");
    expect(result.status).toBe("ready");
    expect(result.outcome).toBeNull();
    expect(result.missingData).toEqual([]);
  });

  it("décrit un dossier incomplet par des limitations et recommandations seulement", () => {
    const matrix = buildTaxCapabilityMatrix(context());
    const result = control(matrix, "IS.RECONCILIATION.2058A");

    expect(result.status).toBe("missing_inputs");
    expect(result.outcome).toBeNull();
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(matrix.verifiedControlIds).not.toContain(result.controlId);
    expect(matrix.calculatedControlIds).not.toContain(result.controlId);
  });

  it("accepte un exercice décalé lorsque profil, période et documents sont alignés", () => {
    const dates = { startDate: "2025-07-01", endDate: "2026-06-30" };
    const matrix = buildTaxCapabilityMatrix(context({
      profileOverrides: { accountingPeriod: dates },
      periodOverrides: dates,
      documents: [
        document("fec", { periodStart: dates.startDate, periodEnd: dates.endDate }),
        document("liasse_2050_2059", { periodStart: dates.startDate, periodEnd: dates.endDate }),
      ],
    }));

    expect(control(matrix, "IS.RECONCILIATION.2058A").status).toBe("ready");
  });

  it("demande de confirmer un régime fiscal inconnu sans émettre d'anomalie", () => {
    const matrix = buildTaxCapabilityMatrix(context({
      profileOverrides: { corporateIncomeTaxRegime: "unknown" },
      documents: [document("fec"), document("liasse_2050_2059")],
    }));
    const result = control(matrix, "IS.RECONCILIATION.2058A");

    expect(result.status).toBe("missing_inputs");
    expect(result.outcome).toBeNull();
    expect(result.missingData).toContain("profile:corporateIncomeTaxRegime");
    expect(result.recommendations.map((item) => item.ruleId)).toContain(
      "TAX.RECOMMENDATION.CONFIRM_CIT_REGIME",
    );
  });

  it("produit un hash stable indépendamment de l'ordre des documents", () => {
    const documents = [
      document("fec"),
      document("declaration_tva_ca3", { usableFieldCodes: ["23", "16"] }),
      document("invoice"),
    ];
    const first = buildTaxCapabilityMatrix(context({ taxType: "vat", documents }));
    const second = buildTaxCapabilityMatrix(context({ taxType: "vat", documents: [...documents].reverse() }));

    expect(() => TaxCapabilityMatrixSchema.parse(first)).not.toThrow();
    expect(second).toEqual(first);
    expect(second.matrixHash).toBe(first.matrixHash);
  });

  it("expose eligible, running, concluded et failed sans confondre statut et outcome", () => {
    const base = TAX_CONTROL_DEFINITIONS.find((item) => item.controlId === "IS.RECONCILIATION.2058A");
    if (!base) throw new Error("FIXTURE_DEFINITION_MISSING");
    const documents = [document("fec"), document("liasse_2050_2059")];
    const definition = (suffix: string, capabilityStatus: TaxControlDefinition["capabilityStatus"] = "available") => ({
      ...base,
      controlId: `${base.controlId}.${suffix}`,
      capabilityStatus,
      definitionHash: stableHash({ base: base.definitionHash, suffix, capabilityStatus }),
    });
    const state = (
      target: TaxControlDefinition,
      status: TaxControlExecutionState["status"],
    ): TaxControlExecutionState => ({
      organizationId: "org-a",
      dossierId: "dossier-1",
      entityId: "entity-1",
      taxPeriodId: "period-1",
      controlId: target.controlId,
      controlVersion: target.controlVersion,
      definitionHash: target.definitionHash,
      status,
      outcome: status === "concluded" ? "passed" : null,
      evidenceStrength: status === "concluded" ? "corroborated" : "insufficient",
      calculationPerformed: false,
      executionHash: stableHash({ controlId: target.controlId, status }),
    });
    const eligible = definition("ELIGIBLE", "future");
    const running = definition("RUNNING");
    const concluded = definition("CONCLUDED");
    const failed = definition("FAILED");
    const matrix = buildTaxCapabilityMatrix(context({
      documents,
      executionStates: [state(running, "running"), state(concluded, "concluded"), state(failed, "failed")],
    }), [eligible, running, concluded, failed]);

    expect(control(matrix, eligible.controlId).status).toBe("eligible");
    expect(control(matrix, running.controlId).status).toBe("running");
    expect(control(matrix, concluded.controlId)).toMatchObject({ status: "concluded", outcome: "passed" });
    expect(control(matrix, failed.controlId)).toMatchObject({ status: "failed", outcome: null });
  });

  it("rejette un snapshot provenant d'un autre dossier", () => {
    const foreignDocument = document("fec", { dossierId: "dossier-foreign" });

    expect(() => buildTaxCapabilityMatrix(context({ documents: [foreignDocument] })))
      .toThrow("TAX_CONTROL_CONTEXT_DOCUMENT_SCOPE_MISMATCH");
  });
});


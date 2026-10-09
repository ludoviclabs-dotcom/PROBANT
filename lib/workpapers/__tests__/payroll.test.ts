import { expect, it } from "vitest";
import { PayrollRuntime } from "../payroll-runtime";
import { payrollActor, payrollFixture, payrollScope } from "../payroll-fixture";
import { previewPayroll } from "../payroll-import";
import type { PayrollKind } from "../payroll-contract";
import { MemoryImportRepository } from "../imports";
import { buildPayrollFraming } from "../payroll-framing";
import { periodId } from "../model";
import { payrollPeriod } from "../payroll-fixture";

const september = <T extends { month: string; rubric: string }>(rows: T[]) =>
  rows.find((x) => x.month === "2026-09" && x.rubric === "SOC")!;
async function replace(
  runtime: PayrollRuntime,
  kind: PayrollKind,
  transform: (text: string) => string,
) {
  const fixture = payrollFixture(),
    file = new File([transform(await fixture.files[kind].text())], "DSN.csv");
  const preview = await runtime.preview(
    payrollActor,
    file,
    fixture.mapping(kind),
  );
  return runtime.command(payrollActor, {
    action: "approve_import",
    version: preview.version,
    previewId: preview.previewId,
    previewHash: preview.previewHash,
  });
}
it("déclaration 50 / GL 48, rappel antérieur et salarié sorti conservés, aucune conclusion automatique", async () => {
  const runtime = await PayrollRuntime.create(),
    view = runtime.read(payrollActor),
    group = september(view.settlements.groups);
  expect(group.declaration).toEqual({
    kind: "known",
    value: { amount: "50.00", currency: "EUR" },
  });
  expect(group.glDelta).toEqual({
    kind: "known",
    value: { amount: "-2.00", currency: "EUR" },
  });
  const framing = september(view.framing.groups),
    recall = framing.details.find((x) => x.pseudonym === "SYN-A02")!;
  expect(recall.regularization).toBe("2026-08");
  expect(recall.exitDate).toBe("2026-08-31");
  expect(
    view.framing.population.find((x) => x.rowIds.includes(recall.id))?.excluded,
  ).toBe(false);
  expect(framing.variation).toMatchObject({
    kind: "known",
    value: { amount: "3.00" },
  });
  expect(framing.status).toBe("to_explain");
});
it("doublon de paiement bloquant sans déduplication, date bancaire distincte du mois déclaré", async () => {
  const view = (await PayrollRuntime.create()).read(payrollActor),
    group = september(view.settlements.groups);
  expect(group.duplicates).toHaveLength(2);
  expect(group.payments).toHaveLength(2);
  expect(group.paid.kind).toBe("unknown");
  expect(group.status).toBe("blocked");
  expect(group.payments[0].month).toBe("2026-09");
  expect(group.payments[0].date).toBe("2026-10-10");
  const retirement = view.settlements.groups.find(
    (x) => x.month === "2026-09" && x.rubric === "RET",
  )!;
  expect(retirement.paymentDelta).toMatchObject({
    kind: "known",
    value: { amount: "0.00" },
  });
  expect(retirement.evidence[0].reason).toBe("timing");
});
it("jours et heures incomparables; méthode non validée et droits incohérents bloqués", async () => {
  const view = (await PayrollRuntime.create()).read(payrollActor);
  expect(view.leave.rows[0].result?.comparable).toBe(true);
  expect(view.leave.rows[0].result?.indemnityForSpecifiedRights).toMatchObject({
    kind: "known",
    value: { amount: "12.00" },
  });
  expect(view.leave.rows[1].result?.comparable).toBe(false);
  expect(view.leave.rows[1].result?.indemnityForSpecifiedRights.kind).toBe(
    "unknown",
  );
  expect(view.leave.rows[0].result?.remainingRightsEstimate.kind).toBe(
    "unknown",
  );
  expect(
    (await PayrollRuntime.create("rules_unknown"))
      .read(payrollActor)
      .leave.rows.every(
        (x) => x.result?.indemnityForSpecifiedRights.kind === "unknown",
      ),
  ).toBe(true);
  const runtime = await PayrollRuntime.create();
  const changed = await replace(runtime, "leave", (text) =>
    text.replaceAll("30.00;20.00;10.00", "30.00;20.00;11.00"),
  );
  expect(changed.leave.rows[0].error).toBe("HR_LEAVE_INCONSISTENT");
});
it("sources absentes, partielles ou mappings inconnus ne deviennent jamais zéro", async () => {
  for (const scenario of ["empty", "partial", "mapping_unknown"]) {
    const view = (await PayrollRuntime.create(scenario)).read(payrollActor);
    expect(view.framing.sourceComplete).toBe(false);
    expect(view.framing.groups).toHaveLength(0);
    expect(view.leave.sourceReady).toBe(false);
  }
  const runtime = await PayrollRuntime.create();
  const view = await replace(runtime, "payments", (text) =>
    text
      .split("\n")
      .filter((line) => !line.startsWith("P2;") && !line.startsWith("P3;"))
      .join("\n"),
  );
  expect(september(view.settlements.groups).paid.kind).toBe("unknown");
});
it("documentation versionnée, preuve obligatoire et remplacement rendent seulement les dépendants périmés", async () => {
  const runtime = await PayrollRuntime.create(),
    before = runtime.read(payrollActor),
    g = september(before.framing.groups);
  await expect(
    runtime.command(payrollActor, {
      action: "document",
      version: 1,
      module: "framing",
      targetId: g.id,
      inputHash: before.framing.inputHash,
      reason: "recall",
      evidenceId: "missing",
    }),
  ).rejects.toThrow("HR_EVIDENCE_REQUIRED");
  const documented = await runtime.command(payrollActor, {
    action: "document",
    version: 1,
    module: "framing",
    targetId: g.id,
    inputHash: before.framing.inputHash,
    reason: "recall",
    evidenceId: g.evidence[0].id,
  });
  expect(september(documented.framing.groups).status).toBe("documented");
  expect(september(documented.framing.groups).delta).toEqual(g.delta);
  const paid = await replace(runtime, "payments", (text) =>
    text.replace("P3;", "PNEW;"),
  );
  expect(paid.framing.inputHash).toBe(before.framing.inputHash);
  expect(paid.leave.inputHash).toBe(before.leave.inputHash);
  expect(paid.settlements.inputHash).not.toBe(before.settlements.inputHash);
  const changed = await replace(runtime, "journal", (text) =>
    text.replace("J03;", "JNEW;"),
  );
  expect(september(changed.framing.groups).status).toBe("stale");
  expect(changed.leave.inputHash).toBe(before.leave.inputHash);
  await expect(
    runtime.command(payrollActor, {
      action: "document",
      version: 1,
      module: "framing",
      targetId: g.id,
      inputHash: before.framing.inputHash,
      reason: "recall",
      evidenceId: g.evidence[0].id,
    }),
  ).rejects.toThrow("HR_VERSION_CONFLICT");
});
it("exclusion tracée bloque les totaux agrégés et la variation suivante; restauration sans écriture au GL", async () => {
  const runtime = await PayrollRuntime.create(),
    before = runtime.read(payrollActor),
    g = september(before.framing.groups);
  const u = before.framing.population.find(
    (x) => x.pseudonym === "SYN-A02" && x.month === "2026-09",
  )!;
  const view = await runtime.command(payrollActor, {
    action: "exclude",
    version: 1,
    unitId: u.id,
    reason: "outside_scope",
    evidenceId: g.evidence[0].id,
  });
  expect(september(view.framing.groups).delta.kind).toBe("unknown");
  expect(
    view.framing.groups.find((x) => x.month === "2026-10" && x.rubric === "SOC")
      ?.variation.kind,
  ).toBe("unknown");
  expect(september(view.framing.groups).ledger).toEqual(g.ledger);
  const restored = await runtime.command(payrollActor, {
    action: "restore",
    version: 2,
    unitId: u.id,
  });
  expect(september(restored.framing.groups).delta).toEqual(g.delta);
});
it("habilitation RH explicite, organisation/dossier et permissions de téléchargement", async () => {
  const runtime = await PayrollRuntime.create();
  expect(() => runtime.read({ ...payrollActor, hrGrants: [] })).toThrow(
    "HR_FORBIDDEN",
  );
  expect(() =>
    runtime.read({
      ...payrollActor,
      hrGrants: [
        {
          scope: { ...payrollScope, dossierId: "OTHER" },
          permissions: ["read"],
        },
      ],
    }),
  ).toThrow("HR_FORBIDDEN");
  expect(() =>
    runtime.diagnostic({
      ...payrollActor,
      hrGrants: [{ scope: payrollScope, permissions: ["read"] }],
    }),
  ).toThrow("HR_FORBIDDEN");
  const diagnostic = JSON.stringify(runtime.diagnostic(payrollActor));
  expect(diagnostic).not.toMatch(/SYN-A0|50\.00|48\.00/);
});
it("colonnes d’identité refusées, faux DSN natif refusé, sémantique de source distincte", async () => {
  const fixture = payrollFixture(),
    text = await fixture.files.ledger.text();
  await expect(
    previewPayroll(
      new File([text], "dsn.xml"),
      payrollScope,
      fixture.mapping("ledger"),
      payrollActor,
    ),
  ).rejects.toThrow("HR_FORMAT_UNSUPPORTED");
  await expect(
    previewPayroll(
      new File([text.replace("pseudonym", "name")], "source.csv"),
      payrollScope,
      fixture.mapping("ledger"),
      payrollActor,
    ),
  ).rejects.toThrow();
  const gl = await previewPayroll(
    new File([text], "DSN.csv"),
    payrollScope,
    fixture.mapping("ledger"),
    payrollActor,
  );
  const d = await previewPayroll(
    new File([text], "DSN.csv"),
    payrollScope,
    fixture.mapping("declaration"),
    payrollActor,
  );
  expect(gl.batch.id).not.toBe(d.batch.id);
  expect(gl.batch.document.fileName).toBe("source-synthetique.csv");
});
it("aperçu lié à l’acteur/hash/version et commandes concurrentes ne s’écrasent pas", async () => {
  const runtime = await PayrollRuntime.create(),
    fixture = payrollFixture();
  const preview = await runtime.preview(
    payrollActor,
    fixture.files.payments,
    fixture.mapping("payments"),
  );
  const command = {
    action: "approve_import" as const,
    version: preview.version,
    previewId: preview.previewId,
    previewHash: preview.previewHash,
  };
  await expect(
    runtime.command({ ...payrollActor, id: "SYN-OTHER" }, command),
  ).rejects.toThrow("HR_PREVIEW_STALE");
  await expect(
    runtime.command(payrollActor, { ...command, previewHash: "a".repeat(64) }),
  ).rejects.toThrow("HR_PREVIEW_STALE");
  const results = await Promise.allSettled([
    runtime.command(payrollActor, command),
    runtime.command(payrollActor, command),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(runtime.read(payrollActor).version).toBe(2);
});
it("paiement après revue reste inconnu et paiement annulé reste hors total", async () => {
  const runtime = await PayrollRuntime.create();
  const future = await replace(runtime, "payments", (text) =>
    text.replace("2026-09-10", "2027-02-02"),
  );
  expect(
    future.settlements.groups.find(
      (g) => g.month === "2026-08" && g.rubric === "SOC",
    )?.paid.kind,
  ).toBe("unknown");
  const cancelled = await replace(runtime, "payments", (text) =>
    text.replace("SYN-P2;posted", "SYN-P2;cancelled"),
  );
  expect(september(cancelled.settlements.groups).duplicates).toHaveLength(0);
  expect(september(cancelled.settlements.groups).cancelled).toHaveLength(1);
  expect(september(cancelled.settlements.groups).paid).toMatchObject({
    kind: "known",
    value: { amount: "50.00" },
  });
});
it("référence répétée dans un organisme ne bloque pas une référence identique dans un autre", async () => {
  const runtime = await PayrollRuntime.create();
  const view = await replace(runtime, "payments", (text) =>
    text.replace("SYN-PR1;", "SYN-P2;"),
  );
  expect(september(view.settlements.groups).duplicates).toHaveLength(2);
  const retirement = view.settlements.groups.find(
    (g) => g.month === "2026-09" && g.rubric === "RET",
  )!;
  expect(retirement.duplicates).toHaveLength(0);
  expect(retirement.paid).toMatchObject({
    kind: "known",
    value: { amount: "10.00" },
  });
});
it("période comptable commençant en milieu de mois bloque les agrégats mensuels", async () => {
  const period = { ...payrollPeriod, startDate: "2026-01-15" },
    scope = { ...payrollScope, periodId: periodId(period) };
  const actor = {
    ...payrollActor,
    grants: [
      {
        scope,
        permissions: ["read", "prepare", "download"] as (
          | "read"
          | "prepare"
          | "download"
        )[],
      },
    ],
  };
  const fixture = payrollFixture(),
    imports = new MemoryImportRepository();
  const source = await previewPayroll(
    fixture.files.journal,
    scope,
    fixture.mapping("journal"),
    actor,
  );
  const batch = await imports.approveAndSave(
    source.batch,
    fixture.files.journal,
    actor,
    source.batch.previewHash,
    "2027-02-01T10:00:00Z",
  );
  const result = buildPayrollFraming({
    scope,
    period,
    version: 1,
    sources: { journal: { ...source, batch } },
    reviews: [],
    exclusions: [],
  });
  expect(result.sourceComplete).toBe(false);
  expect(result.groups).toHaveLength(0);
});

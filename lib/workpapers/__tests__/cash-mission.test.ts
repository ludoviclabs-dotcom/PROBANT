import { describe, expect, it } from "vitest";
import { buildCashMission, cashSheetHref, CASH_MISSION_PROGRAM } from "../cash-mission";
import { assertCashPackage, buildCashMissionPackage } from "@/lib/evidence/cash-mission-package";
import type { WorkpaperRun } from "../model";
import { CASH_CSV, cashScope } from "./cash-reconciliation-fixtures";
import { createCashHarness } from "./cash-harness";

describe("CASH-906 Synthèse Trésorerie : programme, file de travail et compteurs", () => {
  it("le programme existe avant tout résultat ; les sources requises absentes sont listées", () => {
    const m = buildCashMission(cashScope, [], [], []);
    expect(m.program).toEqual(CASH_MISSION_PROGRAM);
    expect(m.counters).toMatchObject({ planned: 1, plannedParts: 3, executed: 0, exceptions: 0 });
    expect(m.queue.map(q => q.id)).toEqual(expect.arrayContaining(["procedure:pending", "source:expected:cash_ledger", "source:expected:cash_statement", "source:expected:cash_erb", "source:settlements"]));
    expect(m.program.outOfScope).toEqual(expect.arrayContaining(["Caisse : procédure distincte", "VMP : procédure distincte"]));
  });
  it("apurement partiel : chaque exception ouvre la feuille au bon compte, au bon suspens et à la bonne version", async () => {
    const h = createCashHarness(), { run } = await h.executed({ partial: true }), m = await h.mission();
    expect(m.counters).toMatchObject({ executed: 1, exceptions: 2, testedParts: 3 });
    const partial = m.queue.find(q => q.label === "Suspens partiellement apuré")!;
    expect(partial.href).toBe(cashSheetHref(cashScope, run, "exceptions", { accountId: "512100", itemId: "R1" }));
    expect(new URL("https://x" + partial.href).searchParams.get("version")).toBe(String(run.version));
    expect(m.procedure.controls.map(c => [c.id, c.outcome, c.coverage.numerator, c.coverage.denominator])).toEqual([["bridge", "no_exception_detected", 1, 1], ["sources", "no_exception_detected", 1, 1], ["clearance", "exceptions_detected", 2, 2]]);
    expect(m.procedure.resultLabel).toBe("Exceptions maintenues");
    expect(m.amountGrouping.reason).toMatch(/sans total d’exposition ni compensation entre comptes/);
  });
  it("aucun écart : libellé prudent, l’authenticité n’est pas démontrée", async () => {
    const h = createCashHarness(), { ids, run: frozen } = await h.frozenRun();
    const support = (await h.read()).body.facts[frozen.id].accounts[0].support[0];
    const run = await h.ok({ command: "configure", id: frozen.id, expectedVersion: frozen.version, draft: h.draft(ids, { corrections: [{ id: "C-P1", itemId: "P1", proof: { importId: support.importId, rowId: support.rowId }, reason: "Chèque annulé et contrepassé" }] }) });
    expect((await h.ok({ command: "execute", id: run.id, expectedVersion: run.version })).result!.outcome).toBe("no_exception_detected");
    const m = await h.mission();
    expect(m.procedure.resultLabel).toBe("Aucun écart sur le périmètre testé — authenticité non démontrée");
    expect(m.counters.exceptions).toBe(0);
  });
});

describe("CASH-907 export Trésorerie", () => {
  it("diagnostic déterministe ; paquet approuvé refusé avant verrouillage", async () => {
    const h = createCashHarness(), { run } = await h.executed(), m = await h.mission();
    const imports = h.db.state.imports[[cashScope.organizationId, cashScope.dossierId, cashScope.periodId].join("|")].map(i => ({ ...i.batch, approval: h.db.state.approvals[[cashScope.organizationId, cashScope.dossierId, cashScope.periodId].join("|")][i.batch.id], report: { ...i.batch.report, calculationAllowed: true } }));
    const stored = h.db.state.versions[[cashScope.organizationId, cashScope.dossierId, cashScope.periodId].join("|")][run.id].find(v => v.version === run.version) as WorkpaperRun;
    const a = await buildCashMissionPackage(m, stored, imports, "diagnostic", m.stateAsOf!), b = await buildCashMissionPackage(m, stored, [...imports].reverse(), "diagnostic", m.stateAsOf!);
    expect([a.html, a.csv.findings, a.csv.controls, a.csv.sources, a.manifestJson, a.canonicalJson]).toEqual([b.html, b.csv.findings, b.csv.controls, b.csv.sources, b.manifestJson, b.canonicalJson]);
    expect(a.html).toContain("Export diagnostic — ne constitue pas un paquet approuvé");
    expect(a.html).toContain("Écarts de source (distincts de l’écart du pont)");
    expect(a.csv.findings).toContain("SUSPENSE_OPEN");
    expect(a.manifest.limitations.map(l => l.message).join(" ")).toMatch(/aucune assurance d’authenticité/);
    expect(() => assertCashPackage(m, stored, "approved")).toThrow("EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED");
  });
  it("échappe le HTML hostile, conserve l’Unicode et neutralise les formules CSV", async () => {
    const hostile = CASH_CSV.cash_erb.replace("Chèque 1045 émis non débité", "<script>alert(1)</script> Чек №1045 — émis 🙂 " + "très long ".repeat(40)).replace("P1;-5.00", "=P1+1;-5.00");
    const h = createCashHarness(), { ids, run: frozen } = await h.frozenRun({ cash_erb: hostile });
    let run = await h.ok({ command: "configure", id: frozen.id, expectedVersion: frozen.version, draft: h.draft(ids) });
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    const m = await h.mission();
    const response = await h.handlers.exportPOST(new Request("https://probant.test/api/workpapers/cash/export", { method: "POST", headers: { "x-test-session": "preparer", "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: cashScope.dossierId, periodId: cashScope.periodId, id: run.id, version: run.version, kind: "diagnostic", format: "html", expectedSnapshotHash: m.hash }) }));
    const html = await response.text();
    expect(html).not.toContain("<script>alert(1)</script>"); expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;"); expect(html).toContain("Чек №1045 — émis 🙂");
    const sources = await (await h.handlers.exportPOST(new Request("https://probant.test/api/workpapers/cash/export", { method: "POST", headers: { "x-test-session": "preparer", "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: cashScope.dossierId, periodId: cashScope.periodId, id: run.id, version: run.version, kind: "diagnostic", format: "exceptions_csv", expectedSnapshotHash: m.hash }) }))).text();
    expect(sources).toContain("'=P1+1"); expect(sources).not.toMatch(/(^|,)=P1/m);
    const pdf = await h.handlers.exportPOST(new Request("https://probant.test/api/workpapers/cash/export", { method: "POST", headers: { "x-test-session": "preparer", "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: cashScope.dossierId, periodId: cashScope.periodId, id: run.id, version: run.version, kind: "diagnostic", format: "pdf", expectedSnapshotHash: m.hash }) }));
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf"); expect(new Uint8Array(await pdf.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });
});

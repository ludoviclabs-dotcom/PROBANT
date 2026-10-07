import { describe, expect, it } from "vitest";
import { buildClientMission, missionSheetHref } from "../client-mission";
import { contentHash, type WorkpaperRun } from "../model";
import { buildClientMissionPackage, clientMissionHtml } from "@/lib/evidence/client-mission-package";
import { verifyEvidenceExportPackage } from "@/lib/evidence/package";
import { clientMissionFixture } from "./client-mission-fixture";
import { PDFDocument } from "pdf-lib";
import { buildPdfFromAccessibleHtml } from "@/lib/evidence/pdf";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
describe("Synthèse Clients — programme et chaînes versionnées", () => {
  it("compte les procédures prévues avant toute anomalie ou exécution", async () => {
    const f = await clientMissionFixture(), m = buildClientMission(f.scope, [], [], []);
    expect(m.counters).toMatchObject({ planned: 1, executed: 0, plannedParts: 2, testedParts: 0, exceptions: 0 });
    expect(m.sources.filter(s => !s.available)).toHaveLength(3);
    expect(m.queue.map(q => q.category)).toContain("blocked");
    expect(m.sourceFamily).toBe("mission_procedures");
    expect(() => buildClientMission({ ...f.scope, mode: "demo" }, [], [], [])).toThrow("MISSION_REAL_SCOPE_REQUIRED");
  });
  it("conserve les exceptions après revue et lie chaque preuve à sa source et chaque lien à la version exacte", async () => {
    const f = await clientMissionFixture(), m = buildClientMission(f.scope, [f.run, f.approved, f.locked], f.imports, f.heads);
    expect(m.counters).toMatchObject({ planned: 1, executed: 1, testedParts: 2, exceptions: 2, reviewed: 1, locked: 1 });
    expect(m.procedure.resultLabel).toBe("Exceptions maintenues");
    expect(m.procedure.beforeReview?.version).toBe(10); expect(m.procedure.afterReview?.version).toBe(12);
    expect(m.procedure.beforeReview?.contentHash).toBe(m.procedure.afterReview?.contentHash);
    expect(m.procedure.review?.actorId).toBe("actual-reviewer");
    const residues = m.procedure.comparisons[1].rows;
    expect(residues.map(r => r.difference)).toEqual([{ kind: "known", value: { amount: "10.00", currency: "EUR" } }, { kind: "known", value: { amount: "-10.00", currency: "EUR" } }]);
    expect(residues.every(r => r.proofs.every(p => m.sources.some(s => s.id === p.documentVersionId && s.locators.some(l => l.rowId === p.rowId))))).toBe(true);
    expect(m.amountGrouping.groups).toEqual([]);
    const link = new URL(m.queue.find(q => q.category === "exceptions")!.href, "https://test.local");
    expect(Object.fromEntries(link.searchParams)).toMatchObject({ id: f.locked.id, version: "12", filter: "exceptions", dossierId: f.scope.dossierId, periodId: f.scope.periodId });
  });
  it("expose numérateur, dénominateur et exclusions dans un périmètre partiel", async () => {
    const f = await clientMissionFixture(), partial = structuredClone(f.run);
    partial.selection!.selectedIds = [partial.population!.items[0].id];
    partial.selection!.exclusions = [{ id: partial.population!.items[1].id, reason: "Exclusion explicitement déclarée" }];
    const result = partial.result!.result as { auxiliaryToAged: { rows: { difference: unknown }[] } };
    result.auxiliaryToAged.rows[1].difference = { kind: "unknown", reason: "Source non comparable" };
    const m = buildClientMission(f.scope, [partial], f.imports, f.heads);
    expect(m.procedure.coverage).toMatchObject({ numerator: 1, denominator: 5, exclusions: partial.selection!.exclusions });
    expect(m.procedure.comparisons[1].coverage).toMatchObject({ numerator: 1, denominator: 2 });
    expect(m.counters).toMatchObject({ planned: 1, plannedParts: 2, testedParts: 1 });
  });
  it("montre les travaux périmés et conserve l’ancienne décision lors d’une révision", async () => {
    const f = await clientMissionFixture(), revision: WorkpaperRun = { ...f.run, id: "real-pilot:r2", revision: 2, version: 1, state: "draft", result: undefined, population: undefined, selection: undefined, importIds: [], notes: [], submittedHash: undefined };
    const versions = [f.run, f.approved, f.locked, revision];
    const m = buildClientMission(f.scope, versions, f.imports, [{ ...f.heads[0], import_id: "replacement" }, ...f.heads.slice(1)], { id: f.locked.id, version: 12 });
    expect(m.procedure.stale).toBe(true); expect(m.counters.reviewed).toBe(0);
    expect(m.procedure.review).toEqual(expect.objectContaining({ actorId: "actual-reviewer", approvedVersion: 10 }));
    expect(m.sources[0].current).toBe(false);
    expect(m.versionIndex.find(v => v.version === 12)?.approval?.note).toContain("exceptions maintenues");
    expect(() => buildClientMission(f.scope, versions, f.imports, f.heads, { id: f.locked.id, version: 999 })).toThrow("WORKPAPER_VERSION_NOT_FOUND");
    expect(missionSheetHref(f.scope, f.locked, "blocked", "é/longue note")).toContain("noteId=%C3%A9%2Flongue+note");
  });
  it("impose une affectation explicite si plusieurs feuilles couvrent la même procédure", async () => {
    const f = await clientMissionFixture(), second: WorkpaperRun = { ...f.run, id: "second", rootId: "second" };
    const m = buildClientMission(f.scope, [f.run, second], f.imports, f.heads);
    expect(m.procedure.runId).toBeNull(); expect(m.counters.planned).toBe(1); expect(m.counters.executed).toBe(0);
    expect(buildClientMission(f.scope, [f.run, second], f.imports, f.heads, { id: "second", version: 10 }).procedure.runId).toBe("second");
  });
});
describe("Export Clients — état écran, distinction et pagination", () => {
  it("réutilise le manifeste d’intégrité et exporte exactement l’état de la Synthèse", async () => {
    const f = await clientMissionFixture(), m = buildClientMission(f.scope, [f.run, f.approved, f.locked], f.imports, f.heads);
    const pack = await buildClientMissionPackage(m, f.locked, f.imports, "approved", "2025-02-03T00:00:00Z"), report = JSON.parse(pack.canonicalJson);
    expect(verifyEvidenceExportPackage(pack)).toEqual([]); expect(report.mission).toEqual(m);
    expect(report.run.version).toBe(12); expect(report.binaryFilesIncluded).toBe(false);
    expect(pack.html).toContain("Paquet du cadrage approuvé et verrouillé"); expect(pack.html).toContain("Exceptions maintenues");
    expect(pack.html).toContain("binaire absent du paquet"); expect(pack.html).toContain(m.hash);
    expect((await PDFDocument.load(pack.pdf)).getPageCount()).toBeGreaterThan(1);
  });
  it("distingue le diagnostic d’un paquet approuvé, refuse les états périmés et les empreintes incohérentes", async () => {
    const f = await clientMissionFixture(), m = buildClientMission(f.scope, [f.run], f.imports, f.heads);
    const pack = await buildClientMissionPackage(m, f.run, f.imports, "diagnostic", "2025-02-03T00:00:00Z");
    expect(pack.html).toContain("Export diagnostic");
    await expect(buildClientMissionPackage(m, f.run, f.imports, "approved", "2025-02-03T00:00:00Z")).rejects.toThrow("EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED");
    const stale = buildClientMission(f.scope, [f.locked], f.imports, f.heads.slice(1));
    await expect(buildClientMissionPackage(stale, f.locked, f.imports, "approved", "2025-02-03T00:00:00Z")).rejects.toThrow("EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED");
    expect(clientMissionHtml(stale, f.locked, "diagnostic", "2025-02-03T00:00:00Z")).toContain("Source remplacée / périmée");
    await expect(buildClientMissionPackage({ ...m, hash: "a".repeat(64) }, f.run, f.imports, "diagnostic", "2025-02-03T00:00:00Z")).rejects.toThrow("EXPORT_SNAPSHOT_HASH_INVALID");
  });
  it("échappe les textes longs et conserve Unicode dans HTML et JSON", async () => {
    const f = await clientMissionFixture(); f.run.conclusion = '<script>alert("x")</script> 客户 ' + "TrèsLongueJustification".repeat(1000);
    f.run.submittedHash = contentHash(f.run);
    const m = buildClientMission(f.scope, [f.run], f.imports, f.heads), html = clientMissionHtml(m, f.run, "diagnostic", "2025-02-03T00:00:00Z");
    expect(html).not.toContain('<script>alert'); expect(html).toContain("&lt;script&gt;"); expect(html).toContain("客户");
    expect(html).toContain("thead{display:table-header-group}"); expect(html).toContain("overflow-wrap:anywhere");
  });
  it("paginate un paragraphe géant et une table multipage sans dessiner sous la marge", async () => {
    const html = '<h1>Rapport</h1><p>' + "X".repeat(18000) + '</p><table><thead><tr><th>Clé</th><th>Décision</th></tr></thead><tbody>' + Array.from({ length: 250 }, (_, i) => '<tr><td>clé-' + i + '</td><td>Exception maintenue</td></tr>').join("") + '</tbody></table><p>FIN-RAPPORT-UNIQUE</p>';
    const pdf = await buildPdfFromAccessibleHtml(html, { title: "Table longue", createdAt: "2025-02-03T00:00:00Z" });
    const doc = await getDocument({ data: pdf, useSystemFonts: true, isEvalSupported: false }).promise;
    expect(doc.numPages).toBeGreaterThan(6);
    let text = "";
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      for (const item of content.items) if ("str" in item) { text += item.str; if (item.str.trim() && !item.str.startsWith("PROBANT - PDF standard")) expect(item.transform[5]).toBeGreaterThanOrEqual(54); }
    }
    expect(text).toContain("clé-249"); expect(text).toContain("FIN-RAPPORT-UNIQUE");
    await doc.destroy();
  }, 20000);
});

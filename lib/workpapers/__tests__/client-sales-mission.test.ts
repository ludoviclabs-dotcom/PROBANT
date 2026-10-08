import { describe, expect, it } from "vitest";
import { buildClientMission } from "../client-mission";
import { contentHash, type WorkpaperRun } from "../model";
import { clientSalesMissionFixture } from "./client-sales-mission-fixture";
import { buildClientMissionPackage } from "@/lib/evidence/client-mission-package";
import { verifyEvidenceExportPackage } from "@/lib/evidence/package";
import { PDFDocument } from "pdf-lib";

describe("Programme Clients fermé — ventes, preuves et décisions", () => {
  it("conserve le cadrage par défaut et sélectionne explicitement la chaîne ventes avec trois contrôles fixes", async () => {
    const f = await clientSalesMissionFixture();
    expect(buildClientMission(f.scope, f.versions, f.imports, f.heads).procedure.id).toBe("clients.frame");
    const m = buildClientMission(f.scope, f.versions, f.imports, f.heads, { id: f.locked.id, version: 12 });
    expect(m.procedure.id).toBe("clients.sales");
    expect(m.counters).toMatchObject({ planned: 2, plannedParts: 5, executed: 2, testedParts: 3, reviewed: 2, locked: 2 });
    expect(m.procedures.map(p => [p.id, p.version])).toEqual([["clients.frame", 12], ["clients.sales", 12]]);
    expect(m.procedure.comparisons.map(c => c.id)).toEqual(["cashCredit", "impairment", "confirmations"]);
    expect(m.procedure.comparisons[1].coverage).toMatchObject({ numerator: 0, denominator: 1, exclusions: [] });
    expect(m.procedure.sales?.rows[0]).toMatchObject({ dueAtClosing: { amount: "1000.00" }, subsequentPayments: { amount: "300.00" }, dueAtReview: { amount: "700.00" }, dueOn: null, overdueDays: null, aging: { basis: "invoice" } });
    expect(m.procedure.sales?.exceptions).toEqual(f.data.exceptions);
    expect(m.procedure.sales?.exceptions.map(e => e.code)).toContain("ESTIMATE_METHOD_OR_BASE_MISSING");
    expect(m.procedure.sales?.exceptions.map(e => e.code)).toContain("CONFIRMATION_ORIGIN_UNCERTAIN");
    expect(m.procedure.beforeReview?.contentHash).toBe(m.procedure.afterReview?.contentHash);
    expect(m.procedure.review?.actorId).toBe("actual-reviewer");
    expect(m.procedure.resultLabel).toBe("Exceptions maintenues");
    expect(m.amountGrouping.groups).toEqual([]);
    for (const exception of f.data.exceptions) {
      const q = m.queue.find(q => q.id.endsWith(exception.id))!;
      expect(new URL(q.href, "https://test.local").searchParams.get("version")).toBe("12");
      expect(q.proofIds).toEqual(exception.proofIds);
    }
  });

  it("sélectionne le dernier snapshot de l’identité demandée sans version et conserve une version explicite exacte", async () => {
    const f = await clientSalesMissionFixture();
    for (const versions of [f.versions, [...f.versions].reverse()]) {
      const latest = buildClientMission(f.scope, versions, f.imports, f.heads, { id: f.locked.id });
      expect(latest.procedure.version).toBe(12); expect(latest.procedure.state).toBe("locked"); expect(latest.procedure.sales?.rows[0].dueAtReview.amount).toBe("700.00");
      expect(latest.procedure.stale).toBe(false);
      const exact = buildClientMission(f.scope, versions, f.imports, f.heads, { id: f.run.id, version: 10 });
      expect(exact.procedure.version).toBe(10); expect(exact.procedure.state).toBe("awaiting_review"); expect(exact.procedure.stale).toBe(true);
      expect(exact.procedure.review).toBeNull();
    }
  });

  it("garde le contexte de cadrage après révision Clients sans reprendre l’ancienne décision ni une référence future", async () => {
    const f = await clientSalesMissionFixture();
    const revision: WorkpaperRun = { ...f.run, id: f.run.rootId + ":r2", revision: 2, version: 1, state: "draft", clientsWork: undefined, result: undefined, importIds: [], population: undefined, selection: undefined, evidence: [], findings: [], notes: [], conclusion: undefined, submittedHash: undefined, approval: undefined, events: [{ id: "sales-revision", action: "revise", actorId: "actual-preparer", at: "2025-02-05T00:00:00Z", version: 1 }] };
    const versions = [...f.versions, revision];
    const defaultSelection = buildClientMission(f.scope, versions, f.imports, f.heads);
    expect(defaultSelection.procedure.runId).toBe(f.frame.locked.id);
    const latestSales = defaultSelection.procedures.find(p => p.id === "clients.sales")!;
    expect(latestSales.runId).toBe(revision.id); expect(latestSales.state).toBe("draft"); expect(latestSales.review).toBeNull();
    expect(defaultSelection.counters).toMatchObject({ executed: 1, reviewed: 1, locked: 1 });
    const explicit = buildClientMission(f.scope, versions, f.imports, f.heads, { id: revision.id });
    expect(explicit.procedures[0].runId).toBe(f.frame.locked.id); expect(explicit.procedures[0].version).toBe(12);
    expect(explicit.procedure.resultId).toBeNull(); expect(explicit.procedure.beforeReview).toBeNull(); expect(explicit.procedure.afterReview).toBeNull();
    expect(explicit.procedure.staleReasons).not.toContain("La référence au cadrage figé est absente ou incohérente.");
    const noEarlierReference: WorkpaperRun = { ...revision, id: f.run.id, revision: 1, version: 1 };
    const historical = buildClientMission(f.scope, [f.frame.locked, noEarlierReference, f.run], f.imports, f.heads, { id: f.run.id, version: 1 });
    expect(historical.procedures[0].runId).toBeNull();
    expect(historical.procedure.staleReasons).toContain("La référence au cadrage figé est absente ou incohérente.");
  });

  it("rend visible la source remplacée et la nouvelle version du cadrage sans réécrire l’ancienne décision", async () => {
    const f = await clientSalesMissionFixture(), replacement = f.heads.map(h => h.document_type === "clients_payments" ? { ...h, import_id: "replacement" } : h);
    const stale = buildClientMission(f.scope, f.versions, f.imports, replacement, { rootId: f.locked.rootId });
    expect(stale.procedure.staleReasons).toContain("Une source Clients et ventes approuvée a été remplacée.");
    expect(stale.procedure.review?.note).toBe(f.locked.approval?.note);
    expect(stale.procedure.sales?.rows[0].dueAtReview.amount).toBe("700.00");
    await expect(buildClientMissionPackage(stale, f.locked, f.imports, "approved", "2025-02-05T00:00:00Z")).rejects.toThrow("EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED");
    const revisedFrame: WorkpaperRun = { ...f.frame.run, id: f.frame.run.rootId + ":r2", revision: 2, version: 1, state: "draft", result: undefined, submittedHash: undefined, importIds: [], population: undefined, selection: undefined, notes: [] };
    const revised = buildClientMission(f.scope, [...f.versions, revisedFrame], f.imports, f.heads, { id: f.locked.id, version: 12 });
    expect(revised.procedure.staleReasons.some(r => r.includes("Le cadrage lié a une nouvelle version"))).toBe(true);
    expect(revised.procedures[0].version).toBe(12);
    expect(revised.procedure.sales?.framing.contentHash).toBe(contentHash(f.frame.locked));
    expect(revised.procedure.review?.actorId).toBe("actual-reviewer");
  });

  it("rejette les résultats mal formés ou synthétiques au lieu d’afficher un résultat exploitable", async () => {
    const f = await clientSalesMissionFixture(), run = structuredClone(f.run);
    (run.result!.result as { mode: string }).mode = "demo";
    const m = buildClientMission(f.scope, [f.frame.locked, run], f.imports, f.heads, { id: run.id });
    expect(m.procedure.sales).toBeNull();
    expect(m.procedure.resultLabel).toContain("contrat invalide");
    expect(m.queue.some(q => q.label === "Contrat de résultat Clients invalide")).toBe(true);
    expect(m.counters.executed).toBe(1);
    const cross = { ...run, scope: { ...run.scope, organizationId: "other-org" } };
    expect(() => buildClientMission(f.scope, [cross], f.imports, f.heads)).toThrow();
  });

  it("exporte les faits 1000/300/700, toutes les exceptions et chaque pièce avec la portée de décision explicite", async () => {
    const f = await clientSalesMissionFixture(), m = buildClientMission(f.scope, f.versions, f.imports, f.heads, { id: f.locked.id, version: 12 });
    const pack = await buildClientMissionPackage(m, f.locked, f.imports, "approved", "2025-02-05T00:00:00Z");
    expect(verifyEvidenceExportPackage(pack)).toEqual([]);
    expect(JSON.parse(pack.canonicalJson).mission).toEqual(m);
    expect(pack.html).toContain("Paquet Clients et ventes approuvé et verrouillé");
    expect(pack.html).toContain("portée : procédure sélectionnée uniquement");
    expect(pack.html).toContain("contexte, aucune approbation du paquet implicite");
    expect(pack.html).toContain("1000.00 EUR"); expect(pack.html).toContain("300.00 EUR"); expect(pack.html).toContain("700.00 EUR");
    expect(pack.html).toContain("Méthode absente — estimation non conclue");
    expect(pack.html).toContain("établie unknown"); expect(pack.html).toContain("actual-preparer");
    expect(pack.html).toContain("original binaire absent du paquet");
    for (const exception of f.data.exceptions) {
      expect(pack.html).toContain(exception.id);
      expect(pack.csv.findings).toContain(exception.id);
    }
    for (const proof of f.run.evidence) {
      expect(pack.html).toContain(proof.id);
      expect(pack.html).toContain(proof.documentVersionId);
    }
    expect(pack.csv.controls.split("\r\n").filter(Boolean)).toHaveLength(6);
    expect(pack.csv.controls).toContain("impairment");
    expect(pack.csv.reviewEvents).toContain("context_only");
    expect((await PDFDocument.load(pack.pdf)).getPageCount()).toBeGreaterThan(2);
    const diagnostic = await buildClientMissionPackage(m, f.locked, f.imports, "diagnostic", "2025-02-05T00:00:00Z");
    expect(diagnostic.html).toContain("Export diagnostic");
    expect(diagnostic.manifest.snapshotSha256).toBe(pack.manifest.snapshotSha256);
    const contextual = await buildClientMissionPackage(buildClientMission(f.scope, f.versions, f.imports, f.heads), f.frame.locked, f.imports, "approved", "2025-02-05T00:00:00Z");
    expect(contextual.html).toContain("Factures ouvertes à la clôture");
    expect(contextual.csv.findings).toContain(f.data.exceptions[0].id);
  }, 20000);

  it("relie l’avoir au document exact et conserve une exception de mauvais tiers sans réduire les soldes", async () => {
    const f = await clientSalesMissionFixture({ creditCustomer: "OTHER-CUSTOMER" }), m = buildClientMission(f.scope, f.versions, f.imports, f.heads, { id: f.locked.id, version: 12 });
    expect(m.procedure.sales?.credits[0].status).toBe("unmatched");
    expect(m.procedure.sales?.rows[0].dueAtClosing.amount).toBe("1000.00"); expect(m.procedure.sales?.rows[0].dueAtReview.amount).toBe("700.00");
    const creditException = m.procedure.sales!.exceptions.find(e => e.code === "CREDIT_PARTY_MISMATCH")!;
    expect(creditException.proofIds).toEqual([m.procedure.sales!.credits[0].evidence[0].id]);
    const pack = await buildClientMissionPackage(m, f.locked, f.imports, "approved", "2025-02-05T00:00:00Z");
    expect(pack.html).toContain("À rattacher — aucun effet sur les soldes");
    expect(pack.html).toContain(m.procedure.sales!.credits[0].evidence[0].documentVersionId);
    expect(pack.csv.findings).toContain(creditException.id);
    const matching = await clientSalesMissionFixture({ creditCustomer: "C1" });
    expect(matching.data.rows[0].dueAtClosing.amount).toBe("1000.00"); expect(matching.data.rows[0].dueAtReview.amount).toBe("600.00");
  });

  it("garde les longs jugements Unicode et caractères CSV sans exécution de formule", async () => {
    const f = await clientSalesMissionFixture(), run = structuredClone(f.run);
    run.notes = [{ id: "long-note", kind: "judgment", text: "=2+2 客户 <script>" + "Justification".repeat(800), authorId: "actual-preparer", amount: { kind: "unknown", reason: "Jugement" }, blocking: false }];
    (run.result!.result as typeof f.data).exceptions[0].message = "=2+2 客户 <script>";
    run.conclusion = "客户 <script>" + "Éléments".repeat(500); run.submittedHash = contentHash(run);
    const m = buildClientMission(f.scope, [f.frame.locked, run], f.imports, f.heads, { id: run.id });
    const pack = await buildClientMissionPackage(m, run, f.imports, "diagnostic", "2025-02-05T00:00:00Z");
    expect(pack.html).toContain("客户"); expect(pack.html).toContain("&lt;script&gt;"); expect(pack.html).not.toContain("<script>");
    expect(pack.canonicalJson).toContain("客户");
    expect(pack.csv.findings).toContain("'=2+2 客户 <script>");
    expect(pack.html).toContain("thead{display:table-header-group}");
  }, 20000);
});

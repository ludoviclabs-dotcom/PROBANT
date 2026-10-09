import { beforeEach, describe, expect, it } from "vitest";
import { equityFailureStatus, requireDisposableEquity } from "../capitaux-http";
import type { EquityResult } from "../capitaux-review";
import type { WorkpaperRun } from "../model";
import { EQ_CSV, EQ_MINUTES, eqDraft, eqPeriod, eqScope, minutesPdf } from "./capitaux-fixtures";
import { EQ_DOSSIER, createEquityHarness, type EquityHarness } from "./capitaux-harness";

let h: EquityHarness;
beforeEach(() => { h = createEquityHarness(); });
const exportRequest = (session: string, body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/capitaux-propres/export", { method: "POST", headers: { "x-test-session": session, "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: EQ_DOSSIER, periodId: eqScope.periodId, ...body }) });
const resultOf = (run: WorkpaperRun) => run.result!.result as EquityResult;
const pvDocument = async (pieceRef: string) => ((await h.read()).body.imports as { document: { id: string; logicalId: string } }[]).find(b => b.document.logicalId === "eq_minutes:" + pieceRef)!.document.id;

describe("EQ-1104 chaîne serveur : sources → population figée → lectures → exécution → décisions citées → revue → verrouillage", () => {
  it("parcours complet : population décisions et mouvements, lecture du PV, écart 30 / 25 traité en citant la pièce et la version", async () => {
    const { run: frozen } = await h.frozenRun();
    expect(frozen).toMatchObject({ state: "ready", population: { unit: "decision_movement" } });
    expect(frozen.population!.items).toHaveLength(23);
    expect(frozen.selection!.exclusions).toEqual([{ id: "M:E13", reason: expect.stringContaining("Autres fonds propres") }]);
    expect(frozen.capitauxWork).toMatchObject({ convention: { version: "eq-sign-1", validatedBy: "preparer-eq" }, readings: [] });
    // Readings validated after the freeze: piece, version and page come from the server.
    let run = await h.ok({ command: "configure", id: frozen.id, expectedVersion: frozen.version, draft: eqDraft() });
    const reading = run.capitauxWork!.readings.find(r => r.lineId === "D1-DIV")!;
    expect(reading).toMatchObject({ pieceRef: "PV-AGO-2024", page: 3, documentVersionId: await pvDocument("PV-AGO-2024"), authorId: "preparer-eq" });
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    expect(run.result!.outcome).toBe("exceptions_detected");
    expect(resultOf(run).decisions!.find(d => d.lineId === "D1-DIV")).toMatchObject({ difference: { kind: "known", value: { amount: "5.00" } }, payment: { kind: "known", value: { amount: "25.00" } } });
    const divergent = run.notes.find(n => n.text.startsWith("Montant divergent"))!;
    expect(divergent).toMatchObject({ blocking: true, kind: "observation", amount: { kind: "known", value: { amount: "5.00" } } });
    // A human decision without a citation, or citing a piece outside the frozen sources, is refused.
    expect((await h.command({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: divergent.id, text: "x" })).status).toBe(400);
    expect(await h.command({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: divergent.id, text: "x", citation: { documentId: "source-inconnue" } })).toMatchObject({ status: 422, body: { error: "EQ_CITATION_SOURCE_REQUIRED" } });
    const pv = await pvDocument("PV-AGO-2024");
    expect(await h.command({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: divergent.id, text: "x", citation: { documentId: pv, page: 9 } })).toMatchObject({ status: 422, body: { error: "EQ_CITATION_PAGE_INVALID" } });
    expect(await h.command({ command: "note", id: run.id, expectedVersion: run.version, note: { id: "j-1", kind: "judgment", text: "Jugement", amount: { kind: "unknown", reason: "x" }, blocking: false } })).toMatchObject({ status: 422, body: { error: "EQ_CITATION_REQUIRED" } });
    run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: divergent.id, text: "Distribution de 30 votée (résolution 3) ; 25 comptabilisés et payés ; 5 restant à comptabiliser en dettes envers les associés — écriture proposée.", citation: { documentId: pv, page: 3 } });
    expect(run.notes.find(n => n.id === divergent.id)!.resolution).toMatchObject({ authorId: "preparer-eq", citation: { documentVersionId: pv, pieceRef: "PV-AGO-2024", page: 3, fileName: "PV-AGO-2024.pdf", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    const entries = ((await h.read()).body.imports as { document: { id: string; documentType: string } }[]).find(b => b.document.documentType === "eq_entries")!.document.id;
    for (const n of run.notes.filter(x => x.blocking && !x.resolution)) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Point documenté auprès du client ; aucune conclusion juridique.", citation: { documentId: entries } });
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Décisions rapprochées des écritures ; divergence 30 / 25 et décision sans écriture documentées ; aucune conclusion juridique." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Auto-approbation" })).status).toBe(403);
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue des décisions, des PV lus et des écritures : traitements cités." }, "reviewer");
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    const mission = await h.mission("reviewer");
    expect(mission.counters).toMatchObject({ planned: 1, plannedParts: 5, executed: 1, reviewed: 1, locked: 1, stale: 0, exceptions: 7, uncertainties: 2 });
    expect(mission.procedure.resultLabel).toBe("Exceptions maintenues");
    expect(mission.procedure.legal.conclusion).toBe("Aucune conclusion juridique");
    const exported = await h.handlers.exportPOST(exportRequest("reviewer", { id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: mission.hash }));
    expect(exported.status).toBe(200);
    const html = await exported.text();
    for (const text of ["Paquet Capitaux propres approuvé et verrouillé", "aucune conclusion juridique", "Aucune règle juridique n’est implémentée", "Pièce citée : PV-AGO-2024 · PV-AGO-2024.pdf · version " + pv + " · page 3", "5.00 EUR", "T1"]) expect(html).toContain(text);
    const csv = await (await h.handlers.exportPOST(exportRequest("reviewer", { id: run.id, version: run.version, kind: "approved", format: "exceptions_csv", expectedSnapshotHash: mission.hash }))).text();
    for (const code of ["AMOUNT_DIVERGENT", "DECISION_WITHOUT_ENTRY", "ENTRY_WITHOUT_DECISION", "EFFECT_OUTSIDE_PERIOD", "PV_MISSING", "STATEMENT_DIFFERENCE"]) expect(csv).toContain(code);
  }, 90_000);
  it("source manquante bloquante : sans écritures, le gel est refusé ; sources affichées obsolètes refusées", async () => {
    const ids = await h.importAll({}, ["eq_balances", "eq_decisions"], []);
    const run = await h.ok({ command: "create", period: eqPeriod });
    expect(await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), draft: { readings: [] } })).toMatchObject({ status: 422, body: { error: "EQ_SOURCES_REQUIRED" } });
    expect((await h.read()).body.facts[run.id]).toBeNull();
    const entries = await h.importSource("eq_entries");
    expect(await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), draft: { readings: [] } })).toMatchObject({ status: 422, body: { error: "EQ_CURRENT_SOURCES_REQUIRED" } });
    expect((await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: [...Object.values(ids), entries.id], draft: { readings: [] } })).state).toBe("ready");
  });
  it("refuse les sources invalides avec code et localisateur, PDF illisible compris", async () => {
    expect(await h.preview("eq_entries", EQ_CSV.eq_entries.replace("E03;68.00", "E03;67.00"))).toMatchObject({ status: 422, body: { error: "EQ_TRANSFER_UNBALANCED", locator: { row: 2, value: "T1" } } });
    expect(await h.preview("eq_decisions", EQ_CSV.eq_decisions.replace("D1-DIV;-30.00;2024-05-30;AGO-2024;distribution", "D1-DIV;-30.00;2024-05-30;AGO-2024;dividende"))).toMatchObject({ status: 422, body: { error: "EQ_DECISION_TYPE_INVALID", locator: { row: 5, column: "type", value: "dividende" } } });
    expect(await h.previewPv(EQ_MINUTES[0], new TextEncoder().encode("%PDF-1.7 tronqué"))).toMatchObject({ status: 422, body: { error: "EQ_PDF_INVALID" } });
    const form = new FormData();
    form.set("file", new File([new Uint8Array(await minutesPdf("PV", [["p1"]]))], "pv.pdf", { type: "application/pdf" })); form.set("mapping", "{}"); form.set("period", JSON.stringify(eqPeriod)); form.set("documentType", "eq_minutes");
    expect(await h.json(await h.handlers.importsPOST(h.request("preparer", "POST", form)))).toMatchObject({ status: 422, body: { error: "EQ_IMPORT_FIELDS_INVALID" } });
  });
  it("aucune autorité du navigateur : auteur de lecture, page ou rôle transmis sont refusés", async () => {
    const { run } = await h.frozenRun();
    expect((await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: { readings: [{ lineId: "D1-DIV", text: "x", page: 1 }] } })).status).toBe(400);
    expect((await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: { readings: [{ lineId: "D1-DIV", text: "x", authorId: "forged" }] } })).status).toBe(400);
    expect(await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: eqDraft(["D3-CAP"]) })).toMatchObject({ status: 422, body: { error: "EQ_READING_PV_REQUIRED" } });
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: "a".repeat(64), text: "x", role: "reviewer" })).status).toBe(400);
  });
  it("lecture modifiée : résultat retiré, nouvelle exécution exigée", async () => {
    const { run: executed } = await h.executed();
    const run = await h.ok({ command: "configure", id: executed.id, expectedVersion: executed.version, draft: eqDraft(["D1-AFF-RES"]) });
    expect(run).toMatchObject({ state: "ready", notes: [] }); expect(run.result).toBeUndefined();
  });
  it("PV ajouté après le gel : travail périmé, commande refusée, révision requise ; l’ancienne version reste consultable", async () => {
    const { run: frozen } = await h.frozenRun({}, { readings: [] }, undefined, EQ_MINUTES.slice(0, 2));
    const run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
    expect(resultOf(run).decisions!.find(d => d.lineId === "D5-DIV")!.pv.status).toBe("missing");
    await h.importPv(EQ_MINUTES[2]);
    expect(await h.command({ command: "conclude", id: run.id, expectedVersion: run.version, text: "x" })).toMatchObject({ status: 409, body: { error: "EQ_SOURCE_REPLACED_REVISION_REQUIRED" } });
    expect((await h.read()).body.sourcesCurrent[run.id]).toBe(false);
    const mission = await h.mission();
    expect(mission.procedure.stale).toBe(true); expect(mission.procedure.staleReasons.join(" ")).toMatch(/y compris un PV\) a été remplacée ou ajoutée depuis le gel/);
    const revised = await h.ok({ command: "revise", id: run.id, expectedVersion: run.version });
    expect(revised).toMatchObject({ revision: 2, state: "draft", importIds: [] }); expect(revised.capitauxWork).toBeUndefined();
    const history = (await h.read("preparer", "&operation=history&id=" + encodeURIComponent(run.id))).body.history as WorkpaperRun[];
    expect(history.at(-1)!.result).toBeTruthy();
  });
  it("original du PV téléchargeable avec la permission, identique octet pour octet", async () => {
    await h.importAll({}, ["eq_balances", "eq_entries"], [EQ_MINUTES[1]]);
    const id = await pvDocument("PV-AGE-2024-09");
    const response = await h.handlers.GET(h.request("reviewer", "GET", undefined, EQ_DOSSIER, "&operation=download&id=" + id));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(Buffer.from(await minutesPdf(EQ_MINUTES[1].title, EQ_MINUTES[1].pages)))).toBe(true);
    expect((await h.json(await h.handlers.GET(h.request("outsider", "GET", undefined, EQ_DOSSIER, "&operation=download&id=" + id)))).status).toBe(403);
  });
  it("idempotence, conflit de version, session expirée, accès transversal et reprise par un nouveau runtime", async () => {
    const created = await h.command({ command: "create", period: eqPeriod }, "preparer", "same-key-eq-0001");
    expect(await h.command({ command: "create", period: eqPeriod }, "preparer", "same-key-eq-0001")).toEqual(created);
    const run = created.body.run as WorkpaperRun;
    await h.ok({ command: "conclude", id: run.id, expectedVersion: 1, text: "Première conclusion" });
    expect(await h.command({ command: "conclude", id: run.id, expectedVersion: 1, text: "Concurrente" })).toMatchObject({ status: 409, body: { error: "STALE_WORKPAPER_VERSION", current: { version: 2 } } });
    expect((await h.command({ command: "conclude", id: run.id, expectedVersion: 2, text: "x" }, "expired")).status).toBe(401);
    expect((await h.json(await h.handlers.GET(h.request("outsider")))).status).toBe(403);
    expect((await h.command({ command: "conclude", id: run.id, expectedVersion: 2, text: "x" }, "reviewer")).status).toBe(403);
    h.restart();
    expect((await h.read()).body.runs[0]).toMatchObject({ id: run.id, version: 2 });
  });
});
describe("EQ-1107 bornes de stockage", () => {
  it("une exécution aux nombreuses exceptions ajoute ses notes en une seule version", async () => {
    const { run: frozen } = await h.frozenRun();
    const run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
    expect(run.notes.length).toBeGreaterThan(10);
    expect(run.version).toBe(frozen.version + 2);
    expect(run.events.at(-1)!.action).toBe("notes");
  });
  it("le budget global des sources est vérifié avant de conserver un aperçu", async () => {
    await h.importSource("eq_balances");
    const key = [eqScope.organizationId, EQ_DOSSIER, eqScope.periodId].join("|");
    const existing = h.db.state.imports[key][0];
    h.db.state.imports[key].push({ type: "eq_balances", batch: { ...existing.batch, id: "import-filler" }, original: "x".repeat(48 * 1024 * 1024) });
    expect(await h.preview("eq_entries")).toMatchObject({ status: 413, body: { error: "EQ_STATE_LIMIT" } });
    expect(h.db.state.imports[key].some(i => i.batch.document.documentType === "eq_entries")).toBe(false);
  });
});
describe("EQ-1105 activation et codes d’erreur", () => {
  it("reste fermé hors recette jetable et en production", () => {
    expect(() => requireDisposableEquity({})).toThrow(); expect(() => requireDisposableEquity({ PROBANT_CAPITAUX_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireDisposableEquity({ PROBANT_CAPITAUX_DURABLE: "disposable", VERCEL_ENV: "preview" })).not.toThrow();
    expect(() => requireDisposableEquity({ PROBANT_FIXED_ASSETS_DURABLE: "disposable" })).toThrow();
  });
  it("traduit les refus métier en 422, les conflits en 409, sans masquer une panne", () => {
    expect([equityFailureStatus("EQ_SOURCES_REQUIRED"), equityFailureStatus("EQ_CITATION_REQUIRED"), equityFailureStatus("EQUITY_DATE_MISMATCH")]).toEqual([422, 422, 422]);
    expect([equityFailureStatus("STALE_WORKPAPER_VERSION"), equityFailureStatus("EQ_SOURCE_REPLACED_REVISION_REQUIRED"), equityFailureStatus("SELF_APPROVAL_FORBIDDEN"), equityFailureStatus("TypeError: x")]).toEqual([409, 409, 403, 503]);
  });
});

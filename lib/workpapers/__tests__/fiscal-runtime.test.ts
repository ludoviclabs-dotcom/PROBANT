import { beforeEach, describe, expect, it } from "vitest";
import { fiscalFailureStatus, requireDisposableFiscal } from "../fiscal-http";
import type { VatResult } from "../fiscal-vat";
import type { WorkpaperRun } from "../model";
import { CA3_T1, CA3_T2, CA3_T2_CORRECTED, CA3_T3, fxScope, T1, T2, T3 } from "./fiscal-fixtures";
import { createFiscalHarness, FX_DOSSIER, FX_OTHER_DOSSIER, type FiscalHarness } from "./fiscal-harness";

let h: FiscalHarness;
beforeEach(() => { h = createFiscalHarness(); });
const resultOf = (run: WorkpaperRun) => run.result!.result as VatResult;
const exportRequest = (session: string, body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/fiscal/export", { method: "POST", headers: { "x-test-session": session, "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: FX_DOSSIER, periodId: fxScope.periodId, ...body }) });

describe("FX-1301 chaîne serveur TVA : sources → période déclarative → population figée → moteur → décision citée → revue distincte → verrouillage", () => {
  it("parcours complet T2 2026 : écart du moteur expliqué par le pont, note traitée en citant la pièce, revue par une autre identité", async () => {
    const { sources, run: frozen } = await h.frozen();
    expect(frozen).toMatchObject({ state: "ready", population: { unit: "vat_entry" } });
    // Population: the VAT entries of the FEC (T1 to T4); the selection keeps the T2 ones, the others are excluded with their date.
    expect(frozen.population!.items.map(i => i.id)).toEqual(["E:AC:AC1001", "E:AC:AC2001", "E:AC:AC2002", "E:VE:VE1001", "E:VE:VE2001", "E:VE:VE2002", "E:VE:VE2003", "E:VE:VE3001", "E:VE:VE3002", "E:VE:VE9001"]);
    expect(frozen.selection!.selectedIds.sort()).toEqual(["E:AC:AC2001", "E:AC:AC2002", "E:VE:VE2001", "E:VE:VE2002", "E:VE:VE2003"]);
    expect(frozen.selection!.exclusions.find(e => e.id === "E:VE:VE1001")?.reason).toMatch(/hors période déclarative 2026-04-01 – 2026-06-30/);
    // The run depends on its own return and on the previous one (credit carried forward), not on other periods.
    expect([...frozen.importIds].sort()).toEqual([sources.fec.id, sources.t1.id, sources.t2.id, sources.invoices.id, sources.payments.id, sources.support.id].sort());
    expect(frozen.fiscalWork).toMatchObject({ tax: "vat", period: T2, profile: { status: "confirmed", confirmedBy: "preparer-fx", evidence: { fileName: "fx_support.csv", row: 2 } } });
    let run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
    const r = resultOf(run);
    expect(run.result!.outcome).toBe("exceptions_detected");
    expect(r.bridge).toMatchObject({ startCents: 12000, explainedCents: 2000, declaredCents: 2000, residualCents: 0 });
    expect(r.credit.differenceCents).toBe(0);
    expect(r.payments.differenceCents).toBe(0);
    const note = run.notes.find(n => n.id === "fx-exception:ENGINE:VAT.NET")!;
    expect(note).toMatchObject({ blocking: true, kind: "observation", amount: { kind: "known", value: { amount: "100.00" } } });
    // Evidence: declaration cells read by the engine, FEC lines of the period, pieces and payments.
    expect(run.evidence.some(e => e.purpose === "Case 28 lue par le moteur TVA" && e.precision === "cell")).toBe(true);
    expect(run.evidence.some(e => e.purpose === "Pièce FA-2002")).toBe(true);
    // A human decision without a citation, or citing a piece outside the frozen sources, is refused.
    expect((await h.command({ command: "note", id: run.id, expectedVersion: run.version, note: { id: "J1", kind: "judgment", text: "Écart expliqué", amount: { kind: "not_applicable", reason: "—" }, blocking: false } })).body.error).toBe("FX_CITATION_REQUIRED");
    expect((await h.command({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: note.id, text: "Crédit du T1", citation: { documentId: "source-inconnue" } })).body.error).toBe("FX_CITATION_SOURCE_REQUIRED");
    const cite = await h.rowOf(sources.t1.id, "27");
    run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: note.id, text: "L’écart de 100 correspond au crédit du T1 reporté en case 22 (case 27 de la CA3 T1).", citation: cite });
    expect(run.notes.find(n => n.id === note.id)!.resolution).toMatchObject({ authorId: "preparer-fx", citation: { documentVersionId: cite.documentId, rowId: cite.rowId, fileName: "CA3-2026-01-01.csv" } });
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "TVA T2 2026 rapprochée ; écart net expliqué par le crédit reporté cité ; aucune conformité déclarée." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Auto-revue" })).status).toBe(403);
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante : pont et citations vérifiés." }, "reviewer");
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    expect(run.state).toBe("locked");
    const mission = await h.mission();
    expect(mission.procedure).toMatchObject({ resultLabel: "Exceptions maintenues", reviewLabel: "Revue documentée et version verrouillée", stale: false, legal: { conclusion: "Aucune liquidation, aucune conformité déclarée" } });
    expect(mission.periods).toEqual([expect.objectContaining({ label: "TVA · T2 2026", state: "locked", stale: false })]);
    const exported = await h.handlers.exportPOST(exportRequest("reviewer", { kind: "approved", format: "html", expectedSnapshotHash: mission.hash }));
    expect(exported.status).toBe(200);
    const html = await exported.text();
    expect(html).toContain("Paquet TVA approuvé et verrouillé");
    expect(html).toContain("non approuvé comme taux légal");
    expect(html).not.toMatch(/conforme\b|déclaration conforme|impôt définitif/i);
  });
  it("FEC seul : la feuille s’exécute en signal, non concluante, déclaration absente jamais lue comme zéro", async () => {
    const fec = await h.accept(await h.previewFec());
    let run = await h.create(T2);
    expect(await h.expected(run.id)).toEqual([fec.id]);
    run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: [fec.id], draft: { frequency: "quarterly", formVintage: 2026, explanations: [], profile: { vatRegime: "real_normal", vatGroupStatus: "none", siren: null, evidence: null } } });
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    expect(run.result!.outcome).toBe("inconclusive");
    expect(resultOf(run)).toMatchObject({ engine: { evidenceTier: "ledger_only" }, declaration: { status: "absent" }, bridge: { status: "unknown", declaredCents: null } });
    expect(run.notes.map(n => n.id).sort()).toEqual(["fx-exception:LEDGER_ONLY", "fx-exception:PROFILE"]);
  });
});

describe("FX-1302 versions, périodes et péremption", () => {
  it("déclaration remplacée : la feuille T2 devient périmée, la version remplacée reste visible ; une révision repart des sources courantes", async () => {
    const { sources, run: executed } = await h.executed();
    const corrected = await h.accept(await h.previewReturn(T2, CA3_T2_CORRECTED));
    const read = await h.read();
    expect(read.body.sourcesCurrent[executed.id]).toBe(false);
    expect(read.body.versions["fx_vat_return:2026-04-01:2026-06-30"].map((v: { importId: string; current: boolean }) => [v.importId, v.current])).toEqual([[sources.t2.id, false], [corrected.id, true]]);
    expect((await h.command({ command: "conclude", id: executed.id, expectedVersion: executed.version, text: "x" })).body.error).toBe("FX_SOURCE_REPLACED_REVISION_REQUIRED");
    const mission = await h.mission();
    expect(mission.procedure.stale).toBe(true);
    expect(mission.replaced).toEqual([expect.objectContaining({ key: "fx_vat_return:2026-04-01:2026-06-30", importId: sources.t2.id, usedByRun: true })]);
    // Approving the replaced version again is refused: the head only moves forward.
    expect((await h.json(await h.handlers.importsPOST(h.request("preparer", "POST", JSON.stringify({ command: "approve_import", importId: sources.t2.id, previewHash: sources.t2.previewHash, expectedSourceId: corrected.id })))))).toMatchObject({ status: 409, body: { error: "FX_SOURCE_REPLACED_REVISION_REQUIRED" } });
    const revised = await h.ok({ command: "revise", id: executed.id, expectedVersion: executed.version });
    expect(revised).toMatchObject({ state: "draft", revision: 2, importIds: [], fiscalWork: { period: T2 } });
    expect(await h.expected(revised.id)).toContain(corrected.id);
  });
  it("le changement de période n’invalide la revue que lorsque nécessaire : une déclaration T3 laisse le T2 courant, un T1 corrigé le rend périmé", async () => {
    const { run } = await h.executed();
    await h.accept(await h.previewReturn(T3, CA3_T3));
    expect((await h.read()).body.sourcesCurrent[run.id]).toBe(true);
    await h.accept(await h.previewReturn(T1, { ...CA3_T1, "27": "90,00" }));
    expect((await h.read()).body.sourcesCurrent[run.id]).toBe(false);
  });
  it("une période déclarative identifie la feuille : doublon refusé, fréquence incohérente refusée, période hors exercice refusée, période immuable à la configuration", async () => {
    const { sources, run } = await h.frozen();
    expect((await h.command({ command: "create", period: { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR", validation: "provisional" }, tax: "vat", declarativePeriod: T2, frequency: "quarterly", formVintage: 2026 })).status).toBe(409);
    expect((await h.command({ command: "create", period: { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR", validation: "provisional" }, tax: "vat", declarativePeriod: T3, frequency: "monthly", formVintage: 2026 })).body.error).toBe("FX_PERIOD_FREQUENCY_INVALID");
    expect((await h.command({ command: "create", period: { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR", validation: "provisional" }, tax: "vat", declarativePeriod: { startDate: "2026-12-01", endDate: "2027-02-28" }, frequency: "quarterly", formVintage: 2026 })).body.error).toBe("FX_DECLARATIVE_PERIOD_OUTSIDE_EXERCISE");
    // Monthly frequency on a quarter is refused at configuration; the declarative period itself is not part of the draft.
    expect((await h.command({ command: "configure", id: run.id, expectedVersion: run.version, draft: { ...(await h.draft(sources)), frequency: "monthly" } })).body.error).toBe("FX_PERIOD_FREQUENCY_INVALID");
  });
  it("configuration après exécution : résultat, notes et approbation effacés, nouvelle exécution requise", async () => {
    const { sources, run: executed } = await h.executed();
    const run = await h.ok({ command: "configure", id: executed.id, expectedVersion: executed.version, draft: await h.draft(sources, { explanations: [] }) });
    expect(run).toMatchObject({ state: "ready", notes: [] });
    expect(run.result).toBeUndefined();
    const again = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    expect(resultOf(again).bridge.residualCents).toBe(-10000);
    expect(again.notes.map(n => n.id)).toContain("fx-exception:BRIDGE");
  });
  it("profil inconnu : exécution bloquée par le moteur, règles « profil » listées, montants inconnus", async () => {
    const { run } = await h.executed(T2, { profile: { vatRegime: "unknown", vatGroupStatus: "unknown", siren: null, evidence: null } });
    const r = resultOf(run);
    expect(run.result!.outcome).toBe("inconclusive");
    expect(r.engine.status).toBe("blocked");
    expect(r.comparison.every(c => c.accountedCents === null)).toBe(true);
    expect(r.blockedRules.map(b => b.category)).toContain("profile");
    expect((await h.mission()).procedure.resultLabel).toBe("Moteur bloqué — règles ou profil requis");
  });
  it("source expirée : la feuille T3 liste les contrôles bloqués et la source requise ; le résultat n’est jamais un feu vert", async () => {
    const sources = await h.importAll();
    const t3 = await h.accept(await h.previewReturn(T3, CA3_T3));
    let run = await h.create(T3);
    run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: await h.expected(run.id), draft: { ...(await h.draft(sources)), explanations: [] } });
    expect(run.importIds).toContain(t3.id);
    expect(run.importIds).toContain(sources.t2.id);
    run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
    const rule = resultOf(run).blockedRules.find(b => b.code === "VAT_SOURCE_NOT_COVERED")!;
    expect(rule.requiredSource).toMatch(/Code general des impots, article 269 \(Legifrance\) : version applicable à compter du 01\/09\/2026 non publiée/);
    expect(run.notes.map(n => n.id)).toContain("fx-exception:SOURCE:VAT_SOURCE_NOT_COVERED");
    expect((await h.mission("preparer", "&id=" + run.id)).queue.some(q => q.id === "rule:VAT_SOURCE_NOT_COVERED" && q.category === "blocked")).toBe(true);
  });
});

describe("FX-1303 autorisations, idempotence et garde de recette", () => {
  it("autre organisation, session expirée, lecture sans en-tête : refus ; production fermée même avec le drapeau", async () => {
    await h.importAll();
    expect((await h.read("outsider")).status).toBe(403);
    expect((await h.read("expired")).status).toBe(401);
    expect((await h.json(await h.handlers.GET(h.request("preparer", "GET", undefined, FX_OTHER_DOSSIER))))).toMatchObject({ status: 403 });
    expect(() => requireDisposableFiscal({ PROBANT_FISCAL_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireDisposableFiscal({})).toThrow();
    expect(() => requireDisposableFiscal({ PROBANT_FISCAL_DURABLE: "disposable" })).not.toThrow();
    expect(fiscalFailureStatus("FX_SOURCE_REPLACED_REVISION_REQUIRED")).toBe(409);
    expect(fiscalFailureStatus("FX_CITATION_REQUIRED")).toBe(422);
  });
  it("idempotence : même clé et même commande → même réponse ; même clé et autre commande → refus", async () => {
    await h.importAll();
    const body = { command: "create", period: { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR", validation: "provisional" }, tax: "vat", declarativePeriod: T2, frequency: "quarterly", formVintage: 2026 };
    const first = await h.command(body, "preparer", "fx-key-0001"), second = await h.command(body, "preparer", "fx-key-0001");
    expect(second.body).toEqual(first.body);
    expect((await h.command({ ...body, declarativePeriod: T1 }, "preparer", "fx-key-0001")).body.error).toBe("IDEMPOTENCY_KEY_REUSED");
  });
  it("import : FEC déséquilibré et déclaration IS refusés dans le sous-lot TVA ; les montants illisibles ne deviennent jamais zéro", async () => {
    const bad = await h.previewFec("JournalCode;JournalLib;EcritureNum;EcritureDate;CompteNum;CompteLib;CompAuxNum;CompAuxLib;PieceRef;PieceDate;EcritureLib;Debit;Credit\nVE;V;1;20260410;411000;C;;;F;20260410;L;100,00;0,00\nVE;V;1;20260410;706000;P;;;F;20260410;L;0,00;90,00\n");
    expect(bad.body.batch.report.blocking.join(" ")).toMatch(/FX_FEC_ENTRY_UNBALANCED/);
    expect((await h.approve(bad.body.batch).catch(e => e.message))).toMatch(/IMPORT_REJECTED_OR_STALE/);
    expect(CA3_T2["28"]).toBe("20,00");
  });
});

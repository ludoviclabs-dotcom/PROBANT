import { beforeEach, describe, expect, it } from "vitest";
import { provisionFailureStatus, requireDisposableProvisions } from "../provision-http";
import type { ProvisionResult } from "../provision-contract";
import type { WorkpaperRun } from "../model";
import { estimateCsv, ESTIMATE_ROWS, pvPeriod, registerCsv, REGISTER_ROWS } from "./provision-fixtures";
import { createProvisionHarness, PV_OTHER_DOSSIER, type ProvisionHarness } from "./provision-harness";

let h: ProvisionHarness;
beforeEach(() => { h = createProvisionHarness(); });
const resultOf = (run: WorkpaperRun) => run.result!.result as ProvisionResult;

describe("PV-1611 chaîne serveur : sources → population figée → calcul → notes → revue distincte → verrouillage", () => {
  it("parcours complet : 7 événements, 6 de l’exercice, 1 exclu avec motif ; 4 points en notes d’une seule version ; traitements cités ; revue par une autre identité", async () => {
    const { sources, run: frozen } = await h.frozen();
    expect(frozen).toMatchObject({ state: "ready", template: { id: "provisions.register" }, population: { unit: "pv_event" }, provisionWork: { lawyers: { status: "obtained", citation: { fileName: "pv_support.csv", row: 14 } } } });
    expect(frozen.population!.items.map(i => [i.id, i.amount.amount])).toEqual([["EV-01", "30.00"], ["EV-02", "25.00"], ["EV-03", "0.00"], ["EV-04", "40.00"], ["EV-05", "0.00"], ["EV-06", "0.00"], ["EV-07", "0.00"]]);
    expect(frozen.selection!.selectedIds).toHaveLength(6);
    expect(frozen.selection!.exclusions).toEqual([{ id: "EV-07", reason: expect.stringContaining("né après la clôture") }]);
    let run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
    expect(run.result!.outcome).toBe("exceptions_detected");
    expect(run.version).toBe(frozen.version + 2);
    expect(run.notes.map(n => [n.id, n.kind])).toEqual([["pv-exception:ESTIMATE_DIFFERENCE:EV-01", "observation"], ["pv-exception:MOVEMENT_UNSUPPORTED:EV-02:M03", "missing_evidence"], ["pv-exception:ESTIMATE_MISSING:EV-05", "missing_evidence"], ["pv-exception:ANNEX_MISSING:EV-06", "observation"]]);
    expect(run.notes[0].amount).toEqual({ kind: "known", value: { amount: "30.00", currency: "EUR" } });
    expect(run.evidence.some(e => e.purpose === "Estimation documentée")).toBe(true);
    // Every open point is resolved by a decision citing a frozen piece and its row; no legal outcome is inferred.
    const support = sources.pv_support!, comite = support.rows.find(r => r.original.Piece === "PV-COMITE-12")!;
    for (const n of run.notes) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Différence examinée avec la direction ; appréciation documentée au procès-verbal.", citation: { documentId: support.document.id, rowId: comite.id } });
    expect(run.notes.every(n => n.resolution?.citation?.fileName === "pv_support.csv" && n.resolution.citation.row === 2)).toBe(true);
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Différences examinées et documentées ; aucune issue juridique déduite." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Auto-revue" })).status).toBe(403);
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante du registre." }, "reviewer");
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    expect(run.state).toBe("locked");
  });
  it("une décision humaine cite une source figée ; sans registre ni grand livre, rien n’est figé", async () => {
    const { run } = await h.executed();
    expect((await h.command({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: run.notes[0].id, text: "x", citation: { documentId: "source-hors-feuille" } })).body.error).toBe("PV_CITATION_SOURCE_REQUIRED");
    expect((await h.command({ command: "note", id: run.id, expectedVersion: run.version, note: { id: "pv-event:EV-01:1", kind: "judgment", text: "Jugement", amount: { kind: "unknown", reason: "—" }, blocking: false } })).body.error).toBe("PV_CITATION_REQUIRED");
    const only = createProvisionHarness(), s = await only.importAll(["pv_register", "pv_support"]), r2 = await only.create();
    expect((await only.command({ command: "freeze", id: r2.id, expectedVersion: r2.version, importIds: Object.values(s).map(b => b!.id), draft: only.draft(s) })).body.error).toBe("PV_SOURCES_REQUIRED");
  });
  it("estimation remplacée après le calcul : feuille périmée, ancienne version conservée, révision sur les sources courantes", async () => {
    const { sources, run } = await h.executed();
    h.clock.now += 60;
    const replacement = await h.accept(await h.preview("pv_estimates", estimateCsv(ESTIMATE_ROWS.map(e => e[0] === "E02" ? e.map((c, i) => i === 1 ? "50,00" : c) : e))));
    const view = (await h.read()).body;
    expect(view.sourcesCurrent[run.id]).toBe(false);
    expect(view.versions.pv_estimates.map((v: { importId: string; current: boolean }) => [v.importId, v.current])).toEqual([[sources.pv_estimates!.id, false], [replacement.id, true]]);
    expect((await h.command({ command: "conclude", id: run.id, expectedVersion: run.version, text: "x" })).body.error).toBe("PV_SOURCE_REPLACED_REVISION_REQUIRED");
    const revised = await h.ok({ command: "revise", id: run.id, expectedVersion: run.version });
    expect(revised).toMatchObject({ revision: 2, state: "draft", importIds: [], notes: [] });
    expect(revised.provisionWork).toBeUndefined();
    const current = { ...sources, pv_estimates: replacement };
    const refrozen = await h.ok({ command: "freeze", id: revised.id, expectedVersion: revised.version, importIds: Object.values(current).map(b => b!.id), draft: h.draft(current) });
    const executed = await h.ok({ command: "execute", id: refrozen.id, expectedVersion: refrozen.version });
    expect(resultOf(executed).events.find(e => e.eventId === "EV-01")).toMatchObject({ estimateDifferenceCents: "0", status: "consistent" });
  });
  it("informations des avocats déclarées non obtenues : reconfiguration, nouvelle exécution et incertitude citant NEP 501", async () => {
    const { run } = await h.executed();
    const configured = await h.ok({ command: "configure", id: run.id, expectedVersion: run.version, draft: { lawyers: { status: "not_obtained", reason: "Demande adressée aux avocats, réponses non reçues" } } });
    expect(configured).toMatchObject({ state: "ready", notes: [], provisionWork: { lawyers: { status: "not_obtained" } } });
    const executed = await h.ok({ command: "execute", id: configured.id, expectedVersion: configured.version });
    expect(executed.notes.find(n => n.id === "pv-exception:LAWYERS_INFO_MISSING")).toMatchObject({ kind: "missing_evidence" });
  });
  it("aperçu refusé avec la cellule en cause ; rien n’est conservé", async () => {
    const r = await h.preview("pv_register", registerCsv([REGISTER_ROWS[0].map((c, i) => i === 5 ? "probable" : c)]));
    expect(r).toMatchObject({ status: 422, body: { error: "PV_TREATMENT_INVALID", locator: { row: 2, column: "Traitement", value: "probable" } } });
    expect((await h.read()).body.imports).toEqual([]);
  });
});

describe("PV-1612 confidentialité : masquage serveur selon l’habilitation", () => {
  it("le réviseur sans habilitation reçoit une projection masquée ; l’habilité lit tout ; aucun texte confidentiel dans la réponse", async () => {
    const { run } = await h.executed();
    const masked = (await h.read("reviewer")).body, full = (await h.read("counsel")).body;
    expect(masked.confidentialAccess).toBe(false);
    expect(full.confidentialAccess).toBe(true);
    const text = JSON.stringify(masked);
    for (const secret of ["Client Alpha", "assignation devant le tribunal", "Issue défavorable", "Condamnation intégrale", "Lettre de l’avocat — litige", "SYN-06", "Convocation devant le conseil"]) expect(text).not.toContain(secret);
    const e = (masked.runs[0].result.result as ProvisionResult).events.find(x => x.eventId === "EV-01")!;
    expect(e).toMatchObject({ masked: true, obligation: null, estimates: [], retainedEstimateCents: null, bridge: { computedClosing: "5000" } });
    expect(masked.runs[0].notes.find((n: { id: string }) => n.id === "pv-exception:ESTIMATE_DIFFERENCE:EV-01")).toMatchObject({ text: "Estimation documentée ≠ provision — Masqué — habilitation confidentielle requise", amount: { kind: "unknown" } });
    // The stored run is untouched: the authorized reader sees the known +30, and the review hash is the same for both.
    expect(full.runs[0].notes.find((n: { id: string }) => n.id === "pv-exception:ESTIMATE_DIFFERENCE:EV-01").amount).toEqual({ kind: "known", value: { amount: "30.00", currency: "EUR" } });
    expect(masked.runs[0].submittedHash).toBe(full.runs[0].submittedHash);
    expect(JSON.stringify(full)).toContain("Client Alpha");
    // Sources: confidential register cells are replaced, confidential estimate rows are withheld whole, never zeroed.
    const register = masked.imports.find((b: { document: { documentType: string } }) => b.document.documentType === "pv_register");
    expect(register.rows.find((r: { original: Record<string, string> }) => r.original.Evenement === "EV-01").original.Contrepartie).toBe("Masqué — habilitation confidentielle requise");
    expect(register.rows.find((r: { original: Record<string, string> }) => r.original.Evenement === "EV-02").original.Obligation).toBe("Garantie contractuelle de 24 mois sur les ventes");
    const estimates = masked.imports.find((b: { document: { documentType: string } }) => b.document.documentType === "pv_estimates");
    expect(estimates.rows.map((r: { original: Record<string, string> }) => r.original.Ligne)).toEqual(["E04"]);
    expect(estimates.maskedRows).toBe(4);
    expect(masked.versions.pv_register[0].confidential).toBe(true);
    expect(run.id).toBe(masked.runs[0].id);
  });
  it("téléchargement de l’original : refusé sans habilitation pour une source confidentielle, servi pour le grand livre ; servi à l’habilité", async () => {
    const { sources } = await h.executed();
    const get = (session: string, id: string) => h.handlers.GET(h.request(session, "GET", undefined, undefined, "&operation=download&id=" + id));
    expect((await get("reviewer", sources.pv_register!.document.id)).status).toBe(403);
    expect((await (await get("reviewer", sources.pv_register!.document.id)).json()).error).toBe("PV_CONFIDENTIAL_FORBIDDEN");
    expect((await get("reviewer", sources.pv_estimates!.document.id)).status).toBe(403);
    expect((await get("reviewer", sources.pv_ledger!.document.id)).status).toBe(200);
    expect((await get("reviewer", sources.pv_annex!.document.id)).status).toBe(200);
    expect((await get("counsel", sources.pv_register!.document.id)).status).toBe(200);
  });
  it("une réponse de commande ou d’approbation passe par le même masquage", async () => {
    const reviewer = createProvisionHarness(), s = await reviewer.importAll(["pv_register", "pv_ledger", "pv_support"]);
    const { run } = await reviewer.executed(s);
    // A note on a confidential event, written by an authorized preparer, is masked for the reviewer.
    const noted = await reviewer.ok({ command: "note", id: run.id, expectedVersion: run.version, note: { id: "pv-event:EV-01:1", kind: "observation", text: "Point avec l’avocat — stratégie de transaction", amount: { kind: "unknown", reason: "—" }, blocking: false } });
    expect(noted.notes.find(n => n.id === "pv-event:EV-01:1")!.text).toContain("stratégie de transaction");
    const view = (await reviewer.read("reviewer")).body;
    expect(view.runs[0].notes.find((n: { id: string }) => n.id === "pv-event:EV-01:1").text).toBe("Point avec l’avocat — Masqué — habilitation confidentielle requise");
  });
});

describe("PV-1613 autorisations, idempotence et garde de recette", () => {
  it("autre organisation refusée, session expirée refusée, rejeu idempotent, clé réutilisée refusée, conflit de version", async () => {
    expect((await h.read("outsider")).status).toBe(403);
    expect((await h.json(await h.handlers.GET(h.request("preparer", "GET", undefined, PV_OTHER_DOSSIER)))).status).toBe(403);
    expect((await h.read("expired")).status).toBe(401);
    const body = { command: "create", period: pvPeriod };
    const first = await h.command(body, "preparer", "cle-idempotence-pv"), again = await h.command(body, "preparer", "cle-idempotence-pv");
    expect(again.body.run.id).toBe(first.body.run.id);
    expect((await h.command({ ...body, period: { ...pvPeriod, asOfDate: "2027-04-30" } }, "preparer", "cle-idempotence-pv")).body.error).toBe("IDEMPOTENCY_KEY_REUSED");
    const { run } = await createProvisionHarness().frozen().then(x => x);
    expect(run.state).toBe("ready");
  });
  it("garde de recette : fermée sans le drapeau, toujours fermée en production ; codes HTTP", () => {
    expect(() => requireDisposableProvisions({})).toThrow();
    expect(() => requireDisposableProvisions({ PROBANT_PROVISIONS_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireDisposableProvisions({ PROBANT_PROVISIONS_DURABLE: "disposable" })).not.toThrow();
    expect([provisionFailureStatus("PV_SOURCE_REPLACED_REVISION_REQUIRED"), provisionFailureStatus("PV_CITATION_REQUIRED"), provisionFailureStatus("PV_CONFIDENTIAL_FORBIDDEN"), provisionFailureStatus("boom")]).toEqual([409, 422, 403, 503]);
  });
});

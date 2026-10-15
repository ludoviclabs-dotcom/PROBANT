import { describe, expect, it } from "vitest";
import { buildProvisionMission, provisionSheetHref, PROVISION_MISSION_PROGRAM, type ProvisionMissionSnapshot } from "../provision-mission";
import { PROVISION_RULE, PROVISION_TEMPLATE } from "../provision-adapter";
import { PV_EXCEPTION_CODES } from "../provision-contract";
import { redactProvisionRun } from "../provision-redaction";
import type { WorkpaperRun } from "../model";
import { estimateCsv, ESTIMATE_ROWS, pvScope, registerCsv, REGISTER_ROWS } from "./provision-fixtures";
import { createProvisionHarness, type ProvisionHarness } from "./provision-harness";
import type { AuthenticatedPrincipal } from "@/lib/auth/principal";

/**
 * Mission synthesis of the provisions register (C-lot « restitution Provisions »). Every expected value below is
 * established by hand from the synthetic recipe (provision-fixtures.ts), never read back from the implementation.
 */
const KEY = [pvScope.organizationId, pvScope.dossierId, pvScope.periodId].join("|");
type MissionBody = { actorId: string; permissions: string[]; confidentialAccess: boolean; mission: ProvisionMissionSnapshot };
async function mission(h: ProvisionHarness, session = "preparer", extra = ""): Promise<{ status: number; body: MissionBody & { error?: string } }> {
  return h.read(session, "&operation=mission" + extra);
}
function exportRequest(h: ProvisionHarness, session: string, body: Record<string, unknown>) {
  return h.handlers.exportPOST(new Request("https://probant.test/api/workpapers/provisions/export", { method: "POST", headers: { "x-test-session": session, "Content-Type": "application/json" },
    body: JSON.stringify({ dossierId: pvScope.dossierId, periodId: pvScope.periodId, kind: "diagnostic", format: "json", ...body }) }));
}
/** Confidential content of the recipe (events EV-01 and EV-06, pieces LET-AVOCAT-01, LET-PRUD-06, EST-PRUD-06, LET-AVOCATS). */
const SECRETS = ["Client Alpha", "assignation devant le tribunal", "Hypothèse la plus probable selon", "Provision portée à 50", "Issue défavorable", "Condamnation intégrale", "Central — hypothèse la plus probable",
  "Lettre de l’avocat — litige", "SYN-06", "Convocation devant le conseil", "Pas de provision, mention en annexe", "Complément au vu de la lettre", "Réponses des avocats sur les procès", "Effets financiers estimés"];
const TEXT_FORMATS = ["json", "html", "manifest", "exceptions_csv", "decisions_csv", "procedures_csv", "sources_csv"] as const;

describe("PV-1620 Synthèse Provisions : programme fermé, version exacte et affectation", () => {
  it("le programme existe avant tout résultat ; chaque code du moteur relève d’un seul contrôle ; règle alignée sur la procédure", () => {
    const m = buildProvisionMission(pvScope, [], [], []);
    expect(m.program).toEqual(PROVISION_MISSION_PROGRAM);
    expect(m.schemaVersion).toBe("provisions-mission-1.0.0");
    expect(m.counters).toMatchObject({ planned: 1, plannedParts: 6, executed: 0, testedParts: 0, notApplicableParts: 0, exceptions: 0, uncertainties: 0 });
    // Not executed: no outcome and an unknown denominator, never « 0 sur 0 ».
    expect(m.procedure.controls.map(c => [c.id, c.outcome, c.coverage.denominator])).toEqual([["bridge", null, null], ["estimate", null, null], ["annex", null, null], ["framing", null, null], ["supports", null, null], ["lawyers", null, null]]);
    expect(m.queue.map(q => q.id)).toEqual(expect.arrayContaining(["procedure:pending", "source:expected:pv_register", "source:expected:pv_ledger", "source:movements", "source:estimates", "source:annex", "source:support"]));
    const tests = PROVISION_MISSION_PROGRAM.procedures[0].tests;
    for (const code of PV_EXCEPTION_CODES) expect(tests.filter(t => (t.codes as readonly string[]).includes(code)).map(t => t.id)).toHaveLength(1);
    expect(tests.flatMap(t => t.codes)).toHaveLength(PV_EXCEPTION_CODES.length);
    expect([PROVISION_MISSION_PROGRAM.procedures[0].id, PROVISION_MISSION_PROGRAM.procedures[0].version]).toEqual([PROVISION_TEMPLATE.id, PROVISION_RULE.version]);
  });

  it("restitution de la version courante : contrôles, couverture, compteurs et file établis à la main depuis le recueil", async () => {
    const h = createProvisionHarness(), { run } = await h.executed(), { status, body } = await mission(h);
    expect(status).toBe(200);
    const m = body.mission;
    expect(m.procedure).toMatchObject({ runId: run.id, version: run.version, stale: false, staleReasons: [], state: "executed" });
    expect(m.assignment).toMatchObject({ rootId: run.rootId, choices: [run.rootId], currentRunId: run.id, currentVersion: run.version });
    // Recueil, exercice 2026 — événements de l’exercice EV-01…EV-06 ; EV-07 (né le 20/01/2027) exclu : population 6/7.
    expect(m.procedure.coverage).toMatchObject({ numerator: 6, denominator: 7 });
    // bridge : EV-01 30+20=50 (déclaré 50), EV-02 25−5−10=10 (10), EV-04 40−35−5=0 (0), EV-05 0+15=15 (15) → 4/4 sans écart ; EV-03 et EV-06 sans provision.
    // estimate : provisions hors clos soldé = EV-01, EV-02, EV-05 ; EV-01 80−50=+30, EV-02 10−10=0, EV-05 sans estimation → 2/3, une différence.
    // annex : EV-01 (A01), EV-02 (A02), EV-03 (attendu, A03), EV-06 (attendu, absent) → 4/4 comparés, EV-06 absent → différence.
    // framing : 1511 (70/50), 1512 (25/10), 1522 (0/15) → 3/3 cadrés sans écart.
    // supports : 6 mouvements dont M03 sans pièce + 6 décisions citées → 11/12, incertitude.
    // lawyers : litiges EV-01 et EV-04, informations obtenues (LET-AVOCATS) → 2/2.
    expect(m.procedure.controls.map(c => [c.id, c.outcome, c.coverage.numerator, c.coverage.denominator, c.complete])).toEqual([
      ["bridge", "no_exception_detected", 4, 4, true], ["estimate", "exceptions_detected", 2, 3, false], ["annex", "exceptions_detected", 4, 4, true],
      ["framing", "no_exception_detected", 3, 3, true], ["supports", "inconclusive", 11, 12, false], ["lawyers", "no_exception_detected", 2, 2, true]]);
    const control = (id: string) => m.procedure.controls.find(c => c.id === id)!;
    expect(control("bridge").coverage.exclusions.map(e => e.id)).toEqual(["EV-03", "EV-06"]);
    expect(control("estimate").coverage.exclusions.map(e => e.id)).toEqual(["EV-03", "EV-04", "EV-06"]);
    expect(control("estimate").exceptionIds).toEqual(["ESTIMATE_DIFFERENCE:EV-01", "ESTIMATE_MISSING:EV-05"]);
    expect(control("supports").exceptionIds).toEqual(["MOVEMENT_UNSUPPORTED:EV-02:M03"]);
    // 2 différences (ESTIMATE_DIFFERENCE, ANNEX_MISSING) et 2 incertitudes (MOVEMENT_UNSUPPORTED, ESTIMATE_MISSING) ; 4 contrôles complets sur 6.
    expect(m.counters).toMatchObject({ executed: 1, plannedParts: 6, testedParts: 4, notApplicableParts: 0, exceptions: 2, uncertainties: 2, stale: 0, reviewed: 0, locked: 0 });
    expect(m.procedure.resultLabel).toBe("Différences maintenues à examiner — aucune anomalie validée");
    // The +30 stays on its event; no exposure total and no grouping across events or categories.
    expect(m.procedure.provisions!.events.find(e => e.eventId === "EV-01")).toMatchObject({ estimateDifferenceCents: "3000", bridge: { computedClosing: "5000", declaredClosing: "5000", difference: "0" } });
    expect(m.amountGrouping.groups).toEqual([]);
    const item = m.queue.find(q => q.id === "ESTIMATE_DIFFERENCE:EV-01")!;
    expect(item).toMatchObject({ category: "exceptions", eventId: "EV-01" });
    expect(item.href).toBe(provisionSheetHref(pvScope, run, { tab: "exceptions", eventId: "EV-01" }));
    expect(new URL("https://x" + item.href).searchParams.get("version")).toBe(String(run.version));
    expect(m.queue.find(q => q.id === "MOVEMENT_UNSUPPORTED:EV-02:M03")!.category).toBe("evidence");
    expect(m.queue.at(-1)).toMatchObject({ id: "review:pending", label: "Soumission à préparer" });
  });

  it("version exacte antérieure : restituée telle quelle, signalée périmée ; version inconnue refusée", async () => {
    const h = createProvisionHarness(), { run } = await h.executed();
    const concluded = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Différences examinées avec la direction." });
    const old = (await mission(h, "preparer", "&id=" + run.id + "&version=" + run.version)).body.mission;
    expect(old.procedure).toMatchObject({ runId: run.id, version: run.version, stale: true, conclusion: "Conclusion non renseignée" });
    expect(old.procedure.staleReasons).toEqual(["Une version Provisions plus récente est disponible."]);
    expect(old.assignment).toMatchObject({ currentRunId: concluded.id, currentVersion: concluded.version });
    expect(old.queue[0]).toMatchObject({ id: "stale:0", category: "stale", priority: 0 });
    expect(old.counters.stale).toBe(1);
    const current = (await mission(h)).body.mission;
    expect(current.procedure).toMatchObject({ version: concluded.version, stale: false, conclusion: "Différences examinées avec la direction." });
    expect(current.hash).not.toBe(old.hash);
    const unknown = await mission(h, "preparer", "&id=" + run.id + "&version=999");
    expect([unknown.status, unknown.body.error]).toEqual([404, "WORKPAPER_VERSION_NOT_FOUND"]);
    expect((await mission(h, "preparer", "&version=2")).status).toBe(422);
  });

  it("deux lignées : affectation requise, aucune sélection implicite par l’état le plus avancé", async () => {
    const h = createProvisionHarness(), { run } = await h.executed();
    // A second lineage inherited from outside the current single-instance API (the store accepts several roots per period).
    const draft = h.db.state.versions[KEY][run.id][0], other: WorkpaperRun = { ...draft, id: "workpaper-lignee-heritee", rootId: "workpaper-lignee-heritee" };
    h.db.state.versions[KEY][other.id] = [other]; h.db.state.runHeads[KEY][other.id] = other.version;
    const m = (await mission(h)).body.mission;
    expect(m.assignment).toMatchObject({ rootId: null, currentRunId: null, currentVersion: null });
    expect(m.assignment.choices).toEqual([run.rootId, other.rootId].sort());
    expect(m.procedure).toMatchObject({ runId: null, state: "not_started", provisions: null });
    expect(m.queue.find(q => q.id === "procedure:pending")!.label).toBe("Affecter une feuille Provisions");
    expect(m.counters).toMatchObject({ executed: 0, exceptions: 0, uncertainties: 0 });
    const a = (await mission(h, "preparer", "&rootId=" + run.rootId)).body.mission, b = (await mission(h, "preparer", "&rootId=" + other.rootId)).body.mission;
    expect(a.procedure).toMatchObject({ runId: run.id, version: run.version, state: "executed" });
    expect(b.procedure).toMatchObject({ runId: other.id, version: 1, state: "draft", provisions: null });
    expect((await mission(h, "preparer", "&rootId=inconnue")).status).toBe(404);
    const outside = await h.read("preparer", "&rootId=" + run.rootId);
    expect([outside.status, outside.body.error]).toEqual([422, "PV_QUERY_INVALID"]);
  });

  it("source remplacée ou ajoutée après le gel : travail périmé, restitution de la version figée", async () => {
    const h = createProvisionHarness(), { sources } = await h.executed();
    h.clock.now += 60;
    await h.accept(await h.preview("pv_estimates", estimateCsv(ESTIMATE_ROWS.map(e => e[0] === "E02" ? e.map((c, i) => i === 1 ? "50,00" : c) : e))));
    const m = (await mission(h)).body.mission;
    expect(m.procedure.staleReasons).toEqual(["Une source Provisions approuvée a été remplacée ou ajoutée depuis le gel."]);
    expect(m.counters).toMatchObject({ stale: 1, reviewed: 0, locked: 0 });
    expect(m.queue[0]).toMatchObject({ id: "stale:0", category: "stale" });
    // The frozen E02 (80) still gives +30 on EV-01; the index shows the frozen estimate as no longer current.
    expect(m.procedure.provisions!.events.find(e => e.eventId === "EV-01")!.estimateDifferenceCents).toBe("3000");
    expect(m.sources.find(s => s.type === "pv_estimates")).toMatchObject({ importId: sources.pv_estimates!.id, current: false });

    // Without an approved annex: annex control inconclusive on EV-03 and EV-06 (0/2, ANNEX_SOURCE_MISSING); adding the annex makes the sheet stale.
    const added = createProvisionHarness(), s = await added.importAll(["pv_register", "pv_movements", "pv_estimates", "pv_ledger", "pv_support"]);
    await added.executed(s);
    const before = (await mission(added)).body.mission;
    expect(before.procedure.stale).toBe(false);
    expect(before.procedure.controls.find(c => c.id === "annex")).toMatchObject({ outcome: "inconclusive", coverage: { numerator: 0, denominator: 2 }, exceptionIds: ["ANNEX_SOURCE_MISSING"] });
    added.clock.now += 60;
    await added.accept(await added.preview("pv_annex"));
    expect((await mission(added)).body.mission.procedure.staleReasons).toEqual(["Une source Provisions approuvée a été remplacée ou ajoutée depuis le gel."]);
  });

  it("non applicable distinct de zéro et du non exécuté : registre réduit à un engagement hors bilan", async () => {
    const h = createProvisionHarness();
    const register = await h.accept(await h.preview("pv_register", registerCsv(REGISTER_ROWS.filter(r => r[0] === "EV-03")))), ledger = await h.accept(await h.preview("pv_ledger"));
    await h.executed({ pv_register: register, pv_ledger: ledger });
    const m = (await mission(h)).body.mission;
    // EV-03 seul : ni provision (pont et estimation non applicables), ni litige (avocats non applicables) ; annexe attendue mais non fournie (0/1) ;
    // décision CA-2026-03 sans pièces citables (0/1) ; grand livre 1511, 1512, 1522 sans événement : écarts d’ouverture et de clôture, pont du GL inconnu (0/3).
    expect(m.procedure.controls.map(c => [c.id, c.outcome, c.coverage.numerator, c.coverage.denominator])).toEqual([
      ["bridge", "not_applicable", 0, 0], ["estimate", "not_applicable", 0, 0], ["annex", "inconclusive", 0, 1], ["framing", "exceptions_detected", 0, 3], ["supports", "inconclusive", 0, 1], ["lawyers", "not_applicable", 0, 0]]);
    // 1511 : ouverture 70 et clôture 50 ; 1512 : 25 et 10 ; 1522 : clôture 15 → 5 écarts ; ANNEX_SOURCE_MISSING et DECISION_UNSUPPORTED → 2 incertitudes.
    expect(m.counters).toMatchObject({ testedParts: 0, notApplicableParts: 3, exceptions: 5, uncertainties: 2 });
  });
});

describe("PV-1621 Synthèse et export Provisions : masquage confidentiel serveur", () => {
  it("synthèse : aucun contenu confidentiel sans habilitation, contenu présent avec elle ; empreintes calculées sur les versions stockées", async () => {
    const h = createProvisionHarness();
    await h.executed();
    const masked = await mission(h, "reviewer"), full = await mission(h, "counsel");
    expect([masked.status, masked.body.confidentialAccess, full.body.confidentialAccess]).toEqual([200, false, true]);
    const text = JSON.stringify(masked.body);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(JSON.stringify(full.body)).toContain("Client Alpha");
    expect(JSON.stringify(full.body)).toContain("Central — hypothèse la plus probable");
    const m = masked.body.mission;
    expect(m.confidentiality).toMatchObject({ access: false, maskedEvents: 2 });
    expect(m.procedure.provisions!.events.find(e => e.eventId === "EV-01")).toMatchObject({ masked: true, estimates: [], retainedEstimateCents: null, estimateDifferenceCents: null, bridge: { computedClosing: "5000" } });
    expect(m.procedure.provisions!.exceptions.find(e => e.id === "ESTIMATE_DIFFERENCE:EV-01")!.amount).toEqual({ kind: "unknown", reason: "Montant masqué — habilitation confidentielle requise" });
    expect(m.procedure.notes.find(n => n.id === "pv-exception:ESTIMATE_DIFFERENCE:EV-01")!.amount.kind).toBe("unknown");
    // Counts are taken on the stored result: masking never changes a denominator, a hash or the version restituted.
    expect(m.procedure.controls.map(c => c.coverage)).toEqual(full.body.mission.procedure.controls.map(c => c.coverage));
    expect([m.procedure.contentHash, m.procedure.version]).toEqual([full.body.mission.procedure.contentHash, full.body.mission.procedure.version]);
    // Estimate rows of confidential events are withheld whole (E01, E02, E03, E05): only E04 keeps a locator.
    expect(m.sources.find(s => s.type === "pv_estimates")).toMatchObject({ rowCount: 5, maskedRows: 4, confidential: true });
    expect(m.sources.find(s => s.type === "pv_estimates")!.locators).toHaveLength(1);
    expect(m.hash).not.toBe(full.body.mission.hash);
    // The sheet's read model withholds the estimates total (40 + 80 + 120 + 10 + 12 = 262,00) with the hidden rows, like the export.
    expect(JSON.stringify((await h.read("reviewer")).body)).not.toContain("\"262.00\"");
    expect(JSON.stringify((await h.read("counsel")).body)).toContain("\"262.00\"");
  });

  it("export : chaque format texte applique le même masquage, imports et totaux compris ; l’habilité reçoit le contenu", async () => {
    const h = createProvisionHarness(), { run } = await h.executed();
    const masked = (await mission(h, "reviewer")).body.mission, full = (await mission(h, "counsel")).body.mission;
    for (const format of TEXT_FORMATS) {
      const response = await exportRequest(h, "reviewer", { id: run.id, version: run.version, format, expectedSnapshotHash: masked.hash });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Probant-Snapshot")).toBe(masked.hash);
      const content = await response.text();
      for (const secret of SECRETS) expect(content, format + " : " + secret).not.toContain(secret);
    }
    const json = await (await exportRequest(h, "reviewer", { id: run.id, version: run.version, format: "json", expectedSnapshotHash: masked.hash })).text();
    // Estimates total E01…E05 = 40 + 80 + 120 + 10 + 12 = 262,00 : it would reveal the hidden rows, so it is withheld with them.
    expect(json).not.toContain("\"262.00\"");
    expect(JSON.parse(json).imports.find((b: { document: { documentType: string } }) => b.document.documentType === "pv_estimates")).toMatchObject({ maskedRows: 4, report: { normalizedTotal: null, sourceTotal: { kind: "unknown" } } });
    const authorized = async (format: string) => (await exportRequest(h, "counsel", { id: run.id, version: run.version, format, expectedSnapshotHash: full.hash })).text();
    const fullJson = await authorized("json");
    expect(fullJson).toContain("Client Alpha"); expect(fullJson).toContain("\"262.00\"");
    expect(await authorized("html")).toContain("Central — hypothèse la plus probable");
    expect(await authorized("exceptions_csv")).toContain("Central — hypothèse la plus probable");
    const pdf = await exportRequest(h, "reviewer", { id: run.id, version: run.version, format: "pdf", expectedSnapshotHash: masked.hash });
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(new Uint8Array(await pdf.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("la copie des lignes d’entrée d’un calcul bloqué est masquée comme les sources", async () => {
    const h = createProvisionHarness(), { run } = await h.executed();
    const batches = h.db.state.imports[KEY].map(i => i.batch);
    const blocked = { ...run, result: { ...run.result!, execution: "blocked", outcome: "inconclusive", result: null } } as unknown as WorkpaperRun;
    expect(JSON.stringify(blocked)).toContain("Client Alpha");
    const shown = JSON.stringify(redactProvisionRun(blocked, batches));
    for (const secret of SECRETS) expect(shown).not.toContain(secret);
  });
});

describe("PV-1622 Export Provisions : état affiché exact et paquet approuvé", () => {
  it("conflit d’instantané : empreinte inconnue, habilitation différente ou état modifié depuis l’affichage", async () => {
    const h = createProvisionHarness(), { run } = await h.executed();
    const masked = (await mission(h, "reviewer")).body.mission, full = (await mission(h, "counsel")).body.mission;
    const refused = async (session: string, body: Record<string, unknown>) => { const r = await exportRequest(h, session, body); return [r.status, (await r.json()).error]; };
    expect(await refused("reviewer", { expectedSnapshotHash: "0".repeat(64) })).toEqual([409, "EXPORT_SNAPSHOT_CONFLICT"]);
    // The capability is part of the displayed state: the authorized state cannot be exported by a masked reader.
    expect(await refused("reviewer", { expectedSnapshotHash: full.hash })).toEqual([409, "EXPORT_SNAPSHOT_CONFLICT"]);
    await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Conclusion ajoutée après l’affichage." });
    expect(await refused("reviewer", { expectedSnapshotHash: masked.hash })).toEqual([409, "EXPORT_SNAPSHOT_CONFLICT"]);
    expect(await refused("reviewer", { id: run.id, version: run.version, expectedSnapshotHash: masked.hash })).toEqual([409, "EXPORT_SNAPSHOT_CONFLICT"]);
    expect((await exportRequest(h, "reviewer", { version: 2, expectedSnapshotHash: masked.hash })).status).toBe(400);
  });

  it("paquet approuvé refusé sur une version non verrouillée, accepté sur la version courante verrouillée", async () => {
    const h = createProvisionHarness(), { sources, run: executed } = await h.executed();
    const first = (await mission(h)).body.mission;
    const refused = await exportRequest(h, "preparer", { id: executed.id, version: executed.version, kind: "approved", expectedSnapshotHash: first.hash });
    expect([refused.status, (await refused.json()).error]).toEqual([422, "EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED"]);
    const support = sources.pv_support!, comite = support.rows.find(r => r.original.Piece === "PV-COMITE-12")!;
    let run = executed;
    for (const n of run.notes) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Différence examinée avec la direction, appréciation documentée au procès-verbal.", citation: { documentId: support.document.id, rowId: comite.id } });
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Différences examinées et documentées, aucune issue juridique déduite." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante du registre." }, "reviewer");
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    const m = (await mission(h, "reviewer")).body.mission;
    expect(m.procedure).toMatchObject({ state: "locked", stale: false, reviewLabel: "Revue documentée et version verrouillée" });
    expect(m.counters).toMatchObject({ reviewed: 1, locked: 1 });
    expect(m.procedure.beforeReview?.version).toBeLessThan(run.version);
    const approved = await exportRequest(h, "reviewer", { id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: m.hash });
    expect(approved.status).toBe(200);
    const html = await approved.text();
    expect(html).toContain("Paquet du registre Provisions approuvé et verrouillé");
    for (const secret of SECRETS) expect(html).not.toContain(secret);
    // An earlier version of the same lineage stays exportable as a diagnostic only.
    const old = (await mission(h, "reviewer", "&id=" + executed.id + "&version=" + executed.version)).body.mission;
    const oldApproved = await exportRequest(h, "reviewer", { id: executed.id, version: executed.version, kind: "approved", expectedSnapshotHash: old.hash });
    expect([oldApproved.status, (await oldApproved.json()).error]).toEqual([422, "EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED"]);
    expect((await exportRequest(h, "reviewer", { id: executed.id, version: executed.version, kind: "diagnostic", expectedSnapshotHash: old.hash })).status).toBe(200);
  });

  it("paquet approuvé refusé quand la feuille est verrouillée par une seconde identité simulée (C07 : ne vaut pas relecture)", async () => {
    const h = createProvisionHarness(), { sources, run: executed } = await h.executed();
    h.auth.identities["simulated"] = { ...h.auth.identities["reviewer"], subject: "seconde-identite-simulee", reviewKind: "simulated_second_identity" } as AuthenticatedPrincipal;
    const support = sources.pv_support!, comite = support.rows.find(r => r.original.Piece === "PV-COMITE-12")!;
    let run = executed;
    for (const n of run.notes) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Différence examinée avec la direction, appréciation documentée au procès-verbal.", citation: { documentId: support.document.id, rowId: comite.id } });
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Différences examinées et documentées, aucune issue juridique déduite." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Approbation simulée." }, "simulated");
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "simulated");
    expect(run.approval).toMatchObject({ kind: "simulated_second_identity" });
    const m = (await mission(h, "reviewer")).body.mission;
    const approved = await exportRequest(h, "reviewer", { id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: m.hash });
    expect([approved.status, (await approved.json()).error]).toEqual([422, "EXPORT_APPROVED_SIMULATED_REVIEW"]);
    expect((await exportRequest(h, "reviewer", { id: run.id, version: run.version, kind: "diagnostic", expectedSnapshotHash: m.hash })).status).toBe(200);
  });
});

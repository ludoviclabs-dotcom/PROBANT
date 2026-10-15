import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { RequestAuthorizer } from "@/lib/auth/authorize";
import { DrizzleDossierOwnershipReader } from "@/lib/auth/dossier-scope";
import { DrizzleSessionStore } from "@/lib/auth/session/store";
import { csrfTokenFor, newSessionSecret, sessionTokenDigest, SESSION_COOKIE, CSRF_HEADER } from "@/lib/auth/session/cookie";
import { LOCAL_ISSUER_PREFIX, LOCAL_OWNER_SUBJECT, type LocalAuthConfig } from "@/lib/auth/local/config";
import type { ProbantRole } from "@/lib/auth/roles";
import type { ImportBatch } from "../imports";
import { loanHandlers } from "../loan-http";
import { LoanRuntime } from "../loan-runtime";
import { loanFilesFromRows, loanFixtureRows, LOAN_PERIOD, type LoanScenario } from "../loan-fixture";
import { LOAN_MAPPING, type LoanResult } from "../loan-review";
import type { LoanCommand } from "../loan-commands";
import { contentHash, periodId, type WorkpaperRun } from "../model";
import { assertDisposableDatabase } from "./disposable-database";

/**
 * C13 — recette Emprunts sur PostgreSQL jetable (base *_test locale) : imports approuvés → population → exécution →
 * pièces → relecture (distincte, puis personnelle nommée du profil local C07) → verrouillage → export ; échéancier
 * remplacé, révision et preuves antérieures conservées ; garde de retour arrière de la migration 0020.
 */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Emprunts — PostgreSQL jetable, sessions serveur, relecture et export", () => {
  let client: ReturnType<typeof postgres>, http: ReturnType<typeof loanHandlers>, sessions: DrizzleSessionStore;
  const now = 1_800_000_000;
  const orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierSolo = randomUUID(), dossierB = randomUUID();
  const config = { secret: "disposable-loans-test-secret-0000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  const profileId = randomUUID(), localAuth: LocalAuthConfig = { profileId, issuer: LOCAL_ISSUER_PREFIX + profileId, organizationId: orgA, ownerName: "Camille Martin (exemple)", ownerReview: "personal", simulationEnabled: false };
  type Session = { secret: string; csrf: string };
  let preparer: Session, reviewer: Session, selfReviewer: Session, other: Session, owner: Session;
  let run: WorkpaperRun, executed: WorkpaperRun, batches: ImportBatch[] = [];
  const pid = periodId(LOAN_PERIOD);
  const request = (s: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", key = randomUUID(), path = "/api/workpapers/emprunts") => new Request(config.appOrigin + path + "?dossierId=" + dossier + "&periodId=" + pid + extra, {
    method, headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, [CSRF_HEADER]: s.csrf, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  async function connect() {
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    sessions = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: sessions, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db), localAuth });
    http = loanHandlers(() => new LoanRuntime(db, authorizer, () => now), () => {}, e => { if (e instanceof Error) console.error("LOAN_RECIPE_ERROR", e.message.split("\n")[0], e.cause instanceof Error ? e.cause.message : ""); });
  }
  async function session(org: string, subject: string, roles: ProbantRole[], issuer = "https://idp.example.test") {
    const secret = newSessionSecret(), record = await sessions.create({ tokenSha256: sessionTokenDigest(secret), issuer, subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  const command = (body: LoanCommand, s = preparer, dossier = dossierA, key = randomUUID()) => http.POST(request(s, "POST", JSON.stringify(body), dossier, "", key));
  async function ok(body: LoanCommand, s = preparer, dossier = dossierA) { const r = await command(body, s, dossier); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  const target = (r = run) => ({ id: r.id, expectedVersion: r.version });
  async function importSource(type: string, file: File, s = preparer, dossier = dossierA) {
    const form = new FormData(); form.set("file", file); form.set("documentType", type); form.set("mapping", JSON.stringify(LOAN_MAPPING)); form.set("period", JSON.stringify(LOAN_PERIOD));
    const preview = await http.importsPOST(request(s, "POST", form, dossier)); expect(preview.status, await preview.clone().text()).toBe(200);
    const { batch } = await preview.json(), view = await (await http.GET(request(s, "GET", undefined, dossier))).json();
    const approved = await http.importsPOST(request(s, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: view.sourceHeads.find((h: { document_type: string }) => h.document_type === type)?.import_id ?? null }), dossier));
    expect(approved.status, await approved.clone().text()).toBe(200);
    return (await approved.json()).batch as ImportBatch;
  }
  async function importPack(scenario: LoanScenario, s = preparer, dossier = dossierA) {
    const out: ImportBatch[] = [];
    for (const [type, file] of Object.entries(loanFilesFromRows(loanFixtureRows(scenario)))) out.push(await importSource(type, file, s, dossier));
    return out;
  }
  const citation = (b = batches) => { const ledger = b.find(x => x.document.documentType === "loan_ledger")!; return { documentVersionId: ledger.document.id, rowId: ledger.rows[0].id }; };
  const exportVersion = (r: WorkpaperRun, s = preparer, dossier = dossierA) => http.exportPOST(request(s, "POST", JSON.stringify({ dossierId: dossier, periodId: pid, id: r.id, version: r.version, expectedHash: contentHash(r), format: "html" }), dossier));

  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    await connect(); await assertDisposableDatabase(client);
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Emprunts A'),(${orgB},'Emprunts B')`;
    for (const [id, org] of [[dossierA, orgA], [dossierSolo, orgA], [dossierB, orgB]]) await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${id},${org},${id})`;
    preparer = await session(orgA, "preparer-loans", ["preparer"]);
    reviewer = await session(orgA, "reviewer-loans", ["reviewer"]);
    selfReviewer = await session(orgA, "preparer-loans", ["preparer", "reviewer"]);
    other = await session(orgB, "other-loans", ["reviewer"]);
    owner = await session(orgA, LOCAL_OWNER_SUBJECT, [], localAuth.issuer);
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });

  it("imports approuvés → population → exécution : recette C13, résidu de 10 000 et taux absent, notes à leur seul montant", async () => {
    run = await ok({ command: "create_loans", period: LOAN_PERIOD, instanceKey: "c13-loans" });
    batches = await importPack("complete");
    expect(batches).toHaveLength(8);
    expect((await command({ command: "freeze_loans", ...target(), criteria: "Partiel", importIds: batches.slice(1).map(b => b.id) })).status).toBe(422);
    run = await ok({ command: "freeze_loans", ...target(), criteria: "Tous les contrats et échéances de l’exercice, y compris remboursés", importIds: batches.map(b => b.id) });
    expect(run.population!.unit).toBe("loan_contract_due");
    const frozenVersion = run.version;
    run = await ok({ command: "execute", ...target() });
    const result = run.result!.result as LoanResult;
    expect(run.state).toBe("executed");
    // Generated points land in one version: the calculation, then all its notes (never one version per point).
    expect(run.notes).toHaveLength(10);
    expect(run.version).toBe(frozenVersion + 2);
    executed = run;
    expect(result.rows.find(r => r.id === "C13-SIMPLE")!.dues[0].calculatedInterest.amount).toEqual({ kind: "known", value: { amount: "250.00", currency: "EUR" } });
    expect(result.rows.find(r => r.id === "C13-ATLAS")!.residual).toEqual({ kind: "known", value: { amount: "10000.00", currency: "EUR" } });
    expect(result.rows.find(r => r.id === "C13-VARIABLE")!.accrued.status).toBe("blocked");
    expect(result.framing.rows.find(r => r.account === "168100")!.difference).toEqual({ kind: "known", value: { amount: "15000.00", currency: "EUR" } });
    expect(result.outcome).toBe("inconclusive");
    expect(result.work.authorId).toBe("preparer-loans");
    expect(run.notes.filter(n => n.amount.kind === "known" && n.amount.value.amount === "10000.00").map(n => n.text)).toEqual([expect.stringMatching(/^Résidu de principal/)]);
    const read = await (await http.GET(request(preparer))).json();
    expect(read.facts[run.id]).toHaveLength(result.evidence.length);
    expect(read.sourcesCurrent[run.id]).toBe(true);
  }, 60000);

  it("autorité serveur, périmètre, citations, idempotence et concurrence", async () => {
    const body: LoanCommand = { command: "conclude", ...target(), text: "Résidu de 10 000 à expliquer ; inconnus maintenus", citation: citation() }, key = randomUUID();
    const first = await command(body, preparer, dossierA, key), again = await command(body, preparer, dossierA, key);
    expect(first.status).toBe(200); expect(await again.json()).toEqual(await first.clone().json()); run = (await first.json()).run;
    expect((await command({ ...body, text: "Autre contenu" }, preparer, dossierA, key)).status).toBe(409);
    expect((await http.GET(request(other))).status).toBe(403);
    expect((await http.GET(request(preparer, "GET", undefined, dossierB))).status).toBe(403);
    expect((await command({ ...body, ...target(), citation: { ...citation(), rowId: "ligne-ancienne" } })).status).toBe(422);
    const raced = await Promise.all(["A", "B"].map(text => command({ ...body, ...target(), text })));
    expect(raced.map(r => r.status).sort()).toEqual([200, 409]);
    run = (await raced.find(r => r.status === 200)!.json()).run;
  }, 30000);

  it("relecture distincte : auto-revue OIDC refusée, verrouillage, export protégé et CSRF", async () => {
    for (const n of run.notes) run = await ok({ command: "resolve", ...target(), noteId: n.id, text: "Point documenté ; réserve maintenue", citation: citation() });
    run = await ok({ command: "conclude", ...target(), text: "Résidu expliqué au niveau des pièces ; taux absent et contrat inconnu non concluants", citation: citation() });
    run = await ok({ command: "submit", ...target() });
    const decision: LoanCommand = { command: "review", ...target(), decision: "approved", text: "Travaux relus ; réserves maintenues", submittedHash: run.submittedHash!, citation: citation() };
    expect((await command(decision, selfReviewer)).status).toBe(403);
    run = await ok(decision, reviewer);
    expect(run.approval).toMatchObject({ actorId: "reviewer-loans" });
    run = await ok({ command: "lock", ...target() }, reviewer);
    expect(run.state).toBe("locked");
    const exported = await exportVersion(run);
    expect(exported.status, await exported.clone().text()).toBe(200);
    const html = await exported.text();
    expect(html).toContain("Résidu de principal à expliquer"); expect(html).toContain("Relecture par une autre identité"); expect(html).toContain("Aucun ratio calculé ; aucune conformité de financement déduite.");
    expect((await exportVersion(run, other)).status).toBe(403);
    const noCsrf = request(preparer, "POST", JSON.stringify({ dossierId: dossierA, periodId: pid, id: run.id, version: run.version, expectedHash: contentHash(run), format: "html" }), dossierA, "", randomUUID(), "/api/workpapers/emprunts/export");
    noCsrf.headers.delete(CSRF_HEADER);
    expect((await http.exportPOST(noCsrf)).status).toBe(403);
  }, 60000);

  it("échéancier modifié : la version verrouillée devient périmée, la révision repart des sources courantes, l’ancienne version et ses preuves restent", async () => {
    const locked = structuredClone(run);
    await client.end(); await connect();
    expect((await (await http.GET(request(preparer))).json()).runs.find((r: WorkpaperRun) => r.id === locked.id)).toEqual(locked);
    const rows = loanFixtureRows("complete");
    rows.loan_schedule.find(r => r.key === "C13-ATLAS-E20261001")!.details.contractVersion = "1";
    await importSource("loan_schedule", loanFilesFromRows(rows).loan_schedule);
    const stale = await (await http.GET(request(preparer))).json();
    expect(stale.sourcesCurrent[locked.id]).toBe(false);
    // The stale version stays exportable from its own frozen sources, labelled stale; an earlier version of it too.
    const staleExport = await exportVersion(locked);
    expect(staleExport.status, await staleExport.clone().text()).toBe(200);
    const staleHtml = await staleExport.text();
    expect(staleHtml).toContain("Feuille périmée : une source Emprunts a été remplacée ou ajoutée depuis le gel");
    expect(staleHtml).toContain("Résidu de principal à expliquer");
    const earlier = await exportVersion(executed);
    expect(earlier.status, await earlier.clone().text()).toBe(200);
    expect(await earlier.text()).toContain("Version antérieure : la version courante de cette feuille est la " + locked.version);
    expect((await http.exportPOST(request(preparer, "POST", JSON.stringify({ dossierId: dossierA, periodId: pid, id: locked.id, version: executed.version, expectedHash: contentHash(locked), format: "html" }), dossierA))).status).toBe(409);
    expect((await http.exportPOST(request(preparer, "POST", JSON.stringify({ dossierId: dossierA, periodId: pid, id: locked.id, version: 9999, expectedHash: contentHash(locked), format: "html" }), dossierA))).status).toBe(404);
    expect((await command({ command: "conclude", ...target(locked), text: "x", citation: citation() })).status).toBe(409);
    run = await ok({ command: "revise", ...target(locked) });
    expect(run).toMatchObject({ revision: 2, state: "draft", supersedes: locked.id, previousLockedId: locked.id });
    expect(await (await exportVersion(locked)).text()).toContain("Révision remplacée : une révision plus récente de cette feuille existe");
    expect(run.loanWork).toBeUndefined(); expect(run.result).toBeUndefined(); expect(run.approval).toBeUndefined();
    const heads = (await (await http.GET(request(preparer))).json()).sourceHeads as { import_id: string }[];
    run = await ok({ command: "freeze_loans", ...target(), criteria: "Révision sur l’échéancier modifié", importIds: heads.map(h => h.import_id) });
    run = await ok({ command: "execute", ...target() });
    const atlas = (run.result!.result as LoanResult).rows.find(r => r.id === "C13-ATLAS")!;
    expect(atlas.dues.find(d => d.dueDate === "2026-10-01")!.issues.map(i => i.code)).toContain("schedule_version");
    const oldResponse = await http.GET(request(preparer, "GET", undefined, dossierA, "&operation=version&id=" + encodeURIComponent(locked.id) + "&version=" + locked.version));
    expect(oldResponse.status, await oldResponse.clone().text()).toBe(200);
    const old = await oldResponse.json();
    expect(old.runs[0]).toEqual(locked);
    expect(old.facts[locked.id].length).toBeGreaterThan(0);
  }, 60000);

  it("C07 : relecture personnelle nommée du profil local — préparer, relire soi-même, verrouiller, exporter", async () => {
    let solo = await ok({ command: "create_loans", period: LOAN_PERIOD, instanceKey: "c13-solo" }, owner, dossierSolo);
    const pack = await importPack("simple", owner, dossierSolo);
    solo = await ok({ command: "freeze_loans", ...target(solo), criteria: "Recette simple C13", importIds: pack.map(b => b.id) }, owner, dossierSolo);
    solo = await ok({ command: "execute", ...target(solo) }, owner, dossierSolo);
    expect(solo.result!.outcome).toBe("no_exception_detected");
    expect(solo.notes).toEqual([]);
    solo = await ok({ command: "conclude", ...target(solo), text: "Recette simple : 90 000 et 250 concordants sur les sources fournies.", citation: citation(pack) }, owner, dossierSolo);
    solo = await ok({ command: "submit", ...target(solo) }, owner, dossierSolo);
    const view = await (await http.GET(request(owner, "GET", undefined, dossierSolo))).json();
    expect(view).toMatchObject({ actorId: LOCAL_OWNER_SUBJECT, reviewKind: "personal" });
    solo = await ok({ command: "review", ...target(solo), decision: "approved", text: "Relecture personnelle des liens et du calcul.", submittedHash: solo.submittedHash!, citation: citation(pack) }, owner, dossierSolo);
    expect(solo.approval).toMatchObject({ actorId: LOCAL_OWNER_SUBJECT, kind: "personal", reviewerName: "Camille Martin (exemple)" });
    solo = await ok({ command: "lock", ...target(solo) }, owner, dossierSolo);
    const exported = await exportVersion(solo, owner, dossierSolo);
    expect(exported.status, await exported.clone().text()).toBe(200);
    expect(await exported.text()).toContain("Relecture personnelle nommée · Camille Martin (exemple)");
  }, 60000);

  it("migration 0020 : le retour arrière est refusé tant que des sources ou feuilles Emprunts existent", async () => {
    const down = readFileSync("drizzle/0020_loans_review.down.sql", "utf8"), guard = down.slice(down.indexOf("DO $$"), down.indexOf("END $$;") + "END $$;".length);
    await expect(client.unsafe(guard)).rejects.toThrow(/LOAN_ROLLBACK_DATA_PRESENT/);
    const [{ types }] = await client`SELECT count(DISTINCT document_type)::int AS types FROM clients_imports WHERE document_type LIKE 'loan%'`;
    expect(types).toBe(8);
  });
});

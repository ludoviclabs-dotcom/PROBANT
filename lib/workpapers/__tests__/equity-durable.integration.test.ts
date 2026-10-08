import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { RequestAuthorizer } from "@/lib/auth/authorize";
import { DrizzleDossierOwnershipReader } from "@/lib/auth/dossier-scope";
import { DrizzleSessionStore } from "@/lib/auth/session/store";
import { csrfTokenFor, newSessionSecret, sessionTokenDigest, SESSION_COOKIE, CSRF_HEADER } from "@/lib/auth/session/cookie";
import type { ProbantRole } from "@/lib/auth/roles";
import { EquityRuntime } from "../equity-runtime";
import { equityHandlers } from "../equity-http";
import { PostgresEquityDatabase } from "../equity-store";
import type { EquityCommand } from "../equity-commands";
import type { EquityResult } from "../equity-review";
import type { EquityTabularType } from "../equity-sources";
import { periodId, type WorkpaperRun } from "../model";
import { EQ_CSV, EQ_MINUTES, EQ_TABULAR_ORDER, eqDraft, eqMapping, eqPeriod, minutesPdf } from "./equity-fixtures";

/** Disposable PostgreSQL recipe (CI service or local *_ci / *_test database); skipped, never simulated, without it. */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Capitaux propres — PostgreSQL jetable, sessions serveur et append-only", () => {
  let client: ReturnType<typeof postgres>, handlers: ReturnType<typeof equityHandlers>, store: DrizzleSessionStore;
  const now = 1_800_000_000, orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierB = randomUUID();
  const config = { secret: "disposable-equity-test-secret-0000000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  type Session = { secret: string; csrf: string };
  let preparer: Session, reviewer: Session, other: Session, run: WorkpaperRun;
  const url = (dossier = dossierA, extra = "") => config.appOrigin + "/api/workpapers/capitaux-propres?dossierId=" + dossier + "&periodId=" + periodId(eqPeriod) + extra;
  const request = (s: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", csrf = true) => new Request(url(dossier, extra), { method, body,
    headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, ...(csrf ? { [CSRF_HEADER]: s.csrf } : {}), "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) } });
  function connect() {
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    store = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: store, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
    handlers = equityHandlers(() => new EquityRuntime(new PostgresEquityDatabase(db), authorizer, () => now), () => {});
  }
  async function session(org: string, subject: string, roles: ProbantRole[]) {
    const secret = newSessionSecret(), record = await store.create({ tokenSha256: sessionTokenDigest(secret), issuer: "https://idp.example.test", subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  async function success(body: EquityCommand, s = preparer) { const r = await handlers.POST(request(s, "POST", JSON.stringify(body))); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  async function importSource(type: EquityTabularType | typeof EQ_MINUTES[number]) {
    const form = new FormData(), pv = typeof type !== "string";
    if (pv) { form.set("file", new File([new Uint8Array(await minutesPdf(type.title, type.pages))], type.pieceRef + ".pdf", { type: "application/pdf" })); form.set("minutes", JSON.stringify({ pieceRef: type.pieceRef, title: type.title, documentDate: type.documentDate })); form.set("documentType", "eq_minutes"); }
    else { form.set("file", new File([EQ_CSV[type]], type + ".csv", { type: "text/csv" })); form.set("mapping", JSON.stringify(eqMapping(type))); form.set("documentType", type); }
    form.set("period", JSON.stringify(eqPeriod));
    const previewed = await handlers.importsPOST(request(preparer, "POST", form)); expect(previewed.status, await previewed.clone().text()).toBe(200);
    const { batch } = await previewed.json(), heads = (await (await handlers.GET(request(preparer))).json()).sourceHeads as { document_type: string; import_id: string }[];
    const approved = await handlers.importsPOST(request(preparer, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(h => h.document_type === batch.document.logicalId)?.import_id ?? null })));
    expect(approved.status, await approved.clone().text()).toBe(200); return (await approved.json()).batch.id as string;
  }
  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    connect();
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Capitaux propres A'),(${orgB},'Capitaux propres B')`;
    await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${dossierA},${orgA},${dossierA}),(${dossierB},${orgB},${dossierB})`;
    preparer = await session(orgA, "eq-preparer", ["preparer"]); reviewer = await session(orgA, "eq-reviewer", ["reviewer"]); other = await session(orgB, "eq-other", ["preparer", "reviewer"]);
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });
  it("persiste sources (PV compris), population, lectures, calcul, décision citée, revue distincte et verrouillage", async () => {
    const ids: string[] = [];
    for (const type of EQ_TABULAR_ORDER) ids.push(await importSource(type));
    for (const m of EQ_MINUTES) ids.push(await importSource(m));
    run = await success({ command: "create", period: eqPeriod });
    run = await success({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: ids, draft: eqDraft() });
    run = await success({ command: "execute", id: run.id, expectedVersion: run.version });
    expect((run.result!.result as EquityResult).decisions!.find(d => d.lineId === "D1-DIV")).toMatchObject({ status: "amount_divergent", difference: { kind: "known", value: { amount: "5.00" } } });
    const pv = (await (await handlers.GET(request(preparer))).json()).imports.find((b: { document: { logicalId: string } }) => b.document.logicalId === "eq_minutes:PV-AGO-2024").document.id as string;
    for (const n of run.notes.filter(x => x.blocking)) run = await success({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Traitement documenté (recette jetable).", citation: { documentId: pv, page: 3 } });
    run = await success({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Décisions rapprochées ; écarts documentés ; aucune conclusion juridique." });
    run = await success({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await success({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue distincte." }, reviewer);
    run = await success({ command: "lock", id: run.id, expectedVersion: run.version }, reviewer);
    expect(run).toMatchObject({ state: "locked", preparedBy: "eq-preparer", approval: { actorId: "eq-reviewer" } });
  });
  it("refuse accès inter-organisation, CSRF absent et réécriture des versions", async () => {
    expect((await handlers.GET(request(other))).status).toBe(403);
    expect((await handlers.POST(request(preparer, "POST", JSON.stringify({ command: "create", period: eqPeriod }), dossierA, "", false))).status).toBe(403);
    await expect(client`UPDATE eq_workpaper_versions SET run = run WHERE id = ${run.id}`).rejects.toThrow(/EQ_APPEND_ONLY/);
    await expect(client`DELETE FROM eq_imports WHERE dossier_id = ${dossierA}`).rejects.toThrow(/EQ_APPEND_ONLY/);
  });
  it("reprend l’état après une nouvelle connexion et un nouveau runtime", async () => {
    await client.end(); connect();
    const view = await (await handlers.GET(request(preparer))).json();
    expect(view.runs[0]).toMatchObject({ id: run.id, version: run.version, state: "locked" });
    const mission = (await (await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=mission"))).json()).mission;
    expect(mission.counters).toMatchObject({ executed: 1, reviewed: 1, locked: 1, exceptions: 7, uncertainties: 2 });
  });
});

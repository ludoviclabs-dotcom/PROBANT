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
import { FixedAssetRuntime } from "../fixed-asset-runtime";
import { fixedAssetHandlers } from "../fixed-asset-http";
import { PostgresFixedAssetDatabase } from "../fixed-asset-store";
import type { FixedAssetCommand } from "../fixed-asset-commands";
import type { FixedAssetResult } from "../fixed-asset-review";
import type { FixedAssetSourceType } from "../fixed-asset-sources";
import { periodId, type WorkpaperRun } from "../model";
import { FA_CSV, FA_TYPE_ORDER, faDraft, faMapping, faPeriod } from "./fixed-asset-fixtures";

/** Disposable PostgreSQL recipe (CI service or local *_ci / *_test database); skipped, never simulated, without it. */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Immobilisations — PostgreSQL jetable, sessions serveur et append-only", () => {
  let client: ReturnType<typeof postgres>, handlers: ReturnType<typeof fixedAssetHandlers>, store: DrizzleSessionStore;
  const now = 1_800_000_000, orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierB = randomUUID();
  const config = { secret: "disposable-fixed-assets-test-secret-000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  type Session = { secret: string; csrf: string };
  let preparer: Session, reviewer: Session, other: Session, run: WorkpaperRun;
  const url = (dossier = dossierA, extra = "") => config.appOrigin + "/api/workpapers/immobilisations?dossierId=" + dossier + "&periodId=" + periodId(faPeriod) + extra;
  const request = (s: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", csrf = true) => new Request(url(dossier, extra), { method, body,
    headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, ...(csrf ? { [CSRF_HEADER]: s.csrf } : {}), "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) } });
  function connect() {
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    store = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: store, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
    handlers = fixedAssetHandlers(() => new FixedAssetRuntime(new PostgresFixedAssetDatabase(db), authorizer, () => now), () => {});
  }
  async function session(org: string, subject: string, roles: ProbantRole[]) {
    const secret = newSessionSecret(), record = await store.create({ tokenSha256: sessionTokenDigest(secret), issuer: "https://idp.example.test", subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  async function success(body: FixedAssetCommand, s = preparer) { const r = await handlers.POST(request(s, "POST", JSON.stringify(body))); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  async function importSource(type: FixedAssetSourceType) {
    const form = new FormData(); form.set("file", new File([FA_CSV[type]], type + ".csv", { type: "text/csv" })); form.set("mapping", JSON.stringify(faMapping(type))); form.set("period", JSON.stringify(faPeriod)); form.set("documentType", type);
    const previewed = await handlers.importsPOST(request(preparer, "POST", form)); expect(previewed.status, await previewed.clone().text()).toBe(200);
    const { batch } = await previewed.json(), heads = (await (await handlers.GET(request(preparer))).json()).sourceHeads as { document_type: string; import_id: string }[];
    const approved = await handlers.importsPOST(request(preparer, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(h => h.document_type === type)?.import_id ?? null })));
    expect(approved.status, await approved.clone().text()).toBe(200); return (await approved.json()).batch.id as string;
  }
  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    connect();
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Immobilisations A'),(${orgB},'Immobilisations B')`;
    await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${dossierA},${orgA},${dossierA}),(${dossierB},${orgB},${dossierB})`;
    preparer = await session(orgA, "fa-preparer", ["preparer"]); reviewer = await session(orgA, "fa-reviewer", ["reviewer"]); other = await session(orgB, "fa-other", ["preparer", "reviewer"]);
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });
  it("persiste sources, population, calcul, explication de l’écart, revue distincte et verrouillage", async () => {
    const ids: string[] = [];
    for (const type of FA_TYPE_ORDER) ids.push(await importSource(type));
    run = await success({ command: "create", period: faPeriod });
    run = await success({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: ids, draft: faDraft() });
    run = await success({ command: "execute", id: run.id, expectedVersion: run.version });
    expect((run.result!.result as FixedAssetResult).units.find(u => u.unitId === "A-001")!.tables.gross).toMatchObject({ status: "computed", difference: { kind: "known", value: { amount: "-1.00" } } });
    for (const n of run.notes.filter(x => x.blocking)) run = await success({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Traitement documenté (recette jetable)." });
    run = await success({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Ponts calculés, écart −1 expliqué, recalcul partiel." });
    run = await success({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await success({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue distincte." }, reviewer);
    run = await success({ command: "lock", id: run.id, expectedVersion: run.version }, reviewer);
    expect(run).toMatchObject({ state: "locked", preparedBy: "fa-preparer", approval: { actorId: "fa-reviewer" } });
  });
  it("refuse accès inter-organisation, CSRF absent et réécriture des versions", async () => {
    expect((await handlers.GET(request(other))).status).toBe(403);
    expect((await handlers.POST(request(preparer, "POST", JSON.stringify({ command: "create", period: faPeriod }), dossierA, "", false))).status).toBe(403);
    await expect(client`UPDATE fa_workpaper_versions SET run = run WHERE id = ${run.id}`).rejects.toThrow(/FA_APPEND_ONLY/);
    await expect(client`DELETE FROM fa_imports WHERE dossier_id = ${dossierA}`).rejects.toThrow(/FA_APPEND_ONLY/);
  });
  it("reprend l’état après une nouvelle connexion et un nouveau runtime", async () => {
    await client.end(); connect();
    const view = await (await handlers.GET(request(preparer))).json();
    expect(view.runs[0]).toMatchObject({ id: run.id, version: run.version, state: "locked" });
    const mission = (await (await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=mission"))).json()).mission;
    expect(mission.counters).toMatchObject({ executed: 1, reviewed: 1, locked: 1, exceptions: 1, uncertainties: 2 });
  });
});

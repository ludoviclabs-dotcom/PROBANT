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
import { StockRuntime } from "../stock-runtime";
import { stockHandlers } from "../stock-http";
import { PostgresStockDatabase } from "../stock-store";
import type { StockCommand } from "../stock-commands";
import type { StockResult } from "../stock-contract";
import type { StockSourceType } from "../stock-sources";
import { periodId, type WorkpaperRun } from "../model";
import { COUNT_ROWS, countCsv, ST_CSV, stMapping, stPeriod } from "./stock-fixtures";

/** Disposable PostgreSQL recipe (CI service or local *_ci / *_test database); skipped, never simulated, without it. */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Stocks — PostgreSQL jetable, sessions serveur et append-only", () => {
  let client: ReturnType<typeof postgres>, handlers: ReturnType<typeof stockHandlers>, store: DrizzleSessionStore;
  const now = 1_801_500_000, orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierB = randomUUID();
  const config = { secret: "disposable-stocks-test-secret-0000000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  type Session = { secret: string; csrf: string };
  let preparer: Session, reviewer: Session, other: Session, run: WorkpaperRun;
  const ids: Partial<Record<StockSourceType, string>> = {};
  const url = (dossier = dossierA, extra = "") => config.appOrigin + "/api/workpapers/stocks?dossierId=" + dossier + "&periodId=" + periodId(stPeriod) + extra;
  const request = (s: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", csrf = true) => new Request(url(dossier, extra), { method, body,
    headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, ...(csrf ? { [CSRF_HEADER]: s.csrf } : {}), "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) } });
  function connect() {
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    store = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: store, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
    handlers = stockHandlers(() => new StockRuntime(new PostgresStockDatabase(db), authorizer, () => now), () => {},
      error => { if (error instanceof Error) console.error("STOCK_RECIPE_ERROR", error.name, error.message.split("\n")[0], error.cause instanceof Error ? error.cause.message : ""); });
  }
  async function session(org: string, subject: string, roles: ProbantRole[]) {
    const secret = newSessionSecret(), record = await store.create({ tokenSha256: sessionTokenDigest(secret), issuer: "https://idp.example.test", subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  const read = async () => (await handlers.GET(request(preparer))).json();
  async function success(body: StockCommand, s = preparer) { const r = await handlers.POST(request(s, "POST", JSON.stringify(body))); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  async function importSource(type: StockSourceType, text = ST_CSV[type]) {
    const form = new FormData();
    form.set("file", new File([text], type + ".csv", { type: "text/csv" })); form.set("period", JSON.stringify(stPeriod)); form.set("documentType", type); form.set("mapping", JSON.stringify(stMapping(type)));
    const previewed = await handlers.importsPOST(request(preparer, "POST", form)); expect(previewed.status, await previewed.clone().text()).toBe(200);
    const { batch } = await previewed.json(), heads = (await read()).sourceHeads as { document_type: string; import_id: string }[];
    const approved = await handlers.importsPOST(request(preparer, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(h => h.document_type === type)?.import_id ?? null })));
    expect(approved.status, await approved.clone().text()).toBe(200); return (await approved.json()).batch as { id: string; document: { id: string }; rows: { id: string; original: Record<string, string> }[] };
  }
  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    connect();
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Stocks A'),(${orgB},'Stocks B')`;
    await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${dossierA},${orgA},${dossierA}),(${dossierB},${orgB},${dossierB})`;
    preparer = await session(orgA, "st-preparer", ["preparer"]); reviewer = await session(orgA, "st-reviewer", ["reviewer"]); other = await session(orgB, "st-other", ["preparer", "reviewer"]);
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });
  it("persiste comptages, théorique, mouvements et pièces ; population figée ; calcul ; décisions citées ; revue distincte et verrouillage", async () => {
    let support: Awaited<ReturnType<typeof importSource>> | undefined;
    for (const type of ["st_count", "st_system", "st_movements", "st_support"] as StockSourceType[]) { const b = await importSource(type); ids[type] = b.id; if (type === "st_support") support = b; }
    run = await success({ command: "create", period: stPeriod });
    expect([...(await read()).expectedSources].sort()).toEqual(Object.values(ids).sort());
    const row = (piece: string) => ({ documentId: support!.document.id, rowId: support!.rows.find(r => r.original.Piece === piece)!.id });
    run = await success({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids) as string[], draft: { sameDay: "before_count", instructions: row("INSTR-INV") } });
    expect(run.selection!.selectedIds).toHaveLength(9);
    run = await success({ command: "execute", id: run.id, expectedVersion: run.version });
    expect((run.result!.result as StockResult).units.find(u => u.unitId === "REF-A|ENTREPOT-NORD|L1")).toMatchObject({ difference: "-200" });
    expect(run.notes).toHaveLength(9);
    for (const n of run.notes.filter(x => x.blocking)) run = await success({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Expliqué (recette jetable).", citation: row("FC-01") });
    run = await success({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Quantités rapprochées ; écarts expliqués ; aucune valeur établie ; présence physique non certifiée." });
    run = await success({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await success({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue distincte." }, reviewer);
    run = await success({ command: "lock", id: run.id, expectedVersion: run.version }, reviewer);
    expect(run).toMatchObject({ state: "locked", preparedBy: "st-preparer", approval: { actorId: "st-reviewer" } });
  });
  it("refuse accès inter-organisation, CSRF absent et réécriture des versions", async () => {
    expect((await handlers.GET(request(other))).status).toBe(403);
    expect((await handlers.POST(request(preparer, "POST", JSON.stringify({ command: "create", period: stPeriod }), dossierA, "", false))).status).toBe(403);
    await expect(client`UPDATE st_workpaper_versions SET run = run WHERE id = ${run.id}`).rejects.toThrow(/ST_APPEND_ONLY/);
    await expect(client`DELETE FROM st_imports WHERE dossier_id = ${dossierA}`).rejects.toThrow(/ST_APPEND_ONLY/);
    await expect(client`INSERT INTO st_source_heads (organization_id,dossier_id,period_id,document_type,import_id) VALUES (${orgA},${dossierA},${periodId(stPeriod)},'st_inventaire',${ids.st_count!})`).rejects.toThrow();
  });
  it("reprend l’état après une nouvelle connexion ; une feuille de comptage remplacée rend la feuille périmée sans effacer la version utilisée", async () => {
    await client.end(); connect();
    const view = await read();
    expect(view.runs[0]).toMatchObject({ id: run.id, version: run.version, state: "locked" });
    expect(view.sourcesCurrent[run.id]).toBe(true);
    await importSource("st_count", countCsv(COUNT_ROWS.map(r => r[0] === "C001" ? [...r.slice(0, 5), "100", ...r.slice(6)] : r)));
    const after = await read();
    expect(after.sourcesCurrent[run.id]).toBe(false);
    expect(after.versions.st_count).toHaveLength(2);
    const revised = await success({ command: "revise", id: run.id, expectedVersion: run.version });
    expect(revised).toMatchObject({ revision: 2, state: "draft", importIds: [] });
    // Sub-lot 2 sources are accepted by the widened constraints of migration 0015.
    await importSource("st_costs"); await importSource("st_ledger");
    expect(((await read()).sourceHeads as { document_type: string }[]).map(h => h.document_type).sort()).toEqual(["st_costs", "st_count", "st_ledger", "st_movements", "st_support", "st_system"]);
  });
});

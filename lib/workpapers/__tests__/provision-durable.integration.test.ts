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
import { ProvisionRuntime } from "../provision-runtime";
import { provisionHandlers } from "../provision-http";
import { PostgresProvisionDatabase } from "../provision-store";
import type { ProvisionCommand } from "../provision-commands";
import type { ProvisionResult } from "../provision-contract";
import type { ProvisionSourceType } from "../provision-sources";
import { periodId, type WorkpaperRun } from "../model";
import { ESTIMATE_ROWS, estimateCsv, PV_CSV, pvMapping, pvPeriod } from "./provision-fixtures";

/** Disposable PostgreSQL recipe (CI service or local *_ci / *_test database); skipped, never simulated, without it. */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Provisions — PostgreSQL jetable, sessions serveur, masquage et append-only", () => {
  let client: ReturnType<typeof postgres>, handlers: ReturnType<typeof provisionHandlers>, store: DrizzleSessionStore;
  const now = 1_801_500_000, orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierB = randomUUID();
  const config = { secret: "disposable-provisions-test-secret-00000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  type Session = { secret: string; csrf: string };
  let preparer: Session, reviewer: Session, other: Session, run: WorkpaperRun;
  const ids: Partial<Record<ProvisionSourceType, string>> = {};
  const url = (dossier = dossierA, extra = "") => config.appOrigin + "/api/workpapers/provisions?dossierId=" + dossier + "&periodId=" + periodId(pvPeriod) + extra;
  const request = (s: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", csrf = true) => new Request(url(dossier, extra), { method, body,
    headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, ...(csrf ? { [CSRF_HEADER]: s.csrf } : {}), "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) } });
  function connect() {
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    store = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: store, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
    // The recipe grants the confidential capability to the preparer only; the durable server grants it to nobody by default.
    handlers = provisionHandlers(() => new ProvisionRuntime(new PostgresProvisionDatabase(db), authorizer, () => now, identity => identity.subject === "pv-preparer"), () => {},
      error => { if (error instanceof Error) console.error("PROVISION_RECIPE_ERROR", error.name, error.message.split("\n")[0], error.cause instanceof Error ? error.cause.message : ""); });
  }
  async function session(org: string, subject: string, roles: ProbantRole[]) {
    const secret = newSessionSecret(), record = await store.create({ tokenSha256: sessionTokenDigest(secret), issuer: "https://idp.example.test", subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  const read = async (s = preparer) => (await handlers.GET(request(s))).json();
  async function success(body: ProvisionCommand, s = preparer) { const r = await handlers.POST(request(s, "POST", JSON.stringify(body))); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  async function importSource(type: ProvisionSourceType, text = PV_CSV[type]) {
    const form = new FormData();
    form.set("file", new File([text], type + ".csv", { type: "text/csv" })); form.set("period", JSON.stringify(pvPeriod)); form.set("documentType", type); form.set("mapping", JSON.stringify(pvMapping(type)));
    const previewed = await handlers.importsPOST(request(preparer, "POST", form)); expect(previewed.status, await previewed.clone().text()).toBe(200);
    const { batch } = await previewed.json(), heads = (await read()).sourceHeads as { document_type: string; import_id: string }[];
    const approved = await handlers.importsPOST(request(preparer, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(h => h.document_type === type)?.import_id ?? null })));
    expect(approved.status, await approved.clone().text()).toBe(200); return (await approved.json()).batch as { id: string; document: { id: string }; rows: { id: string; original: Record<string, string> }[] };
  }
  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    connect();
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Provisions A'),(${orgB},'Provisions B')`;
    await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${dossierA},${orgA},${dossierA}),(${dossierB},${orgB},${dossierB})`;
    preparer = await session(orgA, "pv-preparer", ["preparer"]); reviewer = await session(orgA, "pv-reviewer", ["reviewer"]); other = await session(orgB, "pv-other", ["preparer", "reviewer"]);
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });
  it("persiste les six sources ; population figée ; calcul ; différence +30 ; décisions citées ; revue distincte masquée et verrouillage", async () => {
    let support: Awaited<ReturnType<typeof importSource>> | undefined;
    for (const type of ["pv_register", "pv_movements", "pv_estimates", "pv_ledger", "pv_annex", "pv_support"] as ProvisionSourceType[]) { const b = await importSource(type); ids[type] = b.id; if (type === "pv_support") support = b; }
    run = await success({ command: "create", period: pvPeriod });
    expect([...(await read()).expectedSources].sort()).toEqual(Object.values(ids).sort());
    const row = (piece: string) => ({ documentId: support!.document.id, rowId: support!.rows.find(r => r.original.Piece === piece)!.id });
    run = await success({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids) as string[], draft: { lawyers: { status: "obtained", citation: row("LET-AVOCATS") } } });
    expect(run.selection!.selectedIds).toHaveLength(6);
    run = await success({ command: "execute", id: run.id, expectedVersion: run.version });
    expect((run.result!.result as ProvisionResult).events.find(e => e.eventId === "EV-01")).toMatchObject({ estimateDifferenceCents: "3000" });
    expect(run.notes).toHaveLength(4);
    for (const n of run.notes.filter(x => x.blocking)) run = await success({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Examiné (recette jetable).", citation: row("PV-COMITE-12") });
    run = await success({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Différences examinées ; aucune issue juridique déduite." });
    run = await success({ command: "submit", id: run.id, expectedVersion: run.version });
    const masked = JSON.stringify(await read(reviewer));
    expect(masked).not.toContain("Client Alpha");
    expect(masked).toContain("Masqué — habilitation confidentielle requise");
    run = await success({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue distincte." }, reviewer);
    run = await success({ command: "lock", id: run.id, expectedVersion: run.version }, reviewer);
    expect(run).toMatchObject({ state: "locked", preparedBy: "pv-preparer", approval: { actorId: "pv-reviewer" } });
  });
  it("refuse accès inter-organisation, CSRF absent, original confidentiel sans habilitation et réécriture des versions", async () => {
    expect((await handlers.GET(request(other))).status).toBe(403);
    expect((await handlers.POST(request(preparer, "POST", JSON.stringify({ command: "create", period: pvPeriod }), dossierA, "", false))).status).toBe(403);
    const registerDocument = ((await read()).imports as { id: string; document: { id: string } }[]).find(b => b.id === ids.pv_register)!.document.id;
    expect((await handlers.GET(request(reviewer, "GET", undefined, dossierA, "&operation=download&id=" + registerDocument))).status).toBe(403);
    await expect(client`UPDATE pv_workpaper_versions SET run = run WHERE id = ${run.id}`).rejects.toThrow(/PV_APPEND_ONLY/);
    await expect(client`DELETE FROM pv_imports WHERE dossier_id = ${dossierA}`).rejects.toThrow(/PV_APPEND_ONLY/);
    await expect(client`INSERT INTO pv_source_heads (organization_id,dossier_id,period_id,document_type,import_id) VALUES (${orgA},${dossierA},${periodId(pvPeriod)},'pv_contrats',${ids.pv_register!})`).rejects.toThrow();
  });
  it("reprend l’état après une nouvelle connexion ; une estimation remplacée rend la feuille périmée sans effacer la version utilisée", async () => {
    await client.end(); connect();
    const view = await read();
    expect(view.runs[0]).toMatchObject({ id: run.id, version: run.version, state: "locked" });
    expect(view.sourcesCurrent[run.id]).toBe(true);
    await importSource("pv_estimates", estimateCsv(ESTIMATE_ROWS.map(e => e[0] === "E02" ? e.map((c, i) => i === 1 ? "50,00" : c) : e)));
    const after = await read();
    expect(after.sourcesCurrent[run.id]).toBe(false);
    expect(after.versions.pv_estimates).toHaveLength(2);
    const revised = await success({ command: "revise", id: run.id, expectedVersion: run.version });
    expect(revised).toMatchObject({ revision: 2, state: "draft", importIds: [] });
  });
});

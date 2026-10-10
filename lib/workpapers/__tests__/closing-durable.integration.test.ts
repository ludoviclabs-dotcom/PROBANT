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
import { ClosingRuntime } from "../closing-runtime";
import { closingHandlers } from "../closing-http";
import { PostgresClosingDatabase } from "../closing-store";
import { periodId, WORKPAPER_SCHEMA_VERSION, type WorkpaperRun } from "../model";
import { pvPeriod } from "./provision-fixtures";

/** Disposable PostgreSQL recipe (CI service or local *_ci / *_test database); skipped, never simulated, without it. */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Dossier de clôture — PostgreSQL jetable, sessions serveur, journal append-only, lecture des feuilles de cycle", () => {
  let client: ReturnType<typeof postgres>, handlers: ReturnType<typeof closingHandlers>, store: DrizzleSessionStore;
  const now = 1_801_600_000, orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierB = randomUUID(), pid = periodId(pvPeriod);
  const config = { secret: "disposable-closing-test-secret-000000000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  type Session = { secret: string; csrf: string };
  let preparer: Session, reviewer: Session, signer: Session, other: Session;
  const url = (path = "", dossier = dossierA, extra = "") => config.appOrigin + "/api/workpapers/closing" + path + "?dossierId=" + dossier + "&periodId=" + pid + extra;
  const request = (s: Session, method = "GET", body?: BodyInit, path = "", extra = "", csrf = true, dossier = dossierA) => new Request(url(path, dossier, extra), { method, body,
    headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, ...(csrf ? { [CSRF_HEADER]: s.csrf } : {}), "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) } });
  function connect() {
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    store = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: store, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
    // The recipe grants the closing authority to one synthetic signer; the durable server grants it to nobody by default.
    handlers = closingHandlers(() => new ClosingRuntime(new PostgresClosingDatabase(db), authorizer, () => now, identity => identity.subject === "cl-signer"), () => {},
      error => { if (error instanceof Error) console.error("CLOSING_RECIPE_ERROR", error.name, error.message.split("\n")[0], error.cause instanceof Error ? error.cause.message : ""); });
  }
  async function session(org: string, subject: string, roles: ProbantRole[]) {
    const secret = newSessionSecret(), record = await store.create({ tokenSha256: sessionTokenDigest(secret), issuer: "https://idp.example.test", subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  const read = async (s = preparer) => (await handlers.GET(request(s))).json();
  async function send(body: Record<string, unknown>, s = preparer) {
    const seq = body.expectedSeq ?? (await read(s)).seq;
    return handlers.POST(request(s, "POST", JSON.stringify({ ...body, expectedSeq: seq })));
  }
  async function ok(body: Record<string, unknown>, s = preparer) { const r = await send(body, s); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).view; }
  async function piece(label: string, content: string) {
    const form = new FormData();
    form.set("file", new File([content], "piece.txt", { type: "text/plain" })); form.set("meta", JSON.stringify({ expectedSeq: (await read()).seq, label, kind: "document" }));
    const r = await handlers.piecesPOST(request(preparer, "POST", form, "/pieces")); expect(r.status, await r.clone().text()).toBe(200);
    return (await r.json()).view.pieces.at(-1).pieceVersionId as string;
  }
  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    connect();
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Clôture A'),(${orgB},'Clôture B')`;
    await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${dossierA},${orgA},${dossierA}),(${dossierB},${orgB},${dossierB})`;
    preparer = await session(orgA, "cl-preparer", ["preparer"]); reviewer = await session(orgA, "cl-reviewer", ["reviewer"]); signer = await session(orgA, "cl-signer", ["signer"]);
    other = await session(orgB, "cl-other", ["preparer", "reviewer", "signer"]);
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });
  it("journal persistant : programme, pièce, travail cité, conclusion, revue distincte ; feuille Provisions lue dans pv_* ; validation par le professionnel habilité", async () => {
    await ok({ command: "open", period: pvPeriod, entity: "EPSILON SAS (synthétique)" });
    await ok({ command: "set_risk", riskId: "R-01", cycle: "tresorerie", label: "Soldes bancaires", assertions: ["solde_existence"], assessment: { level: "faible", rationale: "Un compte." } });
    await ok({ command: "set_procedure", procedureId: "P-01", riskIds: ["R-01"], assertions: ["solde_existence"], nature: "confirmation", label: "Confirmation bancaire", owner: "Collaborateur A" });
    const bank = await piece("Réponse de la banque (synthétique)", "Réponse synthétique de la banque\n");
    await ok({ command: "set_population", procedureId: "P-01", population: { status: "defined", description: "Compte B1", size: 1, citations: [] } });
    await ok({ command: "record_work", procedureId: "P-01", step: "execution", performedOn: "2027-01-10", object: "Compte B1", done: "Rapprochement de la réponse", itemsExamined: 1, result: "sans_exception", citations: [{ pieceVersionId: bank }] });
    await ok({ command: "conclude_procedure", procedureId: "P-01", text: "Solde confirmé.", citations: [] });
    let view = await ok({ command: "review_procedure", procedureId: "P-01", decision: "approved", text: "Revue distincte." }, reviewer);
    expect(view.evaluation.procedures[0]).toMatchObject({ status: "revue", review: { by: "cl-reviewer" }, records: [{ by: "cl-preparer", citations: [{ pieceVersionId: bank, version: 1 }] }] });
    // A synthetic provisions sheet head, written as its own cycle would store it: the file only reads it through the seven family tables.
    const run: WorkpaperRun = { id: "pv-durable-1", rootId: "pv-durable-1", revision: 1, version: 1, schemaVersion: WORKPAPER_SCHEMA_VERSION, scope: { organizationId: orgA, dossierId: dossierA, periodId: pid, mode: "real" },
      period: pvPeriod, template: { id: "provisions.register", version: "1.0.0", objective: "Registre synthétique", kind: "calculated", assertions: [], requiredDocumentTypes: [] }, state: "draft", preparedBy: "cl-preparer",
      importIds: [], evidence: [], findings: [], notes: [], events: [] };
    await client`INSERT INTO pv_workpaper_heads (organization_id,dossier_id,period_id,id,version) VALUES (${orgA},${dossierA},${pid},${run.id},1)`;
    await client`INSERT INTO pv_workpaper_versions (organization_id,dossier_id,period_id,id,version,run) VALUES (${orgA},${dossierA},${pid},${run.id},1,${client.json(run as never)})`;
    view = await read();
    expect(view.evaluation.coherence).toMatchObject([{ code: "CYCLE_OUTSIDE_PROGRAM" }]);
    expect(view.evaluation.observations).toMatchObject([{ family: "pv", procedure: "provisions.register", state: "draft", runId: "pv-durable-1" }]);
    await ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-01"], assertions: ["solde_existence"], nature: "engine", engine: "provisions.register", label: "Registre", owner: "Chef de mission" });
    expect((await send({ command: "validate_closing", text: "Clôture" }, signer)).status).toBe(422);
    view = await ok({ command: "set_applicability", procedureId: "P-02", applicable: false, reason: "Feuille au brouillon, hors périmètre de cette recette", citations: [] });
    expect(view.evaluation).toMatchObject({ coherence: [], blockers: [], closable: true });
    expect((await send({ command: "validate_closing", text: "Clôture" }, preparer)).status).toBe(403);
    view = await ok({ command: "validate_closing", text: "Décision de clôture du professionnel habilité (recette jetable)." }, signer);
    expect(view.evaluation.validation).toMatchObject({ status: "validee", by: "cl-signer" });
  });
  it("refuse inter-organisation, CSRF absent, écriture d’un dossier validé ; journal, pièces et reçus append-only ; une seule réouverture concurrente", async () => {
    expect((await handlers.GET(request(other))).status).toBe(403);
    expect((await handlers.POST(request(preparer, "POST", JSON.stringify({ command: "set_risk", expectedSeq: 0, riskId: "R-09", cycle: "stocks", label: "x", assertions: ["solde_existence"], assessment: null }), "", "", false))).status).toBe(403);
    await expect(client`UPDATE cl_events SET actor_id = 'falsifié' WHERE dossier_id = ${dossierA}`).rejects.toThrow(/CL_APPEND_ONLY/);
    await expect(client`DELETE FROM cl_pieces WHERE dossier_id = ${dossierA}`).rejects.toThrow(/CL_APPEND_ONLY/);
    await expect(client`DELETE FROM cl_command_receipts WHERE dossier_id = ${dossierA}`).rejects.toThrow(/CL_APPEND_ONLY/);
    expect((await send({ command: "set_risk", riskId: "R-02", cycle: "stocks", label: "x", assertions: ["solde_existence"], assessment: null })).status).toBe(422);
    const seq = (await read()).seq;
    const [a, b] = await Promise.all([send({ command: "reopen", expectedSeq: seq, reason: "Réouverture A" }, signer), send({ command: "reopen", expectedSeq: seq, reason: "Réouverture B" }, signer)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
  it("reprend l’état après une nouvelle connexion ; le chaînage du journal est vérifié à chaque lecture", async () => {
    await client.end(); connect();
    const view = await read();
    expect(view.evaluation.entity).toBe("EPSILON SAS (synthétique)");
    expect(view.evaluation.validation).toMatchObject({ status: "reouverte", reopened: { by: "cl-signer" } });
    expect(view.journal.length).toBe(view.seq);
    const [{ count }] = await client<{ count: string }[]>`SELECT count(*)::text AS count FROM cl_events WHERE dossier_id = ${dossierA}`;
    expect(Number(count)).toBe(view.seq);
    expect((await handlers.GET(request(reviewer, "GET", undefined, "", "&operation=download&id=PC-01-v1"))).status).toBe(200);
  });
});

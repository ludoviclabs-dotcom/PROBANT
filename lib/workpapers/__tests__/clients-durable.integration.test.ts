import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { RequestAuthorizer } from "@/lib/auth/authorize";
import { DrizzleDossierOwnershipReader } from "@/lib/auth/dossier-scope";
import { DrizzleSessionStore } from "@/lib/auth/session/store";
import { csrfTokenFor, newSessionSecret, sessionTokenDigest, SESSION_COOKIE, CSRF_HEADER } from "@/lib/auth/session/cookie";
import type { ProbantRole } from "@/lib/auth/roles";
import { ClientsRuntime } from "../clients-runtime";
import { clientsHandlers } from "../clients-http";
import { sha256 } from "@/lib/evidence/hash";
import { periodId, type WorkpaperRun } from "../model";
import type { ClientsCommand } from "../clients-commands";
import { csv, mapping, period } from "./clients-framing-fixtures";
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Clients — PostgreSQL jetable, sessions serveur et téléchargements", () => {
    let client: ReturnType<typeof postgres>;
    let handlers: ReturnType<typeof clientsHandlers>;
    let runtime: ClientsRuntime;
    let now = 1800000000;
    const orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierA2 = randomUUID(), dossierB = randomUUID(), dossierB2 = randomUUID();
    const config = { secret: "disposable-clients-test-secret-000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
    type Session = {
        secret: string;
        csrf: string;
    };
    let preparer: Session, reviewer: Session, other: Session, selfReviewer: Session;
    let run: WorkpaperRun;
    let importIds: string[];
    let sourceId: string;
    const url = (dossier = dossierA, extra = "") => config.appOrigin + "/api/workpapers/clients?dossierId=" + dossier + "&periodId=" + periodId(period) + extra;
    const request = (session: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", key = randomUUID()) => new Request(url(dossier, extra), {
        method, headers: { cookie: SESSION_COOKIE + "=" + session.secret, origin: config.appOrigin, [CSRF_HEADER]: session.csrf, "Idempotency-Key": key,
            ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body
    });
    async function connect() {
        client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
        const db = drizzle(client, { schema });
        const sessions = new DrizzleSessionStore(db);
        const authorizer = new RequestAuthorizer({ sessionStore: sessions, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
        runtime = new ClientsRuntime(db, authorizer, () => now);
        handlers = clientsHandlers(() => runtime, () => { }, error => {
            if (error instanceof Error) console.error("CLIENTS_RECIPE_ERROR", error.name, error.message.split("\n")[0], error.cause instanceof Error ? error.cause.message : "");
        });
        return sessions;
    }
    async function session(store: DrizzleSessionStore, org: string, subject: string, roles: ProbantRole[]) {
        const secret = newSessionSecret(), record = await store.create({ tokenSha256: sessionTokenDigest(secret), issuer: "https://idp.example.test", subject, organizationId: org, roles,
            acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
        return { secret, csrf: csrfTokenFor(record.id, config.secret) };
    }
    async function command(body: ClientsCommand, s = preparer, key = randomUUID()) {
        return handlers.POST(request(s, "POST", JSON.stringify(body), dossierA, "", key));
    }
    async function success(body: ClientsCommand, s = preparer) {
        const response = await command(body, s);
        expect(response.status, await response.clone().text()).toBe(200);
        return (await response.json()).run as WorkpaperRun;
    }
    async function mission() {
        const response = await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=mission"));
        expect(response.status, await response.clone().text()).toBe(200);
        return (await response.json()).mission;
    }
    const exportRequest = (snapshot: { hash: string; procedure: { runId: string; version: number } }, kind = "diagnostic", s = preparer, dossierId = dossierA, hash = snapshot.hash) => request(s, "POST", JSON.stringify({ dossierId, periodId: periodId(period), id: snapshot.procedure.runId, version: snapshot.procedure.version, expectedSnapshotHash: hash, kind, format: "html" }));
    const target = () => ({ id: run.id, expectedVersion: run.version });
    async function importSource(type: string, changed = false) {
        const data = new FormData();
        data.set("file", new File([csv(type, changed)], type + ".csv", { type: "text/csv" }));
        data.set("mapping", JSON.stringify(mapping));
        data.set("period", JSON.stringify(period));
        data.set("documentType", type);
        const preview = await handlers.importsPOST(request(preparer, "POST", data));
        expect(preview.status, await preview.clone().text()).toBe(200);
        const { batch } = await preview.json();
        const read = await (await handlers.GET(request(preparer))).json();
        const expectedSourceId = read.sourceHeads.find((h: {
            document_type: string;
        }) => h.document_type === type)?.import_id ?? null;
        const body = { command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId };
        const approved = await handlers.importsPOST(request(preparer, "POST", JSON.stringify(body)));
        expect(approved.status, await approved.clone().text()).toBe(200);
        return (await approved.json()).batch;
    }
    beforeAll(async () => {
        const u = new URL(databaseUrl!);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname))
            throw new Error("Disposable local *_ci / *_test database required");
        const store = await connect();
        await client `INSERT INTO organizations (id,name) VALUES (${orgA},'Clients A'),(${orgB},'Clients B')`;
        for (const [id, org] of [[dossierA, orgA], [dossierA2, orgA], [dossierB, orgB], [dossierB2, orgB]])
            await client `INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${id},${org},${id})`;
        preparer = await session(store, orgA, "preparer-real", ["preparer"]);
        reviewer = await session(store, orgA, "reviewer-real", ["reviewer"]);
        selfReviewer = await session(store, orgA, "preparer-real", ["preparer", "reviewer"]);
        other = await session(store, orgB, "other-real", ["reviewer"]);
    }, 30000);
    afterAll(async () => { if (client)
        await client.end(); });
    it("enregistre trois imports approuvés, fige toute la population puis exécute une exception", async () => {
        const batches = [];
        for (const type of ["clients_general", "clients_auxiliary", "clients_aged"])
            batches.push(await importSource(type));
        // Identical bytes and mapping reuse the persisted preview, including its first file name/hash.
        const repeated = new FormData();
        repeated.set("file", new File([csv("clients_general")], "renamed-general.csv", { type: "text/csv" }));
        repeated.set("mapping", JSON.stringify(mapping));
        repeated.set("period", JSON.stringify(period));
        repeated.set("documentType", "clients_general");
        const repeatedResponse = await handlers.importsPOST(request(preparer, "POST", repeated));
        expect(repeatedResponse.status).toBe(200);
        const repeatedBatch = (await repeatedResponse.json()).batch;
        expect(repeatedBatch.id).toBe(batches[0].id);
        expect(repeatedBatch.previewHash).toBe(batches[0].previewHash);
        expect(repeatedBatch.document.fileName).toBe(batches[0].document.fileName);
        importIds = batches.map(b => b.id);
        sourceId = batches[0].document.id;
        run = await success({ command: "create", period, instanceKey: randomUUID() });
        run = await success({ command: "freeze", ...target(), importIds });
        expect(run.selection!.selectedIds).toHaveLength(run.population!.items.length);
        run = await success({ command: "execute", ...target() });
        expect(run.result?.outcome).toBe("exceptions_detected");
        expect(run.notes[0].blocking).toBe(true);
        expect(run.preparedBy).toBe("preparer-real");
    });
    it("restitue le programme et un diagnostic serveur avant revue, refuse le paquet approuvé", async () => {
        const snapshot = await mission();
        expect(snapshot.counters).toMatchObject({ planned: 1, executed: 1, plannedParts: 2, exceptions: 2, reviewed: 0 });
        const diagnostic = await handlers.exportPOST(exportRequest(snapshot));
        expect(diagnostic.status, await diagnostic.clone().text()).toBe(200);
        expect(diagnostic.headers.get("X-Probant-Snapshot")).toBe(snapshot.hash);
        expect(await diagnostic.text()).toContain("Export diagnostic");
        expect((await handlers.exportPOST(exportRequest(snapshot, "approved"))).status).toBe(422);
        expect((await handlers.exportPOST(exportRequest(snapshot, "diagnostic", other))).status).toBe(403);
        expect((await handlers.exportPOST(exportRequest(snapshot, "diagnostic", preparer, dossierB))).status).toBe(403);
        const forged = exportRequest(snapshot); const payload = await forged.json();
        expect((await handlers.exportPOST(request(preparer, "POST", JSON.stringify({ ...payload, role: "reviewer", approval: true })))).status).toBe(400);
        expect((await handlers.exportPOST(request(preparer, "POST", JSON.stringify({ ...payload, mission: snapshot })))).status).toBe(413);
    });
    it("refuse accès inter-organisation, rôle inadéquat, autorité client, CSRF et périmètre dossier", async () => {
        expect((await handlers.GET(request(other))).status).toBe(403);
        expect((await handlers.GET(request(preparer, "GET", undefined, dossierB))).status).toBe(403);
        expect((await command({ command: "conclude", ...target(), text: "intrusion" }, reviewer)).status).toBe(403);
        const forged = { command: "review", ...target(), decision: "approved", text: "faux", submittedHash: "a".repeat(64), role: "reviewer", actorId: "fake" };
        expect((await handlers.POST(request(preparer, "POST", JSON.stringify(forged)))).status).toBe(400);
        const bad = request(preparer, "POST", JSON.stringify({ command: "conclude", ...target(), text: "sans CSRF" }));
        bad.headers.delete(CSRF_HEADER);
        expect((await handlers.POST(bad)).status).toBe(403);
        const restrictedRequest = new Request(url(dossierA2));
        const direct = new ClientsRuntime(drizzle(client, { schema }), { authorize: async (_req, requirement) => {
                const p = { subject: "scoped-worker", organizationId: orgA, roles: ["preparer"] as const, dossierIds: [dossierA], authenticationMethod: "signed-gateway-context" as const, amr: [], acr: null, mfaSatisfied: true, expiresAtEpochSeconds: now + 60 };
                const { assertDossierPermission } = await import("@/lib/auth/principal");
                assertDossierPermission(p, requirement.dossierId!, requirement.permission);
                return p;
            } }, () => now);
        await expect(direct.read(restrictedRequest, dossierA2, periodId(period))).rejects.toMatchObject({ code: "DOSSIER_FORBIDDEN" });
    });
    it("rejoue une commande une seule fois et refuse une clé réutilisée pour un autre contenu", async () => {
        const key = randomUUID(), body: ClientsCommand = { command: "conclude", ...target(), text: "Cadrage examiné, exception documentée." };
        const first = await command(body, preparer, key), second = await command(body, preparer, key);
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(await second.json()).toEqual(await first.clone().json());
        run = (await first.json()).run;
        expect((await command({ ...body, text: "Autre contenu" }, preparer, key)).status).toBe(409);
        const history = await (await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=history&id=" + encodeURIComponent(run.id)))).json();
        expect(history.history.filter((r: WorkpaperRun) => r.version === run.version)).toHaveLength(1);
    });
    it("rend un conflit concurrent avec la version serveur à comparer", async () => {
        const expected = run.version;
        const responses = await Promise.all(["Premier", "Second"].map(text => command({ command: "conclude", id: run.id, expectedVersion: expected, text })));
        expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
        const conflict = await responses.find(r => r.status === 409)!.json();
        expect(conflict.current.version).toBe(expected + 1);
        expect(conflict.expectedVersion).toBe(expected);
        run = (await responses.find(r => r.status === 200)!.json()).run;
    });
    it("refuse l’auto-approbation et les notes bloquantes, puis verrouille après revue distincte", async () => {
        run = await success({ command: "submit", ...target() });
        const self = await command({ command: "review", ...target(), decision: "approved", text: "Auto-revue", submittedHash: run.submittedHash! }, selfReviewer);
        expect(self.status).toBe(403);
        expect((await self.json()).error).toBe("SELF_APPROVAL_FORBIDDEN");
        expect((await command({ command: "review", ...target(), decision: "approved", text: "Non résolu", submittedHash: run.submittedHash! }, reviewer)).status).toBe(422);
        run = await success({ command: "review", ...target(), decision: "changes_requested", text: "Documenter le traitement des résidus.", submittedHash: run.submittedHash! }, reviewer);
        run = await success({ command: "revise", ...target() });
        expect(run.population).toBeUndefined();
        expect(run.result).toBeUndefined();
        run = await success({ command: "freeze", ...target(), importIds });
        run = await success({ command: "execute", ...target() });
        for (const note of run.notes.filter(n => n.blocking && !n.resolution))
            run = await success({ command: "resolve", ...target(), noteId: note.id, text: "Résidus examinés et justification documentée dans la conclusion." });
        run = await success({ command: "conclude", ...target(), text: "Résidus A +10 EUR et B -10 EUR examinés séparément. Cadrage uniquement." });
        run = await success({ command: "submit", ...target() });
        run = await success({ command: "review", ...target(), decision: "approved", text: "Cadrage revu, résidus justifiés.", submittedHash: run.submittedHash! }, reviewer);
        run = await success({ command: "lock", ...target() }, reviewer);
        expect(run.state).toBe("locked");
        expect(run.approval?.actorId).toBe("reviewer-real");
        expect((await command({ command: "conclude", ...target(), text: "Modification interdite" })).status).toBe(403);
        await expect(client `UPDATE clients_workpaper_versions SET run=run WHERE id=${run.id}`).rejects.toThrow("CLIENTS_APPEND_ONLY");
        await expect(client `DELETE FROM clients_imports WHERE dossier_id=${dossierA}`).rejects.toThrow("CLIENTS_APPEND_ONLY");
    });
    it("concorde écran/export après revue, maintient l’exception et ouvre une version historique exacte", async () => {
        const snapshot = await mission();
        expect(snapshot.procedure.runId).toBe(run.id); expect(snapshot.procedure.version).toBe(run.version);
        expect(snapshot.procedure.resultLabel).toBe("Exceptions maintenues");
        expect(snapshot.counters).toMatchObject({ exceptions: 2, reviewed: 1, locked: 1 });
        const response = await handlers.exportPOST(exportRequest(snapshot, "approved", reviewer));
        expect(response.status, await response.clone().text()).toBe(200);
        const html = await response.text();
        expect(html).toContain("Paquet du cadrage approuvé et verrouillé"); expect(html).toContain("Exceptions maintenues");
        expect(html).toContain(snapshot.hash); expect(html).toContain("reviewer-real");
        // Separate requests at different times still form one coherent, verifiable package.
        now += 7;
        const manifestPayload = await exportRequest(snapshot, "approved", reviewer).json();
        const manifestResponse = await handlers.exportPOST(request(reviewer, "POST", JSON.stringify({ ...manifestPayload, format: "manifest" })));
        expect(manifestResponse.status).toBe(200); const manifest = await manifestResponse.json();
        expect(manifest.createdAt).toBe(snapshot.stateAsOf);
        expect(manifest.artifacts.find((a: { format: string }) => a.format === "accessible_html").sha256).toBe(sha256(html));
        const csvResponse = await handlers.exportPOST(request(reviewer, "POST", JSON.stringify({ ...manifestPayload, format: "exceptions_csv" })));
        expect(csvResponse.status).toBe(200);
        expect(manifest.artifacts.find((a: { format: string }) => a.format === "findings_csv").sha256).toBe(sha256(Buffer.from(await csvResponse.arrayBuffer())));
        now -= 7;
        expect((await handlers.exportPOST(exportRequest(snapshot, "approved", reviewer, dossierA, "a".repeat(64)))).status).toBe(409);
        const historical = snapshot.procedure.beforeReview.version;
        const exact = await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=version&id=" + encodeURIComponent(run.id) + "&version=" + historical));
        expect(exact.status).toBe(200); const data = await exact.json();
        expect(data.runs[0].version).toBe(historical); expect(data.currentVersions[run.id]).toBe(run.version);
        expect((await handlers.GET(request(other, "GET", undefined, dossierA, "&operation=mission"))).status).toBe(403);
        const noCsrf = exportRequest(snapshot); noCsrf.headers.delete(CSRF_HEADER);
        expect((await handlers.exportPOST(noCsrf)).status).toBe(403);
        now += 7201;
        expect((await handlers.exportPOST(exportRequest(snapshot))).status).toBe(401);
        now -= 7201;
    });
    it("reprend après recréation du runtime et redémarrage PostgreSQL en CI", async () => {
        const locked = structuredClone(run);
        await client.end();
        const container = process.env.PROBANT_CLIENTS_TEST_POSTGRES_CONTAINER;
        if (container) {
            if (!/^[a-f0-9]{12,64}$/.test(container)) throw new Error("DISPOSABLE_CONTAINER_ID_INVALID");
            await promisify(execFile)("docker", ["restart", container], { timeout: 20000 });
        }
        await connect();
        for (let attempt = 0; ; attempt++) {
            try { await client`SELECT 1`; break; }
            catch (error) {
                if (attempt >= 4) throw error;
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }
        // Native PostgreSQL must encode timestamps for both lookup and sliding-session touch.
        now += 1800;
        const resumed = await (await handlers.GET(request(preparer))).json();
        const [sessionRow] = await client`SELECT extract(epoch from idle_expires_at) AS expiry FROM auth_sessions WHERE token_sha256=${sessionTokenDigest(preparer.secret)}`;
        expect(Number(sessionRow.expiry)).toBe(now + 3600);
        now -= 1800;
        expect(resumed.runs.find((r: WorkpaperRun) => r.id === locked.id)).toEqual(locked);
        expect(resumed.actorId).toBe("preparer-real");
        expect((await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=download&id=" + sourceId))).status).toBe(200);
    }, 30000);
    it("applique le même contrôle d’accès aux téléchargements et refuse les sessions expirées", async () => {
        const extra = "&operation=download&id=" + sourceId;
        const download = await handlers.GET(request(preparer, "GET", undefined, dossierA, extra));
        expect(await download.text()).toBe(csv("clients_general"));
        expect((await handlers.GET(request(other, "GET", undefined, dossierA, extra))).status).toBe(403);
        expect((await handlers.GET(request(preparer, "GET", undefined, dossierB, extra))).status).toBe(403);
        now += 7201;
        expect((await handlers.GET(request(preparer, "GET", undefined, dossierA, extra))).status).toBe(401);
        expect((await command({ command: "revise", ...target() })).status).toBe(401);
        now -= 7201;
    });
    it("invalide une source remplacée et crée une révision sans réécrire l’ancienne décision", async () => {
        const locked = structuredClone(run);
        const before = await mission();
        await importSource("clients_aged", true);
        expect((await handlers.exportPOST(exportRequest(before, "approved"))).status).toBe(409);
        const stale = await mission();
        expect(stale.procedure.stale).toBe(true); expect(stale.counters.reviewed).toBe(0);
        expect((await handlers.exportPOST(exportRequest(stale, "approved"))).status).toBe(422);
        const diagnostic = await handlers.exportPOST(exportRequest(stale));
        expect(diagnostic.status).toBe(200); expect(await diagnostic.text()).toContain("Source remplacée / périmée");
        const read = await (await handlers.GET(request(preparer))).json();
        expect(read.sourcesCurrent[locked.id]).toBe(false);
        expect((await command({ command: "lock", ...target() }, reviewer)).status).toBe(409);
        run = await success({ command: "revise", ...target() });
        expect(run.approval).toBeUndefined();
        expect(run.submittedHash).toBeUndefined();
        expect(run.importIds).toEqual([]);
        const after = await (await handlers.GET(request(preparer))).json();
        expect(after.runs.find((r: WorkpaperRun) => r.id === locked.id)).toEqual(locked);
        expect(after.lineageCurrent[run.rootId]).toEqual({ id: run.id, revision: run.revision, version: run.version });
        expect((await command({ command: "freeze", ...target(), importIds })).status).toBe(422);
    });
});

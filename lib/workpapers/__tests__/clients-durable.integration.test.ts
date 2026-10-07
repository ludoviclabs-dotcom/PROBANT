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
import { ClientsRuntime } from "../clients-runtime";
import { clientsHandlers } from "../clients-http";
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
        client = postgres(databaseUrl!, { max: 5, prepare: false });
        const db = drizzle(client, { schema });
        const sessions = new DrizzleSessionStore(db);
        const authorizer = new RequestAuthorizer({ sessionStore: sessions, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
        runtime = new ClientsRuntime(db, authorizer, () => now);
        handlers = clientsHandlers(() => runtime, () => { });
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
    it("reprend après fermeture des connexions avec sessions, versions et sources persistées", async () => {
        const locked = structuredClone(run);
        await client.end();
        await connect();
        const resumed = await (await handlers.GET(request(preparer))).json();
        expect(resumed.runs.find((r: WorkpaperRun) => r.id === locked.id)).toEqual(locked);
        expect(resumed.actorId).toBe("preparer-real");
        expect((await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=download&id=" + sourceId))).status).toBe(200);
    });
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
        await importSource("clients_aged", true);
        const read = await (await handlers.GET(request(preparer))).json();
        expect(read.sourcesCurrent[locked.id]).toBe(false);
        expect((await command({ command: "lock", ...target() }, reviewer)).status).toBe(409);
        run = await success({ command: "revise", ...target() });
        expect(run.approval).toBeUndefined();
        expect(run.submittedHash).toBeUndefined();
        expect(run.importIds).toEqual([]);
        const after = await (await handlers.GET(request(preparer))).json();
        expect(after.runs.find((r: WorkpaperRun) => r.id === locked.id)).toEqual(locked);
        expect((await command({ command: "freeze", ...target(), importIds })).status).toBe(422);
    });
});

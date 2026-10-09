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
import { FiscalRuntime } from "../fiscal-runtime";
import { fiscalHandlers } from "../fiscal-http";
import { PostgresFiscalDatabase } from "../fiscal-store";
import type { FiscalCommand } from "../fiscal-commands";
import type { FiscalTabularType } from "../fiscal-sources";
import type { VatResult } from "../fiscal-vat";
import { periodId, type WorkpaperRun } from "../model";
import { CA3_T1, CA3_T2, CA3_T2_CORRECTED, ca3Text, citText, DECL_2065, fecText, FX_CSV, FX_SIREN, fxMapping, fxPeriod, LIASSE_2058A, T1, T2 } from "./fiscal-fixtures";
import type { CitResult } from "../fiscal-cit-contract";

/** Disposable PostgreSQL recipe (CI service or local *_ci / *_test database); skipped, never simulated, without it. */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette fiscale TVA — PostgreSQL jetable, sessions serveur et append-only", () => {
  let client: ReturnType<typeof postgres>, handlers: ReturnType<typeof fiscalHandlers>, store: DrizzleSessionStore;
  const now = 1_801_000_000, orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierB = randomUUID();
  const config = { secret: "disposable-fiscal-test-secret-0000000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  type Session = { secret: string; csrf: string };
  let preparer: Session, reviewer: Session, other: Session, run: WorkpaperRun;
  const ids: Record<string, string> = {};
  const url = (dossier = dossierA, extra = "") => config.appOrigin + "/api/workpapers/fiscal?dossierId=" + dossier + "&periodId=" + periodId(fxPeriod) + extra;
  const request = (s: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", csrf = true) => new Request(url(dossier, extra), { method, body,
    headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, ...(csrf ? { [CSRF_HEADER]: s.csrf } : {}), "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) } });
  function connect() {
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    store = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: store, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db) });
    handlers = fiscalHandlers(() => new FiscalRuntime(new PostgresFiscalDatabase(db), authorizer, () => now), () => {},
      error => { if (error instanceof Error) console.error("FISCAL_RECIPE_ERROR", error.name, error.message.split("
")[0], error.cause instanceof Error ? error.cause.message : ""); });
  }
  async function session(org: string, subject: string, roles: ProbantRole[]) {
    const secret = newSessionSecret(), record = await store.create({ tokenSha256: sessionTokenDigest(secret), issuer: "https://idp.example.test", subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  const read = async () => (await handlers.GET(request(preparer))).json();
  async function success(body: FiscalCommand, s = preparer) { const r = await handlers.POST(request(s, "POST", JSON.stringify(body))); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  async function importSource(fields: Record<string, string | File>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    form.set("period", JSON.stringify(fxPeriod));
    const previewed = await handlers.importsPOST(request(preparer, "POST", form)); expect(previewed.status, await previewed.clone().text()).toBe(200);
    const { batch } = await previewed.json(), heads = (await read()).sourceHeads as { document_type: string; import_id: string }[];
    const approved = await handlers.importsPOST(request(preparer, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(h => h.document_type === batch.document.logicalId)?.import_id ?? null })));
    expect(approved.status, await approved.clone().text()).toBe(200); return (await approved.json()).batch as { id: string; document: { id: string }; rows: { id: string; original: Record<string, string>; normalized?: { key: string } }[] };
  }
  const ret = (period: { startDate: string; endDate: string }, boxes: Record<string, string>) => importSource({ file: new File([ca3Text(period, boxes)], "CA3-" + period.startDate + ".csv", { type: "text/csv" }), documentType: "fx_vat_return", declaration: JSON.stringify({ documentType: "declaration_tva_ca3", expectedSiren: FX_SIREN }) });
  const tab = (type: FiscalTabularType) => importSource({ file: new File([FX_CSV[type]], type + ".csv", { type: "text/csv" }), mapping: JSON.stringify(fxMapping(type)), documentType: type });
  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    connect();
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Fiscal A'),(${orgB},'Fiscal B')`;
    await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${dossierA},${orgA},${dossierA}),(${dossierB},${orgB},${dossierB})`;
    preparer = await session(orgA, "fx-preparer", ["preparer"]); reviewer = await session(orgA, "fx-reviewer", ["reviewer"]); other = await session(orgB, "fx-other", ["preparer", "reviewer"]);
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });
  it("persiste FEC, déclarations versionnées par période, inventaires, population, moteur, décision citée, revue distincte et verrouillage", async () => {
    ids.fec = (await importSource({ file: new File([fecText()], "FEC2026.txt", { type: "text/plain" }), documentType: "fx_fec" })).id;
    const t1 = await ret(T1, CA3_T1), t2 = await ret(T2, CA3_T2), support = await tab("fx_support");
    ids.t1 = t1.id; ids.t2 = t2.id; ids.invoices = (await tab("fx_invoices")).id; ids.payments = (await tab("fx_vat_payments")).id; ids.support = support.id;
    run = await success({ command: "create", period: fxPeriod, tax: "vat", declarativePeriod: T2, frequency: "quarterly", formVintage: 2026 });
    const expected = (await read()).expectedSources[run.id] as string[];
    expect([...expected].sort()).toEqual(Object.values(ids).sort());
    const row = (b: typeof t2, code: string) => ({ documentId: b.document.id, rowId: b.rows.find(r => r.original.fieldCode === code || r.normalized?.key === code)!.id });
    run = await success({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: expected, draft: { frequency: "quarterly", formVintage: 2026,
      profile: { vatRegime: "real_normal", vatGroupStatus: "none", siren: FX_SIREN, evidence: row(support, "ATT-REGIME") },
      explanations: [{ id: "CREDIT-T1", label: "Crédit du T1 reporté", kind: "credit_carried", amountCents: "-10000", citation: row(t2, "22") }] } });
    run = await success({ command: "execute", id: run.id, expectedVersion: run.version });
    expect((run.result!.result as VatResult).bridge).toMatchObject({ startCents: 12000, declaredCents: 2000, residualCents: 0 });
    for (const n of run.notes.filter(x => x.blocking)) run = await success({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Crédit du T1 reporté (recette jetable).", citation: row(t1, "27") });
    run = await success({ command: "conclude", id: run.id, expectedVersion: run.version, text: "TVA T2 rapprochée ; écart expliqué ; aucune conformité déclarée." });
    run = await success({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await success({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue distincte." }, reviewer);
    run = await success({ command: "lock", id: run.id, expectedVersion: run.version }, reviewer);
    expect(run).toMatchObject({ state: "locked", preparedBy: "fx-preparer", approval: { actorId: "fx-reviewer" } });
  });
  it("refuse accès inter-organisation, CSRF absent et réécriture des versions", async () => {
    expect((await handlers.GET(request(other))).status).toBe(403);
    expect((await handlers.POST(request(preparer, "POST", JSON.stringify({ command: "create", period: fxPeriod, tax: "vat", declarativePeriod: T1, frequency: "quarterly", formVintage: 2026 }), dossierA, "", false))).status).toBe(403);
    await expect(client`UPDATE fx_workpaper_versions SET run = run WHERE id = ${run.id}`).rejects.toThrow(/FX_APPEND_ONLY/);
    await expect(client`DELETE FROM fx_imports WHERE dossier_id = ${dossierA}`).rejects.toThrow(/FX_APPEND_ONLY/);
    await expect(client`INSERT INTO fx_source_heads (organization_id,dossier_id,period_id,document_type,import_id) VALUES (${orgA},${dossierA},${periodId(fxPeriod)},'fx_vat_return:T2',${ids.t2})`).rejects.toThrow();
  });
  it("reprend l’état après une nouvelle connexion ; une déclaration remplacée rend la feuille périmée sans effacer la version utilisée", async () => {
    await client.end(); connect();
    const view = await read();
    expect(view.runs[0]).toMatchObject({ id: run.id, version: run.version, state: "locked" });
    expect(view.sourcesCurrent[run.id]).toBe(true);
    await ret(T2, CA3_T2_CORRECTED);
    const after = await read();
    expect(after.sourcesCurrent[run.id]).toBe(false);
    expect(after.versions["fx_vat_return:2026-04-01:2026-06-30"]).toHaveLength(2);
    const mission = (await (await handlers.GET(request(preparer, "GET", undefined, dossierA, "&operation=mission"))).json()).mission;
    expect(mission.procedure).toMatchObject({ stale: true, state: "locked" });
    expect(mission.replaced).toEqual([expect.objectContaining({ importId: ids.t2, usedByRun: true })]);
  });
  it("IS de l’exercice : liasse et 2065 persistées, pont documenté, moteur TAX-05, revue distincte et verrouillage ; la déclaration de TVA remplacée ne le périme pas", async () => {
    const cit = (boxes: Record<string, string>, documentType: "liasse_2050_2059" | "declaration_2065", formNumber: string) => importSource({ file: new File([citText(boxes, { documentType, formNumber })], documentType + ".csv", { type: "text/csv" }), documentType: "fx_cit_return", declaration: JSON.stringify({ documentType, expectedSiren: FX_SIREN }) });
    await cit(LIASSE_2058A, "liasse_2050_2059", "2058-A-SD"); await cit(DECL_2065, "declaration_2065", "2065-SD");
    let isRun = await success({ command: "create", period: fxPeriod, tax: "cit", formVintage: 2026 });
    const view = await read(), expected = view.expectedSources[isRun.id] as string[];
    const support = view.imports.find((b: { document: { documentType: string } }) => b.document.documentType === "fx_support");
    const regime = support.rows.find((r: { normalized?: { key: string } }) => r.normalized?.key === "ATT-REGIME").id as string;
    isRun = await success({ command: "freeze", id: isRun.id, expectedVersion: isRun.version, importIds: expected, draft: { formVintage: 2026, resultBasis: "before_tax", adjustments: [],
      profile: { regime: "standard", groupStatus: "none", turnoverCents: "10240000", capitalPaid: "partially_paid", ownershipBasisPoints: 8000, siren: FX_SIREN, evidence: { documentId: support.document.id, rowId: regime } } } });
    isRun = await success({ command: "execute", id: isRun.id, expectedVersion: isRun.version });
    const r = isRun.result!.result as CitResult;
    expect(r).toMatchObject({ framing: { status: "framed" }, computation: { grossTaxCents: 1795000 }, bridge: { basis: "before_tax", startCents: 7080000, residualCents: 100000 } });
    for (const n of isRun.notes.filter(x => x.blocking)) isRun = await success({ command: "resolve", id: isRun.id, expectedVersion: isRun.version, noteId: n.id, text: "Pénalité de 1 000 réintégrée dans WR (recette jetable).", citation: { documentId: support.document.id, rowId: regime } });
    isRun = await success({ command: "conclude", id: isRun.id, expectedVersion: isRun.version, text: "IS cadré ; résidu de pont documenté ; aucune liquidation." });
    isRun = await success({ command: "submit", id: isRun.id, expectedVersion: isRun.version });
    isRun = await success({ command: "review", id: isRun.id, expectedVersion: isRun.version, decision: "approved", submittedHash: isRun.submittedHash!, text: "Revue distincte IS." }, reviewer);
    isRun = await success({ command: "lock", id: isRun.id, expectedVersion: isRun.version }, reviewer);
    expect(isRun).toMatchObject({ state: "locked", template: { id: "is.computation" }, approval: { actorId: "fx-reviewer" } });
    expect((await read()).sourcesCurrent[isRun.id]).toBe(true);
  });
});

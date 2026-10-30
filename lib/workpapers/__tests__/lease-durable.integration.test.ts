import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
import { readSourceHeads, readStoreHeads } from "@/lib/capabilities/store-readers";
import type { ImportBatch } from "../imports";
import { closingHandlers } from "../closing-http";
import { ClosingRuntime } from "../closing-runtime";
import { PostgresClosingDatabase } from "../closing-store";
import { observeRuns, sheetLineages } from "../closing-cycles";
import { sourcesCurrentAdapter } from "../closing-adapters";
import { leaseHandlers } from "../lease-http";
import { LeaseRuntime } from "../lease-runtime";
import { LEASE_MAPPING, type LeaseType } from "../lease-sources";
import type { LeaseCommand } from "../lease-commands";
import { loanHandlers } from "../loan-http";
import { LoanRuntime } from "../loan-runtime";
import { loanFilesFromRows, loanFixtureRows } from "../loan-fixture";
import { LOAN_MAPPING } from "../loan-review";
import { periodId, type WorkpaperRun } from "../model";
import { WorkpaperService } from "../service";
import { assertDisposableDatabase } from "./disposable-database";
import { leaseFile, leaseFiles, LEASE_PERIOD, leaseRows } from "./lease-fixture";

/**
 * IFRS C01 — recette du socle « Locations IFRS 16 » sur PostgreSQL jetable (base *_test locale) : imports approuvés → travail cité → gel →
 * exécution (incapacité explicite) ; rejeu idempotent, conflits, portée refusée sans écriture, échec en transaction sans publication ;
 * source et règle remplacées, révision et historique ; Emprunts et dossier de clôture lus à l'identique ; garde de retour arrière de 0022.
 */
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Locations IFRS 16 (socle C01) — PostgreSQL jetable, sessions serveur", () => {
  let client: ReturnType<typeof postgres>, http: ReturnType<typeof leaseHandlers>, loans: ReturnType<typeof loanHandlers>, closing: ReturnType<typeof closingHandlers>, sessions: DrizzleSessionStore;
  const connect = (sql: ReturnType<typeof postgres>) => drizzle(sql, { schema });
  let db: ReturnType<typeof connect>;
  const now = 1_830_000_000;
  const orgA = randomUUID(), orgB = randomUUID(), dossierA = randomUUID(), dossierSolo = randomUUID(), dossierB = randomUUID();
  const config = { secret: "disposable-leases-test-secret-00000000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  const profileId = randomUUID(), localAuth: LocalAuthConfig = { profileId, issuer: LOCAL_ISSUER_PREFIX + profileId, organizationId: orgA, ownerName: "Camille Martin (exemple)", ownerReview: "personal", simulationEnabled: false };
  type Session = { secret: string; csrf: string };
  let preparer: Session, other: Session, owner: Session, closer: Session;
  const pid = periodId(LEASE_PERIOD);
  const request = (s: Session, method = "GET", body?: BodyInit, dossier = dossierA, extra = "", key: string = randomUUID(), path = "/api/workpapers/locations-ifrs16") => new Request(config.appOrigin + path + "?dossierId=" + dossier + "&periodId=" + pid + extra, {
    method, headers: { cookie: SESSION_COOKIE + "=" + s.secret, origin: config.appOrigin, [CSRF_HEADER]: s.csrf, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  async function session(org: string, subject: string, roles: ProbantRole[], issuer = "https://idp.example.test") {
    const secret = newSessionSecret(), record = await sessions.create({ tokenSha256: sessionTokenDigest(secret), issuer, subject, organizationId: org, roles, acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    return { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }
  const command = (body: LeaseCommand, s = preparer, dossier = dossierA, key: string = randomUUID()) => http.POST(request(s, "POST", JSON.stringify(body), dossier, "", key));
  async function ok(body: LeaseCommand, s = preparer, dossier = dossierA) { const r = await command(body, s, dossier); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  const failure = async (r: Response) => ({ status: r.status, ...(await r.json()) });
  const target = (r: WorkpaperRun) => ({ id: r.id, expectedVersion: r.version });
  const view = async (s = preparer, dossier = dossierA, extra = "") => (await http.GET(request(s, "GET", undefined, dossier, extra))).json();
  async function importSource(type: LeaseType, file: File, s = preparer, dossier = dossierA) {
    const form = new FormData(); form.set("file", file); form.set("documentType", type); form.set("mapping", JSON.stringify(LEASE_MAPPING)); form.set("period", JSON.stringify(LEASE_PERIOD));
    const preview = await http.importsPOST(request(s, "POST", form, dossier)); expect(preview.status, await preview.clone().text()).toBe(200);
    const { batch } = await preview.json(), current = await view(s, dossier);
    const approved = await http.importsPOST(request(s, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: current.sourceHeads.find((h: { document_type: string }) => h.document_type === type)?.import_id ?? null }), dossier));
    expect(approved.status, await approved.clone().text()).toBe(200);
    return (await approved.json()).batch as ImportBatch;
  }
  async function importPack(s = preparer, dossier = dossierA, types: LeaseType[] = ["lease_contracts", "lease_assumptions", "lease_schedule", "lease_ledger"]) {
    const files = leaseFiles(), out: ImportBatch[] = [];
    for (const type of types) out.push(await importSource(type, files[type]!, s, dossier));
    return out;
  }
  const framework = { standard: "IFRS 16" as const, jurisdiction: "IASB" as const, edition: "IFRS 16, IASB 2026", editionFingerprint: null };
  const work = (batches: ImportBatch[], term = "3") => {
    const contracts = batches.find(b => b.document.documentType === "lease_contracts")!;
    return { framework, firstApplication: { kind: "not_applicable" as const, reason: "Entité déjà sous IFRS 16 ; aucune méthode de transition choisie" },
      policies: [{ kind: "short_term_exemption" as const, assetCategory: "Matériel de bureau", answer: { kind: "value" as const, value: "not_elected" } }],
      confirmations: [{ contractId: "F01", field: "termMonths", answer: { kind: "value" as const, value: term }, citation: { documentVersionId: contracts.document.id, rowId: contracts.rows[0].id } },
        { contractId: "F01", field: "residualValueGuarantee", answer: { kind: "not_applicable" as const, reason: "Aucune garantie de valeur résiduelle dans le contrat" }, citation: { documentVersionId: contracts.document.id, rowId: contracts.rows[0].id } }] };
  };
  const versions = async (id: string) => Number((await client`SELECT count(*)::int AS n FROM clients_workpaper_versions WHERE organization_id=${orgA} AND id=${id}`)[0].n);
  const allVersions = async (dossier = dossierA) => Number((await client`SELECT count(*)::int AS n FROM clients_workpaper_versions WHERE dossier_id=${dossier}`)[0].n);

  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    db = connect(client);
    await assertDisposableDatabase(client);
    sessions = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: sessions, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db), localAuth });
    const report = (tag: string) => (e: unknown) => { if (e instanceof Error && e.name === "Error" && !/^[A-Z0-9_]+$/.test(e.message)) console.error(tag, e.message.split("\n")[0]); };
    http = leaseHandlers(() => new LeaseRuntime(db, authorizer, () => now), () => {}, report("LEASE_RECIPE_ERROR"));
    loans = loanHandlers(() => new LoanRuntime(db, authorizer, () => now), () => {}, report("LOAN_RECIPE_ERROR"));
    closing = closingHandlers(() => new ClosingRuntime(new PostgresClosingDatabase(db), authorizer, () => now, () => false), () => {}, report("CLOSING_RECIPE_ERROR"));
    await client`INSERT INTO organizations (id,name) VALUES (${orgA},'Locations A'),(${orgB},'Locations B')`;
    for (const [id, org] of [[dossierA, orgA], [dossierSolo, orgA], [dossierB, orgB]]) await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${id},${org},${id})`;
    preparer = await session(orgA, "preparer-leases", ["preparer"]);
    other = await session(orgB, "other-leases", ["preparer", "reviewer"]);
    owner = await session(orgA, LOCAL_OWNER_SUBJECT, [], localAuth.issuer);
    closer = await session(orgA, "closer-leases", ["preparer", "reviewer"]);
  }, 30000);
  afterAll(async () => { vi.restoreAllMocks(); if (client) await client.end(); });

  let sheet: WorkpaperRun, batches: ImportBatch[] = [], closingBefore: unknown, loanSheet: WorkpaperRun;

  it("Emprunts et dossier de clôture lus avant toute feuille Locations (référence de non-régression)", async () => {
    // The loans sheet shares the dossier, the exercise and the Clients store of the lease sheets: same scope, same source heads table.
    const loanPeriod = LEASE_PERIOD, loanPid = pid;
    const loanRequest = (method: string, body?: BodyInit) => new Request(config.appOrigin + "/api/workpapers/emprunts?dossierId=" + dossierA + "&periodId=" + loanPid, { method, body, headers: { cookie: SESSION_COOKIE + "=" + preparer.secret, origin: config.appOrigin, [CSRF_HEADER]: preparer.csrf, "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) } });
    const created = await loans.POST(loanRequest("POST", JSON.stringify({ command: "create_loans", period: loanPeriod, instanceKey: "c01-loans" })));
    expect(created.status, await created.clone().text()).toBe(200);
    loanSheet = (await created.json()).run;
    for (const [type, file] of Object.entries(loanFilesFromRows(loanFixtureRows("simple")))) {
      const form = new FormData(); form.set("file", file); form.set("documentType", type); form.set("mapping", JSON.stringify(LOAN_MAPPING)); form.set("period", JSON.stringify(loanPeriod));
      const preview = await loans.importsPOST(loanRequest("POST", form)); expect(preview.status, await preview.clone().text()).toBe(200);
      const { batch } = await preview.json();
      const approved = await loans.importsPOST(loanRequest("POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: null })));
      expect(approved.status, await approved.clone().text()).toBe(200);
    }
    const heads = (await (await loans.GET(loanRequest("GET"))).json()).sourceHeads as { import_id: string }[];
    const frozen = await loans.POST(loanRequest("POST", JSON.stringify({ command: "freeze_loans", id: loanSheet.id, expectedVersion: loanSheet.version, criteria: "Recette C01 : voisin Emprunts", importIds: heads.map(h => h.import_id) })));
    expect(frozen.status, await frozen.clone().text()).toBe(200);
    loanSheet = (await frozen.json()).run;
    const open = await closing.POST(request(closer, "POST", JSON.stringify({ command: "open", period: LEASE_PERIOD, entity: "LOCATIONS SAS (synthétique)", expectedSeq: 0 }), dossierA, "", randomUUID(), "/api/workpapers/closing"));
    expect(open.status, await open.clone().text()).toBe(200);
    closingBefore = await (await closing.GET(request(closer, "GET", undefined, dossierA, "", randomUUID(), "/api/workpapers/closing"))).json();
    // The file observes the neighbour loans lineage: the comparison at the end is made on a file that reads a cycle sheet.
    expect((closingBefore as { evaluation: { sheets: { procedure: string; current: { sourcesCurrent: boolean } }[] } }).evaluation.sheets.map(s => [s.procedure, s.current.sourcesCurrent])).toEqual([["loans.review", true]]);
  }, 60000);

  it("imports approuvés → travail cité → gel → exécution : incapacité explicite, sans montant ni succès", async () => {
    sheet = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-leases" });
    expect(sheet).toMatchObject({ state: "draft", template: { id: "ifrs16.leases", version: "1.0.0", rule: { authority: "internal", validation: "provisional" } } });
    batches = await importPack();
    expect(batches.map(b => b.document.documentType)).toEqual(["lease_contracts", "lease_assumptions", "lease_schedule", "lease_ledger"]);
    expect(await failure(await command({ command: "freeze_leases", ...target(sheet), criteria: "Tous les contrats", importIds: batches.map(b => b.id) }))).toEqual({ status: 422, error: "L16_WORK_REQUIRED", missing: ["configure_leases"] });
    sheet = await ok({ command: "configure_leases", ...target(sheet), work: work(batches) });
    expect(sheet.leaseWork).toMatchObject({ schemaVersion: "ifrs16-leases-1", authorId: "preparer-leases", confirmations: [{ answer: { kind: "value", value: "3" }, citation: { importId: batches[0].id, sha256: batches[0].document.byteHash, row: 2 } }, { answer: { kind: "not_applicable" } }] });
    expect(await failure(await command({ command: "freeze_leases", ...target(sheet), criteria: "Partiel", importIds: [batches[0].id, batches[2].id, batches[3].id] }))).toEqual({ status: 422, error: "L16_CURRENT_SOURCES_REQUIRED", missing: ["lease_assumptions"] });
    expect((await failure(await command({ command: "freeze_leases", ...target(sheet), criteria: "Sans grand livre", importIds: batches.slice(0, 3).map(b => b.id) }))).error).toBe("L16_CURRENT_SOURCES_REQUIRED");
    sheet = await ok({ command: "freeze_leases", ...target(sheet), criteria: "Tous les contrats du registre de l'exercice", importIds: batches.map(b => b.id) });
    expect(sheet).toMatchObject({ state: "ready", population: { unit: "lease_contract" } });
    expect(sheet.importIds).toEqual(batches.map(b => b.id).sort());
    expect(sheet.population!.items.map(i => i.id)).toEqual(["F01", "F03"]);
    sheet = await ok({ command: "execute", ...target(sheet) });
    // No named review of the rule yet: the calculation registry refuses any real execution, with no result and no amount.
    expect(sheet).toMatchObject({ state: "blocked", result: { execution: "blocked", outcome: "inconclusive", result: null }, findings: [], notes: [] });
    expect(sheet.result!.blockedControls).toContain("rule_not_applicable");
    expect(JSON.stringify(sheet.result!.result)).not.toMatch(/"amount"/);
    const read = await view();
    expect(read).toMatchObject({ capability: { engine: "1.0.0", realExecution: "blocked_rule_review_required", rule: { version: "1.0.0", basisStatus: "review_required" } }, sourcesCurrent: { [sheet.id]: true }, ruleCurrent: { [sheet.id]: true } });
    expect(read.imports.every((b: ImportBatch) => b.document.documentType.startsWith("lease_"))).toBe(true);
    // The qualification of the frozen sources is read by the screen: both contracts are eligible; F01 carries a not-applicable answer the field does not admit.
    expect(read.qualification[sheet.id].contracts.map((c: { contractId: string; status: string }) => [c.contractId, c.status])).toEqual([["F01", "a_qualifier"], ["F03", "eligible_v1"]]);
    // L16-03: the framing is read before any calculation (the rule review still blocks the engine); no adjustment exists without a result.
    expect(read.framing[sheet.id].contracts.map((c: { contractId: string; status: string }) => [c.contractId, c.status])).toEqual([["F01", "not_applicable"], ["F03", "framed"]]);
    expect(read.adjustments[sheet.id]).toBeNull();
    // L16-04: before any result, the portfolio line and table read the qualification only; no amount, no chart (never a zero).
    expect(read.portfolio[sheet.id]).toMatchObject({ summary: { registry: 2, calculable: 1, toQualify: 1, results: null, amounts: null }, charts: null, comparison: null });
    expect(read.portfolio[sheet.id].rows.every((r: { debtClosing: unknown; review: unknown }) => r.debtClosing === null && r.review === null)).toBe(true);
    // A blocked sheet cannot be submitted, reviewed or locked: its state forbids it, with a business code.
    expect(await failure(await command({ command: "submit", ...target(sheet) }))).toEqual({ status: 403, error: "WORKPAPER_TRANSITION_FORBIDDEN" });
  }, 60000);

  it("même commande rejouée : même réponse, aucun doublon ; même clé avec une autre charge : conflit", async () => {
    let draft = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-idempotence" });
    const key = randomUUID(), body: LeaseCommand = { command: "configure_leases", ...target(draft), work: work(batches) };
    const first = await command(body, preparer, dossierA, key), again = await command(body, preparer, dossierA, key);
    expect(first.status).toBe(200); expect(await again.json()).toEqual(await first.json());
    draft = (await (await command(body, preparer, dossierA, key)).json()).run;
    expect(await versions(draft.id)).toBe(2);
    expect(await failure(await command({ ...body, work: work(batches, "4") } as LeaseCommand, preparer, dossierA, key))).toEqual({ status: 409, error: "IDEMPOTENCY_KEY_REUSED" });
    expect(await failure(await command(body, preparer, dossierA, "court"))).toEqual({ status: 400, error: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(await failure(await command({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-idempotence" }))).toEqual({ status: 409, error: "WORKPAPER_ALREADY_EXISTS" });
  }, 60000);

  it("deux modifications concurrentes : une seule réussit, l'autre reçoit un conflit exploitable", async () => {
    const draft = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-concurrence" });
    const [a, b] = await Promise.all([command({ command: "configure_leases", ...target(draft), work: work(batches, "3") }), command({ command: "configure_leases", ...target(draft), work: work(batches, "5") })]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = await (a.status === 409 ? a : b).json();
    expect(conflict).toMatchObject({ error: "STALE_WORKPAPER_VERSION", expectedVersion: 1, current: { id: draft.id, version: 2 } });
    expect(await versions(draft.id)).toBe(2);
  }, 60000);

  it("autre dossier, autre organisation, autre exercice ou juridiction hors liste : rejet sans écriture partielle", async () => {
    const before = await allVersions(), receipts = Number((await client`SELECT count(*)::int AS n FROM clients_command_receipts WHERE dossier_id=${dossierA}`)[0].n);
    expect((await failure(await command({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-intrus" }, other, dossierA))).status).toBe(403);
    expect((await failure(await command({ configure: 1 } as never))).error).toBe("L16_REQUEST_INVALID");
    const otherPeriod = { ...LEASE_PERIOD, startDate: "2027-01-01", closingDate: "2027-12-31", asOfDate: "2028-02-15" };
    expect(await failure(await command({ command: "create_leases", period: otherPeriod, instanceKey: "c01-autre-exercice" }))).toEqual({ status: 422, error: "WORKPAPER_PERIOD_INVALID" });
    expect(await failure(await command({ command: "configure_leases", ...target(sheet), work: { ...work(batches), framework: { ...framework, jurisdiction: "FR" } } } as never))).toEqual({ status: 400, error: "L16_REQUEST_INVALID" });
    const foreign = { ...work(batches), confirmations: [{ ...work(batches).confirmations[0], citation: { documentVersionId: "inconnu", rowId: "inconnu" } }] };
    const draft = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-citation" });
    expect(await failure(await command({ command: "configure_leases", ...target(draft), work: foreign }))).toEqual({ status: 422, error: "L16_CITATION_INVALID" });
    expect(await allVersions()).toBe(before + 1);
    expect(Number((await client`SELECT count(*)::int AS n FROM clients_command_receipts WHERE dossier_id=${dossierA}`)[0].n)).toBe(receipts + 1);
    expect(await failure(await http.GET(request(preparer, "GET", undefined, dossierA, "&operation=version&id=" + encodeURIComponent(sheet.id))))).toEqual({ status: 400, error: "L16_QUERY_INVALID" });
    expect(await failure(await command({ command: "execute", id: "workpaper-inconnue", expectedVersion: 1 }))).toEqual({ status: 404, error: "L16_NOT_FOUND" });
  }, 60000);

  it("échec au milieu d'une transaction : aucune version, aucun reçu, la même commande rejouée aboutit", async () => {
    let draft = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-transaction" });
    draft = await ok({ command: "configure_leases", ...target(draft), work: work(batches) });
    const before = await versions(draft.id), key = randomUUID(), body: LeaseCommand = { command: "freeze_leases", ...target(draft), criteria: "Transaction interrompue", importIds: batches.map(b => b.id) };
    const spy = vi.spyOn(WorkpaperService.prototype, "attachInputs").mockRejectedValueOnce(new Error("INJECTED_FAILURE_AFTER_CONFIGURE"));
    expect(await failure(await command(body, preparer, dossierA, key))).toEqual({ status: 503, error: "L16_DURABLE_UNAVAILABLE" });
    spy.mockRestore();
    expect(await versions(draft.id)).toBe(before);
    const retried = await command(body, preparer, dossierA, key);
    expect(retried.status, await retried.clone().text()).toBe(200);
    expect((await retried.json()).run).toMatchObject({ state: "ready", version: before + 3 });
  }, 60000);

  it("source remplacée : seule la feuille Locations est à réviser ; la feuille Emprunts voisine reste à jour ; révision et historique conservés", async () => {
    const rows = leaseRows();
    rows.lease_schedule.push({ key: "F03-E2", amount: "1000.00", date: "2026-02-28", details: { contractId: "F03", source: { title: "Échéancier F03 v2", pack: "Pack synthétique IFRS 16 C01", date: "2026-03-01", page: 2, clause: "Avenant" } } });
    const replaced = await importSource("lease_schedule", leaseFile("lease_schedule", rows.lease_schedule, "EXEMPLE-lease_schedule-v2.csv"));
    const read = await view();
    expect(read.sourcesCurrent[sheet.id]).toBe(false);
    expect(await failure(await command({ command: "execute", ...target(sheet) }))).toEqual({ status: 409, error: "L16_SOURCE_REPLACED_REVISION_REQUIRED" });
    // The loans sheet of the same dossier and store keeps its frozen sources current (its own source types only).
    const shared = { organizationId: orgA, dossierId: dossierA, periodId: pid, mode: "real" as const };
    expect(loanSheet.scope).toEqual(shared);
    const observed = observeRuns(await readStoreHeads(db as never, shared), sourcesCurrentAdapter(await readSourceHeads(db as never, shared)));
    expect(observed.find(o => o.runId === loanSheet.id)?.sourcesCurrent).toBe(true);
    expect(observed.find(o => o.runId === sheet.id)?.sourcesCurrent).toBe(false);
    expect((await (await loans.GET(new Request(config.appOrigin + "/api/workpapers/emprunts?dossierId=" + dossierA + "&periodId=" + pid, { headers: { cookie: SESSION_COOKIE + "=" + preparer.secret, origin: config.appOrigin } }))).json()).sourcesCurrent[loanSheet.id]).toBe(true);
    const locked = sheet;
    const revised = await ok({ command: "revise", ...target(sheet) });
    expect(revised).toMatchObject({ id: sheet.rootId + ":r2", revision: 2, version: 1, state: "draft", supersedes: sheet.id, importIds: [] });
    expect(revised.leaseWork).toBeUndefined();
    expect(await failure(await command({ command: "execute", ...target(locked) }))).toEqual({ status: 409, error: "L16_REVISION_REPLACED" });
    const history = await view(preparer, dossierA, "&operation=history&id=" + encodeURIComponent(locked.id));
    expect(history.history.map((r: WorkpaperRun) => r.version)).toEqual(Array.from({ length: locked.version }, (_, i) => i + 1));
    const oldVersion = await view(preparer, dossierA, "&operation=version&id=" + encodeURIComponent(locked.id) + "&version=" + locked.version);
    expect(oldVersion.runs[0]).toEqual(locked);
    const heads = [...batches.filter(b => b.document.documentType !== "lease_schedule"), replaced];
    let r2 = await ok({ command: "configure_leases", ...target(revised), work: work(heads) });
    r2 = await ok({ command: "freeze_leases", ...target(r2), criteria: "Révision sur l'échéancier modifié", importIds: heads.map(b => b.id) });
    expect(r2.importIds).toContain(replaced.id);
    expect((await view()).sourcesCurrent[r2.id]).toBe(true);
  }, 60000);

  it("règle remplacée : une feuille d'une autre version de règle est à réviser ; la révision adopte le gabarit courant", async () => {
    // A sheet created under an earlier rule version, written as the store keeps it (append-only: inserted, never rewritten).
    const current = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-regle" });
    const draft: WorkpaperRun = { ...current, id: "workpaper-regle-0-0-9", rootId: "workpaper-regle-0-0-9", template: { ...current.template, version: "0.0.9", rule: { ...current.template.rule!, version: "0.0.9" } } };
    await client`INSERT INTO clients_workpaper_heads (organization_id,dossier_id,period_id,id,version) VALUES (${orgA},${dossierA},${pid},${draft.id},1)`;
    await client`INSERT INTO clients_workpaper_versions (organization_id,dossier_id,period_id,id,version,run) VALUES (${orgA},${dossierA},${pid},${draft.id},1,${JSON.stringify(draft)}::jsonb)`;
    expect(await failure(await command({ command: "configure_leases", ...target(draft), work: work(batches) }))).toEqual({ status: 409, error: "L16_RULE_REPLACED_REVISION_REQUIRED" });
    expect((await view()).ruleCurrent[draft.id]).toBe(false);
    const revised = await ok({ command: "revise", ...target(draft) });
    expect(revised.template).toMatchObject({ version: "1.0.0", rule: { version: "1.0.0" } });
  }, 60000);

  it("profil personnel local : la feuille se prépare sous l'identité du propriétaire, sans seconde identité fictive", async () => {
    let solo = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "c01-solo" }, owner, dossierSolo);
    const pack = await importPack(owner, dossierSolo, ["lease_contracts", "lease_assumptions", "lease_schedule"]);
    solo = await ok({ command: "configure_leases", ...target(solo), work: work(pack) }, owner, dossierSolo);
    solo = await ok({ command: "freeze_leases", ...target(solo), criteria: "Recette solo C01", importIds: pack.map(b => b.id) }, owner, dossierSolo);
    solo = await ok({ command: "execute", ...target(solo) }, owner, dossierSolo);
    expect(solo).toMatchObject({ state: "blocked", preparedBy: LOCAL_OWNER_SUBJECT, leaseWork: { authorId: LOCAL_OWNER_SUBJECT } });
    expect(await view(owner, dossierSolo)).toMatchObject({ actorId: LOCAL_OWNER_SUBJECT, reviewKind: "personal" });
  }, 60000);

  it("le dossier de clôture et la feuille Emprunts se lisent à l'identique avec des feuilles Locations présentes", async () => {
    const after = await (await closing.GET(request(closer, "GET", undefined, dossierA, "", randomUUID(), "/api/workpapers/closing"))).json();
    expect(after).toEqual(closingBefore);
    const all = await readStoreHeads(db as never, { organizationId: orgA, dossierId: dossierA, periodId: pid, mode: "real" });
    expect(all.some(r => r.run.template.id === "ifrs16.leases")).toBe(true);
    expect(sheetLineages(observeRuns(all)).map(l => l.procedure)).toEqual(["loans.review"]);
  }, 60000);

  it("migration 0022 : le retour arrière est refusé tant que des sources ou feuilles Locations existent", async () => {
    const down = readFileSync("drizzle/0022_ifrs16_leases.down.sql", "utf8"), guard = down.slice(down.indexOf("DO $$"), down.indexOf("END $$;") + "END $$;".length);
    await expect(client.unsafe(guard)).rejects.toThrow(/L16_ROLLBACK_DATA_PRESENT/);
    const [{ types }] = await client`SELECT count(DISTINCT document_type)::int AS types FROM clients_imports WHERE document_type LIKE 'lease%'`;
    expect(types).toBe(4);
    await expect(client`INSERT INTO clients_imports (organization_id,dossier_id,period_id,id,document_type,preview,original_base64) VALUES (${orgA},${dossierA},${pid},${randomUUID()},'lease_inconnu','{}'::jsonb,'')`).rejects.toThrow(/clients_imports_document_type_check/);
  });
});

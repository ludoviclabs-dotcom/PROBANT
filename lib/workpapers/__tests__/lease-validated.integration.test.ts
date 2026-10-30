import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { RequestAuthorizer } from "@/lib/auth/authorize";
import { DrizzleDossierOwnershipReader } from "@/lib/auth/dossier-scope";
import { DrizzleSessionStore } from "@/lib/auth/session/store";
import { csrfTokenFor, newSessionSecret, sessionTokenDigest, SESSION_COOKIE, CSRF_HEADER } from "@/lib/auth/session/cookie";
import { LOCAL_ISSUER_PREFIX, LOCAL_OWNER_SUBJECT, type LocalAuthConfig } from "@/lib/auth/local/config";
import type { ImportBatch } from "../imports";
import { leaseHandlers } from "../lease-http";
import { LeaseRuntime } from "../lease-runtime";
import { LEASE_MAPPING, type LeaseType } from "../lease-sources";
import type { LeaseCommand } from "../lease-commands";
import type { LeaseResult } from "../lease-review";
import { contentHash, periodId, type WorkpaperRun } from "../model";
import { decideBundleSelection } from "@/lib/ifrs/shared/selection";
import { assertDisposableDatabase } from "./disposable-database";
import { leaseFiles, LEASE_PERIOD } from "./lease-fixture";

/**
 * L16-02 — chaîne complète avec une règle validée. **Simulation de test** : la relecture nommée de la fiche est remplacée ici par une valeur
 * de recette, pour vérifier le branchement du moteur (exécution réelle, preuves, points de revue, conclusion, relecture personnelle, verrouillage).
 * En dehors de ce fichier, la règle reste `review_required` tant que l'utilisateur n'a pas consigné sa relecture (`lib/ifrs/leases/rule-review.ts`).
 */
vi.mock("@/lib/ifrs/leases/rule-review", () => ({ LEASE_RULE_REVIEW: { reviewedBy: "Relecture simulée de recette", reviewedAt: "2026-10-29T12:00:00.000Z", jurisdiction: "IASB",
  confirmations: { wordByWordParagraphs: true, b9ToB33: true, internalPoliciesAccepted: true, referenceCasesExamined: true } } }));
const databaseUrl = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("recette Locations IFRS 16 — règle validée par simulation, moteur réel, relecture personnelle nommée", () => {
  let client: ReturnType<typeof postgres>, http: ReturnType<typeof leaseHandlers>, sessions: DrizzleSessionStore;
  const now = 1_830_500_000, org = randomUUID(), dossier = randomUUID(), historicalDossier = randomUUID(), pid = periodId(LEASE_PERIOD);
  const config = { secret: "disposable-leases-validated-secret-0000000000000000", idleTtlSeconds: 3600, absoluteTtlSeconds: 7200, appOrigin: "https://probant.example.test" };
  const profileId = randomUUID(), localAuth: LocalAuthConfig = { profileId, issuer: LOCAL_ISSUER_PREFIX + profileId, organizationId: org, ownerName: "Camille Martin (exemple)", ownerReview: "personal", simulationEnabled: false };
  let owner: { secret: string; csrf: string };
  const request = (method = "GET", body?: BodyInit, d: string = dossier) => new Request(config.appOrigin + "/api/workpapers/locations-ifrs16?dossierId=" + d + "&periodId=" + pid, {
    method, headers: { cookie: SESSION_COOKIE + "=" + owner.secret, origin: config.appOrigin, [CSRF_HEADER]: owner.csrf, "Idempotency-Key": randomUUID(), ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  async function ok(body: LeaseCommand, d: string = dossier) { const r = await http.POST(request("POST", JSON.stringify(body), d)); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()).run as WorkpaperRun; }
  const target = (r: WorkpaperRun) => ({ id: r.id, expectedVersion: r.version });
  async function importAll(d: string, files: Partial<Record<LeaseType, File>>, expectedSourceId: string | null = null) {
    const out: ImportBatch[] = [];
    for (const [type, file] of Object.entries(files)) {
      const form = new FormData(); form.set("file", file!); form.set("documentType", type); form.set("mapping", JSON.stringify(LEASE_MAPPING)); form.set("period", JSON.stringify(LEASE_PERIOD));
      const preview = await http.importsPOST(request("POST", form, d)); expect(preview.status, await preview.clone().text()).toBe(200);
      const { batch } = await preview.json();
      const approved = await http.importsPOST(request("POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId }), d));
      expect(approved.status, await approved.clone().text()).toBe(200);
      out.push((await approved.json()).batch);
    }
    return out;
  }
  const work = (batches: ImportBatch[]) => ({ framework: { standard: "IFRS 16" as const, jurisdiction: "IASB" as const, edition: "IFRS 16, IASB 2026", editionFingerprint: null },
    firstApplication: { kind: "not_applicable" as const, reason: "Entité déjà sous IFRS 16 ; aucune méthode de transition choisie" },
    policies: [{ kind: "short_term_exemption" as const, assetCategory: "Matériel de bureau", answer: { kind: "value" as const, value: "not_elected" } }],
    confirmations: [{ contractId: "F01", field: "termMonths", answer: { kind: "value" as const, value: "3" }, citation: { documentVersionId: batches[0].document.id, rowId: batches[0].rows[0].id } }] });

  beforeAll(async () => {
    const u = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || !/(_ci|_test)$/.test(u.pathname)) throw new Error("Disposable local *_ci / *_test database required");
    client = postgres(databaseUrl!, { max: 5, prepare: false, connect_timeout: 3 });
    const db = drizzle(client, { schema });
    await assertDisposableDatabase(client);
    sessions = new DrizzleSessionStore(db);
    const authorizer = new RequestAuthorizer({ sessionStore: sessions, sessionConfig: config, nowEpochSeconds: () => now, dossierOwnership: new DrizzleDossierOwnershipReader(db), localAuth });
    http = leaseHandlers(() => new LeaseRuntime(db, authorizer, () => now), () => {});
    await client`INSERT INTO organizations (id,name) VALUES (${org},'Locations validées')`;
    for (const d of [dossier, historicalDossier]) await client`INSERT INTO dossiers (id,organization_id,external_ref) VALUES (${d},${org},${d})`;
    const secret = newSessionSecret(), record = await sessions.create({ tokenSha256: sessionTokenDigest(secret), issuer: localAuth.issuer, subject: LOCAL_OWNER_SUBJECT, organizationId: org, roles: [], acr: "mfa", amr: ["mfa"], mfaSatisfied: true, nowEpochSeconds: now, idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    owner = { secret, csrf: csrfTokenFor(record.id, config.secret) };
  }, 30000);
  afterAll(async () => { if (client) await client.end(); });

  const view = async (d: string = dossier) => { const r = await http.GET(request("GET", undefined, d)); expect(r.status).toBe(200); return r.json(); };
  it("exécution réelle : chiffres de l'oracle au centime, cadrés sur la base PCG, retraitement proposé puis revu à version exacte ; conclusion, relecture personnelle nommée et verrouillage", async () => {
    let run = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "l16-02-valide" });
    expect(run.template.rule).toMatchObject({ version: "1.0.0", validation: "validated" });
    const batches = await importAll(dossier, leaseFiles());
    run = await ok({ command: "configure_leases", ...target(run), work: work(batches) });
    run = await ok({ command: "freeze_leases", ...target(run), criteria: "Registre complet de l'exercice", importIds: batches.map(b => b.id) });
    run = await ok({ command: "execute", ...target(run) });
    expect(run).toMatchObject({ state: "executed", result: { execution: "completed", outcome: "no_exception_detected" }, notes: [] });
    const result = run.result!.result as LeaseResult;
    expect(result.contracts.map(c => [c.contractId, c.status, c.result])).toEqual([["F01", "eligible_v1", "computed"], ["F03", "eligible_v1", "computed"]]);
    // F01 over 2026 = oracle F01 at 2027-03-31; F03 over 2026 = oracle F03 at 2027-12-31 (same months, same amounts).
    expect(result.contracts[0].closing).toMatchObject({ additions: { amount: "2940.99" }, interest: { amount: "59.01" }, debtClosing: { amount: "0.00" }, depreciation: { amount: "2940.99" }, rouNetClosing: { amount: "0.00" } });
    expect(result.contracts[1].closing).toMatchObject({ additions: { amount: "33421.27" }, interest: { amount: "1398.49" }, debtClosing: { amount: "22819.76" }, depreciation: { amount: "11140.42" }, rouNetClosing: { amount: "22280.85" } });
    expect(result.portfolio.computedSubtotal).toMatchObject({ label: "contrats calculés", contracts: 2, debtClosing: { amount: "22819.76" }, interest: { amount: "1457.50" } });
    expect(result.coverage.ledger).toMatchObject({ lines: 4, matched: 4, unmatched: 0 });
    expect(run.evidence.length).toBe(result.evidence.length);
    // L16-03: both contracts framed; the adjustment carries this sheet's lineage and revision and is materialized at the exact version read.
    expect(result.contracts.map(c => [c.contractId, c.framing.status, c.adjustment.status])).toEqual([["F01", "framed", "included"], ["F03", "framed", "included"]]);
    expect(result.bundle).toMatchObject({ logicalId: "ifrs16.leases:" + run.rootId, revision: 1, runId: run.id, identities: ["ifrs16:lease:F01", "ifrs16:lease:F03"], taxStatus: "not_computed" });
    expect(result.bundleTotals).toEqual({ debit: { amount: "51901.17", currency: "EUR" }, credit: { amount: "51901.17", currency: "EUR" } });
    const read = await view(), proposed = read.adjustments[run.id];
    expect(proposed).toMatchObject({ status: "proposed", runVersion: run.version, contentHash: contentHash(run) });
    // L16-04: the server portfolio view is read from this stored result; the year-end point and the debt bridge equal the canonical subtotal.
    const portfolio = read.portfolio[run.id];
    expect(portfolio.summary).toMatchObject({ registry: 2, results: { computed: 2 }, amounts: { contracts: 2, debtClosing: { amount: "22819.76" }, partial: false } });
    expect(portfolio.charts.points).toHaveLength(12);
    expect(portfolio.charts.points.at(-1)).toMatchObject({ date: "2026-12-31", debt: { amount: "22819.76" }, rouNet: result.portfolio.computedSubtotal!.rouNetClosing });
    expect(portfolio.charts.debtBridge).toMatchObject({ interest: { amount: "1457.50" }, closing: { amount: "22819.76" } });
    expect(portfolio.comparison).toBeNull();
    const contracts = batches.find(b => b.document.documentType === "lease_contracts")!;
    run = await ok({ command: "conclude", ...target(run), text: "Dette et droit d'utilisation recalculés sur paramètres sourcés ; loyers cadrés sur la base PCG ; retraitement proposé, impôt non calculé.", citation: { documentVersionId: contracts.document.id, rowId: contracts.rows[1].id } });
    run = await ok({ command: "submit", ...target(run) });
    run = await ok({ command: "review", ...target(run), decision: "approved", text: "Relecture personnelle des paramètres, de l'échéancier et des preuves.", citation: { documentVersionId: contracts.document.id, rowId: contracts.rows[1].id }, submittedHash: run.submittedHash! });
    expect(run.approval).toMatchObject({ actorId: LOCAL_OWNER_SUBJECT, kind: "personal", reviewerName: "Camille Martin (exemple)" });
    const reviewed = (await view()).adjustments[run.id];
    expect(reviewed).toMatchObject({ status: "reviewed", bundleHash: proposed.bundleHash, runVersion: run.version });
    run = await ok({ command: "lock", ...target(run) });
    expect(run.state).toBe("locked");
    const locked = (await view()).adjustments[run.id];
    expect(locked).toMatchObject({ status: "reviewed", bundleHash: proposed.bundleHash });
    // Selection for a base is decided by the closing journal (L16-05); the pure decision accepts this exact version and nothing older.
    const ledger = batches.find(b => b.document.documentType === "lease_ledger")!;
    const sheet = { runId: run.id, rootId: run.rootId, revision: run.revision, version: run.version, state: run.state, contentHash: contentHash(run), latestRevision: true, sourcesCurrent: true, ruleCurrent: true };
    const manifest = { baseKind: "PCG", sourceRefs: [{ importId: ledger.id, documentVersionId: ledger.document.id, sha256: ledger.document.byteHash }], period: locked.period, includedAdjustments: { kind: "declared", identities: [] },
      declaredBy: LOCAL_OWNER_SUBJECT, declaredAt: "2027-02-20T09:00:00.000Z", limits: "Grand livre PCG du dossier", citation: { documentVersionId: ledger.document.id, importId: ledger.id, fileName: ledger.document.fileName, sha256: ledger.document.byteHash, row: 2 } };
    const decide = (over: Partial<typeof sheet> = {}, expectedVersion = run.version) => decideBundleSelection([], { scope: locked.scope, period: locked.period, bundle: locked, manifest, sheet: { ...sheet, ...over }, actorId: LOCAL_OWNER_SUBJECT, at: "2027-02-20T10:00:00.000Z",
      expected: { runId: run.id, version: expectedVersion, contentHash: sheet.contentHash, bundleHash: locked.bundleHash } });
    expect(decide().effect).toBe("selected");
    expect(() => decide({}, proposed.runVersion)).toThrow("L16_BUNDLE_STALE");

    // Ledger replaced after the review: the frozen version stays readable with its adjustment; every command asks for a revision.
    const replaced = await importAll(dossier, { lease_ledger: leaseFiles(r => { r.lease_ledger[0].details = { ...r.lease_ledger[0].details, fields: { ...(r.lease_ledger[0].details.fields as object), piece: "FA-F01-2026-01-CORRIGEE" } }; }).lease_ledger! }, ledger.id);
    expect(replaced).toHaveLength(1);
    const after = await view();
    expect(after.sourcesCurrent[run.id]).toBe(false);
    expect(after.adjustments[run.id]).toMatchObject({ status: "reviewed", bundleHash: proposed.bundleHash });
    expect(() => decide({ sourcesCurrent: false })).toThrow("L16_BUNDLE_STALE");
    const refused = await http.POST(request("POST", JSON.stringify({ command: "conclude", ...target(run), text: "Reprise.", citation: { documentVersionId: contracts.document.id, rowId: contracts.rows[1].id } })));
    expect(refused.status).toBe(409); expect((await refused.json()).error).toBe("L16_SOURCE_REPLACED_REVISION_REQUIRED");
  }, 90000);

  it("contrat historique sans ouverture : diagnostic, point bloquant sans montant ; l'approbation est refusée tant qu'il n'est pas résolu", async () => {
    // F03 started on 2025-01-01 here: a takeover in 2026 without lease_opening.
    const files = leaseFiles(r => {
      const c = r.lease_contracts.find(x => x.key === "F03")!, f = c.details.fields as Record<string, string>;
      c.date = "2025-01-01"; f.endDate = "2027-12-31"; f.signatureDate = "2024-12-15";
      r.lease_schedule = r.lease_schedule.map(d => d.details.contractId !== "F03" ? d : { ...d, date: shift(d.date), key: "F03-" + shift(d.date), details: { ...d.details, fields: { contractVersion: "v1", ...(shift(d.date) <= LEASE_PERIOD.asOfDate ? { paidDate: shift(d.date), paidAmount: "1000.00" } : { paidDate: "non_applicable", paidAmount: "non_applicable" }) } } });
    });
    let run = await ok({ command: "create_leases", period: LEASE_PERIOD, instanceKey: "l16-02-historique" }, historicalDossier);
    const batches = await importAll(historicalDossier, files);
    run = await ok({ command: "configure_leases", ...target(run), work: work(batches) }, historicalDossier);
    run = await ok({ command: "freeze_leases", ...target(run), criteria: "Reprise d'un contrat historique", importIds: batches.map(b => b.id) }, historicalDossier);
    run = await ok({ command: "execute", ...target(run) }, historicalDossier);
    const result = run.result!.result as LeaseResult, f03 = result.contracts.find(c => c.contractId === "F03")!;
    expect(f03).toMatchObject({ status: "eligible_v1", result: "diagnostic" });
    expect(run.notes).toEqual([expect.objectContaining({ id: "lease:F03", blocking: true, amount: { kind: "unknown", reason: expect.any(String) } })]);
    expect(result.portfolio.blockedIds).toEqual(["F03"]);
    const contracts = batches.find(b => b.document.documentType === "lease_contracts")!, citation = { documentVersionId: contracts.document.id, rowId: contracts.rows[0].id };
    run = await ok({ command: "conclude", ...target(run), text: "Reprise historique non cadrée : diagnostic.", citation }, historicalDossier);
    run = await ok({ command: "submit", ...target(run) }, historicalDossier);
    const refused = await http.POST(request("POST", JSON.stringify({ command: "review", ...target(run), decision: "approved", text: "Relecture.", citation, submittedHash: run.submittedHash! }), historicalDossier));
    expect(refused.status).toBe(422); expect((await refused.json()).error).toBe("UNRESOLVED_BLOCKING_NOTE");
  }, 90000);
});
/** Shift a 2026 due date to the same month of 2025, at its month end. */
function shift(date: string) { const y = Number(date.slice(0, 4)) - 1, m = Number(date.slice(5, 7)); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }

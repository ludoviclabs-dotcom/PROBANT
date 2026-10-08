import type { AuthenticatedPrincipal } from "@/lib/auth/principal";
import { AuthorizationDenied } from "@/lib/auth/principal";
import type { ProbantRole } from "@/lib/auth/roles";
import type { ImportBatch } from "../imports";
import type { WorkpaperRun, WorkpaperScope } from "../model";
import type { CashDatabase, CashImportRecord, CashSourceHead, CashTx } from "../cash-store";

/** TEST DOUBLE ONLY — in-process state with copy-on-write transactions. It proves runtime rules, never durability. */
interface State {
  dossiers: Record<string, { organizationId: string; createdAt: string }>;
  imports: Record<string, { type: string; batch: ImportBatch; original: string }[]>;
  approvals: Record<string, Record<string, { actorId: string; at: string; previewHash: string }>>;
  heads: Record<string, Record<string, string>>;
  runHeads: Record<string, Record<string, number>>;
  versions: Record<string, Record<string, WorkpaperRun[]>>;
  receipts: Record<string, Record<string, { requestHash: string; response: unknown }>>;
}
const key = (s: WorkpaperScope) => { if (s.mode !== "real") throw new Error("CASH_REAL_SCOPE_REQUIRED"); return [s.organizationId, s.dossierId, s.periodId].join("|"); };
export class MemoryCashDatabase implements CashDatabase {
  state: State = { dossiers: {}, imports: {}, approvals: {}, heads: {}, runHeads: {}, versions: {}, receipts: {} };
  private queue: Promise<unknown> = Promise.resolve();
  writes = 0;
  addDossier(dossierId: string, organizationId: string, createdAt = "2025-03-01T08:00:00.000Z") { this.state.dossiers[dossierId] = { organizationId, createdAt }; }
  transaction<T>(body: (tx: CashTx) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const draft: State = structuredClone(this.state);
      const result = await body(new MemoryCashTx(draft, () => { this.writes++; }));
      this.state = draft; // commit only after the whole body succeeded
      return structuredClone(result);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
class MemoryCashTx implements CashTx {
  constructor(private readonly s: State, private readonly wrote: () => void) {}
  async ownsDossierForUpdate(scope: WorkpaperScope) { return this.s.dossiers[scope.dossierId]?.organizationId === scope.organizationId; }
  async dossierCreatedAt(scope: WorkpaperScope) { const d = this.s.dossiers[scope.dossierId]; return d && d.organizationId === scope.organizationId ? d.createdAt : null; }
  async sizes(scope: WorkpaperScope) {
    const versions = Object.values(this.s.versions[key(scope)] ?? {}).flat();
    return { versions: versions.length, versionBytes: versions.reduce((n, v) => n + JSON.stringify(v).length, 0), sourceBytes: (this.s.imports[key(scope)] ?? []).reduce((n, i) => n + JSON.stringify(i.batch).length + i.original.length, 0) };
  }
  async imports(scope: WorkpaperScope): Promise<CashImportRecord[]> {
    const approvals = this.s.approvals[key(scope)] ?? {};
    return [...(this.s.imports[key(scope)] ?? [])].sort((a, b) => a.batch.id.localeCompare(b.batch.id)).map(i => ({ originalBase64: i.original,
      batch: approvals[i.batch.id] ? { ...i.batch, approval: approvals[i.batch.id], report: { ...i.batch.report, calculationAllowed: true } } : i.batch }));
  }
  async insertImport(scope: WorkpaperScope, type: string, batch: ImportBatch, original: string) {
    const list = (this.s.imports[key(scope)] ??= []);
    if (!list.some(i => i.batch.id === batch.id)) { list.push({ type, batch, original }); this.wrote(); }
  }
  async approveImport(scope: WorkpaperScope, importId: string, actorId: string, at: string, previewHash: string) {
    const approvals = (this.s.approvals[key(scope)] ??= {});
    if (!approvals[importId]) { approvals[importId] = { actorId, at, previewHash }; this.wrote(); }
  }
  async heads(scope: WorkpaperScope): Promise<CashSourceHead[]> { return Object.entries(this.s.heads[key(scope)] ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([document_type, import_id]) => ({ document_type, import_id })); }
  async setHead(scope: WorkpaperScope, type: string, importId: string) { (this.s.heads[key(scope)] ??= {})[type] = importId; this.wrote(); }
  async lockRun() {}
  async currentRun(scope: WorkpaperScope, id: string) { const v = this.s.runHeads[key(scope)]?.[id]; return v === undefined ? null : this.s.versions[key(scope)][id].find(r => r.version === v) ?? null; }
  async runIds(scope: WorkpaperScope) { return Object.keys(this.s.runHeads[key(scope)] ?? {}).sort(); }
  async insertRunHead(scope: WorkpaperScope, id: string, version: number) { const heads = (this.s.runHeads[key(scope)] ??= {}); if (id in heads) return false; heads[id] = version; this.wrote(); return true; }
  async moveRunHead(scope: WorkpaperScope, id: string, from: number, to: number) { const heads = this.s.runHeads[key(scope)]; if (heads?.[id] !== from) return false; heads[id] = to; return true; }
  async appendVersion(run: WorkpaperRun) {
    const list = ((this.s.versions[key(run.scope)] ??= {})[run.id] ??= []);
    if (list.some(r => r.version === run.version)) throw new Error("CASH_APPEND_ONLY");
    list.push(structuredClone(run)); this.wrote();
  }
  async history(scope: WorkpaperScope, id: string) { return [...(this.s.versions[key(scope)]?.[id] ?? [])].sort((a, b) => a.version - b.version); }
  async allVersions(scope: WorkpaperScope) { return Object.keys(this.s.versions[key(scope)] ?? {}).sort().flatMap(id => this.s.versions[key(scope)][id]); }
  async receipt(scope: WorkpaperScope, actorId: string, idempotencyKey: string) { return this.s.receipts[key(scope)]?.[actorId + "|" + idempotencyKey] ?? null; }
  async putReceipt(scope: WorkpaperScope, actorId: string, idempotencyKey: string, requestHash: string, response: unknown) { (this.s.receipts[key(scope)] ??= {})[actorId + "|" + idempotencyKey] = { requestHash, response: structuredClone(response) }; }
}
/** Test authorizer: identities are fixed server-side by the test, keyed by an opaque header; roles are never read from the body. */
export class TestAuthorizer {
  identities: Record<string, AuthenticatedPrincipal> = {};
  add(token: string, subject: string, organizationId: string, roles: ProbantRole[], expiresAtEpochSeconds = 2_000_000_000) {
    this.identities[token] = { subject, organizationId, roles, dossierIds: null, authenticationMethod: "oidc-session", amr: ["mfa"], acr: "mfa", mfaSatisfied: true, expiresAtEpochSeconds };
  }
  async authorize(request: Request) {
    const identity = this.identities[request.headers.get("x-test-session") ?? ""];
    if (!identity) throw new AuthorizationDenied("AUTHENTICATION_REQUIRED", "Session requise.", 401);
    return identity;
  }
}

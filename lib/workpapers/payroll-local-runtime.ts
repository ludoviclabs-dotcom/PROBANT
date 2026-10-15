import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { ApiError } from "@/lib/api/errors";
import { assertDossierPermission, isExpired } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import { durableChainEnabled, executionProfile } from "@/lib/runtime/profile";
import { stableSha256, canonicalJson } from "@/lib/synthesis/canonical";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodIssues } from "@/lib/canonical-model/period";
import { periodId, contentHash, assertScope, type ProcedureTemplate, type WorkpaperScope } from "./model";
import type { Permission } from "./policy";
import { PayrollRuntime } from "./payroll-runtime";
import { PayrollImports, PayrollWorkpaperRepository, type PayrollDatabase, type PayrollTx } from "./payroll-store";
import { authorizePayroll, type HRPrincipal, type PayrollCommand, type PayrollMapping, type PayrollState } from "./payroll-contract";
import { payrollObservation } from "./payroll-observation";
import { WorkpaperService } from "./service";
import { CalculationRegistry } from "./calculations";
const permissions: Record<Permission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", download: "dossier:export" };
export function requireLocalPayroll() {
  if (executionProfile(process.env) !== "personal_local" || !durableChainEnabled(process.env, "PROBANT_PAYROLL_DURABLE")) throw new ApiError("HR_REAL_DISABLED", "Paie persistante réservée au profil personnel local.", 503);
}
function template(leave: boolean): ProcedureTemplate {
  const id = leave ? "payroll.leave" : "payroll.review";
  return { id, version: "1.0.0", objective: leave ? "Comparer les méthodes sur les mêmes droits documentés" : "Rapprocher journal, GL, déclaration et règlements par mois", kind: "calculated", assertions: [{ label: "Exhaustivité et rattachement — visés, non attestés", validation: "proposed" }], requiredDocumentTypes: [], rule: { id, version: "1.0.0", authority: "internal", source: "docs/workpapers/MISSION18-PAYROLL.md#c12", effectiveFrom: "2000-01-01", validation: "validated" } };
}
/** No process-local dossier cache: every request reloads the PostgreSQL transaction. */
export class LocalPayrollRuntime {
  constructor(private db: PayrollDatabase, private authorizer: Pick<RequestAuthorizer, "authorize">, private now: () => number = Date.now) {}
  private async transaction<T>(request: Request, dossierId: string, pid: string, permission: Permission, body: (tx: PayrollTx, scope: WorkpaperScope, actor: HRPrincipal) => Promise<T>) {
    requireLocalPayroll();
    const identity = await this.authorizer.authorize(request, { dossierId, permission: permissions[permission] });
    assertDossierPermission(identity, dossierId, permissions[permission]);
    if (identity.authenticationMethod !== "local-session" || isExpired(identity, Math.floor(this.now()/1000))) throw new ApiError("HR_FORBIDDEN", "Session personnelle locale requise.", 403);
    const scope: WorkpaperScope = { organizationId: identity.organizationId, dossierId, periodId: pid, mode: "real" };
    // RH is explicit server configuration, separate from general dossier roles.
    if (process.env.PROBANT_LOCAL_HR !== "enabled" || identity.subject !== "proprietaire-local") throw new ApiError("HR_FORBIDDEN", "Accès RH non accordé par ce profil.", 403);
    const actor: HRPrincipal = { id: identity.subject, review: identity.reviewKind, displayName: identity.displayName, personalLocal: true,
      grants: [{ scope, permissions: (Object.keys(permissions) as Permission[]).filter(p => hasPermission(identity.roles, permissions[p])) }],
      hrGrants: [{ scope, permissions: ["read", "prepare", "export"] }] };
    authorizePayroll(actor, scope, permission === "download" ? "export" : permission === "prepare" ? "prepare" : "read");
    return this.db.transaction(async tx => {
      if (!await tx.ownsDossierForUpdate(scope)) throw new ApiError("HR_FORBIDDEN", "Dossier inaccessible.", 403);
      const value = await body(tx, scope, actor);
      if (isExpired(identity, Math.floor(this.now()/1000))) throw Error("SESSION_INVALID");
      return value;
    });
  }
  async check(request: Request, dossierId: string, pid: string, prepare = false) { return this.transaction(request, dossierId, pid, prepare ? "prepare" : "read", async () => {}); }
  private async load(tx: PayrollTx, scope: WorkpaperScope) {
    const archive = await tx.archive(scope);
    if (!archive) throw Error("HR_NOT_INITIALIZED");
    assertScope(scope, archive.state.scope);
    const port = { approveAndSave: async (batch: Parameters<import("./payroll-runtime").PayrollImportPort["approveAndSave"]>[0], file: File, actor: HRPrincipal, hash: string, at: string) => {
      if (batch.previewHash !== hash) throw Error("HR_PREVIEW_STALE");
      const { sha256 } = await import("@/lib/evidence/hash");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (sha256(bytes) !== batch.document.byteHash) throw Error("SOURCE_BYTES_CHANGED");
      await tx.insertImport(scope, batch.document.documentType, batch, bytes.toString("base64"));
      await tx.approveImport(scope, batch.id, actor.id, at, hash);
      await tx.setHead(scope, batch.document.documentType, batch.id);
      return { ...batch, approval: { actorId: actor.id, at, previewHash: hash }, report: { ...batch.report, calculationAllowed: true } };
    } };
    return PayrollRuntime.restore(archive, port, this.now);
  }
  private async save(tx: PayrollTx, scope: WorkpaperScope, runtime: PayrollRuntime, actor: HRPrincipal) {
    const archive = await runtime.archive(actor);
    if (Buffer.byteLength(JSON.stringify(archive)) > 32 * 1024 * 1024) throw new ApiError("HR_STATE_LIMIT", "Historique local volumineux : export requis.", 413);
    await tx.saveArchive(scope, archive);
    return archive;
  }
  private async view(tx: PayrollTx, scope: WorkpaperScope, runtime: PayrollRuntime, actor: HRPrincipal) {
    const runs = (await Promise.all((await tx.runIds(scope)).map(id => tx.currentRun(scope,id)))).filter(r => !!r);
    const current = runs.filter(r => !runs.some(other => other.rootId === r.rootId && other.revision > r.revision));
    return { ...runtime.read(actor), actorId: actor.id, reviewKind: actor.review, reviewerName: actor.displayName, executionProfile: "personal_local", runs: current };
  }
  async read(request: Request, dossierId: string, pid: string) { return this.transaction(request,dossierId,pid,"read",async(tx,scope,actor)=>this.view(tx,scope,await this.load(tx,scope),actor)); }
  private async receipt<T>(tx: PayrollTx, scope: WorkpaperScope, actor: HRPrincipal, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw Error("IDEMPOTENCY_KEY_REQUIRED");
    const hash = stableSha256(payload), existing = await tx.receipt(scope,actor.id,key);
    if (existing) { if (existing.requestHash !== hash) throw Error("IDEMPOTENCY_KEY_REUSED"); return existing.response as T; }
    const response = await body(); await tx.putReceipt(scope,actor.id,key,hash,response); return response;
  }
  async initialize(request: Request, dossierId: string, period: AccountingPeriod, key: string) {
    if (periodIssues(period).length) throw Error("HR_SCOPE_INVALID");
    return this.transaction(request,dossierId,periodId(period),"prepare",async(tx,scope,actor)=>this.receipt(tx,scope,actor,key,{ period },async()=>{
      let archive = await tx.archive(scope);
      if (archive && stableSha256(archive.state.period) !== stableSha256(period)) throw Error("HR_PERIOD_CONFLICT");
      archive ??= { state: { scope, period, version: 1, sources: {}, exclusions: [], reviews: [] }, history: [], audit: [], previews: [] };
      await tx.saveArchive(scope,archive);
      return this.view(tx,scope,await this.load(tx,scope),actor);
    }));
  }
  async preview(request: Request,dossierId:string,pid:string,file:File,mapping:PayrollMapping,key:string) {
    return this.transaction(request,dossierId,pid,"prepare",async(tx,scope,actor)=>{
      const bytes=Buffer.from(await file.arrayBuffer());
      return this.receipt(tx,scope,actor,key,{ mapping, bytes: stableSha256([...bytes]) },async()=>{
        const runtime=await this.load(tx,scope), preview=await runtime.preview(actor,file,mapping);
        await this.save(tx,scope,runtime,actor); return preview;
      });
    });
  }
  private async observe(tx: PayrollTx, scope: WorkpaperScope, actor: HRPrincipal, state: PayrollState) {
    const repository=new PayrollWorkpaperRepository(tx), imports=PayrollImports.from(await tx.imports(scope));
    for (const leave of [false,true]) {
      const t=template(leave), observation=payrollObservation(state,leave);
      if (!observation.kinds.some(k=>state.sources[k])) continue;
      const service=new WorkpaperService(repository,imports,new CalculationRegistry(),async()=>actor,()=>new Date(this.now()).toISOString(),leave?"payroll.leave":"payroll.review");
      const candidates=(await tx.allVersions(scope)).filter(r=>r.template.id===t.id).sort((a,b)=>b.revision-a.revision||b.version-a.version);
      let run=candidates[0];
      if (run?.result && stableSha256(run.result.result) === stableSha256(observation.result)) continue;
      run=run ? await service.revise(scope,run.id,run.version,t) : await service.create(scope,state.period,t,"local-payroll");
      await service.recordPayroll(scope,run.id,run.version,state,observation);
    }
  }
  async command(request:Request,dossierId:string,pid:string,command:PayrollCommand,key:string) {
    return this.transaction(request,dossierId,pid,"prepare",async(tx,scope,actor)=>this.receipt(tx,scope,actor,key,command,async()=>{
      const runtime=await this.load(tx,scope); await runtime.command(actor,command);
      const archive=await this.save(tx,scope,runtime,actor); await this.observe(tx,scope,actor,archive.state);
      return this.view(tx,scope,runtime,actor);
    }));
  }
  async review(request:Request,dossierId:string,pid:string,input:{id:string;version:number;hash:string;note:string},key:string) {
    return this.transaction(request,dossierId,pid,"review",async(tx,scope,actor)=>this.receipt(tx,scope,actor,key,input,async()=>{
      const repository=new PayrollWorkpaperRepository(tx), run=await repository.get(scope,input.id);
      if (!run || run.version!==input.version || contentHash(run)!==input.hash) throw Error("HR_VERSION_CONFLICT");
      const current=(await tx.allVersions(scope)).filter(r=>r.rootId===run.rootId).sort((a,b)=>b.revision-a.revision||b.version-a.version)[0];
      if(current.id!==run.id)throw Error("HR_REVIEW_STALE");
      const service=new WorkpaperService(repository,PayrollImports.from(await tx.imports(scope)),new CalculationRegistry(),async()=>actor,()=>new Date(this.now()).toISOString(),run.template.id==="payroll.leave"?"payroll.leave":"payroll.review");
      let next=await service.conclude(scope,run.id,run.version,input.note);
      next=await service.transition(scope,next.id,next.version,"awaiting_review");
      next=await service.transition(scope,next.id,next.version,"approved",input.note,next.submittedHash);
      await service.lock(scope,next.id,next.version);
      return this.view(tx,scope,await this.load(tx,scope),actor);
    }));
  }
  async download(request:Request,dossierId:string,pid:string,documentId:string) { return this.transaction(request,dossierId,pid,"download",async(tx,scope,actor)=>PayrollImports.from(await tx.imports(scope)).download(scope,documentId,actor)); }
  async export(request:Request,dossierId:string,pid:string,version:number) {
    return this.transaction(request,dossierId,pid,"download",async(tx,scope,actor)=>{
      const runtime=await this.load(tx,scope), archive=await runtime.archive(actor);
      if (archive.state.version!==version)throw Error("HR_VERSION_CONFLICT");
      const records=await tx.imports(scope);
      for(const r of records) PayrollImports.from(records).download(scope,r.batch.document.id,actor);
      const body={ format:"payroll-local-1", scope, version, view:await this.view(tx,scope,runtime,actor), history:archive.history, state:archive.state,
        pieces:records.map(r=>({batch:r.batch,originalBase64:r.originalBase64})), nativeDsnParser:false, reviewNotice:"Relecture personnelle nommée du profil solo ; aucune revue indépendante par deux personnes réelles." };
      return canonicalJson({ ...body, hash:stableSha256(body) });
    });
  }
}

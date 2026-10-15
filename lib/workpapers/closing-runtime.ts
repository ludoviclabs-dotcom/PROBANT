import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import type { RequestAuthorizer } from "@/lib/auth/authorize";
import { assertDossierPermission, isExpired, type AuthenticatedPrincipal } from "@/lib/auth/principal";
import { hasPermission, type Permission as AuthPermission } from "@/lib/auth/roles";
import { sha256 } from "@/lib/evidence/hash";
import { neutralizeFileName } from "@/lib/security/filename";
import { detectSignature } from "@/lib/security/magic-bytes";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CL_COMMAND_PERMISSION, CL_HASH_NOTICE, type ClosingCommand, type PieceKind } from "./closing-contract";
import { observeRuns, type CycleObservation } from "./closing-cycles";
import { sourcesCurrentAdapter } from "./closing-adapters";
import { decide, decideUpload, type Decision } from "./closing-decide";
import { evaluateClosing, journalView } from "./closing-evaluate";
import { EVENT_MAP_FAILURES, EVENT_MAP_NOT_READ, type EventMapRead, type EventMapReader } from "./closing-events";
import { projectDossier } from "./closing-projection";
import { buildClosingDossierPackage, type ClosingExportFormat } from "@/lib/evidence/closing-dossier-package";
import { eventHash, fold, type ClosingEvent } from "./closing-journal";
import { ClosingConflict, type ClosingDatabase, type ClosingTx } from "./closing-store";
import { periodId, type WorkpaperScope } from "./model";
import { executionProfile } from "@/lib/runtime/profile";

export type ClosingPermission = "read" | "prepare" | "review" | "sign" | "download";
const permissions: Record<ClosingPermission, AuthPermission> = { read: "dossier:read", prepare: "dossier:upload", review: "dossier:review", sign: "dossier:sign", download: "dossier:export" };
const LIMITS = { events: 3000, eventBytes: 16 * 1024 * 1024, pieceBytes: 48 * 1024 * 1024, file: 3 * 1024 * 1024, response: 10 * 1024 * 1024 };
/**
 * Authority to record (or reopen) a closing validation: a capability supplied by the trusted server, never inferred from a general role nor read from the request.
 * The `dossier:sign` permission is necessary but not sufficient. The default grants it to nobody until a professional authorization source is validated.
 */
export type ClosingAuthority = (identity: AuthenticatedPrincipal, scope: WorkpaperScope) => boolean;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], JPEG = [0xff, 0xd8, 0xff];

/** Durable server runtime of the professional file. Identity, permissions, dates, authors, identifiers and citations come from the server only. */
export class ClosingRuntime {
  constructor(private readonly db: ClosingDatabase, private readonly authorizer: Pick<RequestAuthorizer, "authorize">, private readonly now: () => number = () => Math.floor(Date.now() / 1000),
    private readonly closingAuthority: ClosingAuthority = () => false, private readonly newId: () => string = randomUUID, private readonly eventMap: EventMapReader = async () => EVENT_MAP_NOT_READ) {}
  async check(request: Request, dossierId: string, permission: ClosingPermission) { await this.identity(request, dossierId, permission); }
  private async identity(request: Request, dossierId: string, permission: ClosingPermission) {
    const identity = await this.authorizer.authorize(request, { dossierId, permission: permissions[permission] });
    assertDossierPermission(identity, dossierId, permissions[permission]);
    if (isExpired(identity, this.now())) throw new Error("SESSION_INVALID");
    return identity;
  }
  private async transaction<T>(request: Request, dossierId: string, pid: string, permission: ClosingPermission, body: (tx: ClosingTx, scope: WorkpaperScope, identity: AuthenticatedPrincipal) => Promise<T>) {
    const identity = await this.identity(request, dossierId, permission);
    const scope: WorkpaperScope = { organizationId: identity.organizationId, dossierId, periodId: pid, mode: "real" };
    return this.db.transaction(async tx => {
      if (!(await tx.ownsDossierForUpdate(scope))) throw new Error("WORKPAPER_FORBIDDEN");
      const result = await body(tx, scope, identity);
      // Authorization is rechecked at the end of the transaction: an expired session commits nothing.
      if (isExpired(identity, this.now())) throw new Error("SESSION_INVALID");
      return result;
    });
  }
  private granted(identity: AuthenticatedPrincipal) { return (Object.keys(permissions) as ClosingPermission[]).filter(p => hasPermission(identity.roles, permissions[p])); }
  private async bounded(tx: ClosingTx, scope: WorkpaperScope) {
    const size = await tx.sizes(scope);
    if (size.events > LIMITS.events || size.eventBytes > LIMITS.eventBytes || size.pieceBytes > LIMITS.pieceBytes) throw new ApiError("CL_STATE_LIMIT", "Dossier trop volumineux pour cette recette.", 413);
  }
  /** Current heads of every family with their sources checked by each family's own adapter (C14): a source replaced after a lock is seen, nothing is recalculated. */
  private async observe(tx: ClosingTx, scope: WorkpaperScope) { return observeRuns(await tx.cycleRuns(scope), sourcesCurrentAdapter(await tx.cycleSourceHeads(scope))); }
  /**
   * The transversal events map (C11), read through its own runtime and authorization before the file transaction (never inside it: the dossier row stays locked by
   * one connection only). A map of another dossier or period is not retained; an unreadable map is stated as such and its effects stay unknown, never zero.
   */
  private async events(request: Request, dossierId: string, pid: string): Promise<EventMapRead> {
    try {
      const read = await this.eventMap(request, dossierId, pid);
      if (read.status === "lue" && (read.map.scope.dossierId !== dossierId || read.map.scope.periodId !== pid)) return { status: "non_lue", reason: "Carte d’un autre dossier ou d’une autre période, non retenue" };
      return read;
    } catch (error) {
      const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message.split(":")[0] : "ERREUR";
      return { status: "non_lue", reason: EVENT_MAP_FAILURES[code] ?? "Carte des événements illisible (" + code + ")" };
    }
  }
  /** Evaluation and single projection of the file, from the same journal, observation and events map. */
  private async model(tx: ClosingTx, scope: WorkpaperScope, observed?: CycleObservation[], eventMap: EventMapRead = EVENT_MAP_NOT_READ) {
    const events = await tx.events(scope), state = fold(events), observations = observed ?? await this.observe(tx, scope);
    const evaluation = evaluateClosing(state, observations, eventMap), journal = journalView(events);
    return { state, evaluation, journal, projection: projectDossier({ dossierId: scope.dossierId, periodId: scope.periodId, seq: state.seq, headHash: state.headHash, evaluation, journal }) };
  }
  /** Read model: journal, folded state, evaluation, projection and observed cycle sheets, computed in the same transaction. */
  private async view(tx: ClosingTx, scope: WorkpaperScope, identity: AuthenticatedPrincipal, eventMap: EventMapRead, observed?: CycleObservation[]) {
    const { state, evaluation, journal, projection } = await this.model(tx, scope, observed, eventMap);
    const response = { actorId: identity.subject, permissions: this.granted(identity), executionProfile: executionProfile(process.env), closingAuthority: this.closingAuthority(identity, scope) === true,
      reviewKind: identity.reviewKind, reviewerName: identity.reviewKind === "personal" ? identity.displayName : undefined, dossierId: scope.dossierId, periodId: scope.periodId,
      seq: state.seq, headHash: state.headHash, hashNotice: CL_HASH_NOTICE, pieces: state.pieces, evaluation, projection, journal };
    if (Buffer.byteLength(JSON.stringify(response)) > LIMITS.response) throw new ApiError("CL_STATE_LIMIT", "Dossier trop volumineux pour cette recette.", 413);
    return response;
  }
  private async receipt<T>(tx: ClosingTx, scope: WorkpaperScope, actorId: string, key: string, payload: unknown, body: () => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const hash = stableSha256(payload), existing = await tx.receipt(scope, actorId, key);
    if (existing) { if (existing.requestHash !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return existing.response as T; }
    const response = await body();
    await tx.putReceipt(scope, actorId, key, hash, response);
    return response;
  }
  /** Appends exactly one event after the current head; a concurrent writer surfaces as a conflict, never as a merge. */
  private async append(tx: ClosingTx, scope: WorkpaperScope, actorId: string, at: string, decision: Decision, head: { seq: number; hash: string }) {
    const base = { seq: head.seq + 1, id: this.newId(), type: decision.type, actorId, at, payload: decision.payload, prevHash: head.hash };
    const event: ClosingEvent = { ...base, hash: eventHash(base) };
    if (Buffer.byteLength(JSON.stringify(event)) > 256 * 1024) throw new ApiError("CL_EVENT_LIMIT", "Événement trop volumineux.", 413);
    if (!(await tx.appendEvent(scope, event))) throw new ClosingConflict(head.seq + 1, head.seq);
    return { seq: event.seq, type: event.type, eventId: event.id };
  }
  async read(request: Request, dossierId: string, pid: string) {
    const eventMap = await this.events(request, dossierId, pid);
    return this.transaction(request, dossierId, pid, "read", async (tx, scope, identity) => { await this.bounded(tx, scope); return this.view(tx, scope, identity, eventMap); });
  }
  async command(request: Request, dossierId: string, pid: string, command: ClosingCommand, key: string) {
    const permission = CL_COMMAND_PERMISSION[command.command], eventMap = await this.events(request, dossierId, pid);
    return this.transaction(request, dossierId, pid, permission, async (tx, scope, identity) => {
      await this.bounded(tx, scope);
      // The cycle sheets are observed once per transaction: the decision and the returned view rest on the same observation.
      const observations = await this.observe(tx, scope);
      const applied = await this.receipt(tx, scope, identity.subject, key, command, async () => {
        const state = fold(await tx.events(scope)), at = new Date(this.now() * 1000).toISOString();
        if (command.command === "open" && periodId(command.period) !== pid) throw new Error("WORKPAPER_PERIOD_INVALID");
        if (command.expectedSeq !== state.seq) throw new ClosingConflict(state.seq, command.expectedSeq);
        const decision = decide(state, command, { actorId: identity.subject, at, closingAuthority: permission === "sign" && this.closingAuthority(identity, scope) === true, observations,
          ...(identity.reviewKind ? { reviewKind: identity.reviewKind } : {}), ...(identity.displayName ? { displayName: identity.displayName } : {}) });
        return this.append(tx, scope, identity.subject, at, decision, { seq: state.seq, hash: state.headHash });
      });
      return { applied, view: await this.view(tx, scope, identity, eventMap, observations) };
    });
  }
  async upload(request: Request, dossierId: string, pid: string, file: File, meta: { expectedSeq: number; label: string; kind: PieceKind; pieceId?: string }, key: string) {
    const eventMap = await this.events(request, dossierId, pid);
    return this.transaction(request, dossierId, pid, "prepare", async (tx, scope, identity) => {
      await this.bounded(tx, scope);
      if (!file.size || file.size > LIMITS.file) throw new ApiError("CL_FILE_LIMIT", "Pièce limitée à 3 Mio pour cette recette.", 413);
      const bytes = Buffer.from(await file.arrayBuffer()), head = bytes.subarray(0, 16);
      // The content decides, not the declared type: PDF, office containers, delimited text and images only.
      const image = [PNG, JPEG].some(sig => sig.every((b, i) => head[i] === b));
      if (!image && !["pdf", "zip", "text"].includes(detectSignature(head))) throw new Error("CL_FILE_TYPE_UNSUPPORTED");
      const digest = sha256(bytes), fileName = neutralizeFileName(file.name) || "piece";
      const applied = await this.receipt(tx, scope, identity.subject, key, { operation: "upload", ...meta, sha256: digest, fileName }, async () => {
        const state = fold(await tx.events(scope)), at = new Date(this.now() * 1000).toISOString();
        if (meta.expectedSeq !== state.seq) throw new ClosingConflict(state.seq, meta.expectedSeq);
        const size = await tx.sizes(scope);
        if (size.pieceBytes + bytes.toString("base64").length > LIMITS.pieceBytes) throw new ApiError("CL_STATE_LIMIT", "Volume des pièces de cette recette atteint : aucune nouvelle pièce n’est conservée.", 413);
        const decision = decideUpload(state, { ...meta, fileName, sha256: digest, size: bytes.length });
        await tx.insertPiece(scope, String(decision.payload.pieceVersionId), digest, bytes.toString("base64"));
        return this.append(tx, scope, identity.subject, at, decision, { seq: state.seq, hash: state.headHash });
      });
      return { applied, view: await this.view(tx, scope, identity, eventMap) };
    });
  }
  /**
   * Export of the single projection (C14): the same denominators as the matrix and the cockpit. The browser names the projection it has read;
   * a newer state is a conflict, and the session, permission and state are checked again after rendering, before any byte is returned.
   * The events map is read again for the check: a map changed since (its hash is in the projection) is a conflict too.
   */
  async export(request: Request, dossierId: string, pid: string, format: ClosingExportFormat, expectedSnapshot: string) {
    const eventMap = await this.events(request, dossierId, pid);
    const { projection, journal } = await this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
      const model = await this.model(tx, scope, undefined, eventMap);
      if (model.projection.hash !== expectedSnapshot) throw new Error("EXPORT_SNAPSHOT_CONFLICT");
      return { projection: model.projection, journal: model.journal };
    });
    const pack = await buildClosingDossierPackage(projection, journal, format), again = await this.events(request, dossierId, pid);
    await this.transaction(request, dossierId, pid, "download", async (tx, scope) => { if ((await this.model(tx, scope, undefined, again)).projection.hash !== expectedSnapshot) throw new Error("EXPORT_SNAPSHOT_CONFLICT"); });
    return pack;
  }
  async download(request: Request, dossierId: string, pid: string, pieceVersionId: string) {
    return this.transaction(request, dossierId, pid, "download", async (tx, scope) => {
      const state = fold(await tx.events(scope)), piece = state.pieces.find(p => p.pieceVersionId === pieceVersionId);
      if (!piece) return null;
      const stored = await tx.pieceBytes(scope, pieceVersionId);
      if (!stored) return null;
      const bytes = Buffer.from(stored.base64, "base64");
      if (sha256(bytes) !== piece.sha256 || stored.sha256 !== piece.sha256) throw new Error("CL_PIECE_BYTES_CHANGED");
      return { bytes: Uint8Array.from(bytes), fileName: piece.fileName };
    });
  }
}

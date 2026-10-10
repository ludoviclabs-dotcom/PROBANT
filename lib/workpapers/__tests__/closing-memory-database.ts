import type { WorkpaperRun, WorkpaperScope } from "../model";
import type { CycleFamily } from "../closing-contract";
import type { ClosingEvent } from "../closing-journal";
import type { ClosingDatabase, ClosingTx } from "../closing-store";

/** TEST DOUBLE ONLY — in-process journal with copy-on-write transactions. It proves runtime rules, never durability (see closing-durable.integration.test.ts). */
interface State {
  dossiers: Record<string, { organizationId: string }>;
  events: Record<string, ClosingEvent[]>;
  pieces: Record<string, Record<string, { sha256: string; base64: string }>>;
  receipts: Record<string, Record<string, { requestHash: string; response: unknown }>>;
}
/** A cycle test store seen through its current heads only (read-only, like the PostgreSQL adapter). */
export interface CycleSource { family: CycleFamily; runs(scope: WorkpaperScope): Promise<WorkpaperRun[]> }
/** Reads the current head of every run of a Trésorerie-style test double without cloning its whole state (sources included). */
export function memoryCycleSource(family: CycleFamily, db: { state: { runHeads: Record<string, Record<string, number>>; versions: Record<string, Record<string, WorkpaperRun[]>> } }): CycleSource {
  return { family, async runs(scope) {
    const k = key(scope), heads = db.state.runHeads[k] ?? {};
    return Object.keys(heads).sort().map(id => db.state.versions[k][id].find(r => r.version === heads[id])).filter((r): r is WorkpaperRun => !!r).map(r => structuredClone(r));
  } };
}
const key = (s: WorkpaperScope) => { if (s.mode !== "real") throw new Error("CL_REAL_SCOPE_REQUIRED"); return [s.organizationId, s.dossierId, s.periodId].join("|"); };

class MemoryClosingTx implements ClosingTx {
  constructor(private readonly s: State, private readonly cycles: CycleSource[]) {}
  async ownsDossierForUpdate(scope: WorkpaperScope) { return this.s.dossiers[scope.dossierId]?.organizationId === scope.organizationId; }
  async events(scope: WorkpaperScope) { return structuredClone(this.s.events[key(scope)] ?? []); }
  async appendEvent(scope: WorkpaperScope, event: ClosingEvent) {
    const list = (this.s.events[key(scope)] ??= []);
    if (list.some(e => e.seq === event.seq || e.id === event.id)) return false;
    list.push(structuredClone(event)); return true;
  }
  async insertPiece(scope: WorkpaperScope, id: string, sha256: string, base64: string) {
    const map = (this.s.pieces[key(scope)] ??= {});
    if (map[id]) throw new Error("CL_APPEND_ONLY");
    map[id] = { sha256, base64 };
  }
  async pieceBytes(scope: WorkpaperScope, id: string) { return this.s.pieces[key(scope)]?.[id] ?? null; }
  async sizes(scope: WorkpaperScope) {
    const events = this.s.events[key(scope)] ?? [];
    return { events: events.length, eventBytes: events.reduce((n, e) => n + JSON.stringify(e.payload).length, 0), pieceBytes: Object.values(this.s.pieces[key(scope)] ?? {}).reduce((n, p) => n + p.base64.length, 0) };
  }
  async receipt(scope: WorkpaperScope, actorId: string, k: string) { return this.s.receipts[key(scope)]?.[actorId + "|" + k] ?? null; }
  async putReceipt(scope: WorkpaperScope, actorId: string, k: string, requestHash: string, response: unknown) { (this.s.receipts[key(scope)] ??= {})[actorId + "|" + k] = { requestHash, response: structuredClone(response) }; }
  async cycleRuns(scope: WorkpaperScope) {
    const out: { family: CycleFamily; run: WorkpaperRun }[] = [];
    for (const c of this.cycles) out.push(...(await c.runs(scope)).map(run => ({ family: c.family, run })));
    return out;
  }
}
export class MemoryClosingDatabase implements ClosingDatabase {
  state: State = { dossiers: {}, events: {}, pieces: {}, receipts: {} };
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly cycles: CycleSource[] = []) {}
  addDossier(dossierId: string, organizationId: string) { this.state.dossiers[dossierId] = { organizationId }; }
  transaction<T>(body: (tx: ClosingTx) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const draft: State = structuredClone(this.state);
      const result = await body(new MemoryClosingTx(draft, this.cycles));
      this.state = draft; // commit only after the whole body succeeded
      return structuredClone(result);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

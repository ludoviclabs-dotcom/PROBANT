import { randomUUID } from "node:crypto";
import { StockRuntime } from "../stock-runtime";
import { stockHandlers } from "../stock-http";
import type { StockCommand } from "../stock-commands";
import type { StockDraft } from "../stock-contract";
import type { StockSourceType } from "../stock-sources";
import type { ImportBatch } from "../imports";
import type { WorkpaperRun } from "../model";
import { ST_CSV, stMapping, stPeriod, stScope } from "./stock-fixtures";
import { MemoryCashDatabase, TestAuthorizer } from "./cash-memory-database";

export const ST_DOSSIER = stScope.dossierId, ST_OTHER_DOSSIER = "99999999-9999-4999-8999-999999999999";
type Batch = ImportBatch & { rowCount?: number };
export type StockSources = Partial<Record<StockSourceType, Batch>>;
/**
 * Real runtime and handlers over the in-memory TEST store (the Trésorerie double, generic over runs and imports).
 * Every response comes from the engine, never from hand-written JSON; this proves runtime rules, never durability.
 */
export function createStockHarness(start = 1_801_000_000, options: { directImports?: boolean; valued?: boolean } = {}) {
  const db = new MemoryCashDatabase(), auth = new TestAuthorizer(), clock = { now: start };
  db.addDossier(ST_DOSSIER, stScope.organizationId); db.addDossier(ST_OTHER_DOSSIER, "org-other");
  auth.add("preparer", "preparer-st", stScope.organizationId, ["preparer"]); auth.add("reviewer", "reviewer-st", stScope.organizationId, ["reviewer"]);
  auth.add("outsider", "outsider", "org-other", ["preparer", "reviewer"]); auth.add("expired", "preparer-st", stScope.organizationId, ["preparer"], start - 1);
  const runtime = () => new StockRuntime(db, auth, () => clock.now);
  let handlers = stockHandlers(runtime, () => {});
  const url = (dossier = ST_DOSSIER, extra = "") => "https://probant.test/api/workpapers/stocks?dossierId=" + dossier + "&periodId=" + stScope.periodId + extra;
  const request = (session: string, method = "GET", body?: BodyInit, dossier = ST_DOSSIER, extra = "", key: string = randomUUID()) =>
    new Request(url(dossier, extra), { method, headers: { "x-test-session": session, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const h = {
    db, auth, clock, request, json,
    get handlers() { return handlers; },
    restart() { handlers = stockHandlers(() => new StockRuntime(db, auth, () => clock.now), () => {}); },
    async command(body: object, session = "preparer", key: string = randomUUID(), dossier = ST_DOSSIER) { return json(await handlers.POST(request(session, "POST", JSON.stringify(body), dossier, "", key))); },
    async ok(body: StockCommand, session = "preparer"): Promise<WorkpaperRun> { const r = await h.command(body, session); if (r.status !== 200) throw new Error("Commande refusée : " + JSON.stringify(r.body)); return r.body.run as WorkpaperRun; },
    async read(session = "preparer", extra = "") { return json(await handlers.GET(request(session, "GET", undefined, ST_DOSSIER, extra))); },
    // jsdom replaces FormData: presentation fixtures call the same runtime method without the multipart transport.
    async preview(type: StockSourceType, text = ST_CSV[type], session = "preparer", coverage?: { from: string; to: string }) {
      const file = new File([text], type + ".csv", { type: "text/csv" }), mapping = stMapping(type, coverage, options.valued);
      if (options.directImports) return { status: 200, body: await runtime().preview(request(session), ST_DOSSIER, stPeriod, file, mapping, type, randomUUID()) };
      const form = new FormData();
      for (const [k, v] of Object.entries({ file, period: JSON.stringify(stPeriod), documentType: type, mapping: JSON.stringify(mapping) })) form.set(k, v);
      return json(await handlers.importsPOST(request(session, "POST", form)));
    },
    async approve(batch: Batch, session = "preparer"): Promise<Batch> {
      const heads = (await h.read(session)).body.sourceHeads as { document_type: string; import_id: string }[];
      const r = json(await handlers.importsPOST(request(session, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(x => x.document_type === batch.document.documentType)?.import_id ?? null }))));
      const done = await r; if (done.status !== 200) throw new Error("Approbation refusée : " + JSON.stringify(done.body)); return done.body.batch;
    },
    async accept(p: { status: number; body: { batch: Batch } }): Promise<Batch> { if (p.status !== 200) throw new Error("Aperçu refusé : " + JSON.stringify(p.body)); return h.approve(p.body.batch); },
    /** Every source of the reference case, or the subset named. */
    async importAll(types: StockSourceType[] = ["st_count", "st_system", "st_movements", "st_support"]): Promise<StockSources> {
      const out: StockSources = {};
      for (const t of types) out[t] = await h.accept(await h.preview(t));
      return out;
    },
    async create(): Promise<WorkpaperRun> { return h.ok({ command: "create", period: stPeriod }); },
    draft(sources: StockSources, overrides: Partial<StockDraft> = {}): StockDraft {
      const s = sources.st_support!;
      return { sameDay: "before_count", instructions: { documentId: s.document.id, rowId: s.rows.find(r => r.original.Piece === "INSTR-INV")!.id }, ...overrides };
    },
    async frozen(sources?: StockSources, overrides: Partial<StockDraft> = {}): Promise<{ sources: StockSources; run: WorkpaperRun }> {
      const s = sources ?? await h.importAll();
      let run = await h.create();
      run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(s).map(b => b!.id), draft: h.draft(s, overrides) });
      return { sources: s, run };
    },
    async executed(sources?: StockSources, overrides: Partial<StockDraft> = {}) {
      const { sources: s, run } = await h.frozen(sources, overrides);
      return { sources: s, run: await h.ok({ command: "execute", id: run.id, expectedVersion: run.version }) };
    },
  };
  return h;
}
export type StockHarness = ReturnType<typeof createStockHarness>;

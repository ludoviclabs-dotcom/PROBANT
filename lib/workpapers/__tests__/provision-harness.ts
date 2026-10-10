import { randomUUID } from "node:crypto";
import { ProvisionRuntime } from "../provision-runtime";
import { provisionHandlers } from "../provision-http";
import type { ProvisionCommand } from "../provision-commands";
import type { ProvisionDraft } from "../provision-contract";
import type { ProvisionSourceType } from "../provision-sources";
import type { ImportBatch } from "../imports";
import type { WorkpaperRun } from "../model";
import { PV_CSV, pvMapping, pvPeriod, pvScope } from "./provision-fixtures";
import { MemoryCashDatabase, TestAuthorizer } from "./cash-memory-database";

export const PV_DOSSIER = pvScope.dossierId, PV_OTHER_DOSSIER = "99999999-9999-4999-8999-999999999999";
/** Synthetic subjects holding the confidential capability in the recipe; in the durable server, nobody holds it by default. */
export const PV_CONFIDENTIAL_SUBJECTS = new Set(["preparer-pv", "counsel-pv"]);
type Batch = ImportBatch & { rowCount?: number; maskedRows?: number };
export type ProvisionSources = Partial<Record<ProvisionSourceType, Batch>>;
/**
 * Real runtime and handlers over the in-memory TEST store (the Trésorerie double, generic over runs and imports).
 * Every response comes from the engine, never from hand-written JSON; this proves runtime rules, never durability.
 */
export function createProvisionHarness(start = 1_801_000_000, options: { directImports?: boolean } = {}) {
  const db = new MemoryCashDatabase(), auth = new TestAuthorizer(), clock = { now: start };
  db.addDossier(PV_DOSSIER, pvScope.organizationId); db.addDossier(PV_OTHER_DOSSIER, "org-other");
  auth.add("preparer", "preparer-pv", pvScope.organizationId, ["preparer"]); auth.add("reviewer", "reviewer-pv", pvScope.organizationId, ["reviewer"]);
  auth.add("counsel", "counsel-pv", pvScope.organizationId, ["reviewer"]);
  auth.add("outsider", "outsider", "org-other", ["preparer", "reviewer"]); auth.add("expired", "preparer-pv", pvScope.organizationId, ["preparer"], start - 1);
  const runtime = () => new ProvisionRuntime(db, auth, () => clock.now, identity => PV_CONFIDENTIAL_SUBJECTS.has(identity.subject));
  let handlers = provisionHandlers(runtime, () => {});
  const url = (dossier = PV_DOSSIER, extra = "") => "https://probant.test/api/workpapers/provisions?dossierId=" + dossier + "&periodId=" + pvScope.periodId + extra;
  const request = (session: string, method = "GET", body?: BodyInit, dossier = PV_DOSSIER, extra = "", key: string = randomUUID()) =>
    new Request(url(dossier, extra), { method, headers: { "x-test-session": session, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const h = {
    db, auth, clock, request, json,
    get handlers() { return handlers; },
    restart() { handlers = provisionHandlers(runtime, () => {}); },
    async command(body: object, session = "preparer", key: string = randomUUID(), dossier = PV_DOSSIER) { return json(await handlers.POST(request(session, "POST", JSON.stringify(body), dossier, "", key))); },
    async ok(body: ProvisionCommand, session = "preparer"): Promise<WorkpaperRun> { const r = await h.command(body, session); if (r.status !== 200) throw new Error("Commande refusée : " + JSON.stringify(r.body)); return r.body.run as WorkpaperRun; },
    async read(session = "preparer", extra = "") { return json(await handlers.GET(request(session, "GET", undefined, PV_DOSSIER, extra))); },
    // jsdom replaces FormData: presentation fixtures call the same runtime method without the multipart transport.
    async preview(type: ProvisionSourceType, text = PV_CSV[type], session = "preparer") {
      const file = new File([text], type + ".csv", { type: "text/csv" }), mapping = pvMapping(type);
      if (options.directImports) return { status: 200, body: await runtime().preview(request(session), PV_DOSSIER, pvPeriod, file, mapping, type, randomUUID()) };
      const form = new FormData();
      for (const [k, v] of Object.entries({ file, period: JSON.stringify(pvPeriod), documentType: type, mapping: JSON.stringify(mapping) })) form.set(k, v);
      return json(await handlers.importsPOST(request(session, "POST", form)));
    },
    async approve(batch: Batch, session = "preparer"): Promise<Batch> {
      const heads = (await h.read(session)).body.sourceHeads as { document_type: string; import_id: string }[];
      const done = await json(await handlers.importsPOST(request(session, "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(x => x.document_type === batch.document.documentType)?.import_id ?? null }))));
      if (done.status !== 200) throw new Error("Approbation refusée : " + JSON.stringify(done.body)); return done.body.batch;
    },
    async accept(p: { status: number; body: { batch: Batch } }): Promise<Batch> { if (p.status !== 200) throw new Error("Aperçu refusé : " + JSON.stringify(p.body)); return h.approve(p.body.batch); },
    /** Every source of the reference case, or the subset named. */
    async importAll(types: ProvisionSourceType[] = ["pv_register", "pv_movements", "pv_estimates", "pv_ledger", "pv_annex", "pv_support"]): Promise<ProvisionSources> {
      const out: ProvisionSources = {};
      for (const t of types) out[t] = await h.accept(await h.preview(t));
      return out;
    },
    async create(): Promise<WorkpaperRun> { return h.ok({ command: "create", period: pvPeriod }); },
    draft(sources: ProvisionSources, overrides: Partial<ProvisionDraft> = {}): ProvisionDraft {
      const s = sources.pv_support;
      return { lawyers: s ? { status: "obtained", citation: { documentId: s.document.id, rowId: s.rows.find(r => r.original.Piece === "LET-AVOCATS")!.id } } : { status: "not_obtained", reason: "Pièces non encore reçues à la date de revue" }, ...overrides };
    },
    async frozen(sources?: ProvisionSources, overrides: Partial<ProvisionDraft> = {}): Promise<{ sources: ProvisionSources; run: WorkpaperRun }> {
      const s = sources ?? await h.importAll();
      let run = await h.create();
      run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(s).map(b => b!.id), draft: h.draft(s, overrides) });
      return { sources: s, run };
    },
    async executed(sources?: ProvisionSources, overrides: Partial<ProvisionDraft> = {}) {
      const { sources: s, run } = await h.frozen(sources, overrides);
      return { sources: s, run: await h.ok({ command: "execute", id: run.id, expectedVersion: run.version }) };
    },
  };
  return h;
}
export type ProvisionHarness = ReturnType<typeof createProvisionHarness>;

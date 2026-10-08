import { randomUUID } from "node:crypto";
import { CashRuntime } from "../cash-runtime";
import { cashHandlers } from "../cash-http";
import type { CashCommand } from "../cash-commands";
import type { CashSourceType } from "../cash-sources";
import type { CashDraft } from "../cash-reconciliation";
import type { CashMissionSnapshot } from "../cash-mission";
import type { WorkpaperRun } from "../model";
import { CASH_CSV, cashMapping, cashPeriod, cashScope } from "./cash-reconciliation-fixtures";
import { MemoryCashDatabase, TestAuthorizer } from "./cash-memory-database";

export const CASH_DOSSIER = cashScope.dossierId, CASH_OTHER_DOSSIER = "22222222-2222-4222-8222-222222222222";
/** Real runtime and handlers over the in-memory test store; every response comes from the engine, never from hand-written JSON. */
export function createCashHarness(start = 1_740_000_000, options: { directImports?: boolean } = {}) {
  const db = new MemoryCashDatabase(), auth = new TestAuthorizer(), clock = { now: start };
  db.addDossier(CASH_DOSSIER, cashScope.organizationId); db.addDossier(CASH_OTHER_DOSSIER, "org-other");
  auth.add("preparer", "preparer-cash", cashScope.organizationId, ["preparer"]); auth.add("reviewer", "reviewer-cash", cashScope.organizationId, ["reviewer"]);
  auth.add("outsider", "outsider", "org-other", ["preparer", "reviewer"]); auth.add("expired", "preparer-cash", cashScope.organizationId, ["preparer"], start - 1);
  const runtime = () => new CashRuntime(db, auth, () => clock.now);
  let handlers = cashHandlers(runtime, () => {});
  const url = (dossier = CASH_DOSSIER, extra = "") => "https://probant.test/api/workpapers/cash?dossierId=" + dossier + "&periodId=" + cashScope.periodId + extra;
  const request = (session: string, method = "GET", body?: BodyInit, dossier = CASH_DOSSIER, extra = "", key: string = randomUUID()) =>
    new Request(url(dossier, extra), { method, headers: { "x-test-session": session, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const h = {
    db, auth, clock, request, json,
    get handlers() { return handlers; },
    restart() { handlers = cashHandlers(() => new CashRuntime(db, auth, () => clock.now), () => {}); },
    async command(body: object, session = "preparer", key: string = randomUUID(), dossier = CASH_DOSSIER) { return json(await handlers.POST(request(session, "POST", JSON.stringify(body), dossier, "", key))); },
    async ok(body: CashCommand, session = "preparer") { const r = await h.command(body, session); if (r.status !== 200) throw new Error("Commande refusée : " + JSON.stringify(r.body)); return r.body.run as WorkpaperRun; },
    async read(session = "preparer", extra = "") { return json(await handlers.GET(request(session, "GET", undefined, CASH_DOSSIER, extra))); },
    async mission(session = "preparer", extra = "") { return (await h.read(session, "&operation=mission" + extra)).body.mission as CashMissionSnapshot; },
    async preview(type: CashSourceType, text = CASH_CSV[type], session = "preparer") {
      // jsdom replaces FormData: presentation fixtures call the same runtime method without the multipart transport.
      if (options.directImports) return { status: 200, body: await runtime().preview(request(session), CASH_DOSSIER, cashPeriod, new File([text], type + ".csv", { type: "text/csv" }), cashMapping(type), type, randomUUID()) };
      const form = new FormData();
      form.set("file", new File([text], type + ".csv", { type: "text/csv" })); form.set("mapping", JSON.stringify(cashMapping(type))); form.set("period", JSON.stringify(cashPeriod)); form.set("documentType", type);
      return json(await handlers.importsPOST(request(session, "POST", form)));
    },
    async importSource(type: CashSourceType, text = CASH_CSV[type]) {
      const p = await h.preview(type, text); if (p.status !== 200) throw new Error("Aperçu refusé : " + JSON.stringify(p.body));
      const heads = (await h.read()).body.sourceHeads as { document_type: string; import_id: string }[];
      const a = await json(await handlers.importsPOST(request("preparer", "POST", JSON.stringify({ command: "approve_import", importId: p.body.batch.id, previewHash: p.body.batch.previewHash, expectedSourceId: heads.find(x => x.document_type === type)?.import_id ?? null }))));
      if (a.status !== 200) throw new Error("Approbation refusée : " + JSON.stringify(a.body));
      return a.body.batch as { id: string; document: { id: string } };
    },
    async importAll(texts: Partial<Record<CashSourceType, string>> = {}) {
      const ids: Record<string, string> = {};
      for (const type of ["cash_ledger", "cash_statement", "cash_erb", "cash_settlements", "cash_support"] as CashSourceType[]) ids[type] = (await h.importSource(type, texts[type])).id;
      return ids;
    },
    documented(settlements: string) { return { startDate: "2025-01-01", endDate: "2025-02-28", coverage: "documented" as const, note: "Relevés de janvier et février 2025 obtenus", evidenceImportIds: [settlements] }; },
    draft(ids: Record<string, string>, extra: Partial<CashDraft> = {}): CashDraft {
      return { window: h.documented(ids.cash_settlements), exclusions: [], allocations: [{ id: "A-R1-S1", itemId: "R1", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }], corrections: [], ...extra };
    },
    async frozenRun(texts: Partial<Record<CashSourceType, string>> = {}) {
      const ids = await h.importAll(texts);
      let run = await h.ok({ command: "create", period: cashPeriod });
      run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), window: h.documented(ids.cash_settlements) });
      return { ids, run };
    },
    /** Nominal recipe up to an executed result: bank 90 + 15 − 5 = GL 100; R1 cleared or partially cleared, P1 open. */
    async executed(options: { partial?: boolean } = {}) {
      const texts = options.partial ? { cash_settlements: CASH_CSV.cash_settlements.replace("S1;15.00", "S1;10.00") } : {};
      const { ids, run: frozen } = await h.frozenRun(texts);
      const allocations = [{ id: "A-R1-S1", itemId: "R1", settlementId: "S1", amount: { amount: options.partial ? "10.00" : "15.00", currency: "EUR" as const } }];
      let run = await h.ok({ command: "configure", id: frozen.id, expectedVersion: frozen.version, draft: h.draft(ids, { allocations }) });
      run = await h.ok({ command: "execute", id: run.id, expectedVersion: run.version });
      return { ids, run };
    },
  };
  return h;
}
export type CashHarness = ReturnType<typeof createCashHarness>;

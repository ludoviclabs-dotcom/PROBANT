import { randomUUID } from "node:crypto";
import { EquityRuntime } from "../equity-runtime";
import { equityHandlers } from "../equity-http";
import type { EquityCommand } from "../equity-commands";
import type { EquityTabularType } from "../equity-sources";
import type { EquityDraft } from "../equity-review";
import type { EquityMissionSnapshot } from "../equity-mission";
import type { WorkpaperRun } from "../model";
import { EQ_CSV, EQ_MINUTES, EQ_TABULAR_ORDER, eqDraft, eqMapping, eqPeriod, eqScope, minutesPdf } from "./equity-fixtures";
import { MemoryCashDatabase, TestAuthorizer } from "./cash-memory-database";

export const EQ_DOSSIER = eqScope.dossierId, EQ_OTHER_DOSSIER = "66666666-6666-4666-8666-666666666666";
type Minutes = typeof EQ_MINUTES[number];
/**
 * Real runtime and handlers over the in-memory TEST store (the Trésorerie double, generic over runs and imports).
 * Every response comes from the engine, never from hand-written JSON; this proves runtime rules, never durability.
 */
export function createEquityHarness(start = 1_743_500_000, options: { directImports?: boolean } = {}) {
  const db = new MemoryCashDatabase(), auth = new TestAuthorizer(), clock = { now: start };
  db.addDossier(EQ_DOSSIER, eqScope.organizationId); db.addDossier(EQ_OTHER_DOSSIER, "org-other");
  auth.add("preparer", "preparer-eq", eqScope.organizationId, ["preparer"]); auth.add("reviewer", "reviewer-eq", eqScope.organizationId, ["reviewer"]);
  auth.add("outsider", "outsider", "org-other", ["preparer", "reviewer"]); auth.add("expired", "preparer-eq", eqScope.organizationId, ["preparer"], start - 1);
  const runtime = () => new EquityRuntime(db, auth, () => clock.now);
  let handlers = equityHandlers(runtime, () => {});
  const url = (dossier = EQ_DOSSIER, extra = "") => "https://probant.test/api/workpapers/capitaux-propres?dossierId=" + dossier + "&periodId=" + eqScope.periodId + extra;
  const request = (session: string, method = "GET", body?: BodyInit, dossier = EQ_DOSSIER, extra = "", key: string = randomUUID()) =>
    new Request(url(dossier, extra), { method, headers: { "x-test-session": session, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const h = {
    db, auth, clock, request, json,
    get handlers() { return handlers; },
    restart() { handlers = equityHandlers(() => new EquityRuntime(db, auth, () => clock.now), () => {}); },
    async command(body: object, session = "preparer", key: string = randomUUID(), dossier = EQ_DOSSIER) { return json(await handlers.POST(request(session, "POST", JSON.stringify(body), dossier, "", key))); },
    async ok(body: EquityCommand, session = "preparer") { const r = await h.command(body, session); if (r.status !== 200) throw new Error("Commande refusée : " + JSON.stringify(r.body)); return r.body.run as WorkpaperRun; },
    async read(session = "preparer", extra = "") { return json(await handlers.GET(request(session, "GET", undefined, EQ_DOSSIER, extra))); },
    async mission(session = "preparer", extra = "") { return (await h.read(session, "&operation=mission" + extra)).body.mission as EquityMissionSnapshot; },
    async preview(type: EquityTabularType, text = EQ_CSV[type], session = "preparer") {
      // jsdom replaces FormData: presentation fixtures call the same runtime method without the multipart transport.
      if (options.directImports) return { status: 200, body: await runtime().preview(request(session), EQ_DOSSIER, eqPeriod, new File([text], type + ".csv", { type: "text/csv" }), eqMapping(type), type, randomUUID()) };
      const form = new FormData();
      form.set("file", new File([text], type + ".csv", { type: "text/csv" })); form.set("mapping", JSON.stringify(eqMapping(type))); form.set("period", JSON.stringify(eqPeriod)); form.set("documentType", type);
      return json(await handlers.importsPOST(request(session, "POST", form)));
    },
    async previewPv(m: Minutes, bytes?: Uint8Array, session = "preparer") {
      const file = new File([new Uint8Array(bytes ?? await minutesPdf(m.title, m.pages))], m.pieceRef + ".pdf", { type: "application/pdf" }), form = { pieceRef: m.pieceRef, title: m.title, documentDate: m.documentDate };
      if (options.directImports) return { status: 200, body: await runtime().previewMinutes(request(session), EQ_DOSSIER, eqPeriod, file, form, randomUUID()) };
      const data = new FormData();
      data.set("file", file); data.set("minutes", JSON.stringify(form)); data.set("period", JSON.stringify(eqPeriod)); data.set("documentType", "eq_minutes");
      return json(await handlers.importsPOST(request(session, "POST", data)));
    },
    async approve(batch: { id: string; previewHash: string; document: { logicalId: string } }) {
      const heads = (await h.read()).body.sourceHeads as { document_type: string; import_id: string }[];
      const a = await json(await handlers.importsPOST(request("preparer", "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(x => x.document_type === batch.document.logicalId)?.import_id ?? null }))));
      if (a.status !== 200) throw new Error("Approbation refusée : " + JSON.stringify(a.body));
      return a.body.batch as { id: string; document: { id: string; logicalId: string } };
    },
    async importSource(type: EquityTabularType, text = EQ_CSV[type]) {
      const p = await h.preview(type, text); if (p.status !== 200) throw new Error("Aperçu refusé : " + JSON.stringify(p.body));
      return h.approve(p.body.batch);
    },
    async importPv(m: Minutes) {
      const p = await h.previewPv(m); if (p.status !== 200) throw new Error("Aperçu PV refusé : " + JSON.stringify(p.body));
      return h.approve(p.body.batch);
    },
    async importAll(texts: Partial<Record<EquityTabularType, string>> = {}, types: EquityTabularType[] = EQ_TABULAR_ORDER, minutes: Minutes[] = EQ_MINUTES) {
      const ids: Record<string, string> = {};
      for (const type of types) ids[type] = (await h.importSource(type, texts[type])).id;
      for (const m of minutes) ids["eq_minutes:" + m.pieceRef] = (await h.importPv(m)).id;
      return ids;
    },
    async frozenRun(texts: Partial<Record<EquityTabularType, string>> = {}, draft: EquityDraft = { readings: [] }, types?: EquityTabularType[], minutes?: Minutes[]) {
      const ids = await h.importAll(texts, types, minutes);
      let run = await h.ok({ command: "create", period: eqPeriod });
      run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), draft });
      return { ids, run };
    },
    /** Recipe up to an executed result with every available PV reading validated. */
    async executed(texts: Partial<Record<EquityTabularType, string>> = {}, draft: EquityDraft = eqDraft()) {
      const { ids, run: frozen } = await h.frozenRun(texts, draft);
      const run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
      return { ids, run };
    },
  };
  return h;
}
export type EquityHarness = ReturnType<typeof createEquityHarness>;

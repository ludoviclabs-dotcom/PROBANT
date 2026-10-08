import { randomUUID } from "node:crypto";
import { FixedAssetRuntime } from "../fixed-asset-runtime";
import { fixedAssetHandlers } from "../fixed-asset-http";
import type { FixedAssetCommand } from "../fixed-asset-commands";
import type { FixedAssetSourceType } from "../fixed-asset-sources";
import type { FixedAssetDraft } from "../fixed-asset-review";
import type { FixedAssetMissionSnapshot } from "../fixed-asset-mission";
import type { WorkpaperRun } from "../model";
import { FA_CSV, FA_TYPE_ORDER, faDraft, faMapping, faPeriod, faScope } from "./fixed-asset-fixtures";
import { MemoryCashDatabase, TestAuthorizer } from "./cash-memory-database";

export const FA_DOSSIER = faScope.dossierId, FA_OTHER_DOSSIER = "44444444-4444-4444-8444-444444444444";
/**
 * Real runtime and handlers over the in-memory TEST store (the Trésorerie double, generic over runs and imports).
 * Every response comes from the engine, never from hand-written JSON; this proves runtime rules, never durability.
 */
export function createFixedAssetHarness(start = 1_743_500_000, options: { directImports?: boolean } = {}) {
  const db = new MemoryCashDatabase(), auth = new TestAuthorizer(), clock = { now: start };
  db.addDossier(FA_DOSSIER, faScope.organizationId); db.addDossier(FA_OTHER_DOSSIER, "org-other");
  auth.add("preparer", "preparer-fa", faScope.organizationId, ["preparer"]); auth.add("reviewer", "reviewer-fa", faScope.organizationId, ["reviewer"]);
  auth.add("outsider", "outsider", "org-other", ["preparer", "reviewer"]); auth.add("expired", "preparer-fa", faScope.organizationId, ["preparer"], start - 1);
  const runtime = () => new FixedAssetRuntime(db, auth, () => clock.now);
  let handlers = fixedAssetHandlers(runtime, () => {});
  const url = (dossier = FA_DOSSIER, extra = "") => "https://probant.test/api/workpapers/immobilisations?dossierId=" + dossier + "&periodId=" + faScope.periodId + extra;
  const request = (session: string, method = "GET", body?: BodyInit, dossier = FA_DOSSIER, extra = "", key: string = randomUUID()) =>
    new Request(url(dossier, extra), { method, headers: { "x-test-session": session, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const h = {
    db, auth, clock, request, json,
    get handlers() { return handlers; },
    restart() { handlers = fixedAssetHandlers(() => new FixedAssetRuntime(db, auth, () => clock.now), () => {}); },
    async command(body: object, session = "preparer", key: string = randomUUID(), dossier = FA_DOSSIER) { return json(await handlers.POST(request(session, "POST", JSON.stringify(body), dossier, "", key))); },
    async ok(body: FixedAssetCommand, session = "preparer") { const r = await h.command(body, session); if (r.status !== 200) throw new Error("Commande refusée : " + JSON.stringify(r.body)); return r.body.run as WorkpaperRun; },
    async read(session = "preparer", extra = "") { return json(await handlers.GET(request(session, "GET", undefined, FA_DOSSIER, extra))); },
    async mission(session = "preparer", extra = "") { return (await h.read(session, "&operation=mission" + extra)).body.mission as FixedAssetMissionSnapshot; },
    async preview(type: FixedAssetSourceType, text = FA_CSV[type], session = "preparer") {
      // jsdom replaces FormData: presentation fixtures call the same runtime method without the multipart transport.
      if (options.directImports) return { status: 200, body: await runtime().preview(request(session), FA_DOSSIER, faPeriod, new File([text], type + ".csv", { type: "text/csv" }), faMapping(type), type, randomUUID()) };
      const form = new FormData();
      form.set("file", new File([text], type + ".csv", { type: "text/csv" })); form.set("mapping", JSON.stringify(faMapping(type))); form.set("period", JSON.stringify(faPeriod)); form.set("documentType", type);
      return json(await handlers.importsPOST(request(session, "POST", form)));
    },
    async importSource(type: FixedAssetSourceType, text = FA_CSV[type]) {
      const p = await h.preview(type, text); if (p.status !== 200) throw new Error("Aperçu refusé : " + JSON.stringify(p.body));
      const heads = (await h.read()).body.sourceHeads as { document_type: string; import_id: string }[];
      const a = await json(await handlers.importsPOST(request("preparer", "POST", JSON.stringify({ command: "approve_import", importId: p.body.batch.id, previewHash: p.body.batch.previewHash, expectedSourceId: heads.find(x => x.document_type === type)?.import_id ?? null }))));
      if (a.status !== 200) throw new Error("Approbation refusée : " + JSON.stringify(a.body));
      return a.body.batch as { id: string; document: { id: string } };
    },
    async importAll(texts: Partial<Record<FixedAssetSourceType, string>> = {}, types: FixedAssetSourceType[] = FA_TYPE_ORDER) {
      const ids: Record<string, string> = {};
      for (const type of types) ids[type] = (await h.importSource(type, texts[type])).id;
      return ids;
    },
    async frozenRun(texts: Partial<Record<FixedAssetSourceType, string>> = {}, draft: FixedAssetDraft = faDraft()) {
      const ids = await h.importAll(texts);
      let run = await h.ok({ command: "create", period: faPeriod });
      run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: Object.values(ids), draft });
      return { ids, run };
    },
    /** Recipe up to an executed result: A-001 écart −1, A-002 recalculé, A-003 / A-005 bloqués, A-004 non applicable, T-001 exclu. */
    async executed(texts: Partial<Record<FixedAssetSourceType, string>> = {}, draft: FixedAssetDraft = faDraft()) {
      const { ids, run: frozen } = await h.frozenRun(texts, draft);
      const run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
      return { ids, run };
    },
  };
  return h;
}
export type FixedAssetHarness = ReturnType<typeof createFixedAssetHarness>;

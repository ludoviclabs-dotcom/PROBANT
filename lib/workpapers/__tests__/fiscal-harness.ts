import { randomUUID } from "node:crypto";
import { FiscalRuntime } from "../fiscal-runtime";
import { fiscalHandlers } from "../fiscal-http";
import type { FiscalCommand } from "../fiscal-commands";
import type { FiscalTabularType } from "../fiscal-sources";
import type { VatDraft } from "../fiscal-vat";
import type { FiscalMissionSnapshot } from "../fiscal-mission";
import type { ImportBatch } from "../imports";
import type { WorkpaperRun } from "../model";
import { CA3_T1, CA3_T2, ca3Text, fecText, FX_CSV, FX_SIREN, fxMapping, fxPeriod, fxScope, T1, T2 } from "./fiscal-fixtures";
import { MemoryCashDatabase, TestAuthorizer } from "./cash-memory-database";

export const FX_DOSSIER = fxScope.dossierId, FX_OTHER_DOSSIER = "99999999-9999-4999-8999-999999999999";
type Period = { startDate: string; endDate: string };
type Batch = ImportBatch & { rowCount?: number };
export type FiscalSources = Record<"fec" | "t1" | "t2" | "invoices" | "payments" | "support", Batch>;
/**
 * Real runtime and handlers over the in-memory TEST store (the Trésorerie double, generic over runs and imports).
 * Every response comes from the engines, never from hand-written JSON; this proves runtime rules, never durability.
 */
export function createFiscalHarness(start = 1_801_000_000, options: { directImports?: boolean } = {}) {
  const db = new MemoryCashDatabase(), auth = new TestAuthorizer(), clock = { now: start };
  db.addDossier(FX_DOSSIER, fxScope.organizationId); db.addDossier(FX_OTHER_DOSSIER, "org-other");
  auth.add("preparer", "preparer-fx", fxScope.organizationId, ["preparer"]); auth.add("reviewer", "reviewer-fx", fxScope.organizationId, ["reviewer"]);
  auth.add("outsider", "outsider", "org-other", ["preparer", "reviewer"]); auth.add("expired", "preparer-fx", fxScope.organizationId, ["preparer"], start - 1);
  const runtime = () => new FiscalRuntime(db, auth, () => clock.now);
  let handlers = fiscalHandlers(runtime, () => {});
  const url = (dossier = FX_DOSSIER, extra = "") => "https://probant.test/api/workpapers/fiscal?dossierId=" + dossier + "&periodId=" + fxScope.periodId + extra;
  const request = (session: string, method = "GET", body?: BodyInit, dossier = FX_DOSSIER, extra = "", key: string = randomUUID()) =>
    new Request(url(dossier, extra), { method, headers: { "x-test-session": session, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  const json = async (response: Response) => ({ status: response.status, body: await response.json() });
  const multipart = async (fields: Record<string, string | File>, session: string) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return json(await handlers.importsPOST(request(session, "POST", form)));
  };
  const h = {
    db, auth, clock, request, json,
    get handlers() { return handlers; },
    restart() { handlers = fiscalHandlers(() => new FiscalRuntime(db, auth, () => clock.now), () => {}); },
    async command(body: object, session = "preparer", key: string = randomUUID(), dossier = FX_DOSSIER) { return json(await handlers.POST(request(session, "POST", JSON.stringify(body), dossier, "", key))); },
    async ok(body: FiscalCommand, session = "preparer"): Promise<WorkpaperRun> { const r = await h.command(body, session); if (r.status !== 200) throw new Error("Commande refusée : " + JSON.stringify(r.body)); return r.body.run as WorkpaperRun; },
    async read(session = "preparer", extra = "") { return json(await handlers.GET(request(session, "GET", undefined, FX_DOSSIER, extra))); },
    async mission(session = "preparer", extra = ""): Promise<FiscalMissionSnapshot> { return (await h.read(session, "&operation=mission" + extra)).body.mission as FiscalMissionSnapshot; },
    // jsdom replaces FormData: presentation fixtures call the same runtime methods without the multipart transport.
    async previewFec(text = fecText(), session = "preparer") {
      const file = new File([text], "FEC2026.txt", { type: "text/plain" });
      if (options.directImports) return { status: 200, body: await runtime().previewFec(request(session), FX_DOSSIER, fxPeriod, file, randomUUID()) };
      return multipart({ file, period: JSON.stringify(fxPeriod), documentType: "fx_fec" }, session);
    },
    async previewReturn(period: Period, boxes: Record<string, string>, opts: Parameters<typeof ca3Text>[2] = {}, session = "preparer") {
      const file = new File([ca3Text(period, boxes, opts)], `CA3-${period.startDate}.csv`, { type: "text/csv" }), declaration = { documentType: "declaration_tva_ca3" as const, expectedSiren: FX_SIREN };
      if (options.directImports) return { status: 200, body: await runtime().previewDeclaration(request(session), FX_DOSSIER, fxPeriod, file, declaration, randomUUID()) };
      return multipart({ file, period: JSON.stringify(fxPeriod), documentType: "fx_vat_return", declaration: JSON.stringify(declaration) }, session);
    },
    async preview(type: FiscalTabularType, text = FX_CSV[type], session = "preparer") {
      const file = new File([text], type + ".csv", { type: "text/csv" });
      if (options.directImports) return { status: 200, body: await runtime().preview(request(session), FX_DOSSIER, fxPeriod, file, fxMapping(type), type, randomUUID()) };
      return multipart({ file, mapping: JSON.stringify(fxMapping(type)), period: JSON.stringify(fxPeriod), documentType: type }, session);
    },
    async approve(batch: { id: string; previewHash: string; document: { logicalId: string } }): Promise<Batch> {
      const heads = (await h.read()).body.sourceHeads as { document_type: string; import_id: string }[];
      const a = await json(await handlers.importsPOST(request("preparer", "POST", JSON.stringify({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash, expectedSourceId: heads.find(x => x.document_type === batch.document.logicalId)?.import_id ?? null }))));
      if (a.status !== 200) throw new Error("Approbation refusée : " + JSON.stringify(a.body));
      return a.body.batch as Batch;
    },
    async accept(p: { status: number; body: { batch: Batch } }): Promise<Batch> { if (p.status !== 200) throw new Error("Aperçu refusé : " + JSON.stringify(p.body)); return h.approve(p.body.batch); },
    /** Every source of the reference case: FEC, T1 and T2 returns, invoices, payments and supporting pieces. */
    async importAll(): Promise<FiscalSources> {
      return { fec: await h.accept(await h.previewFec()), t1: await h.accept(await h.previewReturn(T1, CA3_T1)), t2: await h.accept(await h.previewReturn(T2, CA3_T2)),
        invoices: await h.accept(await h.preview("fx_invoices")), payments: await h.accept(await h.preview("fx_vat_payments")), support: await h.accept(await h.preview("fx_support")) };
    },
    async create(period: Period = T2, frequency: "monthly" | "quarterly" = "quarterly", formVintage = 2026): Promise<WorkpaperRun> {
      return h.ok({ command: "create", period: fxPeriod, tax: "vat", declarativePeriod: period, frequency, formVintage });
    },
    async expected(runId: string): Promise<string[]> { return ((await h.read()).body.expectedSources as Record<string, string[]>)[runId]; },
    async rowOf(importId: string, code: string): Promise<{ documentId: string; rowId: string }> {
      const batch = ((await h.read()).body.imports as Batch[]).find(b => b.id === importId)!;
      return { documentId: batch.document.id, rowId: batch.rows.find(r => r.original.fieldCode === code || r.normalized?.key === code)!.id };
    },
    /** Reference draft: confirmed profile citing the regime certificate, credit carried forward cited on box 22 of the T2 return. */
    async draft(sources: FiscalSources, overrides: Partial<VatDraft> = {}): Promise<VatDraft> {
      return { frequency: "quarterly", formVintage: 2026,
        profile: { vatRegime: "real_normal", vatGroupStatus: "none", siren: FX_SIREN, evidence: await h.rowOf(sources.support.id, "ATT-REGIME") },
        explanations: [{ id: "CREDIT-T1", label: "Crédit du T1 reporté en case 22", kind: "credit_carried", amountCents: "-10000", citation: await h.rowOf(sources.t2.id, "22") }], ...overrides };
    },
    async frozen(period: Period = T2, overrides: Partial<VatDraft> = {}): Promise<{ sources: FiscalSources; run: WorkpaperRun }> {
      const sources = await h.importAll();
      let run = await h.create(period);
      run = await h.ok({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: await h.expected(run.id), draft: await h.draft(sources, overrides) });
      return { sources, run };
    },
    async executed(period: Period = T2, overrides: Partial<VatDraft> = {}): Promise<{ sources: FiscalSources; run: WorkpaperRun }> {
      const { sources, run: frozen } = await h.frozen(period, overrides);
      return { sources, run: await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version }) };
    },
  };
  return h;
}
export type FiscalHarness = ReturnType<typeof createFiscalHarness>;

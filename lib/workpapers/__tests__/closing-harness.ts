import { randomUUID } from "node:crypto";
import { ClosingRuntime } from "../closing-runtime";
import { closingHandlers } from "../closing-http";
import type { ClosingCommand, PieceKind } from "../closing-contract";
import { pvPeriod, pvScope } from "./provision-fixtures";
import { createProvisionHarness } from "./provision-harness";
import { TestAuthorizer } from "./cash-memory-database";
import { MemoryClosingDatabase, memoryCycleSource, type CycleSource } from "./closing-memory-database";

/** The file shares the dossier and exercise of the Provisions recipe, so that a real locked provisions sheet can be observed. */
export const CL_DOSSIER = pvScope.dossierId, CL_OTHER_DOSSIER = "99999999-9999-4999-8999-999999999999", CL_ORG = pvScope.organizationId, CL_PERIOD = pvPeriod, CL_PERIOD_ID = pvScope.periodId;
/** Synthetic subject holding the closing authority in the recipe; in the durable server, nobody holds it by default. */
export const CL_AUTHORITY = new Set(["signer-cl"]);
type Body = Record<string, unknown> & { command: ClosingCommand["command"] };
export type ClosingViewBody = Awaited<ReturnType<ClosingRuntime["read"]>>;

/**
 * Real runtime and handlers over the in-memory TEST store. Every response comes from the engine, never from hand-written JSON;
 * this proves runtime rules, never durability.
 */
export function createClosingHarness(options: { start?: number; cycles?: CycleSource[]; directUploads?: boolean } = {}) {
  const start = options.start ?? 1_801_000_000, db = new MemoryClosingDatabase(options.cycles ?? []), auth = new TestAuthorizer(), clock = { now: start };
  db.addDossier(CL_DOSSIER, CL_ORG); db.addDossier(CL_OTHER_DOSSIER, "org-other");
  auth.add("preparer", "preparer-cl", CL_ORG, ["preparer"]); auth.add("preparer2", "collab-b-cl", CL_ORG, ["preparer"]); auth.add("reviewer", "reviewer-cl", CL_ORG, ["reviewer"]);
  auth.add("signer", "signer-cl", CL_ORG, ["signer"]); auth.add("signer-nocap", "signer-sans-habilitation", CL_ORG, ["signer"]); auth.add("admin", "admin-cl", CL_ORG, ["admin"]);
  auth.add("outsider", "outsider", "org-other", ["preparer", "reviewer", "signer"]); auth.add("expired", "preparer-cl", CL_ORG, ["preparer"], start - 1);
  let n = 0;
  const runtime = () => new ClosingRuntime(db, auth, () => clock.now, identity => CL_AUTHORITY.has(identity.subject), () => "evt-" + String(++n).padStart(4, "0"));
  const handlers = closingHandlers(runtime, () => {});
  const url = (dossier = CL_DOSSIER, extra = "") => "https://probant.test/api/workpapers/closing?dossierId=" + dossier + "&periodId=" + CL_PERIOD_ID + extra;
  const request = (session: string, method = "GET", body?: BodyInit, dossier = CL_DOSSIER, extra = "", key: string = randomUUID()) =>
    new Request(url(dossier, extra), { method, headers: { "x-test-session": session, "Idempotency-Key": key, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body });
  /** Last journal head seen by the harness: commands are sent against it unless the test sets another one. */
  const seen = { seq: 0 };
  const json = async (response: Response) => {
    const body = await response.json();
    if (typeof body?.seq === "number") seen.seq = body.seq; else if (typeof body?.view?.seq === "number") seen.seq = body.view.seq; else if (typeof body?.currentSeq === "number") seen.seq = body.currentSeq;
    return { status: response.status, body };
  };
  const h = {
    db, auth, clock, request, json, handlers, runtime,
    async read(session = "preparer", dossier = CL_DOSSIER) { return json(await handlers.GET(request(session, "GET", undefined, dossier))); },
    async view(session = "preparer"): Promise<ClosingViewBody> { const r = await h.read(session); if (r.status !== 200) throw new Error("Lecture refusée : " + JSON.stringify(r.body)); return r.body; },
    /** Sends a command; the expected journal head is the current one unless the test sets it. */
    async command(body: Body, session = "preparer", key: string = randomUUID(), dossier = CL_DOSSIER) {
      const payload = { ...body, expectedSeq: body.expectedSeq ?? seen.seq };
      return json(await handlers.POST(request(session, "POST", JSON.stringify(payload), dossier, "", key)));
    },
    async ok(body: Body, session = "preparer"): Promise<{ applied: { seq: number; type: string; eventId: string }; view: ClosingViewBody }> {
      const r = await h.command(body, session); if (r.status !== 200) throw new Error("Commande refusée (" + body.command + ") : " + JSON.stringify(r.body)); return r.body;
    },
    async error(body: Body, session = "preparer") { const r = await h.command(body, session); return { status: r.status, error: r.body.error as string }; },
    async upload(content: string | Uint8Array, fileName: string, meta: { label: string; kind: PieceKind; pieceId?: string; expectedSeq?: number }, session = "preparer", key: string = randomUUID()) {
      const full = { ...meta, expectedSeq: meta.expectedSeq ?? seen.seq }, file = new File([content as BlobPart], fileName, { type: "text/plain" });
      // jsdom replaces FormData: presentation fixtures call the same runtime method without the multipart transport.
      if (options.directUploads) { try { const body = await runtime().upload(request(session), CL_DOSSIER, CL_PERIOD_ID, file, full, key); seen.seq = body.view.seq; return { status: 200, body }; } catch (e) { return { status: 422, body: { error: (e as Error).message } }; } }
      const form = new FormData(); form.set("file", file); form.set("meta", JSON.stringify(full));
      return json(await handlers.piecesPOST(new Request(url(CL_DOSSIER).replace("/closing?", "/closing/pieces?"), { method: "POST", headers: { "x-test-session": session, "Idempotency-Key": key }, body: form })));
    },
    /** Uploads a synthetic piece and returns its version id (PC-nn-vk). */
    async piece(label: string, kind: PieceKind = "document", content?: string, pieceId?: string, session = "preparer"): Promise<string> {
      const r = await h.upload(content ?? "Pièce synthétique — " + label + "\nAucune donnée réelle.\n", label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + ".txt", { label, kind, ...(pieceId ? { pieceId } : {}) }, session);
      if (r.status !== 200) throw new Error("Dépôt refusé : " + JSON.stringify(r.body));
      return r.body.view.pieces.at(-1).pieceVersionId;
    },
  };
  return h;
}
export type ClosingHarness = ReturnType<typeof createClosingHarness>;

/** A real provisions sheet taken through its own chain (sources, calculation, cited resolutions, independent review) up to the lock. */
export async function lockedProvisionSource(): Promise<CycleSource & { harness: ReturnType<typeof createProvisionHarness>; runId: string; version: number }> {
  const p = createProvisionHarness();
  const { sources, run: executed } = await p.executed();
  const support = sources.pv_support!, comite = support.rows.find(r => r.original.Piece === "PV-COMITE-12")!;
  let run = executed;
  for (const n of run.notes) run = await p.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Différence examinée avec la direction ; appréciation documentée au procès-verbal.", citation: { documentId: support.document.id, rowId: comite.id } });
  run = await p.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Différences examinées et documentées ; aucune issue juridique déduite." });
  run = await p.ok({ command: "submit", id: run.id, expectedVersion: run.version });
  run = await p.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante du registre." }, "reviewer");
  run = await p.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
  if (run.state !== "locked") throw new Error("Feuille Provisions non verrouillée");
  return { ...memoryCycleSource("pv", p.db), harness: p, runId: run.id, version: run.version };
}

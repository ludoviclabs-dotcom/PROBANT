import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { createDemoSession, DEMO_PERIOD } from "./demo-session";
import { demoParameterSchema } from "./demo-cycles";
import type { WorkpaperRun } from "./model";
import { buildWorkpaperPackage } from "./package";
import { DemoTelemetry } from "./operations";
import type { DemoCycle } from "./demo-cycles";
const command = z.discriminatedUnion("action", [z.object({ action: z.literal("create"), parameters: demoParameterSchema }).strict(), z.object({ action: z.enum(["submit", "approve", "changes", "revise", "lock", "export"]), token: z.string().uuid(), version: z.number().int().positive(), note: z.string().trim().min(1).max(1000) }).strict()]);
type Session = Awaited<ReturnType<typeof createDemoSession>>;
function baseline(session: Session): DossierSnapshot {
  return { dossier: { id: session.scope.dossierId, organizationId: session.scope.organizationId, period: DEMO_PERIOD, societe: { raisonSociale: "DÉMONSTRATION SYNTHÉTIQUE", siren: "SYNTHETIC", exercice: "2023-2024", dateCloture: "20240630" }, demoMode: true, fecFingerprint: "synthetic", referentielVersion: "demo-1", createdAt: "2024-08-01T00:00:00Z", admissibilite: [], silos: [] }, sourceDocuments: [], findings: [], admissibilityFindings: [], reviewEvents: [], calculationContext: { entriesTotal: 2, entriesAnalysed: 2, controlsEligible: 1, controlsExecuted: 1, controlsConcluded: 0, controlsNotConcluded: 1, notes: ["Démonstration isolée, aucune mission réelle"] }, snapshotVersion: "demo-1", snapshotHash: "synthetic-baseline", sourceKind: "demo" };
}
/** No real inputs accepted. Explicit opt-in, volatile synthetic sessions, no production authorization claim. */
export function createDemoHttp(enabled: () => boolean, clock = () => Date.now(), disabledCycles: () => DemoCycle[] = () => [], configuredOrigin: () => string | undefined = () => undefined) {
  const sessions = new Map<string, { session: Session; run: WorkpaperRun; expires: number; busy: boolean; snapshot?: DossierSnapshot }>();
  let pending = 0;
  const telemetry = new DemoTelemetry();
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  return async (request: Request) => {
    if (!enabled() || request.headers.get("x-probant-demonstration") !== "synthetic-only") return json({ error: "DEMONSTRATION_DISABLED", realActivation: false }, 503);
    // Explicit server configuration supports a local reverse proxy; never trust forwarded/Host headers.
    let expectedOrigin: string;
    try { const configured = configuredOrigin(), parsed = new URL(configured ?? request.url); if (!["http:", "https:"].includes(parsed.protocol) || (configured && parsed.origin !== configured)) throw new Error("INVALID_ORIGIN"); expectedOrigin = parsed.origin; }
    catch { return json({ error: "DEMO_ORIGIN_CONFIGURATION_INVALID" }, 503); }
    const origin = request.headers.get("origin"); if (origin && origin !== expectedOrigin) return json({ error: "ORIGIN_REFUSED" }, 403);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "JSON_REQUIRED" }, 415);
    const reader = request.body?.getReader(); if (!reader) return json({ error: "BODY_REQUIRED" }, 400);
    let bytes = 0, body = ""; const decoder = new TextDecoder();
    while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 4096) { await reader.cancel(); return json({ error: "DEMO_BODY_LIMIT" }, 413); } body += decoder.decode(chunk.value, { stream: true }); } body += decoder.decode();
    try {
      const c = command.parse(JSON.parse(body));
      for (const [key, value] of sessions) if (value.expires < clock() && !value.busy) sessions.delete(key); // Synthetic memory only, no source deletion.
      if (c.action === "create") {
        if (disabledCycles().includes(c.parameters.cycle)) return json({ error: "CYCLE_FLAG_DISABLED" }, 503);
        if (sessions.size + pending >= 20) return json({ error: "DEMO_CAPACITY" }, 429);
        pending += 1;
        try {
          const start = performance.now(), token = randomUUID(), session = await createDemoSession(`SYN-${token}`, c.parameters);
          const metrics = { event: "calculation" as const, cycle: c.parameters.cycle, durationMs: performance.now() - start, rows: 2, status: "completed" as const };
          telemetry.record(metrics);
          sessions.set(token, { session, run: session.initial, expires: clock() + 30 * 60_000, busy: false });
          return json({ token, run: session.initial, metrics, mode: "demo", storage: "volatile-memory-30min", security: "rôles simulés, pas une authentification" });
        } finally { pending -= 1; }
      }
      const state = sessions.get(c.token); if (!state) return json({ error: "DEMO_SESSION_EXPIRED" }, 404);
      if (disabledCycles().includes(state.session.params.cycle)) return json({ error: "CYCLE_FLAG_DISABLED" }, 503);
      if (state.busy || c.version !== state.run.version) return json({ error: "STALE_DEMO_VERSION" }, 409);
      state.busy = true;
      try {
        if (c.action === "export") {
          if (state.run.state !== "locked" || !state.snapshot) return json({ error: "LOCKED_EXPORT_REQUIRED" }, 409);
          return json({ token: c.token, run: state.run, package: buildWorkpaperPackage(state.snapshot, state.session.scope, state.session.preparer), mode: "demo" });
        }
        if (c.action === "submit") state.run = await state.session.submit(state.run, c.note);
        if (c.action === "approve") state.run = await state.session.approve(state.run, c.note);
        if (c.action === "changes") state.run = await state.session.requestChanges(state.run, c.note);
        if (c.action === "revise") state.run = await state.session.revise(state.run, c.note);
        if (c.action === "lock") { state.snapshot = await state.session.lock(state.run, state.snapshot ?? baseline(state.session)); state.run = (await state.session.service.get(state.session.scope, state.run.id))!; }
        return json({ token: c.token, run: state.run, projection: state.snapshot?.workpaperProjection, snapshot: state.snapshot, mode: "demo", storage: "volatile-memory-30min" });
      } finally { state.busy = false; }
    } catch { return json({ error: "DEMO_COMMAND_INVALID_OR_FAILED", realActivation: false }, 400); }
  };
}

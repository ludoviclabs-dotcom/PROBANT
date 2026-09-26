import { z } from "zod";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { DEMO_PERIOD, createDemoSession } from "./demo-session";
import { demoParameterSchema, type DemoCycle } from "./demo-cycles";
import type { WorkpaperRun } from "./model";

const eventSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), parameters: demoParameterSchema }).strict(),
  z.object({ action: z.literal("edit"), parameters: demoParameterSchema }).strict(),
  z.object({ action: z.enum(["submit", "approve", "changes", "revise", "lock"]), cycle: demoParameterSchema.shape.cycle, note: z.string().trim().min(1).max(1000) }).strict(),
]);
export type DemoEvent = z.infer<typeof eventSchema>;
const recordSchema = z.object({ version: z.literal(1), dossierId: z.string().regex(/^SYN-[A-Za-z0-9-]+$/), createdAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive(), events: z.array(eventSchema).max(200), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type DemoRecord = z.infer<typeof recordSchema>;
export const DEMO_STORAGE_PREFIX = "probant:synthetic-workpapers:v1:";
export const DEMO_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function syntheticBaseline(dossierId: string): DossierSnapshot {
  if (!/^SYN-[A-Za-z0-9-]+$/.test(dossierId)) throw new Error("SYNTHETIC_DOSSIER_REQUIRED");
  const body = { dossier: { id: dossierId, organizationId: "SYNTHETIC-DEMO", period: DEMO_PERIOD, societe: { raisonSociale: "DOSSIER SYNTHÉTIQUE DÉDIÉ", siren: "SYNTHETIC", exercice: "2023-2024", dateCloture: "20240630" }, demoMode: true, fecFingerprint: "synthetic-fixture-v1", referentielVersion: "synthetic-v1", createdAt: "2024-08-01T00:00:00Z", admissibilite: [], silos: [] }, sourceDocuments: [], findings: [], admissibilityFindings: [], reviewEvents: [], calculationContext: { entriesTotal: 2, entriesAnalysed: 2, controlsEligible: 0, controlsExecuted: 0, controlsConcluded: 0, controlsNotConcluded: 0, notes: ["Fixture synthétique ; résultats de feuilles présentés séparément des anciens constats"] }, snapshotVersion: "synthetic-demo-1", sourceKind: "session" as const, workpapers: { version: "1.0.0" as const, runs: [] as WorkpaperRun[] } };
  return { ...body, snapshotHash: stableSha256(body) } as DossierSnapshot;
}

function withRun(snapshot: DossierSnapshot, run: WorkpaperRun): DossierSnapshot {
  const runs = [...(snapshot.workpapers?.runs ?? []).filter((r) => r.rootId !== run.rootId), run];
  const { snapshotHash: _old, ...body } = { ...snapshot, workpapers: { version: "1.0.0" as const, runs } };
  void _old;
  return { ...body, snapshotHash: stableSha256(body) };
}

function checksum(record: Omit<DemoRecord, "checksum">) { return stableSha256(record); }
export function createDemoRecord(dossierId: string, now = Date.now()): DemoRecord {
  const body = { version: 1 as const, dossierId, createdAt: now, expiresAt: now + DEMO_EXPIRY_MS, events: [] as DemoEvent[], snapshotHash: syntheticBaseline(dossierId).snapshotHash };
  return { ...body, checksum: checksum(body) };
}
export function verifyDemoRecord(value: unknown, now = Date.now()): DemoRecord {
  const record = recordSchema.parse(value);
  if (record.expiresAt <= now || record.expiresAt !== record.createdAt + DEMO_EXPIRY_MS) throw new Error("DEMO_EXPIRED");
  const { checksum: stored, ...body } = record;
  if (checksum(body) !== stored) throw new Error("DEMO_INTEGRITY_INVALID");
  return record;
}

export async function replayDemo(record: DemoRecord, checkSnapshot = true) {
  verifyDemoRecord(record);
  let snapshot = syntheticBaseline(record.dossierId);
  const sessions = new Map<DemoCycle, Awaited<ReturnType<typeof createDemoSession>>>();
  const runs = new Map<DemoCycle, WorkpaperRun>();
  for (const raw of record.events) {
    const event = eventSchema.parse(raw);
    if (event.action === "create") {
      const cycle = event.parameters.cycle;
      if (sessions.has(cycle)) throw new Error("DEMO_CYCLE_ALREADY_CREATED");
      const session = await createDemoSession(record.dossierId, event.parameters);
      sessions.set(cycle, session); runs.set(cycle, session.initial);
      snapshot = withRun(snapshot, session.initial);
      continue;
    }
    const cycle = event.action === "edit" ? event.parameters.cycle : event.cycle;
    const session = sessions.get(cycle), current = runs.get(cycle);
    if (!session || !current) throw new Error("DEMO_CYCLE_MISSING");
    let next: WorkpaperRun;
    if (event.action === "edit") next = await session.editLocked(current, event.parameters);
    else if (event.action === "submit") next = await session.submit(current, event.note);
    else if (event.action === "approve") next = await session.approve(current, event.note);
    else if (event.action === "changes") next = await session.requestChanges(current, event.note);
    else if (event.action === "revise") next = await session.revise(current, event.note);
    else {
      snapshot = await session.lock(current, snapshot);
      next = (await session.service.get(session.scope, current.id))!;
    }
    runs.set(cycle, next);
    snapshot = withRun(snapshot, next);
  }
  if (checkSnapshot && snapshot.snapshotHash !== record.snapshotHash) throw new Error("DEMO_REPLAY_MISMATCH");
  return { snapshot, runs };
}

export async function appendDemoEvent(record: DemoRecord, raw: DemoEvent) {
  verifyDemoRecord(record);
  const event = eventSchema.parse(raw);
  const pending = { ...record, events: [...record.events, event] };
  if (pending.events.length > 200) throw new Error("DEMO_EVENT_LIMIT");
  const { checksum: _old, ...body } = pending;
  void _old;
  const provisional: DemoRecord = { ...body, checksum: checksum(body) };
  const result = await replayDemo(provisional, false);
  const finalBody = { ...body, snapshotHash: result.snapshot.snapshotHash };
  return { record: { ...finalBody, checksum: checksum(finalBody) }, ...result };
}

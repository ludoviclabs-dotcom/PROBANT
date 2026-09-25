import { expect, it } from "vitest";
import { appendDemoEvent, createDemoRecord, replayDemo, syntheticBaseline, verifyDemoRecord } from "../browser-demo";
import { buildSynthesisSnapshot } from "@/lib/synthesis";
import { buildWorkpaperPackage } from "../package";
import { periodId } from "../model";

it("rejoue un dossier synthétique après rechargement et verrouille la projection du même dossier", async () => {
  let record = createDemoRecord("SYN-integrated");
  let state!: Awaited<ReturnType<typeof appendDemoEvent>>;
  const run = async (event: Parameters<typeof appendDemoEvent>[1]) => { state = await appendDemoEvent(record, event); record = state.record; };
  await run({ action: "create", parameters: { cycle: "clients", scenario: "nominal", missingEvidence: false, methodAvailable: true } });
  await run({ action: "submit", cycle: "clients", note: "Travail synthétique préparé" });
  await run({ action: "approve", cycle: "clients", note: "Revue simulée, limites conservées" });
  await run({ action: "lock", cycle: "clients", note: "Projection synthétique" });
  const saved = JSON.parse(JSON.stringify(record));
  const restored = await replayDemo(verifyDemoRecord(saved));
  expect(restored.snapshot.dossier.id).toBe("SYN-integrated");
  expect(restored.snapshot.findings).toEqual([]);
  expect(restored.snapshot.workpaperProjection?.lockedRuns).toHaveLength(1);
  const scope = { organizationId: "SYNTHETIC-DEMO", dossierId: "SYN-integrated", periodId: periodId(restored.snapshot.dossier.period!), mode: "demo" as const };
  const pkg = buildWorkpaperPackage(restored.snapshot, scope, { id: "SYN-PREPARER", grants: [{ scope, permissions: ["read", "download"] }] });
  expect(pkg.json).toContain("SYN-integrated");
  expect(pkg.manifest.files).toHaveLength(2);
  await run({ action: "edit", parameters: { cycle: "clients", scenario: "exception", missingEvidence: true, methodAvailable: false } });
  expect(state.snapshot.workpaperProjection?.lockedRuns).toHaveLength(1);
  expect(state.runs.get("clients")?.state).toBe("executed");
  expect(() => buildWorkpaperPackage(state.snapshot, scope, { id: "SYN-PREPARER", grants: [{ scope, permissions: ["read", "download"] }] })).toThrow("STALE_REVIEW_EXPORT_BLOCKED");
});

it("refuse les journaux expirés ou altérés et les dossiers réels", async () => {
  expect(buildSynthesisSnapshot(syntheticBaseline("SYN-check"), { clock: () => "2024-08-01T00:00:00Z" }).risk.totalFindings).toBe(0);
  const record = createDemoRecord("SYN-check");
  expect(() => verifyDemoRecord({ ...record, dossierId: "real" })).toThrow();
  expect(() => verifyDemoRecord({ ...record, events: [{ action: "create", parameters: { cycle: "cash", missingEvidence: false, methodAvailable: true } }] })).toThrow("DEMO_INTEGRITY_INVALID");
  expect(() => verifyDemoRecord(record, record.expiresAt)).toThrow("DEMO_EXPIRED");
  const next = await appendDemoEvent(record, { action: "create", parameters: { cycle: "cash", scenario: "invalid", missingEvidence: false, methodAvailable: true } });
  expect(next.runs.get("cash")?.result?.result).toMatchObject({ status: "invalid_input" });
});

import { expect, it } from "vitest";
import { createDemoSession } from "../demo-session";
import { demoCycleSchema } from "../demo-cycles";
import { syntheticBaseline } from "../browser-demo";
import { summarizeWorkpapers } from "../mission-summary";
import { buildWorkpaperPackage } from "../package";
for (const cycle of demoCycleSchema.options) it(`parcours B ${cycle} synthétique et preuve sans Finding fictif`, async () => {
  const session = await createDemoSession(`SYN-${cycle}`, { cycle, missingEvidence: false, methodAvailable: true });
  expect(session.initial.result?.execution).toBe("completed"); expect(session.initial.findings).toEqual([]);
  const submitted = await session.submit(session.initial, "Travail démonstratif examiné, limites conservées");
  const approved = await session.approve(submitted, "Revue de démonstration, pas validation métier");
  expect(approved.state).toBe("approved"); expect(approved.approval?.actorId).not.toBe(approved.preparedBy);
});
for (const cycle of demoCycleSchema.options) it(`source/méthode absente ${cycle} ne bloque pas le parcours technique`, async () => { const s = await createDemoSession(`SYN-missing-${cycle}`, { cycle, missingEvidence: true, methodAvailable: false }); expect(s.initial.result?.execution).toBe("completed"); expect(s.initial.result?.outcome).toBe("inconclusive"); });
for (const cycle of demoCycleSchema.options) it(`exception et donnée invalide ${cycle} restent traçables`, async () => {
  const nominal = await createDemoSession(`SYN-scen-${cycle}`, { cycle, scenario: "nominal", missingEvidence: false, methodAvailable: true });
  const exception = await createDemoSession(`SYN-scen-${cycle}`, { cycle, scenario: "exception", missingEvidence: false, methodAvailable: true });
  const invalid = await createDemoSession(`SYN-scen-${cycle}`, { cycle, scenario: "invalid", missingEvidence: false, methodAvailable: true });
  expect(nominal.initial.result?.execution).toBe("completed");
  expect(exception.initial.result?.execution).toBe("completed");
  if (cycle !== "is") expect(exception.initial.result?.result).not.toEqual(nominal.initial.result?.result);
  expect(invalid.initial.result?.result).toMatchObject({ status: "invalid_input" });
});
for (const cycle of demoCycleSchema.options) it(`revue, verrouillage, export et invalidation ${cycle}`, async () => {
  const id = `SYN-complete-${cycle}`;
  const session = await createDemoSession(id, { cycle, scenario: "nominal", missingEvidence: false, methodAvailable: true });
  const submitted = await session.submit(session.initial, "Préparation synthétique");
  const approved = await session.approve(submitted, "Revue simulée");
  const snapshot = await session.lock(approved, syntheticBaseline(id));
  const locked = (await session.service.get(session.scope, approved.id))!;
  expect(locked.state).toBe("locked");
  expect(summarizeWorkpapers(snapshot).approved).toBe(1);
  expect(buildWorkpaperPackage(snapshot, session.scope, session.preparer).manifest.files).toHaveLength(2);
  const revised = await session.editLocked(locked, { cycle, scenario: "exception", missingEvidence: false, methodAvailable: true });
  const changed = { ...snapshot, workpapers: { version: "1.0.0" as const, runs: [revised] } };
  expect(summarizeWorkpapers(changed).rows[0].stale).toBe(true);
  expect(() => buildWorkpaperPackage(changed, session.scope, session.preparer)).toThrow("STALE_REVIEW_EXPORT_BLOCKED");
});

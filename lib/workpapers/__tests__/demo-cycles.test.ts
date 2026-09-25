import { expect, it } from "vitest";
import { createDemoSession } from "../demo-session";
import { demoCycleSchema } from "../demo-cycles";
for (const cycle of demoCycleSchema.options) it(`parcours B ${cycle} synthétique et preuve sans Finding fictif`, async () => {
  const session = await createDemoSession(`SYN-${cycle}`, { cycle, missingEvidence: false, methodAvailable: true });
  expect(session.initial.result?.execution).toBe("completed"); expect(session.initial.findings).toEqual([]);
  const submitted = await session.submit(session.initial, "Travail démonstratif examiné, limites conservées");
  const approved = await session.approve(submitted, "Revue de démonstration, pas validation métier");
  expect(approved.state).toBe("approved"); expect(approved.approval?.actorId).not.toBe(approved.preparedBy);
});
for (const cycle of demoCycleSchema.options) it(`source/méthode absente ${cycle} ne bloque pas le parcours technique`, async () => { const s = await createDemoSession(`SYN-missing-${cycle}`, { cycle, missingEvidence: true, methodAvailable: false }); expect(s.initial.result?.execution).toBe("completed"); expect(s.initial.result?.outcome).toBe("inconclusive"); });

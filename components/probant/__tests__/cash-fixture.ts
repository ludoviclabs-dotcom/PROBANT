import { createCashHarness, CASH_DOSSIER } from "@/lib/workpapers/__tests__/cash-harness";
import { cashPeriod, cashScope } from "@/lib/workpapers/__tests__/cash-reconciliation-fixtures";
import type { CashView } from "../cash/types";
import type { CashMissionSnapshot } from "@/lib/workpapers/cash-mission";

/** Presentation fixture produced by the real runtime and engine over the in-memory test store (no hand-written result). */
export async function cashPresentation(options: { partial?: boolean; stage?: "frozen" | "executed" } = {}) {
  const h = createCashHarness(undefined, { directImports: true });
  const run = options.stage === "frozen" ? (await h.frozenRun()).run : (await h.executed({ partial: options.partial })).run;
  const view = (await h.read()).body as CashView, mission = (await h.mission()) as CashMissionSnapshot;
  return { h, run, view, mission, dossierId: CASH_DOSSIER, periodId: cashScope.periodId, period: cashPeriod };
}

import { stableSha256 } from "@/lib/synthesis/canonical";
import { buildPayrollFraming } from "./payroll-framing";
import { buildPayrollSettlements } from "./payroll-settlements";
import { buildPayrollLeave } from "./payroll-leave";
import type { PayrollKind, PayrollState } from "./payroll-contract";
export function payrollObservation(state: PayrollState, leave: boolean) {
  const framing = buildPayrollFraming(state), settlements = buildPayrollSettlements(state), rights = buildPayrollLeave(state);
  const groups = [...framing.groups, ...settlements.groups];
  const blocked = leave ? (!rights.sourceReady || rights.rows.some(r => !r.result?.comparable) ? ["HR_LEAVE_NOT_ESTABLISHED"] : []) : (!framing.sourceComplete || !settlements.groups.length || groups.some(g => g.status === "blocked") ? ["HR_SOURCES_NOT_COMPARABLE"] : []);
  const exceptions = leave ? false : groups.some(g => ["to_explain", "documented", "stale"].includes(g.status));
  return { kinds: (leave ? ["leave"] : ["journal", "ledger", "declaration", "payments", "events"]) as PayrollKind[],
    result: { dependencyHash: stableSha256(leave ? { rights } : { framing, settlements }), module: leave ? "leave" : "payroll", units: leave ? rights.rows.map(r => ({ id: r.id, comparable: r.result?.comparable ?? false, error: r.error })) : groups.map(g => ({ id: g.id, month: g.month, status: g.status })), exceptions: leave ? 0 : groups.filter(g => ["to_explain", "documented", "stale"].includes(g.status)).length }, blocked,
    outcome: blocked.length ? "inconclusive" as const : exceptions ? "exceptions_detected" as const : "no_exception_detected" as const,
    limitations: leave ? rights.limitations : [...framing.limitations, ...settlements.limitations] };
}

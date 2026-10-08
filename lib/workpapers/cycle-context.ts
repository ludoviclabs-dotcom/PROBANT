import { cents, money, type Money } from "@/lib/canonical-model/money";
import { isCivilDate, periodIssues, type AccountingPeriod } from "@/lib/canonical-model/period";
import type { ImportBatch } from "./imports";
import { assertScope, frozen, periodId, scopeSchema, type SourceRow, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";

export const SOURCE_REQUIRED = "SOURCE REQUISE";
export const CYCLE_FRAMEWORK_VERSION = "1.0.0";
export interface CycleContext { scope: WorkpaperScope; period: AccountingPeriod; purpose: "synthetic_technical" | "real"; procedure?: "equity.review" | "clients.frame" | "clients.sales" | "payables.frame" | "payables.purchases" | "payables.rpne" | "cash.reconciliation" | "fixed_assets.review" }
export interface SourcedAmount { amount: Money; date: string; source: SourceRow }
export interface PostClosingWindow { startDate: string; endDate: string; documentVersionIds: string[]; coverage: "documented" | "incomplete" }
export function assertContext(context: CycleContext) {
  scopeSchema.parse(context.scope);
  if (periodIssues(context.period).length || context.scope.periodId !== periodId(context.period)) throw new Error("CYCLE_PERIOD_INVALID");
  if (context.purpose !== "synthetic_technical" || context.scope.mode !== "demo") throw new Error(`${SOURCE_REQUIRED}: REAL_CYCLE_DISABLED`);
}
export function assertDate(date: string) { if (!isCivilDate(date)) throw new Error("CIVIL_DATE_INVALID"); }
export function absolute(amount: Money) { const value = cents(amount); return money(value < 0n ? -value : value); }
export function sum(values: Money[]) { return money(values.reduce((total, value) => total + cents(value), 0n)); }
export function assertUnique(ids: string[]) { if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) throw new Error("DUPLICATE_OR_MISSING_ID"); }
export function assertAmount(context: CycleContext, value: SourcedAmount) {
  assertScope(context.scope, value.source.scope); assertDate(value.date); cents(value.amount);
  if (!value.source.id || !value.source.documentVersionId || value.source.errors.length || !value.source.normalized ||
    cents(value.source.normalized.amount) !== cents(value.amount) || value.source.normalized.date !== value.date) throw new Error("SOURCE_AMOUNT_OR_DATE_MISMATCH");
}
export function amountFromImport(batch: ImportBatch, rowId: string, principal: Principal): SourcedAmount {
  authorize(principal, batch.scope, "read");
  if (!batch.approval || !batch.report.calculationAllowed) throw new Error("IMPORT_NOT_APPROVED");
  const row = batch.rows.find((r) => r.id === rowId);
  if (!row?.normalized || row.errors.length) throw new Error("SOURCE_ROW_INVALID");
  assertScope(batch.scope, row.scope);
  return frozen({ amount: row.normalized.amount, date: row.normalized.date, source: row });
}
export function assertWindow(context: CycleContext, window: PostClosingWindow) {
  assertDate(window.startDate); assertDate(window.endDate);
  if (window.startDate <= context.period.closingDate || window.endDate < window.startDate || window.endDate > context.period.asOfDate) throw new Error("POST_CLOSING_WINDOW_INVALID");
  if (!["documented", "incomplete"].includes(window.coverage)) throw new Error("WINDOW_COVERAGE_INVALID");
  if (window.coverage === "documented" && !window.documentVersionIds.length) throw new Error("WINDOW_SOURCE_REQUIRED");
}

/** A dedicated validated context; the other cycle engines remain synthetic-only. */
export function assertClientsSalesContext(context: CycleContext) {
  if (context.scope.mode === "demo") { assertContext(context); return; }
  scopeSchema.parse(context.scope);
  if (context.purpose !== "real" || context.procedure !== "clients.sales" || periodIssues(context.period).length || context.scope.periodId !== periodId(context.period)) throw new Error(`${SOURCE_REQUIRED}: REAL_CYCLE_DISABLED: CLIENT_SALES_CONTEXT_INVALID`);
}

/** Closed Mission 08 investigation contract, not a normative accounting opinion. */
export function assertPayablesContext(context: CycleContext) {
  if (context.scope.mode === "demo") { assertContext(context); return; }
  scopeSchema.parse(context.scope);
  if (context.purpose !== "real" || !["payables.frame", "payables.purchases", "payables.rpne"].includes(context.procedure ?? "") || periodIssues(context.period).length || context.scope.periodId !== periodId(context.period)) throw new Error("PAYABLE_CONTEXT_INVALID");
}

/** Closed context for the Equity decision dossier only. */
export function assertEquityContext(context: CycleContext) {
  if(context.scope.mode === "demo") { assertContext(context); return; }
  scopeSchema.parse(context.scope);
  if(context.purpose !== "real" || context.procedure !== "equity.review" || periodIssues(context.period).length || context.scope.periodId !== periodId(context.period)) throw new Error("EQUITY_CONTEXT_INVALID");
}
/** Bank bridge on qualified sources (Mission 09); other cash engines (caisse, VMP, confirmations) stay synthetic-only. */
export function assertCashContext(context: CycleContext) {
  if (context.scope.mode === "demo") { assertContext(context); return; }
  scopeSchema.parse(context.scope);
  if (context.purpose !== "real" || context.procedure !== "cash.reconciliation" || periodIssues(context.period).length || context.scope.periodId !== periodId(context.period)) throw new Error(`${SOURCE_REQUIRED}: REAL_CYCLE_DISABLED: CASH_CONTEXT_INVALID`);
}
/** Fixed-asset movements, framing and documented recalculation on qualified sources (Mission 10); demo stays synthetic-only. */
export function assertFixedAssetsContext(context: CycleContext) {
  if (context.scope.mode === "demo") { assertContext(context); return; }
  scopeSchema.parse(context.scope);
  if (context.purpose !== "real" || context.procedure !== "fixed_assets.review" || periodIssues(context.period).length || context.scope.periodId !== periodId(context.period)) throw new Error(`${SOURCE_REQUIRED}: REAL_CYCLE_DISABLED: FIXED_ASSETS_CONTEXT_INVALID`);
}

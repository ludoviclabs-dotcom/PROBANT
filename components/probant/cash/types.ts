import type { Money } from "@/lib/canonical-model/money";
import type { ClearanceStatus } from "@/lib/workpapers/cash";
import type { CashAccountResult, CashItemResult } from "@/lib/workpapers/cash-reconciliation";
import type { CashFactsView } from "@/lib/workpapers/cash-sources";
import type { ImportBatch } from "@/lib/workpapers/imports";
import type { EvidenceLink, WorkpaperRun } from "@/lib/workpapers/model";

export type CashKind = "receipt_in_transit" | "outstanding_payment" | "other";
export type FactAccount = CashFactsView["accounts"][number];
export type FactRef = FactAccount["balances"]["ledger"];
export interface CashView {
  actorId: string; permissions: string[]; runs: WorkpaperRun[];
  facts: Record<string, CashFactsView | null>; factsIssues: Record<string, { code: string; locator?: { row?: number; sheet?: string; column?: string; value?: string } }>;
  sourcesCurrent: Record<string, boolean>; currentVersions?: Record<string, number>; lineageCurrent?: Record<string, { id: string; version: number; revision: number }>;
  imports: (ImportBatch & { rowCount?: number })[]; sourceHeads: { document_type: string; import_id: string }[];
}
/** One suspense line as displayed: server result when executed, otherwise the qualified fact without any computed status. */
export interface DisplayItem {
  itemId: string; accountId: string; kind: CashKind; amount: Money; date: string; ageDays: number | null; explanation: string; pieceRef: string;
  status: ClearanceStatus | null; statusMeaning: string; settledAmount: Money | null; remainingAmount: Money | null; exclusionReason: string | null; warnings: string[];
  allocations: CashItemResult["allocations"]; correction: CashItemResult["correction"]; proofs: EvidenceLink[]; source: FactRef | null;
}
export interface DisplayAccount {
  accountId: string; glAccount: string; bankId: string; accountReference: string; currency: string; nature: string; label: string; inScope: boolean; exclusionReason: string | null;
  result: CashAccountResult | null; fact: FactAccount | null; items: DisplayItem[];
}
export type PanelTarget = { kind: "item"; itemId: string } | { kind: "balance"; balance: "ledger" | "statement" | "erbBook" | "erbBank" } | { kind: "computation"; step: "reconstructed" | "difference" } | null;

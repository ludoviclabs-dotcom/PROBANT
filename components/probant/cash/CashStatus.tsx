import { AlertTriangle, Check, Circle, CircleDashed, Minus, PenLine } from "lucide-react";
import { CASH_STATUS_TEXT } from "@/lib/workpapers/cash-reconciliation";
import type { ClearanceStatus } from "@/lib/workpapers/cash";
import styles from "./cash.module.css";

const ICONS: Record<ClearanceStatus, typeof Check> = { cleared: Check, partially_cleared: CircleDashed, open: Circle, corrected: PenLine, not_tested: Minus, unexplained: AlertTriangle };
export const STATUS_ORDER: ClearanceStatus[] = ["cleared", "partially_cleared", "open", "corrected", "not_tested", "unexplained"];
/** Shape + text: the status never relies on colour alone. */
export function CashStatusBadge({ status }: { status: ClearanceStatus | null }) {
  if (!status) return <span className={styles.status} data-status="not_tested"><Minus aria-hidden="true"/>Non calculé</span>;
  const Icon = ICONS[status];
  return <span className={styles.status} data-status={status}><Icon aria-hidden="true"/>{CASH_STATUS_TEXT[status].label}</span>;
}
export function CashStatusLegend() {
  return <ul className={styles.legend} aria-label="Sens des statuts d’apurement">{STATUS_ORDER.map(s => <li key={s}><CashStatusBadge status={s}/><span>{CASH_STATUS_TEXT[s].meaning}</span></li>)}</ul>;
}

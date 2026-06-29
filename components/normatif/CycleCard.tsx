import Link from "next/link";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import {
  CYCLE_FAMILY_LABEL,
  REVIEW_STATUS_LABEL,
  type AuditCycle,
} from "@/lib/audit-cycles/types";

export function CycleCard({ cycle }: { cycle: AuditCycle }) {
  const fraudRisks = (cycle.risks ?? []).filter(
    (r) => r.category === "RISQUE_FRAUDE",
  );
  return (
    <Link
      href={`/normatif/cycles/${cycle.slug}`}
      className="group flex flex-col rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 transition-colors hover:border-[var(--pb-border-strong)] hover:bg-[var(--pb-surface-2)]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-semibold leading-tight text-[var(--pb-text)]">
          {cycle.title}
        </h3>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--pb-text-faint)] transition-colors group-hover:text-[var(--pb-accent)]" />
      </div>

      <p className="mt-1 text-[11px] text-[var(--pb-text-faint)]">
        {CYCLE_FAMILY_LABEL[cycle.family]}
      </p>

      {cycle.pcgAccounts?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {cycle.pcgAccounts.slice(0, 5).map((c) => (
            <code
              key={c}
              className="tnum rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-muted)]"
            >
              {c}
            </code>
          ))}
        </div>
      )}

      <p className="mt-2 line-clamp-2 flex-1 text-[12px] leading-relaxed text-[var(--pb-text-muted)]">
        {cycle.summary}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--pb-border)]/60 pt-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--pb-text-faint)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#eab308]" />
          {REVIEW_STATUS_LABEL[cycle.reviewStatus]}
        </span>
        {fraudRisks.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[#f97316]"
            title="Risque de fraude identifié (ISA 240)"
          >
            <AlertTriangle className="h-3 w-3" />
            Fraude
          </span>
        )}
      </div>
    </Link>
  );
}

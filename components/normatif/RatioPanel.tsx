import type { Ratio } from "@/lib/audit-cycles/types";
import { NormativeStatusBadge } from "./NormativeStatusBadge";

export function RatioPanel({ ratios }: { ratios: Ratio[] }) {
  if (!ratios?.length) {
    return <p className="text-[12px] text-[var(--pb-text-faint)]">Aucun ratio renseigné.</p>;
  }
  return (
    <div className="space-y-2.5">
      {ratios.map((r, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-[12px] font-semibold text-[var(--pb-text)]">{r.name}</h4>
            <NormativeStatusBadge status={r.status} short />
          </div>
          <code className="mt-1 block text-[11px] text-[var(--pb-text-muted)]">
            {r.formula}
          </code>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span className="text-[#f97316]">
              <span className="text-[var(--pb-text-faint)]">Alerte : </span>
              {r.alertThreshold}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
            {r.interpretation}
          </p>
          {r.caveat && (
            <p className="mt-1 text-[10px] italic text-[var(--pb-text-faint)]">{r.caveat}</p>
          )}
        </div>
      ))}
    </div>
  );
}

import type { NormativeStatus } from "@/lib/audit-cycles/types";
import { cn } from "@/lib/utils";
import { STATUS_STYLE } from "./status";

export function NormativeStatusBadge({
  status,
  short = false,
  className,
}: {
  status: NormativeStatus;
  short?: boolean;
  className?: string;
}) {
  const s = STATUS_STYLE[status];
  return (
    <span
      title={s.help}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className,
      )}
      style={{ borderColor: `${s.hex}80`, color: s.hex, backgroundColor: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.hex }} />
      {short ? s.short : s.label}
    </span>
  );
}

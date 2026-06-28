import type { FindingFamily, Severity } from "@/lib/canonical-model";
import { cn } from "@/lib/utils";
import { FAMILY_STYLE, SEVERITY_STYLE } from "./severity";

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        s.bg,
        className,
      )}
      style={{ borderColor: s.hex, color: s.hex }}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function FamilyBadge({
  family,
  className,
}: {
  family: FindingFamily;
  className?: string;
}) {
  const f = FAMILY_STYLE[family];
  return (
    <span
      title={f.help}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        f.border,
        f.text,
        className,
      )}
    >
      {f.label}
    </span>
  );
}

export function CountChip({
  value,
  label,
  hex,
  className,
}: {
  value: number;
  label?: string;
  hex?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-0.5 text-xs",
        className,
      )}
    >
      <span className="tnum font-semibold" style={hex ? { color: hex } : undefined}>
        {value}
      </span>
      {label && <span className="text-[var(--pb-text-muted)]">{label}</span>}
    </span>
  );
}

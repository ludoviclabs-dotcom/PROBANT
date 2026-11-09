import type { NormativeStatus } from "@/lib/audit-cycles/types";
import { STATUS_STYLE } from "./status";
import n from "./normatif.module.css";

/** Trait de force normative (voir ./status.ts). Décoratif : le libellé porte l'information. */
export function StatusStroke({ status, width = 22 }: { status: NormativeStatus; width?: number }) {
  const spec = STATUS_STYLE[status];
  if (!spec.stroke) {
    return (
      <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
        <path d="M1.5 1.5h7v7h-7z" strokeWidth={1.4} style={{ fill: "none", stroke: "var(--pb-signal)" }} />
      </svg>
    );
  }
  return (
    <svg width={width} height={6} viewBox="0 0 22 6" preserveAspectRatio="none" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <line
        x1={0}
        y1={3}
        x2={22}
        y2={3}
        strokeWidth={spec.stroke.width}
        strokeDasharray={spec.stroke.dash === "none" ? undefined : spec.stroke.dash}
        vectorEffect="non-scaling-stroke"
        style={{ stroke: spec.stroke.color }}
      />
    </svg>
  );
}

/** Force normative : trait + libellé. Le nom garde l'ancien composant pour ses appelants. */
export function NormativeStatusBadge({ status, short = false }: { status: NormativeStatus; short?: boolean; className?: string }) {
  const spec = STATUS_STYLE[status];
  return (
    <span className={n.statusMark} title={spec.help}>
      <StatusStroke status={status} />
      {short ? spec.short : spec.label}
    </span>
  );
}

import { AlertTriangle } from "lucide-react";
import type { Severity } from "@/lib/canonical-model";
import { SEVERITY_STYLE } from "@/components/probant/severity";
import { cn } from "@/lib/utils";

/**
 * Pastille d'anomalie inline, posée sur une ligne du document. Couleur selon
 * la gravité ; cliquable pour ouvrir le détail du constat.
 */
export function FlagPill({
  severity,
  label,
  extra,
  onClick,
  className,
}: {
  severity: Severity;
  label: string;
  /** Nombre de flags supplémentaires sur la même ligne (× n). */
  extra?: number;
  onClick?: () => void;
  className?: string;
}) {
  const s = SEVERITY_STYLE[severity];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Anomalie ${s.label} — ${label}. Ouvrir le détail.`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2",
        className,
      )}
      style={{
        borderColor: `${s.hex}66`,
        backgroundColor: `${s.hex}1f`,
        color: s.hex,
      }}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {extra && extra > 0 ? (
        <span className="tnum shrink-0 opacity-80">+{extra}</span>
      ) : null}
    </button>
  );
}

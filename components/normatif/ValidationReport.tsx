import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { ValidationResult } from "@/lib/audit-cycles/validation";

export function ValidationReport({ result }: { result: ValidationResult }) {
  const { valid, errors, warnings, stats } = result;
  return (
    <div className="space-y-4">
      {/* Bandeau global */}
      <div
        className="flex items-center gap-3 rounded-xl border p-4"
        style={
          valid
            ? { borderColor: "#22c55e66", backgroundColor: "#0f2417" }
            : { borderColor: "#ef444466", backgroundColor: "#2a1416" }
        }
      >
        {valid ? (
          <CheckCircle2 className="h-6 w-6 text-[#22c55e]" />
        ) : (
          <XCircle className="h-6 w-6 text-[#ef4444]" />
        )}
        <div>
          <div className="text-[14px] font-semibold text-[var(--pb-text)]">
            {valid
              ? "Référentiel cohérent — aucune erreur bloquante"
              : `${errors.length} erreur(s) à corriger`}
          </div>
          <div className="text-[11px] text-[var(--pb-text-muted)]">
            {stats.cycles} cycles · {stats.sources} sources · {warnings.length} avertissement(s)
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cycles" value={stats.cycles} />
        <Stat label="Sources" value={stats.sources} />
        <Stat label="Validés" value={stats.validated} hint="reviewStatus VALIDATED" />
        <Stat label="Revue requise" value={stats.reviewRequired} hint="à valider par un expert" />
      </div>

      {errors.length > 0 && (
        <Section title="Erreurs" icon={XCircle} hex="#ef4444" issues={errors} />
      )}
      {warnings.length > 0 && (
        <Section title="Avertissements" icon={AlertTriangle} hex="#eab308" issues={warnings} />
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-3">
      <div className="tnum text-xl font-bold text-[var(--pb-text)]">{value}</div>
      <div className="text-[11px] text-[var(--pb-text-muted)]">{label}</div>
      {hint && <div className="mt-0.5 text-[9px] text-[var(--pb-text-faint)]">{hint}</div>}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  hex,
  issues,
}: {
  title: string;
  icon: typeof XCircle;
  hex: string;
  issues: { cycle?: string; field: string; message: string }[];
}) {
  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--pb-text)]">
        <Icon className="h-4 w-4" style={{ color: hex }} />
        {title} ({issues.length})
      </h3>
      <ul className="space-y-1">
        {issues.map((issue, i) => (
          <li key={i} className="flex gap-2 text-[11px] text-[var(--pb-text-muted)]">
            <span className="shrink-0 font-mono text-[var(--pb-text-faint)]">
              {issue.cycle ? `${issue.cycle} · ` : ""}
              {issue.field}
            </span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

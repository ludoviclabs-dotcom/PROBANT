import { ShieldAlert, SlidersHorizontal, Bug } from "lucide-react";
import type { Risk, RiskCategory } from "@/lib/audit-cycles/types";

const COLUMNS: {
  category: RiskCategory;
  label: string;
  icon: typeof ShieldAlert;
  hex: string;
}[] = [
  { category: "RISQUE_INHERENT", label: "Risques inhérents", icon: SlidersHorizontal, hex: "#eab308" },
  { category: "RISQUE_CONTROLE", label: "Risques de contrôle", icon: ShieldAlert, hex: "#38bdf8" },
  { category: "RISQUE_FRAUDE", label: "Risques de fraude", icon: Bug, hex: "#ef4444" },
];

function RiskItem({ risk }: { risk: Risk }) {
  return (
    <div className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-2.5">
      <h5 className="text-[11px] font-semibold text-[var(--pb-text)]">{risk.name}</h5>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
        {risk.description}
      </p>
      {risk.indicators?.length > 0 && (
        <div className="mt-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--pb-text-faint)]">
            Indices
          </span>
          <ul className="mt-0.5 space-y-0.5">
            {risk.indicators.map((ind, i) => (
              <li key={i} className="text-[10px] text-[var(--pb-text-muted)]">
                · {ind}
              </li>
            ))}
          </ul>
        </div>
      )}
      {risk.response?.length > 0 && (
        <div className="mt-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--pb-text-faint)]">
            Réponse d'audit
          </span>
          <ul className="mt-0.5 space-y-0.5">
            {risk.response.map((resp, i) => (
              <li key={i} className="text-[10px] text-[var(--pb-text-muted)]">
                → {resp}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RiskMatrix({ risks }: { risks: Risk[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = (risks ?? []).filter((r) => r.category === col.category);
        const Icon = col.icon;
        return (
          <div key={col.category} className="flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4" style={{ color: col.hex }} />
              <h4 className="text-[12px] font-semibold text-[var(--pb-text)]">
                {col.label}
              </h4>
              <span className="tnum ml-auto text-[11px] text-[var(--pb-text-faint)]">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--pb-border)] px-2.5 py-3 text-[10px] text-[var(--pb-text-faint)]">
                  Aucun risque identifié dans cette catégorie.
                </p>
              ) : (
                items.map((r, i) => <RiskItem key={i} risk={r} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

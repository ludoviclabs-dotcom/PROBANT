"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ShoppingCart,
  BarChart3,
  HeartPulse,
  Layers,
  ChevronRight,
  Loader2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import type { ScenarioMeta } from "@/lib/demo/scenarios";
import { cn } from "@/lib/utils";

const SECTOR_ICON: Record<string, React.ReactNode> = {
  "demo-sa": <Layers className="h-5 w-5" />,
  "startup-tech": <TrendingUp className="h-5 w-5" />,
  "pme-negoce": <ShoppingCart className="h-5 w-5" />,
  "holding-invest": <BarChart3 className="h-5 w-5" />,
  "clinique-sante": <HeartPulse className="h-5 w-5" />,
};

const SECTOR_COLOR: Record<string, string> = {
  "demo-sa": "#818cf8",
  "startup-tech": "#34d399",
  "pme-negoce": "#f97316",
  "holding-invest": "#a78bfa",
  "clinique-sante": "#f43f5e",
};

const SEVERITY_DOT: Record<string, string> = {
  "Amortissements": "#eab308",
  "Cut-off": "#3b82f6",
  "Provisions": "#f97316",
  "Fraude CA": "#ef4444",
  "Activation R&D": "#a78bfa",
  "Fraude sur revenu (ISA 240)": "#ef4444",
  "Provisions sociales": "#f97316",
  "Dépréciation stocks": "#f97316",
  "Créances douteuses": "#ef4444",
  "Cut-off fournisseurs": "#eab308",
  "Dépréciation participation (bloquant)": "#ef4444",
  "Alerte capitaux propres (bloquant)": "#ef4444",
  "Hors-bilan non déclaré": "#a78bfa",
  "Coût employeur incomplet": "#eab308",
  "Provision réglementaire ARS": "#f97316",
  "Amortissements équipements": "#eab308",
};

function RiskChip({ label }: { label: string }) {
  const color = SEVERITY_DOT[label] ?? "#6b7280";
  const isBloquant = label.toLowerCase().includes("bloquant");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]"
      style={{
        borderColor: color + "60",
        backgroundColor: color + "18",
        color,
      }}
    >
      {isBloquant && <AlertTriangle className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function ScenarioCard({
  scenario,
  onSelect,
  loading,
}: {
  scenario: ScenarioMeta;
  onSelect: (id: string) => void;
  loading: string | null;
}) {
  const color = SECTOR_COLOR[scenario.id] ?? "#818cf8";
  const isLoading = loading === scenario.id;
  const isDemo = scenario.id === "demo-sa";

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-[var(--pb-surface)] p-4 transition-all",
        "hover:border-[var(--pb-border-strong)] hover:shadow-lg",
        isDemo && "border-[var(--pb-accent)]/40",
      )}
      style={{ borderColor: isDemo ? undefined : "var(--pb-border)" }}
    >
      {/* Bande couleur gauche */}
      <div
        className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
        style={{ backgroundColor: color }}
      />

      <div className="pl-3">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span style={{ color }} className="shrink-0">
              {SECTOR_ICON[scenario.id] ?? <Building2 className="h-5 w-5" />}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--pb-text)]">
                  {scenario.label}
                </span>
                {isDemo && (
                  <span className="rounded border border-[var(--pb-accent)]/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pb-accent)]">
                    défaut
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--pb-text-faint)]">
                {scenario.forme} · {scenario.secteur}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-xl font-bold" style={{ color }}>
              {scenario.anomaliesCount}
            </div>
            <div className="text-[10px] text-[var(--pb-text-faint)]">constats</div>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--pb-text-muted)]">
          {scenario.description}
        </p>

        {/* Risques dominants */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {scenario.risquesDominants.map((r) => (
            <RiskChip key={r} label={r} />
          ))}
        </div>

        {/* Bouton */}
        <button
          onClick={() => onSelect(scenario.id)}
          disabled={isLoading}
          className={cn(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold transition-all",
            isDemo
              ? "border-[var(--pb-accent)]/50 bg-[var(--pb-accent)]/10 text-[var(--pb-accent)] hover:bg-[var(--pb-accent)]/20"
              : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]",
          )}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Charger ce scénario
        </button>
      </div>
    </div>
  );
}

export function SimulationPanel({ scenarios }: { scenarios: ScenarioMeta[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  function handleSelect(id: string) {
    setLoading(id);
    const url = id === "demo-sa" ? "/dashboard/cloisons" : `/dashboard/cloisons?scenario=${id}`;
    router.push(url);
  }

  return (
    <div className="space-y-3">
      {/* Chapeau */}
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-4 py-3 text-[12px] text-[var(--pb-text-muted)]">
        Chaque scénario simule un exercice comptable fictif complet avec des anomalies réalistes. Sélectionnez-en un pour parcourir la revue par cloison — comptes reconstruits, constats annotés, sources normatives et chaîne de preuve.
      </div>

      {/* Grille de scénarios */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            onSelect={handleSelect}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import type { RiskAdjustment } from "@/lib/risk-mapping";
import { ADJUSTMENT_MAX, ADJUSTMENT_MIN, type AdjustmentPatch } from "@/lib/risk-mapping";
import { cn } from "@/lib/utils";

/**
 * Deux curseurs d'ajustement de jugement (Probabilité, Détectabilité) sur
 * l'échelle discrète −2..+2. L'auto reste toujours recalculé depuis les données ;
 * ces curseurs ne font qu'appliquer une surcouche additive bornée. Ils
 * n'altèrent aucun fait — d'où le badge « heuristique interne ».
 */

type AdjustableAxis = "probabilite" | "detectabilite";

interface SliderConfig {
  axis: AdjustableAxis;
  label: string;
  hint: string;
}

const SLIDERS: readonly SliderConfig[] = [
  {
    axis: "probabilite",
    label: "Probabilité",
    hint: "Historique, contrôle interne — non dérivables des données.",
  },
  {
    axis: "detectabilite",
    label: "Détectabilité",
    hint: "Confiance dans la couverture des procédures (axe inversé).",
  },
];

/** Formate un cran signé pour affichage : -2, -1, 0, +1, +2. */
function formatStep(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function Slider({
  config,
  value,
  onChange,
}: {
  config: SliderConfig;
  value: number;
  onChange: (next: number) => void;
}) {
  const active = value !== 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={`adjust-${config.axis}`}
          className="text-[12px] font-medium text-[var(--pb-text)]"
        >
          {config.label}
        </label>
        <span
          className={cn(
            "tnum rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
            active
              ? "bg-[var(--pb-accent)]/20 text-[var(--pb-accent)]"
              : "bg-[var(--pb-surface-3)] text-[var(--pb-text-faint)]",
          )}
        >
          {formatStep(value)}
        </span>
      </div>
      <input
        id={`adjust-${config.axis}`}
        type="range"
        min={ADJUSTMENT_MIN}
        max={ADJUSTMENT_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--pb-accent)]"
        aria-valuetext={formatStep(value)}
      />
      <div className="flex justify-between text-[10px] tabular-nums text-[var(--pb-text-faint)]">
        <span>{ADJUSTMENT_MIN}</span>
        <span>0</span>
        <span>+{ADJUSTMENT_MAX}</span>
      </div>
      <p className="text-[10px] leading-relaxed text-[var(--pb-text-faint)]">{config.hint}</p>
    </div>
  );
}

export function AdjustmentSliders({
  cycleSlug,
  adjustment,
  onChange,
}: {
  cycleSlug: string;
  adjustment: RiskAdjustment | undefined;
  onChange: (patch: AdjustmentPatch) => void;
}) {
  const probabilite = adjustment?.probabilite ?? 0;
  const detectabilite = adjustment?.detectabilite ?? 0;

  return (
    <div
      className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-4"
      data-cycle-slug={cycleSlug}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[12px] font-semibold text-[var(--pb-text)]">
          Ajustement de jugement
        </h4>
        <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-faint)]">
          heuristique interne — n'altère pas les faits
        </span>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {SLIDERS.map((config) => (
          <Slider
            key={config.axis}
            config={config}
            value={config.axis === "probabilite" ? probabilite : detectabilite}
            onChange={(next) => onChange({ [config.axis]: next })}
          />
        ))}
      </div>
    </div>
  );
}

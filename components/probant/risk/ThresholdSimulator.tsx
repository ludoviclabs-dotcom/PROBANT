"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Simulateur de seuil ISA 320 (Bloc 4). Permet de rejouer le scoring avec un
 * seuil de signification alternatif, ± 30 % autour du seuil réellement calculé
 * (`actualThreshold`), pour visualiser l'effet d'une hypothèse de matérialité
 * différente sur la hiérarchisation des cycles. Purement local à l'UI : ne
 * modifie AUCUNE donnée persistée, n'écrit rien côté serveur. Tant qu'une
 * valeur simulée est active, un libellé permanent le rappelle.
 */

interface ThresholdSimulatorProps {
  actualThreshold: number;
  onSimulate: (value: number | null) => void;
}

const RANGE_RATIO = 0.3;

export function ThresholdSimulator({ actualThreshold, onSimulate }: ThresholdSimulatorProps) {
  const min = Math.max(0, Math.round(actualThreshold * (1 - RANGE_RATIO)));
  const max = Math.round(actualThreshold * (1 + RANGE_RATIO));

  const [draftValue, setDraftValue] = useState<number>(actualThreshold);
  const [active, setActive] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Si le seuil réel change (nouveau dossier, base de matérialité modifiée),
  // le brouillon suit tant qu'aucune simulation n'est active — pour ne jamais
  // figer une simulation devenue incohérente avec les données réelles.
  useEffect(() => {
    if (!active) setDraftValue(actualThreshold);
  }, [actualThreshold, active]);

  function handleSimulate() {
    setActive(true);
    onSimulate(draftValue);
  }

  function handleReset() {
    setActive(false);
    setDraftValue(actualThreshold);
    onSimulate(null);
  }

  function handleNumberChange(raw: string) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setDraftValue(Math.min(max, Math.max(min, parsed)));
    }
  }

  return (
    <div
      data-tour="seuil-simulator"
      className="overflow-hidden rounded-[14px] border border-[var(--pb-border)] bg-[var(--pb-surface)]"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-4 py-[13px] text-left"
      >
        <span className="flex flex-wrap items-center gap-2.5">
          <FlaskConical className="h-[15px] w-[15px] shrink-0 text-[var(--pb-accent)]" />
          <span className="text-[13px] font-semibold text-[var(--pb-text)]">
            Simulateur de seuil ISA 320
          </span>
          {active && (
            <span
              className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold text-[var(--pb-warn-bright)]"
              style={{
                borderColor: "color-mix(in srgb, var(--pb-warn) 40%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--pb-warn) 12%, transparent)",
                animation: "pbGlow 2.4s ease-in-out infinite",
              }}
            >
              SIMULATION active — non sauvegardée
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--pb-text-faint)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--pb-text-faint)]" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0.5" style={{ animation: "pbFadeUp .25s ease both" }}>
          <p className="mb-3 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
            Rejoue le scoring des cycles avec un seuil de signification
            hypothétique, borné à ± 30 % du seuil réellement calculé (
            {actualThreshold.toLocaleString("fr-FR")} €). N'affecte aucune
            donnée persistée : purement local à cette session d'affichage.
          </p>

          <div className="flex flex-wrap items-center gap-3.5">
            <label className="flex flex-col gap-1 text-[10px] font-medium text-[var(--pb-text-faint)]">
              Seuil simulé (€)
              <input
                type="number"
                min={min}
                max={max}
                step={100}
                value={Math.round(draftValue)}
                onChange={(e) => handleNumberChange(e.target.value)}
                className="w-[110px] rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1.5 font-mono text-[12px] tabular-nums text-[var(--pb-text)] outline-none focus:border-[var(--pb-accent)]"
              />
            </label>

            <div className="flex min-w-[220px] flex-1 flex-col gap-1 text-[10px] font-medium text-[var(--pb-text-faint)]">
              <span id="threshold-simulator-range-bounds" className="tabular-nums">
                {min.toLocaleString("fr-FR")} € — {max.toLocaleString("fr-FR")} €
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={100}
                value={Math.round(draftValue)}
                onChange={(e) => handleNumberChange(e.target.value)}
                aria-label="Seuil simulé, en euros"
                aria-describedby="threshold-simulator-range-bounds"
                aria-valuetext={`${Math.round(draftValue).toLocaleString("fr-FR")} euros`}
                className="w-full cursor-pointer accent-[var(--pb-accent)]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-tour-action="simulate"
                onClick={handleSimulate}
                className="rounded-[9px] bg-[var(--pb-accent)] px-4 py-[7px] text-[11.5px] font-bold text-white transition-opacity hover:opacity-90"
              >
                Simuler
              </button>
              <button
                type="button"
                data-tour-action="reset"
                onClick={handleReset}
                disabled={!active}
                className="inline-flex items-center gap-1 rounded-[9px] border border-[var(--pb-border)] px-3 py-[7px] text-[11.5px] font-medium text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-3)] hover:text-[var(--pb-text)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                Réinitialiser
              </button>
            </div>
          </div>

          <p
            className={cn(
              "mt-3 text-[10.5px] font-medium leading-relaxed transition-colors",
              active ? "text-[var(--pb-warn-bright)]" : "text-[var(--pb-text-faint)]",
            )}
          >
            {active
              ? `SIMULATION non sauvegardée — seuil actif : ${Math.round(draftValue).toLocaleString("fr-FR")} € (vs ${actualThreshold.toLocaleString("fr-FR")} € réel).`
              : "Aucune simulation active — les scores affichés utilisent le seuil réel."}
          </p>
        </div>
      )}
    </div>
  );
}

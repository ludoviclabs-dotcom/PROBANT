"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import p from "@/components/charte/page.module.css";
import s from "./risk.module.css";

/**
 * Simulateur de seuil ISA 320 (Bloc 4). Permet de rejouer le scoring avec un
 * seuil de signification alternatif, ± 30 % autour du seuil réellement calculé
 * (`actualThreshold`), pour visualiser l'effet d'une hypothèse de matérialité
 * différente sur la hiérarchisation des cycles. Purement local à l'UI : ne
 * modifie AUCUNE donnée persistée, n'écrit rien côté serveur. Tant qu'une
 * valeur simulée est active, un libellé permanent le rappelle.
 *
 * Charte « instruments » : une ligne sous filet, repliable ; le bouton d'en-tête porte `aria-expanded` (la visite
 * guidée le déplie), le curseur, « Simuler » et « Réinitialiser » gardent leurs ancres `data-tour-action`.
 * `children` (l'impact sur les bandes) s'affiche dans le même bloc, sous la ligne.
 */

interface ThresholdSimulatorProps {
  actualThreshold: number;
  onSimulate: (value: number | null) => void;
  children?: ReactNode;
}

const RANGE_RATIO = 0.3;

export function ThresholdSimulator({ actualThreshold, onSimulate, children }: ThresholdSimulatorProps) {
  const id = useId();
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

  const eur = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} €`;

  return (
    <div data-tour="seuil-simulator" className={s.sim}>
      <div className={s.simHead}>
        <button type="button" className={s.simToggle} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls={`${id}-body`}>
          <span aria-hidden="true" className={s.simSign}>{expanded ? "−" : "+"}</span>
          Simulateur de seuil ISA 320
        </button>
        {active && <span className={s.simBadge}>SIMULATION active — non sauvegardée</span>}
        <span className={s.simState}>± 30 % du seuil réel · rien n&apos;est sauvegardé</span>
      </div>

      <div id={`${id}-body`} hidden={!expanded}>
        {expanded && (
          <div className={s.simBody}>
            <p className={s.simText}>
              Rejoue le scoring des cycles avec un seuil de signification hypothétique, borné à ± 30 % du seuil réellement
              calculé ({eur(actualThreshold)}). N&apos;affecte aucune donnée persistée : purement local à cette session
              d&apos;affichage.
            </p>

            <label className={s.simField}>
              <span className={p.key}>Seuil simulé (€)</span>
              <input
                type="number"
                min={min}
                max={max}
                step={100}
                value={Math.round(draftValue)}
                onChange={(e) => handleNumberChange(e.target.value)}
                className={`${p.input} ${s.simNumber}`}
              />
            </label>

            <div className={s.rangeField}>
              <span id={`${id}-bounds`} className={s.rangeBounds}>
                {eur(min)} — {eur(max)}
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={100}
                value={Math.round(draftValue)}
                onChange={(e) => handleNumberChange(e.target.value)}
                aria-label="Seuil simulé, en euros"
                aria-describedby={`${id}-bounds`}
                aria-valuetext={`${Math.round(draftValue).toLocaleString("fr-FR")} euros`}
                className={s.range}
              />
            </div>

            <div className={s.simButtons}>
              <button type="button" data-tour-action="simulate" onClick={handleSimulate} className={p.btnPrimary}>
                Simuler
              </button>
              <button type="button" data-tour-action="reset" onClick={handleReset} disabled={!active} className={p.btnSecondary}>
                Réinitialiser
              </button>
            </div>

            <p className={s.simStatus} data-active={active ? "" : undefined} aria-live="polite">
              {active
                ? `SIMULATION non sauvegardée — seuil actif : ${eur(draftValue)} (vs ${eur(actualThreshold)} réel).`
                : "Aucune simulation active — les scores affichés utilisent le seuil réel."}
            </p>
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

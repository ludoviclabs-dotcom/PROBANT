"use client";

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import { TOUR_CHAPTERS, TOUR_STEPS, chapterIndexOf } from "@/lib/demo/tour";
import s from "./tour.module.css";

/**
 * Frise de la visite — le lecteur et le « fil de preuve » à la fois :
 *  - transport (précédent, lecture/pause, suivant) et horloge du script ;
 *  - un segment par chapitre, large comme sa durée, rempli au fil de la lecture, avec un repère par étape ;
 *    un clic ouvre le chapitre ;
 *  - sous chaque chapitre atteint, les maillons qu'il a établis (empreinte du FEC, seuil, écart…) : la frise
 *    devient le résumé du parcours, une ligne continue plutôt qu'une grille de cartes.
 */

interface Segment {
  key: string;
  numeral: string;
  label: string;
  steps: number[];
  weight: number;
}

/** Poids visuel de la conclusion : elle reste affichée, sa durée n'a pas de sens sur la frise. */
const FINALE_WEIGHT = 5000;

const SEGMENTS: Segment[] = (() => {
  const segs: Segment[] = [];
  const opening = TOUR_STEPS.map((st, i) => (st.scene === "opening" ? i : -1)).filter((i) => i >= 0);
  if (opening.length) segs.push({ key: "opening", numeral: "", label: "Ouverture", steps: opening, weight: 0 });
  for (const c of TOUR_CHAPTERS) {
    const steps = TOUR_STEPS.map((st, i) => (st.chapter === c.id ? i : -1)).filter((i) => i >= 0);
    segs.push({ key: c.id, numeral: c.numeral, label: c.title, steps, weight: 0 });
  }
  const finale = TOUR_STEPS.map((st, i) => (st.scene === "finale" ? i : -1)).filter((i) => i >= 0);
  if (finale.length) segs.push({ key: "finale", numeral: "", label: "Le fil", steps: finale, weight: 0 });
  for (const seg of segs) {
    seg.weight = seg.steps.reduce((sum, i) => sum + (TOUR_STEPS[i].scene === "finale" ? FINALE_WEIGHT : TOUR_STEPS[i].duration), 0);
  }
  return segs;
})();

const SCRIPT_TOTAL_MS = TOUR_STEPS.filter((st) => st.scene !== "finale").reduce((sum, st) => sum + st.duration, 0);

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function TourFrieze({
  stepIndex,
  progress,
  paused,
  onPrev,
  onNext,
  onToggle,
  onReplay,
  onJump,
  onQuit,
}: {
  stepIndex: number;
  progress: number;
  paused: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onReplay: () => void;
  onJump: (stepIndex: number) => void;
  onQuit: () => void;
}) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[stepIndex];
  const currentSegment = SEGMENTS.findIndex((seg) => seg.steps.includes(stepIndex));

  const done = TOUR_STEPS.slice(0, stepIndex)
    .filter((st) => st.scene !== "finale")
    .reduce((sum, st) => sum + st.duration, 0);
  const elapsed = current.scene === "finale" ? SCRIPT_TOTAL_MS : done + Math.min(1, progress) * current.duration;

  const stepWeight = (i: number) => (TOUR_STEPS[i].scene === "finale" ? FINALE_WEIGHT : TOUR_STEPS[i].duration);

  return (
    <div className={s.frieze} role="group" aria-label="Lecture de la visite guidée" data-tour-frieze="">
      <div className={s.transport}>
        <button type="button" className={s.ctrl} onClick={onPrev} disabled={isFirst} aria-label="Étape précédente" title="Étape précédente (←)">
          <ChevronLeft size={16} aria-hidden />
        </button>
        {isLast ? (
          <button type="button" className={s.ctrl} data-primary="" onClick={onReplay} aria-label="Revenir au début" title="Revenir au début (Début)">
            <RotateCcw size={15} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className={s.ctrl}
            data-primary=""
            onClick={onToggle}
            aria-label={paused ? "Reprendre la visite" : "Mettre la visite en pause"}
            aria-pressed={paused}
            title={paused ? "Reprendre (Espace)" : "Pause (Espace)"}
          >
            {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
          </button>
        )}
        <button type="button" className={s.ctrl} onClick={onNext} disabled={isLast} aria-label="Étape suivante" title="Étape suivante (→)">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      <div className={s.clock} aria-hidden="true">
        <b>{clock(elapsed)}</b> / {clock(SCRIPT_TOTAL_MS)}
      </div>

      <ol className={s.chapters} aria-label="Chapitres">
        {SEGMENTS.map((seg, si) => {
          const segStart = seg.steps[0];
          let filled = 0;
          for (const i of seg.steps) {
            if (i < stepIndex) filled += stepWeight(i);
            else if (i === stepIndex) filled += Math.min(1, progress) * stepWeight(i);
          }
          const fraction = seg.weight > 0 ? filled / seg.weight : 0;
          const tokens = seg.steps
            .filter((i) => i <= stepIndex)
            .map((i) => TOUR_STEPS[i].token)
            .filter((t): t is NonNullable<typeof t> => Boolean(t));
          const chapterIdx = chapterIndexOf(TOUR_STEPS[segStart]);
          const isCurrent = si === currentSegment;
          let offset = 0;
          const ticks = seg.steps.slice(1).map((i, k) => {
            offset += stepWeight(seg.steps[k]);
            return { at: offset / seg.weight, done: i <= stepIndex };
          });
          const name = seg.numeral ? `Chapitre ${seg.numeral}, ${seg.label}` : seg.label;
          return (
            <li key={seg.key} className={s.chapterItem} style={{ flex: `${seg.weight} 1 0` }}>
              <button
                type="button"
                className={s.chapterBtn}
                onClick={() => onJump(segStart)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Aller à : ${name}${chapterIdx >= 0 && chapterIdx < TOUR_CHAPTERS.length ? ` — ${seg.steps.length} étapes` : ""}`}
                title={name}
              >
                <span className={s.chapterName}>
                  {seg.numeral && <span className={s.chapterNum}>{seg.numeral}</span>}
                  <span className={s.chapterLabel}>{seg.label}</span>
                </span>
                <span className={s.chapterToken} data-lit={tokens.length && isCurrent ? "" : undefined} aria-hidden="true">
                  {tokens.length ? tokens.map((t) => `${t.key} ${t.value}`).join(" · ") : " "}
                </span>
                <span className={s.track} aria-hidden="true">
                  <span className={s.trackFill} style={{ width: `${Math.round(fraction * 1000) / 10}%` }} />
                  {ticks.map((t, k) => (
                    <span key={k} className={s.trackTick} data-done={t.done ? "" : undefined} style={{ left: `${t.at * 100}%` }} />
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className={s.transport}>
        <button type="button" className={s.ctrl} onClick={onQuit} aria-label="Quitter la visite" title="Quitter (Échap)">
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

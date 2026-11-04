"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/charte/Logo";
import { FAMILY } from "@/components/charte/severity";
import type { TourChapter, TourStep, TourToken } from "@/lib/demo/tour";
import { useDemoCounter } from "./useDemoCounter";
import s from "./tour.module.css";

/**
 * Scènes plein écran de la visite : ouverture, intertitre de chapitre, conclusion. Elles reposent sur la
 * grammaire de la charte — titre Newsreader, filets continus, trois familles de traits — plutôt que sur des
 * cartes répétées. Toutes les valeurs affichées sont passées par le moteur (`lib/demo/tour.ts`).
 */

/* ── Ouverture ─────────────────────────────────────────────────────────────── */

export interface RegisterLine {
  family: "hardLaw" | "methodology" | "internal";
  label: string;
  detail: string;
  count: number;
}

export function OpeningScene({ step, registers, sceneRef }: { step: TourStep; registers: RegisterLine[]; sceneRef: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={sceneRef} tabIndex={-1} className={s.scene} role="group" aria-labelledby="tour-opening-title">
      <div className={s.sceneInner}>
        <p className={s.sceneEyebrow}>
          <Logo size="sm" /> <span style={{ marginLeft: 14 }}>{step.kicker}</span>
        </p>
        <h2 id="tour-opening-title" className={s.sceneTitle}>
          {step.title}
        </h2>
        <p className={s.sceneLede}>{step.body}</p>
        <ul className={s.registers} aria-label="Trois registres, jamais confondus">
          {registers.map((r, i) => {
            const spec = FAMILY[r.family];
            const delay = `${520 + i * 260}ms`;
            return (
              <li key={r.family} className={s.register} style={{ animationDelay: delay }}>
                <svg width={56} height={8} viewBox="0 0 56 8" aria-hidden="true" focusable="false">
                  <line
                    x1={0}
                    y1={4}
                    x2={56}
                    y2={4}
                    strokeWidth={spec.width}
                    strokeDasharray={spec.dash === "none" ? undefined : spec.dash}
                    style={{ stroke: spec.color, animationDelay: delay }}
                  />
                </svg>
                <span>
                  <span className={s.registerName}>{r.label}</span>
                  <span className={s.registerDetail}>{r.detail}</span>
                </span>
                <span className={s.registerCount}>
                  {r.count} {r.count > 1 ? "constats" : "constat"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className={s.sceneNote}>Trois registres, jamais confondus : chaque constat dit s’il relève du droit, de la méthode d’audit ou d’un paramètre interne.</p>
      </div>
    </div>
  );
}

/* ── Intertitre de chapitre ────────────────────────────────────────────────── */

export function ChapterScene({ chapter, index, total, leaving }: { chapter: TourChapter; index: number; total: number; leaving: boolean }) {
  return (
    <div className={s.scene} data-leaving={leaving ? "" : undefined} role="group" aria-label={`Chapitre ${chapter.numeral} : ${chapter.title}`}>
      <div className={s.sceneInner}>
        <span className={s.chapterNumeral} aria-hidden="true">
          {chapter.numeral}.
        </span>
        <h2 className={s.sceneTitle}>{chapter.title}</h2>
        <p className={s.sceneLede}>{chapter.lede}</p>
        <div className={s.sceneRule} aria-hidden="true" />
        <p className={s.chapterMeta}>
          Chapitre {index + 1} sur {total}
        </p>
      </div>
    </div>
  );
}

/* ── Conclusion : le fil de preuve ─────────────────────────────────────────── */

function Metric({ target, label, durationMs, index, started }: { target: number; label: string; durationMs: number; index: number; started: boolean }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!started) {
      setGo(false);
      return;
    }
    const t = window.setTimeout(() => setGo(true), 900 + index * 220);
    return () => window.clearTimeout(t);
  }, [started, index]);
  const value = useDemoCounter(target, durationMs, go);
  return (
    <div className={s.metric}>
      <span className={s.metricValue}>{go ? value : 0}</span>
      <span className={s.metricLabel}>{label}</span>
    </div>
  );
}

export function FinaleScene({
  step,
  thread,
  metrics,
  started,
  actions,
  sceneRef,
}: {
  step: TourStep;
  thread: TourToken[];
  metrics: { id: string; target: number; label: string; durationMs: number }[];
  started: boolean;
  actions: ReactNode;
  sceneRef: React.Ref<HTMLDivElement>;
}) {
  const nodes = [...thread, { key: "Décision", value: "à l’auditeur" }];
  return (
    <div ref={sceneRef} tabIndex={-1} className={s.scene} role="group" aria-labelledby="tour-finale-title">
      <div className={s.sceneInner} data-wide="">
        <p className={s.sceneEyebrow}>{step.kicker}</p>
        <h2 id="tour-finale-title" className={s.sceneTitle}>
          {step.title}
        </h2>
        <div className={s.threadWrap}>
          <span aria-hidden="true" className={s.threadLine} />
          <ol className={s.thread} aria-label="Maillons rencontrés pendant la visite">
            {nodes.map((n, i) => (
              <li key={n.key} className={s.threadNode} data-last={i === nodes.length - 1 ? "" : undefined} style={{ animationDelay: `${300 + i * 140}ms` }}>
                <span className={s.threadKey}>{n.key}</span>
                <span className={s.threadValue}>{n.value}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className={s.sceneLede}>{step.body}</p>
        <div className={s.metrics}>
          {metrics.map((m, i) => (
            <Metric key={m.id} target={m.target} label={m.label} durationMs={m.durationMs} index={i} started={started} />
          ))}
        </div>
        <div className={s.ctas}>{actions}</div>
      </div>
    </div>
  );
}

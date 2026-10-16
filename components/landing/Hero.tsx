"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { DemoLauncher } from "@/components/probant/DemoLauncher";
import { EASE, canAnimate } from "@/components/charte/motion";
import { FecFlowView } from "./FecFlowView";
import { WIDE_MIN, useViewportWidth } from "./useViewport";
import s from "./landing.module.css";

const LEGEND: { label: string; width: number; dash?: string; color: string }[] = [
  { label: "Droit dur", width: 2, color: "var(--pb-ink)" },
  { label: "Méthode", width: 1.5, dash: "4 3", color: "var(--pb-ink-2)" },
  { label: "Heuristique", width: 1.2, dash: "1 3", color: "var(--pb-ink-3)" },
];

/**
 * Hero : titre et deux entrées à gauche, flux FEC de DEMO SA à droite (il déborde sous la marge). Typographie
 * seule, aucune carte. Entrée : fondu et translation de 8 px, cascade de 40 ms, sous 900 ms au total.
 */
export function Hero() {
  const textRef = useRef<HTMLDivElement>(null);
  const width = useViewportWidth();
  const wide = width >= WIDE_MIN;

  useLayoutEffect(() => {
    const root = textRef.current;
    if (!root || !canAnimate(root)) return;
    const animations = Array.from(root.querySelectorAll('[data-a="txt"]')).map((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
        duration: 300,
        delay: 120 + Math.min(i, 10) * 40,
        easing: EASE,
        fill: "backwards",
      }),
    );
    return () => animations.forEach((a) => a.cancel());
  }, []);

  return (
    <section aria-labelledby="hero-t" className={s.hero}>
      <div ref={textRef} className={s.heroText}>
        <p data-a="txt" className={s.eyebrow}>
          Orchestrateur de conformité analytique
          <br />
          des états financiers français
        </p>
        <h1 id="hero-t" data-a="txt" className={s.h1}>
          Du grand livre au constat opposable.
        </h1>
        <p data-a="txt" className={s.lead}>
          Ingestion du FEC, détection d’anomalies par cloison comptable, dossier de preuve validé par l’auditeur. Chaque écart porte son montant, son seuil et sa source normative.
        </p>
        <div data-a="txt" className={s.ctas}>
          <DemoLauncher className={s.ctaPrimary}>
            Lancer la visite guidée <span className={s.ctaMeta}>· 95 s</span>
          </DemoLauncher>
          <Link href="/dashboard/synthese" className={s.ctaSecondary}>
            Ouvrir la démo d’analyse FEC →
          </Link>
        </div>
        <div data-a="txt" className={s.legend}>
          {LEGEND.map((item) => (
            <span key={item.label} className={s.legendItem}>
              <svg width={24} height={6} viewBox="0 0 24 6" aria-hidden="true" focusable="false">
                <line x1={0} y1={3} x2={24} y2={3} strokeWidth={item.width} strokeDasharray={item.dash} style={{ stroke: item.color }} />
              </svg>
              {item.label}
            </span>
          ))}
          <span>: jamais mélangés</span>
        </div>
        <p data-a="txt" className={s.caption}>
          Démo : société fictive DEMO SA, exercice 2024. Les lignes ci-contre sont celles de son FEC.
        </p>
      </div>
      <FecFlowView narrow={!wide} viewportWidth={width} />
    </section>
  );
}

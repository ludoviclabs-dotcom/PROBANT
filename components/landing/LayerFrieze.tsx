"use client";

import { useEffect, useRef } from "react";
import { EASE, canAnimate } from "@/components/charte/motion";
import { LAYERS } from "./content";
import s from "./landing.module.css";

/**
 * 01 · Trois couches : une frise continue reliée par la ligne de preuve, à la place de trois cartes
 * symétriques. Les schémas sont des traits ; ils se tracent à l'entrée dans la fenêtre, une seule fois.
 * Trait plein : droit dur. Tirets : méthode. Pointillé : interne.
 */
export function LayerFrieze() {
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || !canAnimate(group) || typeof IntersectionObserver === "undefined") return;
    const animations: Animation[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          entry.target.querySelectorAll('[data-a="draw"],[data-a="ring"]').forEach((node, i) => {
            animations.push(node.animate([{ strokeDashoffset: "1" }, { strokeDashoffset: "0" }], { duration: 600, delay: (i % 7) * 70 + Math.floor(i / 7) * 120, easing: EASE, fill: "backwards" }));
          });
          entry.target.querySelectorAll('[data-a="dot"],[data-a="fade"]').forEach((node, i) => {
            animations.push(node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 700 + i * 60, easing: EASE, fill: "backwards" }));
          });
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(group);
    return () => {
      observer.disconnect();
      animations.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <section id="couches" aria-labelledby="couches-t" className={`${s.section} ${s.sectionFirst}`}>
      <div className={s.sectionHead}>
        <span className={s.sectionNum}>01</span>
        <h2 id="couches-t" className={s.h2}>Trois couches, séparées à chaque étape</h2>
      </div>
      <div ref={groupRef} className={s.layers}>
        {LAYERS.map((layer) => (
          <div key={layer.n} className={s.layer}>
            <div className={s.layerMeta}>
              <span>{layer.n}</span>
              <span>{layer.tag}</span>
            </div>
            <h3 className={s.h3}>{layer.title}</h3>
            <p className={s.layerText}>{layer.text}</p>
            <svg viewBox="0 0 320 150" width="100%" aria-hidden="true" focusable="false" className={s.layerSvg}>
              {layer.lines.map(([x1, y1, x2, y2, color, width, dash], i) => {
                const solid = dash === "none";
                return (
                  <line
                    key={`l${i}`}
                    data-a={solid ? "draw" : "fade"}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeWidth={width}
                    strokeDasharray={solid ? "1" : dash}
                    pathLength={solid ? 1 : Math.round(Math.hypot(x2 - x1, y2 - y1))}
                    style={{ stroke: color }}
                  />
                );
              })}
              {layer.rings.map((ring, i) => (
                <circle key={`r${i}`} data-a="ring" cx={ring.cx} cy={ring.cy} r={ring.r} fill="none" strokeWidth={1.5} pathLength={1} strokeDasharray={1} style={{ stroke: "var(--pb-signal)" }} />
              ))}
              {layer.squares.map(([x, y], i) => (
                <rect key={`q${i}`} data-a="dot" x={x} y={y} width={8} height={8} style={{ fill: "var(--pb-ink)" }} />
              ))}
            </svg>
            <div aria-hidden="true" className={s.layerLabels}>
              {layer.labels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

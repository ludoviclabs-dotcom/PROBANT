"use client";

import { useEffect, type RefObject } from "react";
import { EASE, canAnimate } from "@/components/charte/motion";

/**
 * Mouvement d'entrée de la Synthèse, joué une seule fois au montage :
 *  - sections `[data-entry]` : les filets se tracent (scaleX 360 ms), puis le texte monte de 8 px en fondu
 *    (280 ms, décalage de 40 ms) — moins de 900 ms au total ;
 *  - groupes `[data-anim-group]` : à leur entrée dans la fenêtre, le Sankey trace ses flux de gauche à droite
 *    (700 ms, décalage de 45 ms), les autres graphiques apparaissent en cascade (fondu 240 ms).
 * Sous `prefers-reduced-motion`, rien n'est animé : les états finaux sont déjà à l'écran.
 */
export function useEntryMotion(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    if (!el || !canAnimate(el)) return;
    const animations: Animation[] = [];
    const play = (node: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => animations.push(node.animate(keyframes, { easing: EASE, fill: "backwards", ...options }));

    el.querySelectorAll("[data-entry]").forEach((section) => {
      section.querySelectorAll('[data-a="rule"]').forEach((rule, i) => play(rule, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 360, delay: Math.min(i, 6) * 30 }));
      section.querySelectorAll('[data-a="txt"]').forEach((text, i) => play(text, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 280, delay: 200 + Math.min(i, 10) * 40 }));
    });

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer?.unobserve(entry.target);
            const group = entry.target;
            if (group.getAttribute("data-anim-group") === "sankey") {
              group.querySelectorAll('[data-a="flow"]').forEach((path, i) => play(path, [{ strokeDashoffset: "1" }, { strokeDashoffset: "0" }], { duration: 700, delay: i * 45 }));
              group.querySelectorAll('[data-a="band"]').forEach((path, i) => play(path, [{ opacity: 0 }, { opacity: 1 }], { duration: 480, delay: 160 + i * 45 }));
            } else {
              group.querySelectorAll('[data-a="bar"],[data-a="cell"],[data-a="tick"]').forEach((node, i) => play(node, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: Math.min(i, 18) * 30 }));
            }
          }
        },
        { threshold: 0.12 },
      );
      el.querySelectorAll("[data-anim-group]").forEach((group) => observer?.observe(group));
    }
    return () => {
      observer?.disconnect();
      animations.forEach((a) => a.cancel());
    };
  }, [root]);
}

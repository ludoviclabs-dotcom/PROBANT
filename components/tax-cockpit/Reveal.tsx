"use client";

/**
 * Révélation au scroll (fade + translate Y 24 px, 400 ms). Le contenu est
 * visible au rendu serveur et sans IntersectionObserver : l'animation n'est
 * qu'un renfort, jamais une condition d'affichage.
 */

import { useEffect, useRef, useState } from "react";

export function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<"idle" | "pre" | "in">("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    setPhase("pre");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase("in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={phase === "pre" ? "pbz-reveal-pre" : phase === "in" ? "pbz-reveal-in" : undefined}
      style={{ ...style, animationDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}

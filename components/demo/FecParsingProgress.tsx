"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * Progress de parsing FEC — théâtre de l'étape « dépôt » de la visite guidée.
 * Rejoue en ~3,5 s la séquence réelle du pipeline (lecture, validation LPF,
 * moteur de constats, seuil ISA 320) avec un log façon terminal (typewriter).
 *
 * Les chiffres affichés (`facts`) viennent du dossier démo via tour.ts —
 * empreinte FEC, nombre de silos/constats, seuil calculé — jamais inventés ici.
 * Se positionne DANS la dropzone spotlightée (bas-gauche), pointer-events:none.
 */

interface ParsingFacts {
  fingerprint: string;
  silos: number;
  findings: number;
  seuil: string;
}

interface LogLine {
  at: number; // ms depuis le début
  to: number; // progression cible (%)
  text: string;
  ok?: boolean;
}

function buildSequence(f: ParsingFacts): LogLine[] {
  return [
    { at: 0, to: 25, text: `Lecture FEC · empreinte ${f.fingerprint}…` },
    { at: 800, to: 55, text: "Validation LPF art. A.47 A-1…" },
    { at: 1600, to: 85, text: `Moteur de constats · ${f.silos} silos · ${f.findings} constats` },
    { at: 2500, to: 95, text: `Calcul seuil ISA 320 · ${f.seuil}` },
    { at: 3200, to: 100, text: "✓ Dossier DEMO SA prêt", ok: true },
  ];
}

const FADE_AT = 3500;
const DONE_AT = 3820; // fade-out 300 ms compris

export function FecParsingProgress({
  anchorRect,
  facts,
  onDone,
}: {
  anchorRect: DOMRect;
  facts: ParsingFacts;
  onDone: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const seqRef = useRef(buildSequence(facts));
  const [visibleCount, setVisibleCount] = useState(0);
  const [pct, setPct] = useState(0);
  const [fading, setFading] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => void (onDoneRef.current = onDone), [onDone]);

  useEffect(() => {
    const seq = seqRef.current;
    if (reduced) {
      setVisibleCount(seq.length);
      setPct(100);
      const t = window.setTimeout(() => onDoneRef.current(), 700);
      return () => window.clearTimeout(t);
    }
    const timers: number[] = [];
    seq.forEach((line, i) => {
      timers.push(
        window.setTimeout(() => {
          setVisibleCount(i + 1);
          setPct(line.to);
        }, line.at),
      );
    });
    timers.push(window.setTimeout(() => setFading(true), FADE_AT));
    timers.push(window.setTimeout(() => onDoneRef.current(), DONE_AT));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduced]);

  const seq = seqRef.current;
  const width = Math.min(430, Math.max(280, anchorRect.width - 36));

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: anchorRect.left + 18,
        top: anchorRect.bottom - 18,
        transform: "translateY(-100%)",
        width,
        zIndex: 9992,
        pointerEvents: "none",
        borderRadius: 12,
        border: "1px solid var(--pb-border-strong, #324563)",
        background: "color-mix(in srgb, var(--pb-bg, #0a0e14) 92%, transparent)",
        backdropFilter: "blur(4px)",
        padding: "11px 14px 12px",
        boxShadow: "0 16px 44px rgba(0,0,0,.55)",
        opacity: fading ? 0 : 1,
        transition: "opacity .3s ease",
        animation: "pb-fade-in .25s ease both",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 7,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--pb-text-faint, #5c6b82)",
          }}
        >
          Moteur PROBANT
        </span>
        <span
          className="tnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            fontWeight: 700,
            color: "var(--pb-accent, #6366f1)",
          }}
        >
          {pct} %
        </span>
      </div>

      {/* Barre de progression (glow subtil, largeur transitionnée). */}
      <div
        style={{
          height: 5,
          borderRadius: 5,
          background: "var(--pb-surface-3, #1d2738)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 5,
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--pb-accent, #6366f1) 65%, transparent), var(--pb-accent, #6366f1))",
            boxShadow: "0 0 10px color-mix(in srgb, var(--pb-accent, #6366f1) 55%, transparent)",
            transition: "width .45s cubic-bezier(.3,.7,.4,1)",
          }}
        />
      </div>

      {/* Log terminal : chaque ligne arrive en machine à écrire. */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          lineHeight: 1.5,
        }}
      >
        {seq.slice(0, visibleCount).map((line) => (
          <div
            key={line.at}
            style={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "clip",
              color: line.ok ? "var(--pb-ok, #22c55e)" : "var(--pb-text-muted, #8a99af)",
              ["--pb-tw-width" as string]: `${line.text.length + 1}ch`,
              animation: `pb-typewriter .42s steps(${Math.max(8, line.text.length)}) both`,
            }}
          >
            <span style={{ color: "var(--pb-text-faint, #5c6b82)" }}>› </span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

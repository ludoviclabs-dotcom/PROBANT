"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import s from "./tour.module.css";

/**
 * Journal du moteur — mise en scène de l'étape « dépôt ». Rejoue en ~3,5 s la séquence réelle du pipeline :
 * lecture et empreinte, contrôle LPF art. A.47 A-1, moteur de constats, seuil de signification.
 *
 * Les valeurs (`facts`) viennent du dossier démo via `lib/demo/tour.ts` — empreinte, alertes d'admissibilité,
 * silos, constats, seuil calculé — jamais inventées ici. Le seuil est présenté comme ce qu'il est : un calcul
 * sur un paramètre interne du registre, pas un montant fixé par une norme. Ancré dans le cadre, pointer-events:none.
 */

interface ParsingFacts {
  fingerprint: string;
  silos: number;
  findings: number;
  blockingAdmissibility: number;
  seuil: string;
  societe: string;
}

interface LogLine {
  at: number;
  to: number;
  text: string;
  tone?: "ok" | "alert";
}

const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

function buildSequence(f: ParsingFacts): LogLine[] {
  return [
    { at: 0, to: 25, text: `Lecture du FEC · empreinte ${f.fingerprint}` },
    {
      at: 800,
      to: 50,
      text: `Contrôle LPF art. A.47 A-1 · ${f.blockingAdmissibility} ${plural(f.blockingAdmissibility, "alerte bloquante", "alertes bloquantes")}`,
      tone: f.blockingAdmissibility > 0 ? "alert" : undefined,
    },
    { at: 1600, to: 80, text: `Moteur de constats · ${f.silos} silos · ${f.findings} constats` },
    { at: 2400, to: 95, text: `Seuil de signification · ${f.seuil} · paramètre interne` },
    { at: 3100, to: 100, text: `Dossier ${f.societe} prêt pour la revue`, tone: "ok" },
  ];
}

const FADE_AT = 3600;
const DONE_AT = 3900;
const TICKS = 20;

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
      const t = window.setTimeout(() => onDoneRef.current(), 2400);
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
  const width = Math.min(440, Math.max(260, anchorRect.width - 32));
  const on = Math.round((pct / 100) * TICKS);

  return (
    <div
      aria-hidden
      className={s.log}
      data-fading={fading ? "" : undefined}
      style={{ left: anchorRect.left + 16, top: Math.max(12, anchorRect.bottom - 16), transform: "translateY(-100%)", width }}
    >
      <div className={s.logHead}>
        <span>Moteur PROBANT</span>
        <span className={s.logPct}>{pct} %</span>
      </div>
      <div className={s.ticks}>
        {Array.from({ length: TICKS }, (_, i) => (
          <i key={i} data-on={i < on ? "" : undefined} />
        ))}
      </div>
      <div className={s.logLines}>
        {seq.slice(0, visibleCount).map((line) => (
          <div key={line.at} className={s.logLine} data-ok={line.tone === "ok" ? "" : undefined} data-alert={line.tone === "alert" ? "" : undefined}>
            <span className={s.logMark}>{line.tone === "ok" ? "■ " : "› "}</span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

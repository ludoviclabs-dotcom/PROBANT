"use client";

import { useEffect, useRef, useState } from "react";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { SEVERITY_LABEL } from "@/components/charte/severity";
import { useReducedMotion } from "@/components/charte/motion";
import { CLOISON_SCENES, type CloisonFamily } from "./content";
import { WIDE_MIN, useViewportHeight, useViewportWidth } from "./useViewport";
import s from "./landing.module.css";

const ROW_HEIGHT = 48;
const SCENES = CLOISON_SCENES.length;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Trait de liaison : plein pour le droit dur, pointillé pour l'interne, tirets pour la méthode. */
const LINK_BORDER: Record<CloisonFamily, string> = {
  "droit dur": "1px solid var(--pb-ink)",
  "paramètre interne": "1px dotted var(--pb-ink-3)",
  "présomption d’audit": "1px dashed var(--pb-ink)",
};

/**
 * 02 · Revue par cloison : une section collante, pilotée par le défilement. L'état d'une catégorie comptable
 * se reconstruit ligne à ligne, la ligne en anomalie est cerclée en trait, puis reliée à son constat
 * (montant, seuil, source). Cinq scènes, une par catégorie ; la piste fait 4,2 hauteurs d'écran.
 */
export function CloisonReplay() {
  const width = useViewportWidth();
  const vh = useViewportHeight();
  const wide = width >= WIDE_MIN;
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const done = clamp01(-rect.top / Math.max(1, rect.height - window.innerHeight));
      const next = Math.min(SCENES - 0.001, done * SCENES);
      setProgress((previous) => (Math.abs(next - previous) > 0.004 ? next : previous));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [vh]);

  const index = Math.floor(progress);
  const scene = CLOISON_SCENES[index];
  const local = reduced ? 1 : progress - index;
  const between = (from: number, to: number) => clamp01((local - from) / (to - from));
  const ring = between(0.3, 0.55);
  const link = between(0.55, 0.7);
  const note = between(0.62, 0.8);
  const noteReveal = { opacity: note, transform: `translateY(${((1 - note) * 8).toFixed(1)}px)` };
  const rowCenter = scene.flag * ROW_HEIGHT + ROW_HEIGHT / 2;

  return (
    <section id="cloisons" ref={trackRef} aria-labelledby="clo-t" className={s.track} style={{ height: Math.round(vh * 4.2) }}>
      <div className={s.sticky} style={{ height: vh }}>
        <div className={s.cloText}>
          <div className={s.cloHead}>
            <span className={s.sectionNum}>02</span>
            <h2 id="clo-t" className={s.h2Clo}>Revue par cloison</h2>
          </div>
          <p className={s.cloLead}>
            Chaque catégorie comptable est reconstruite depuis le FEC. La ligne en anomalie est cerclée, puis reliée à son constat : montant, seuil, source.
          </p>
          {wide ? (
            <ol aria-hidden="true" className={s.cloList}>
              {CLOISON_SCENES.map((item, i) => (
                <li key={item.label} className={s.cloItem} data-active={i === index ? "" : undefined}>
                  <span className={s.cloItemNum}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={s.cloItemLabel}>{item.label}</span>
                  <span className={s.cloItemAccount}>{item.account}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p aria-hidden="true" className={s.cloCaption}>
              {String(index + 1).padStart(2, "0")} / {String(SCENES).padStart(2, "0")} · {scene.label}
            </p>
          )}
        </div>

        <div aria-hidden="true" className={s.cloScene}>
          <div className={s.cloSceneHead}>
            <span className={s.cloSceneTitle}>{scene.title}</span>
            <span className={s.cloSceneUnit}>EUR · FEC DEMO SA</span>
          </div>
          <div className={s.cloRows}>
            {scene.rows.map(([account, label, value], i) => {
              const reveal = between(i * 0.06, i * 0.06 + 0.16);
              const total = account === "";
              return (
                <div
                  key={`${account}-${label}`}
                  className={s.cloRow}
                  data-total={total ? "" : undefined}
                  data-flag={i === scene.flag ? "" : undefined}
                  style={{ opacity: 0.15 + 0.85 * reveal, transform: `translateY(${((1 - reveal) * 8).toFixed(1)}px)` }}
                >
                  <span className={s.cloRowAccount}>{account}</span>
                  <span className={s.cloRowLabel}>{label}</span>
                  <span className={s.cloRowValue}>{value}</span>
                </div>
              );
            })}
            <svg width="100%" height={scene.rows.length * ROW_HEIGHT} focusable="false" className={s.cloRing}>
              <rect x={-8} y={scene.flag * ROW_HEIGHT + 2} width="calc(100% + 16px)" height={44} rx={14} fill="none" strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={(1 - ring).toFixed(3)} style={{ stroke: "var(--pb-signal)" }} />
            </svg>
            {wide && (
              <>
                <div className={s.cloLink} style={{ top: rowCenter, width: 40 * link, borderTop: LINK_BORDER[scene.family] }} />
                <div className={s.cloNote} style={{ top: Math.max(0, rowCenter - 54), ...noteReveal }}>
                  <NoteBody scene={scene} />
                </div>
              </>
            )}
          </div>
          {!wide && (
            <div className={s.cloNoteStacked} style={noteReveal}>
              <NoteBody scene={scene} />
            </div>
          )}
        </div>

        {/* Alternative lisible : les cinq scènes en texte, sans dépendre du défilement. */}
        <ol className="sr-only">
          {CLOISON_SCENES.map((item) => (
            <li key={item.label}>
              {item.label} : {item.title}. Ligne repérée : {item.rows[item.flag][1]}. {item.ref}, {SEVERITY_LABEL[item.severity].toLowerCase()}, {item.family} : {item.findingTitle}. Constaté {item.found}, seuil {item.threshold}, source {item.source}.
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function NoteBody({ scene }: { scene: (typeof CLOISON_SCENES)[number] }) {
  return (
    <>
      <div className={s.noteHead}>
        <SeverityGlyph severity={scene.severity} />
        {scene.ref} · {SEVERITY_LABEL[scene.severity]} · {scene.family}
      </div>
      <div className={s.cloNoteTitle}>{scene.findingTitle}</div>
      <div className={s.cloNoteGrid}>
        <span>Constaté</span>
        <span className={s.mono}>{scene.found}</span>
        <span>Seuil</span>
        <span className={s.mono}>{scene.threshold}</span>
        <span>Source</span>
        <span className={s.plain}>{scene.source}</span>
        <span>Faisceau</span>
        <span className={s.bundle}>{scene.bundle}</span>
      </div>
    </>
  );
}

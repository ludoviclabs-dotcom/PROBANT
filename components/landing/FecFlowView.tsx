"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { SEVERITY_LABEL } from "@/components/charte/severity";
import { EASE, EASE_FLOW, canAnimate, prefersReducedMotion } from "@/components/charte/motion";
import { FLOW_DURATION_MS, NOTE_HEIGHT, ROW_HEIGHT, buildFecFlow, flowDescription } from "./fec-flow";
import s from "./landing.module.css";

/**
 * Flux FEC (landing) : les écritures défilent une seule fois (10,5 s, trois arrêts). À chaque arrêt la ligne
 * se détache, le cerclage se trace, puis le filet annoté rejoint le constat. Parallaxe ≤ 24 px au défilement.
 * Sous `prefers-reduced-motion`, l'état final s'affiche directement : les trois repères sont lisibles.
 */
export function FecFlowView({ narrow, viewportWidth }: { narrow: boolean; viewportWidth: number }) {
  const flow = useMemo(() => buildFecFlow(narrow), [narrow]);
  const parRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  // Parallaxe : le flux glisse plus lentement que la page (≤ 24 px).
  useEffect(() => {
    const el = parRef.current;
    if (!el) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      el.style.transform = prefersReducedMotion() ? "none" : `translateY(${Math.min(24, window.scrollY * 0.06).toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Défilement unique, rejoué ni au redimensionnement ni au changement de disposition.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || played.current || !canAnimate(list)) return;
    played.current = true;
    const animations: Animation[] = [];
    const keyframes: Keyframe[] = [{ transform: `translateY(${flow.startY}px)`, offset: 0 }];
    for (const stop of flow.stops) {
      keyframes.push({ transform: `translateY(${stop.translateY}px)`, offset: stop.arriveMs / FLOW_DURATION_MS });
      keyframes.push({ transform: `translateY(${stop.translateY}px)`, offset: stop.leaveMs / FLOW_DURATION_MS });
    }
    keyframes.push({ transform: `translateY(${flow.restY}px)`, offset: 1 });
    animations.push(list.animate(keyframes, { duration: FLOW_DURATION_MS, easing: EASE_FLOW, fill: "backwards" }));

    for (const stop of flow.stops) {
      const at = stop.arriveMs + 150;
      list.querySelectorAll(`[data-row="${stop.key}"]`).forEach((row) => {
        animations.push(row.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 240, delay: at, easing: EASE, fill: "backwards" }));
      });
      list.querySelectorAll(`[data-mark="${stop.key}"]`).forEach((node) => {
        const part = node.getAttribute("data-part");
        if (part === "ring") {
          animations.push(node.animate([{ strokeDashoffset: "1" }, { strokeDashoffset: "0" }], { duration: 520, delay: at + 120, easing: EASE, fill: "backwards" }));
        } else if (part === "line") {
          animations.push(node.animate([{ opacity: 0, clipPath: "inset(0 0 0 100%)" }, { opacity: 1, clipPath: "inset(0 0 0 0)" }], { duration: 420, delay: at + 600, easing: EASE, fill: "backwards" }));
        } else {
          animations.push(node.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 280, delay: at + 900, easing: EASE, fill: "backwards" }));
        }
      });
    }
    return () => animations.forEach((a) => a.cancel());
  }, [flow]);

  const overflow = narrow ? "100%" : `calc(100% + ${Math.max(160, Math.round(viewportWidth * 0.12))}px)`;

  return (
    <div className={s.flowCol} style={{ minHeight: flow.windowHeight }}>
      <div ref={parRef} className={s.flowPar} style={{ width: overflow, height: flow.windowHeight }}>
        <div role="img" aria-label={flowDescription(flow)} className={s.flowWindow}>
          <div ref={listRef} className={s.flowList} style={{ height: flow.listHeight, transform: `translateY(${flow.restY}px)` }}>
            {flow.rows.map((row) => {
              if (row.kind === "gap") {
                return (
                  <div key={row.index} className={s.flowRow} style={{ top: row.y, height: ROW_HEIGHT, paddingLeft: flow.gutter, letterSpacing: ".04em" }}>
                    <span className={s.flowGap}>{row.text}</span>
                  </div>
                );
              }
              if (row.kind === "note") {
                return <div key={row.index} className={s.flowRow} style={{ top: row.y, height: NOTE_HEIGHT, pointerEvents: "none" }} />;
              }
              const flagged = row.anomaly !== null;
              return (
                <div
                  key={row.index}
                  data-row={row.anomaly ?? undefined}
                  className={s.flowRow}
                  style={{
                    top: row.y,
                    height: ROW_HEIGHT,
                    paddingLeft: flow.gutter,
                    color: flagged ? "var(--pb-ink)" : "var(--pb-ink-2)",
                    opacity: flagged ? 1 : 0.45,
                    borderBottom: "1px solid color-mix(in srgb, var(--pb-rule) 45%, transparent)",
                  }}
                >
                  <span className={s.cLine}>{row.line}</span>
                  <span className={s.cJournal}>{row.journal}</span>
                  <span className={s.cDate} style={row.anomaly === "a1" ? { color: "var(--pb-signal)" } : undefined}>{row.date}</span>
                  <span className={s.cAccount}>{row.account}</span>
                  <span className={s.cDebit}>{row.debit}</span>
                  <span className={s.cCredit}>{row.credit}</span>
                  <span className={s.cSpacer} />
                  <span className={s.cLabel}>{row.label}</span>
                  <span className={s.cPiece}>{row.piece}</span>
                </div>
              );
            })}
            <svg width="100%" height={flow.listHeight} aria-hidden="true" focusable="false" className={s.flowMarks}>
              {flow.marks.map((m) => (
                <g key={m.key}>
                  <rect
                    data-mark={m.key}
                    data-part="ring"
                    x={m.ring.x}
                    y={m.ring.y}
                    width={m.ring.width}
                    height={m.ring.height}
                    rx={12}
                    fill="none"
                    strokeWidth={1.5}
                    pathLength={1}
                    strokeDasharray={1}
                    style={{ stroke: "var(--pb-signal)" }}
                  />
                  <path data-mark={m.key} data-part="line" d={m.connector} fill="none" strokeWidth={1} strokeDasharray={m.dash === "none" ? undefined : m.dash} style={{ stroke: "var(--pb-ink)" }} />
                  <line data-mark={m.key} data-part="line" x1={m.tick.x} y1={m.tick.y1} x2={m.tick.x} y2={m.tick.y2} strokeWidth={1} style={{ stroke: "var(--pb-ink)" }} />
                </g>
              ))}
            </svg>
            {flow.marks.map((m) => (
              <div
                key={m.key}
                data-mark={m.key}
                data-part="note"
                className={s.flowNote}
                style={{
                  left: m.note.left,
                  top: m.note.top,
                  width: m.note.width,
                  right: m.note.right,
                  ...(m.note.bordered ? { paddingLeft: 12, borderLeft: "1px solid var(--pb-ink)" } : null),
                }}
              >
                <div className={s.noteHead}>
                  <SeverityGlyph severity={m.severity} />
                  {m.ref} · {SEVERITY_LABEL[m.severity]}
                </div>
                <div className={s.noteTitle}>{m.title}</div>
                <div className={s.noteSource}>
                  <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden="true" focusable="false">
                    <rect width={8} height={8} style={{ fill: "var(--pb-ink)" }} />
                  </svg>
                  {m.source}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

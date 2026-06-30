"use client";

/**
 * Moteur de la « Visite guidée » — auto-joué, par-dessus le VRAI produit.
 *
 * État porté par l'URL (`?guide=1&etape=n`) → survit aux navigations entre
 * pages et au rechargement, sans store global. Le composant est monté une seule
 * fois dans le layout racine ; il pilote la navigation, met en lumière
 * (spotlight) l'élément `data-tour` de chaque étape et fait défiler la narration
 * en auto-play (barre de progression synchronisée par requestAnimationFrame).
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pause, Play, ChevronLeft, ChevronRight, X, RotateCcw, Flag } from "lucide-react";
import { TOUR_STEPS, type TourPlacement } from "@/lib/demo/tour";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { DemoDocumentIcon, type DemoDocVariant } from "@/components/demo/DemoDocumentIcon";

const ACCENT = "#5b9dff";
const Z = 9000;

/** Palette de gravité (alignée sur CloisonsWorkspace) pour colorer le spotlight d'un constat flaggé. */
const SEV_TOUR: Record<string, { hex: string; label: string }> = {
  bloquant: { hex: "#ef4d5a", label: "Bloquant" },
  majeur: { hex: "#f0923f", label: "Majeur" },
  mineur: { hex: "#e3bd4d", label: "Mineur" },
  informatif: { hex: "#8a96a6", label: "Informatif" },
};

/**
 * Verdict du dossier démo, illustré par les icônes de la séquence finale.
 * Seuil d'alerte relevé : « risque seul » est réservé au dossier intégralement
 * critique ; dès qu'un majeur/bloquant CO-EXISTE avec des éléments traçables
 * (cas DEMO SA), on montre les DEUX natures.
 */
const FINAL_VERDICT: DemoDocVariant[] = (() => {
  const sev = DEMO_DOSSIER.silos.flatMap((s) => s.findings.map((f) => f.severity));
  const hasAlert = sev.some((s) => s === "bloquant" || s === "majeur");
  const allCritical = sev.length > 0 && sev.every((s) => s === "bloquant");
  if (allCritical) return ["risk"];
  if (!hasAlert) return ["ok"];
  return ["ok", "risk"];
})();
const CARD_W = 360;
const GAP = 18;
const PAD = 10; // marge du spotlight autour de la cible

function hrefFor(i: number) {
  const s = TOUR_STEPS[i];
  return `${s.route}?guide=1&etape=${i}`;
}

/** Position de la carte de narration selon la cible et le placement voulu. */
function cardStyle(
  rect: DOMRect | null,
  placement: TourPlacement | undefined,
  vw: number,
  vh: number,
): React.CSSProperties {
  const width = Math.min(CARD_W, vw - 24);
  if (!rect || placement === "center" || !placement) {
    return {
      width,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }
  const clampL = (l: number) => Math.max(12, Math.min(l, vw - width - 12));
  const cx = rect.left + rect.width / 2;
  switch (placement) {
    case "right": {
      const left = rect.right + GAP;
      const fits = left + width <= vw - 12;
      return fits
        ? { width, left, top: clampTop(rect.top + rect.height / 2, vh), transform: "translateY(-50%)" }
        : { width, left: clampL(rect.left - GAP - width), top: clampTop(rect.top + rect.height / 2, vh), transform: "translateY(-50%)" };
    }
    case "left": {
      const left = rect.left - GAP - width;
      const fits = left >= 12;
      return fits
        ? { width, left, top: clampTop(rect.top + rect.height / 2, vh), transform: "translateY(-50%)" }
        : { width, left: clampL(rect.right + GAP), top: clampTop(rect.top + rect.height / 2, vh), transform: "translateY(-50%)" };
    }
    case "top":
      return { width, left: clampL(cx - width / 2), top: Math.max(12, rect.top - GAP), transform: "translateY(-100%)" };
    case "bottom":
    default:
      return { width, left: clampL(cx - width / 2), top: rect.bottom + GAP };
  }
}

function clampTop(t: number, vh: number) {
  return Math.max(120, Math.min(t, vh - 120));
}

function GuidedTourInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const active = sp.get("guide") === "1";
  const rawStep = Number(sp.get("etape") ?? 0);
  const stepIndex = Number.isFinite(rawStep)
    ? Math.max(0, Math.min(TOUR_STEPS.length - 1, Math.trunc(rawStep)))
    : 0;
  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex >= TOUR_STEPS.length - 1;
  const isFirst = stepIndex === 0;

  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [vp, setVp] = useState({ w: 1280, h: 800 });
  const [flagSev, setFlagSev] = useState<string | null>(null);
  const [finaleReady, setFinaleReady] = useState(false);

  const pausedRef = useRef(paused);
  useEffect(() => void (pausedRef.current = paused), [paused]);

  useEffect(() => {
    setMounted(true);
    setVp({ w: window.innerWidth, h: window.innerHeight });
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const c = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
      router.replace(hrefFor(c), { scroll: false });
    },
    [router],
  );
  const goToRef = useRef(goTo);
  useEffect(() => void (goToRef.current = goTo), [goTo]);

  const quit = useCallback(() => {
    setPaused(false);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  // — Synchronise la route avec l'étape courante (navigation auto entre pages).
  useEffect(() => {
    if (!active) return;
    if (pathname !== step.route) router.replace(hrefFor(stepIndex), { scroll: false });
  }, [active, pathname, step.route, stepIndex, router]);

  // — Localise et suit la cible `data-tour` de l'étape.
  useEffect(() => {
    if (!active) return;
    setReady(false);
    setRect(null);
    setFlagSev(null);
    if (pathname !== step.route) return;
    if (!step.target) {
      setReady(true);
      return;
    }
    let raf = 0;
    let tries = 0;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const find = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        setFlagSev(el.getAttribute("data-tour-flag"));
        const measure = () => !cancelled && setRect(el.getBoundingClientRect());
        measure();
        const t = window.setTimeout(measure, 380);
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener("scroll", measure, true);
        window.addEventListener("resize", measure);
        cleanup = () => {
          window.clearTimeout(t);
          ro.disconnect();
          window.removeEventListener("scroll", measure, true);
          window.removeEventListener("resize", measure);
        };
        setReady(true);
        return;
      }
      if (tries++ < 150) raf = requestAnimationFrame(find);
      else setReady(true); // cible introuvable → carte centrée
    };
    find();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, [active, pathname, step.route, step.target, stepIndex]);

  // — Auto-play : progression synchronisée + passage auto (sauf dernière étape).
  useEffect(() => {
    if (!active || !ready) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let stopped = false;
    setProgress(0);
    const tick = (now: number) => {
      if (stopped) return;
      if (!pausedRef.current) elapsed += now - last;
      last = now;
      const p = Math.min(1, elapsed / step.duration);
      setProgress(p);
      if (p >= 1) {
        if (!isLast) {
          goToRef.current(stepIndex + 1);
          return;
        }
        return; // dernière étape : on reste, l'utilisateur décide
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active, ready, stepIndex, step.duration, isLast]);

  // — Raccourcis clavier.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") quit();
      else if (e.key === "ArrowRight") goTo(stepIndex + 1);
      else if (e.key === "ArrowLeft") goTo(stepIndex - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stepIndex, goTo, quit]);

  // — Séquence finale : icônes verdict d'abord, carte de conclusion à t+800ms.
  useEffect(() => {
    if (!active || !isLast) {
      setFinaleReady(true);
      return;
    }
    setFinaleReady(false);
    const t = window.setTimeout(() => setFinaleReady(true), 800);
    return () => window.clearTimeout(t);
  }, [active, isLast, stepIndex]);

  if (!mounted || !active) return null;

  const hasSpot = !!rect && !!step.target;
  const cs = cardStyle(rect, step.target ? step.placement : "center", vp.w, vp.h);
  const pct = Math.round(progress * 100);

  // Anneau coloré selon la gravité du constat flaggé (sinon bleu info).
  const flag = flagSev ? SEV_TOUR[flagSev] : null;
  const ringColor = flag?.hex ?? ACCENT;
  // Sur la conclusion, la carte n'apparaît qu'après l'entrée des icônes verdict.
  const cardVisible = !isLast || finaleReady;
  const narrow = vp.w < 860;
  // Icônes verdict : colonne à gauche de la carte (large) ou rangée au-dessus (étroit).
  const finaleIconsStyle: React.CSSProperties = narrow
    ? { top: "calc(50% - 250px)", left: "50%", transform: "translateX(-50%)", flexDirection: "row", gap: 30 }
    : { top: "50%", left: "calc(50% - 352px)", transform: "translateY(-50%)", flexDirection: "column", gap: 22 };

  return createPortal(
    <div aria-live="polite" style={{ position: "fixed", inset: 0, zIndex: Z, pointerEvents: "none" }}>
      {/* Couche de capture : bloque l'interaction avec l'app pendant la démo. */}
      <div
        onClick={() => setPaused((p) => !p)}
        style={{
          position: "fixed",
          inset: 0,
          background: hasSpot ? "transparent" : "rgba(5,8,13,0.74)",
          pointerEvents: "auto",
          cursor: "default",
          transition: "background .3s ease",
        }}
      />
      {/* Spotlight : trou lumineux découpé dans l'assombrissement. */}
      {hasSpot && (
        <>
          <div
            style={{
              position: "fixed",
              left: rect!.left - PAD,
              top: rect!.top - PAD,
              width: rect!.width + PAD * 2,
              height: rect!.height + PAD * 2,
              borderRadius: 14,
              boxShadow: "0 0 0 9999px rgba(5,8,13,0.74)",
              transition: "all .35s cubic-bezier(.4,0,.2,1)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: rect!.left - PAD,
              top: rect!.top - PAD,
              width: rect!.width + PAD * 2,
              height: rect!.height + PAD * 2,
              borderRadius: 14,
              border: `2px solid ${ringColor}`,
              boxShadow: `0 0 0 1px ${ringColor}55, 0 0 22px ${ringColor}66`,
              animation: "pb-pulse-ring 2s ease-out infinite",
              ["--ring-color" as string]: `${ringColor}66`,
              transition: "all .35s cubic-bezier(.4,0,.2,1)",
              pointerEvents: "none",
            }}
          />
          {/* Pastille « constat flaggé » colorée selon la gravité. */}
          {flag && (
            <div
              style={{
                position: "fixed",
                left: rect!.left - PAD,
                top:
                  rect!.top - PAD - 30 < 8
                    ? rect!.top + rect!.height + PAD + 8
                    : rect!.top - PAD - 30,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: ringColor,
                background: "rgba(10,14,20,0.92)",
                border: `1px solid ${ringColor}`,
                boxShadow: `0 0 14px ${ringColor}55`,
                animation: "pb-fade-in .3s ease",
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              <Flag size={11} fill={ringColor} /> Constat flaggé · {flag.label}
            </div>
          )}
        </>
      )}

      {/* Icônes « verdict » de la séquence finale — entrent avant la carte. */}
      {isLast && (
        <div style={{ position: "fixed", display: "flex", alignItems: "center", pointerEvents: "none", ...finaleIconsStyle }}>
          {FINAL_VERDICT.map((v, i) => (
            <DemoDocumentIcon key={v} variant={v} delay={i * 160} />
          ))}
        </div>
      )}

      {/* Carte de narration. */}
      {cardVisible && (
      <div
        role="dialog"
        aria-label={step.title}
        style={{
          position: "fixed",
          ...cs,
          pointerEvents: "auto",
          background: "var(--pb-surface, #111722)",
          border: "1px solid var(--pb-border-strong, #324563)",
          borderRadius: 16,
          padding: "18px 18px 14px",
          boxShadow: "0 24px 70px rgba(0,0,0,.6)",
          animation: "pb-fade-in .28s ease",
          color: "var(--pb-text, #e6edf6)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: ACCENT,
            }}
          >
            {step.kicker}
          </span>
          <button
            onClick={quit}
            aria-label="Quitter la visite"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--pb-text-faint, #5c6b82)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 2,
            }}
          >
            <X size={14} /> Quitter
          </button>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, margin: "0 0 6px" }}>
          {step.title}
        </h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--pb-text-muted, #8a99af)", margin: 0 }}>
          {step.body}
        </p>

        {step.enClair && (
          <p
            style={{
              marginTop: 10,
              padding: "8px 10px",
              fontSize: 11.5,
              lineHeight: 1.45,
              borderRadius: 9,
              background: "var(--pb-surface-2, #161d2b)",
              border: "1px solid var(--pb-border, #243044)",
              color: "var(--pb-text-muted, #8a99af)",
            }}
          >
            <strong style={{ color: ACCENT }}>En clair —</strong> {step.enClair}
          </p>
        )}

        {/* Barre de progression de l'étape. */}
        <div
          style={{
            marginTop: 14,
            height: 3,
            borderRadius: 3,
            background: "var(--pb-surface-3, #1d2738)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: ACCENT,
              borderRadius: 3,
              transition: "width .12s linear",
            }}
          />
        </div>

        {/* Contrôles. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Ctrl onClick={() => goTo(stepIndex - 1)} disabled={isFirst} label="Précédent">
              <ChevronLeft size={16} />
            </Ctrl>
            <Ctrl onClick={() => setPaused((p) => !p)} label={paused ? "Reprendre" : "Pause"} primary>
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </Ctrl>
            {isLast ? (
              <Ctrl onClick={() => goTo(0)} label="Rejouer">
                <RotateCcw size={15} />
              </Ctrl>
            ) : (
              <Ctrl onClick={() => goTo(stepIndex + 1)} label="Suivant">
                <ChevronRight size={16} />
              </Ctrl>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className="tnum"
              style={{ fontSize: 11, color: "var(--pb-text-faint, #5c6b82)" }}
            >
              {stepIndex + 1} / {TOUR_STEPS.length}
            </span>
            {isLast && (
              <button
                onClick={quit}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#0a0e14",
                  background: ACCENT,
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                Explorer librement
              </button>
            )}
          </div>
        </div>
      </div>
      )}
    </div>,
    document.body,
  );
}

function Ctrl({
  onClick,
  disabled,
  label,
  primary,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: primary ? 34 : 30,
        height: primary ? 34 : 30,
        borderRadius: 9,
        border: `1px solid ${primary ? ACCENT : "var(--pb-border-strong, #324563)"}`,
        background: primary ? `${ACCENT}1f` : "var(--pb-surface-2, #161d2b)",
        color: disabled ? "var(--pb-text-faint, #5c6b82)" : primary ? ACCENT : "var(--pb-text, #e6edf6)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function GuidedTour() {
  return (
    <Suspense fallback={null}>
      <GuidedTourInner />
    </Suspense>
  );
}

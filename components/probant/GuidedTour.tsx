"use client";

/**
 * Moteur de la « Visite guidée » — auto-joué, par-dessus le VRAI produit.
 *
 * État porté par l'URL (`?guide=1&etape=n`) → survit aux navigations entre
 * pages et au rechargement, sans store global. Le composant est monté une seule
 * fois dans le layout racine ; il pilote la navigation, met en lumière
 * (spotlight) l'élément `data-tour` de chaque étape et fait défiler la narration
 * en auto-play (barre de progression synchronisée par requestAnimationFrame).
 *
 * Transition vers une nouvelle étape (parcours 8 temps de lib/demo/tour.ts) :
 *  1. route ≠ route courante → navigation (router.replace, pour ne pas empiler
 *     l'historique) ; la boucle de recherche de cible absorbe le délai de rendu ;
 *  2. `tab` défini → clic simulé sur `[data-tour-tab="<tab>"]` avant de chercher
 *     la cible (certaines cibles n'existent qu'après bascule d'onglet) ;
 *  3. cible trouvée → le curseur fantôme voyage (600 ms), ripple, puis le
 *     spotlight s'ouvre 200 ms après l'arrivée ;
 *  4. spotlight ouvert → `simulatedAction` à +300 ms (nettoyée en sortie
 *     d'étape), callout « artefact connecté » à +400 ms, pulse éventuel.
 *
 * Tous les overlays de démo sont pointer-events:none (sauf la couche de capture
 * et la carte de narration) et ne se montent que si `?guide=1` est présent.
 * Hiérarchie z (dans le portail) : particules 9990 < scan 9991 < parsing 9992 <
 * callout 9995 < curseur 9998 < carte 9999.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Flag,
  Network,
  FileCheck2,
  Scale,
} from "lucide-react";
import {
  TOUR_STEPS,
  TOUR_PARSING_FACTS,
  TOUR_VERDICT_METRICS,
  type TourPlacement,
} from "@/lib/demo/tour";
import { GhostCursor } from "@/components/demo/GhostCursor";
import { DemoCallout, type CalloutSide } from "@/components/demo/DemoCallout";
import { ScanLine } from "@/components/demo/ScanLine";
import { FecParsingProgress } from "@/components/demo/FecParsingProgress";
import { DataParticles } from "@/components/demo/DataParticles";
import { useDemoCounter } from "@/components/demo/useDemoCounter";
import { usePrefersReducedMotion } from "@/components/demo/usePrefersReducedMotion";

const ACCENT = "#5b9dff";
const Z = 9000;

/** Palette de gravité (alignée sur CloisonsWorkspace) pour colorer le spotlight d'un constat flaggé. */
const SEV_TOUR: Record<string, { hex: string; label: string }> = {
  bloquant: { hex: "#ef4d5a", label: "Bloquant" },
  majeur: { hex: "#f0923f", label: "Majeur" },
  mineur: { hex: "#e3bd4d", label: "Mineur" },
  informatif: { hex: "#8a96a6", label: "Informatif" },
};

const CARD_W = 360;
const GAP = 18;
const PAD = 10; // marge du spotlight autour de la cible
/** Hauteur prudente de la carte, pour les retombées de placement (clamps). */
const CARD_EST_H = 290;

/** Pages « denses » qui reçoivent la scan line à l'entrée pendant la visite. */
const SCAN_ROUTES = new Set(["/dashboard/risques", "/dashboard/cloisons"]);

/** Jetons des particules de données — comptes PCG, normes et valeurs réelles du dossier. */
const PARTICLE_TOKENS = [
  "411",
  "512",
  "FEC",
  "ISA 320",
  "PCG",
  "NEP",
  "LPF",
  "A.47 A-1",
  TOUR_PARSING_FACTS.seuil,
  `${TOUR_PARSING_FACTS.findings} constats`,
];

/** Côté de la callout : à l'opposé de la carte de narration. */
const CALLOUT_SIDE: Record<TourPlacement, CalloutSide> = {
  right: "left",
  left: "right",
  top: "bottom",
  bottom: "top",
  center: "top",
};

function hrefFor(i: number) {
  const s = TOUR_STEPS[i];
  return `${s.route}?guide=1&etape=${i}`;
}

/**
 * Position de la carte de narration selon la cible et le placement voulu.
 * Les cibles LARGES (matrice, graphe, silo) débordent souvent : chaque
 * placement retombe alors sur une variante « overlay » ancrée au bord du
 * viewport, qui recouvre la zone la moins porteuse de sens de la cible.
 */
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
  const centeredV = {
    top: clampTop(rect.top + rect.height / 2, vh),
    transform: "translateY(-50%)",
  };
  const bottomFlow = (): React.CSSProperties =>
    rect.bottom + GAP + CARD_EST_H <= vh - 12
      ? { width, left: clampL(cx - width / 2), top: rect.bottom + GAP }
      : // Overlay : ancrée au bas du viewport, recouvre le bas de la cible.
        { width, left: clampL(cx - width / 2), top: vh - 24, transform: "translateY(-100%)" };

  switch (placement) {
    case "right": {
      const left = rect.right + GAP;
      if (left + width <= vw - 12) return { width, left, ...centeredV };
      const alt = rect.left - GAP - width;
      if (alt >= 12) return { width, left: alt, ...centeredV };
      return { width, left: vw - width - 24, ...centeredV };
    }
    case "left": {
      const left = rect.left - GAP - width;
      if (left >= 12) return { width, left, ...centeredV };
      const alt = rect.right + GAP;
      if (alt + width <= vw - 12) return { width, left: alt, ...centeredV };
      return { width, left: 24, ...centeredV };
    }
    case "top":
      if (rect.top - GAP - CARD_EST_H >= 12)
        return { width, left: clampL(cx - width / 2), top: rect.top - GAP, transform: "translateY(-100%)" };
      return bottomFlow();
    case "bottom":
    default:
      return bottomFlow();
  }
}

function clampTop(t: number, vh: number) {
  return Math.max(150, Math.min(t, vh - 150));
}

/** Mini-card du verdict final : compteur animé + pastille LIVE + icône. */
function VerdictMetricCard({
  icon,
  target,
  label,
  durationMs,
  index,
  started,
}: {
  icon: "network" | "file" | "scale";
  target: number;
  label: string;
  durationMs: number;
  index: number;
  started: boolean;
}) {
  // Le compteur ne part qu'à l'entrée réelle de la card (stagger 300 ms/card).
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!started) {
      setGo(false);
      return;
    }
    const t = window.setTimeout(() => setGo(true), index * 300 + 120);
    return () => window.clearTimeout(t);
  }, [started, index]);
  const value = useDemoCounter(target, durationMs, go);
  const done = go && value >= target;
  const Icon = icon === "network" ? Network : icon === "file" ? FileCheck2 : Scale;

  return (
    <div
      style={{
        width: 232,
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 14,
        border: "1px solid var(--pb-border-strong, #324563)",
        background: "var(--pb-surface, #111722)",
        boxShadow: "0 18px 50px rgba(0,0,0,.5)",
        padding: "13px 15px",
        animation: `pb-doc-in .5s cubic-bezier(.34,1.56,.64,1) ${index * 300}ms both`,
      }}
    >
      <span
        style={{
          display: "flex",
          width: 34,
          height: 34,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          background: `${ACCENT}24`,
          color: ACCENT,
          flexShrink: 0,
        }}
      >
        <Icon size={17} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span
          className="tnum"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "var(--font-mono)",
            fontSize: 20,
            fontWeight: 800,
            color: "var(--pb-text, #e6edf6)",
          }}
        >
          {value}
          {!done && <span className="pb-live-dot" aria-hidden />}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--pb-text-muted, #8a99af)" }}>{label}</span>
      </span>
    </div>
  );
}

/** Phase de mise en scène d'une étape : recherche → voyage du curseur → spotlight. */
type StepPhase = "seek" | "cursor" | "spot";

function GuidedTourInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();

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
  const [phase, setPhase] = useState<StepPhase>("seek");
  const [calloutOn, setCalloutOn] = useState(false);
  const [parseState, setParseState] = useState<"idle" | "running" | "done">("idle");
  const [particlesOn, setParticlesOn] = useState(false);
  const [scanNonce, setScanNonce] = useState(0);
  // Valeur résolue de la callout (lecture du DOM rendu), figée à l'ouverture.
  const [calloutValue, setCalloutValue] = useState<string | null>(null);

  const pausedRef = useRef(paused);
  useEffect(() => void (pausedRef.current = paused), [paused]);
  const stepIndexRef = useRef(stepIndex);
  useEffect(() => void (stepIndexRef.current = stepIndex), [stepIndex]);

  useEffect(() => {
    setMounted(true);
    setVp({ w: window.innerWidth, h: window.innerHeight });
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // — Attribut de contexte pour les règles CSS « pendant la démo » (globals.css).
  useEffect(() => {
    if (!active) return;
    document.body.setAttribute("data-pb-guide", "1");
    return () => document.body.removeAttribute("data-pb-guide");
  }, [active]);

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

  /** CTA du verdict : quitte la visite et ouvre le dépôt pour un vrai FEC. */
  const importMyFec = useCallback(() => {
    setPaused(false);
    router.push("/dashboard/depot");
  }, [router]);

  // — Synchronise la route avec l'étape courante (navigation auto entre pages).
  useEffect(() => {
    if (!active) return;
    if (pathname !== step.route) router.replace(hrefFor(stepIndex), { scroll: false });
  }, [active, pathname, step.route, stepIndex, router]);

  // — Scan line à l'entrée des pages denses (risques, cloisons) pendant la visite.
  const prevPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      prevPathRef.current = null;
      return;
    }
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (pathname !== prev && SCAN_ROUTES.has(pathname)) {
      setScanNonce((n) => n + 1);
      const t = window.setTimeout(() => setScanNonce(0), 1550);
      return () => window.clearTimeout(t);
    }
  }, [active, pathname]);

  // — Localise et suit la cible `data-tour` de l'étape (après bascule d'onglet
  //   éventuelle) ; lance ensuite le voyage du curseur fantôme.
  useEffect(() => {
    if (!active) return;
    setReady(false);
    setRect(null);
    setFlagSev(null);
    setPhase("seek");
    setCalloutOn(false);
    setCalloutValue(null);
    setParseState("idle");
    setParticlesOn(false);
    if (pathname !== step.route) return;

    let raf = 0;
    let tries = 0;
    let cancelled = false;
    let tabClicked = false;
    let cleanup: (() => void) | null = null;

    const find = () => {
      if (cancelled) return;
      // Bascule d'onglet AVANT la recherche : la cible peut ne monter qu'après.
      if (step.tab && !tabClicked) {
        const tabEl = document.querySelector<HTMLElement>(`[data-tour-tab="${step.tab}"]`);
        if (tabEl) {
          if (tabEl.getAttribute("aria-selected") !== "true") tabEl.click();
          tabClicked = true;
        }
      }
      if (!step.target) {
        if (step.tab && !tabClicked && tries++ < 150) {
          raf = requestAnimationFrame(find);
          return;
        }
        setReady(true);
        setPhase("spot");
        return;
      }
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
        setPhase(reducedMotion ? "spot" : "cursor");
        return;
      }
      if (tries++ < 150) raf = requestAnimationFrame(find);
      else {
        setReady(true); // cible introuvable → carte centrée
        setPhase("spot");
      }
    };
    find();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, [active, pathname, step.route, step.target, step.tab, stepIndex, reducedMotion]);

  // — Arrivée du curseur fantôme : le spotlight s'ouvre 200 ms après.
  const arriveTimerRef = useRef(0);
  const onCursorArrived = useCallback(() => {
    const si = stepIndexRef.current;
    window.clearTimeout(arriveTimerRef.current);
    arriveTimerRef.current = window.setTimeout(() => {
      if (stepIndexRef.current === si) setPhase("spot");
    }, 200);
  }, []);
  useEffect(() => () => window.clearTimeout(arriveTimerRef.current), []);

  // — Spotlight ouvert : action simulée (+300 ms), callout (+400 ms), pulse,
  //   progress de parsing. Tout est nettoyé en quittant l'étape.
  useEffect(() => {
    if (!active || phase !== "spot") return;
    const s = TOUR_STEPS[stepIndex];
    const timers: number[] = [];
    let actionCleanup: (() => void) | null = null;
    let pulseEl: HTMLElement | null = null;

    if (s.simulatedAction) {
      timers.push(
        window.setTimeout(() => {
          const r = s.simulatedAction!();
          if (typeof r === "function") actionCleanup = r;
        }, 300),
      );
    }
    if (s.callout) {
      timers.push(
        window.setTimeout(() => {
          setCalloutValue(s.callout!.resolveValue?.() ?? null);
          setCalloutOn(true);
        }, 400),
      );
    }
    if (s.effects?.pulseTarget) {
      const key = s.effects.pulseTarget;
      timers.push(
        window.setTimeout(() => {
          pulseEl = document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
          pulseEl?.classList.add("pb-demo-node-pulse");
        }, 600),
      );
      timers.push(window.setTimeout(() => pulseEl?.classList.remove("pb-demo-node-pulse"), 2900));
    }
    if (s.effects?.parsingProgress) setParseState("running");

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      actionCleanup?.();
      pulseEl?.classList.remove("pb-demo-node-pulse");
      setCalloutOn(false);
    };
  }, [active, phase, stepIndex]);

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

  // — Séquence finale : mini-cards verdict d'abord, carte de conclusion (avec
  //   le CTA « Importer mon FEC ») en fondu à t+800 ms.
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

  const hasSpot = !!rect && !!step.target && phase === "spot";
  const cs = cardStyle(rect, step.target ? step.placement : "center", vp.w, vp.h);
  const pct = Math.round(progress * 100);

  // Anneau coloré selon la gravité du constat flaggé (sinon bleu info).
  const flag = flagSev ? SEV_TOUR[flagSev] : null;
  const ringColor = flag?.hex ?? ACCENT;
  // Sur la conclusion, la carte n'apparaît qu'après l'entrée des mini-cards.
  const cardVisible = !isLast || finaleReady;
  const narrow = vp.w < 860;
  const veryNarrow = vp.w < 620;
  // Mini-cards verdict (232px) : colonne à gauche de la carte sur grand écran ;
  // rangée au-dessus sur écran moyen ; empilées au-dessus sur mobile étroit.
  const finaleIconsStyle: React.CSSProperties = narrow
    ? veryNarrow
      ? { top: "calc(50% - 250px)", left: "50%", transform: "translateX(-50%)", flexDirection: "column", gap: 12 }
      : { top: "calc(50% - 200px)", left: "50%", transform: "translateX(-50%)", flexDirection: "row", gap: 16 }
    : { top: "50%", left: `calc(50% - ${CARD_W / 2 + GAP}px)`, transform: "translate(-100%, -50%)", flexDirection: "column", gap: 14 };

  const callout = step.callout;

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

      {/* Scan line à l'entrée des pages denses. */}
      {scanNonce > 0 && <ScanLine key={scanNonce} />}

      {/* Curseur fantôme : voyage vers la cible de l'étape courante. */}
      <GhostCursor
        targetSelector={step.target ? `[data-tour="${step.target}"]` : null}
        travelKey={stepIndex}
        onArrived={onCursorArrived}
      />

      {/* Progress de parsing FEC (étape dépôt), dans la dropzone spotlightée. */}
      {parseState === "running" && rect && (
        <FecParsingProgress
          anchorRect={rect}
          facts={TOUR_PARSING_FACTS}
          onDone={() => {
            setParseState("done");
            if (step.effects?.particles) setParticlesOn(true);
          }}
        />
      )}

      {/* Particules de données : dropzone → items de navigation. */}
      {particlesOn && rect && (
        <DataParticles fromRect={rect} tokens={PARTICLE_TOKENS} onDone={() => setParticlesOn(false)} />
      )}

      {/* Callout « artefact connecté » reliée à la cible. */}
      {calloutOn && callout && rect && hasSpot && (
        <DemoCallout
          title={callout.title}
          value={calloutValue ?? callout.value}
          note={callout.note}
          countUp={callout.countUp}
          anchorRect={rect}
          side={CALLOUT_SIDE[step.placement ?? "center"]}
          viewport={vp}
        />
      )}

      {/* Mini-cards « verdict » de la séquence finale — entrent avant la carte. */}
      {isLast && (
        <div
          style={{
            position: "fixed",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
            zIndex: 9996,
            ...finaleIconsStyle,
          }}
        >
          {TOUR_VERDICT_METRICS.map((m, i) => (
            <VerdictMetricCard
              key={m.id}
              icon={m.icon}
              target={m.target}
              label={m.label}
              durationMs={m.durationMs}
              index={i}
              started={isLast && phase === "spot"}
            />
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
          zIndex: 9999,
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
              <>
                <button
                  onClick={quit}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--pb-text-muted, #8a99af)",
                    background: "transparent",
                    border: "1px solid var(--pb-border-strong, #324563)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Explorer librement
                </button>
                <button
                  onClick={importMyFec}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#0a0e14",
                    background: ACCENT,
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                    animation: "pb-fade-in .4s ease both",
                  }}
                >
                  Importer mon FEC →
                </button>
              </>
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

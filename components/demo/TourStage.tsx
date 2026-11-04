"use client";

/**
 * Moteur de la « Visite guidée » — auto-jouée, par-dessus le VRAI produit, dans la charte « instruments ».
 *
 * L'état est porté par l'URL (`?guide=1&etape=n`, toujours sur le dossier démo) : il survit aux navigations et
 * au rechargement, sans store global. Chargé à la demande par `components/probant/GuidedTour.tsx`.
 *
 * Séquence d'une étape :
 *  1. changement de chapitre → intertitre plein écran (≈ 1,6 s) qui couvre la navigation ;
 *  2. route ≠ route courante → navigation ; `prepare` remet la page en état ; `tab` bascule l'onglet ;
 *  3. cible trouvée → défilement, le curseur fantôme voyage, puis le cadre s'ouvre (voile, filet, repères) ;
 *  4. cadre ouvert → action simulée (+300 ms), fiche connectée (+400 ms), effets ; moment « À vous » : la
 *     cible reste cliquable, et sans geste du visiteur le curseur le fait lui-même ;
 *  5. la lecture avance seule ; pause au clic, à Espace, ou quand l'onglet est masqué.
 *
 * Tout ce qui est décoratif est pointer-events:none ; seule la couche de capture (qui laisse passer la cible
 * pendant un moment « À vous »), la carte, la frise et les scènes reçoivent des clics.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { charteFonts } from "@/app/fonts";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { SEVERITY_LABEL, type Severity } from "@/lib/canonical-model/finding";
import {
  TOUR_CHAPTERS,
  TOUR_CHAPTER_CARD_MS,
  TOUR_PARSING_FACTS,
  TOUR_REGISTERS,
  TOUR_STEPS,
  TOUR_THREAD,
  TOUR_VERDICT_METRICS,
  chapterIndexOf,
  firstStepOfChapter,
  type TourPlacement,
} from "@/lib/demo/tour";
import { tourExitHref, tourHref } from "@/lib/demo/tour-entry";
import { DataParticles } from "./DataParticles";
import { DemoCallout } from "./DemoCallout";
import { FecParsingProgress } from "./FecParsingProgress";
import { GhostCursor } from "./GhostCursor";
import { TourFrieze } from "./TourFrieze";
import { ChapterScene, FinaleScene, OpeningScene } from "./TourScenes";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import s from "./tour.module.css";

const PAD = 8;
const GAP = 18;
const CARD_W = 380;
const NARROW = 640;
const MARGIN = 12;
const SEVERITIES: readonly string[] = ["bloquant", "majeur", "mineur", "informatif"];

/** Jetons des particules : comptes PCG, textes et valeurs réelles du dossier démo. */
const PARTICLE_TOKENS = ["411", "512", "FEC", "A.47 A-1", "PCG", "NEP 500", "ISA 320", TOUR_PARSING_FACTS.seuil, `${TOUR_PARSING_FACTS.findings} constats`, TOUR_PARSING_FACTS.fingerprint];

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

type InteractionState = "idle" | "waiting" | "auto" | "user";

/** Premier élément VISIBLE portant l'ancre (le panneau de revue existe en rail et en tiroir). */
function findAnchor(key: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`));
  return all.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

/** Union des rectangles de la cible et de ses ancres associées. */
function unionRect(els: HTMLElement[]): Box | null {
  const rects = els.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

/** Cadre affiché : cible + marge, borné à la zone utile (au-dessus de la frise). */
function frameBox(rect: Box, vw: number, usableH: number): Box {
  const left = Math.max(MARGIN - 4, rect.left - PAD);
  const top = Math.max(MARGIN - 4, rect.top - PAD);
  const right = Math.min(vw - (MARGIN - 4), rect.left + rect.width + PAD);
  const bottom = Math.min(usableH - (MARGIN - 4), rect.top + rect.height + PAD);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function toDomRect(b: Box): DOMRect {
  return new DOMRect(b.left, b.top, b.width, b.height);
}

/** Position de la carte de narration selon le cadre et le placement voulu. */
function cardPosition(frame: Box | null, placement: TourPlacement | undefined, vw: number, usableH: number, cardH: number): React.CSSProperties {
  if (vw < NARROW) {
    return { left: MARGIN, right: MARGIN, bottom: `calc(var(--tour-frieze-h) + ${MARGIN}px)`, maxHeight: "46vh" };
  }
  const width = Math.min(CARD_W, vw - MARGIN * 2);
  const h = Math.min(cardH, usableH - MARGIN * 2);
  const clampL = (l: number) => Math.max(MARGIN, Math.min(l, vw - width - MARGIN));
  const clampT = (t: number) => Math.max(MARGIN, Math.min(t, usableH - h - MARGIN));
  if (!frame || placement === "center" || !placement) {
    return { width, left: clampL((vw - width) / 2), top: clampT((usableH - h) / 2) };
  }
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  const midT = clampT(frame.top + Math.min(frame.height, usableH) / 2 - h / 2);
  const sideRight = right + GAP + width <= vw - MARGIN ? { width, left: right + GAP, top: midT } : null;
  const sideLeft = frame.left - GAP - width >= MARGIN ? { width, left: frame.left - GAP - width, top: midT } : null;
  const below = bottom + GAP + h <= usableH - MARGIN ? { width, left: clampL(frame.left + frame.width / 2 - width / 2), top: bottom + GAP } : null;
  const above = frame.top - GAP - h >= MARGIN ? { width, left: clampL(frame.left + frame.width / 2 - width / 2), top: frame.top - GAP - h } : null;
  // Repli : la carte recouvre le coin bas droit du cadre, la zone la moins porteuse de sens.
  const overlay = { width, left: clampL(right - width - MARGIN), top: clampT(usableH - h - MARGIN) };
  const order: Record<TourPlacement, (React.CSSProperties | null)[]> = {
    right: [sideRight, sideLeft, below, above],
    left: [sideLeft, sideRight, below, above],
    bottom: [below, above, sideRight, sideLeft],
    top: [above, below, sideRight, sideLeft],
    center: [],
  };
  return order[placement].find(Boolean) ?? overlay;
}

export default function TourStage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const reduced = usePrefersReducedMotion();

  const rawStep = Number(sp.get("etape") ?? 0);
  const stepIndex = Number.isFinite(rawStep) ? Math.max(0, Math.min(TOUR_STEPS.length - 1, Math.trunc(rawStep))) : 0;
  const step = TOUR_STEPS[stepIndex];
  const chapterIdx = chapterIndexOf(step);
  const chapter = step.chapter ? TOUR_CHAPTERS[chapterIdx] : null;
  const indexInChapter = step.chapter ? TOUR_STEPS.filter((st, i) => st.chapter === step.chapter && i <= stepIndex).length : 0;
  const chapterSize = step.chapter ? TOUR_STEPS.filter((st) => st.chapter === step.chapter).length : 0;

  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [vp, setVp] = useState({ w: 1280, h: 800, frieze: 64 });
  const [rect, setRect] = useState<Box | null>(null);
  const [found, setFound] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [flag, setFlag] = useState<string | null>(null);
  const [chapterHold, setChapterHold] = useState(false);
  const [chapterLeaving, setChapterLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [calloutOn, setCalloutOn] = useState(false);
  const [calloutValue, setCalloutValue] = useState<string | null>(null);
  const [parseState, setParseState] = useState<"idle" | "running" | "done">("idle");
  const [particlesOn, setParticlesOn] = useState(false);
  const [interaction, setInteraction] = useState<InteractionState>("idle");
  const [autoTravel, setAutoTravel] = useState(false);
  const [askLeft, setAskLeft] = useState<number | null>(null);
  const [cardH, setCardH] = useState(300);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => void (pausedRef.current = paused), [paused]);
  const stepIndexRef = useRef(stepIndex);
  useEffect(() => void (stepIndexRef.current = stepIndex), [stepIndex]);
  const interactionRef = useRef<InteractionState>("idle");
  /** Durée effective de l'étape : raccourcie une fois le geste « À vous » fait. */
  const limitRef = useRef(step.duration);
  const elapsedRef = useRef(0);
  const targetElRef = useRef<HTMLElement | null>(null);
  const prevStepRef = useRef<number | null>(null);

  // — Montage, mesure de l'écran (la frise réduit la zone utile).
  useEffect(() => {
    setMounted(true);
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight, frieze: window.innerWidth < 900 ? 52 : 64 });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const usableH = vp.h - vp.frieze;

  // — Contexte « pendant la démo » pour les règles CSS globales (globals.css).
  useEffect(() => {
    document.body.setAttribute("data-pb-guide", "1");
    return () => document.body.removeAttribute("data-pb-guide");
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const c = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
      setPaused(false);
      router.replace(tourHref(TOUR_STEPS[c].route, c), { scroll: false });
    },
    [router],
  );
  const goToRef = useRef(goTo);
  useEffect(() => void (goToRef.current = goTo), [goTo]);

  const quit = useCallback(() => {
    setPaused(false);
    router.replace(tourExitHref(pathname), { scroll: false });
  }, [router, pathname]);

  const importMyFec = useCallback(() => {
    setPaused(false);
    router.push(tourExitHref("/dashboard/depot"));
  }, [router]);

  // — La route suit l'étape (navigation automatique entre écrans).
  useEffect(() => {
    if (pathname !== step.route) router.replace(tourHref(step.route, stepIndex), { scroll: false });
  }, [pathname, step.route, stepIndex, router]);

  // — Entrée d'étape : remise à zéro, intertitre si le chapitre change.
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = stepIndex;
    setFound(false);
    setArrived(false);
    setRect(null);
    setFlag(null);
    setCalloutOn(false);
    setCalloutValue(null);
    setParseState("idle");
    setParticlesOn(false);
    setInteraction("idle");
    interactionRef.current = "idle";
    setAutoTravel(false);
    setAskLeft(null);
    setProgress(0);
    elapsedRef.current = 0;
    limitRef.current = TOUR_STEPS[stepIndex].duration;
    targetElRef.current = null;

    const cur = TOUR_STEPS[stepIndex];
    const enteringChapter = Boolean(cur.chapter) && (prev === null || TOUR_STEPS[prev]?.chapter !== cur.chapter);
    if (!enteringChapter) {
      setChapterHold(false);
      setChapterLeaving(false);
      return;
    }
    setChapterHold(true);
    setChapterLeaving(false);
    // Mouvement réduit : pas de fondu de sortie, l'intertitre reste lisible puis disparaît d'un coup.
    const hold = reduced ? 1200 : TOUR_CHAPTER_CARD_MS;
    const tLeave = reduced ? 0 : window.setTimeout(() => setChapterLeaving(true), Math.max(0, hold - 240));
    const tEnd = window.setTimeout(() => setChapterHold(false), hold);
    return () => {
      window.clearTimeout(tLeave);
      window.clearTimeout(tEnd);
    };
  }, [stepIndex, reduced]);

  // — Recherche de la cible (après remise en état et bascule d'onglet), puis suivi de sa position.
  useEffect(() => {
    if (step.scene || !step.target || pathname !== step.route) {
      if (!step.scene && !step.target && pathname === step.route) setFound(true);
      return;
    }
    let raf = 0;
    let tries = 0;
    let cancelled = false;
    let tabClicked = false;
    let cleanup: (() => void) | null = null;
    const narrow = window.innerWidth < NARROW;

    const find = () => {
      if (cancelled) return;
      if (step.prepare && (tries === 0 || tries === 30 || tries === 90)) step.prepare();
      if (step.tab && !tabClicked) {
        const tabEl = document.querySelector<HTMLElement>(`[data-tour-tab="${step.tab}"]`);
        if (tabEl) {
          if (tabEl.getAttribute("aria-selected") !== "true") tabEl.click();
          tabClicked = true;
        }
      }
      const el = findAnchor(step.target!);
      if (!el) {
        if (tries++ < 180) raf = requestAnimationFrame(find);
        else setFound(true); // cible introuvable : carte centrée, la visite continue
        return;
      }
      targetElRef.current = el;
      const extras = (step.with ?? []).map(findAnchor).filter((x): x is HTMLElement => Boolean(x));
      const prevMargin = el.style.scrollMarginTop;
      el.style.scrollMarginTop = narrow ? "56px" : "24px";
      el.scrollIntoView({ block: narrow || step.scroll === "start" ? "start" : "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
      const flagValue = el.getAttribute("data-tour-flag");
      setFlag(flagValue && SEVERITIES.includes(flagValue) ? flagValue : null);
      const measure = () => {
        if (cancelled) return;
        const next = unionRect([el, ...extras]);
        setRect((prev) =>
          prev && next && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5
            ? prev
            : next,
        );
      };
      measure();
      const block: ScrollLogicalPosition = narrow || step.scroll === "start" ? "start" : "center";
      const t1 = window.setTimeout(measure, 400);
      // Recadrage : si la page a bougé pendant le défilement (contenu chargé au-dessus, panneau refermé), une
      // cible qui tient dans la zone utile mais en déborde est ramenée, une seule fois.
      const t2 = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const usable = window.innerHeight - (window.innerWidth < 900 ? 52 : 64);
        const fits = r.height <= usable - 16;
        if ((r.top < 0 && (fits || block === "start")) || (fits && r.bottom > usable)) el.scrollIntoView({ block, inline: "nearest", behavior: "auto" });
        measure();
      }, 750);
      const t3 = window.setTimeout(() => {
        measure();
        el.style.scrollMarginTop = prevMargin;
      }, 1000);
      const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
      ro?.observe(el);
      extras.forEach((x) => ro?.observe(x));
      window.addEventListener("scroll", measure, true);
      window.addEventListener("resize", measure);
      cleanup = () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
        ro?.disconnect();
        window.removeEventListener("scroll", measure, true);
        window.removeEventListener("resize", measure);
      };
      setFound(true);
    };
    find();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, [pathname, step, reduced]);

  // — Phase de mise en scène.
  const ready = found && !chapterHold;
  const hasTarget = Boolean(step.target) && rect !== null;
  const phase: "scene" | "seek" | "cursor" | "spot" = step.scene
    ? "scene"
    : !ready
      ? "seek"
      : hasTarget && !arrived && !reduced
        ? "cursor"
        : "spot";

  // Sous mouvement réduit ou sans cible, pas de voyage : le cadre s'ouvre dès que la cible est prête.
  useEffect(() => {
    if (ready && (reduced || !hasTarget)) setArrived(true);
  }, [ready, reduced, hasTarget]);

  const autoTravelRef = useRef(false);
  useEffect(() => void (autoTravelRef.current = autoTravel), [autoTravel]);
  const arriveTimer = useRef(0);
  const onCursorArrived = useCallback(() => {
    const si = stepIndexRef.current;
    if (interactionRef.current === "waiting" && autoTravelRef.current) {
      // Le curseur est sur le bouton : la visite fait le geste à la place du visiteur.
      const s0 = TOUR_STEPS[si];
      const el = s0.interaction?.autoTarget();
      interactionRef.current = "auto";
      setInteraction("auto");
      if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return;
    }
    window.clearTimeout(arriveTimer.current);
    arriveTimer.current = window.setTimeout(() => {
      if (stepIndexRef.current === si) setArrived(true);
    }, 180);
  }, []);
  useEffect(() => () => window.clearTimeout(arriveTimer.current), []);

  // — Cadre ouvert : action simulée, fiche, pulsation, journal du moteur, moment « À vous ».
  useEffect(() => {
    if (phase !== "spot" || step.scene) return;
    const timers: number[] = [];
    let actionCleanup: (() => void) | null = null;
    let pulseEl: Element | null = null;
    let onClick: ((e: MouseEvent) => void) | null = null;
    let tick = 0;

    if (step.simulatedAction) {
      timers.push(
        window.setTimeout(() => {
          const r = step.simulatedAction!();
          if (typeof r === "function") actionCleanup = r;
        }, 300),
      );
    }
    if (step.callout) {
      timers.push(
        window.setTimeout(() => {
          setCalloutValue(step.callout!.resolveValue?.() ?? null);
          setCalloutOn(true);
        }, 400),
      );
    }
    if (step.effects?.pulseTarget) {
      const key = step.effects.pulseTarget;
      timers.push(
        window.setTimeout(() => {
          pulseEl = document.querySelector(`[data-tour="${key}"]`);
          pulseEl?.classList.add("pb-demo-node-pulse");
        }, 600),
      );
      timers.push(window.setTimeout(() => pulseEl?.classList.remove("pb-demo-node-pulse"), 2600));
    }
    if (step.effects?.parsingProgress) setParseState("running");

    const ia = step.interaction;
    if (ia) {
      const markDone = (who: "user" | "auto") => {
        if (interactionRef.current === "user" || interactionRef.current === "auto") return;
        interactionRef.current = who;
        setInteraction(who);
      };
      onClick = (e: MouseEvent) => {
        const t = e.target as Element | null;
        if (interactionRef.current === "waiting" && e.isTrusted && t?.closest?.(ia.accept)) markDone("user");
      };
      document.addEventListener("click", onClick, true);
      timers.push(
        window.setTimeout(() => {
          interactionRef.current = "waiting";
          setInteraction("waiting");
          const deadline = performance.now() + ia.autoAfterMs - 500;
          setAskLeft(Math.ceil((ia.autoAfterMs - 500) / 1000));
          tick = window.setInterval(() => {
            if (pausedRef.current) return;
            setAskLeft(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)));
          }, 250);
        }, 500),
      );
      timers.push(
        window.setTimeout(() => {
          if (interactionRef.current !== "waiting") return;
          setAutoTravel(true); // le curseur part vers le bouton ; il clique à l'arrivée
        }, ia.autoAfterMs),
      );
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (tick) window.clearInterval(tick);
      if (onClick) document.removeEventListener("click", onClick, true);
      actionCleanup?.();
      pulseEl?.classList.remove("pb-demo-node-pulse");
      setCalloutOn(false);
    };
  }, [phase, step]);

  // — Geste fait : la fiche relit la page, l'étape garde juste le temps de voir l'effet.
  useEffect(() => {
    if (interaction !== "user" && interaction !== "auto") return;
    const ia = step.interaction;
    if (!ia) return;
    setAutoTravel(false);
    setAskLeft(null);
    limitRef.current = Math.min(step.duration, elapsedRef.current + ia.holdAfterMs);
    const t = window.setTimeout(() => {
      if (step.callout?.resolveValue) setCalloutValue(step.callout.resolveValue());
    }, 250);
    return () => window.clearTimeout(t);
  }, [interaction, step]);

  // — Lecture : progression de l'étape, passage automatique (sauf la conclusion).
  useEffect(() => {
    if (phase !== "spot" && phase !== "scene") return;
    let raf = 0;
    let last = performance.now();
    let stopped = false;
    const tickFn = (now: number) => {
      if (stopped) return;
      const holding = pausedRef.current || document.hidden || (interactionRef.current === "waiting" && autoTravelRef.current);
      if (!holding) elapsedRef.current += now - last;
      last = now;
      const p = Math.min(1, elapsedRef.current / limitRef.current);
      setProgress(p);
      if (p >= 1) {
        if (stepIndexRef.current < TOUR_STEPS.length - 1) goToRef.current(stepIndexRef.current + 1);
        return;
      }
      raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [phase, stepIndex]);

  // — Raccourcis clavier (hors champs de saisie).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Escape") quit();
      else if (e.key === "ArrowRight") goTo(stepIndex + 1);
      else if (e.key === "ArrowLeft") goTo(stepIndex - 1);
      else if (e.key === "Home") goTo(0);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (/^[1-5]$/.test(e.key)) {
        const c = TOUR_CHAPTERS[Number(e.key) - 1];
        if (c) goTo(firstStepOfChapter(c.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepIndex, goTo, quit]);

  // — Focus : la carte (ou la scène) reçoit le focus à l'ouverture, puis seulement si le focus était déjà dans
  //   la visite (un utilisateur au clavier suit la lecture ; personne d'autre ne se fait voler le focus).
  const focusedOnce = useRef(false);
  useEffect(() => {
    const active = document.activeElement;
    const within = rootRef.current?.contains(active);
    // Un bouton de la frise garde le focus : on enchaîne « Suivant » sans être renvoyé dans la carte.
    if (within && active?.closest("[data-tour-frieze]")) return;
    if (focusedOnce.current && !within) return;
    const el = step.scene ? sceneRef.current : phase === "spot" ? cardRef.current : null;
    if (!el) return;
    el.focus({ preventScroll: true });
    focusedOnce.current = true;
  }, [phase, step.scene, stepIndex]);

  const frame = useMemo(() => (rect ? frameBox(rect, vp.w, usableH) : null), [rect, vp.w, usableH]);
  // Rectangle stable : les effets ancrés (journal, particules, fiche) ne se relancent pas à chaque image.
  const frameRect = useMemo(() => (frame ? toDomRect(frame) : null), [frame]);
  const spot = phase === "spot" && frame !== null && Boolean(step.target);

  const cursorResolve = useMemo(() => {
    if (step.scene || chapterHold) return null;
    if (autoTravel && step.interaction) return step.interaction.autoTarget;
    if (!step.target) return null;
    return () => targetElRef.current ?? findAnchor(step.target!);
  }, [step, chapterHold, autoTravel]);
  const cursorKey = `${stepIndex}${autoTravel ? "-geste" : ""}`;
  // Bouton du moment « À vous » : la fiche connectée ne doit jamais le masquer.
  const interactionRect = useMemo(() => {
    if (!step.interaction || !frame) return null;
    const el = step.interaction.autoTarget();
    return el ? el.getBoundingClientRect() : null;
  }, [step, frame]);

  // — Mesure de la carte (placement de la fiche connectée, hauteur réelle pour les replis).
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) {
      setCardRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setCardH((h) => (Math.abs(h - r.height) > 1 ? r.height : h));
    setCardRect((prev) => (prev && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.height - r.height) < 1 ? prev : r));
  }, [stepIndex, phase, chapterHold, frame, vp.w, vp.h, interaction, cardH]);

  if (!mounted) return null;

  const cardVisible = !step.scene && !chapterHold && (phase === "spot" || (found && !hasTarget));
  const cardCss = cardPosition(spot ? frame : null, step.target ? step.placement : "center", vp.w, usableH, cardH);
  const waitingHole = spot && interaction === "waiting";
  const ia = step.interaction;
  const pct = Math.round(progress * 1000) / 10;

  // Couche de capture : pleine, ou en quatre bandes autour du cadre pendant un moment « À vous ».
  const captures: { key: string; style: React.CSSProperties }[] = waitingHole && frame
    ? [
        { key: "t", style: { left: 0, top: 0, right: 0, height: frame.top } },
        { key: "b", style: { left: 0, top: frame.top + frame.height, right: 0, bottom: 0 } },
        { key: "l", style: { left: 0, top: frame.top, width: frame.left, height: frame.height } },
        { key: "r", style: { left: frame.left + frame.width, top: frame.top, right: 0, height: frame.height } },
      ]
    : [{ key: "all", style: { inset: 0 } }];

  const tagTop = frame ? (frame.top - 30 >= 6 ? frame.top - 30 : frame.top + 8) : 0;
  const tagLeft = frame ? (frame.top - 30 >= 6 ? frame.left : frame.left + 8) : 0;

  return createPortal(
    <div ref={rootRef} data-ambiance="instruments" className={`${charteFonts} ${s.root}`} data-tour-stage={step.id} data-tour-phase={phase}>
      <div aria-live="polite" className={s.srOnly}>
        {`Visite guidée, étape ${stepIndex + 1} sur ${TOUR_STEPS.length} : ${step.title}${paused ? " — en pause" : ""}`}
      </div>

      {captures.map((c) => (
        <div
          key={c.key}
          aria-hidden
          className={s.capture}
          data-veil={!spot && !step.scene ? "" : undefined}
          style={c.style}
          onClick={() => setPaused((p) => !p)}
        />
      ))}

      {spot && frame && (
        <>
          <div aria-hidden className={s.hole} style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }} />
          <div aria-hidden className={s.frame} data-flag={flag ?? undefined} style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
            <span className={s.corner} data-c="tl" />
            <span className={s.corner} data-c="tr" />
            <span className={s.corner} data-c="bl" />
            <span className={s.corner} data-c="br" />
            {!reduced && <span key={stepIndex} className={s.sweep} />}
          </div>
          <div aria-hidden className={s.tag} style={{ left: tagLeft, top: tagTop }}>
            {chapter && (
              <span className={s.tagCode}>
                {chapter.numeral}.{indexInChapter}
              </span>
            )}
            <span>{step.label}</span>
            {flag && (
              <span className={s.tagFlag}>
                <SeverityGlyph severity={flag as Severity} /> Constat {SEVERITY_LABEL[flag as Severity].toLowerCase()}
              </span>
            )}
          </div>
        </>
      )}

      {/* Curseur fantôme : voyage vers la cible, ou vers le bouton d'un moment « À vous ». */}
      <GhostCursor resolve={cursorResolve} travelKey={cursorKey} onArrived={onCursorArrived} />

      {parseState === "running" && spot && frameRect && (
        <FecParsingProgress
          anchorRect={frameRect}
          facts={TOUR_PARSING_FACTS}
          onDone={() => {
            setParseState("done");
            if (step.effects?.particles && !reduced) setParticlesOn(true);
          }}
        />
      )}
      {particlesOn && frameRect && <DataParticles fromRect={frameRect} tokens={PARTICLE_TOKENS} onDone={() => setParticlesOn(false)} />}

      {calloutOn && step.callout && spot && frameRect && (
        <DemoCallout
          title={step.callout.title}
          value={calloutValue ?? step.callout.value}
          note={step.callout.note}
          countUp={step.callout.countUp}
          anchorRect={frameRect}
          avoid={[cardRect, interactionRect]}
          allowInside={vp.w >= NARROW}
          viewport={{ w: vp.w, h: usableH }}
        />
      )}

      {/* Scènes plein écran. */}
      {step.scene === "opening" && <OpeningScene step={step} registers={TOUR_REGISTERS} sceneRef={sceneRef} />}
      {step.scene === "finale" && (
        <FinaleScene
          step={step}
          thread={TOUR_THREAD}
          metrics={TOUR_VERDICT_METRICS}
          started
          sceneRef={sceneRef}
          actions={
            <>
              <button type="button" className={s.cta} onClick={importMyFec}>
                Importer mon FEC →
              </button>
              <button type="button" className={s.ctaGhost} onClick={quit}>
                Explorer librement
              </button>
              <button type="button" className={s.ctaGhost} onClick={() => goTo(0)}>
                Rejouer la visite
              </button>
            </>
          }
        />
      )}
      {chapterHold && chapter && <ChapterScene chapter={chapter} index={chapterIdx} total={TOUR_CHAPTERS.length} leaving={chapterLeaving} />}

      {/* Carte de narration. */}
      {cardVisible && (
        <div
          ref={cardRef}
          key={stepIndex}
          tabIndex={-1}
          role="dialog"
          aria-labelledby="tour-card-title"
          aria-describedby="tour-card-body"
          className={s.card}
          style={cardCss}
        >
          <div className={s.cardHead}>
            <span className={s.kicker}>
              {chapter && (
                <b>
                  {chapter.numeral} · {chapter.title}
                </b>
              )}{" "}
              — {step.kicker}
            </span>
            <span className={s.kicker} aria-label={`Étape ${indexInChapter} sur ${chapterSize} du chapitre`}>
              {indexInChapter}/{chapterSize}
            </span>
          </div>
          <h2 id="tour-card-title" className={s.title}>
            {step.title}
          </h2>
          <p id="tour-card-body" className={s.body}>
            {step.body}
          </p>
          {ia && interaction !== "idle" && (
            <p className={s.ask} data-state={interaction === "waiting" ? "waiting" : "done"} role="status">
              <span className={s.askKey}>{interaction === "waiting" ? "À vous" : interaction === "user" ? "Bien vu" : "Fait"}</span>
              <span>{interaction === "waiting" ? ia.prompt : ia.done}</span>
              {interaction === "waiting" && askLeft !== null && !autoTravel && (
                <span className={s.askTimer} aria-label={`La visite le fera dans ${askLeft} secondes`}>
                  {askLeft} s
                </span>
              )}
            </p>
          )}
          {step.enClair && (
            <p className={s.enClair}>
              <span>En clair</span>
              {step.enClair}
            </p>
          )}
          <div className={s.progress} aria-hidden>
            <div className={s.progressFill} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <TourFrieze
        stepIndex={stepIndex}
        progress={progress}
        paused={paused}
        onPrev={() => goTo(stepIndex - 1)}
        onNext={() => goTo(stepIndex + 1)}
        onToggle={() => setPaused((p) => !p)}
        onReplay={() => goTo(0)}
        onJump={goTo}
        onQuit={quit}
      />
    </div>,
    document.body,
  );
}

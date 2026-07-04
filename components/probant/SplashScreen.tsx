"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Splash screen « marquise de cinéma » — jouée UNE seule fois par session
 * navigateur sur la landing page, par-dessus tout le contenu (zIndex 9999).
 *
 * Vidéo attendue : public/animations/probant-intro.mp4 (rendu Remotion,
 * ~12 s). Tant que le MP4 n'est pas déposé, le onError de la balise <video>
 * bascule sur un placeholder ASCII (même logique de sortie, minuterie fixe
 * à défaut d'événement onEnded).
 *
 * Monté en dynamic import ssr:false depuis app/page.tsx : l'état initial
 * peut donc lire sessionStorage de façon synchrone (pas de mismatch
 * d'hydratation). Sous prefers-reduced-motion, l'intro ne se joue pas.
 */

const SPLASH_KEY = "probant_splash_seen";
const VIDEO_SRC = "/animations/probant-intro.mp4";
/** Sans vidéo (placeholder), pas d'onEnded : sortie automatique après 4 s. */
const FALLBACK_DURATION_MS = 4000;
const EXIT_FADE_MS = 600;
const SKIP_DELAY_MS = 2000;

type Phase = "playing" | "leaving" | "hidden";

function initialPhase(): Phase {
  if (typeof window === "undefined") return "hidden";
  try {
    if (window.sessionStorage.getItem(SPLASH_KEY) !== null) return "hidden";
  } catch {
    // sessionStorage inaccessible : on ne peut pas garantir « une fois par
    // session », on préfère ne jamais afficher plutôt que d'afficher à
    // chaque navigation.
    return "hidden";
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "hidden";
  }
  return "playing";
}

export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [showSkip, setShowSkip] = useState(false);
  const [fallback, setFallback] = useState(false);
  const leavingRef = useRef(false);

  const active = phase !== "hidden";

  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    try {
      window.sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // sessionStorage indisponible : l'intro pourra rejouer, sans casser la page.
    }
    setPhase("leaving");
    window.setTimeout(() => setPhase("hidden"), EXIT_FADE_MS);
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setShowSkip(true), SKIP_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    if (!active || !fallback) return;
    const t = window.setTimeout(leave, FALLBACK_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [active, fallback, leave]);

  if (!active) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e14",
        opacity: phase === "leaving" ? 0 : 1,
        transition: `opacity ${EXIT_FADE_MS}ms ease`,
      }}
    >
      {fallback ? (
        <pre
          style={{
            margin: 0,
            fontFamily: "'Courier New', monospace",
            fontSize: 18,
            lineHeight: 1.5,
            color: "#5b9dff",
            textAlign: "center",
          }}
        >
          {"╔═══════════════════════════╗\n║  * · * · PROBANT · * · *  ║\n╚═══════════════════════════╝"}
        </pre>
      ) : (
        <video
          src={VIDEO_SRC}
          autoPlay
          muted
          playsInline
          onEnded={leave}
          onError={() => setFallback(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}

      {showSkip && (
        <button
          type="button"
          onClick={leave}
          style={{
            position: "absolute",
            right: 22,
            bottom: 18,
            background: "transparent",
            border: "none",
            color: "#5c6b82",
            fontSize: 12,
            cursor: "pointer",
            padding: "6px 10px",
          }}
        >
          Passer
        </button>
      )}
    </div>
  );
}

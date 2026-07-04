"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/components/demo/usePrefersReducedMotion";

/**
 * Overlay de chargement « marquise de cinéma » affiché pendant le traitement
 * réel d'un fichier déposé (FEC / balance / liasse). Entièrement contrôlé par
 * le parent via `isVisible` ; le message de statut est fourni par le parent
 * (DepotView passe l'étape RÉELLE du pipeline en cours, jamais un libellé
 * inventé).
 *
 * Vidéo attendue : public/animations/probant-loading.mp4 (boucle courte ;
 * la version longue de l'intro fonctionne aussi, elle boucle). Tant que le
 * MP4 n'est pas déposé — ou sous prefers-reduced-motion — un placeholder
 * ASCII statique remplace la vidéo, le statut reste visible.
 *
 * zIndex 9998 : sous la visite guidée (9999), au-dessus du reste.
 */

const VIDEO_SRC = "/animations/probant-loading.mp4";
const FADE_IN_MS = 300;
const FADE_OUT_MS = 400;

export interface FecLoadingScreenProps {
  /** Contrôlé par le parent (état de traitement en cours). */
  isVisible: boolean;
  /** Message de statut optionnel, affiché sous la vidéo avec un curseur. */
  statusMessage?: string;
}

export function FecLoadingScreen({ isVisible, statusMessage }: FecLoadingScreenProps) {
  const [mounted, setMounted] = useState(isVisible);
  const [shown, setShown] = useState(false);
  const [fallback, setFallback] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (isVisible) {
      setMounted(true);
      // Frame suivante : l'élément existe à opacity 0, la transition peut jouer.
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), FADE_OUT_MS);
    return () => window.clearTimeout(t);
  }, [isVisible]);

  if (!mounted) return null;

  const showVideo = !fallback && !reducedMotion;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e14",
        opacity: shown ? 1 : 0,
        transition: `opacity ${shown ? FADE_IN_MS : FADE_OUT_MS}ms ease`,
      }}
    >
      {showVideo ? (
        <video
          src={VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setFallback(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
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
      )}

      {statusMessage && (
        <div
          style={{
            position: "absolute",
            bottom: "12%",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            color: "#5b9dff",
          }}
        >
          {statusMessage}
          <span
            style={{
              display: "inline-block",
              marginLeft: 5,
              animation: "pbCaretBlink 1s step-end infinite",
            }}
          >
            ▌
          </span>
        </div>
      )}
    </div>
  );
}

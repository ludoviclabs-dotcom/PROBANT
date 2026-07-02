"use client";

/**
 * Bouton de lancement de la « Visite guidée ». Pose `?guide=1&etape=0` sur la
 * route de la 1ʳᵉ étape ; le moteur <GuidedTour/> (monté dans le layout racine)
 * prend alors la main. Deux habillages : `sidebar` (pérenne dans la nav) et
 * `hero` (page d'accueil).
 */

import { useRouter } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { TOUR_STEPS } from "@/lib/demo/tour";

export function DemoLauncher({ variant = "sidebar" }: { variant?: "sidebar" | "hero" }) {
  const router = useRouter();
  const start = () => router.push(`${TOUR_STEPS[0].route}?guide=1&etape=0`);

  if (variant === "hero") {
    return (
      <button
        onClick={start}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          padding: "13px 22px",
          borderRadius: 12,
          fontSize: 14.5,
          fontWeight: 600,
          color: "#0a0e14",
          background: "#5b9dff",
          border: "1px solid #5b9dff",
          boxShadow: "0 8px 30px rgba(91,157,255,.35)",
          cursor: "pointer",
        }}
      >
        <PlayCircle size={18} /> Lancer la visite guidée
        <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.75 }}>· 95 s</span>
      </button>
    );
  }

  return (
    <button
      onClick={start}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "9px 11px",
        borderRadius: 10,
        fontSize: 12.5,
        fontWeight: 600,
        color: "#5b9dff",
        background: "rgba(91,157,255,0.10)",
        border: "1px solid rgba(91,157,255,0.35)",
        cursor: "pointer",
        transition: "background .15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(91,157,255,0.18)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(91,157,255,0.10)")}
    >
      <PlayCircle size={16} />
      <span style={{ flex: 1, textAlign: "left" }}>Visite guidée</span>
      <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>95 s</span>
    </button>
  );
}

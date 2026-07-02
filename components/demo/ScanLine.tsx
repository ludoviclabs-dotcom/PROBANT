"use client";

/**
 * Scan line de la visite guidée : un trait lumineux descend sur la page à
 * l'entrée des vues denses (risques, cloisons) — « le moteur balaie l'écran ».
 * Monté ~1,5 s par GuidedTour au moment de la navigation, puis démonté.
 * pointer-events:none, aucune incidence sur la mise en page (overlay fixe).
 */
export function ScanLine() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9991,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          background:
            "linear-gradient(90deg, transparent 0%, #818cf8 50%, transparent 100%)",
          boxShadow: "0 0 12px 2px rgba(129, 140, 248, 0.6)",
          animation: "pb-scan 1.4s ease-in forwards",
        }}
      />
    </div>
  );
}

"use client";

/**
 * Scène signature « La chaîne de preuve » : trois plaques de verre en vue
 * éclatée isométrique (FEC & grand-livre → liasse → déclarations), traversées
 * de faisceaux de données. La plaque du haut prend la couleur du statut
 * d'attention du dossier et ne pulse que tant qu'il y a quelque chose à traiter.
 * Ornement informatif : masqué aux lecteurs d'écran, figé si le mouvement est
 * réduit (la position de repos reste isométrique).
 */

import type { CSSProperties } from "react";
import { C, TONE, type Tone } from "./fiscal-style";

const PLATE_BASE: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 210,
  height: 140,
  margin: "-70px 0 0 -105px",
  borderRadius: 6,
};

const rgba = (tone: Tone, alpha: number) => {
  const hex = TONE[tone].replace("#", "");
  const n = Number.parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

function Particle({ color, margin, delay }: { color: string; margin: string; delay: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 2,
        height: 2,
        margin,
        background: color,
        boxShadow: `0 0 8px ${color}`,
        transformOrigin: "center",
        animation: `fxFlow 3.2s linear ${delay} infinite`,
      }}
    />
  );
}

export function TaxProofChainScene({ tone }: { tone: Tone }) {
  const attention = tone === "warning" || tone === "critical";
  const topColor = TONE[tone];
  return (
    <div className="fx-scene" style={{ flex: "1 1 300px", maxWidth: 340, minWidth: 0, animation: "fxRiseIn .5s ease-out .2s both" }}>
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          height: 320,
          overflow: "hidden",
          perspective: 1000,
          perspectiveOrigin: "50% 40%",
        }}
      >
        <div
          className="fx-scene-tilt"
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            animation: "fxTilt 16s ease-in-out infinite",
          }}
        >
          <div
            style={{
              ...PLATE_BASE,
              transform: "translateZ(-70px)",
              border: "1px solid rgba(91,157,255,.35)",
              background: "linear-gradient(135deg, rgba(91,157,255,.16), rgba(91,157,255,.04))",
              boxShadow: "0 0 40px rgba(91,157,255,.12)",
            }}
          />
          <div
            style={{
              ...PLATE_BASE,
              transform: "translateZ(10px)",
              border: "1px solid rgba(167,139,250,.35)",
              background: "linear-gradient(135deg, rgba(167,139,250,.16), rgba(167,139,250,.04))",
              boxShadow: "0 0 40px rgba(167,139,250,.12)",
            }}
          />
          <div
            style={{
              ...PLATE_BASE,
              transform: "translateZ(90px)",
              border: `1px solid ${rgba(tone, 0.45)}`,
              background: `linear-gradient(135deg, ${rgba(tone, 0.18)}, ${rgba(tone, 0.04)})`,
              boxShadow: `0 0 44px ${rgba(tone, 0.14)}`,
              animation: attention ? "fxFadeIn 2.6s ease-in-out infinite alternate" : undefined,
            }}
          />
          <Particle color={C.accent} margin="-30px 0 0 -40px" delay="0s" />
          <Particle color={C.violet} margin="10px 0 0 20px" delay=".8s" />
          <Particle color={C.green} margin="34px 0 0 -12px" delay="1.6s" />
          <Particle color={C.amber} margin="-46px 0 0 48px" delay="2.4s" />
        </div>
      </div>
      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".14em", color: C.faint }}>
          La chaîne de preuve
        </div>
        <LegendRow color={topColor}>Déclarations — 2065, CA3, avis de CFE</LegendRow>
        <LegendRow color={C.violet}>Liasse fiscale 2050-2059 (dont 2058-A)</LegendRow>
        <LegendRow color={C.accent}>FEC &amp; grand-livre</LegendRow>
      </div>
    </div>
  );
}

function LegendRow({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: C.muted }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
      {children}
    </div>
  );
}

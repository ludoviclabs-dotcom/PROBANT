"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { DemoLauncher } from "@/components/probant/DemoLauncher";

/* ─── canvas animation types ──────────────────────────────────────────────── */

interface CanvasNode { x: number; y: number; vx: number; vy: number; r: number }
interface AuroraBlob { x: number; y: number; r: number; hue: number; ph: number }
interface DataStream { x: number; y: number; sp: number; len: number }

function hexRgb(h: string): [number, number, number] {
  const c = h.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function useConstellationCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let raf = 0;
    let t = 0;
    let W = 0, H = 0;
    let ctx: CanvasRenderingContext2D | null = null;
    let nodes: CanvasNode[] = [];
    let blobs: AuroraBlob[] = [];
    let streams: DataStream[] = [];
    const accent = "#5b9dff";
    const intensity = 1;

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function init() {
      resize();
      const N = Math.round((W * H) / 22000) + 14;
      nodes = Array.from({ length: N }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.6 + 0.7,
      }));
      blobs = [
        { x: 0.28, y: 0.32, r: 0.55, hue: 215, ph: 0 },
        { x: 0.72, y: 0.55, r: 0.50, hue: 258, ph: 2 },
        { x: 0.50, y: 0.78, r: 0.45, hue: 198, ph: 4 },
      ];
      const cols = Math.max(10, Math.round(W / 90));
      streams = Array.from({ length: cols }, (_, i) => ({
        x: (i + 0.5) / cols,
        y: Math.random(),
        sp: Math.random() * 0.4 + 0.25,
        len: Math.random() * 0.12 + 0.06,
      }));
    }

    function drawConstellation([ar, ag, ab]: [number, number, number]) {
      if (!ctx) return;
      const link = 150;
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(1 - d / link) * 0.4 * intensity})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${0.7 * intensity})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    function drawAurora([,,,]: [number, number, number]) {
      if (!ctx) return;
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const cx = (b.x + Math.sin(t * 0.18 + b.ph) * 0.07) * W;
        const cy = (b.y + Math.cos(t * 0.15 + b.ph) * 0.07) * H;
        const rad = b.r * Math.max(W, H) * (0.9 + 0.1 * Math.sin(t * 0.3 + b.ph));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `hsla(${b.hue},85%,60%,${0.16 * intensity})`);
        g.addColorStop(0.5, `hsla(${b.hue},85%,60%,${0.05 * intensity})`);
        g.addColorStop(1, `hsla(${b.hue},85%,60%,0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function draw() {
      raf = requestAnimationFrame(draw);
      if (!ctx) return;
      t += 0.016;
      const rgb = hexRgb(accent);
      const [ar, ag, ab] = rgb;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, W, H);
      drawAurora(rgb);
      drawConstellation(rgb);

      // subtle scan line
      const scanY = H * 0.42 + ((t * 30) % (H * 0.58));
      const sg = ctx.createLinearGradient(0, scanY - 60, 0, scanY);
      sg.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
      sg.addColorStop(1, `rgba(${ar},${ag},${ab},0.04)`);
      ctx.fillStyle = sg;
      ctx.fillRect(0, scanY - 60, W, 60);
    }

    init();
    draw();
    const onResize = () => { resize(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [ref]);
}

/* ─── page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useConstellationCanvas(canvasRef);

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "100vh", background: "#0a0e14", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* animated background */}
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 0 }}
      />

      {/* vignette overlay */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 38%, rgba(10,14,20,0) 35%, rgba(10,14,20,0.55) 78%, rgba(10,14,20,0.92) 100%)" }} />

      {/* content */}
      <div style={{ position: "relative", zIndex: 2, maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: "100vh", padding: "64px 24px" }}>

        {/* shield badge */}
        <span style={{ display: "flex", height: 64, width: 64, alignItems: "center", justifyContent: "center", borderRadius: 18, background: "rgba(91,157,255,0.14)", color: "#5b9dff", boxShadow: "0 0 0 1px rgba(91,157,255,0.22) inset, 0 8px 40px rgba(91,157,255,0.18)", animation: "pb-float 6s ease-in-out infinite, pb-fade-in 0.7s ease both" }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>

        <h1 style={{ margin: "26px 0 0", fontSize: 46, lineHeight: 1, fontWeight: 700, letterSpacing: "-0.02em", color: "#e6edf6", animation: "pb-fade-in 0.7s 0.05s ease both" }}>
          PROBANT
        </h1>

        <p style={{ margin: "18px 0 0", maxWidth: 640, fontSize: 15, lineHeight: 1.65, color: "#8a99af", animation: "pb-fade-in 0.7s 0.1s ease both" }}>
          Orchestrateur de conformité analytique des états financiers français.
          Ingestion FEC, détection d'anomalies par cloison, dossier de preuve
          opposable — avec une séparation stricte entre droit dur, méthode
          d'audit et heuristiques internes.
        </p>

        {/* 3-pillar grid */}
        <div className="home-pillars" style={{ animation: "pb-fade-in 0.7s 0.16s ease both" }}>
          <FeatureCard
            icon={
              <>
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="M7 21h10" />
                <path d="M12 3v18" />
                <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
              </>
            }
            color="#f87171"
            title="Socle normatif"
            text="LPF, PCG, ISA, CGI — versionnés et cités."
          />
          <FeatureCard
            icon={
              <>
                <path d="M6 18h8" />
                <path d="M3 22h18" />
                <path d="M14 22a7 7 0 1 0 0-14h-1" />
                <path d="M9 14h2" />
                <path d="M9 12a2 2 0 0 1 2-2V6h-4v4a2 2 0 0 1 2 2Z" />
                <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
              </>
            }
            color="#a78bfa"
            title="Moteur de constat"
            text="Empreinte FEC, rapprochements par cycle, scoring des anomalies."
          />
          <FeatureCard
            icon={
              <>
                <line x1="21" x2="14" y1="4" y2="4" />
                <line x1="10" x2="3" y1="4" y2="4" />
                <line x1="21" x2="12" y1="12" y2="12" />
                <line x1="8" x2="3" y1="12" y2="12" />
                <line x1="21" x2="16" y1="20" y2="20" />
                <line x1="12" x2="3" y1="20" y2="20" />
                <line x1="14" x2="14" y1="2" y2="6" />
                <line x1="8" x2="8" y1="10" y2="14" />
                <line x1="16" x2="16" y1="18" y2="22" />
              </>
            }
            color="#38bdf8"
            title="Restitution par cloison"
            text="Synthèse par gravité, dossier de preuve, validation par l'auditeur."
          />
        </div>

        {/* CTA principal — visite guidée (pour découvrir sans rien connaître à l'audit) */}
        <div style={{ marginTop: 40, display: "flex", justifyContent: "center", animation: "pb-fade-in 0.7s 0.18s ease both" }}>
          <DemoLauncher variant="hero" />
        </div>

        {/* CTA buttons */}
        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14, animation: "pb-fade-in 0.7s 0.22s ease both" }}>
          <Link
            href="/dashboard/synthese"
            style={{ display: "inline-flex", alignItems: "center", gap: 9, borderRadius: 13, background: "#5b9dff", padding: "13px 24px", fontSize: 14, fontWeight: 600, color: "#06122a", textDecoration: "none", boxShadow: "0 8px 30px rgba(91,157,255,0.35)", transition: "transform .2s, box-shadow .2s" }}
          >
            Ouvrir la démo d'analyse FEC
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/normatif"
            style={{ display: "inline-flex", alignItems: "center", gap: 9, borderRadius: 13, border: "1px solid #324563", background: "rgba(17,23,34,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", padding: "13px 24px", fontSize: 14, fontWeight: 600, color: "#e6edf6", textDecoration: "none", transition: "background .2s, border-color .2s" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
              <polyline points="10 2 10 10 13 7 16 10 16 2" />
            </svg>
            Audit Normatif 360
          </Link>
        </div>

        <p style={{ margin: "20px 0 0", fontSize: 11, color: "#5c6b82", animation: "pb-fade-in 0.7s 0.28s ease both" }}>
          Démo : société fictive DEMO SA · Normatif 360 : 35 cycles d'audit (ISA, NEP, IFRS, PCG) — contenu à valider par un expert.
        </p>
      </div>
    </div>
  );
}

/* ─── feature card ──────────────────────────────────────────────────────────── */

function FeatureCard({
  icon,
  color,
  title,
  text,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  text: string;
}) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(36,48,68,0.9)", background: "rgba(17,23,34,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", padding: 18, textAlign: "left" }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
      <h3 style={{ margin: "12px 0 0", fontSize: 14, fontWeight: 600, color: "#e6edf6" }}>{title}</h3>
      <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5, color: "#8a99af" }}>{text}</p>
    </div>
  );
}

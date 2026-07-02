"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { allFindings as getAllFindings } from "@/lib/canonical-model/dossier";
import { CLOISONS } from "@/lib/canonical-model/taxonomy";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import type { Severity, FindingFamily, Finding } from "@/lib/canonical-model/finding";

// ── Design tokens ──────────────────────────────────────────────────────
const ACCENT  = "#5b9dff";
const TEXT    = "#e6edf6";
const MUTED   = "#8a99af";
const FAINT   = "#5c6b82";
const BORDER  = "#1c2430";
const BORDERS = "#324563";
const SURFACE = "#0b0e13";
const SURF2   = "#0f1419";
const SURF3   = "#151c25";
const SEP     = "#1a2029";
const NODE_BG = "#161d2b";

interface SevStyle { label: string; hex: string; bg: string; bd: string; }
const SEV: Record<Severity, SevStyle> = {
  bloquant:   { label: "Bloquant",   hex: "#ef4444", bg: "#2a1416", bd: "rgba(239,68,68,.5)" },
  majeur:     { label: "Majeur",     hex: "#f97316", bg: "#2a1a0e", bd: "rgba(249,115,22,.5)" },
  mineur:     { label: "Mineur",     hex: "#eab308", bg: "#292207", bd: "rgba(234,179,8,.5)" },
  informatif: { label: "Informatif", hex: "#3b82f6", bg: "#11203a", bd: "rgba(59,130,246,.5)" },
};
const SEVK: Severity[] = ["bloquant", "majeur", "mineur", "informatif"];

// Poids de gravité (indice d'exposition + radar)
const WSEV: Record<Severity, number> = { bloquant: 25, majeur: 8, mineur: 2, informatif: 0.5 };

interface FamStyle { label: string; short: string; hex: string; bd: string; bg: string; help: string; }
const FAM: Record<FindingFamily, FamStyle> = {
  hardLaw: {
    label: "Droit dur (opposable)", short: "Obligatoire", hex: "#f87171", bd: "#7f1d1d", bg: "#1c0f10",
    help: "Contrainte réglementaire opposable — LPF, PCG, Code de commerce. Une non-conformité fonde directement un constat.",
  },
  methodology: {
    label: "Présomption d'audit", short: "Présomption", hex: "#a78bfa", bd: "#4c1d95", bg: "#160f24",
    help: "Procédure ou présomption issue des normes d'audit (ISA, ISRE) : signal qui appelle une investigation.",
  },
  internal: {
    label: "Paramètre interne", short: "Interne", hex: "#38bdf8", bd: "#075985", bg: "#0a1a24",
    help: "Heuristique ou seuil propre à PROBANT, non opposable : vigilance analytique à corroborer.",
  },
};
const FAMK: FindingFamily[] = ["hardLaw", "methodology", "internal"];

// ── Helpers ────────────────────────────────────────────────────────────
function pol(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = pol(cx, cy, r, a0);
  const [x1, y1] = pol(cx, cy, r, a1);
  const large = ((((a1 - a0) % 360) + 360) % 360) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M€`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}
function eurFull(n: number): string {
  return `${(n || 0).toLocaleString("fr-FR")} €`;
}
function findingInc(f: Finding): number {
  return f.mesure.unite === "EUR" ? Math.abs(f.mesure.constate - f.mesure.seuil) : 0;
}

interface IdxLevel { label: string; hex: string; bg: string; bd: string; }
function idxLevel(idx: number): IdxLevel {
  if (idx >= 60) return { label: "Exposition élevée",  hex: "#ef4444", bg: "#2a1416", bd: "rgba(239,68,68,.45)" };
  if (idx >= 40) return { label: "Exposition notable", hex: "#f97316", bg: "#2a1a0e", bd: "rgba(249,115,22,.45)" };
  if (idx >= 20) return { label: "Exposition modérée", hex: "#eab308", bg: "#292207", bd: "rgba(234,179,8,.45)" };
  return { label: "Risque maîtrisé", hex: "#22c55e", bg: "#0f2417", bd: "rgba(34,197,94,.45)" };
}

// Tooltip controller shared with charts
interface TipCtl {
  show: (e: ReactMouseEvent, text: string) => void;
  move: (e: ReactMouseEvent) => void;
  hide: () => void;
}

// ── Gauge (demi-cercle + aiguille + ticks + glow) ──────────────────────
function Gauge({ idx, lvl, t }: { idx: number; lvl: IdxLevel; t: number }) {
  const cx = 120, cy = 132, r = 96, sw = 18;
  const v = idx * t;
  const a1 = 180 + 1.8 * Math.max(0.2, v);
  const [nx, ny] = pol(cx, cy, r - 24, a1);
  return (
    <svg viewBox="0 0 240 150" width="100%" style={{ display: "block" }}>
      <defs>
        <filter id="g-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={arc(cx, cy, r, 180, 360)} fill="none" stroke="#1d2738" strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(cx, cy, r, 180, a1)} fill="none" stroke={lvl.hex} strokeWidth={sw} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${lvl.hex}77)`, transition: "stroke .3s" }} />
      {[0, 25, 50, 75, 100].map((tv, i) => {
        const [tx, ty] = pol(cx, cy, r + 15, 180 + 1.8 * tv);
        return (
          <text key={i} x={tx} y={ty} fill={FAINT} fontSize={9} textAnchor="middle" dominantBaseline="middle" fontFamily="monospace">{tv}</text>
        );
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={TEXT} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill={TEXT} />
      <text x={cx} y={cy - 20} fill={lvl.hex} fontSize={46} fontWeight={800} textAnchor="middle" fontFamily="monospace">{Math.round(v)}</text>
      <text x={cx} y={cy - 2} fill={FAINT} fontSize={10.5} textAnchor="middle" fontFamily="monospace">indice / 100</text>
    </svg>
  );
}

// ── Donut gravité ──────────────────────────────────────────────────────
function Donut({ sevCount, total, t, hSev, setHSev, tip, onToggle }: {
  sevCount: Record<Severity, number>; total: number; t: number;
  hSev: Severity | null; setHSev: (s: Severity | null) => void;
  tip: TipCtl; onToggle: (s: Severity) => void;
}) {
  const cx = 90, cy = 90, r = 64, sw = 22, C = 2 * Math.PI * r;
  let cum = 0;
  return (
    <svg viewBox="0 0 180 180" width={170} height={170}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={NODE_BG} strokeWidth={sw} />
      {SEVK.map((k) => {
        const frac = total ? sevCount[k] / total : 0;
        const len = frac * C * t;
        const off = -cum * C * t;
        cum += frac;
        const dim = hSev && hSev !== k;
        const s = SEV[k];
        return (
          <circle
            key={k} cx={cx} cy={cy} r={r} fill="none" stroke={s.hex}
            strokeWidth={hSev === k ? sw + 4 : sw}
            strokeDasharray={`${len} ${C}`} strokeDashoffset={off}
            transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"
            opacity={dim ? 0.28 : 1}
            style={{ cursor: "pointer", transition: "opacity .2s,stroke-width .2s" }}
            onClick={() => onToggle(k)}
            onMouseEnter={(e) => { setHSev(k); tip.show(e, `${s.label} · ${sevCount[k]} constats\n${Math.round(frac * 100)} % du dossier actif`); }}
            onMouseMove={tip.move}
            onMouseLeave={() => { setHSev(null); tip.hide(); }}
          />
        );
      })}
      <text x={cx} y={cy - 4} fill={TEXT} fontSize={34} fontWeight={800} textAnchor="middle" fontFamily="monospace">{Math.round(total * t)}</text>
      <text x={cx} y={cy + 16} fill={MUTED} fontSize={11} textAnchor="middle">constats actifs</text>
    </svg>
  );
}

// ── Radar exposition par cloison ───────────────────────────────────────
function Radar({ axes, cloW, t, hClo, setHClo, tip, onToggle }: {
  axes: { id: CloisonId; short: string; label: string }[];
  cloW: Record<string, number>; t: number;
  hClo: CloisonId | null; setHClo: (c: CloisonId | null) => void;
  tip: TipCtl; onToggle: (c: CloisonId) => void;
}) {
  const cx = 120, cy = 104, R = 66, n = axes.length;
  const max = Math.max(1, ...Object.values(cloW));
  const ring = (f: number) => (
    <polygon key={`r${f}`} fill="none" stroke="#243044" strokeWidth={1}
      points={axes.map((a, i) => { const [x, y] = pol(cx, cy, R * f, -90 + (i * 360) / n); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ")} />
  );
  const dpts = axes.map((a, i) => {
    const v = (cloW[a.id] / max) * t;
    const [x, y] = pol(cx, cy, R * v, -90 + (i * 360) / n);
    return { x, y, a };
  });
  return (
    <svg viewBox="0 0 240 196" width="100%" style={{ maxWidth: 300, overflow: "visible" }}>
      {ring(1)}{ring(0.66)}{ring(0.33)}
      {axes.map((a, i) => { const [x, y] = pol(cx, cy, R, -90 + (i * 360) / n); return <line key={`s${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke="#1d2738" strokeWidth={1} />; })}
      <polygon points={dpts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill={`${ACCENT}33`} stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" style={{ transition: "all .25s" }} />
      {dpts.map((p, i) => (
        <circle key={`d${i}`} cx={p.x} cy={p.y} r={hClo === p.a.id ? 5 : 3.5} fill={ACCENT} stroke="#0a0e14" strokeWidth={1.5}
          style={{ cursor: "pointer" }}
          onClick={() => onToggle(p.a.id)}
          onMouseEnter={(e) => { setHClo(p.a.id); tip.show(e, `${p.a.label}\npoids gravité : ${Math.round(cloW[p.a.id])}`); }}
          onMouseMove={tip.move}
          onMouseLeave={() => { setHClo(null); tip.hide(); }} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pol(cx, cy, R + 13, -90 + (i * 360) / n);
        const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
        const lab = a.id === "journaux" ? "Journ." : a.short;
        return <text key={`l${i}`} x={x} y={y + 3} fill={hClo === a.id ? TEXT : MUTED} fontSize={9.5} fontWeight={600} textAnchor={anchor}>{lab}</text>;
      })}
    </svg>
  );
}

// ── Flow (vrai Sankey à courbes de Bézier) ─────────────────────────────
function Flow({ axes, matrix, t, hLink, setHLink, tip, fClo, fSev, setBoth, toggleClo, toggleSev }: {
  axes: { id: CloisonId; short: string; label: string }[];
  matrix: Record<string, Record<Severity, number>>; t: number;
  hLink: string | null; setHLink: (k: string | null) => void; tip: TipCtl;
  fClo: CloisonId | null; fSev: Severity | null;
  setBoth: (c: CloisonId, s: Severity) => void;
  toggleClo: (c: CloisonId) => void; toggleSev: (s: Severity) => void;
}) {
  const W = 560, H = 252, pad = 14, nodeW = 118;
  const clos = axes;
  const cloTot: Record<string, number> = {};
  const sevTot: Record<string, number> = {};
  let grand = 0;
  clos.forEach((c) => { cloTot[c.id] = SEVK.reduce((s, k) => s + matrix[c.id][k], 0); grand += cloTot[c.id]; });
  SEVK.forEach((k) => { sevTot[k] = clos.reduce((s, c) => s + matrix[c.id][k], 0); });
  grand = Math.max(1, grand);

  const availL = H - 2 * pad - (clos.length - 1) * 8;
  let yL = pad;
  const L: Record<string, { y: number; h: number; cy: number }> = {};
  clos.forEach((c) => { const hh = Math.max(20, (cloTot[c.id] / grand) * availL); L[c.id] = { y: yL, h: hh, cy: yL + hh / 2 }; yL += hh + 8; });

  const availR = H - 2 * pad - (SEVK.length - 1) * 10;
  let yR = pad;
  const Rn: Record<string, { y: number; h: number; cy: number }> = {};
  SEVK.forEach((k) => { const hh = Math.max(18, (sevTot[k] / grand) * availR); Rn[k] = { y: yR, h: hh, cy: yR + hh / 2 }; yR += hh + 10; });

  // Sous ce seuil, une boîte est trop basse pour 2 lignes empilées (libellé + compteur)
  // sans déborder : on bascule alors sur une ligne compacte unique.
  const TWO_LINE_MIN = 30;

  const x1 = pad + nodeW, x2 = W - pad - nodeW;
  const cloCursor: Record<string, number> = {};
  const sevCursor: Record<string, number> = {};
  clos.forEach((c) => { cloCursor[c.id] = L[c.id].cy - (cloTot[c.id] ? Math.min(L[c.id].h, cloTot[c.id] * 4) / 2 : 0); });
  SEVK.forEach((k) => { sevCursor[k] = Rn[k].cy - (sevTot[k] ? Math.min(Rn[k].h, sevTot[k] * 4) / 2 : 0); });

  const links: React.ReactNode[] = [];
  clos.forEach((c) => {
    SEVK.forEach((k) => {
      const cnt = matrix[c.id][k];
      if (!cnt) return;
      const sw = Math.max(2.5, cnt * 3.4);
      const s = SEV[k];
      const ya = cloCursor[c.id] + (cnt * 4) / 2; cloCursor[c.id] += cnt * 4;
      const yb = sevCursor[k] + (cnt * 4) / 2; sevCursor[k] += cnt * 4;
      const key = `${c.id}-${k}`;
      const dim = hLink && hLink !== key;
      const d = `M ${x1} ${ya.toFixed(1)} C ${x1 + 78} ${ya.toFixed(1)}, ${x2 - 78} ${yb.toFixed(1)}, ${x2} ${yb.toFixed(1)}`;
      // Les flux SE DESSINENT de gauche à droite à l'entrée (dashoffset
      // normalisé par pathLength, stagger léger). `data-tour-flow` permet à la
      // visite guidée de simuler le survol du flux « majeur » le plus épais.
      const drawDelay = (links.length * 0.045).toFixed(3);
      links.push(
        <path key={key} d={d} fill="none" stroke={s.hex} strokeWidth={sw} strokeLinecap="round"
          data-tour-flow={key}
          pathLength={1} strokeDasharray={1}
          opacity={(dim ? 0.12 : 0.5) * Math.max(0.15, t)}
          style={{ cursor: "pointer", transition: "opacity .2s", animation: `pbDraw .7s ease ${drawDelay}s both` }}
          onClick={() => setBoth(c.id, k)}
          onMouseEnter={(e) => { setHLink(key); tip.show(e, `${c.label} → ${s.label}\n${cnt} constat${cnt > 1 ? "s" : ""}`); }}
          onMouseMove={tip.move}
          onMouseLeave={() => { setHLink(null); tip.hide(); }} />
      );
    });
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {links}
      {clos.map((c, i) => {
        const compact = L[c.id].h < TWO_LINE_MIN;
        return (
          <g
            key={`ln${c.id}`}
            style={{
              cursor: "pointer",
              // Léger bounce d'entrée des boîtes (spring, origine locale).
              animation: `pbNodeIn .5s cubic-bezier(.34,1.56,.64,1) ${(i * 0.06).toFixed(2)}s both`,
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
            onClick={() => toggleClo(c.id)}
          >
            <rect x={pad} y={L[c.id].y} width={nodeW} height={L[c.id].h} rx={7} fill={NODE_BG} stroke={fClo === c.id ? ACCENT : BORDERS} strokeWidth={1} />
            {compact ? (
              <text x={pad + 11} y={L[c.id].cy + 3.5} fontSize={10} fontWeight={600}>
                <tspan fill={TEXT}>{c.short}</tspan>
                <tspan fill={MUTED} fontSize={9} fontFamily="monospace" dx={5}>· {cloTot[c.id]}</tspan>
              </text>
            ) : (
              <>
                <text x={pad + 11} y={L[c.id].cy - 2} fill={TEXT} fontSize={11} fontWeight={600}>{c.short}</text>
                <text x={pad + 11} y={L[c.id].cy + 12} fill={MUTED} fontSize={9.5} fontFamily="monospace">{cloTot[c.id]} constats</text>
              </>
            )}
          </g>
        );
      })}
      {SEVK.map((k, i) => {
        const s = SEV[k];
        const compact = Rn[k].h < TWO_LINE_MIN;
        return (
          <g
            key={`rn${k}`}
            style={{
              cursor: "pointer",
              animation: `pbNodeIn .5s cubic-bezier(.34,1.56,.64,1) ${(0.18 + i * 0.06).toFixed(2)}s both`,
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
            onClick={() => toggleSev(k)}
          >
            <rect x={x2} y={Rn[k].y} width={nodeW} height={Rn[k].h} rx={7} fill={s.bg} stroke={fSev === k ? s.hex : BORDERS} strokeWidth={1} />
            {compact ? (
              <text x={x2 + nodeW - 10} y={Rn[k].cy + 3.5} textAnchor="end" fontSize={10} fontWeight={700}>
                <tspan fill={MUTED} fontSize={9} fontFamily="monospace">{sevTot[k]} · </tspan>
                <tspan fill={s.hex}>{s.label}</tspan>
              </text>
            ) : (
              <>
                <text x={x2 + nodeW - 10} y={Rn[k].cy - 1} fill={s.hex} fontSize={11} fontWeight={700} textAnchor="end">{s.label}</text>
                <text x={x2 + nodeW - 10} y={Rn[k].cy + 12} fill={MUTED} fontSize={9.5} fontFamily="monospace" textAnchor="end">{sevTot[k]}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
export default function SynthesePage() {
  const d = DEMO_DOSSIER;
  const findings = useMemo(() => getAllFindings(d), [d]);

  // Cloisons effectivement présentes dans les constats
  const axes = useMemo(() => {
    const present = new Set(findings.map((f) => f.cloison));
    return CLOISONS.filter((c) => present.has(c.id)).map((c) => ({ id: c.id, short: c.short, label: c.label }));
  }, [findings]);

  // Filtres + interactions
  const [natFilter, setNatFilter]         = useState<FindingFamily | null>(null);
  const [sevFilter, setSevFilter]         = useState<Severity | null>(null);
  const [cloisonFilter, setCloisonFilter] = useState<CloisonId | null>(null);
  const [query, setQuery]                 = useState("");
  const [sortField, setSortField]         = useState<"sev" | "inc">("sev");
  const [hSev, setHSev]   = useState<Severity | null>(null);
  const [hClo, setHClo]   = useState<CloisonId | null>(null);
  const [hLink, setHLink] = useState<string | null>(null);

  // Tooltip flottant
  const [tipState, setTipState] = useState<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: "" });
  const tip: TipCtl = useMemo(() => ({
    show: (e, text) => setTipState({ show: true, x: e.clientX, y: e.clientY, text }),
    move: (e) => setTipState((p) => (p.show ? { ...p, x: e.clientX, y: e.clientY } : p)),
    hide: () => setTipState((p) => (p.show ? { show: false, x: 0, y: 0, text: "" } : p)),
  }), []);

  // Animation d'entrée : tween t 0→1, cubic ease-out, ~950ms
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const dur = 950;
    const start = performance.now();
    const ease = (p: number) => 1 - Math.pow(1 - p, 3);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setT(ease(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Calcul agrégé ────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const sevCount: Record<Severity, number> = { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 };
    const famCount: Record<FindingFamily, number> = { hardLaw: 0, methodology: 0, internal: 0 };
    const incByClo: Record<string, number> = {};
    const matrix: Record<string, Record<Severity, number>> = {};
    const cloW: Record<string, number> = {};
    axes.forEach((c) => { incByClo[c.id] = 0; cloW[c.id] = 0; matrix[c.id] = { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 }; });
    let totalInc = 0, bloquants = 0, W = 0;
    for (const f of findings) {
      sevCount[f.severity]++;
      famCount[f.family]++;
      W += WSEV[f.severity];
      if (matrix[f.cloison]) {
        matrix[f.cloison][f.severity]++;
        cloW[f.cloison] += WSEV[f.severity];
        const inc = findingInc(f);
        if (inc) { incByClo[f.cloison] += inc; }
      }
      const inc = findingInc(f);
      if (inc) totalInc += inc;
      if (f.severity === "bloquant") bloquants++;
    }
    const idx = Math.round((100 * W) / (W + 52));
    return { sevCount, famCount, incByClo, matrix, cloW, totalInc, bloquants, idx, W, total: findings.length };
  }, [findings, axes]);

  const lvl = idxLevel(calc.idx);
  const reviewPct = 0; // démo : aucun statut persisté

  // Barres incidence triées
  const incBars = useMemo(() => axes
    .map((c) => ({ id: c.id, label: c.label, value: calc.incByClo[c.id] ?? 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value), [axes, calc]);
  const maxInc = Math.max(1, ...incBars.map((x) => x.value));

  // Heatmap intensité
  const maxCell = Math.max(1, ...axes.flatMap((c) => SEVK.map((s) => calc.matrix[c.id][s])));

  // Hub des constats
  const hubFindings = useMemo(() => {
    let list = findings;
    if (natFilter)     list = list.filter((f) => f.family === natFilter);
    if (sevFilter)     list = list.filter((f) => f.severity === sevFilter);
    if (cloisonFilter) list = list.filter((f) => f.cloison === cloisonFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((f) => f.titre.toLowerCase().includes(q) || f.comptesConcernes.some((cc) => cc.toLowerCase().includes(q)) || f.constat.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      sortField === "sev" ? SEVK.indexOf(a.severity) - SEVK.indexOf(b.severity) : findingInc(b) - findingInc(a));
  }, [findings, natFilter, sevFilter, cloisonFilter, query, sortField]);

  const hasFilters = !!(natFilter || sevFilter || cloisonFilter || query);

  // Toggles charts
  const toggleSev = useCallback((s: Severity) => setSevFilter((p) => (p === s ? null : s)), []);
  const toggleClo = useCallback((c: CloisonId) => setCloisonFilter((p) => (p === c ? null : c)), []);
  const setBoth = useCallback((c: CloisonId, s: Severity) => { setCloisonFilter(c); setSevFilter(s); }, []);

  const verdictSub = calc.bloquants > 0
    ? `Le dossier reste exploitable, mais ${calc.bloquants} alerte${calc.bloquants > 1 ? "s" : ""} bloquante${calc.bloquants > 1 ? "s" : ""} doivent être traitées avant de conclure. ${calc.total} constats restent en revue pour ${eur(calc.totalInc)} d'incidence potentielle.`
    : `Aucune alerte bloquante en attente : l'analyse financière est exploitable. ${calc.total} constats demeurent à arbitrer.`;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: SURFACE, padding: "28px 28px 60px" }}>
      <style>{`@keyframes pb-tip-in{from{opacity:0;transform:translate(14px,14px) scale(.96)}to{opacity:1;transform:translate(14px,14px) scale(1)}}
      @keyframes pb-pulse-ring{0%{box-shadow:0 0 0 0 var(--rc)}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}`}</style>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${ACCENT}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Synthèse</h2>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#07271a", border: "1px solid #22c55e40", borderRadius: 999, padding: "3px 10px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#22c55e" }}>cockpit temps réel</span>
          </span>
        </div>
        <p style={{ marginTop: 6, fontSize: 13, color: FAINT, maxWidth: 680 }}>
          Tout le dossier converge ici : ce qui relève d'une <strong style={{ color: "#f87171" }}>non-conformité réglementaire</strong> est distingué de ce qui n'est qu'un signal analytique à investiguer.
        </p>
        <div style={{ marginTop: 4, fontSize: 11, color: FAINT, fontFamily: "monospace" }}>
          {d.silos.length} silos · {axes.length} cloisons · {calc.total} constats
        </div>
      </div>

      {/* ── Verdict Hero ────────────────────────────────────────────── */}
      <section style={{ position: "relative", overflow: "hidden", border: `1px solid ${BORDER}`, borderRadius: 16, background: `linear-gradient(135deg,${SURF2} 0%,${SURFACE} 60%)`, marginBottom: 16 }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(680px 320px at 18% -10%,${lvl.hex}26,transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap" as const, gap: 24, alignItems: "center", padding: "22px 26px" }}>

          {/* Gauge + badge */}
          <div data-tour="synthese-gauge" style={{ flex: "0 0 216px", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 244, minHeight: 150 }}>
              <Gauge idx={calc.idx} lvl={lvl} t={t} />
            </div>
            <div style={{ marginTop: 2, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, border: `1px solid ${lvl.bd}`, background: lvl.bg, padding: "3px 11px", fontSize: 11, fontWeight: 600, color: lvl.hex }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: lvl.hex }} />{lvl.label}
            </div>
          </div>

          {/* Verdict text + metrics */}
          <div style={{ flex: "1 1 340px", minWidth: 300 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".1em", color: FAINT }}>État du dossier</div>
            <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
              {calc.bloquants > 0 ? (
                <>
                  <span style={{ ["--rc" as string]: "rgba(239,68,68,.5)", display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9, border: "1px solid rgba(239,68,68,.45)", background: "#2a1416", padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#ef4444", animation: "pb-pulse-ring 2.4s infinite" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                    {calc.bloquants} alerte{calc.bloquants > 1 ? "s" : ""} bloquante{calc.bloquants > 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 13, color: MUTED }}>à traiter avant de conclure l'analyse.</span>
                </>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9, border: "1px solid rgba(34,197,94,.35)", background: "#07271a", padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#22c55e" }}>Aucune alerte bloquante</span>
              )}
            </div>
            <p style={{ margin: "12px 0 0", maxWidth: 560, fontSize: 13.5, lineHeight: 1.55, color: TEXT }}>{verdictSub}</p>
            <div style={{ marginTop: 16, display: "flex", gap: 26, flexWrap: "wrap" as const }}>
              {([
                { label: "incidence potentielle retenue", value: eur(calc.totalInc * t).replace("NaN", "0") },
                { label: "revue traitée", value: `${reviewPct} %` },
                { label: "constats actifs", value: String(Math.round(calc.total * t)) },
              ] as const).map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 26 }}>
                  {i > 0 && <div style={{ width: 1, background: BORDER }} />}
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, fontFamily: "monospace" }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: FAINT }}>{m.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ flex: "1 1 210px", display: "flex", flexDirection: "column" as const, gap: 9, minWidth: 196 }}>
            <Link href="/dashboard/cloisons" style={{ display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "none", borderRadius: 11, background: ACCENT, color: "#06122a", padding: "12px 16px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
              Ouvrir la revue par cloison
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </Link>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 9, border: `1px solid ${BORDER}`, borderRadius: 11, background: SURF2, color: TEXT, padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 13h6" /><path d="M9 17h3" /></svg>
              Générer la note de synthèse
            </button>
            <button style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px dashed ${MUTED}`, borderRadius: 11, background: "transparent", color: MUTED, padding: "9px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
              Réinitialiser la simulation
            </button>
          </div>
        </div>
      </section>

      {/* ── KPI Strip ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(152px,1fr))", gap: 10, marginBottom: 16 }}>
        {([
          { label: "Bloquants",        value: Math.round(calc.bloquants * t),  color: "#ef4444", sub: "analyse suspendue" },
          { label: "Constats actifs",  value: Math.round(calc.total * t),       color: ACCENT,    sub: `sur ${calc.total} relevés` },
          { label: "Incidence retenue",value: eur(calc.totalInc),               color: "#f97316", sub: "somme des écarts chiffrés" },
          { label: "Silos analysés",   value: d.silos.length,                   color: "#a78bfa", sub: "postes du plan comptable" },
          { label: "Revue traitée",    value: `${reviewPct} %`,                 color: "#22c55e", sub: "validés + écartés" },
        ] as const).map((kpi, i) => (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderTop: `2px solid ${kpi.color}`, borderRadius: 13, padding: "14px 15px", background: SURF2 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color, fontFamily: "monospace" }}>{kpi.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginTop: 2 }}>{kpi.label}</div>
            <div style={{ fontSize: 10, color: FAINT, marginTop: 1 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Nature des règles ────────────────────────────────────────── */}
      <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Nature des règles · poids juridique</div>
            <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Ce qui est opposable vs ce qui appelle une investigation</h3>
          </div>
          <span style={{ fontSize: 11, color: FAINT, flexShrink: 0 }}>cliquer pour filtrer le journal des constats ↓</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          {FAMK.map((nat) => {
            const f = FAM[nat];
            const count = calc.famCount[nat] ?? 0;
            const pct = Math.round((count / Math.max(1, calc.total)) * 100) * t;
            const active = natFilter === nat;
            return (
              <button key={nat} onClick={() => setNatFilter(active ? null : nat)}
                style={{ textAlign: "left" as const, cursor: "pointer", border: `1px solid ${active ? f.hex : f.bd}`, borderRadius: 12, background: active ? `${f.hex}14` : f.bg, padding: "14px", transition: "transform .15s,border-color .15s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: f.hex }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: f.hex, display: "inline-block" }} />{f.label}
                  </span>
                  <span style={{ fontSize: 26, fontWeight: 800, color: f.hex, fontFamily: "monospace" }}>{Math.round(count * t)}</span>
                </div>
                <div style={{ marginTop: 11, height: 7, borderRadius: 5, background: SURF3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 5, background: f.hex, width: `${pct}%`, transition: "width .9s cubic-bezier(.22,1,.36,1)" }} />
                </div>
                <p style={{ margin: "9px 0 0", fontSize: 11, lineHeight: 1.45, color: MUTED }}>{f.help}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Analytique : donut | incidence | radar ──────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(272px,1fr))", gap: 16, marginBottom: 16 }}>
        {/* Donut */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" as const }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Répartition</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Par gravité</h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "6px 0 10px", minHeight: 160 }}>
            <Donut sevCount={calc.sevCount} total={calc.total} t={t} hSev={hSev} setHSev={setHSev} tip={tip} onToggle={toggleSev} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 7 }}>
            {SEVK.map((k) => {
              const s = SEV[k];
              const active = sevFilter === k;
              return (
                <button key={k} onClick={() => toggleSev(k)}
                  onMouseEnter={(e) => { setHSev(k); tip.show(e, `${s.label} · ${calc.sevCount[k]} constats`); }}
                  onMouseMove={tip.move} onMouseLeave={() => { setHSev(null); tip.hide(); }}
                  style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", border: `1px solid ${active ? s.hex : BORDER}`, borderRadius: 9, background: active ? `${s.hex}18` : "transparent", padding: "7px 10px", transition: "all .15s" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.hex, flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: active ? TEXT : MUTED }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.hex, fontFamily: "monospace" }}>{calc.sevCount[k]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Incidence bars */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" as const }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Incidence potentielle estimée</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Écarts chiffrés par cloison</h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: FAINT }}>Somme des écarts en € · indicatif · cliquer pour filtrer</p>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column" as const, gap: 15, flex: 1 }}>
            {incBars.length === 0 ? (
              <p style={{ fontSize: 12, color: FAINT }}>Aucun écart chiffré à incidence directe.</p>
            ) : incBars.map((b) => {
              const active = cloisonFilter === b.id;
              return (
                <button key={b.id} onClick={() => toggleClo(b.id)}
                  onMouseEnter={(e) => tip.show(e, `${b.label}\n${eurFull(b.value)} d'écarts chiffrés`)}
                  onMouseMove={tip.move} onMouseLeave={tip.hide}
                  style={{ textAlign: "left" as const, cursor: "pointer", background: "none", border: "none", padding: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: active ? ACCENT : TEXT }}>{b.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: "monospace" }}>{eur(b.value)}</span>
                  </div>
                  <div style={{ height: 11, borderRadius: 6, background: SURF3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg,${ACCENT},${ACCENT}99)`, width: `${(b.value / maxInc) * 100 * t}%`, transition: "width 1s cubic-bezier(.22,1,.36,1)" }} />
                  </div>
                </button>
              );
            })}
            <div style={{ marginTop: 2, borderTop: `1px solid ${BORDER}`, paddingTop: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: FAINT }}>Total dossier</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: ACCENT, fontFamily: "monospace" }}>{eurFull(calc.totalInc)}</span>
            </div>
          </div>
        </section>

        {/* Radar */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" as const }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Profil de risque</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Exposition par cloison</h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: FAINT }}>Pondérée par gravité des constats</p>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
            <Radar axes={axes} cloW={calc.cloW} t={t} hClo={hClo} setHClo={setHClo} tip={tip} onToggle={toggleClo} />
          </div>
        </section>
      </div>

      {/* ── Matrice + Flux ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 16, marginBottom: 16 }}>
        {/* Heatmap */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Matrice de concentration</div>
          <h3 style={{ margin: "3px 0 14px", fontSize: 14, fontWeight: 600, color: TEXT }}>Gravité × cloison</h3>
          <div style={{ display: "grid", gridTemplateColumns: "96px repeat(4,1fr)", gap: 6, alignItems: "center" }}>
            <div />
            {SEVK.map((k) => (
              <div key={k} style={{ textAlign: "center" as const, fontSize: 10, fontWeight: 600, color: SEV[k].hex }}>
                {k === "bloquant" ? "Bloq." : k === "majeur" ? "Maj." : k === "mineur" ? "Min." : "Info."}
              </div>
            ))}
            {axes.map((c) => (
              <div key={c.id} style={{ display: "contents" }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: MUTED, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{c.short}</div>
                {SEVK.map((k) => {
                  const n = calc.matrix[c.id][k];
                  const s = SEV[k];
                  const inten = n / maxCell;
                  const bg = n ? `color-mix(in srgb, ${s.hex} ${(18 + inten * 70).toFixed(0)}%, transparent)` : SURFACE;
                  return (
                    <button key={k} onClick={() => { if (n) setBoth(c.id, k); }}
                      onMouseEnter={(e) => { if (n) tip.show(e, `${c.label} · ${s.label}\n${n} constat${n > 1 ? "s" : ""}`); }}
                      onMouseMove={tip.move} onMouseLeave={tip.hide}
                      style={{ height: 34, borderRadius: 7, border: `1px solid ${BORDER}`, background: bg, color: n ? "#fff" : "#3a4761", fontSize: 13, fontWeight: 700, cursor: n ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", transition: "transform .15s,box-shadow .15s" }}>
                      {n || "·"}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p style={{ margin: "13px 0 0", fontSize: 10.5, lineHeight: 1.5, color: FAINT }}>
            L'intensité reflète le nombre de constats. Cliquer une cellule pour filtrer le journal.
          </p>
        </section>

        {/* Flow / Sankey */}
        <section data-tour="synthese-sankey" style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Cheminement</div>
              <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Des cloisons vers la gravité</h3>
            </div>
            <div style={{ display: "flex", gap: 13, fontSize: 10, color: FAINT }}>
              <span>cloison</span><span>→</span><span>gravité</span>
            </div>
          </div>
          <div style={{ marginTop: 8, minHeight: 248 }}>
            <Flow axes={axes} matrix={calc.matrix} t={t} hLink={hLink} setHLink={setHLink} tip={tip}
              fClo={cloisonFilter} fSev={sevFilter} setBoth={setBoth} toggleClo={toggleClo} toggleSev={toggleSev} />
          </div>
        </section>
      </div>

      {/* ── Hub des constats ─────────────────────────────────────────── */}
      <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Hub des constats · {hubFindings.length} affiché{hubFindings.length > 1 ? "s" : ""}</div>
              <h3 style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 600, color: TEXT }}>Journal centralisé — toutes catégories</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" as const }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${BORDER}`, borderRadius: 9, background: SURFACE, padding: "7px 10px", minWidth: 200 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (compte, intitulé…)"
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: TEXT, fontSize: 12, fontFamily: "inherit" }} />
              </div>
              <button onClick={() => setSortField((f) => (f === "sev" ? "inc" : "sev"))}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${BORDER}`, borderRadius: 9, background: SURF3, color: MUTED, padding: "7px 11px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="M11 4h10" /><path d="M11 8h7" /><path d="M11 12h4" /></svg>
                Tri : {sortField === "sev" ? "Gravité" : "Incidence"}
              </button>
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: 10, textTransform: "uppercase" as const, letterSpacing: ".06em", color: FAINT }}>Cloison</span>
            {axes.map((c) => {
              const active = cloisonFilter === c.id;
              return (
                <button key={c.id} onClick={() => toggleClo(c.id)}
                  style={{ cursor: "pointer", border: `1px solid ${active ? ACCENT : BORDER}`, borderRadius: 999, background: active ? `${ACCENT}18` : "transparent", color: active ? ACCENT : MUTED, padding: "4px 11px", fontSize: 11.5, fontWeight: 500 }}>
                  {c.short}
                </button>
              );
            })}
            {hasFilters && (
              <button onClick={() => { setNatFilter(null); setSevFilter(null); setCloisonFilter(null); setQuery(""); }}
                style={{ cursor: "pointer", border: `1px dashed ${FAINT}`, borderRadius: 999, background: "transparent", color: FAINT, padding: "4px 10px", fontSize: 11, fontWeight: 500 }}>
                × Réinitialiser
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["Sévérité", "Cloison", "Comptes", "Constat", "Incidence", "Famille"].map((col) => (
                  <th key={col} style={{ padding: "10px 16px", textAlign: "left" as const, fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".06em", color: FAINT, whiteSpace: "nowrap" as const }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hubFindings.slice(0, 50).map((f, i) => {
                const inc = findingInc(f);
                const clLabel = CLOISONS.find((cl) => cl.id === f.cloison)?.label ?? f.cloison;
                const s = SEV[f.severity];
                return (
                  <tr key={f.id ?? i} style={{ borderBottom: `1px solid ${SEP}` }}>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" as const }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${s.hex}18`, border: `1px solid ${s.hex}40`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: s.hex }}>{s.label}</span>
                    </td>
                    <td style={{ padding: "10px 16px", color: MUTED, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{clLabel}</td>
                    <td style={{ padding: "10px 16px", color: MUTED, fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" as const }}>{f.comptesConcernes.slice(0, 2).join(", ") || "—"}</td>
                    <td style={{ padding: "10px 16px", color: TEXT, maxWidth: 260 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.titre}</div>
                    </td>
                    <td style={{ padding: "10px 16px", color: inc > 0 ? "#f97316" : FAINT, fontFamily: "monospace", whiteSpace: "nowrap" as const, fontWeight: inc > 0 ? 600 : 400 }}>{inc > 0 ? eur(inc) : "—"}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: `${FAM[f.family].hex}18`, border: `1px solid ${FAM[f.family].hex}40`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: FAM[f.family].hex }}>
                        {f.family === "hardLaw" ? "Droit dur" : f.family === "methodology" ? "Métho." : "Interne"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {hubFindings.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: "center" as const, color: FAINT }}>Aucun constat ne correspond aux filtres actifs.</td></tr>
              )}
            </tbody>
          </table>
          {hubFindings.length > 50 && (
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${BORDER}`, fontSize: 11, color: FAINT, textAlign: "center" as const }}>
              {hubFindings.length - 50} constat{hubFindings.length - 50 > 1 ? "s" : ""} supplémentaire{hubFindings.length - 50 > 1 ? "s" : ""} — affinez les filtres.
            </div>
          )}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${BORDER}`, borderRadius: 12, background: SURF2, padding: "16px 20px" }}>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
          {calc.bloquants > 0
            ? "Des alertes bloquantes subsistent : à traiter avant de conclure l'analyse financière."
            : "Aucune alerte bloquante. L'analyse financière est exploitable."}
        </p>
        <Link href="/dashboard/cloisons" style={{ flexShrink: 0, borderRadius: 9, background: ACCENT, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#06122a", textDecoration: "none" }}>
          Ouvrir la revue par cloison →
        </Link>
      </div>

      {/* ── Tooltip flottant ─────────────────────────────────────────── */}
      {tipState.show && (
        <div style={{ position: "fixed", left: tipState.x, top: tipState.y, transform: "translate(14px,14px)", zIndex: 60, pointerEvents: "none", border: `1px solid ${BORDERS}`, borderRadius: 9, background: "rgba(13,18,28,.97)", padding: "9px 11px", fontSize: 11.5, lineHeight: 1.5, color: TEXT, whiteSpace: "pre-line" as const, boxShadow: "0 12px 30px -10px #000", maxWidth: 260, animation: "pb-tip-in .12s ease" }}>
          {tipState.text}
        </div>
      )}
    </div>
  );
}

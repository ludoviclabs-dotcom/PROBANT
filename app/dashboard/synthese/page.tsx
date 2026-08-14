"use client";

import { useMemo, useState, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { LEGACY_EXPOSURE_WEIGHTS } from "@/lib/dossier";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { buildSynthesisSnapshot, generateSynthesisNote } from "@/lib/synthesis";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import { CLOISONS } from "@/lib/canonical-model/taxonomy";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import type { Severity, FindingFamily, Finding } from "@/lib/canonical-model/finding";
import { DecisionHeader } from "@/components/synthesis/DecisionHeader";
import { AdmissibilityCard } from "@/components/synthesis/AdmissibilityCard";
import { DataQualityMatrix } from "@/components/synthesis/DataQualityMatrix";
import { CoverageStackedBar } from "@/components/synthesis/CoverageStackedBar";
import { RiskHeatmap } from "@/components/synthesis/RiskHeatmap";
import { ExposureWaterfall } from "@/components/synthesis/ExposureWaterfall";
import { ReviewProgressBar } from "@/components/synthesis/ReviewProgressBar";
import { FindingConcentrationChart } from "@/components/synthesis/FindingConcentrationChart";
import { AccessibleChartTable } from "@/components/synthesis/AccessibleChartTable";
import { NormativePyramid } from "@/components/knowledge/NormativePyramid";
import { StandardsTimeline } from "@/components/knowledge/StandardsTimeline";
import { EvidenceFlow } from "@/components/evidence/EvidenceFlow";
import { EvidenceExportToolbar } from "@/components/evidence/EvidenceExportToolbar";
import { ReviewEventPanel } from "@/components/evidence/ReviewEventPanel";
import { focusStyle } from "@/components/synthesis/tokens";

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
const WSEV: Record<Severity, number> = LEGACY_EXPOSURE_WEIGHTS;

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
/**
 * Montant de l'effet financier EXPLICITE du constat, en euros d'affichage.
 * 0 si le constat ne porte pas de `financialEffect` — l'ancienne présomption
 * |constaté − seuil| n'est plus utilisée nulle part dans cette page.
 */
function findingEffectEuros(f: Finding): number {
  return f.financialEffect ? f.financialEffect.amountCents / 100 : 0;
}

interface IdxLevel { label: string; hex: string; bg: string; bd: string; }
/** Habillage visuel du signal heuristique — le verdict vient du moteur. */
function idxLevel(idx: number): IdxLevel {
  if (idx >= 60) return { label: "Signal heuristique élevé",  hex: "#ef4444", bg: "#2a1416", bd: "rgba(239,68,68,.45)" };
  if (idx >= 40) return { label: "Signal heuristique notable", hex: "#f97316", bg: "#2a1a0e", bd: "rgba(249,115,22,.45)" };
  if (idx >= 20) return { label: "Signal heuristique modéré", hex: "#eab308", bg: "#292207", bd: "rgba(234,179,8,.45)" };
  return { label: "Signal heuristique faible", hex: "#22c55e", bg: "#0f2417", bd: "rgba(34,197,94,.45)" };
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
/**
 * Hiérarchie de lecture en trois niveaux :
 *
 *  1. DÉCISION — verdict du moteur, admissibilité, blocages, couverture,
 *     revue, exposition validée, prochaine action. Ce qui suffit pour agir.
 *  2. ANALYSE — exactement quatre visualisations principales : matrice FEC,
 *     waterfall d'exposition, heatmap cloison × assertion, concentration.
 *  3. EXPLORATION — repliée par défaut : donut, radar, Sankey, journal des
 *     constats, pyramide normative, frise des référentiels, chaîne de preuve.
 *
 * Tous les chiffres viennent du SynthesisSnapshot via les
 * VisualizationDatasets — aucun composant ne recompte les findings. Aucun
 * compteur ne démarre artificiellement à zéro ; aucune animation infinie.
 */
export default function SynthesePage() {
  const snapshot = useActiveDossierSnapshot();
  const d = snapshot.dossier;
  const findings = snapshot.findings;

  // ── Moteur de Synthèse — tout le calcul métier vit dans lib/synthesis ──
  const synthesis = useMemo(
    () => buildSynthesisSnapshot(snapshot, { clock: () => new Date().toISOString() }),
    [snapshot],
  );
  const datasets = useMemo(
    () =>
      buildSynthesisDatasets({
        synthesis,
        societe: d.societe,
        findings,
        admissibilityFindings: snapshot.admissibilityFindings,
      }),
    [synthesis, d.societe, findings, snapshot.admissibilityFindings],
  );

  const downloadNote = useCallback(() => {
    const note = generateSynthesisNote(synthesis, d.societe);
    const blob = new Blob([note], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `note-synthese-${d.societe.siren}-${d.societe.exercice}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [synthesis, d.societe]);

  // ── Projections d'exploration (lecture du snapshot, aucun recomptage) ──
  const axes = useMemo(() => {
    const present = new Set(Object.keys(synthesis.risk.matrix));
    return CLOISONS.filter((c) => present.has(c.id)).map((c) => ({ id: c.id, short: c.short, label: c.label }));
  }, [synthesis]);
  const explo = useMemo(() => {
    const matrix: Record<string, Record<Severity, number>> = {};
    const cloW: Record<string, number> = {};
    for (const c of axes) {
      const row = synthesis.risk.matrix[c.id] ?? { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 };
      matrix[c.id] = row;
      // Pondération visuelle du radar — même barème que l'indice heuristique.
      cloW[c.id] = SEVK.reduce((sum, s) => sum + row[s] * WSEV[s], 0);
    }
    return { matrix, cloW };
  }, [synthesis, axes]);
  const lvl = idxLevel(synthesis.risk.heuristicSeverityIndex);

  // ── État d'interaction (filtres du journal, tooltips, survols) ─────────
  const [natFilter, setNatFilter] = useState<FindingFamily | null>(null);
  const [sevFilter, setSevFilter] = useState<Severity | null>(null);
  const [cloisonFilter, setCloisonFilter] = useState<CloisonId | null>(null);
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<"sev" | "inc">("sev");
  const [hSev, setHSev] = useState<Severity | null>(null);
  const [hClo, setHClo] = useState<CloisonId | null>(null);
  const [hLink, setHLink] = useState<string | null>(null);

  const [tipState, setTipState] = useState<{ show: boolean; x: number; y: number; text: string }>({ show: false, x: 0, y: 0, text: "" });
  const tip: TipCtl = useMemo(() => ({
    show: (e, text) => setTipState({ show: true, x: e.clientX, y: e.clientY, text }),
    move: (e) => setTipState((p) => (p.show ? { ...p, x: e.clientX, y: e.clientY } : p)),
    hide: () => setTipState((p) => (p.show ? { show: false, x: 0, y: 0, text: "" } : p)),
  }), []);

  const toggleSev = useCallback((s: Severity) => setSevFilter((p) => (p === s ? null : s)), []);
  const toggleClo = useCallback((c: CloisonId) => setCloisonFilter((p) => (p === c ? null : c)), []);
  const setBoth = useCallback((c: CloisonId, s: Severity) => { setCloisonFilter(c); setSevFilter(s); }, []);

  const hubFindings = useMemo(() => {
    let list = findings;
    if (natFilter) list = list.filter((f) => f.family === natFilter);
    if (sevFilter) list = list.filter((f) => f.severity === sevFilter);
    if (cloisonFilter) list = list.filter((f) => f.cloison === cloisonFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((f) => f.titre.toLowerCase().includes(q) || f.comptesConcernes.some((cc) => cc.toLowerCase().includes(q)) || f.constat.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      sortField === "sev" ? SEVK.indexOf(a.severity) - SEVK.indexOf(b.severity) : findingEffectEuros(b) - findingEffectEuros(a));
  }, [findings, natFilter, sevFilter, cloisonFilter, query, sortField]);
  const hasFilters = !!(natFilter || sevFilter || cloisonFilter || query);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: SURFACE, padding: "24px clamp(12px, 2.5vw, 28px) 60px" }}>
      <style>{`@keyframes pb-tip-in{from{opacity:0;transform:translate(14px,14px) scale(.96)}to{opacity:1;transform:translate(14px,14px) scale(1)}}
      ${focusStyle}`}</style>

      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${ACCENT}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Synthèse</h1>
          <span style={{ fontSize: 12, color: FAINT }}>
            {d.societe.raisonSociale} · exercice {d.societe.exercice} · {synthesis.risk.totalFindings} constats
          </span>
        </div>
      </header>

      {/* ══ NIVEAU 1 — DÉCISION ═══════════════════════════════════════ */}
      <DecisionHeader decision={datasets.decision} onDownloadNote={downloadNote} />
      <EvidenceExportToolbar synthesis={synthesis} />
      <ReviewEventPanel />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14, marginBottom: 14 }}>
        <CoverageStackedBar dataset={datasets.coverage} />
        <ReviewProgressBar dataset={datasets.review} pct={synthesis.review.pct} />
        <AdmissibilityCard dataset={datasets.admissibility} />
      </div>

      {/* Limites — toujours visibles, jamais repliées */}
      <section
        aria-label="Limites de l'analyse"
        style={{ border: `1px solid ${BORDER}`, borderLeft: "3px solid #eab308", borderRadius: 12, background: SURF2, padding: "13px 16px", marginBottom: 22 }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: "#eab308" }}>
            Limites de l'analyse · {synthesis.limitations.length}
          </span>
          <span style={{ fontSize: 12, color: FAINT }}>
            {synthesis.exposure.findingsWithoutEffect.length} constat{synthesis.exposure.findingsWithoutEffect.length > 1 ? "s" : ""} sans effet chiffré (exclus de l'exposition)
          </span>
        </div>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
          {datasets.limitations.rows.map((row) => (
            <li key={row.id} style={{ fontSize: 12.5, lineHeight: 1.5, color: MUTED }}>{row.cells.message}</li>
          ))}
        </ul>
      </section>

      {/* ══ NIVEAU 2 — ANALYSE (quatre visualisations principales) ════ */}
      <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: "0 0 12px" }}>Analyse</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 22 }}>
        <DataQualityMatrix dataset={datasets.fecQuality} />
        <ExposureWaterfall dataset={datasets.waterfall} />
        <RiskHeatmap dataset={datasets.riskHeatmap} />
        <FindingConcentrationChart dataset={datasets.concentration} />
      </div>

      {/* ══ NIVEAU 3 — EXPLORATION (replié par défaut) ════════════════ */}
      <details style={{ marginBottom: 16 }}>
        <summary
          className="pbz-focusable"
          style={{ cursor: "pointer", fontSize: 15, fontWeight: 700, color: TEXT, padding: "8px 2px", listStyle: "revert" }}
        >
          Exploration — analyses complémentaires
        </summary>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(272px,1fr))", gap: 14, margin: "14px 0" }}>
          {/* Donut par gravité */}
          <section aria-label="Répartition par gravité" style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: FAINT }}>Exploration</div>
            <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Répartition par gravité</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "6px 0 10px", minHeight: 160 }}>
              <Donut sevCount={synthesis.risk.bySeverity} total={synthesis.risk.totalFindings} t={1} hSev={hSev} setHSev={setHSev} tip={tip} onToggle={toggleSev} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {SEVK.map((k) => {
                const s = SEV[k];
                const active = sevFilter === k;
                return (
                  <button key={k} type="button" className="pbz-focusable" onClick={() => toggleSev(k)}
                    aria-pressed={active}
                    aria-label={`${s.label} : ${synthesis.risk.bySeverity[k]} constats — filtrer le journal`}
                    onMouseEnter={(e) => { setHSev(k); tip.show(e, `${s.label} · ${synthesis.risk.bySeverity[k]} constats`); }}
                    onMouseMove={tip.move} onMouseLeave={() => { setHSev(null); tip.hide(); }}
                    style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", border: `1px solid ${active ? s.hex : BORDER}`, borderRadius: 9, background: active ? `${s.hex}18` : "transparent", padding: "7px 10px" }}>
                    <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: s.hex, flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 500, color: active ? TEXT : MUTED }}>{s.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: s.hex, fontFamily: "monospace" }}>{synthesis.risk.bySeverity[k]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Radar par cloison */}
          <section aria-label="Profil de risque par cloison" style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: FAINT }}>Exploration</div>
            <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Radar par cloison</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: FAINT }}>Pondération visuelle par gravité — signal heuristique, pas le verdict</p>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
              <Radar axes={axes} cloW={explo.cloW} t={1} hClo={hClo} setHClo={setHClo} tip={tip} onToggle={toggleClo} />
            </div>
          </section>

          {/* Signal heuristique */}
          <section aria-label="Signal heuristique" style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ alignSelf: "flex-start", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: FAINT }}>Exploration</div>
            <h3 style={{ alignSelf: "flex-start", margin: "3px 0 8px", fontSize: 14, fontWeight: 600, color: TEXT }}>Indice heuristique de gravité</h3>
            <div style={{ width: "100%", maxWidth: 244, minHeight: 150 }}>
              <Gauge idx={synthesis.risk.heuristicSeverityIndex} lvl={lvl} t={1} />
            </div>
            <div style={{ marginTop: 2, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, border: `1px solid ${lvl.bd}`, background: lvl.bg, padding: "3px 11px", fontSize: 12, fontWeight: 600, color: lvl.hex }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: lvl.hex }} />{lvl.label}
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.5, color: FAINT, textAlign: "center" }}>
              100·W/(W+52), poids 25/8/2/0,5 — signal subordonné, jamais le verdict.
            </p>
          </section>
        </div>

        {/* Sankey cloisons → gravité */}
        <section aria-label="Cheminement des cloisons vers la gravité" data-tour="synthese-sankey" style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: FAINT }}>Exploration</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Des cloisons vers la gravité</h3>
          <div style={{ marginTop: 8, minHeight: 248, overflowX: "auto" }}>
            <Flow axes={axes} matrix={explo.matrix} t={1} hLink={hLink} setHLink={setHLink} tip={tip}
              fClo={cloisonFilter} fSev={sevFilter} setBoth={setBoth} toggleClo={toggleClo} toggleSev={toggleSev} />
          </div>
        </section>

        {/* Journal des constats (filtres conservés) */}
        <section aria-label="Journal des constats" style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: FAINT }}>Journal · {hubFindings.length} affiché{hubFindings.length > 1 ? "s" : ""}</div>
                <h3 style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 600, color: TEXT }}>Tous les constats</h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${BORDER}`, borderRadius: 9, background: SURFACE, padding: "7px 10px", minWidth: 200 }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (compte, intitulé…)"
                    aria-label="Rechercher dans le journal des constats"
                    className="pbz-focusable"
                    style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: TEXT, fontSize: 13, fontFamily: "inherit" }} />
                </div>
                <button type="button" className="pbz-focusable" onClick={() => setSortField((f) => (f === "sev" ? "inc" : "sev"))}
                  aria-label={`Changer le tri — actuellement par ${sortField === "sev" ? "gravité" : "effet chiffré"}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${BORDER}`, borderRadius: 9, background: SURF3, color: MUTED, padding: "7px 11px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  Tri : {sortField === "sev" ? "Gravité" : "Effet chiffré"}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: FAINT }}>Cloison</span>
              {axes.map((c) => {
                const active = cloisonFilter === c.id;
                return (
                  <button key={c.id} type="button" className="pbz-focusable" onClick={() => toggleClo(c.id)}
                    aria-pressed={active}
                    style={{ cursor: "pointer", border: `1px solid ${active ? ACCENT : BORDER}`, borderRadius: 999, background: active ? `${ACCENT}18` : "transparent", color: active ? ACCENT : MUTED, padding: "4px 11px", fontSize: 12, fontWeight: 500 }}>
                    {c.short}
                  </button>
                );
              })}
              <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: FAINT, marginLeft: 6 }}>Nature</span>
              {FAMK.map((nat) => {
                const f = FAM[nat];
                const active = natFilter === nat;
                return (
                  <button key={nat} type="button" className="pbz-focusable" onClick={() => setNatFilter(active ? null : nat)}
                    aria-pressed={active}
                    style={{ cursor: "pointer", border: `1px solid ${active ? f.hex : BORDER}`, borderRadius: 999, background: active ? `${f.hex}18` : "transparent", color: active ? f.hex : MUTED, padding: "4px 11px", fontSize: 12, fontWeight: 500 }}>
                    {f.short}
                  </button>
                );
              })}
              {hasFilters && (
                <button type="button" className="pbz-focusable" onClick={() => { setNatFilter(null); setSevFilter(null); setCloisonFilter(null); setQuery(""); }}
                  style={{ cursor: "pointer", border: `1px dashed ${FAINT}`, borderRadius: 999, background: "transparent", color: FAINT, padding: "4px 10px", fontSize: 12, fontWeight: 500 }}>
                  × Réinitialiser
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }} aria-label="Journal des constats">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {["Sévérité", "Cloison", "Comptes", "Constat", "Effet chiffré", "Famille"].map((col) => (
                    <th key={col} scope="col" style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: FAINT, whiteSpace: "nowrap" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hubFindings.slice(0, 50).map((f, i) => {
                  const inc = findingEffectEuros(f);
                  const clLabel = CLOISONS.find((cl) => cl.id === f.cloison)?.label ?? f.cloison;
                  const s = SEV[f.severity];
                  return (
                    <tr key={f.id ?? i} style={{ borderBottom: `1px solid ${SEP}` }}>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${s.hex}18`, border: `1px solid ${s.hex}40`, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600, color: s.hex }}>{s.label}</span>
                      </td>
                      <td style={{ padding: "10px 16px", color: MUTED, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clLabel}</td>
                      <td style={{ padding: "10px 16px", color: MUTED, fontFamily: "monospace", fontSize: 12, whiteSpace: "nowrap" }}>{f.comptesConcernes.slice(0, 2).join(", ") || "—"}</td>
                      <td style={{ padding: "10px 16px", color: TEXT, maxWidth: 260 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.titre}</div>
                      </td>
                      <td style={{ padding: "10px 16px", color: inc > 0 ? "#f97316" : FAINT, fontFamily: "monospace", whiteSpace: "nowrap", fontWeight: inc > 0 ? 600 : 400 }}>{inc > 0 ? eur(inc) : "—"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ background: `${FAM[f.family].hex}18`, border: `1px solid ${FAM[f.family].hex}40`, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600, color: FAM[f.family].hex }}>
                          {f.family === "hardLaw" ? "Droit dur" : f.family === "methodology" ? "Métho." : "Interne"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {hubFindings.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: FAINT, fontSize: 13 }}>Aucun constat ne correspond aux filtres actifs.</td></tr>
                )}
              </tbody>
            </table>
            {hubFindings.length > 50 && (
              <div style={{ padding: "12px 16px", borderTop: `1px solid ${BORDER}`, fontSize: 12, color: FAINT, textAlign: "center" }}>
                {hubFindings.length - 50} constat{hubFindings.length - 50 > 1 ? "s" : ""} supplémentaire{hubFindings.length - 50 > 1 ? "s" : ""} — affinez les filtres.
              </div>
            )}
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
          <NormativePyramid dataset={datasets.normativePyramid} />
          <StandardsTimeline dataset={datasets.standardsTimeline} />
        </div>
        <div style={{ marginTop: 14 }}>
          <EvidenceFlow dataset={datasets.evidenceFlow} />
        </div>
        <div style={{ marginTop: 14 }}>
          <AccessibleChartTable dataset={datasets.limitations} defaultOpen={false} />
        </div>
      </details>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", border: `1px solid ${BORDER}`, borderRadius: 12, background: SURF2, padding: "16px 20px" }}>
        <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
          <strong style={{ color: TEXT }}>{synthesis.verdict.headline}.</strong> {synthesis.verdict.detail}
        </p>
        <Link href="/dashboard/cloisons" className="pbz-focusable" style={{ flexShrink: 0, borderRadius: 9, background: ACCENT, padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "#06122a", textDecoration: "none" }}>
          Ouvrir la revue par cloison →
        </Link>
      </div>

      {/* ── Tooltip flottant ─────────────────────────────────────────── */}
      {tipState.show && (
        <div role="status" style={{ position: "fixed", left: tipState.x, top: tipState.y, transform: "translate(14px,14px)", zIndex: 60, pointerEvents: "none", border: `1px solid ${BORDERS}`, borderRadius: 9, background: "rgba(13,18,28,.97)", padding: "9px 11px", fontSize: 12, lineHeight: 1.5, color: TEXT, whiteSpace: "pre-line", boxShadow: "0 12px 30px -10px #000", maxWidth: 260, animation: "pb-tip-in .12s ease" }}>
          {tipState.text}
        </div>
      )}
    </div>
  );
}

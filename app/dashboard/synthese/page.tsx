"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import {
  computeCounts,
  allFindings as getAllFindings,
} from "@/lib/canonical-model/dossier";
import { CLOISONS, siloById } from "@/lib/canonical-model/taxonomy";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import type { Severity, FindingFamily, Finding } from "@/lib/canonical-model/finding";

// ── Design tokens ──────────────────────────────────────────────────────
const ACCENT  = "#5b9dff";
const TEXT    = "#e8edf4";
const MUTED   = "#7b8798";
const FAINT   = "#56616f";
const BORDER  = "#1c2430";
const SURFACE = "#0b0e13";
const SURF2   = "#0f1419";
const SURF3   = "#151c25";
const SEP     = "#1a2029";

const SEV_HEX: Record<Severity, string> = {
  bloquant:   "#ef4444",
  majeur:     "#f97316",
  mineur:     "#eab308",
  informatif: "#3b82f6",
};
const SEV_LABEL: Record<Severity, string> = {
  bloquant:   "Bloquant",
  majeur:     "Majeur",
  mineur:     "Mineur",
  informatif: "Informatif",
};
const SEV_ORDER: Severity[] = ["bloquant", "majeur", "mineur", "informatif"];

const NAT_HEX: Record<FindingFamily, string> = {
  hardLaw:     "#ef4444",
  methodology: "#a78bfa",
  internal:    "#38bdf8",
};
const NAT_LABEL: Record<FindingFamily, string> = {
  hardLaw:     "Droit dur",
  methodology: "Présomptions d'audit",
  internal:    "Paramètres internes",
};

function formatEur(v: number): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M€`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)} k€`;
  return `${Math.round(v)} €`;
}

function findingInc(f: Finding): number {
  return f.mesure.unite === "EUR"
    ? Math.abs(f.mesure.constate - f.mesure.seuil)
    : 0;
}

// ── Sub-components ─────────────────────────────────────────────────────

function GaugeSVG({ score, hex }: { score: number; hex: string }) {
  const cx = 120, cy = 108, r = 82;
  const circ = Math.PI * r;
  const filled = (score / 100) * circ;
  const path = `M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}`;

  // angle on semicircle: score=0 → left (π), score=100 → right (0)
  const sAngle = (s: number) => Math.PI * (1 - s / 100);
  const needleA = sAngle(score);
  const needleR = r - 10;
  const nx = cx + needleR * Math.cos(needleA);
  const ny = cy - needleR * Math.sin(needleA);  // subtract: SVG y goes down

  const TICKS = [0, 25, 50, 75, 100];

  return (
    <svg viewBox="0 0 240 122" width={236} height={122}>
      <defs>
        <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Track */}
      <path d={path} fill="none" stroke={SURF3} strokeWidth={12} strokeLinecap="round" />
      {/* Fill */}
      <path d={path} fill="none" stroke={hex} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`} filter="url(#gauge-glow)" />
      {/* Tick marks + labels */}
      {TICKS.map(t => {
        const a  = sAngle(t);
        const ca = Math.cos(a), sa = Math.sin(a);
        const x0 = cx + (r - 4) * ca, y0 = cy - (r - 4) * sa;
        const x1 = cx + (r + 4) * ca, y1 = cy - (r + 4) * sa;
        const lx = cx + (r + 16) * ca, ly = cy - (r + 16) * sa;
        return (
          <g key={t}>
            <line x1={x0.toFixed(1)} y1={y0.toFixed(1)} x2={x1.toFixed(1)} y2={y1.toFixed(1)} stroke={BORDER} strokeWidth={1.5} />
            <text x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor="middle" dominantBaseline="middle"
              fontSize={7.5} fill={FAINT} fontFamily="inherit">{t}</text>
          </g>
        );
      })}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx.toFixed(1)} y2={ny.toFixed(1)}
        stroke="#c8d4e8" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="#c8d4e8" />
      {/* Score + label */}
      <text x={cx} y={cy - 20} textAnchor="middle" fontSize={34} fontWeight={700} fill={TEXT} fontFamily="inherit">{score}</text>
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize={8} fontWeight={500} fill={FAINT} fontFamily="inherit" letterSpacing={1}>indice</text>
    </svg>
  );
}

function DonutSVG({ data }: { data: Array<{ value: number; color: string }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return (
    <div style={{ color: FAINT, fontSize: 12, textAlign: "center" as const }}>Aucune donnée</div>
  );
  const r = 50, cx = 70, cy = 70, sw = 16;
  const C = 2 * Math.PI * r;
  let running = 0;
  const segs = data
    .filter(d => d.value > 0)
    .map(d => {
      const dash = (d.value / total) * C;
      const seg = { ...d, dash, offset: running };
      running += dash;
      return seg;
    });
  return (
    <svg viewBox="0 0 140 140" width={140} height={140}>
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={SURF3} strokeWidth={sw} />
        {segs.map((seg, i) => (
          <circle
            key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth={sw}
            strokeDasharray={`${seg.dash} ${C - seg.dash}`}
            strokeDashoffset={-seg.offset}
          />
        ))}
      </g>
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={22} fontWeight={700} fill={TEXT} fontFamily="inherit">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill={FAINT} fontFamily="inherit">constats</text>
    </svg>
  );
}

function RadarSVG({ data }: { data: Array<{ label: string; short: string; value: number }> }) {
  const N = data.length;
  const cx = 120, cy = 115, R = 80;
  const angle = (i: number) => (Math.PI * 2 * i / N) - Math.PI / 2;
  const pt = (i: number, r: number): [number, number] => [
    cx + r * Math.cos(angle(i)),
    cy + r * Math.sin(angle(i)),
  ];
  const rings = [0.33, 0.66, 1.0];
  const shapePoints = data.map((d, i) => pt(i, R * Math.max(0.06, d.value)));
  const polyStr = shapePoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 240 230" style={{ width: "100%", maxWidth: 240 }}>
      {rings.map((s, ri) => {
        const pts = data.map((_, i) => pt(i, R * s));
        return (
          <polygon
            key={ri}
            points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
            fill="none" stroke={ri === 2 ? BORDER : SEP} strokeWidth={1}
          />
        );
      })}
      {data.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke={SEP} strokeWidth={1} />;
      })}
      <polygon points={polyStr} fill={`${ACCENT}22`} stroke={ACCENT} strokeWidth={1.5} />
      {shapePoints.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3} fill={ACCENT} />
      ))}
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 20);
        return (
          <text
            key={i}
            x={x.toFixed(1)} y={y.toFixed(1)}
            textAnchor={x < cx - 5 ? "end" : x > cx + 5 ? "start" : "middle"}
            dominantBaseline="middle"
            fontSize={9} fill={MUTED} fontFamily="inherit" fontWeight={600}
          >
            {d.short}
          </text>
        );
      })}
    </svg>
  );
}

function SankeyViz({ byCloison }: { byCloison: Array<{ id: CloisonId; label: string; bySev: Record<Severity, number>; total: number }> }) {
  const maxTotal = Math.max(1, ...byCloison.map(r => r.total));
  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column" as const, gap: 10 }}>
      {byCloison.filter(r => r.total > 0).map(row => (
        <div key={row.id}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>
              {row.label.includes("–") ? row.label.split("–")[1].trim() : row.label}
            </span>
            <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: "tabular-nums" }}>{row.total}</span>
          </div>
          <div style={{ height: 20, borderRadius: 5, overflow: "hidden", display: "flex" }}>
            {SEV_ORDER.map(sev => {
              const n = row.bySev[sev];
              return n > 0 ? (
                <div
                  key={sev} title={`${SEV_LABEL[sev]}: ${n}`}
                  style={{ flex: n, background: SEV_HEX[sev], opacity: 0.85 }}
                />
              ) : null;
            })}
            <div style={{ flex: maxTotal - row.total, background: SURF3 }} />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" as const }}>
        {SEV_ORDER.map(sev => (
          <div key={sev} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: SEV_HEX[sev], display: "inline-block" }} />
            <span style={{ fontSize: 10, color: FAINT }}>{SEV_LABEL[sev]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function SynthesePage() {
  const d = DEMO_DOSSIER;
  const c = computeCounts(d);

  const [natFilter, setNatFilter]       = useState<FindingFamily | null>(null);
  const [sevFilter, setSevFilter]       = useState<Severity | null>(null);
  const [cloisonFilter, setCloisonFilter] = useState<CloisonId | null>(null);
  const [query, setQuery]               = useState("");
  const [sortField, setSortField]       = useState<"sev" | "inc">("sev");

  // ── Derived scalars ──────────────────────────────────────────────────
  const maxPossible = c.totalFindings * 40;
  const rawScore =
    (c.parSeverite.bloquant    ?? 0) * 40 +
    (c.parSeverite.majeur      ?? 0) * 20 +
    (c.parSeverite.mineur      ?? 0) * 10 +
    (c.parSeverite.informatif  ?? 0) * 5;
  const score      = maxPossible > 0 ? Math.round((rawScore / maxPossible) * 100) : 0;
  const vHex       = score >= 75 ? "#ef4444" : score >= 50 ? "#f97316" : score >= 25 ? "#eab308" : "#22c55e";
  const vLabel     = score >= 75 ? "Critique" : score >= 50 ? "Élevé" : score >= 25 ? "Modéré" : "Faible";

  const totalInc   = Object.values(c.incidenceParCloison).reduce((s, v) => s + (v ?? 0), 0);
  const reviewed   = (c.parStatut.valide ?? 0) + (c.parStatut.ecarte ?? 0);
  const reviewPct  = c.totalFindings > 0 ? Math.round(reviewed / c.totalFindings * 100) : 0;

  // ── Incidence bars ───────────────────────────────────────────────────
  const incBars = CLOISONS
    .map(cl => ({ id: cl.id, label: cl.label, value: c.incidenceParCloison[cl.id] ?? 0 }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const maxInc = Math.max(1, ...incBars.map(x => x.value));

  // ── Heatmap ──────────────────────────────────────────────────────────
  const { heatmap, heatMaxN } = useMemo(() => {
    const map: Partial<Record<CloisonId, Record<Severity, number>>> = {};
    for (const f of getAllFindings(d)) {
      const cl = f.cloison;
      if (!map[cl]) map[cl] = { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 };
      (map[cl] as Record<Severity, number>)[f.severity]++;
    }
    const rows = CLOISONS
      .filter(cl => map[cl.id])
      .map(cl => ({
        id: cl.id,
        label: cl.label,
        short: cl.label.includes("–") ? cl.label.split("–")[1].trim() : cl.label.split(" ")[0],
        cells: map[cl.id] as Record<Severity, number>,
      }));
    const maxN = Math.max(1, ...rows.flatMap(r => Object.values(r.cells)));
    return { heatmap: rows, heatMaxN: maxN };
  }, [d]);

  // ── Radar ────────────────────────────────────────────────────────────
  const radarData = useMemo(() => CLOISONS.map(cl => {
    const findings = d.silos
      .filter(s => siloById(s.siloId)?.cloison === cl.id)
      .flatMap(s => s.findings);
    const expo = findings.reduce((n, f) =>
      n + (f.severity === "bloquant" ? 4 : f.severity === "majeur" ? 2 : f.severity === "mineur" ? 1 : 0.5), 0);
    const label = cl.label;
    const short = label.includes("–") ? label.split("–")[1].trim() : label.split(" ")[0];
    return { label, short, value: Math.min(1, expo / 20) };
  }), [d]);

  // ── Sankey source data ───────────────────────────────────────────────
  const byCloison = useMemo(() => CLOISONS.map(cl => {
    const findings = getAllFindings(d).filter(f => f.cloison === cl.id);
    const bySev: Record<Severity, number> = { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 };
    for (const f of findings) bySev[f.severity]++;
    return { id: cl.id, label: cl.label, bySev, total: findings.length };
  }), [d]);

  // ── Hub ──────────────────────────────────────────────────────────────
  const hubFindings = useMemo(() => {
    let list = getAllFindings(d);
    if (natFilter)     list = list.filter(f => f.family   === natFilter);
    if (sevFilter)     list = list.filter(f => f.severity === sevFilter);
    if (cloisonFilter) list = list.filter(f => f.cloison  === cloisonFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(f =>
        f.titre.toLowerCase().includes(q) ||
        f.comptesConcernes.some(c => c.toLowerCase().includes(q)) ||
        f.constat.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) =>
      sortField === "sev"
        ? SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)
        : findingInc(b) - findingInc(a)
    );
  }, [d, natFilter, sevFilter, cloisonFilter, query, sortField]);

  const hasFilters = !!(natFilter || sevFilter || cloisonFilter || query);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: SURFACE, padding: "28px 28px 60px" }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${ACCENT}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0 }}>Synthèse</h2>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#07271a", border: "1px solid #22c55e40", borderRadius: 999, padding: "3px 10px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "#22c55e" }}>cockpit temps réel</span>
          </span>
        </div>
        <p style={{ marginTop: 6, fontSize: 13, color: FAINT, maxWidth: 680 }}>
          Tout le dossier converge ici : ce qui relève d'une{" "}
          <strong style={{ color: "#f87171" }}>non-conformité réglementaire</strong>{" "}
          est distingué de ce qui n'est qu'un signal analytique à investiguer.
        </p>
        <div style={{ marginTop: 4, fontSize: 11, color: FAINT, fontVariantNumeric: "tabular-nums" }}>
          {d.silos.length} silos · {CLOISONS.length} cloisons · {c.totalFindings} constats
        </div>
      </div>

      {/* ── Verdict Hero ────────────────────────────────────────────── */}
      <section style={{
        position: "relative", overflow: "hidden",
        border: `1px solid ${BORDER}`, borderRadius: 16,
        background: `linear-gradient(135deg,${SURF2} 0%,${SURFACE} 60%)`,
        marginBottom: 16,
      }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(680px 320px at 18% -10%,${vHex}26,transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", padding: "22px 26px", display: "flex", flexWrap: "wrap" as const, gap: 24, alignItems: "center" }}>

          {/* ── Gauge + badge ── */}
          <div style={{ flex: "0 0 216px", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
            <GaugeSVG score={score} hex={vHex} />
            <span style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, border: `1px solid ${vHex}50`, background: `${vHex}18`, padding: "3px 11px", fontSize: 11, fontWeight: 600, color: vHex }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: vHex }} />
              Exposition {vLabel.toLowerCase()}
            </span>
          </div>

          {/* ── Verdict text + metrics ── */}
          <div style={{ flex: "1 1 340px", minWidth: 280 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".1em", color: FAINT }}>État du dossier</div>
            <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
              {c.bloquantesAdmissibilite > 0 ? (
                <>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9, border: "1px solid rgba(239,68,68,.45)", background: "#2a1416", padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#ef4444" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
                    {c.bloquantesAdmissibilite} alerte{c.bloquantesAdmissibilite > 1 ? "s" : ""} bloquante{c.bloquantesAdmissibilite > 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 13, color: MUTED }}>à traiter avant de conclure l'analyse.</span>
                </>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9, border: "1px solid rgba(34,197,94,.35)", background: "#07271a", padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
                  Aucune alerte bloquante
                </span>
              )}
            </div>
            <p style={{ margin: "12px 0 0", maxWidth: 520, fontSize: 13.5, lineHeight: 1.55, color: TEXT }}>
              {c.bloquantesAdmissibilite > 0
                ? `Le dossier reste exploitable, mais ${c.bloquantesAdmissibilite} alerte${c.bloquantesAdmissibilite > 1 ? "s" : ""} bloquante${c.bloquantesAdmissibilite > 1 ? "s" : ""} doivent être traitées avant de conclure. ${c.totalFindings} constats restent en revue pour ${formatEur(totalInc)} d'incidence potentielle.`
                : score >= 50
                ? `${formatEur(totalInc)} d'incidence potentielle ont été identifiés sur ${c.totalFindings} constats. La revue par cloison est recommandée en priorité.`
                : `${c.totalFindings} constats ont été relevés sans alerte bloquante. La revue peut être conduite normalement.`}
            </p>
            {/* 3 metrics */}
            <div style={{ marginTop: 16, display: "flex", gap: 26, flexWrap: "wrap" as const }}>
              {([
                { label: "incidence potentielle retenue", value: formatEur(totalInc) },
                { label: "revue traitée",                  value: `${reviewPct} %` },
                { label: "constats actifs",               value: String(c.totalFindings) },
              ] as const).map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 26 }}>
                  {i > 0 && <div style={{ width: 1, background: BORDER }} />}
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: FAINT }}>{m.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div style={{ flex: "1 1 210px", display: "flex", flexDirection: "column" as const, gap: 9, minWidth: 196 }}>
            <Link
              href="/dashboard/cloisons"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "none", borderRadius: 11, background: ACCENT, color: "#06122a", padding: "12px 16px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            >
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
          { label: "Bloquants",        value: c.parSeverite.bloquant,   color: "#ef4444", sub: "Admissibilité" },
          { label: "Constats actifs",  value: c.totalFindings,           color: ACCENT,    sub: "Total dossier" },
          { label: "Incidence retenue",value: formatEur(totalInc),       color: "#f97316", sub: "Indicatif €" },
          { label: "Silos analysés",   value: d.silos.length,            color: "#a78bfa", sub: `${CLOISONS.length} cloisons` },
          { label: "Revue traitée",    value: `${reviewPct}%`,           color: "#22c55e", sub: `${reviewed} / ${c.totalFindings}` },
        ] as const).map((kpi, i) => (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderTop: `2px solid ${kpi.color}`, borderRadius: 13, padding: "14px 15px", background: SURF2 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color, fontVariantNumeric: "tabular-nums" }}>{kpi.value}</div>
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
          {(["hardLaw", "methodology", "internal"] as const).map(nat => {
            const count  = c.parFamille[nat] ?? 0;
            const pct    = Math.round(count / Math.max(1, c.totalFindings) * 100);
            const color  = NAT_HEX[nat];
            const active = natFilter === nat;
            return (
              <button
                key={nat}
                onClick={() => setNatFilter(active ? null : nat)}
                style={{ textAlign: "left" as const, cursor: "pointer", border: `1px solid ${active ? `${color}60` : BORDER}`, borderRadius: 12, background: active ? `${color}14` : SURFACE, padding: "14px" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />
                    {nat === "hardLaw" ? "Droit dur (opposable)" : nat === "methodology" ? "Présomption d'audit" : "Paramètre interne"}
                  </span>
                  <span style={{ fontSize: 26, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{count}</span>
                </div>
                <div style={{ marginTop: 11, height: 7, borderRadius: 5, background: SURF3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 5, background: color, width: `${pct}%` }} />
                </div>
                <p style={{ margin: "9px 0 0", fontSize: 11, lineHeight: 1.45, color: MUTED }}>
                  {nat === "hardLaw"
                    ? "Contrainte réglementaire opposable — LPF, PCG, Code de commerce. Une non-conformité fonde directement un constat."
                    : nat === "methodology"
                    ? "Procédure ou présomption issue des normes d'audit (ISA, ISRE) : signal qui appelle une investigation."
                    : "Heuristique ou seuil propre à PROBANT, non opposable : vigilance analytique à corroborer."}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Analytique ──────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(272px,1fr))", gap: 16, marginBottom: 16 }}>
        {/* Donut gravité */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" as const }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Répartition</div>
          <h3 style={{ margin: "3px 0 10px", fontSize: 14, fontWeight: 600, color: TEXT }}>Par gravité</h3>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 140 }}>
            <DonutSVG data={SEV_ORDER.map(s => ({ value: c.parSeverite[s] ?? 0, color: SEV_HEX[s] }))} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 7, marginTop: 8 }}>
            {SEV_ORDER.map(sev => {
              const count  = c.parSeverite[sev] ?? 0;
              const active = sevFilter === sev;
              return (
                <button
                  key={sev}
                  onClick={() => setSevFilter(active ? null : sev)}
                  style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", border: `1px solid ${active ? `${SEV_HEX[sev]}60` : BORDER}`, borderRadius: 9, background: active ? `${SEV_HEX[sev]}18` : "transparent", padding: "7px 10px" }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: SEV_HEX[sev], flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: "left" as const, fontSize: 12, fontWeight: 500, color: active ? TEXT : MUTED }}>{SEV_LABEL[sev]}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: SEV_HEX[sev], fontVariantNumeric: "tabular-nums" }}>{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Incidence bars */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" as const }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Incidence potentielle estimée</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Écarts chiffrés par cloison</h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: FAINT }}>Somme des écarts en € · indicatif</p>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column" as const, gap: 15, flex: 1 }}>
            {incBars.length === 0 ? (
              <p style={{ fontSize: 12, color: FAINT }}>Aucun écart chiffré à incidence directe.</p>
            ) : incBars.map(b => (
              <div key={b.id}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>{b.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{formatEur(b.value)}</span>
                </div>
                <div style={{ height: 11, borderRadius: 6, background: SURF3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg,${ACCENT},${ACCENT}99)`, width: `${(b.value / maxInc) * 100}%` }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 2, borderTop: `1px solid ${BORDER}`, paddingTop: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: FAINT }}>Total dossier</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: ACCENT, fontVariantNumeric: "tabular-nums" }}>{formatEur(totalInc)}</span>
            </div>
          </div>
        </section>

        {/* Radar */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px", display: "flex", flexDirection: "column" as const }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Profil de risque</div>
          <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Exposition par cloison</h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: FAINT }}>Pondérée par gravité des constats</p>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
            <RadarSVG data={radarData} />
          </div>
        </section>
      </div>

      {/* ── Matrice + Flux ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 16, marginBottom: 16 }}>
        {/* Heatmap */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Matrice de concentration</div>
          <h3 style={{ margin: "3px 0 14px", fontSize: 14, fontWeight: 600, color: TEXT }}>Gravité × cloison</h3>
          <div style={{ display: "grid", gridTemplateColumns: "104px repeat(4,1fr)", gap: 6, alignItems: "center" }}>
            <div />
            {SEV_ORDER.map(sev => (
              <div key={sev} style={{ textAlign: "center" as const, fontSize: 10, fontWeight: 600, color: SEV_HEX[sev] }}>
                {sev === "bloquant" ? "Bloq." : sev === "majeur" ? "Maj." : sev === "mineur" ? "Min." : "Info."}
              </div>
            ))}
            {heatmap.map(row => (
              <>
                <div key={`${row.id}-label`} style={{ fontSize: 11, fontWeight: 500, color: MUTED, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.short}
                </div>
                {SEV_ORDER.map(sev => {
                  const n         = row.cells[sev] ?? 0;
                  const intensity = n / heatMaxN;
                  const alphaHex  = Math.round(intensity * 0.65 * 255).toString(16).padStart(2, "0");
                  const bg        = n === 0 ? SURF3 : `${SEV_HEX[sev]}${alphaHex}`;
                  return (
                    <button
                      key={sev}
                      onClick={() => { if (n > 0) { setSevFilter(sev); setCloisonFilter(row.id); } }}
                      style={{ height: 34, borderRadius: 7, border: `1px solid ${BORDER}`, background: bg, color: n === 0 ? FAINT : SEV_HEX[sev], fontSize: 13, fontWeight: 700, cursor: n > 0 ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}
                    >
                      {n > 0 ? n : "—"}
                    </button>
                  );
                })}
              </>
            ))}
          </div>
          <p style={{ margin: "13px 0 0", fontSize: 10.5, lineHeight: 1.5, color: FAINT }}>
            L'intensité reflète le nombre de constats. Cliquer pour filtrer le hub.
          </p>
        </section>

        {/* Sankey */}
        <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>Cheminement</div>
              <h3 style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: TEXT }}>Des cloisons vers la gravité</h3>
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 10, color: FAINT }}>
              <span>cloison</span><span>→</span><span>gravité</span>
            </div>
          </div>
          <SankeyViz byCloison={byCloison} />
        </section>
      </div>

      {/* ── Hub des constats ─────────────────────────────────────────── */}
      <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURF2, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".09em", color: FAINT }}>
                Hub des constats · {hubFindings.length} affiché{hubFindings.length > 1 ? "s" : ""}
              </div>
              <h3 style={{ margin: "3px 0 0", fontSize: 15, fontWeight: 600, color: TEXT }}>Journal centralisé — toutes catégories</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" as const }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${BORDER}`, borderRadius: 9, background: SURFACE, padding: "7px 10px", minWidth: 200 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher (compte, intitulé…)"
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: TEXT, fontSize: 12, fontFamily: "inherit" }}
                />
              </div>
              <button
                onClick={() => setSortField(f => f === "sev" ? "inc" : "sev")}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${BORDER}`, borderRadius: 9, background: SURF3, color: MUTED, padding: "7px 11px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="M11 4h10" /><path d="M11 8h7" /><path d="M11 12h4" />
                </svg>
                Tri : {sortField === "sev" ? "Gravité" : "Incidence"}
              </button>
            </div>
          </div>
          {/* Cloison chip filters */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: 10, textTransform: "uppercase" as const, letterSpacing: ".06em", color: FAINT }}>Cloison</span>
            {CLOISONS.map(cl => {
              const active = cloisonFilter === cl.id;
              return (
                <button
                  key={cl.id}
                  onClick={() => setCloisonFilter(active ? null : cl.id)}
                  style={{ cursor: "pointer", border: `1px solid ${active ? `${ACCENT}60` : BORDER}`, borderRadius: 999, background: active ? `${ACCENT}18` : "transparent", color: active ? ACCENT : MUTED, padding: "4px 11px", fontSize: 11.5, fontWeight: 500 }}
                >
                  {cl.label}
                </button>
              );
            })}
            {hasFilters && (
              <button
                onClick={() => { setNatFilter(null); setSevFilter(null); setCloisonFilter(null); setQuery(""); }}
                style={{ cursor: "pointer", border: `1px dashed ${FAINT}`, borderRadius: 999, background: "transparent", color: FAINT, padding: "4px 10px", fontSize: 11, fontWeight: 500 }}
              >
                × Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["Sévérité", "Cloison", "Comptes", "Constat", "Incidence", "Famille"].map(col => (
                  <th key={col} style={{ padding: "10px 16px", textAlign: "left" as const, fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".06em", color: FAINT, whiteSpace: "nowrap" as const }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hubFindings.slice(0, 50).map((f, i) => {
                const inc    = findingInc(f);
                const clLabel = CLOISONS.find(cl => cl.id === f.cloison)?.label ?? f.cloison;
                return (
                  <tr key={f.id ?? i} style={{ borderBottom: `1px solid ${SEP}` }}>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" as const }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${SEV_HEX[f.severity]}18`, border: `1px solid ${SEV_HEX[f.severity]}40`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: SEV_HEX[f.severity] }}>
                        {SEV_LABEL[f.severity]}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: MUTED, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{clLabel}</td>
                    <td style={{ padding: "10px 16px", color: MUTED, fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" as const }}>
                      {f.comptesConcernes.slice(0, 2).join(", ") || "—"}
                    </td>
                    <td style={{ padding: "10px 16px", color: TEXT, maxWidth: 260 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.titre}</div>
                    </td>
                    <td style={{ padding: "10px 16px", color: inc > 0 ? "#f97316" : FAINT, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const, fontWeight: inc > 0 ? 600 : 400 }}>
                      {inc > 0 ? formatEur(inc) : "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ background: `${NAT_HEX[f.family]}18`, border: `1px solid ${NAT_HEX[f.family]}40`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: NAT_HEX[f.family] }}>
                        {f.family === "hardLaw" ? "Droit dur" : f.family === "methodology" ? "Métho." : "Interne"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {hubFindings.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "32px", textAlign: "center" as const, color: FAINT }}>
                    Aucun constat ne correspond aux filtres actifs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hubFindings.length > 50 && (
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${BORDER}`, fontSize: 11, color: FAINT, textAlign: "center" as const }}>
              {hubFindings.length - 50} constat{hubFindings.length - 50 > 1 ? "s" : ""} supplémentaire{hubFindings.length - 50 > 1 ? "s" : ""} — affinez les filtres pour en voir plus.
            </div>
          )}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${BORDER}`, borderRadius: 12, background: SURF2, padding: "16px 20px" }}>
        <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
          {c.bloquantesAdmissibilite > 0
            ? "Des alertes bloquantes d'admissibilité subsistent : à traiter avant de conclure l'analyse financière."
            : "Aucune alerte bloquante d'admissibilité. L'analyse financière est exploitable."}
        </p>
        <Link
          href="/dashboard/cloisons"
          style={{ flexShrink: 0, borderRadius: 9, background: ACCENT, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#06122a", textDecoration: "none" }}
        >
          Ouvrir la revue par cloison →
        </Link>
      </div>

    </div>
  );
}

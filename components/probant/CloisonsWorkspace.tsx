"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Search, X, FileText, LayoutGrid } from "lucide-react";
import type {
  SiloView,
  Finding,
  Severity,
  FindingFamily,
  FauxPositifRisk,
} from "@/lib/canonical-model";
import {
  buildStatementDocuments,
  CLOISONS,
  siloById,
  SEVERITY_ORDER,
} from "@/lib/canonical-model";
import { FinancialDocumentViewer } from "@/components/viewer/FinancialDocumentViewer";

/* ── types ──────────────────────────────────────────────────────────────────── */

type UserDecision = "valide" | "ecarte" | "accepte";

export interface ScenarioInfo {
  label: string;
  secteur: string;
  forme: string;
  exercice: string;
}

/* ── design constants ───────────────────────────────────────────────────────── */

const SEV: Record<Severity, { hex: string; bg: string; label: string }> = {
  bloquant:   { hex: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "Bloquant"   },
  majeur:     { hex: "#f97316", bg: "rgba(249,115,22,0.12)",  label: "Majeur"     },
  mineur:     { hex: "#eab308", bg: "rgba(234,179,8,0.12)",   label: "Mineur"     },
  informatif: { hex: "#3b82f6", bg: "rgba(59,130,246,0.12)",  label: "Informatif" },
};

const FAM: Record<FindingFamily, { mark: string; hex: string; label: string; desc: string }> = {
  hardLaw:     { mark: "§",  hex: "#ef4444", label: "Obligatoire",       desc: "Contrainte réglementaire dure (LPF, PCG). Non négociable." },
  methodology: { mark: "⊙", hex: "#a78bfa", label: "Méthode d'audit",   desc: "Présomption d'anomalie selon les procédures analytiques (ISA)." },
  internal:    { mark: "≈",  hex: "#38bdf8", label: "Paramètre interne", desc: "Heuristique ou seuil propre à PROBANT." },
};

const ACCENT  = "#5b9dff";
const TEXT    = "#e8edf4";
const MUTED   = "#7b8798";
const FAINT   = "#56616f";
const BORDER  = "#1c2430";
const SURFACE = "#0b0e13";
const SEP     = "#1a2029";

/* ── utilities ──────────────────────────────────────────────────────────────── */

function formatEur(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs === 0) return "—";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")} M€`;
  if (abs >= 1_000)     return `${sign}${Math.round(abs / 1_000)} k€`;
  return `${sign}${abs.toLocaleString("fr-FR")} €`;
}

function formatMesure(f: Finding): string {
  const { constate, unite } = f.mesure;
  if (unite === "EUR")   return formatEur(constate);
  if (unite === "%")     return `${(constate * 100).toFixed(1)} %`;
  if (unite === "jours") return `${constate} j`;
  return String(constate);
}

function formatSeuil(f: Finding): string {
  const { seuil, unite } = f.mesure;
  if (unite === "EUR")   return formatEur(seuil);
  if (unite === "%")     return `${(seuil * 100).toFixed(1)} %`;
  if (unite === "jours") return `${seuil} j`;
  return String(seuil);
}

function formatEcart(f: Finding): string {
  const { constate, seuil, unite } = f.mesure;
  const e = constate - seuil;
  if (unite === "EUR") return formatEur(e);
  if (unite === "%")   return `${(e * 100).toFixed(1)} pp`;
  return e.toFixed(2);
}

function worstSev(findings: Finding[]): Severity | null {
  if (!findings.length) return null;
  return findings.reduce((a, b) =>
    SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[b.severity] ? a : b
  ).severity;
}

function computeScore(findings: Finding[]): number {
  const w: Record<Severity, number> = { bloquant: 30, majeur: 15, mineur: 5, informatif: 1 };
  return Math.min(100, findings.reduce((s, f) => s + w[f.severity], 0));
}

function computeExpo(findings: Finding[]): number {
  return findings
    .filter((f) => f.mesure.unite === "EUR")
    .reduce((s, f) => s + Math.abs(f.mesure.constate - f.mesure.seuil), 0);
}

function confBarSegs(risk?: FauxPositifRisk): string[] {
  if (!risk || risk === "faible") return ["#22c55e", "#22c55e", "#1b2230", "#1b2230", "#1b2230"];
  if (risk === "moyen")           return ["#eab308", "#eab308", "#eab308", "#1b2230", "#1b2230"];
  return                                 ["#f97316", "#f97316", "#f97316", "#f97316", "#f97316"];
}

function confBarLabel(risk?: FauxPositifRisk): string {
  if (!risk || risk === "faible") return "Risque faible";
  if (risk === "moyen")           return "Risque moyen";
  return "Risque élevé";
}

function groupByCloison(silos: SiloView[]) {
  const order = CLOISONS.map((c) => c.id);
  const map = new Map<string, { cloisonLabel: string; silos: SiloView[] }>();
  for (const s of silos) {
    const siloMeta = siloById(s.siloId);
    if (!siloMeta) continue;
    const cloison = CLOISONS.find((c) => c.id === siloMeta.cloison);
    if (!cloison) continue;
    const entry = map.get(cloison.id) ?? { cloisonLabel: cloison.label, silos: [] };
    entry.silos.push(s);
    map.set(cloison.id, entry);
  }
  return order.filter((id) => map.has(id)).map((id) => ({ cloisonId: id, ...map.get(id)! }));
}

function matchQuery(f: Finding, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  return (
    f.titre.toLowerCase().includes(lq) ||
    f.constat.toLowerCase().includes(lq) ||
    f.source.ref.toLowerCase().includes(lq) ||
    f.comptesConcernes.some((c) => c.toLowerCase().includes(lq))
  );
}

function effectiveStatut(f: Finding, decisions: Record<string, UserDecision>): string {
  return decisions[f.id] ?? f.statutRevue;
}

/* ── FilterDropdown ─────────────────────────────────────────────────────────── */

interface FDItem { value: string; label: string; dot?: string }

function FilterDropdown({
  label,
  items,
  selected,
  onToggle,
  open,
  onOpen,
  onClose,
}: {
  label: string;
  items: FDItem[];
  selected: string[];
  onToggle: (v: string) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const hasActive = selected.length > 0;
  const valueLabel = hasActive
    ? (selected.length === 1 ? items.find((i) => i.value === selected[0])?.label : `${selected.length} sél.`)
    : "Tous";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => (open ? onClose() : onOpen())}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 11px",
          borderRadius: 9, cursor: "pointer",
          border: `1px solid ${hasActive ? "rgba(91,157,255,0.4)" : "#222a36"}`,
          background: hasActive ? "rgba(91,157,255,0.08)" : "transparent",
        }}
      >
        <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" as const, color: FAINT }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: hasActive ? ACCENT : MUTED }}>{valueLabel}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.4"
          style={{ transition: "transform .18s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
            minWidth: 200, padding: 6, background: "#11151c",
            border: "1px solid #232b38", borderRadius: 11,
            boxShadow: "0 18px 44px -14px rgba(0,0,0,.7)",
          }}
        >
          {hasActive && (
            <button
              onClick={() => selected.forEach((v) => onToggle(v))}
              style={{ width: "100%", textAlign: "left" as const, padding: "6px 9px", border: "none", background: "none", cursor: "pointer", fontSize: 11, color: ACCENT }}
            >
              Réinitialiser
            </button>
          )}
          {items.map((it) => {
            const active = selected.includes(it.value);
            return (
              <button
                key={it.value}
                onClick={() => onToggle(it.value)}
                style={{
                  display: "flex", width: "100%", alignItems: "center", gap: 9,
                  padding: "8px 9px", border: "none",
                  background: active ? "rgba(91,157,255,0.08)" : "transparent",
                  borderRadius: 7, cursor: "pointer", textAlign: "left" as const,
                }}
              >
                {it.dot && <span style={{ width: 9, height: 9, borderRadius: "50%", background: it.dot, flexShrink: 0 }} />}
                <span style={{ flex: 1, fontSize: 12, color: TEXT }}>{it.label}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── RailPanel ──────────────────────────────────────────────────────────────── */

function RailPanel({
  finding,
  decisions,
  onDecision,
}: {
  finding: Finding;
  decisions: Record<string, UserDecision>;
  onDecision: (id: string, d: UserDecision) => void;
}) {
  const [mode, setMode] = useState<"analyse" | "narration">("analyse");
  const [showJustifier, setShowJustifier] = useState(true);
  const [showAgir, setShowAgir] = useState(true);
  const [showSource, setShowSource] = useState(false);

  const sev = SEV[finding.severity];
  const fam = FAM[finding.family];
  const siloMeta = siloById(finding.siloId);
  const decision = decisions[finding.id];

  const constate = formatMesure(finding);
  const attendu = formatSeuil(finding);
  const ecart = formatEcart(finding);
  const ecartHex = finding.mesure.constate <= finding.mesure.seuil ? "#22c55e" : sev.hex;

  const segs = confBarSegs(finding.fauxPositifRisk);
  const riskLabel = confBarLabel(finding.fauxPositifRisk);

  function decStyle(d: UserDecision) {
    const active = decision === d;
    const hex = d === "valide" ? "#22c55e" : d === "accepte" ? ACCENT : "#8a96a6";
    const dashed = d === "ecarte";
    return {
      border: `1px ${dashed ? "dashed" : "solid"} ${active ? `${hex}60` : "#232b38"}`,
      background: active ? `${hex}18` : "transparent",
      color: active ? hex : MUTED,
    };
  }

  return (
    <div style={{ fontSize: 13, color: TEXT }}>
      {/* COMPRENDRE */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase" as const, color: ACCENT }}>Comprendre</span>
          <span style={{ fontSize: 9, letterSpacing: ".04em", color: "#46505f" }}>Niveau 3 · Analyse</span>
          <span style={{ height: 1, flex: 1, background: BORDER }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" as const }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase" as const, padding: "4px 9px", borderRadius: 6, color: sev.hex, background: sev.bg }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: sev.hex }} />
            {sev.label}
          </span>
          <span title={fam.desc} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 500, padding: "4px 9px", borderRadius: 6, color: "#aeb8c6", border: "1px solid #2a3340" }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1 }}>{fam.mark}</span>
            {fam.label}
          </span>
          {siloMeta && (
            <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED, border: "1px solid #232b38", padding: "3px 8px", borderRadius: 6 }}>
              {siloMeta.label}
            </span>
          )}
        </div>

        <h3 style={{ margin: "13px 0 0", fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: TEXT }}>
          {finding.titre}
        </h3>

        <div style={{ marginTop: 12, display: "inline-flex", padding: 3, border: "1px solid #232b38", background: SURFACE, borderRadius: 9 }}>
          {(["analyse", "narration"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{ padding: "5px 13px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: mode === m ? "#1a2435" : "transparent", color: mode === m ? TEXT : MUTED }}
            >
              {m === "analyse" ? "Analyse" : "Narration"}
            </button>
          ))}
        </div>

        {mode === "analyse" ? (
          <div>
            <p style={{ margin: "13px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "#9aa6b6" }}>{finding.constat}</p>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: BORDER, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
              {[
                { label: "Constaté", value: constate, color: sev.hex },
                { label: "Attendu",  value: attendu,  color: "#cdd6e2" },
                { label: "Écart",    value: ecart,    color: ecartHex },
              ].map((cell) => (
                <div key={cell.label} style={{ background: SURFACE, padding: "11px 12px" }}>
                  <div style={{ fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase" as const, color: FAINT }}>{cell.label}</div>
                  <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600, color: cell.color, fontVariantNumeric: "tabular-nums" }}>{cell.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 13 }}>
            {finding.preuve.map((p, i) => (
              <div key={i}>
                <div style={{ padding: "10px 12px", border: `1px solid ${BORDER}`, borderLeft: `2px solid ${ACCENT}`, background: SURFACE, borderRadius: 8, fontSize: 12, lineHeight: 1.5, color: "#9aa6b6" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#6a7587", marginBottom: 3 }}>{p.etape}</div>
                  {p.detail}
                </div>
                {i < finding.preuve.length - 1 && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "3px 0" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Confidence bar */}
        <div style={{ marginTop: 13, display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 9, background: SURFACE }}>
          <div style={{ display: "flex", gap: 3 }}>
            {segs.map((color, i) => (
              <span key={i} style={{ width: 24, height: 5, borderRadius: 3, background: color }} />
            ))}
          </div>
          <span style={{ fontSize: 10.5, color: MUTED }}>{riskLabel}</span>
        </div>
      </div>

      {/* JUSTIFIER */}
      <div style={{ marginTop: 14, borderTop: `1px solid ${SEP}`, paddingTop: 14 }}>
        <button
          onClick={() => setShowJustifier((v) => !v)}
          style={{ display: "flex", width: "100%", alignItems: "center", gap: 9, border: "none", background: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase" as const, color: ACCENT }}>Justifier</span>
          <span style={{ fontSize: 9, letterSpacing: ".04em", color: "#46505f" }}>Niveau 3 · Preuve</span>
          <span style={{ height: 1, flex: 1, background: BORDER }} />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.4"
            style={{ transition: "transform .2s", transform: showJustifier ? "rotate(180deg)" : "rotate(0deg)" }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {showJustifier && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowSource((v) => !v)}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 9, padding: "10px 11px", border: "1px solid #232b38", background: SURFACE, borderRadius: 9, cursor: "pointer", textAlign: "left" as const }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span style={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 600, color: ACCENT }}>{finding.source.ref}</span>
              <span style={{ fontFamily: "monospace", fontSize: 9.5, color: FAINT }}>v.{finding.source.effectiveDate}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2"
                style={{ marginLeft: "auto", transition: "transform .2s", transform: showSource ? "rotate(90deg)" : "rotate(0deg)" }}>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            {showSource && (
              <blockquote style={{ margin: "8px 0 0", padding: "10px 13px", borderLeft: `2px solid ${ACCENT}`, background: SURFACE, borderRadius: "0 8px 8px 0", fontSize: 11.5, fontStyle: "italic", lineHeight: 1.55, color: "#9aa6b6" }}>
                « {finding.source.citation} »
              </blockquote>
            )}

            <div style={{ marginTop: 13 }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: FAINT, marginBottom: 6 }}>Explication métier</div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "#aeb8c6" }}>{finding.explication}</p>
            </div>

            {finding.faisceau.length > 0 && (
              <div style={{ marginTop: 13 }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: FAINT, marginBottom: 7 }}>Faisceau d'indices</div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {finding.faisceau.map((s, i) => (
                    <span key={i} style={{ fontSize: 11, color: "#aeb8c6", background: SURFACE, border: "1px solid #2a3340", padding: "4px 9px", borderRadius: 7 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {finding.preuve.length > 0 && (
              <div style={{ marginTop: 15 }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: FAINT, marginBottom: 10 }}>Chaîne de preuve</div>
                <div style={{ display: "flex", flexDirection: "column" as const }}>
                  {finding.preuve.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 11 }}>
                      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
                        <span style={{ display: "flex", width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "1px solid #2e3947", background: SURFACE, fontFamily: "monospace", fontSize: 10, fontWeight: 600, color: "#aeb8c6" }}>
                          {i + 1}
                        </span>
                        {i < finding.preuve.length - 1 && (
                          <span style={{ width: 1, flex: 1, minHeight: 13, background: "#232b38", margin: "2px 0" }} />
                        )}
                      </div>
                      <div style={{ paddingBottom: 13 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#6a7587" }}>{p.etape}</div>
                        <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.45, color: "#aeb8c6" }}>{p.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AGIR */}
      <div style={{ marginTop: 14, borderTop: `1px solid ${SEP}`, paddingTop: 14 }}>
        <button
          onClick={() => setShowAgir((v) => !v)}
          style={{ display: "flex", width: "100%", alignItems: "center", gap: 9, border: "none", background: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase" as const, color: ACCENT }}>Agir</span>
          <span style={{ fontSize: 9, letterSpacing: ".04em", color: "#46505f" }}>Niveau 4 · Décision</span>
          <span style={{ height: 1, flex: 1, background: BORDER }} />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.4"
            style={{ transition: "transform .2s", transform: showAgir ? "rotate(180deg)" : "rotate(0deg)" }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {showAgir && (
          <div style={{ marginTop: 12 }}>
            <div style={{ padding: "12px 13px", border: "1px solid #243247", background: "linear-gradient(180deg,rgba(91,157,255,.06),transparent)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
                  <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
                </svg>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" as const, color: ACCENT }}>Recommandation</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "#cdd6e2" }}>{finding.explication}</p>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: FAINT, marginBottom: 8 }}>Décision de revue</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
                <button
                  onClick={() => onDecision(finding.id, "valide")}
                  style={{ display: "inline-flex", flexDirection: "column" as const, alignItems: "center", gap: 5, padding: "11px 6px", fontSize: 11.5, fontWeight: 600, borderRadius: 9, cursor: "pointer", ...decStyle("valide") }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
                  Valider
                </button>
                <button
                  onClick={() => onDecision(finding.id, "accepte")}
                  style={{ display: "inline-flex", flexDirection: "column" as const, alignItems: "center", gap: 5, padding: "11px 6px", fontSize: 11.5, fontWeight: 600, borderRadius: 9, cursor: "pointer", ...decStyle("accepte") }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14" /><path d="M5 18h14" opacity=".5" />
                  </svg>
                  Accepter
                </button>
                <button
                  onClick={() => onDecision(finding.id, "ecarte")}
                  style={{ display: "inline-flex", flexDirection: "column" as const, alignItems: "center", gap: 5, padding: "11px 6px", fontSize: 11.5, fontWeight: 600, borderRadius: 9, cursor: "pointer", ...decStyle("ecarte") }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  Écarter
                </button>
              </div>
              <button style={{ marginTop: 9, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: 9, fontSize: 11.5, fontWeight: 500, borderRadius: 8, cursor: "pointer", border: "1px solid #232b38", background: "none", color: "#aeb8c6" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                Joindre un justificatif
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CloisonsWorkspace ──────────────────────────────────────────────────────── */

export function CloisonsWorkspace({
  silos,
  meta,
  scenario = null,
}: {
  silos: SiloView[];
  meta: { label: string; exercice: string };
  scenario?: ScenarioInfo | null;
}) {
  const docs = useMemo(() => buildStatementDocuments(silos, meta), [silos, meta]);
  const documentDisponible = docs.length > 0;

  const [vue, setVue] = useState<"silo" | "document">("silo");
  const [openSilos, setOpenSilos] = useState<Set<string>>(() => new Set(silos[0]?.siloId ? [silos[0].siloId] : []));
  const [selId, setSelId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, UserDecision>>({});

  const [query, setQuery] = useState("");
  const [sevFilter, setSevFilter] = useState<string[]>([]);
  const [statutFilter, setStatutFilter] = useState<string[]>([]);
  const [natureFilter, setNatureFilter] = useState<string[]>([]);
  const [ddOpen, setDdOpen] = useState<"sev" | "statut" | "nature" | null>(null);

  const allFindings = useMemo(() => silos.flatMap((s) => s.findings), [silos]);

  const sevCounts = useMemo(() => {
    const counts = { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 } as Record<Severity, number>;
    for (const f of allFindings) counts[f.severity]++;
    return counts;
  }, [allFindings]);

  const totalExpo = useMemo(() => computeExpo(allFindings), [allFindings]);

  const groups = useMemo(() => groupByCloison(silos), [silos]);

  const selectedFinding = useMemo(
    () => allFindings.find((f) => f.id === selId) ?? null,
    [allFindings, selId],
  );

  const hasFilters = !!query || sevFilter.length > 0 || statutFilter.length > 0 || natureFilter.length > 0;

  function filterFindings(findings: Finding[]): Finding[] {
    if (!hasFilters) return findings;
    return findings.filter((f) => {
      if (!matchQuery(f, query)) return false;
      if (sevFilter.length > 0 && !sevFilter.includes(f.severity)) return false;
      if (natureFilter.length > 0 && !natureFilter.includes(f.family)) return false;
      if (statutFilter.length > 0 && !statutFilter.includes(effectiveStatut(f, decisions))) return false;
      return true;
    });
  }

  const filteredTotal = useMemo(
    () => hasFilters ? allFindings.filter((f) => filterFindings([f]).length > 0).length : allFindings.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFindings, query, sevFilter, statutFilter, natureFilter, decisions, hasFilters],
  );

  function toggleSilo(id: string) {
    setOpenSilos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleDecision(id: string, d: UserDecision) {
    setDecisions((prev) => {
      if (prev[id] === d) { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: d };
    });
  }

  return (
    <div
      onClick={() => ddOpen && setDdOpen(null)}
      style={{ minHeight: "100%", background: "radial-gradient(1100px 560px at 84% -10%, #131a28 0%, #0a0d12 56%)", padding: "22px 26px 70px", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div style={{ maxWidth: 1680, margin: "0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" as const }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ display: "inline-flex", width: 27, height: 27, borderRadius: 7, alignItems: "center", justifyContent: "center", background: "#141b27", border: "1px solid #2a3a55" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-.01em", color: TEXT }}>Revue par cloison</h1>
              </div>
              <p style={{ margin: "8px 0 0", maxWidth: 610, fontSize: 12, lineHeight: 1.55, color: MUTED }}>
                Une cloison isole une catégorie comptable. Le parcours se révèle à la demande :{" "}
                <span style={{ color: "#aeb8c6" }}>explorer</span> le risque,{" "}
                <span style={{ color: "#aeb8c6" }}>comprendre</span> l'anomalie, puis{" "}
                <span style={{ color: "#aeb8c6" }}>décider</span> — un niveau à la fois.
              </p>
            </div>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#46c08a" }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>{meta.label}</span>
                <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "#e3bd4d", border: "1px solid rgba(227,189,77,.4)", padding: "2px 6px", borderRadius: 5 }}>
                  {scenario ? "Simulation" : "Démo"}
                </span>
              </div>
              <div style={{ marginTop: 5, fontSize: 9.5, color: FAINT, fontVariantNumeric: "tabular-nums" }}>
                {scenario ? `${scenario.secteur} · ${scenario.forme} · ` : "SIREN 000 000 000 · "}
                Exercice {meta.exercice} · Réf. v.2024-01-01
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" as const, padding: "11px 2px", borderTop: `1px solid ${SEP}`, borderBottom: `1px solid ${SEP}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{allFindings.length}</span>
              <span style={{ fontSize: 11, color: MUTED }}>constats</span>
            </div>
            <span style={{ width: 1, height: 14, background: "#222a36" }} />
            {(["bloquant", "majeur", "mineur", "informatif"] as Severity[]).filter((s) => sevCounts[s] > 0).map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: SEV[s].hex }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: SEV[s].hex, fontVariantNumeric: "tabular-nums" }}>{sevCounts[s]}</span>
                <span style={{ fontSize: 11, color: MUTED }}>{SEV[s].label}</span>
              </div>
            ))}
            {totalExpo > 0 && (
              <>
                <span style={{ width: 1, height: 14, background: "#222a36" }} />
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span style={{ fontSize: 11, color: MUTED }}>Exposition cumulée</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#cdd6e2", fontVariantNumeric: "tabular-nums" }}>{formatEur(totalExpo)}</span>
                </div>
              </>
            )}
          </div>

          {/* Toolbar */}
          <div style={{ marginTop: 13, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const }}>
            <div style={{ position: "relative", flex: 1, minWidth: 230, maxWidth: 340 }}>
              <Search size={14} color={FAINT} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher compte, libellé, norme…"
                onClick={(e) => e.stopPropagation()}
                style={{ width: "100%", padding: "9px 34px 9px 34px", fontSize: 12.5, color: TEXT, background: "#0c1016", border: "1px solid #222a36", borderRadius: 9, outline: "none", boxSizing: "border-box" as const }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: FAINT, padding: 2, lineHeight: 0 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {(["sev", "statut", "nature"] as const).map((dd) => (
              <div key={dd} onClick={(e) => e.stopPropagation()}>
                <FilterDropdown
                  label={dd === "sev" ? "Sévérité" : dd === "statut" ? "Statut" : "Nature"}
                  items={
                    dd === "sev"
                      ? (["bloquant", "majeur", "mineur", "informatif"] as Severity[]).map((s) => ({ value: s, label: SEV[s].label, dot: SEV[s].hex }))
                      : dd === "statut"
                      ? [
                          { value: "en_attente", label: "En attente" },
                          { value: "valide",     label: "Validé" },
                          { value: "accepte",    label: "Accepté" },
                          { value: "ecarte",     label: "Écarté" },
                        ]
                      : (["hardLaw", "methodology", "internal"] as FindingFamily[]).map((f) => ({ value: f, label: FAM[f].label, dot: FAM[f].hex }))
                  }
                  selected={dd === "sev" ? sevFilter : dd === "statut" ? statutFilter : natureFilter}
                  onToggle={(v) => {
                    const setter = dd === "sev" ? setSevFilter : dd === "statut" ? setStatutFilter : setNatureFilter;
                    setter((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
                  }}
                  open={ddOpen === dd}
                  onOpen={() => setDdOpen(dd)}
                  onClose={() => setDdOpen(null)}
                />
              </div>
            ))}

            <div style={{ marginLeft: "auto", display: "inline-flex", padding: 3, border: "1px solid #232b38", background: SURFACE, borderRadius: 9 }}>
              <button
                onClick={() => setVue("silo")}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: vue === "silo" ? "#1a2435" : "transparent", color: vue === "silo" ? TEXT : MUTED }}
              >
                <LayoutGrid size={13} /> Cloisons
              </button>
              <button
                onClick={() => documentDisponible && setVue("document")}
                disabled={!documentDisponible}
                title={documentDisponible ? undefined : "Aucun état reconstruit disponible"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, border: "none", borderRadius: 6, cursor: documentDisponible ? "pointer" : "not-allowed", opacity: documentDisponible ? 1 : 0.4, background: vue === "document" ? "#1a2435" : "transparent", color: vue === "document" ? TEXT : MUTED }}
              >
                <FileText size={13} /> Document annoté
              </button>
            </div>

            {hasFilters && (
              <span style={{ fontSize: 11.5, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontWeight: 600, color: TEXT }}>{filteredTotal}</span> / {allFindings.length}
              </span>
            )}
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ display: "flex", gap: 18 }}>

          {/* Accordion / Document view */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {vue === "document" && documentDisponible ? (
              <FinancialDocumentViewer docs={docs} />
            ) : (
              <div>
                {groups.map(({ cloisonId, cloisonLabel, silos: groupSilos }) => (
                  <div key={cloisonId} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", marginBottom: 4 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" as const, color: FAINT }}>{cloisonLabel}</span>
                      <span style={{ height: 1, flex: 1, background: "#16202e" }} />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                      {groupSilos.map((siloView) => {
                        const siloMeta = siloById(siloView.siloId);
                        const isOpen = openSilos.has(siloView.siloId);
                        const findings = siloView.findings;
                        const filtered = filterFindings(findings);
                        const worst = worstSev(findings);
                        const score = computeScore(findings);
                        const expo = computeExpo(findings);
                        const sevStyle = worst ? SEV[worst] : null;

                        return (
                          <div
                            key={siloView.siloId}
                            style={{ borderRadius: 11, border: `1px solid ${isOpen ? "#253045" : "#1a2029"}`, background: isOpen ? "#0d1320" : "rgba(13,19,32,0.5)", overflow: "hidden", transition: "border-color .2s" }}
                          >
                            <button
                              onClick={() => toggleSilo(siloView.siloId)}
                              style={{ display: "flex", width: "100%", alignItems: "center", gap: 14, padding: "13px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.2"
                                style={{ flexShrink: 0, transition: "transform .2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
                                <path d="m9 18 6-6-6-6" />
                              </svg>
                              <div style={{ flex: 1, minWidth: 90 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {siloMeta?.label ?? siloView.siloId}
                                </div>
                                <div style={{ marginTop: 2, fontSize: 10.5, letterSpacing: ".02em", color: FAINT, fontFamily: "monospace" }}>
                                  {siloMeta?.comptes.join(", ") ?? ""}
                                </div>
                              </div>
                              {sevStyle && findings.length > 0 && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 11px", borderRadius: 8, background: sevStyle.bg, whiteSpace: "nowrap" }}>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevStyle.hex }} />
                                  <span style={{ fontSize: 11.5, fontWeight: 600, color: sevStyle.hex }}>{sevStyle.label}</span>
                                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#46505f" }} />
                                  <span style={{ fontSize: 10.5, color: "#8a96a6", fontVariantNumeric: "tabular-nums" }}>{score}/100</span>
                                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#46505f" }} />
                                  <span style={{ fontSize: 10.5, color: "#8a96a6" }}>{findings.length} constat{findings.length > 1 ? "s" : ""}</span>
                                </span>
                              )}
                              {expo > 0 && (
                                <span style={{ minWidth: 94, textAlign: "right" as const, fontSize: 12.5, fontWeight: 500, color: "#cdd6e2", fontVariantNumeric: "tabular-nums" }}>
                                  {formatEur(expo)}
                                </span>
                              )}
                            </button>

                            {isOpen && (
                              <div style={{ padding: "2px 18px 20px 38px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.04fr) minmax(0,1fr)", gap: 26, alignItems: "start" }}>

                                  {/* Zone A: reconstruction comptable */}
                                  <div>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                                      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#6a7587", fontFamily: "monospace" }}>
                                        Reconstruction comptable
                                      </span>
                                    </div>
                                    <div style={{ fontSize: 11, color: FAINT, marginBottom: 9 }}>{siloView.statement.titre}</div>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                      <tbody>
                                        {siloView.statement.rows.map((row) => {
                                          const isFlagged = !!row.flaggedBy;
                                          const rowSev = row.severity ? SEV[row.severity] : null;
                                          const isLinked = isFlagged && row.flaggedBy === selId;
                                          return (
                                            <tr
                                              key={row.id}
                                              onClick={() => isFlagged && setSelId(row.flaggedBy ?? null)}
                                              style={{
                                                cursor: isFlagged ? "pointer" : "default",
                                                background: isLinked ? `${rowSev?.hex ?? "#ef4444"}14` : isFlagged ? "rgba(255,255,255,0.02)" : "transparent",
                                                borderLeft: `2px solid ${rowSev ? rowSev.hex : "transparent"}`,
                                                transition: "background .15s",
                                              }}
                                            >
                                              <td style={{ padding: "8px 11px", verticalAlign: "baseline" }}>
                                                <span style={{
                                                  color: row.kind === "total" ? TEXT : row.kind === "sous-total" ? "#cdd6e2" : isFlagged && rowSev ? rowSev.hex : "#9aa6b6",
                                                  fontWeight: row.kind === "total" ? 700 : row.kind === "sous-total" ? 600 : 400,
                                                }}>
                                                  {row.label}
                                                </span>
                                                {row.compte && (
                                                  <code style={{ marginLeft: 7, fontSize: 10, color: FAINT, fontFamily: "monospace" }}>{row.compte}</code>
                                                )}
                                              </td>
                                              <td style={{ padding: "8px 11px", textAlign: "right" as const, fontVariantNumeric: "tabular-nums", color: row.kind === "total" ? TEXT : "#9aa6b6", fontWeight: row.kind === "total" ? 700 : 400 }}>
                                                {formatEur(row.valeur)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Zone B: constat cards */}
                                  <div>
                                    <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "#6a7587", fontFamily: "monospace", marginBottom: 9 }}>
                                      Constats ({hasFilters ? `${filtered.length}/` : ""}{findings.length})
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                                      {(hasFilters ? filtered : findings).map((f) => {
                                        const fSev = SEV[f.severity];
                                        const fFam = FAM[f.family];
                                        const isSelected = f.id === selId;
                                        const dec = decisions[f.id];
                                        return (
                                          <div
                                            key={f.id}
                                            style={{
                                              padding: "10px 13px", borderRadius: 9,
                                              border: `1px solid ${isSelected ? fSev.hex + "50" : BORDER}`,
                                              background: isSelected ? fSev.bg : "rgba(13,18,28,0.7)",
                                              transition: "border-color .15s, background .15s",
                                            }}
                                          >
                                            <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                                              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3, paddingTop: 2 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: fSev.hex, flexShrink: 0 }} />
                                                <span style={{ fontFamily: "monospace", fontSize: 11, color: fFam.hex, lineHeight: 1 }}>{fFam.mark}</span>
                                              </div>
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, lineHeight: 1.35 }}>{f.titre}</div>
                                                {dec && (
                                                  <span style={{ display: "inline-block", marginTop: 4, fontSize: 9.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: dec === "valide" ? "#22c55e" : dec === "accepte" ? ACCENT : MUTED, border: `1px solid ${dec === "valide" ? "rgba(34,197,94,0.3)" : dec === "accepte" ? "rgba(91,157,255,0.3)" : "#333"}`, padding: "2px 7px", borderRadius: 5 }}>
                                                    {dec === "valide" ? "Validé" : dec === "accepte" ? "Accepté" : "Écarté"}
                                                  </span>
                                                )}
                                              </div>
                                              <button
                                                onClick={() => setSelId(isSelected ? null : f.id)}
                                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: isSelected ? fSev.hex : ACCENT, background: "none", border: "none", cursor: "pointer", padding: "2px 0", whiteSpace: "nowrap", flexShrink: 0 }}
                                              >
                                                {isSelected ? "Fermer" : "Analyser"}
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                                  <path d={isSelected ? "M18 6 6 18M6 6l12 12" : "m9 18 6-6-6-6"} />
                                                </svg>
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {(hasFilters ? filtered : findings).length === 0 && (
                                        <div style={{ padding: "20px 0", textAlign: "center" as const, fontSize: 12, color: FAINT }}>
                                          Aucun constat correspondant aux filtres.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {groups.length === 0 && (
                  <div style={{ padding: "48px 0", textAlign: "center" as const, fontSize: 13, color: FAINT }}>
                    Aucun silo à afficher.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky rail */}
          <aside style={{ position: "sticky", top: 16, width: 406, maxHeight: "calc(100vh - 90px)", overflowY: "auto", flexShrink: 0, alignSelf: "flex-start" }}>
            {selectedFinding ? (
              <div
                key={selectedFinding.id}
                style={{ padding: 18, borderRadius: 14, border: "1px solid #253045", background: "#0c1220" }}
              >
                <RailPanel finding={selectedFinding} decisions={decisions} onDecision={handleDecision} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", minHeight: 280, padding: 24, borderRadius: 14, border: `1px dashed ${BORDER}`, textAlign: "center" as const }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="1.5" style={{ marginBottom: 12 }}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                  <path d="M11 8v3M11 14h.01" />
                </svg>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#4a566a", marginBottom: 6 }}>Aucun constat sélectionné</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: FAINT }}>
                  Cliquez sur <em style={{ color: "#7b8798" }}>Analyser</em> dans un constat<br />pour ouvrir le panneau de revue.
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

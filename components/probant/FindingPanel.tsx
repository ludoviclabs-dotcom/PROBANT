"use client";

import { forwardRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  FileQuestion,
  ScrollText,
} from "lucide-react";
import type { Finding, Mesure, StatutRevue } from "@/lib/canonical-model";
import { cn, formatEUR, formatPct } from "@/lib/utils";
import { SeverityBadge, FamilyBadge } from "./Badges";
import { SEVERITY_STYLE } from "./severity";

function fmtMesure(m: Mesure, v: number): string {
  switch (m.unite) {
    case "EUR":
      return formatEUR(v);
    case "%":
      return formatPct(v);
    case "jours":
      return `${v.toFixed(0)} j`;
    default:
      return v.toLocaleString("fr-FR");
  }
}

const STATUT_LABEL: Record<StatutRevue, string> = {
  en_attente: "En attente",
  valide: "Validé",
  ecarte: "Écarté",
};

export const FindingPanel = forwardRef<
  HTMLDivElement,
  { finding: Finding; onDecision?: (id: string, statut: StatutRevue) => void }
>(function FindingPanel({ finding: f, onDecision }, ref) {
  const [statut, setStatut] = useState<StatutRevue>(f.statutRevue);
  const [showPreuve, setShowPreuve] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const s = SEVERITY_STYLE[f.severity];

  const ecart = f.mesure.constate - f.mesure.seuil;

  function decide(next: StatutRevue) {
    setStatut(next);
    onDecision?.(f.id, next);
  }

  return (
    <div
      ref={ref}
      data-finding-id={f.id}
      className="rounded-lg border bg-[var(--pb-surface-2)] shadow-sm"
      style={{ borderColor: `${s.hex}55` }}
    >
      {/* Bandeau de gravité */}
      <div className="h-1 rounded-t-lg" style={{ backgroundColor: s.hex }} />

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={f.severity} />
          <FamilyBadge family={f.family} />
          {statut !== "en_attente" && (
            <span
              className={cn(
                "ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold",
                statut === "valide"
                  ? "bg-[#0f2417] text-[#22c55e]"
                  : "bg-[#2a1416] text-[#ef4444]",
              )}
            >
              {STATUT_LABEL[statut]}
            </span>
          )}
        </div>

        <h4 className="text-sm font-semibold text-[var(--pb-text)]">{f.titre}</h4>
        <p className="text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
          {f.constat}
        </p>

        {/* Constaté | Seuil | Écart */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--pb-border)] bg-[var(--pb-border)]">
          <div className="bg-[var(--pb-surface)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Constaté
            </div>
            <div className="tnum mt-0.5 text-sm font-semibold" style={{ color: s.hex }}>
              {fmtMesure(f.mesure, f.mesure.constate)}
            </div>
          </div>
          <div className="bg-[var(--pb-surface)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Seuil / attendu
            </div>
            <div className="tnum mt-0.5 text-sm font-semibold text-[var(--pb-text)]">
              {fmtMesure(f.mesure, f.mesure.seuil)}
            </div>
          </div>
          <div className="bg-[var(--pb-surface)] p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Écart
            </div>
            <div className="tnum mt-0.5 text-sm font-semibold text-[var(--pb-text)]">
              {ecart > 0 ? "+" : ""}
              {fmtMesure(f.mesure, ecart)}
            </div>
          </div>
        </div>

        {/* Source normative */}
        <button
          onClick={() => setShowSource((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface)] px-2.5 py-2 text-left text-xs transition-colors hover:border-[var(--pb-border-strong)]"
        >
          <ScrollText className="h-3.5 w-3.5 shrink-0 text-[var(--pb-accent)]" />
          <span className="font-semibold text-[var(--pb-accent)]">{f.source.ref}</span>
          <span className="text-[var(--pb-text-faint)]">
            · v.{f.source.effectiveDate}
          </span>
          {showSource ? (
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-[var(--pb-text-faint)]" />
          ) : (
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-[var(--pb-text-faint)]" />
          )}
        </button>
        {showSource && (
          <blockquote className="border-l-2 border-[var(--pb-accent)] bg-[var(--pb-surface)] px-3 py-2 text-[12px] italic leading-relaxed text-[var(--pb-text-muted)]">
            « {f.source.citation} »
          </blockquote>
        )}

        {/* Explication */}
        <p className="text-[12px] leading-relaxed text-[var(--pb-text-muted)]">
          {f.explication}
        </p>

        {/* Faisceau d'indices */}
        {f.faisceau.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {f.faisceau.map((sig) => (
              <span
                key={sig}
                className="rounded-full border border-[var(--pb-border-strong)] bg-[var(--pb-surface)] px-2 py-0.5 text-[11px] text-[var(--pb-text-muted)]"
              >
                {sig}
              </span>
            ))}
          </div>
        )}

        {/* Comptes concernés */}
        {f.comptesConcernes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--pb-text-faint)]">
            <span>Comptes :</span>
            {f.comptesConcernes.map((c) => (
              <code
                key={c}
                className="tnum rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[var(--pb-text-muted)]"
              >
                {c}
              </code>
            ))}
          </div>
        )}

        {/* Chaîne de preuve */}
        <button
          onClick={() => setShowPreuve((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]"
        >
          {showPreuve ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Chaîne de preuve ({f.preuve.length} étapes)
        </button>
        {showPreuve && (
          <ol className="space-y-1.5 border-l border-[var(--pb-border)] pl-3">
            {f.preuve.map((p, i) => (
              <li key={i} className="text-[11px] leading-relaxed">
                <span className="font-semibold text-[var(--pb-text-muted)]">
                  {p.etape} :
                </span>{" "}
                <span className="text-[var(--pb-text-faint)]">{p.detail}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Workflow humain */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => decide("valide")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              statut === "valide"
                ? "border-[#22c55e] bg-[#0f2417] text-[#22c55e]"
                : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[#22c55e] hover:text-[#22c55e]",
            )}
          >
            <Check className="h-3.5 w-3.5" /> Valider
          </button>
          <button
            onClick={() => decide("ecarte")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              statut === "ecarte"
                ? "border-[#ef4444] bg-[#2a1416] text-[#ef4444]"
                : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[#ef4444] hover:text-[#ef4444]",
            )}
          >
            <X className="h-3.5 w-3.5" /> Écarter
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pb-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--pb-text-muted)] transition-colors hover:border-[var(--pb-accent)] hover:text-[var(--pb-accent)]">
            <FileQuestion className="h-3.5 w-3.5" /> Justificatif
          </button>
        </div>
      </div>
    </div>
  );
});

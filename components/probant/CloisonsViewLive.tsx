"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Info } from "lucide-react";
import type { Finding, CloisonId } from "@/lib/canonical-model";
import { CLOISONS, siloById } from "@/lib/canonical-model";
import { SeverityBadge } from "./Badges";
import { cn } from "@/lib/utils";

export const LIVE_FINDINGS_KEY = "probant:live-findings";

function groupByCloison(findings: Finding[]): Map<CloisonId, Finding[]> {
  const map = new Map<CloisonId, Finding[]>();
  for (const f of findings) {
    const arr = map.get(f.cloison) ?? [];
    arr.push(f);
    map.set(f.cloison, arr);
  }
  return map;
}

/* ── composant interne (reçoit des findings valides) ── */
function LiveInner({ findings }: { findings: Finding[] }) {
  const byCloison = groupByCloison(findings);
  const cloisonsPresentes = CLOISONS.filter((c) => byCloison.has(c.id));
  const [active, setActive] = useState<CloisonId>(
    cloisonsPresentes[0]?.id ?? "bilan-actif",
  );
  const activeFindings = byCloison.get(active) ?? [];

  return (
    <div className="space-y-4">
      {/* Bandeau FEC réel */}
      <div className="flex items-center gap-3 rounded-xl border border-[#3b82f6]/30 bg-[#0a1628] px-4 py-3">
        <Info className="h-4 w-4 shrink-0 text-[#3b82f6]" />
        <div className="min-w-0 text-[12px]">
          <span className="font-semibold text-[#3b82f6]">Analyse de votre FEC réel</span>
          <span className="text-[var(--pb-text-muted)]">
            {" "}— {findings.length} constat(s) détecté(s). Les états reconstitués
            ne sont pas disponibles en mode FEC direct.{" "}
          </span>
          <Link href="/dashboard/depot" className="text-[var(--pb-accent)] hover:underline">
            Déposer un autre fichier
          </Link>
        </div>
      </div>

      {/* Onglets cloisons */}
      <div className="flex flex-wrap gap-1.5">
        {cloisonsPresentes.map((c) => {
          const n = (byCloison.get(c.id) ?? []).length;
          const isActive = c.id === active;
          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors",
                isActive
                  ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/12 font-semibold text-[var(--pb-text)]"
                  : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]",
              )}
            >
              {c.label}
              {n > 0 && (
                <span
                  className={cn(
                    "tnum rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                    isActive
                      ? "bg-[var(--pb-accent)]/20 text-[var(--pb-accent)]"
                      : "bg-[var(--pb-surface-3)] text-[var(--pb-text-muted)]",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Constats de la cloison active */}
      <div className="space-y-3">
        {activeFindings.map((f) => {
          const silo = siloById(f.siloId);
          const isCritique = f.severity === "bloquant" || f.severity === "majeur";
          return (
            <div
              key={f.id}
              className={cn(
                "rounded-xl border p-4",
                isCritique
                  ? "border-[#ef4444]/30 bg-[#1a0c0c]"
                  : "border-[var(--pb-border)] bg-[var(--pb-surface)]",
              )}
            >
              <div className="flex items-start gap-3">
                <SeverityBadge severity={f.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--pb-text)]">
                      {f.titre}
                    </span>
                    {silo && (
                      <span className="shrink-0 rounded border border-[var(--pb-border)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-faint)]">
                        {silo.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--pb-text-muted)]">{f.constat}</p>
                  <div className="mt-2 font-mono text-[11px] text-[var(--pb-accent)]">
                    {f.source.ref}
                  </div>
                  {f.faisceau.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {f.faisceau.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] text-[var(--pb-text-faint)]"
                        >
                          <span className="mt-0.5 shrink-0">·</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {activeFindings.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--pb-border)] p-8 text-center text-sm text-[var(--pb-text-faint)]">
            Aucun constat dans cette cloison.
          </div>
        )}
      </div>

      <div className="text-[11px] text-[var(--pb-text-faint)]">
        Résultats en mémoire de session uniquement — non persistés.
      </div>
    </div>
  );
}

/* ── shell : lit sessionStorage puis délègue à LiveInner ── */
export function CloisonsViewLive() {
  const [findings, setFindings] = useState<Finding[] | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LIVE_FINDINGS_KEY);
      setFindings(raw ? (JSON.parse(raw) as Finding[]) : []);
    } catch {
      setFindings([]);
    }
  }, []);

  if (findings === null) {
    return (
      <div className="flex items-center gap-2 p-8 text-[13px] text-[var(--pb-text-faint)]">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--pb-accent)] border-t-transparent" />
        Chargement des constats…
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-[#22c55e]/30 bg-[#0a2214] p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#22c55e]" />
          <div>
            <div className="text-sm font-semibold text-[#22c55e]">
              Aucun constat analytique
            </div>
            <div className="text-[12px] text-[var(--pb-text-muted)]">
              Le moteur de règles n'a détecté aucune anomalie significative sur ce FEC.
            </div>
          </div>
        </div>
        <div className="text-[12px] text-[var(--pb-text-faint)]">
          <Link href="/dashboard/depot" className="text-[var(--pb-accent)] hover:underline">
            ← Retour au dépôt
          </Link>
        </div>
      </div>
    );
  }

  return <LiveInner findings={findings} />;
}

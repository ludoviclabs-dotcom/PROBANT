"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { RISK_AXES, type RiskAxisId } from "@/lib/risk-mapping";

/**
 * Panneau autonome d'historique des ajustements de jugement d'un cycle.
 *
 * Source : `GET /api/adjustments/history` (store SIMULÉ en mémoire côté
 * serveur, voir `lib/server-store/adjustments-store.ts` — perdu au
 * redémarrage du process Next.js, aucune vraie base de données). Chaque
 * entrée trace une modification passée (valeur précédente → nouvelle valeur),
 * jamais l'état courant : c'est un journal d'audit-trail simulé.
 *
 * N'importe volontairement PAS `CycleRiskPanel` (évite tout import circulaire) :
 * composant autonome, à monter depuis `CycleRiskPanel` par un futur agent.
 *
 * Style aligné sur `CycleRiskPanel` (classes Tailwind + variables `--pb-*`,
 * tailles de police ~11px).
 */

/** Seuls les axes probabilité/détectabilité sont ajustables (voir RISK_AXES). */
const AXIS_LABEL: Record<string, string> = Object.fromEntries(
  RISK_AXES.map((axis) => [axis.id, axis.short]),
);

const AXIS_FULL_LABEL: Record<string, string> = Object.fromEntries(
  RISK_AXES.map((axis) => [axis.id, axis.label]),
);

interface AdjustmentHistoryEntry {
  id: string;
  adjustmentId: string;
  userId: string;
  cycleSlug: string;
  axe: RiskAxisId;
  previousValue: number;
  newValue: number;
  commentaire?: string;
  changedAt: string;
}

/** Formate un cran signé pour affichage : -2, -1, 0, +1, +2. */
function formatStep(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

/** Formate une date ISO en date/heure locale fr-FR, tolérant les valeurs invalides. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("fr-FR");
}

export function AdjustmentHistoryPanel({ cycleSlug }: { cycleSlug: string }) {
  const [entries, setEntries] = useState<AdjustmentHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);

    (async () => {
      try {
        const params = new URLSearchParams({
          dossierId: "demo-dossier",
          cycleSlug,
        });
        const res = await fetch(`/api/adjustments/history?${params.toString()}`);
        if (!res.ok) {
          if (!cancelled) setEntries([]);
          return;
        }
        const data: unknown = await res.json();
        const history =
          data && typeof data === "object" && Array.isArray((data as { history?: unknown }).history)
            ? ((data as { history: AdjustmentHistoryEntry[] }).history)
            : [];
        if (!cancelled) setEntries(history);
      } catch {
        if (!cancelled) setEntries([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cycleSlug]);

  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <History className="h-3.5 w-3.5 text-[var(--pb-text-faint)]" />
        <h4 className="text-[12px] font-semibold text-[var(--pb-text)]">
          Historique des ajustements
        </h4>
        <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-faint)]">
          journal simulé — non durable
        </span>
      </div>

      {entries === null && (
        <p className="mt-3 text-[11px] text-[var(--pb-text-faint)]">Chargement…</p>
      )}

      {entries !== null && entries.length === 0 && (
        <p className="mt-3 text-[11px] text-[var(--pb-text-faint)]">
          Aucun ajustement historisé pour ce cycle.
        </p>
      )}

      {entries !== null && entries.length > 0 && (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface)] p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-md border border-[var(--pb-accent)]/40 bg-[var(--pb-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--pb-accent)]"
                  title={AXIS_FULL_LABEL[entry.axe] ?? entry.axe}
                >
                  {AXIS_LABEL[entry.axe] ?? entry.axe}
                </span>
                <span className="tnum text-[11px] text-[var(--pb-text-muted)]">
                  {formatStep(entry.previousValue)} → {formatStep(entry.newValue)}
                </span>
              </div>
              {entry.commentaire && (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
                  {entry.commentaire}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--pb-text-faint)]">
                <span>{formatDate(entry.changedAt)}</span>
                <span>·</span>
                <span>Auditeur (session demo)</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

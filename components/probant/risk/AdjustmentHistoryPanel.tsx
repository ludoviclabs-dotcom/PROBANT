"use client";

import { useEffect, useState } from "react";
import { RISK_AXES, type RiskAxisId } from "@/lib/risk-mapping";
import s from "./risk.module.css";

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
 * Charte « instruments » : liste à filets continus, sans carte ni pastille de couleur ; l'axe est nommé en
 * toutes lettres et le mouvement d'ajustement est en chiffres mono.
 */

/** Seuls les axes probabilité/détectabilité sont ajustables (voir RISK_AXES). */
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
    <div className={s.history}>
      <h4 className={s.subHead}>
        Historique des ajustements
        <span className={s.subNote}>journal simulé — non durable</span>
      </h4>

      {entries === null && <p className={s.emptyText}>Chargement…</p>}

      {entries !== null && entries.length === 0 && <p className={s.emptyText}>Aucun ajustement historisé pour ce cycle.</p>}

      {entries !== null && entries.length > 0 && (
        <ul className={s.historyList}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className={s.axisHead}>
                <span>{AXIS_FULL_LABEL[entry.axe] ?? entry.axe}</span>
                <span className={s.historyMove}>
                  {formatStep(entry.previousValue)} → {formatStep(entry.newValue)}
                </span>
              </div>
              {entry.commentaire && <p className={s.riskDesc}>{entry.commentaire}</p>}
              <div className={s.historyMeta}>
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

"use client";

import { useMemo, useState } from "react";
import type { CloisonId, SiloView, StatutRevue } from "@/lib/canonical-model";
import { CLOISONS, siloById } from "@/lib/canonical-model";
import { cn } from "@/lib/utils";
import { AccountingSilo } from "./AccountingSilo";

export function CloisonsView({ silos }: { silos: SiloView[] }) {
  const [decisions, setDecisions] = useState<Record<string, StatutRevue>>({});

  const byCloison = useMemo(() => {
    const map = new Map<CloisonId, SiloView[]>();
    for (const view of silos) {
      const cloison = siloById(view.siloId)?.cloison;
      if (!cloison) continue;
      const arr = map.get(cloison) ?? [];
      arr.push(view);
      map.set(cloison, arr);
    }
    return map;
  }, [silos]);

  const cloisonsPresentes = CLOISONS.filter((c) => byCloison.has(c.id));
  const [active, setActive] = useState<CloisonId>(
    cloisonsPresentes[0]?.id ?? "bilan-actif",
  );

  const activeSilos = byCloison.get(active) ?? [];

  function countFor(cloison: CloisonId): number {
    return (byCloison.get(cloison) ?? []).reduce(
      (n, s) => n + s.findings.length,
      0,
    );
  }

  return (
    <div className="space-y-4">
      {/* Onglets de cloison */}
      <div className="flex flex-wrap gap-1.5">
        {cloisonsPresentes.map((c) => {
          const isActive = c.id === active;
          const n = countFor(c.id);
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

      {/* Description de la cloison active */}
      {(() => {
        const c = CLOISONS.find((x) => x.id === active);
        return c ? (
          <p className="text-[12px] text-[var(--pb-text-faint)]">{c.description}</p>
        ) : null;
      })()}

      {/* Silos */}
      <div className="space-y-4">
        {activeSilos.map((view) => (
          <AccountingSilo
            key={view.siloId}
            view={view}
            onDecision={(id, statut) =>
              setDecisions((prev) => ({ ...prev, [id]: statut }))
            }
          />
        ))}
        {activeSilos.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--pb-border)] p-8 text-center text-sm text-[var(--pb-text-faint)]">
            Aucun constat dans cette cloison.
          </div>
        )}
      </div>

      {/* Récap décisions (sessions) */}
      {Object.keys(decisions).length > 0 && (
        <div className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-4 py-2 text-[11px] text-[var(--pb-text-muted)]">
          <span className="tnum font-semibold text-[var(--pb-text)]">
            {Object.values(decisions).filter((s) => s === "valide").length}
          </span>{" "}
          validé(s) ·{" "}
          <span className="tnum font-semibold text-[var(--pb-text)]">
            {Object.values(decisions).filter((s) => s === "ecarte").length}
          </span>{" "}
          écarté(s) cette session (non persisté en mode démo).
        </div>
      )}
    </div>
  );
}

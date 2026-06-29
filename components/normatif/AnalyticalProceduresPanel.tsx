import type { AnalyticalProcedure } from "@/lib/audit-cycles/types";

export function AnalyticalProceduresPanel({
  procedures,
}: {
  procedures: AnalyticalProcedure[];
}) {
  if (!procedures?.length) {
    return (
      <p className="text-[12px] text-[var(--pb-text-faint)]">
        Aucune procédure analytique renseignée.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      {procedures.map((p, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3"
        >
          <h4 className="text-[12px] font-semibold text-[var(--pb-text)]">{p.name}</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
            <span className="text-[var(--pb-text-faint)]">Objectif : </span>
            {p.objective}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
            <span className="text-[var(--pb-text-faint)]">Méthode : </span>
            {p.method}
          </p>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            <p className="text-[11px] text-[var(--pb-text-muted)]">
              <span className="text-[var(--pb-text-faint)]">Variation attendue : </span>
              {p.expectedVariation}
            </p>
            <p className="text-[11px] text-[#f97316]">
              <span className="text-[var(--pb-text-faint)]">Déclencheur : </span>
              {p.anomalyTrigger}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {p.benchmark?.map((b, j) => (
              <span
                key={`b-${j}`}
                className="rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-muted)]"
              >
                {b}
              </span>
            ))}
            {p.assertions?.map((a, j) => (
              <span
                key={`a-${j}`}
                className="rounded-md border border-[var(--pb-accent)]/30 bg-[var(--pb-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--pb-accent)]"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

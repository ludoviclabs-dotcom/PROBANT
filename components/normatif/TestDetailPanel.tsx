import type { DetailTest } from "@/lib/audit-cycles/types";

export function TestDetailPanel({ tests }: { tests: DetailTest[] }) {
  if (!tests?.length) {
    return <p className="text-[12px] text-[var(--pb-text-faint)]">Aucun test de détail renseigné.</p>;
  }
  return (
    <div className="space-y-2.5">
      {tests.map((t, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3"
        >
          <h4 className="text-[12px] font-semibold text-[var(--pb-text)]">{t.name}</h4>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-4">
            <Field label="Nature" value={t.nature} />
            <Field label="Étendue" value={t.extent} />
            <Field label="Calendrier" value={t.timing} />
            <Field label="Échantillonnage" value={t.samplingMethod} />
          </div>
          {t.evidenceRequired?.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--pb-text-faint)]">
                Éléments probants attendus
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {t.evidenceRequired.map((e, j) => (
                  <span
                    key={j}
                    className="rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-muted)]"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {t.assertions?.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-[var(--pb-text-faint)]">Assertions :</span>
              {t.assertions.map((a, j) => (
                <span
                  key={j}
                  className="rounded-md border border-[var(--pb-accent)]/30 bg-[var(--pb-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--pb-accent)]"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
        {label}
      </span>
      <span className="text-[var(--pb-text-muted)]">{value}</span>
    </div>
  );
}

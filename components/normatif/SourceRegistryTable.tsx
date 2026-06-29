import Link from "next/link";
import { ExternalLink, AlertTriangle } from "lucide-react";
import type { NormativeSource } from "@/lib/audit-cycles/types";
import { NormativeStatusBadge } from "./NormativeStatusBadge";

export function SourceRegistryTable({
  sources,
  cyclesBySource,
}: {
  sources: NormativeSource[];
  /** slug source -> nombre de cycles qui la référencent (optionnel). */
  cyclesBySource?: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--pb-border)]">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[var(--pb-surface-3)] text-left text-[var(--pb-text-muted)]">
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Source</th>
            <th className="px-3 py-2 font-semibold">Statut</th>
            {cyclesBySource && <th className="px-3 py-2 font-semibold">Cycles</th>}
            <th className="px-3 py-2 font-semibold">Lien</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr
              key={s.id}
              className="border-t border-[var(--pb-border)] align-top text-[var(--pb-text-muted)]"
            >
              <td className="whitespace-nowrap px-3 py-2">
                <span className="rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--pb-text-faint)]">
                  {s.type}
                </span>
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/normatif/sources/${s.id}`}
                  className="font-medium text-[var(--pb-text)] hover:text-[var(--pb-accent)]"
                >
                  {s.label}
                </Link>
                {s.summary && (
                  <p className="mt-0.5 max-w-xl text-[10px] text-[var(--pb-text-faint)]">
                    {s.summary}
                  </p>
                )}
              </td>
              <td className="px-3 py-2">
                <NormativeStatusBadge status={s.status} short />
              </td>
              {cyclesBySource && (
                <td className="tnum px-3 py-2 text-[var(--pb-text-muted)]">
                  {cyclesBySource[s.id] ?? 0}
                </td>
              )}
              <td className="px-3 py-2">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--pb-accent)] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Texte
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-[#eab308]"
                    title="URL manquante — à compléter"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    URL manquante
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

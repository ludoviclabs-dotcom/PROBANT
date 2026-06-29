"use client";

import { AlertTriangle } from "lucide-react";
import type { AnnotatedDocument, DocSection, StatementRow } from "@/lib/canonical-model";
import { SEVERITY_STYLE } from "@/components/probant/severity";
import { cn, formatEUR, formatPct } from "@/lib/utils";
import { FlagPill } from "./FlagPill";
import { matchesFilter, type SeverityFilter } from "./types";

function rowValue(row: StatementRow, unite: "EUR" | "%"): string {
  return unite === "EUR"
    ? formatEUR(row.valeur, { sign: true })
    : formatPct(row.valeur);
}

function SectionCard({
  section,
  filter,
  onSelectFinding,
}: {
  section: DocSection;
  filter: SeverityFilter;
  onSelectFinding: (id: string) => void;
}) {
  const hasBloquant = section.rows.some((r) => r.severity === "bloquant");

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)]">
      <div className="flex items-center gap-2 border-b border-[var(--pb-border)] px-3 py-2">
        {section.cote && (
          <span className="rounded border border-[var(--pb-border)] bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--pb-text-faint)]">
            {section.cote}
          </span>
        )}
        <span className="text-xs font-semibold text-[var(--pb-text)]">
          {section.label}
        </span>
        {hasBloquant && (
          <span
            title="Contient un constat bloquant"
            className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#ef4444] text-[10px] font-bold text-white"
            aria-label="Contient un constat bloquant"
          >
            !
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {section.rows.map((row) => {
            const flagged = Boolean(row.flaggedBy && row.severity);
            const sev = row.severity ? SEVERITY_STYLE[row.severity] : null;
            const match = matchesFilter(filter, row.severity ?? null);
            return (
              <tr
                key={row.id}
                onClick={
                  flagged && row.flaggedBy
                    ? () => onSelectFinding(row.flaggedBy!)
                    : undefined
                }
                className={cn(
                  "border-b border-[var(--pb-border)]/60 transition-opacity last:border-0",
                  row.kind === "total" && "font-semibold",
                  flagged && "cursor-pointer",
                  !match && "opacity-25",
                )}
                style={
                  flagged && sev
                    ? {
                        backgroundColor: `${sev.hex}14`,
                        borderLeft: `3px solid ${sev.hex}`,
                      }
                    : { borderLeft: "3px solid transparent" }
                }
              >
                <td className="px-3 py-2 align-top">
                  <div
                    className={cn(
                      row.kind === "ligne"
                        ? "text-[var(--pb-text-muted)]"
                        : "text-[var(--pb-text)]",
                    )}
                  >
                    {row.label}
                  </div>
                  {row.compte && (
                    <code className="tnum text-[10px] text-[var(--pb-text-faint)]">
                      {row.compte}
                    </code>
                  )}
                </td>
                <td
                  className={cn(
                    "tnum whitespace-nowrap px-3 py-2 text-right align-top",
                    flagged && sev ? "font-semibold" : "text-[var(--pb-text)]",
                  )}
                  style={flagged && sev ? { color: sev.hex } : undefined}
                >
                  {rowValue(row, section.unite)}
                </td>
                <td className="w-px px-2 py-2 align-top">
                  {flagged && row.severity && row.flaggedBy && (
                    <FlagPill
                      severity={row.severity}
                      label={SEVERITY_STYLE[row.severity].label}
                      onClick={() => onSelectFinding(row.flaggedBy!)}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Rendu d'un état reconstruit. Le Bilan s'affiche en deux colonnes
 * Actif / Passif ; le Compte de résultat et le Flux en grille fluide.
 */
export function StatementLayout({
  doc,
  filter,
  onSelectFinding,
}: {
  doc: AnnotatedDocument;
  filter: SeverityFilter;
  onSelectFinding: (id: string) => void;
}) {
  const sections = doc.sections ?? [];

  if (doc.type === "Bilan") {
    const actif = sections.filter((s) => s.cote === "actif");
    const passif = sections.filter((s) => s.cote !== "actif");
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--pb-text-faint)]">
            Actif
          </h4>
          {actif.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              filter={filter}
              onSelectFinding={onSelectFinding}
            />
          ))}
          {actif.length === 0 && (
            <p className="px-1 text-[12px] text-[var(--pb-text-faint)]">
              Aucun poste d'actif reconstruit.
            </p>
          )}
        </div>
        <div className="space-y-3">
          <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--pb-text-faint)]">
            Passif
          </h4>
          {passif.map((s) => (
            <SectionCard
              key={s.id}
              section={s}
              filter={filter}
              onSelectFinding={onSelectFinding}
            />
          ))}
          {passif.length === 0 && (
            <p className="px-1 text-[12px] text-[var(--pb-text-faint)]">
              Aucun poste de passif reconstruit.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sections.map((s) => (
        <SectionCard
          key={s.id}
          section={s}
          filter={filter}
          onSelectFinding={onSelectFinding}
        />
      ))}
    </div>
  );
}

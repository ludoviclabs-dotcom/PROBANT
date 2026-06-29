"use client";

import { useMemo } from "react";
import type { Finding, LedgerRow, Severity } from "@/lib/canonical-model";
import { SEVERITY_ORDER, siloById } from "@/lib/canonical-model";
import { SEVERITY_STYLE } from "@/components/probant/severity";
import { cn, formatEUR, formatFecDate } from "@/lib/utils";
import { FlagPill } from "./FlagPill";
import { matchesFilter, type SeverityFilter } from "./types";

/** Au-delà de ce volume, on borne l'affichage (les lignes signalées restent). */
const RENDER_CAP = 2000;

function mostSevere(findings: Finding[]): Finding | null {
  if (findings.length === 0) return null;
  return findings.reduce((best, f) =>
    SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[best.severity] ? f : best,
  );
}

function flagLabel(f: Finding): string {
  return siloById(f.siloId)?.label ?? f.titre;
}

export function FecLedgerTable({
  ledger,
  findings,
  filter,
  onSelectFinding,
}: {
  ledger: LedgerRow[];
  findings: Finding[];
  filter: SeverityFilter;
  onSelectFinding: (id: string) => void;
}) {
  const findingMap = useMemo(() => {
    const m = new Map<string, Finding>();
    for (const f of findings) m.set(f.id, f);
    return m;
  }, [findings]);

  // Sélection affichée : on garde toujours les lignes signalées + un quota de
  // lignes saines, en préservant l'ordre d'origine.
  const { visible, hidden } = useMemo(() => {
    if (ledger.length <= RENDER_CAP) return { visible: ledger, hidden: 0 };
    const flaggedLignes = new Set(
      ledger.filter((r) => r.flagIds.length > 0).map((r) => r.ligne),
    );
    const room = Math.max(0, RENDER_CAP - flaggedLignes.size);
    let sainSeen = 0;
    const keep = new Set<number>();
    for (const r of ledger) {
      if (r.flagIds.length > 0) keep.add(r.ligne);
      else if (sainSeen < room) {
        keep.add(r.ligne);
        sainSeen++;
      }
    }
    const visible = ledger.filter((r) => keep.has(r.ligne));
    return { visible, hidden: ledger.length - visible.length };
  }, [ledger]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--pb-border)]">
      <div className="pb-scroll max-h-[640px] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--pb-surface-2)]">
            <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Journal</th>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Compte</th>
              <th className="px-2 py-2 font-medium">Libellé écriture</th>
              <th className="px-2 py-2 text-right font-medium">Débit</th>
              <th className="px-2 py-2 text-right font-medium">Crédit</th>
              <th className="px-2 py-2 font-medium">Anomalie</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {visible.map((row) => {
              const rowFindings = row.flagIds
                .map((id) => findingMap.get(id))
                .filter((f): f is Finding => Boolean(f));
              const lead = mostSevere(rowFindings);
              const maxSev: Severity | null = lead?.severity ?? null;
              const sev = maxSev ? SEVERITY_STYLE[maxSev] : null;
              const match = matchesFilter(filter, maxSev);

              return (
                <tr
                  key={row.ligne}
                  className={cn(
                    "border-t border-[var(--pb-border)]/60 transition-opacity",
                    !match && "opacity-25",
                    lead && "cursor-pointer",
                  )}
                  onClick={lead ? () => onSelectFinding(lead.id) : undefined}
                  style={
                    sev
                      ? {
                          backgroundColor: `${sev.hex}14`,
                          borderLeft: `3px solid ${sev.hex}`,
                        }
                      : { borderLeft: "3px solid transparent" }
                  }
                >
                  <td className="px-2 py-1.5 text-[var(--pb-text-faint)]">
                    {row.ligne}
                  </td>
                  <td className="px-2 py-1.5 text-[var(--pb-text-muted)]">
                    {row.journalCode}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-[var(--pb-text-muted)]">
                    {formatFecDate(row.ecritureDate)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-[var(--pb-text)]">
                      {row.compteNum}
                    </span>
                    <span className="ml-1 text-[var(--pb-text-faint)]">
                      {row.compteLib}
                    </span>
                  </td>
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-[var(--pb-text-muted)]">
                    {row.ecritureLib}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-[var(--pb-text)]">
                    {row.debit ? formatEUR(row.debit) : ""}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-[var(--pb-text)]">
                    {row.credit ? formatEUR(row.credit) : ""}
                  </td>
                  <td className="px-2 py-1.5">
                    {lead && (
                      <FlagPill
                        severity={lead.severity}
                        label={flagLabel(lead)}
                        extra={rowFindings.length - 1}
                        onClick={() => onSelectFinding(lead.id)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <div className="border-t border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-3 py-2 text-[11px] text-[var(--pb-text-faint)]">
          {hidden.toLocaleString("fr-FR")} ligne(s) saine(s) supplémentaire(s)
          masquée(s) pour l'affichage — toutes les lignes signalées restent
          visibles.
        </div>
      )}
    </div>
  );
}

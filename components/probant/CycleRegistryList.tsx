"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CYCLE_STATUS_LABELS, SEVERITY_ORDER, type CycleRow, type CycleRowStatus } from "@/lib/dossier/cycle-registry";

/**
 * Liste continue des cycles du dossier — projection du registre (lib/dossier/cycle-registry).
 * Chaque ligne dit l'état, l'étendue, les écarts et la prochaine action ; les exclusions,
 * sources et accès secondaires s'ouvrent à la demande dans la ligne. Aucun chiffre n'est
 * recalculé ici : tout vient de `projectCycleRows`.
 */

const TONE: Record<CycleRowStatus, { dot: string; text: string }> = {
  blocked: { dot: "bg-[var(--pb-bloquant)]", text: "text-[var(--pb-bloquant)]" },
  stale: { dot: "bg-[var(--pb-majeur)]", text: "text-[var(--pb-majeur)]" },
  review: { dot: "bg-[var(--pb-accent)]", text: "text-[var(--pb-accent)]" },
  executed: { dot: "bg-[var(--pb-accent)]", text: "text-[var(--pb-text)]" },
  locked: { dot: "bg-[var(--pb-ok)]", text: "text-[var(--pb-ok)]" },
  findings: { dot: "bg-[var(--pb-mineur)]", text: "text-[var(--pb-text)]" },
  available: { dot: "bg-[var(--pb-border-strong)]", text: "text-[var(--pb-text-muted)]" },
  source_required: { dot: "bg-[var(--pb-mineur)]", text: "text-[var(--pb-mineur)]" },
  absent: { dot: "bg-[var(--pb-border)]", text: "text-[var(--pb-text-muted)]" },
};

const SEV_LABEL = { bloquant: "bloquant", majeur: "majeur", mineur: "mineur", informatif: "informatif" } as const;

function Gaps({ row }: { row: CycleRow }) {
  const { exceptions, findings, openBlocking } = row.gaps;
  if (exceptions === null && !findings) return <span className="text-[var(--pb-text-muted)]">—</span>;
  return (
    <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
      {exceptions !== null && (
        <span className="tnum">
          <span className={cn("font-semibold", exceptions > 0 ? "text-[var(--pb-majeur)]" : "text-[var(--pb-text)]")}>{exceptions}</span>
          <span className="text-[var(--pb-text-muted)]"> exception{exceptions > 1 ? "s" : ""}</span>
        </span>
      )}
      {findings && (
        <span className="tnum text-[var(--pb-text-muted)]">
          {SEVERITY_ORDER.filter(s => findings[s] > 0).map((s, i) => (
            <span key={s}>{i > 0 && " · "}<span className="whitespace-nowrap"><span className={cn("font-semibold", s === "bloquant" ? "text-[var(--pb-bloquant)]" : s === "majeur" ? "text-[var(--pb-majeur)]" : "text-[var(--pb-text)]")}>{findings[s]}</span> {SEV_LABEL[s]}</span></span>
          ))}
          {openBlocking > 0 && <span> · <span className="whitespace-nowrap">{openBlocking} ouvert{openBlocking > 1 ? "s" : ""}</span></span>}
        </span>
      )}
    </span>
  );
}

function ActionLink({ row, className }: { row: CycleRow; className?: string }) {
  const { nextAction } = row;
  const base = cn("pbz-focusable inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-medium leading-tight transition-colors", className);
  const tone = nextAction.kind === "source" ? "border-[var(--pb-majeur)]/50 text-[var(--pb-majeur)] hover:bg-[var(--pb-majeur-bg)]"
    : nextAction.kind === "proof" ? "border-[var(--pb-ok)]/40 text-[var(--pb-ok)] hover:bg-[var(--pb-ok-bg)]"
    : nextAction.kind === "declare" ? "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)]"
    : "border-[var(--pb-accent)]/40 text-[var(--pb-accent)] hover:bg-[var(--pb-accent)]/10";
  if (!nextAction.href) return <span className={cn(base, tone, "cursor-default")}>{nextAction.label}</span>;
  if (nextAction.href.startsWith("#")) return <a href={nextAction.href} className={cn(base, tone)}>{nextAction.label}</a>;
  return <Link href={nextAction.href} className={cn(base, tone)}>{nextAction.label}</Link>;
}

export function CycleRegistryList({ rows, title = "Cycles du dossier", lede, synthetic = false, className }: {
  rows: CycleRow[]; title?: string; lede?: string; synthetic?: boolean; className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (cycle: string) => setOpen(o => (o === cycle ? null : cycle));
  return (
    <section aria-labelledby={`${id}-title`} className={cn("rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)]", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--pb-border)] px-4 py-3">
        <h2 id={`${id}-title`} className="text-[15px] font-semibold text-[var(--pb-text)]">{title}</h2>
        <p className="min-w-0 text-[12px] text-[var(--pb-text-muted)]">{lede ?? (synthetic ? "Scénarios de ce navigateur ; aucun constat historique repris." : "État, étendue, écarts et prochaine action par cycle ; exclusions et accès dans la ligne.")}</p>
      </header>
      <div className="relative overflow-x-auto" role="region" aria-label={`${title} — défilement horizontal`} tabIndex={0}>
        <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px]">
          <colgroup><col style={{ width: "17%" }} /><col style={{ width: "19%" }} /><col style={{ width: "26%" }} /><col style={{ width: "16%" }} /><col style={{ width: "22%" }} /></colgroup>
          <thead>
            <tr className="border-b border-[var(--pb-border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--pb-text-muted)]">
              <th scope="col" className="px-4 py-2 text-left">Cycle</th>
              <th scope="col" className="px-3 py-2 text-left">État</th>
              <th scope="col" className="px-3 py-2 text-left">Étendue</th>
              <th scope="col" className="px-3 py-2 text-right">Écarts</th>
              <th scope="col" className="px-4 py-2 text-left">Prochaine action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const expanded = open === row.entry.id;
              const panelId = `${id}-${row.entry.id}`;
              const tone = TONE[row.status];
              return [
                <tr key={row.entry.id} className={cn("border-b border-[var(--pb-border-soft)] align-top transition-colors", expanded ? "bg-[var(--pb-surface-2)]" : "hover:bg-[var(--pb-surface-2)]/60")}>
                  <th scope="row" className="min-w-0 px-4 py-2.5 text-left font-medium text-[var(--pb-text)]">
                    <button type="button" className="pbz-focusable flex max-w-full items-center gap-2 text-left" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(row.entry.id)}>
                      <ChevronRight aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 text-[var(--pb-text-muted)] transition-transform duration-150", expanded && "rotate-90")} />
                      <span className="min-w-0">{row.entry.label}</span>
                    </button>
                  </th>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-medium", tone.text)}>
                      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                      {CYCLE_STATUS_LABELS[row.status]}
                    </span>
                    {row.statusDetail && <span className="mt-0.5 block text-[12px] leading-snug text-[var(--pb-text-muted)]">{row.statusDetail}</span>}
                  </td>
                  <td className="min-w-0 px-3 py-2.5 text-[12.5px] leading-snug text-[var(--pb-text-muted)]">{row.entry.scope}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Gaps row={row} />
                  </td>
                  <td className="min-w-0 px-4 py-2.5">
                    <ActionLink row={row} />
                  </td>
                </tr>,
                <tr key={`${row.entry.id}-panel`} hidden={!expanded} className="border-b border-[var(--pb-border)] bg-[var(--pb-surface-2)]">
                  <td colSpan={5} className="px-4 pb-4 pt-1">
                    {expanded && (
                      <div id={panelId} className="pb-panel-in grid gap-x-8 gap-y-3 text-[13px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <div className="min-w-0 space-y-3">
                          <div>
                            <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--pb-text-muted)]">Exclusions et limites</h3>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--pb-text)]">
                              {row.entry.exclusions.map(e => <li key={e}>{e}</li>)}
                            </ul>
                          </div>
                          <div>
                            <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--pb-text-muted)]">Sources requises</h3>
                            <p className="mt-1 text-[var(--pb-text)]">{row.entry.sources.join(" · ")}</p>
                          </div>
                          {row.runs.length > 0 && (
                            <div>
                              <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--pb-text-muted)]">Feuilles du laboratoire</h3>
                              <ul className="mt-1 space-y-0.5">
                                {row.runs.map(r => (
                                  <li key={r.id} className="tnum text-[var(--pb-text)]">
                                    <a className="pbz-focusable underline decoration-[var(--pb-border-strong)] underline-offset-2 hover:decoration-[var(--pb-accent)]" href={`#wp-${encodeURIComponent(r.id)}`}>{r.id}</a>
                                    <span className="text-[var(--pb-text-muted)]"> · {r.state} · révision {r.revision}{r.stale ? " · périmée" : ""}{r.blocked ? " · bloquée" : ""}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 space-y-3">
                          <div>
                            <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--pb-text-muted)]">Accès</h3>
                            <ul className="mt-1 space-y-1">
                              {row.entry.sheet && <li><Link className="pbz-focusable text-[var(--pb-accent)] underline-offset-2 hover:underline" href={row.entry.sheet.href}>{row.entry.sheet.label}</Link></li>}
                              {row.entry.synthesis && <li><Link className="pbz-focusable text-[var(--pb-accent)] underline-offset-2 hover:underline" href={row.entry.synthesis.href}>{row.entry.synthesis.label}</Link></li>}
                              {row.entry.secondary.map(l => <li key={l.href}><Link className="pbz-focusable text-[var(--pb-text-muted)] underline-offset-2 hover:text-[var(--pb-text)] hover:underline" href={l.href}>{l.label}</Link></li>)}
                              {!row.entry.sheet && !row.entry.synthesis && row.entry.secondary.length === 0 && <li className="text-[var(--pb-text-muted)]">Aucune route : capacité absente.</li>}
                            </ul>
                          </div>
                          <div>
                            <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--pb-text-muted)]">Capacité par mode</h3>
                            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[var(--pb-text)]">
                              {(["historique", "scenario", "persistant"] as const).map(mode => (
                                <div key={mode} className="contents">
                                  <dt className="text-[var(--pb-text-muted)]">{{ historique: "Historique", scenario: "Scénario", persistant: "Local persistant" }[mode]}</dt>
                                  <dd>{{ implemented: "implémentée", configured: "configurée — activation requise", absent: "absente" }[row.entry.capability[mode]]}</dd>
                                </div>
                              ))}
                            </dl>
                            {row.entry.procedures.length > 0 && <p className="tnum mt-1 text-[12px] text-[var(--pb-text-muted)]">Procédures outillées : {row.entry.procedures.join(", ")}</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

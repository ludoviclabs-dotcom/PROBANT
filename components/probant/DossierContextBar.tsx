"use client";

import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { cn } from "@/lib/utils";
import type { CycleRow, SourceState } from "@/lib/dossier/cycle-registry";

/**
 * Bandeau de contexte : dossier, état des sources, action prioritaire — lu avant tout accès
 * secondaire. Les valeurs sont celles du snapshot et de la projection du registre ; rien
 * n'est recalculé. L'identifiant complet du dossier reste dans les détails, pas dans le titre.
 */
export function DossierContextBar({ dossier, sources, priority, engineAction, className }: {
  dossier: { name: string; period: string; id: string };
  sources: SourceState;
  priority: CycleRow | null;
  /** Prochaine action du moteur de Synthèse (verdict), lorsqu'elle existe. */
  engineAction?: string | null;
  className?: string;
}) {
  const cell = "min-w-0 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface)] px-4 py-3";
  const eyebrow = "text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--pb-text-muted)]";
  const wp = sources.workpapers;
  return (
    <div className={cn("grid gap-3 md:grid-cols-3", className)} data-tour="dossier-context">
      <section aria-label="Dossier" className={cell}>
        <div className={eyebrow}>Dossier</div>
        <p className="mt-1 truncate text-[15px] font-semibold text-[var(--pb-text)]" title={dossier.name}>{dossier.name}</p>
        <p className="tnum mt-0.5 text-[13px] text-[var(--pb-text-muted)]">{dossier.period}</p>
        <details className="mt-1 text-[12px] text-[var(--pb-text-muted)]">
          <summary className="pbz-focusable cursor-pointer select-none">Identifiant</summary>
          <code className="mt-1 block break-all rounded bg-[var(--pb-surface-2)] px-2 py-1 text-[12px] text-[var(--pb-text)]">{dossier.id}</code>
        </details>
      </section>
      <section aria-label="État des sources" className={cell}>
        <div className={eyebrow}>État des sources</div>
        <p className="mt-1 text-[15px] font-semibold text-[var(--pb-text)]">{sources.kindLabel}</p>
        <ul className="tnum mt-0.5 space-y-0.5 text-[13px] text-[var(--pb-text-muted)]">
          {sources.fecFingerprint && <li>FEC <span className="text-[var(--pb-text)]">{sources.fecFingerprint.slice(0, 12)}</span> · {sources.documents} document{sources.documents > 1 ? "s" : ""}</li>}
          <li>
            <span className={cn(sources.blockingAdmissibility > 0 ? "font-semibold text-[var(--pb-bloquant)]" : "text-[var(--pb-text)]")}>{sources.blockingAdmissibility}</span> alerte{sources.blockingAdmissibility > 1 ? "s" : ""} bloquante{sources.blockingAdmissibility > 1 ? "s" : ""} d’admissibilité
          </li>
          <li>Feuilles : <span className="text-[var(--pb-text)]">{wp.executed}</span>/{wp.planned} exécutée{wp.executed > 1 ? "s" : ""} · {wp.locked} verrouillée{wp.locked > 1 ? "s" : ""} · {wp.blocked} bloquée{wp.blocked > 1 ? "s" : ""}</li>
        </ul>
      </section>
      <section aria-label="Action prioritaire" className={cn(cell, "border-l-[3px] border-l-[color:var(--pb-accent)]")}>
        <div className={eyebrow}>Action prioritaire</div>
        {priority ? (
          <>
            <p className="mt-1 text-[15px] font-semibold text-[var(--pb-text)]">{priority.entry.label}</p>
            <p className="mt-0.5 text-[13px] text-[var(--pb-text-muted)]">{priority.statusDetail ?? priority.entry.scope}</p>
            {priority.nextAction.href ? (
              priority.nextAction.href.startsWith("#")
                ? <a href={priority.nextAction.href} className="pbz-focusable mt-2 inline-flex max-w-full items-center rounded-md bg-[var(--pb-accent)] px-3 py-1.5 text-[13px] font-semibold text-[#06122a]">{priority.nextAction.label}</a>
                : <Link href={priority.nextAction.href} className="pbz-focusable mt-2 inline-flex max-w-full items-center rounded-md bg-[var(--pb-accent)] px-3 py-1.5 text-[13px] font-semibold text-[#06122a]">{priority.nextAction.label}</Link>
            ) : <p className="mt-2 text-[13px] text-[var(--pb-text)]">{priority.nextAction.label}</p>}
          </>
        ) : (
          <p className="mt-1 text-[13px] text-[var(--pb-text)]">{engineAction ?? "Aucune action possible sans source."}</p>
        )}
        {priority && engineAction && <p className="mt-2 text-[12px] leading-snug text-[var(--pb-text-muted)]">Moteur de Synthèse : {engineAction}</p>}
      </section>
    </div>
  );
}

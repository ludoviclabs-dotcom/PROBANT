"use client";
import { useId, useState, type ReactNode } from "react";
import type { ActionId, ActionState, LeaseWorkspaceView, WorkspaceStep } from "@/lib/ifrs/leases/view-model";
import { STEP_GLYPH, STEP_LABELS } from "./format";
import s from "./ifrs.module.css";

/**
 * Primitives du poste « Locations IFRS 16 » (C02). Elles n'affichent que ce que le serveur établit : aucune ne calcule un montant,
 * aucune n'infère une action d'un libellé. Prévues pour être reprises par L16-04 (poste visuel) et, si IFRS 18 est engagé, par P18-05.
 */
export interface BandItem { label: string; value: ReactNode; fresh?: LeaseWorkspaceView["freshness"] }
/** Bandeau de contexte : toujours identifiable, sans confondre scénario synthétique et dossier réel. */
export function ContextBand({ items, simulation }: { items: BandItem[]; simulation: string | null }) {
  return <>
    {simulation && <p role="note" className={s.simulation}><strong>{simulation}</strong> — données fictives calculées par le moteur ; rien n'est enregistré ni sélectionnable pour une base réelle.</p>}
    <div className={s.band} aria-label="Contexte de la feuille">
      {items.map(i => <span key={i.label} {...(i.fresh ? { "data-fresh": i.fresh } : {})}>{i.label} <strong>{i.value}</strong></span>)}
    </div>
  </>;
}

/**
 * Rail des étapes (L16-04 : Sources → Qualification → Calcul → Retraitements → Revue) : le travail à faire, l'étape courante, les blocages
 * et leur motif ; aucun pourcentage de conformité. Une étape dont la section est à l'écran y mène par un lien d'ancre.
 */
export function StepRail({ steps, anchors = {} }: { steps: WorkspaceStep[]; anchors?: Partial<Record<WorkspaceStep["id"], string>> }) {
  return <nav className={s.rail} aria-label="Étapes du travail">
    <ol>{steps.map((step, i) => <li key={step.id} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
      <span className={s.railGlyph} aria-hidden="true">{STEP_GLYPH[step.state]}</span>
      <span><strong>{i + 1}. {anchors[step.id] ? <a href={"#" + anchors[step.id]}>{step.label}</a> : step.label}</strong>
        <span className={s.railTask}>{step.task}</span>
        <span className={s.railState}>{STEP_LABELS[step.state]}{step.exceptions ? " · " + step.exceptions + " à traiter" : ""}</span>
        {step.reason && <span className={s.railReason}>{step.reason}</span>}</span>
    </li>)}</ol>
  </nav>;
}

/** Barre d'action dérivée du modèle de vue serveur : un bouton refusé reste visible avec son motif écrit, jamais au seul survol. */
export function ActionBar({ actions, labels, busy, onAction }: { actions: Partial<Record<ActionId, ActionState>>; labels: Partial<Record<ActionId, string>>; busy: boolean; onAction(id: ActionId): void }) {
  const entries = (Object.keys(labels) as ActionId[]).filter(id => actions[id]);
  if (!entries.length) return null;
  return <div className={s.actions} role="group" aria-label="Actions de la feuille">
    {entries.map(id => { const a = actions[id]!, reasonId = "l16-action-" + id;
      return <div key={id} className={s.action}>
        <button type="button" className={a.allowed ? s.primary : undefined} disabled={busy || !a.allowed} aria-describedby={a.reason ? reasonId : undefined} onClick={() => onAction(id)}>{labels[id]}</button>
        {a.reason && <span id={reasonId} className={s.actionReason}>{a.reason}</span>}
      </div>; })}
  </div>;
}

/** Cadre de graphique : titre, périmètre, alternative tabulaire toujours disponible ; un état vide dit pourquoi, sans courbe fictive. */
export function ChartFrame({ title, scope, empty, chart, table }: { title: string; scope: string; empty?: string; chart?: ReactNode; table?: ReactNode }) {
  const [tabular, setTabular] = useState(false), id = useId();
  return <figure className={s.frame} aria-labelledby={id}>
    <div className={s.sectionHead}><h3 id={id} style={{ margin: 0 }}>{title}</h3>{chart && table && <button type="button" aria-pressed={tabular} onClick={() => setTabular(t => !t)}>{tabular ? "Voir le graphique" : "Voir le tableau"}</button>}</div>
    <figcaption className={s.muted}>{scope}</figcaption>
    {empty ? <div className={s.frameEmpty} role="status">{empty}</div> : tabular || !chart ? table : chart}
  </figure>;
}

export type NoticeTone = "info" | "warn" | "danger";
/** État de l'écran avec sa cause et, si possible, sa prochaine action (vide, chargement, bloqué, erreur, périmé, indisponible). */
export function StateNotice({ tone = "warn", role = "status", title, children }: { tone?: NoticeTone; role?: "status" | "alert"; title: string; children?: ReactNode }) {
  return <div role={role} className={s.notice} data-tone={tone === "warn" ? undefined : tone}><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}

/** Pagination d'une table : une page montée à la fois ; la page reste en place quand l'inspecteur s'ouvre puis se ferme. */
export function Pager({ page, pages, total, size, label, onPage }: { page: number; pages: number; total: number; size: number; label: string; onPage(page: number): void }) {
  if (pages <= 1) return null;
  return <nav className={s.pager} aria-label={label}>
    <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>Page précédente</button>
    <span>Lignes {page * size + 1}–{Math.min(total, (page + 1) * size)} sur {total} · page {page + 1} / {pages}</span>
    <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Page suivante</button>
  </nav>;
}

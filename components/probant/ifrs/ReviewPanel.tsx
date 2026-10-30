"use client";
import { useState } from "react";
import type { LeaseQualification, SourceProof } from "@/lib/ifrs/leases/qualification";
import type { LeaseReviewSummary } from "@/lib/ifrs/leases/review-summary";
import type { ActionId, ActionState } from "@/lib/ifrs/leases/view-model";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { ADJUSTMENT_LABELS, dateFr, FRAMING_LABELS, moneyFr, plural, rateFr, RESULT_LABELS, STATUS_LABELS } from "./format";
import s from "./ifrs.module.css";

export type ExportFormat = "json" | "html" | "contracts_csv" | "schedules_csv" | "bridges_csv" | "journal_csv";
const FORMATS: { id: ExportFormat; label: string }[] = [{ id: "html", label: "Rapport HTML imprimable" }, { id: "json", label: "JSON canonique" }, { id: "contracts_csv", label: "CSV contrats" },
  { id: "schedules_csv", label: "CSV échéanciers" }, { id: "bridges_csv", label: "CSV ponts" }, { id: "journal_csv", label: "CSV journal" }];
const OUTCOMES = { no_exception_detected: "aucune exception relevée", exceptions_detected: "exceptions relevées", inconclusive: "non concluant" } as const;
const proofLabel = (p: SourceProof) => p.fileName + (p.row ? " · ligne " + p.row : "") + " · " + p.sha256.slice(0, 8);

/**
 * Revue et exports (L16-05) : synthèse de revue établie par le serveur, points bloquants et leur résolution citée, conclusion citée, relecture
 * personnelle nommée, verrouillage, exports diagnostic et revu. Chaque action refusée garde son motif écrit ; aucune n'est déduite d'un libellé.
 * Les pièces citées sont choisies parmi les lignes de sources figées du contrat : le serveur les résout, le navigateur n'en fabrique aucune.
 */
export function ReviewPanel({ run, summary, qualification, actions, busy, demo, onCommand, onExport }: {
  run: WorkpaperRun; summary: LeaseReviewSummary; qualification: LeaseQualification | null; actions: Partial<Record<ActionId, ActionState>>; busy: boolean; demo: boolean;
  onCommand(name: string, fields: Record<string, unknown>): void; onExport(kind: "diagnostic" | "reviewed", format: ExportFormat): void }) {
  const p = summary.portfolio, proofs = (contractId?: string) => {
    const all = (qualification?.contracts ?? []).filter(c => !contractId || c.contractId === contractId).flatMap(c => c.evidence.map(e => ({ ...e, contractId: c.contractId })));
    return [...new Map(all.map(e => [e.documentVersionId + "|" + e.rowId, e])).values()];
  };
  const open = run.notes.filter(n => !n.resolution), resolved = run.notes.filter(n => n.resolution);
  return <section className={s.section} aria-labelledby="l16-review-title">
    <div className={s.sectionHead}><h2 id="l16-review-title">Revue et exports</h2><span className={s.muted}>Version r{run.revision} · v{run.version} · synthèse {summary.version}</span></div>
    <p className={s.summary} aria-label="Synthèse de revue">
      Résultat de contrôle : {p.outcome ? OUTCOMES[p.outcome] : "non calculé"} · {plural(p.population.contracts, "contrat")}, dont {p.population.determined} déterminé(s) et {p.population.undetermined} sans montant déterminé
      {" · "}{p.points.blockingOpen} point(s) bloquant(s) ouvert(s) sur {p.points.total} · conclusion {p.conclusion ? "rédigée" : "absente"}
      {" · "}{p.approval ? (p.approval.kind === "personal" ? "relecture personnelle nommée de " + (p.approval.reviewerName ?? "—") : "revue de " + p.approval.by) + " le " + dateFr(p.approval.at) : "aucune relecture"}
      {" · "}impôt non calculé
    </p>
    <div className={s.scroll} role="region" aria-label="Synthèse de revue par contrat — défilement horizontal au clavier" tabIndex={0}>
      <table className={s.table} style={{ minWidth: 1100 }}>
        <caption>Une ligne par contrat de la population : périmètre, exceptions, jugements cités, cadrage, résultat, retraitement et points. « — » : non renseigné, jamais zéro.</caption>
        <thead><tr><th scope="col">Contrat</th><th scope="col">Périmètre et exceptions</th><th scope="col">Durée et jugement</th><th scope="col">Taux et justification</th><th scope="col">Cadrage PCG</th>
          <th scope="col">Résultat</th><th scope="col">Retraitement</th><th scope="col">Points</th></tr></thead>
        <tbody>{summary.contracts.map(c => <tr key={c.contractId}>
          <th scope="row" className={s.rowHead}><span className={s.mono}>{c.contractId}</span>{c.version && <div className={s.muted}>{c.version}</div>}</th>
          <td>{STATUS_LABELS[c.status]}{c.exceptions.length > 0 && <div className={s.muted}>{c.exceptions.map(e => e.code + " " + e.message).join(" ; ")}</div>}</td>
          <td>{c.judgements.term.value ? c.judgements.term.value + " mois" : "—"}<div className={s.muted}>{c.judgements.term.text ?? "jugement absent"}{c.judgements.term.proof ? " — " + proofLabel(c.judgements.term.proof) : ""}</div></td>
          <td>{c.judgements.rate.value ? rateFr(c.judgements.rate.value) : "—"}{c.judgements.rate.basis && c.judgements.rate.basis !== "annual_effective" ? " (" + c.judgements.rate.basis + ")" : ""}
            <div className={s.muted}>{c.judgements.rate.text ?? "justification absente"}{c.judgements.rate.proof ? " — " + proofLabel(c.judgements.rate.proof) : ""}</div></td>
          <td>{c.framing ? FRAMING_LABELS[c.framing] : "—"}</td>
          <td>{c.result ? RESULT_LABELS[c.result] : "non calculé"}{!c.determined && c.resultReasons.length > 0 && <div className={s.muted}>{c.resultReasons.join(" ; ")}</div>}</td>
          <td>{c.adjustment.status ? ADJUSTMENT_LABELS[c.adjustment.status] + (c.adjustment.lines ? " · " + plural(c.adjustment.lines, "écriture") : "") : "—"}{c.adjustment.reason && <div className={s.muted}>{c.adjustment.reason}</div>}</td>
          <td>{c.points.blockingOpen ? c.points.blockingOpen + " bloquant(s)" : c.points.open ? c.points.open + " ouvert(s)" : c.points.resolved ? c.points.resolved + " résolu(s)" : "aucun"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {p.adjustment && <p className={s.muted}>Retraitement {p.adjustment.status === "reviewed" ? "revu" : "proposé"} : {plural(p.adjustment.contracts, "contrat")}, {plural(p.adjustment.lines, "écriture")}, débit {moneyFr(p.adjustment.debit)} = crédit {moneyFr(p.adjustment.credit)}. {p.adjustment.selection}.</p>}

    <h3>Points de revue</h3>
    {run.notes.length === 0 ? <p className={s.muted}>{run.result ? "Aucun point généré pour cette version." : "Points générés au calcul : feuille non calculée."}</p> :
      <ul className={s.points}>{[...open, ...resolved].map(n => <li key={n.id} data-state={n.resolution ? "resolved" : n.blocking ? "blocking" : "open"}>
        <p><strong>{n.resolution ? "Résolu" : n.blocking ? "Bloquant" : "Ouvert"}</strong> — {n.text}</p>
        {n.resolution ? <p className={s.muted}>Décision : {n.resolution.text} ({dateFr(n.resolution.at)})</p>
          : <CitedForm key={run.version} label={"Résoudre « " + n.id + " »"} submit="Résoudre avec la pièce citée" action={actions.resolve} busy={busy} demo={demo}
            proofs={proofs(n.id.replace(/^lease:(cadrage:)?/, ""))} fallback={proofs()} onSubmit={(text, citation) => onCommand("resolve", { noteId: n.id, text, citation })}/>}
      </li>)}</ul>}

    <h3>Conclusion</h3>
    {run.conclusion ? <p>{run.conclusion}</p> : <p className={s.muted}>Aucune conclusion pour cette version.</p>}
    {!run.conclusion && <CitedForm key={"c" + run.version} label="Conclusion de la feuille" submit="Enregistrer la conclusion citée" action={actions.conclude} busy={busy} demo={demo} proofs={proofs()} fallback={[]}
      onSubmit={(text, citation) => onCommand("conclude", { text, citation })}/>}

    <h3>Relecture et verrouillage</h3>
    <p className={s.muted}>La relecture personnelle nommée porte sur la version exacte soumise ; elle ne vaut ni revue par une autre personne, ni conformité IFRS, ni comptabilisation.</p>
    <Action id="submit" label="Soumettre à la relecture" action={actions.submit} busy={busy} onClick={() => onCommand("submit", {})}/>
    {actions.review?.allowed && run.submittedHash ? <CitedForm key={"r" + run.version} label="Note de relecture" submit="Approuver cette version" alternate="Demander une reprise" action={actions.review} busy={busy} demo={demo} proofs={proofs()} fallback={[]}
      onSubmit={(text, citation, decision) => onCommand("review", { decision: decision ?? "approved", text, citation, submittedHash: run.submittedHash })}/>
      : <Action id="review" label="Relire cette version" action={actions.review} busy={busy} onClick={() => {}}/>}
    <Action id="lock" label="Verrouiller la version approuvée" action={actions.lock} busy={busy} onClick={() => onCommand("lock", {})}/>

    <h3>Exports</h3>
    <p className={s.muted}>Le rapport HTML s'imprime depuis le navigateur ; aucun PDF n'est produit. Les pièces sources ne sont pas embarquées : elles sont citées par version et empreinte. L'export porte sur la population figée entière.</p>
    {(["diagnostic", "reviewed"] as const).map(kind => { const a = actions[kind === "diagnostic" ? "export_diagnostic" : "export_reviewed"], reasonId = "l16-export-" + kind;
      return <div key={kind} className={s.exportRow} role="group" aria-label={kind === "diagnostic" ? "Export diagnostic" : "Export revu"}>
        <strong>{kind === "diagnostic" ? "Export diagnostic" + (demo ? " — simulation non revue" : "") : "Export revu sur ce périmètre"}</strong>
        <div className={s.filters}>{FORMATS.map(f => <button key={f.id} type="button" disabled={busy || !a?.allowed || (f.id === "journal_csv" && !p.adjustment)} aria-describedby={a?.reason ? reasonId : undefined}
          onClick={() => onExport(kind, f.id)}>{f.label}</button>)}</div>
        {a?.reason && <span id={reasonId} className={s.actionReason}>{a.reason}</span>}
      </div>; })}

    <h3>Informations non couvertes</h3>
    <ul className={s.limits}>{p.annexLimits.map(l => <li key={l}>{l}</li>)}</ul>
  </section>;
}

function Action({ id, label, action, busy, onClick }: { id: string; label: string; action?: ActionState; busy: boolean; onClick(): void }) {
  if (!action) return null;
  const reasonId = "l16-review-" + id;
  return <div className={s.action}><button type="button" className={action.allowed ? s.primary : undefined} disabled={busy || !action.allowed} aria-describedby={action.reason ? reasonId : undefined} onClick={onClick}>{label}</button>
    {action.reason && <span id={reasonId} className={s.actionReason}>{action.reason}</span>}</div>;
}

/** Texte et pièce citée (ligne d'une source figée) ; refusé avec son motif écrit quand l'action ne l'est pas. */
function CitedForm({ label, submit, alternate, action, busy, demo, proofs, fallback, onSubmit }: { label: string; submit: string; alternate?: string; action?: ActionState; busy: boolean; demo: boolean;
  proofs: (SourceProof & { contractId: string })[]; fallback: (SourceProof & { contractId: string })[]; onSubmit(text: string, citation: { documentVersionId: string; rowId: string }, decision?: "approved" | "changes_requested"): void }) {
  const options = proofs.length ? proofs : fallback, [text, setText] = useState(""), [cited, setCited] = useState(options[0] ? options[0].documentVersionId + "|" + options[0].rowId : "");
  if (!action || demo) return null;
  if (!action.allowed) return <p className={s.actionReason}>{label} : {action.reason}</p>;
  const ready = text.trim().length > 0 && !!cited, citation = () => { const [documentVersionId, rowId] = cited.split("|"); return { documentVersionId, rowId }; };
  return <form className={s.form} onSubmit={e => { e.preventDefault(); if (ready) onSubmit(text.trim(), citation(), "approved"); }}>
    <label>{label}<textarea value={text} maxLength={2000} rows={3} onChange={e => setText(e.target.value)} required/></label>
    <label>Pièce citée<select value={cited} onChange={e => setCited(e.target.value)} required>{options.map(o => <option key={o.documentVersionId + "|" + o.rowId} value={o.documentVersionId + "|" + o.rowId}>{o.contractId} · {proofLabel(o)}</option>)}</select></label>
    <div className={s.filters}><button type="submit" className={s.primary} disabled={busy || !ready}>{submit}</button>
      {alternate && <button type="button" disabled={busy || !ready} onClick={() => onSubmit(text.trim(), citation(), "changes_requested")}>{alternate}</button>}</div>
  </form>;
}

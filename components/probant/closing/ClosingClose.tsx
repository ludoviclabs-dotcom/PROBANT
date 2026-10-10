"use client";
import { useState } from "react";
import type { RemainingItem } from "@/lib/workpapers/closing-evaluate";
import { CitationPicker, Cites, readCitations } from "./ProcedurePanel";
import { stampFr, type ClosingView } from "./format";
import { STATE_LABELS } from "../cash/format";
import cl from "./closing.module.css";

type Send = (body: Record<string, unknown>) => Promise<boolean>;
const submit = (send: Send, build: (f: FormData) => Record<string, unknown>) => async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const form = ev.currentTarget; if (await send(build(new FormData(form)))) form.reset(); };

/** Review points: raised by a reviewer, answered by the preparer, closed by someone other than the author of the answer. */
export function ClosingReview({ view, canPrepare, canReview, send, busy, onOpen, download }: { view: ClosingView; canPrepare: boolean; canReview: boolean; send: Send; busy: boolean;
  onOpen: (id: string, origin: HTMLElement) => void; download?: (id: string) => string }) {
  const points = view.evaluation.items.reviewPoints, awaiting = view.evaluation.procedures.filter(p => p.status === "conclue" || p.status === "changements");
  return <div>
    <section aria-labelledby="cl-points">
      <h2 id="cl-points">Points de revue <span className={cl.small}>{points.filter(p => !p.closed).length} ouvert(s) sur {points.length}</span></h2>
      {points.map(rp => <article key={rp.pointId} className={cl.record} data-flag={!rp.closed} aria-label={"Point " + rp.pointId}>
        <p><strong>{rp.pointId}</strong> · {rp.target.kind === "dossier" ? "Dossier" : rp.target.kind === "procedure" ? <button type="button" className={cl.link} onClick={ev => onOpen(rp.target.kind === "procedure" ? rp.target.id : "", ev.currentTarget)}>{rp.target.id}</button> : rp.target.id}
          {" "}<span className={cl.pill} data-tone={rp.closed ? "ok" : rp.answers.length ? "info" : "open"}>{rp.closed ? "Clos" : rp.answers.length ? "Réponse à examiner" : "Réponse attendue"}</span></p>
        <p>{rp.text}</p><p className={cl.who}>Levé par {rp.by} le {stampFr(rp.at)}</p>
        {rp.answers.map((a, i) => <div key={i}><p className={cl.small}>Réponse : {a.text} — par {a.by} le {stampFr(a.at)}</p><Cites list={a.citations} download={download}/></div>)}
        {rp.closed ? <p className={cl.small}>Clos : {rp.closed.text} — par {rp.closed.by} le {stampFr(rp.closed.at)}</p> : null}
        {!rp.closed && canPrepare ? <details><summary>Répondre</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "answer_review_point", pointId: rp.pointId, text: f.get("text"), citations: readCitations(f, "ra") }))}>
          <label>Réponse<textarea name="text" required maxLength={1500}/></label><CitationPicker pieces={view.pieces} name="ra"/><button className={cl.submit} disabled={busy}>Répondre</button></form></details> : null}
        {!rp.closed && rp.answers.length && canReview ? <details><summary>Clore le point</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "close_review_point", pointId: rp.pointId, text: f.get("text") }))}>
          <label>Motif de clôture<input name="text" required maxLength={1000}/></label><button className={cl.submit} disabled={busy}>Clore</button></form></details> : null}
      </article>)}
      {!points.length ? <p className={cl.small}>Aucun point de revue levé.</p> : null}
      {canReview ? <details><summary>Lever un point sur le dossier</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "raise_review_point", target: { kind: "dossier" }, text: f.get("text") }))}>
        <label>Point de revue<textarea name="text" required maxLength={1000}/></label><button className={cl.submit} disabled={busy}>Lever</button></form></details> : null}
    </section>
    <section className={cl.section} aria-labelledby="cl-awaiting">
      <h2 id="cl-awaiting">Procédures en attente de revue <span className={cl.small}>{awaiting.length}</span></h2>
      {awaiting.length ? <ul className={cl.remaining}>{awaiting.map(p => <li key={p.procedureId}><button type="button" className={cl.link} onClick={ev => onOpen(p.procedureId, ev.currentTarget)}>{p.procedureId} · {p.label}</button> — {p.statusLabel}</li>)}</ul>
        : <p className={cl.small}>Aucune conclusion en attente de revue.</p>}
    </section>
  </div>;
}

const FAMILIES: { id: string; label: string; codes: RegExp }[] = [
  { id: "programme", label: "Programme et couverture", codes: /^(FILE_|PROGRAM_|RISK_|PAIR_)/ },
  { id: "procedures", label: "Procédures à documenter, conclure ou revoir", codes: /^(ITGC_|POPULATION_|NO_WORK|STEP_|RECORD_|REPRESENTATION_|NOT_|CONCLUSION_|CHANGES_|CYCLE_ABSENT|CYCLE_NOT|CYCLE_BLOCKED|CYCLE_IN|CYCLE_NOTES)/ },
  { id: "pieces", label: "Pièces attendues", codes: /^REQUEST_/ },
  { id: "revue", label: "Points de revue", codes: /^REVIEW_POINT/ },
  { id: "contradictions", label: "Contradictions et incohérences", codes: /^(CONTRADICTION_|CYCLE_OUTSIDE|NA_WITH|MISSTATEMENT_IN)/ },
  { id: "anomalies", label: "Anomalies et limites à apprécier", codes: /^(MISSTATEMENT_UNASSESSED|LIMITATION_)/ },
  { id: "validation", label: "Validation", codes: /^VALIDATION_/ },
];

/** Closing view: remaining work and contradictions by family, observed cycle sheets, and the human validation reserved to the authorised professional. */
export function ClosingClose({ view, canSign, send, busy, onItem }: { view: ClosingView; canSign: boolean; send: Send; busy: boolean; onItem: (item: RemainingItem, origin: HTMLElement) => void }) {
  const e = view.evaluation, v = e.validation, closed = v.status === "validee" || v.status === "perimee";
  const grouped = FAMILIES.map(f => ({ ...f, items: e.blockers.filter(b => f.codes.test(b.code)) }));
  const other = e.blockers.filter(b => !FAMILIES.some(f => f.codes.test(b.code)));
  if (other.length) grouped.push({ id: "autres", label: "Autres", codes: /./, items: other });
  return <div>
    <section aria-labelledby="cl-remaining">
      <h2 id="cl-remaining">Travaux restants et contradictions <span className={cl.small}>{e.blockers.length} élément{e.blockers.length > 1 ? "s" : ""} bloquant la validation</span></h2>
      <div className={cl.groups}>{grouped.map(g => <div key={g.id} className={cl.group} data-empty={g.items.length === 0}>
        <h3>{g.label}<span>{g.items.length}</span></h3>
        {g.items.length ? <ul className={cl.remaining}>{g.items.map((b, i) => <li key={b.code + b.ref.id + i}>{b.procedureId || b.ref.kind !== "file" ? <button type="button" className={cl.link} style={{ fontWeight: 400 }} onClick={ev => onItem(b, ev.currentTarget)}>{b.procedureId && !b.label.startsWith(b.procedureId) ? b.procedureId + " · " : ""}{b.label}</button> : b.label}</li>)}</ul>
          : <p className={cl.small}>Rien de détecté — ce n’est pas une attestation.</p>}
      </div>)}</div>
    </section>
    <section className={cl.section} aria-labelledby="cl-cycles">
      <h2 id="cl-cycles">Feuilles de cycle observées <span className={cl.small}>{e.observations.length} feuille{e.observations.length > 1 ? "s" : ""} courante{e.observations.length > 1 ? "s" : ""} pour ce dossier et cet exercice</span></h2>
      <div className={cl.tableScroll}><table className={cl.grid}>
        <caption className="sr-only">États lus dans les cycles ; le dossier ne les modifie pas.</caption>
        <thead><tr><th scope="col">Feuille</th><th scope="col">État</th><th scope="col">Version</th><th scope="col">Revue</th><th scope="col">Au programme</th></tr></thead>
        <tbody>{e.observations.map(o => { const linked = e.procedures.find(p => p.engine?.id === o.procedure);
          return <tr key={o.runId}><td>{o.route ? <a href={o.route}>{o.label}</a> : o.label}<br/><span className={cl.hash}>{o.runId}</span></td><td>{STATE_LABELS[o.state] ?? o.state}</td><td className={cl.num}>r{o.revision} v{o.version}</td>
            <td className={cl.small}>{o.approval ? o.approval.actorId + " · " + stampFr(o.approval.at) : "—"}</td><td>{linked ? linked.procedureId + " · " + linked.riskIds.join(", ") : <span className={cl.pill} data-tone="danger">Hors programme</span>}</td></tr>; })}</tbody>
      </table></div>
      {!e.observations.length ? <p className={cl.small}>Aucune feuille de cycle pour ce dossier et cet exercice.</p> : null}
      <p className={cl.small}>La paie (Mission 18) n’a pas de feuille durable observable : ses travaux se documentent ici comme procédures manuelles.</p>
    </section>
    <section className={cl.validation} data-status={v.status} aria-labelledby="cl-validation">
      <h2 id="cl-validation">Validation de clôture</h2>
      <p>{e.noOpinion}</p>
      {v.status === "validee" ? <p><strong>Validation enregistrée</strong> par {v.by} le {stampFr(v.at!)} : {v.text}</p> : null}
      {v.status === "perimee" ? <p><strong>Validation périmée</strong> (enregistrée par {v.by} le {stampFr(v.at!)}) : {v.changed.join(", ")} a changé depuis. Une réouverture motivée est requise.</p> : null}
      {v.status === "reouverte" && v.reopened ? <p>Dossier rouvert par {v.reopened.by} le {stampFr(v.reopened.at)} : {v.reopened.reason}</p> : null}
      {!closed ? <>
        <p className={cl.small}>{!view.closingAuthority ? "Cette identité ne détient pas l’habilitation de clôture (capacité serveur distincte, accordée à personne par défaut)." : e.closable ? "Aucun travail restant détecté : la décision vous appartient." : "Validation impossible tant que des travaux restent ouverts."}</p>
        {canSign ? <form className={cl.form} onSubmit={submit(send, f => ({ command: "validate_closing", text: f.get("text") }))}>
          <label>Décision de clôture (texte du professionnel habilité)<textarea name="text" required maxLength={1500} disabled={!e.closable}/></label>
          <button className={cl.submit} disabled={busy || !e.closable}>Enregistrer la validation de clôture</button></form> : null}
      </> : canSign ? <details><summary>Rouvrir le dossier (motif obligatoire)</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "reopen", reason: f.get("reason") }))}>
        <label>Motif<textarea name="reason" required maxLength={1000}/></label><button className={`${cl.submit} ${cl.danger}`} disabled={busy}>Rouvrir</button></form></details> : null}
    </section>
  </div>;
}

/** Who did what, when: the server journal, newest first, with the local chain hash of each event. */
export function ClosingJournal({ view, onOpen }: { view: ClosingView; onOpen: (id: string, origin: HTMLElement) => void }) {
  const [procedure, setProcedure] = useState(""), lines = [...view.journal].reverse().filter(l => !procedure || l.procedureId === procedure);
  return <section aria-labelledby="cl-journal">
    <h2 id="cl-journal">Journal du dossier <span className={cl.small}>{view.journal.length} événement{view.journal.length > 1 ? "s" : ""} · tête {view.headHash.slice(0, 12)}…</span></h2>
    <p className={cl.small}>{view.hashNotice}</p>
    <div className={cl.toolbar}><label>Procédure<select value={procedure} onChange={e => setProcedure(e.target.value)}><option value="">Toutes</option>{view.evaluation.procedures.map(p => <option key={p.procedureId} value={p.procedureId}>{p.procedureId} · {p.label}</option>)}</select></label></div>
    <ol className={cl.journal} reversed>{lines.map(l => <li key={l.seq}>
      <span>#{l.seq}</span><span className={cl.small}>{stampFr(l.at)}<br/>{l.actorId}</span>
      <span>{l.label}{l.procedureId ? <> · <button type="button" className={cl.link} style={{ fontWeight: 400 }} onClick={ev => onOpen(l.procedureId!, ev.currentTarget)}>{l.procedureId}</button></> : null} <span className={cl.hash}>{l.hash}</span></span>
    </li>)}</ol>
  </section>;
}

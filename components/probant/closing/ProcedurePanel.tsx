"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { assertionLabel, CL_REACH, CL_REACH_LABELS, CL_RESULT_LABELS, CL_RESULTS, CL_STEP_LABELS, CL_PIECE_KIND_LABELS, isControl, stepsFor, type ResolvedCitation } from "@/lib/workpapers/closing-contract";
import type { ProcedureView } from "@/lib/workpapers/closing-evaluate";
import type { PieceVersion } from "@/lib/workpapers/closing-journal";
import { citationText, dateFr, STEP_STATE_LABELS, stampFr, TONE, type ClosingView } from "./format";
import { STATE_LABELS } from "../cash/format";
import cl from "./closing.module.css";

type Send = (body: Record<string, unknown>) => Promise<boolean>;
export interface ProcedurePanelHandle { focus(): void }
/** Current version of each piece: a new decision never cites a replaced version. */
export const currentPieces = (pieces: PieceVersion[]) => pieces.filter(p => !pieces.some(q => q.pieceId === p.pieceId && q.version > p.version));
export function CitationPicker({ pieces, name, label = "Pièces citées (version courante)", required = false }: { pieces: PieceVersion[]; name: string; label?: string; required?: boolean }) {
  return <>
    <label>{label}<select name={name} multiple required={required} size={Math.min(5, Math.max(2, pieces.length))}>
      {currentPieces(pieces).map(p => <option key={p.pieceVersionId} value={p.pieceVersionId}>{p.pieceId} · {p.label} · v{p.version} · {CL_PIECE_KIND_LABELS[p.kind]}</option>)}</select></label>
    <div className={cl.row}><label>Page (première pièce citée)<input name={name + "-page"} type="number" min={1} inputMode="numeric"/></label><label>Zone (première pièce citée)<input name={name + "-zone"} maxLength={120}/></label></div>
  </>;
}
export function readCitations(form: FormData, name: string) {
  const ids = form.getAll(name).map(String), page = Number(form.get(name + "-page")) || undefined, zone = String(form.get(name + "-zone") ?? "").trim() || undefined;
  return ids.map((pieceVersionId, i) => ({ pieceVersionId, ...(i === 0 && page ? { page } : {}), ...(i === 0 && zone ? { zone } : {}) }));
}
export function Cites({ list, download }: { list: ResolvedCitation[]; download?: (id: string) => string }) {
  if (!list.length) return <p className={cl.small}>Aucune pièce citée.</p>;
  return <ul className={cl.cites}>{list.map((c, i) => <li key={c.pieceVersionId + i}>
    {download ? <a href={download(c.pieceVersionId)}>{citationText(c)}</a> : citationText(c)} <span className={cl.small}>· {CL_PIECE_KIND_LABELS[c.kind]}</span> <span className={cl.hash} title={"SHA-256 " + c.sha256}>{c.sha256.slice(0, 12)}…</span>
  </li>)}</ul>;
}

export const ProcedurePanel = forwardRef<ProcedurePanelHandle, { view: ClosingView; p: ProcedureView; onClose: () => void; canPrepare: boolean; canReview: boolean; send: Send; busy: boolean; download?: (id: string) => string; error?: string }>(
  function ProcedurePanel({ view, p, onClose, canPrepare, canReview, send, busy, download, error }, ref) {
    const heading = useRef<HTMLHeadingElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
    const risks = view.evaluation.risks.filter(r => p.riskIds.includes(r.riskId)), control = isControl(p.nature), manual = p.nature !== "engine";
    const pop = p.population, best = p.engine?.best;
    const submit = (build: (f: FormData) => Record<string, unknown>) => async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const form = ev.currentTarget; if (await send(build(new FormData(form)))) form.reset(); };
    return <aside className={cl.panel} aria-labelledby="cl-panel-title" tabIndex={0} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className={cl.panelHead}>
        <div><h2 id="cl-panel-title" ref={heading} tabIndex={-1}>{p.procedureId} · {p.label}</h2>
          <p className={cl.small}>{p.natureLabel} · responsable {p.owner} · {p.riskIds.join(", ")}</p></div>
        <button type="button" className={cl.close} onClick={onClose} aria-label="Fermer la fiche (Échap)">×</button>
      </div>
      <span className={cl.pill} data-tone={TONE[p.status]}><span className={cl.station} data-tone={TONE[p.status]} aria-hidden="true"/>{p.statusLabel}</span>
      {p.remaining.length ? <><h3>Reste à faire</h3><ul className={cl.remaining}>{p.remaining.map((r, i) => <li key={r.code + i}>{r.label}</li>)}</ul></> : p.applicable ? <p className={cl.small}>Aucun reste à faire détecté pour cette procédure.</p> : null}
      {p.limits.length ? <ul className={cl.limits}>{p.limits.map(l => <li key={l}>{l}</li>)}</ul> : null}

      <ol className={cl.thread} aria-label="Fil de traçabilité">
        <li className={cl.node} data-tone="ok"><h3>Risques et assertions</h3>
          {risks.map(r => <p key={r.riskId}><strong>{r.riskId}</strong> {r.label}</p>)}
          <ul className={cl.chips}>{p.assertions.map(a => <li key={a} className={cl.chip}>{assertionLabel(a)}</li>)}</ul></li>
        {p.applicability && !p.applicability.applicable ? <li className={cl.node} data-tone="muted"><h3>Non applicable — motif</h3><p>{p.applicability.reason}</p>
          <p className={cl.who}>Déclaré par {p.applicability.by} le {stampFr(p.applicability.at)}</p><Cites list={p.applicability.citations} download={download}/></li> : null}
        {p.engine ? <li className={cl.node} data-tone={TONE[p.status]}><h3>Feuille de cycle observée</h3>
          {best ? <><p><a href={p.engine.route}>{p.engine.label}</a> · {STATE_LABELS[best.state] ?? best.state} · r{best.revision} v{best.version}</p>
            <p className={cl.who}>Préparée par {best.preparedBy}{best.approval ? " · revue par " + best.approval.actorId + " le " + stampFr(best.approval.at) : " · non revue"}</p>
            <p className={cl.small}>{best.populationSize !== null ? best.populationSize + " éléments de population · " : "Population non figée · "}{best.sourceCount} source{best.sourceCount > 1 ? "s" : ""} figée{best.sourceCount > 1 ? "s" : ""}{best.openBlockingNotes ? " · " + best.openBlockingNotes + " point(s) bloquant(s) ouvert(s)" : ""}</p>
            <p className={cl.hash}>empreinte de contenu {best.contentHash.slice(0, 16)}…</p>
            {p.engine.all.length > 1 ? <p className={cl.small}>Autres feuilles : {p.engine.all.slice(1).map(o => o.runId + " (" + (STATE_LABELS[o.state] ?? o.state) + ")").join(", ")}</p> : null}
            <p className={cl.small}>Le dossier observe cette feuille ; il ne la recalcule pas, ne la revoit pas et ne la verrouille pas.</p></>
            : <p>Aucune feuille « {p.engine.label} » pour cet exercice. <a href={p.engine.route}>Ouvrir le cycle</a></p>}</li> : null}
        {manual ? <li className={cl.node} data-tone={!pop ? "open" : pop.status === "absent" ? "danger" : "ok"}><h3>Population — sur quoi</h3>
          {!pop ? <p>Non définie.</p> : pop.status === "absent" ? <p><strong>Population absente :</strong> {pop.reason}</p>
            : <><p>{pop.description} · {pop.size !== null ? pop.size + " élément" + (pop.size > 1 ? "s" : "") : "taille non déclarée"}</p><Cites list={pop.citations} download={download}/></>}
          {pop ? <p className={cl.who}>Par {pop.by} le {stampFr(pop.at)}</p> : null}</li> : null}
        {p.nature === "itgc" ? <li className={cl.node} data-tone={p.itgcScope ? "ok" : "danger"}><h3>Périmètre et méthode ITGC</h3>
          {p.itgcScope ? <><p>{p.itgcScope.systems.join(", ")} · {p.itgcScope.processes.join(", ")} · du {dateFr(p.itgcScope.from)} au {dateFr(p.itgcScope.to)}</p><p>{p.itgcScope.method}</p>
            <p className={cl.who}>Par {p.itgcScope.by} le {stampFr(p.itgcScope.at)}</p></> : <p>Non défini : une checklist ne vaut pas couverture des contrôles généraux informatiques.</p>}</li> : null}
        {manual ? p.steps.map(s => {
          const records = p.records.filter(r => r.step === s.step);
          return <li key={s.step} className={cl.node} data-tone={s.state === "documente" ? "ok" : s.state === "absent" ? "open" : "danger"}><h3>{s.label} — {STEP_STATE_LABELS[s.state]}</h3>
            {records.length ? records.map(r => <div key={r.recordId} className={cl.record} data-flag={r.flags.length > 0}>
              <p><strong>{r.recordId}</strong> · réalisé le {dateFr(r.performedOn)} · {CL_RESULT_LABELS[r.result]}</p>
              <p className={cl.who}>Par {r.by} · enregistré par le serveur le {stampFr(r.at)}</p>
              <p><span className={cl.small}>Sur :</span> {r.object}{r.itemsExamined !== null ? " · " + r.itemsExamined + " élément" + (r.itemsExamined > 1 ? "s" : "") + " examiné" + (r.itemsExamined > 1 ? "s" : "") : ""}</p>
              <p><span className={cl.small}>Fait :</span> {r.done}</p>
              <Cites list={r.citations} download={download}/>
              {r.flags.length ? <p className={cl.small}>⚠ {r.flags.map(f => STEP_STATE_LABELS[f]).join(" · ")}</p> : null}
            </div>) : <p className={cl.small}>{s.step === "test_fonctionnement" ? "Non réalisé : aucune confiance dans le fonctionnement." : "Non documentée."}</p>}
          </li>;
        }) : null}
        {manual ? <li className={cl.node} data-tone={!p.conclusion ? "open" : p.conclusion.stale ? "danger" : "info"}><h3>Conclusion du préparateur</h3>
          {p.conclusion ? <><p>{p.conclusion.text}</p>{p.conclusion.reach ? <p className={cl.small}>Portée : {CL_REACH_LABELS[p.conclusion.reach]}</p> : null}
            <p className={cl.who}>Par {p.conclusion.by} le {stampFr(p.conclusion.at)}{p.conclusion.stale ? " · périmée" : ""}</p><Cites list={p.conclusion.citations} download={download}/></> : <p className={cl.small}>Attendue. Aucune conclusion n’est déduite des travaux.</p>}</li> : null}
        {manual ? <li className={cl.node} data-tone={p.review?.current ? (p.review.decision === "approved" ? "ok" : "danger") : "open"}><h3>Revue</h3>
          {p.review ? <><p>{p.review.decision === "approved" ? "Approuvée" : "Modifications demandées"} — {p.review.text}</p><p className={cl.who}>Par {p.review.by} le {stampFr(p.review.at)}{p.review.current ? "" : " · porte sur une conclusion antérieure"}</p></>
            : <p className={cl.small}>Attendue, par une autre personne que l’auteur des travaux et de la conclusion.</p>}</li> : null}
      </ol>

      {canPrepare || canReview ? <div className={cl.actions}>
        {error ? <p className={cl.refusal} role="status">Refus du serveur : {error}</p> : null}
        {canPrepare && manual && p.applicable ? <>
          <details><summary>Définir la population (sur quoi)</summary>
            <form className={cl.form} onSubmit={submit(f => ({ command: "set_population", procedureId: p.procedureId, population: f.get("status") === "absent" ? { status: "absent", reason: f.get("reason") }
              : { status: "defined", description: f.get("description"), size: f.get("size") ? Number(f.get("size")) : null, citations: readCitations(f, "pc") } }))}>
              <div className={cl.row}><label>Statut<select name="status" defaultValue="defined"><option value="defined">Définie</option><option value="absent">Absente</option></select></label><label>Taille (facultatif)<input name="size" type="number" min={1}/></label></div>
              <label>Description (si définie)<input name="description" maxLength={500}/></label><label>Motif (si absente)<input name="reason" maxLength={500}/></label>
              <CitationPicker pieces={view.pieces} name="pc"/><button className={cl.submit} disabled={busy}>Enregistrer la population</button></form></details>
          {p.nature === "itgc" ? <details><summary>Définir le périmètre et la méthode ITGC</summary>
            <form className={cl.form} onSubmit={submit(f => ({ command: "set_itgc_scope", procedureId: p.procedureId, systems: String(f.get("systems")).split(",").map(s => s.trim()).filter(Boolean), processes: String(f.get("processes")).split(",").map(s => s.trim()).filter(Boolean),
              from: f.get("from"), to: f.get("to"), method: f.get("method"), citations: readCitations(f, "ic") }))}>
              <label>Systèmes (séparés par des virgules)<input name="systems" required/></label><label>Processus (accès, changements, exploitation…)<input name="processes" required/></label>
              <div className={cl.row}><label>Du<input type="date" name="from" required/></label><label>Au<input type="date" name="to" required/></label></div>
              <label>Méthode<textarea name="method" required maxLength={1500}/></label><CitationPicker pieces={view.pieces} name="ic"/><button className={cl.submit} disabled={busy}>Enregistrer le périmètre</button></form></details> : null}
          <details><summary>Enregistrer un travail</summary>
            <form className={cl.form} onSubmit={submit(f => ({ command: "record_work", procedureId: p.procedureId, step: f.get("step"), performedOn: f.get("performedOn"), object: f.get("object"), done: f.get("done"),
              itemsExamined: f.get("items") ? Number(f.get("items")) : null, result: f.get("result"), citations: readCitations(f, "wc") }))}>
              <div className={cl.row}><label>Étape<select name="step">{stepsFor(p.nature).map(s => <option key={s} value={s}>{CL_STEP_LABELS[s]}</option>)}</select></label><label>Réalisé le<input type="date" name="performedOn" required/></label></div>
              <label>Sur quoi<input name="object" required maxLength={500}/></label><label>Ce qui a été fait<textarea name="done" required maxLength={1500}/></label>
              <div className={cl.row}><label>Éléments examinés<input type="number" name="items" min={1}/></label><label>Résultat<select name="result">{CL_RESULTS.map(r => <option key={r} value={r}>{CL_RESULT_LABELS[r]}</option>)}</select></label></div>
              <CitationPicker pieces={view.pieces} name="wc"/>
              <p className={cl.small}>Un travail sans pièce reste visible dans la file des pièces manquantes : il ne fonde aucune conclusion.</p>
              <button className={cl.submit} disabled={busy}>Enregistrer le travail</button></form></details>
          <details><summary>Demander une pièce</summary>
            <form className={cl.form} onSubmit={submit(f => ({ command: "request_piece", procedureId: p.procedureId, description: f.get("description"), requestedFrom: f.get("from") }))}>
              <label>Pièce attendue<input name="description" required maxLength={300}/></label><label>Demandée à<input name="from" required maxLength={120}/></label><button className={cl.submit} disabled={busy}>Ajouter à la file</button></form></details>
          <details><summary>Conclure</summary>
            <form className={cl.form} onSubmit={submit(f => ({ command: "conclude_procedure", procedureId: p.procedureId, text: f.get("text"), ...(control ? { reach: f.get("reach") } : {}), citations: readCitations(f, "cc") }))}>
              {control ? <label>Portée<select name="reach">{CL_REACH.map(r => <option key={r} value={r}>{CL_REACH_LABELS[r]}</option>)}</select></label> : null}
              <label>Conclusion du préparateur<textarea name="text" required maxLength={2000}/></label><CitationPicker pieces={view.pieces} name="cc"/>
              <p className={cl.small}>Refusée tant qu’une pièce est attendue, qu’un travail est sans pièce ou ne repose que sur une déclaration de la direction.</p>
              <button className={cl.submit} disabled={busy}>Enregistrer la conclusion</button></form></details>
        </> : null}
        {canPrepare ? <details><summary>{p.applicable ? "Déclarer non applicable (motivé)" : "Rétablir comme applicable"}</summary>
          <form className={cl.form} onSubmit={submit(f => ({ command: "set_applicability", procedureId: p.procedureId, applicable: !p.applicable, ...(p.applicable ? { reason: f.get("reason") } : {}), citations: readCitations(f, "nc") }))}>
            {p.applicable ? <label>Motif<textarea name="reason" required maxLength={1000}/></label> : null}<CitationPicker pieces={view.pieces} name="nc"/><button className={cl.submit} disabled={busy}>Enregistrer</button></form></details> : null}
        {canReview && manual && p.conclusion && !p.conclusion.stale ? <details><summary>Revoir la conclusion</summary>
          <form className={cl.form} onSubmit={submit(f => ({ command: "review_procedure", procedureId: p.procedureId, decision: f.get("decision"), text: f.get("text") }))}>
            <label>Décision<select name="decision"><option value="approved">Approuver</option><option value="changes_requested">Demander des modifications</option></select></label>
            <label>Commentaire de revue<textarea name="text" required maxLength={1000}/></label><button className={cl.submit} disabled={busy}>Enregistrer la revue</button></form></details> : null}
        {canReview ? <details><summary>Lever un point de revue</summary>
          <form className={cl.form} onSubmit={submit(f => ({ command: "raise_review_point", target: { kind: "procedure", id: p.procedureId }, text: f.get("text") }))}>
            <label>Point de revue<textarea name="text" required maxLength={1000}/></label><button className={cl.submit} disabled={busy}>Lever le point</button></form></details> : null}
      </div> : null}
    </aside>;
  });

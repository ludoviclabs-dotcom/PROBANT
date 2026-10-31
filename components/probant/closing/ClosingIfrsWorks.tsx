"use client";
import type { IfrsLineage } from "@/lib/workpapers/closing-ifrs";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { SHEET_STATE_LABELS } from "@/components/probant/ifrs/format";
import { CitationPicker, readCitations } from "./ProcedurePanel";
import { euros, stampFr, type ClosingView } from "./format";
import cl from "./closing.module.css";

type Send = (body: Record<string, unknown>) => Promise<boolean>;
const SELECTION = { non_selectionne: "Non sélectionné", selectionne: "Sélectionné pour la base déclarée", a_reexaminer: "À réexaminer" } as const;
const submit = (send: Send, build: (f: FormData) => Record<string, unknown>) => async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const form = ev.currentTarget; if (await send(build(new FormData(form)))) form.reset(); };

/**
 * Section « Travaux IFRS » du dossier de clôture (L16-05) : à part des cycles et des anomalies, jamais additionnée à leurs totaux ni aux effets C05.
 * Par lignée : version de tête, retraitement, sélection pour une base déclarée et sa fraîcheur, comptabilisation documentée par une pièce ou non.
 * Les commandes visent la version et l'empreinte affichées ; le serveur complète le manifeste (auteur, date, sources et pièce de la base).
 */
export function ClosingIfrsWorks({ view, canPrepare, send, busy }: { view: ClosingView; canPrepare: boolean; send: Send; busy: boolean }) {
  const w = view.projection.ifrsWorks, d = w.denominators;
  return <section className={cl.section} aria-labelledby="cl-ifrs-title">
    <h2 id="cl-ifrs-title">Travaux IFRS <span>section distincte des anomalies</span></h2>
    <p className={cl.small}>{w.notice}</p>
    <p data-testid="ifrs-denominators">{d.lineages} lignée(s) IFRS observée(s) · {d.reviewed} revue(s) · {d.selected} retraitement(s) sélectionné(s), {d.toReexamine} à réexaminer · {d.postingsDocumented} comptabilisation(s) documentée(s) par une pièce</p>
    {w.lineages.length === 0 ? <p className={cl.small}>Aucune feuille IFRS pour cet exercice : <DossierContextAnchor href="/ifrs/locations">ouvrir l&apos;atelier Locations IFRS 16</DossierContextAnchor>.</p>
      : w.lineages.map(l => <Lineage key={l.rootId} l={l} view={view} canPrepare={canPrepare} send={send} busy={busy}/>)}
    {w.orphanSelections.length > 0 && <p className={cl.small}>Sélections dont la lignée n&apos;est plus observée, conservées : {w.orphanSelections.map(o => o.logicalId + " (" + o.runId + ")").join(", ")}.</p>}
  </section>;
}

function Lineage({ l, view, canPrepare, send, busy }: { l: IfrsLineage; view: ClosingView; canPrepare: boolean; send: Send; busy: boolean }) {
  const sel = l.selection, current = sel.status === "selectionne" && sel.runId === l.runId && sel.bundleHash === l.bundle?.bundleHash, picker = "ifrs-" + l.rootId;
  const selectable = canPrepare && l.bundle?.status === "reviewed" && l.sourcesCurrent && l.ruleCurrent && !current;
  return <article className={cl.section} aria-label={"Lignée " + l.rootId}>
    <h3>{l.label} · <span className={cl.hash}>{l.rootId}</span></h3>
    <dl className={cl.small}>
      <dt>Version de tête</dt><dd>r{l.revision} · v{l.version} · {SHEET_STATE_LABELS[l.state] ?? l.state}{l.sourcesCurrent ? "" : " · source remplacée"}{l.ruleCurrent ? "" : " · règle remplacée"}{l.outcome ? " · résultat : " + l.outcome : ""} · <DossierContextAnchor href="/ifrs/locations">ouvrir la feuille</DossierContextAnchor></dd>
      <dt>Retraitement</dt><dd>{l.bundle ? (l.bundle.status === "reviewed" ? "revu" : "proposé") + " · " + l.bundle.contracts + " contrat(s), " + l.bundle.lines + " écriture(s) · débit " + euros(l.bundle.debit.amount) + " = crédit " + euros(l.bundle.credit.amount) + " · impôt non calculé" : "aucun retraitement"}</dd>
      <dt>Sélection</dt><dd><strong>{SELECTION[sel.status]}</strong>{sel.reasons.length ? " : " + sel.reasons.join(", ") : ""}{l.toDecide ? " — version revue, sélection à décider (sans bloquer la clôture des cycles)" : ""}
        {sel.by ? " · " + sel.by + " · " + stampFr(sel.at!) + " · r" + sel.revision + " v" + sel.runVersion : ""}{sel.base ? " · base " + sel.base.baseKind + " : " + sel.base.included + " ; pièce " + sel.base.citation : ""}
        {sel.base?.bridge && <><br/><span>{sel.base.bridge.text}</span></>}</dd>
      <dt>Comptabilisation</dt><dd>{l.posting.status === "documentee" ? "documentée — " + l.posting.text + " · " + l.posting.citations.join(", ") + " · " + l.posting.by + " · " + stampFr(l.posting.at!) : "non documentée : la sélection et le verrouillage ne la prouvent pas"}</dd>
    </dl>
    {selectable && <details><summary>Sélectionner ce retraitement pour la base de l&apos;exercice</summary>
      <form className={cl.form} onSubmit={submit(send, f => ({ command: "select_ifrs_bundle", procedure: l.procedure, rootId: l.rootId, runId: l.runId, version: l.version, contentHash: l.contentHash, bundleHash: l.bundle!.bundleHash,
        base: { includedAdjustments: f.get("included") === "unknown" ? { kind: "unknown", reason: String(f.get("reason") ?? "").trim() || "Non examiné" } : { kind: "declared", identities: [] }, limits: f.get("limits") } }))}>
        <fieldset><legend>Retraitements IFRS 16 déjà inclus dans la base</legend>
          <label><input type="radio" name="included" value="none" defaultChecked/> Aucun : la base PCG ne contient aucun retraitement IFRS 16 (déclaration)</label>
          <label><input type="radio" name="included" value="unknown"/> Inconnu : la sélection sera refusée (base inconnue)</label>
          <label>Motif si inconnu<input name="reason" maxLength={2000}/></label></fieldset>
        <label>Limites de la base déclarée<textarea name="limits" required maxLength={4000} rows={2} defaultValue="Base PCG de l'exercice ; pont partiel limité au retraitement IFRS 16, sans autre traitement IFRS"/></label>
        <button type="submit" disabled={busy}>Sélectionner r{l.revision} · v{l.version}</button>
      </form></details>}
    {canPrepare && sel.status !== "non_selectionne" && sel.runId && sel.bundleHash && <button type="button" disabled={busy}
      onClick={() => void send({ command: "withdraw_ifrs_bundle", rootId: l.rootId, runId: sel.runId, bundleHash: sel.bundleHash })}>Retirer la sélection lue (r{sel.revision} · v{sel.runVersion})</button>}
    {canPrepare && sel.status === "selectionne" && l.posting.status !== "documentee" && <details><summary>Documenter la comptabilisation par une pièce</summary>
      <form className={cl.form} onSubmit={submit(send, f => ({ command: "document_ifrs_posting", rootId: l.rootId, bundleHash: sel.bundleHash, text: f.get("text"), citations: readCitations(f, picker) }))}>
        <label>Ce que la pièce montre<textarea name="text" required maxLength={1000} rows={2}/></label>
        <CitationPicker pieces={view.pieces} name={picker} required/>
        <button type="submit" disabled={busy || view.pieces.length === 0}>Documenter avec la pièce citée</button>
      </form></details>}
    {l.previous.length > 0 && <p className={cl.small}>Révisions antérieures conservées : {l.previous.map(p => "r" + p.revision + " v" + p.version + " (" + p.state + ")").join(", ")}.</p>}
  </article>;
}

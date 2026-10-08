"use client";
import { useEffect, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import type { ImportBatch } from "@/lib/workpapers/imports";
import type { PayablesDraft, PayablesResult } from "@/lib/workpapers/payables-investigation";
import { PAYABLE_OBJECTIVES, PAYABLE_PROCEDURES, PAYABLE_LABELS, PAYABLE_REQUIRED, type PayableProcedure } from "@/lib/workpapers/payables-program";
import { PayablesImportForm } from "./PayablesImportForm";
import { PayablesWorkForm, type PayablesFacts } from "./PayablesWorkForm";
import { PayablesDetails } from "./PayablesDetails";
import { WorkpaperPanel } from "./WorkpaperPanel";
import s from "./Payables.module.css";
type Initial = {
    dossierId: string;
    periodId: string;
    id?: string;
    version?: number;
    event?: string;
    filter: string; procedure?: PayableProcedure;
};
type View = {
    actorId: string;
    permissions: string[];
    runs: WorkpaperRun[];
    imports: ImportBatch[];
    sourceHeads: {
        document_type: string;
        import_id: string;
    }[];
    sourcesCurrent: Record<string, boolean>;
    currentVersions: Record<string, number>;
    lineageCurrent: Record<string, {
        id: string;
        version: number;
    }>;
    facts: Record<string, PayablesFacts>; choices?: {id:string;objective:string;version:number;revision:number}[];
};
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
function unstamp(run: WorkpaperRun): PayablesDraft | null { if (!run.payablesWork)
    return null; const { schemaVersion: _schema, authorId: _author, authoredAt: _at, ...draft } = run.payablesWork; void _schema; void _author; void _at; return draft; }
function emptyDraft(period: AccountingPeriod): PayablesDraft { return { accounts: ["401000", "408100", "486000", "601000", "512000"], method: { id: "", version: "", source: "", proofRowIds: [], note: "" }, window: { startDate: period.closingDate ? new Date(Date.parse(period.closingDate) + 86400000).toISOString().slice(0, 10) : "", endDate: period.asOfDate, coverage: "incomplete", proofRowIds: [], note: "" }, purchases: [], allocations: [] }; }
export function payablesFailure(status: number, code: string) { return status === 401 ? "Session requise ou expirée : reconnectez-vous." : status === 403 ? "Accès refusé pour votre identité, ou auto-approbation interdite." : status === 503 ? "Chaîne durable indisponible ou désactivée. Ce parcours nécessite l’infrastructure de recette jetable." : status === 409 ? "La version ou une source a changé. Comparez l’état serveur avant de reprendre." : "Opération refusée : vérifiez les sources, les bases et les preuves. Détail : " + code; }
export function PayablesWorkspace({ initial }: {
    initial: Initial;
}) {
    const [dossier, setDossier] = useState(initial.dossierId), [period, setPeriod] = useState(emptyPeriod), [scope, setScope] = useState({ dossierId: initial.dossierId, periodId: initial.periodId }), [focus, setFocus] = useState<{
        id?: string;
        version?: number;
    }>({ id: initial.id, version: initial.version });
    const [view, setView] = useState<View | null>(null), [draft, setDraft] = useState<PayablesDraft | null>(null), [procedure, setProcedure] = useState<PayableProcedure>(initial.procedure??"payables.purchases"), [busy, setBusy] = useState(false), [status, setStatus] = useState("Modifications non sauvegardées"), [error, setError] = useState(""), [conflict, setConflict] = useState<WorkpaperRun | null>(null), [preview, setPreview] = useState<ImportBatch | null>(null), [criteria, setCriteria] = useState(""), [selection, setSelection] = useState("all"), [selectedIds, setSelectedIds] = useState<string[]>([]), [excluded, setExcluded] = useState<Record<string, string>>({}), [conclusion, setConclusion] = useState(""), [note, setNote] = useState(""), [review, setReview] = useState(""), [resolved, setResolved] = useState<string | null>(null);
    const csrf = useRef(""), inflight = useRef(false), pending = useRef<{
        body: Record<string, unknown> | FormData;
        imports: boolean;
        key: string;
    } | null>(null);
    const run = view?.runs.find(r => r.id === focus.id) ?? view?.runs[0], facts = run ? view?.facts[run.id] : undefined;
    const historical = !!run && (view?.currentVersions[run.id] !== run.version || view?.lineageCurrent[run.rootId]?.id !== run.id), stale = !!run && view?.sourcesCurrent[run.id] === false;
    const editable = !!run && view?.permissions.includes("prepare") && !historical && !stale && ["draft", "ready", "executed"].includes(run.state);
    const query = (extra: Record<string, string> = {}) => new URLSearchParams({ ...scope, ...extra });
    async function session() { const response = await fetch("/api/auth/session", { cache: "no-store" }); const data = await response.json(); if (!response.ok || !data.csrfToken)
        throw new Error("Session requise : reconnectez-vous."); csrf.current = data.csrfToken; }
    async function load(target = focus) { if (!scope.dossierId || !scope.periodId)
        return; setBusy(true); setError(""); try {
        await session();
        const q = query(target.id ? { id: target.id, ...(target.version ? { operation: "version", version: String(target.version) } : {}) } : {});
        const response = await fetch("/api/workpapers/payables?" + q, { cache: "no-store" }), data = await response.json();
        if (!response.ok)
            throw new Error(payablesFailure(response.status, data.error));
        setView(data);
        const current = data.runs.find((r: WorkpaperRun) => r.id === target.id) ?? data.runs[0];
        if (current) {
            setPeriod(current.period);
            setProcedure(current.template.id);
            setDraft(unstamp(current) ?? emptyDraft(current.period));
            setConclusion(current.conclusion ?? "");
            setConflict(null);
        }
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Lecture impossible");
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => {
        void load(); /* Scope and version changes are explicit user navigation. */ // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, focus.id, focus.version]);
    async function mutate(body: Record<string, unknown> | FormData, imports = false, retry = false) { if (inflight.current)
        return; const activeElement=document.activeElement as HTMLElement|null,position={x:window.scrollX,y:window.scrollY};let acknowledged=false; inflight.current = true; setBusy(true); setError(""); setStatus("Sauvegarde en cours…"); if (!retry)
        pending.current = { body, imports, key: crypto.randomUUID() }; const p = pending.current!; try {
        await session();
        const response = await fetch("/api/workpapers/payables" + (p.imports ? "/imports" : "") + "?" + query(), { method: "POST", headers: { "x-probant-csrf": csrf.current, "Idempotency-Key": p.key, ...(p.body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: p.body instanceof FormData ? p.body : JSON.stringify(p.body) }), data = await response.json();
        if (response.status === 409 && data.current) {
            setConflict(data.current);
            setStatus("Conflit de modification");
            return;
        }
        if (!response.ok)
            throw new Error(payablesFailure(response.status, data.error));
        acknowledged=true;if(!(p.body instanceof FormData)&&p.body.command==="resolve")setResolved(String(p.body.noteId));
        pending.current = null;
        setStatus("Sauvegardée — accusé serveur reçu");
        if (data.batch && !(p.body instanceof FormData)) {
            setPreview(null);
            await load({ id: run?.id });
        }
        else if (data.batch) {
            setPreview(data.batch);
        }
        if (data.run) {
            const next = data.run as WorkpaperRun;
            setFocus({ id: next.id });
            setView(v => v ? { ...v, runs: [next, ...v.runs.filter(r => r.id !== next.id)], currentVersions: { ...v.currentVersions, [next.id]: next.version }, lineageCurrent: { ...v.lineageCurrent, [next.rootId]: { id: next.id, version: next.version } } } : v);
            setDraft(unstamp(next) ?? emptyDraft(next.period));
            setConclusion(next.conclusion ?? "");
            await load({ id: next.id });
        }
    }
    catch (e) {
        setStatus("Échec de sauvegarde");
        setError(e instanceof Error ? e.message : "Échec serveur");
    }
    finally {
        inflight.current = false;
        setBusy(false);
        requestAnimationFrame(()=>{if(acknowledged&&!(p.body instanceof FormData)&&p.body.command==="resolve")document.getElementById("payable-note-"+String(p.body.noteId))?.focus({preventScroll:true});else if(activeElement?.isConnected)activeElement.focus({preventScroll:true});window.scrollTo(position.x,position.y);});
    } }
    const command = (command: string, extra: Record<string, unknown> = {}) => run && void mutate({ command, id: run.id, expectedVersion: run.version, ...extra });
    const change = (d: PayablesDraft) => { setDraft(d); pending.current = null; setStatus("Modifications non sauvegardées"); };
    const sourceIds = run ? (run.template.id === "payables.frame" ? view?.sourceHeads.filter(h => PAYABLE_REQUIRED["payables.frame"].includes(h.document_type)) : view?.sourceHeads.filter(h => !PAYABLE_REQUIRED["payables.frame"].includes(h.document_type)))?.map(h => h.import_id) ?? [] : [];
    const completeSources = !!run && PAYABLE_REQUIRED[run.template.id as PayableProcedure].every(t => view?.sourceHeads.some(h => h.document_type === t));
    const choices = run?.population?.items.map(i => ({ id: i.id, label: i.rowIds.join(" ; ") })) ?? (run?.template.id === "payables.rpne" ? facts?.payments?.map(p => ({ id: p.rowId, label: p.id + " · " + p.party })) : facts?.ledger?.map(l => ({ id: l.rowId, label: l.id + " · " + l.amount.amount + " HT" }))) ?? [];
    const save = () => run && draft && command(run.population ? "configure_payables" : "freeze_payables", { draft, ...(!run.population ? { importIds: sourceIds, selection: { method: selection, criteria, exclusions: Object.entries(excluded).filter(([, reason]) => reason.trim()).map(([id, reason]) => ({ id, reason })), ...(selection === "targeted" ? { selectedIds, requestedSize: selectedIds.length } : {}) } } : {}) });
    const links = query(run ? { id: run.id, version: String(run.version) } : {});
    return <main className={s.workspace}><nav className={s.links}><a href="/dashboard/synthese">DEMO SA · constats historiques</a><a href="/atelier">Atelier synthétique</a><span>Procédures de mission · achats / fournisseurs</span></nav><header className={s.header}><p className={s.eyebrow}>MISSION 08 · RECETTE JETABLE</p><h1>Achats et fournisseurs</h1><p>Deux investigations complémentaires, une identité par événement économique.</p><nav className={s.links}><a href={"/payables/synthesis?" + links}>Synthèse et export</a><a href={"/cutoff?" + links}>Cut-off transversal</a><a href={"/clients-framing?" + query()}>Cycle Clients</a></nav></header>
 <form className={s.form} onSubmit={e => { e.preventDefault(); const pid = periodId(period); setFocus({}); setScope({ dossierId: dossier.trim(), periodId: pid }); }}><label>Dossier<input required value={dossier} onChange={e => setDossier(e.target.value)} placeholder="Identifiant du dossier"/></label>{([['startDate', 'Début exercice'], ['closingDate', 'Clôture'], ['asOfDate', 'Revue au']] as const).map(([key, label]) => <label key={key}>{label}<input required type="date" value={period[key]} onChange={e => setPeriod({ ...period, [key]: e.target.value })}/></label>)}<button disabled={busy}>Charger le dossier</button><a href={"/api/auth/login?returnTo=" + encodeURIComponent("/payables?" + query())}>Se connecter</a></form>
 <p role="status" aria-live="polite" className={s.save}>{status}</p>{error && <p role="alert" className={s.notice}>{error}</p>}{pending.current && status === "Échec de sauvegarde" && <button disabled={busy} onClick={() => void mutate(pending.current!.body, pending.current!.imports, true)}>Rejouer la même requête</button>}
 {view && <><div className={s.meta}><span>Organisation autorisée par le serveur · identité {view.actorId}</span><span>Période {scope.periodId}</span><button disabled={busy} onClick={() => void load()}>Actualiser la version affichée</button></div><div className={s.form}><label>Procédure à préparer<select value={procedure} onChange={e => setProcedure(e.target.value as PayableProcedure)}>{PAYABLE_PROCEDURES.map(p => <option key={p} value={p}>{PAYABLE_OBJECTIVES[p]}</option>)}</select></label><button disabled={busy || !view.permissions.includes("prepare")} onClick={() => void mutate({ command: "create_payables", procedure, period, instanceKey: crypto.randomUUID() })}>Créer une feuille</button><label>Feuille à ouvrir<select value={run?.id ?? ""} onChange={e => setFocus({ id: e.target.value })}><option value="" disabled>Choisir</option>{(view.choices??view.runs.map(r=>({id:r.id,objective:r.template.objective,version:r.version,revision:r.revision}))).map(r => <option value={r.id} key={r.id}>{r.objective} · r{r.revision} v{r.version}</option>)}</select></label></div>
 {run && <><h2>{run.template.objective}</h2><p>Version affichée {run.version} · version courante {view.currentVersions[run.id]} · révision {run.revision} · auteur réel {run.events.at(-1)?.actorId ?? run.preparedBy}</p>{(historical || stale) && <p className={s.notice}>{historical ? "Version historique — décision conservée. " : ""}{stale ? "Source remplacée : travail périmé. " : ""}<button onClick={() => setFocus({ id: view.lineageCurrent[run.rootId]?.id ?? run.id })}>Ouvrir la feuille courante</button></p>}
 {conflict && <section role="alert" className={s.notice}><h2>Conflit de modification · comparaison</h2><p>Votre version {run.version} ; version serveur {conflict.version}. Votre préparation reste dans le formulaire.</p><div className={s.compare}><div><h3>Votre préparation</h3><p>{draft?.method.note}</p><p>{draft?.window.note}</p><p>{draft?.allocations.map(a => a.paymentId + " → " + a.invoiceId + " : " + a.amount.amount + " TTC / " + a.status).join(" ; ")}</p></div><div><h3>Préparation serveur · {conflict.payablesWork?.authorId}</h3><p>{conflict.payablesWork?.method.note}</p><p>{conflict.payablesWork?.window.note}</p><p>{conflict.payablesWork?.allocations.map(a => a.paymentId + " → " + a.invoiceId + " : " + a.amount.amount + " TTC / " + a.status).join(" ; ")}</p></div></div><details><summary>Comparer tous les champs</summary><div className={s.compare}><pre>{JSON.stringify(draft, null, 2)}</pre><pre>{JSON.stringify(unstamp(conflict), null, 2)}</pre></div></details><button onClick={() => { const saved = structuredClone(draft); setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.id ? conflict : r), currentVersions: { ...v.currentVersions, [conflict.id]: conflict.version } } : v); setDraft(saved); setConflict(null); pending.current = null; setStatus("Modifications non sauvegardées — base serveur actualisée, vérifiez avant sauvegarde"); }}>Conserver ma préparation sur la nouvelle base</button><button onClick={() => void load({ id: conflict.id })}>Recharger la préparation serveur</button></section>}
 {facts?.issue && <p className={s.notice}>Sources à compléter : {facts.issue}</p>}{draft && <PayablesWorkForm key={run.id} draft={draft} onChange={change} facts={facts} disabled={!editable || busy} procedure={run.template.id}/>}
 {!run.population && <fieldset disabled={!editable || busy}><legend>Population et sélection à figer</legend><label>Critères et limites de la sélection<textarea value={criteria} onChange={e => setCriteria(e.target.value)}/></label><label>Méthode de sélection<select value={selection} onChange={e => setSelection(e.target.value)}><option value="all">Toutes les unités admissibles</option><option value="targeted">Sélection ciblée explicitement</option></select></label>{choices.map(c => <div className={s.form} key={c.id}>{selection === "targeted" && <label><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, c.id] : selectedIds.filter(id => id !== c.id))}/>{c.label}</label>}<label>Exclusion de {c.label} (motif facultatif)<input value={excluded[c.id] ?? ""} onChange={e => setExcluded({ ...excluded, [c.id]: e.target.value })}/></label></div>)}<p>Unité : {run.template.id === "payables.purchases" ? "écriture d’achat HT" : run.template.id === "payables.rpne" ? "paiement ultérieur TTC" : "ligne de solde à clôture"}. Les sources secondaires sont conservées et versionnées.</p></fieldset>}
 <div className={s.actions}><button disabled={!editable || busy || !draft || (!run.population && (!criteria.trim() || !completeSources))} onClick={save}>{run.population ? "Sauvegarder la préparation" : "Figer la population et la sélection"}</button>{run.state === "ready" && <button disabled={!editable || busy} onClick={() => command("execute")}>Exécuter cette version</button>}</div>
 {run.result?.execution === "completed" && <PayablesDetails result={run.result.result as PayablesResult} run={run} initialEvent={initial.event} initialFilter={initial.filter} canDownload={view.permissions.includes("download")}/>}
 <section className={s.section}><h2>Exceptions et jugement</h2>{run.notes.map(n => <div key={n.id} id={"payable-note-"+n.id} tabIndex={-1} className={resolved === n.id ? s.resolved : undefined}><p>{n.text} · auteur {n.authorId}</p><p>{n.resolution ? "Traitement : " + n.resolution.text + " · " + n.resolution.authorId : "Point ouvert ; le résultat reste conservé après revue."}</p>{!n.resolution && editable && <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); command("resolve", { noteId: n.id, text: String(data.get("resolution")) }); }}><label>Explication du point {n.id}<textarea required name="resolution"/></label><button disabled={busy}>Documenter le traitement</button></form>}</div>)}{editable && run.state === "executed" && <><label>Commentaire de mission<textarea value={note} onChange={e => setNote(e.target.value)}/></label><button disabled={busy || !note.trim()} onClick={() => command("note", { note: { id: crypto.randomUUID(), kind: "judgment", text: note, blocking: false, amount: { kind: "unknown", reason: "Jugement sans montant automatique" } } })}>Ajouter le commentaire</button><label>Conclusion humaine limitée au périmètre<textarea value={conclusion} onChange={e => setConclusion(e.target.value)}/></label><div className={s.actions}><button disabled={busy || !conclusion.trim()} onClick={() => command("conclude", { text: conclusion })}>Sauvegarder la conclusion</button><button disabled={busy || !run.conclusion} onClick={() => command("submit")}>Soumettre à une autre identité</button></div></>}
 {run.state === "awaiting_review" && view.permissions.includes("review") && !historical && !stale && <><label>Décision et motif de revue<textarea value={review} onChange={e => setReview(e.target.value)}/></label><div className={s.actions}><button disabled={busy || !review.trim() || view.actorId === run.preparedBy} onClick={() => command("review", { decision: "approved", text: review, submittedHash: run.submittedHash })}>Approuver les travaux de cette version</button><button disabled={busy || !review.trim() || view.actorId === run.preparedBy} onClick={() => command("review", { decision: "changes_requested", text: review, submittedHash: run.submittedHash })}>Demander une correction</button></div><p>La revue ne transforme pas un candidat omission en conformité des comptes.</p></>}
 {run.state === "approved" && view.permissions.includes("review") && !historical && !stale && <button disabled={busy} onClick={() => command("lock")}>Verrouiller la décision</button>}{["locked", "approved", "changes_requested", "blocked", "failed"].includes(run.state) && view.permissions.includes("prepare") && !historical && <button disabled={busy} onClick={() => command("revise")}>Créer une nouvelle révision sans réécrire la décision</button>}</section><details className={s.section}><summary>Feuille pilote · historique, preuves et limites détaillés</summary><WorkpaperPanel runs={[run]} durable durableLabel="Achats et fournisseurs"/></details></>}
 {view.permissions.includes("prepare") && <PayablesImportForm period={period} busy={busy} onPreview={data => void mutate(data, true)} onApprove={() => preview && void mutate({ command: "approve_import", importId: preview.id, previewHash: preview.previewHash, expectedSourceId: view.sourceHeads.find(h => h.document_type === preview.document.documentType)?.import_id ?? null }, true)} batch={preview} head={preview ? view.sourceHeads.find(h => h.document_type === preview.document.documentType)?.import_id : null}/>}
 <section className={s.section}><h2>Index des imports courants</h2>{view.sourceHeads.map(h => { const b = view.imports.find(i => i.id === h.import_id); return <p key={h.document_type}>{PAYABLE_LABELS[h.document_type]} · {b?.document.fileName} · approbation {b?.approval?.actorId} · {b?.approval?.at}</p>; })}<p className={s.muted}>Les pièces binaires sont absentes des exports et se téléchargent séparément avec les mêmes permissions.</p></section></>}
 </main>;
}

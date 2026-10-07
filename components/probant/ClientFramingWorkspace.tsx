"use client";
import { useRef, useState } from "react";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { ImportBatch } from "@/lib/workpapers/imports";
import { WorkpaperPanel } from "./WorkpaperPanel";
type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
type View = {
    actorId: string;
    permissions: string[];
    runs: WorkpaperRun[];
    imports: (ImportBatch & { rowCount?: number })[];
    sourceHeads: {
        document_type: string;
        import_id: string;
    }[];
    sourcesCurrent: Record<string, boolean>;
};
const sourceLabels = { clients_general: "Grand livre Clients", clients_auxiliary: "Auxiliaire Clients", clients_aged: "Balance âgée" };
const initialPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
const saveLabels: Record<SaveState, string> = { idle: "Modifications non sauvegardées", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
export function ClientFramingWorkspace({ initialDossierId = "", initialPeriodValue = initialPeriod }: {
    initialDossierId?: string;
    initialPeriodValue?: AccountingPeriod;
}) {
    const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodValue);
    const [view, setView] = useState<View | null>(null), [activeId, setActiveId] = useState("");
    const [conclusion, setConclusion] = useState(""), [comment, setComment] = useState(""), [review, setReview] = useState("");
    const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
    const [conflict, setConflict] = useState<{
        current: WorkpaperRun;
        expectedVersion: number;
    } | null>(null);
    const [file, setFile] = useState<File | null>(null), [type, setType] = useState<keyof typeof sourceLabels>("clients_general");
    const [columns, setColumns] = useState({ key: "id", amount: "amount", date: "date", account: "account", party: "party", sheet: "" });
    const [format, setFormat] = useState({ delimiter: ";", decimal: ".", dateFormat: "ISO", sign: "1" });
    const [blocking, setBlocking] = useState(true);
    const busy = useRef(false), csrf = useRef(""), pending = useRef<{
        body: Record<string, unknown> | FormData;
        imports: boolean;
        key: string;
    } | null>(null);
    const run = view?.runs.find(r => r.id === activeId) ?? null;
    const canPrepare = !!view?.permissions.includes("prepare"), canReview = !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
    const current = run ? view?.sourcesCurrent[run.id] !== false : true;
    const editable = !!run && ["draft", "executed"].includes(run.state) && canPrepare && run.preparedBy === view?.actorId;
    const saving = status === "saving";
    const endpoint = (imports = false) => "/api/workpapers/clients" + (imports ? "/imports" : "") + "?dossierId=" + encodeURIComponent(dossierId) + "&periodId=" + encodeURIComponent(periodId(period));
    async function session() {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const identity = await response.json();
        if (!response.ok || !identity.authenticated || !identity.csrfToken)
            throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
        csrf.current = identity.csrfToken;
    }
    async function refresh(preferred?: string, keepDraft = false) {
        const response = await fetch(endpoint(), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.error ?? "Chargement impossible");
        setView(data);
        const selected = data.runs.find((r: WorkpaperRun) => r.id === preferred) ?? data.runs.reduce((a: WorkpaperRun | null, b: WorkpaperRun) => !a || b.revision > a.revision ? b : a, null);
        if (selected) {
            setActiveId(selected.id);
            if (!keepDraft)
                setConclusion(selected.conclusion ?? "");
        }
    }
    async function load() {
        setLoading(true);
        setError("");
        setStatus("idle");
        setConflict(null);
        try {
            await session();
            await refresh(activeId);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Chargement impossible");
            setView(null);
        }
        finally {
            setLoading(false);
        }
    }
    async function mutate(body: Record<string, unknown> | FormData, imports = false, key = crypto.randomUUID()) {
        if (busy.current)
            return;
        busy.current = true;
        pending.current = { body, imports, key };
        setStatus("saving");
        setError("");
        setConflict(null);
        try {
            await session();
            const response = await fetch(endpoint(imports), { method: "POST", headers: { "Idempotency-Key": key, "x-probant-csrf": csrf.current,
                    ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 409 && data.current) {
                    setConflict(data);
                    setStatus("conflict");
                    pending.current = null;
                    return;
                }
                if (response.status < 500)
                    pending.current = null;
                throw new Error(data.error ?? "Commande refusée");
            }
            if (!data.run && !data.batch)
                throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
            pending.current = null;
            if (data.run) {
                setActiveId(data.run.id);
                setView(v => v ? { ...v, runs: [...v.runs.filter(r => r.id !== data.run.id), data.run] } : v);
                setConclusion(data.run.conclusion ?? "");
            }
            try {
                await refresh(data.run?.id ?? activeId);
            }
            catch {
                setError("Sauvegarde confirmée ; actualisation indisponible. Rechargez avant la prochaine commande.");
            }
            setStatus("saved");
        }
        catch (e) {
            setStatus("failed");
            setError(e instanceof Error ? e.message : "Échec de sauvegarde");
        }
        finally {
            busy.current = false;
        }
    }
    function action(command: string, fields: Record<string, unknown> = {}) {
        if (!run)
            return;
        void mutate({ command, id: run.id, expectedVersion: run.version, ...fields });
    }
    function dirty() { setStatus("idle"); setConflict(null); pending.current = null; }
    const controlClass = "rounded border border-[var(--pb-border)] bg-transparent p-2";
    return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <header><p className="text-sm">Recette jetable · identité serveur</p><h1 className="text-2xl font-semibold">Cadrage Clients</h1>
      <p>Grand livre, auxiliaire et balance âgée à la clôture. Revue du cadrage et de ses résidus.</p></header>
    <form onSubmit={e => { e.preventDefault(); void load(); }} className="flex flex-wrap gap-3 rounded-xl border border-[var(--pb-border)] p-4">
      <label>Dossier<input aria-label="Dossier" className={controlClass} value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); dirty(); }}/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((key, i) => <label key={key}>{["Début", "Clôture", "Date de revue"][i]}<input type="date" className={controlClass} value={period[key]} required disabled={saving || loading} onChange={e => { setPeriod(p => ({ ...p, [key]: e.target.value })); setView(null); dirty(); }}/></label>)}
      <button className={controlClass} disabled={saving || loading}>{loading ? "Chargement…" : "Charger le cadrage"}</button>
    </form>
    <p role="status" aria-live="polite">{saveLabels[status]}{run ? " · Révision " + run.revision + " · Version courante " + run.version : ""}</p>
    {error && <p role="alert">{error}</p>}
    {status === "failed" && pending.current && <button className={controlClass} onClick={() => { const p = pending.current!; void mutate(p.body, p.imports, p.key); }}>Réessayer la même commande</button>}
    {conflict && <section role="alert" className="space-y-3 rounded-xl border border-amber-600 p-4">
      <h2>Une autre modification a été sauvegardée</h2>
      <div className="grid gap-4 md:grid-cols-2"><div><h3>Votre brouillon · version {conflict.expectedVersion}</h3><p className="whitespace-pre-wrap">{conclusion}</p><p>État de départ : {run?.state}</p></div>
        <div><h3>Version serveur {conflict.current.version}</h3><p className="whitespace-pre-wrap">{conflict.current.conclusion ?? "Aucune conclusion"}</p><p>État : {conflict.current.state} · Dernier auteur : {conflict.current.events.at(-1)?.actorId}</p>
          <p>Sources : {conflict.current.importIds.length} · Notes : {conflict.current.notes.length}</p></div></div>
      <button className={controlClass} onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setConflict(null); setStatus("idle"); }}>Conserver mon texte sur la version courante</button>{" "}
      <button className={controlClass} onClick={() => { setConclusion(conflict.current.conclusion ?? ""); setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setConflict(null); setStatus("idle"); }}>Reprendre le texte serveur</button>
    </section>}
    {view && <>
      <p>Identité connectée : {view.actorId}{run ? " · Préparateur réel : " + run.preparedBy : ""}</p>
      <section className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4">
        <h2 className="font-semibold">1. Imports et mapping approuvés</h2>
        {canPrepare && <form className="space-y-3" onSubmit={e => {
                    e.preventDefault();
                    if (!file)
                        return;
                    const data = new FormData();
                    data.set("file", file);
                    data.set("documentType", type);
                    data.set("period", JSON.stringify(period));
                    data.set("mapping", JSON.stringify({ version: "clients-frame-1", headerRow: 1, columns: { key: columns.key, amount: columns.amount, date: columns.date },
                        delimiter: format.delimiter, decimal: format.decimal, dateFormat: format.dateFormat, sign: Number(format.sign), currency: "EUR",
                        ...(columns.sheet ? { sheet: columns.sheet } : {}), clients: { accountColumn: columns.account, ...(columns.party ? { partyColumn: columns.party } : {}), basis: "closing_balance" } }));
                    void mutate(data, true);
                }}>
          <div className="flex flex-wrap gap-3"><label>Source<select className={controlClass} value={type} disabled={saving} onChange={e => setType(e.target.value as keyof typeof sourceLabels)}>{Object.entries(sourceLabels).map(([t, label]) => <option key={t} value={t}>{label}</option>)}</select></label>
            <label>Fichier CSV ou XLSX (3 Mio maximum)<input type="file" accept=".csv,.xlsx" required disabled={saving} onChange={e => { setFile(e.target.files?.[0] ?? null); dirty(); }}/></label></div>
          <p>Soldes signés en EUR à la date de clôture ; comptes 41. L’auxiliaire et la balance âgée doivent identifier le client.</p>
          <div className="grid gap-2 sm:grid-cols-3">{Object.entries(columns).map(([key, value]) => <label key={key}>{({ key: "Colonne identifiant", amount: "Colonne solde", date: "Colonne date", account: "Colonne compte", party: "Colonne client (facultative pour GL)", sheet: "Feuille XLSX" } as Record<string, string>)[key]}
            <input className={controlClass} value={value} disabled={saving} required={["key", "amount", "date", "account"].includes(key)} onChange={e => { setColumns(c => ({ ...c, [key]: e.target.value })); dirty(); }}/></label>)}</div>
          <div className="flex flex-wrap gap-3"><label>Séparateur<select className={controlClass} value={format.delimiter} disabled={saving} onChange={e => setFormat(f => ({ ...f, delimiter: e.target.value }))}><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={"\t"}>Tabulation</option></select></label>
            <label>Décimales<select className={controlClass} value={format.decimal} disabled={saving} onChange={e => setFormat(f => ({ ...f, decimal: e.target.value }))}><option value=".">Point</option><option value=",">Virgule</option></select></label>
            <label>Dates<select className={controlClass} value={format.dateFormat} disabled={saving} onChange={e => setFormat(f => ({ ...f, dateFormat: e.target.value }))}><option value="ISO">AAAA-MM-JJ</option><option value="DD/MM/YYYY">JJ/MM/AAAA</option></select></label>
            <label>Convention de signe<select className={controlClass} value={format.sign} disabled={saving} onChange={e => setFormat(f => ({ ...f, sign: e.target.value }))}><option value="1">Débiteurs positifs</option><option value="-1">Inverser les signes sources</option></select></label></div>
          <button className={controlClass} disabled={saving}>Analyser et sauvegarder l’aperçu</button>
        </form>}
        {view.imports.map(batch => <article key={batch.id} className="space-y-2 border-t pt-2">
          <h3>{sourceLabels[batch.document.documentType as keyof typeof sourceLabels]} · {batch.document.fileName}</h3>
          <p>{batch.rowCount ?? batch.rows.length} lignes · Total normalisé {batch.report.normalizedTotal.amount} EUR · {batch.approval ? "Approuvé par " + batch.approval.actorId : "Mapping à approuver"}
            {view.sourceHeads.some(h => h.import_id === batch.id) ? " · Source courante" : batch.approval ? " · Ancienne source conservée" : ""}</p>
          <details><summary>Comparer les cinq premières lignes aux sources</summary><p>{batch.report.warnings.join(" · ")} {batch.report.blocking.join(" · ")}</p>
            <pre tabIndex={0} className="overflow-auto text-xs">{JSON.stringify(batch.rows.slice(0, 5).map(r => ({ source: r.original, normalise: r.normalized, localisateur: r.locator })), null, 2)}</pre></details>
          {!batch.approval && canPrepare && <button className={controlClass} disabled={saving || !!batch.report.blocking.length} onClick={() => void mutate({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash,
                        expectedSourceId: view.sourceHeads.find(h => h.document_type === batch.document.documentType)?.import_id ?? null }, true)}>Approuver ce mapping</button>}
          {view.permissions.includes("download") && <a className="underline" href={endpoint() + "&operation=download&id=" + encodeURIComponent(batch.document.id)}>Télécharger cette version source</a>}
        </article>)}
      </section>
      <section className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4"><h2 className="font-semibold">2. Population figée et calcul versionné</h2>
        {view.runs.length > 0 && <label>Feuille<select className={controlClass} disabled={saving} value={activeId} onChange={e => { const selected = view.runs.find(r => r.id === e.target.value)!; setActiveId(selected.id); setConclusion(selected.conclusion ?? ""); dirty(); }}>
          {view.runs.map(r => <option value={r.id} key={r.id}>Révision {r.revision} · {r.state} · v{r.version}</option>)}</select></label>}
        {!run && canPrepare && <button className={controlClass} disabled={saving} onClick={() => void mutate({ command: "create", period, instanceKey: "clients-framing-pilot" })}>Créer la feuille pilote</button>}
        {run && !current && <p role="alert">Une source a été remplacée. Cette décision reste attachée à ses anciennes sources ; créez une révision pour reprendre.</p>}
        {run?.state === "draft" && canPrepare && <button className={controlClass} disabled={saving || view.sourceHeads.length !== 3 || !current} onClick={() => action("freeze", { importIds: view.sourceHeads.map(h => h.import_id) })}>Figer la population complète</button>}
        {run?.state === "ready" && canPrepare && <button className={controlClass} disabled={saving || !current} onClick={() => action("execute")}>Exécuter le cadrage</button>}
        {run && canPrepare && <button className={controlClass} disabled={saving} onClick={() => action("revise")}>Créer une nouvelle révision</button>}
      </section>
      {run && <section className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4"><h2 className="font-semibold">3. Exceptions et conclusion</h2>
        <label className="block">Conclusion<textarea aria-label="Conclusion" className={"block w-full " + controlClass} value={conclusion} disabled={saving || !editable || !current} onChange={e => { setConclusion(e.target.value); dirty(); }}/></label>
        {editable && <button className={controlClass} disabled={saving || !conclusion.trim() || !current} onClick={() => action("conclude", { text: conclusion })}>Sauvegarder la conclusion</button>}
        {editable && <><label className="block">Commentaire ou justification<textarea className={"block w-full " + controlClass} value={comment} disabled={saving || !current} onChange={e => { setComment(e.target.value); dirty(); }}/></label>
          <label><input type="checkbox" checked={blocking} disabled={saving} onChange={e => setBlocking(e.target.checked)}/> Bloquer la revue tant que le point est ouvert</label>
          <button className={controlClass} disabled={saving || !comment.trim() || !current} onClick={() => action("note", { note: { id: crypto.randomUUID(), kind: "observation", text: comment, amount: { kind: "unknown", reason: "Observation à documenter" }, blocking } })}>Ajouter le commentaire</button>
          {run.notes.filter(n => !n.resolution).map(n => <p key={n.id}>{n.text} <button className={controlClass} disabled={saving || !comment.trim() || !current} onClick={() => action("resolve", { noteId: n.id, text: comment })}>Documenter le traitement avec ce texte</button></p>)}</>}
      </section>}
      {run && <section className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4"><h2 className="font-semibold">4. Soumission, revue et verrouillage</h2>
        {run.state === "executed" && canPrepare && <button className={controlClass} disabled={saving || !current || conclusion !== run.conclusion} onClick={() => action("submit")}>Soumettre cette version</button>}
        {run.state === "awaiting_review" && canReview && <><label>Note de revue<textarea className={"block w-full " + controlClass} value={review} disabled={saving} onChange={e => { setReview(e.target.value); dirty(); }}/></label>
          {(["approved", "changes_requested"] as const).map(decision => <button key={decision} className={controlClass} disabled={saving || !review.trim() || !current} onClick={() => action("review", { decision, text: review, submittedHash: run.submittedHash })}>{decision === "approved" ? "Approuver le cadrage" : "Demander une correction"}</button>)}</>}
        {run.state === "awaiting_review" && !canReview && <p>Une autre identité autorisée doit revoir cette version.</p>}
        {run.state === "approved" && canReview && <button className={controlClass} disabled={saving || !current} onClick={() => action("lock")}>Verrouiller cette version approuvée</button>}
        {run.approval && <p>Décision de {run.approval.actorId} · {run.approval.at} · Version {run.approval.version}</p>}
      </section>}
      <WorkpaperPanel runs={run ? [run] : []} durable/>
    </>}
  </main>;
}

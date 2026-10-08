"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { ImportBatch } from "@/lib/workpapers/imports";
import { type MissionFilter } from "@/lib/workpapers/client-mission";
import type { ClientsSalesDraft, ClientsSalesFacts, ClientsFramingReference } from "@/lib/workpapers/clients-sales";
import { ClientReceivablesPanel } from "./ClientReceivablesPanel";
import { ClientsSalesImportForm } from "./ClientsSalesImportForm";
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
    salesFacts?: Record<string, ClientsSalesFacts | null>;
    salesFactsIssues?: Record<string,string>;
    salesFraming?: Record<string, ClientsFramingReference | null>;
    currentVersions?: Record<string, number>;
    lineageCurrent?: Record<string, { id: string; version: number; revision: number }>;
};
const sourceLabels = { clients_general: "Grand livre Clients", clients_auxiliary: "Auxiliaire Clients", clients_aged: "Balance âgée" };
const salesLabels = { clients_invoices: "Factures ouvertes à clôture", clients_payments: "Encaissements ultérieurs", clients_credits: "Avoirs ultérieurs", clients_support: "Registre des pièces" };
function salesDraft(run: WorkpaperRun): ClientsSalesDraft | null {
    const w = run.clientsWork; if (!w) return null;
    const { documentVersionIds: _documents, ...window } = w.window; void _documents;
    const unstamp = <T extends {authorId:string;authoredAt:string}>(v:T) => { const {authorId:_author,authoredAt:_at,version:_version,...value}=v as T & {version?:number}; void _author;void _at;void _version;return value; };
    return { window, creditsAbsence:w.creditsAbsence, allocations:w.allocations.map(unstamp), estimates:w.estimates.map(unstamp), confirmations:w.confirmations.map(unstamp) };
}
function draftSummary(draft: ClientsSalesDraft | null) {
    return draft ? <><p>Fenêtre : {draft.window.startDate} → {draft.window.endDate} · {draft.window.coverage}</p><p>{draft.allocations.map(a => `${a.paymentId} → ${a.invoiceId} : ${a.amount.amount} EUR (${a.status === "validated" ? "validation demandée" : "proposition"})`).join(" ; ") || "Aucune allocation"}</p><p>{draft.estimates.map(e => `${e.invoiceId} : base ${e.base.amount}, estimation ${e.amount.amount} EUR, méthode ${e.method?.id ?? "absente"} ; ${e.rationale}`).join(" ; ") || "Aucune estimation"}</p><p>{draft.confirmations.map(c => `${c.invoiceIds.join(", ")} : ${c.response?.origin ?? "réponse absente"} ; ${c.reconciliation.status}`).join(" ; ") || "Aucune confirmation"}</p></> : <p>Aucun travail Clients sauvegardé</p>;
}
const initialPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
const saveLabels: Record<SaveState, string> = { idle: "Modifications non sauvegardées", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
function failureMessage(code?: string) {
    const labels: Record<string, string> = {
        CLIENTS_DURABLE_DISABLED: "Ce parcours doit être activé dans un environnement de recette.",
        CLIENTS_DURABLE_UNAVAILABLE: "Le service de sauvegarde est indisponible. Réessayez la même commande.",
        SESSION_INVALID: "Votre session a expiré. Reconnectez-vous pour reprendre.",
        AUTHENTICATION_REQUIRED: "Connectez-vous pour accéder à ce dossier.",
        FORBIDDEN: "Votre identité ne dispose pas de la permission nécessaire.",
        RESOURCE_NOT_FOUND: "Ce dossier est introuvable dans votre périmètre autorisé.",
        CLIENT_SOURCE_REPLACED_REVISION_REQUIRED: "Une source a été remplacée. Rechargez puis créez une nouvelle révision.",
        CLIENT_FRAMING_VERSION_REPLACED: "Le cadrage lié a changé. Créez une révision Clients reliée à sa version courante verrouillée.",
        CLIENT_FRAMING_LOCKED_REQUIRED: "Verrouillez d’abord le cadrage après une revue par une autre identité autorisée.",
        CLIENT_SALES_ALLOCATION_PARTY_MISMATCH: "Le tiers de l’encaissement ou de l’avoir ne correspond pas à la facture.",
        CLIENT_SALES_PAYMENT_OVERALLOCATED: "Cet encaissement a déjà été utilisé au-delà de son montant disponible.",
        CLIENT_SALES_INVOICE_OVERALLOCATED_AT_DATE: "L’affectation dépasse le reste disponible de la facture.",
        CLIENT_SALES_CURRENCY_UNSUPPORTED: "Ce calcul validé prend en charge les montants EUR uniquement.",
        CLIENT_SALES_SOURCES_REQUIRED: "Approuvez les factures ouvertes et les encaissements ultérieurs, puis documentez les avoirs ou leur absence.",
        CLIENT_SOURCE_HEAD_CONFLICT: "Une autre source a été approuvée. Rechargez avant de confirmer votre mapping.",
        UNRESOLVED_BLOCKING_NOTE: "Documentez le traitement des points bloquants avant l’approbation.",
        SELF_APPROVAL_FORBIDDEN: "Une autre identité autorisée doit approuver cette version.",
        PREPARATION_INCOMPLETE: "Une conclusion et les preuves du cadrage sont nécessaires avant la soumission.",
        PREPARATION_EDIT_FORBIDDEN: "Cette version ne peut plus être modifiée par votre identité. Créez une révision si nécessaire.",
        WORKPAPER_TRANSITION_FORBIDDEN: "Cette action ne correspond plus à l’état de la feuille. Rechargez sa version courante.",
        CLIENT_CLOSING_BALANCE_REQUIRED: "Chaque ligne doit contenir un solde valide à la date de clôture.",
        CLIENT_ACCOUNT_REQUIRED: "Vérifiez la colonne compte : ce cadrage attend des comptes Clients commençant par 41.",
        CLIENT_PARTY_REQUIRED: "Chaque ligne de la colonne client doit identifier le client concerné.",
        CLIENT_PARTY_COLUMN_REQUIRED: "Renseignez la colonne client pour l’auxiliaire et la balance âgée.",
        MAPPING_COLUMNS_INVALID: "Vérifiez les noms des colonnes du mapping dans votre fichier.",
        CLIENT_FILE_LIMIT: "Le fichier dépasse la limite de 3 Mio de cette recette.",
        CLIENT_BODY_LIMIT: "L’import dépasse la taille autorisée pour cette recette.",
        CLIENT_PREVIEW_LIMIT: "L’aperçu contient trop de données pour cette recette limitée.",
        CLIENT_STATE_LIMIT: "La feuille contient trop de données pour cette recette limitée.",
    };
    return code && labels[code] ? labels[code] : "L’opération a été refusée. Rechargez la feuille et vérifiez ses sources, sa période et vos permissions.";
}
export function ClientFramingWorkspace({ initialDossierId = "", initialPeriodValue = initialPeriod, requested }: {
    initialDossierId?: string;
    initialPeriodValue?: AccountingPeriod;
    requested?: { periodId: string; id?: string; version?: number; filter: MissionFilter; noteId?: string; procedure?: "clients.sales" };
}) {
    const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodValue);
    const [view, setView] = useState<View | null>(null), [activeId, setActiveId] = useState("");
    const [conclusion, setConclusion] = useState(""), [comment, setComment] = useState(""), [review, setReview] = useState("");
    const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
    const [conflict, setConflict] = useState<{
        current: WorkpaperRun;
        expectedVersion: number;
    } | null>(null);
    const [draftOverride, setDraftOverride] = useState<{id:string;draft:ClientsSalesDraft|null}|null>(null);
    const salesDraftRef = useRef<ClientsSalesDraft|null>(null);
    const [file, setFile] = useState<File | null>(null), [type, setType] = useState<keyof typeof sourceLabels>("clients_general");
    const [columns, setColumns] = useState({ key: "id", amount: "amount", date: "date", account: "account", party: "party", sheet: "" });
    const [format, setFormat] = useState({ delimiter: ";", decimal: ".", dateFormat: "ISO", sign: "1" });
    const [exactVersion] = useState(!!requested?.id && requested.version !== undefined);
    const [resolvedNoteId, setResolvedNoteId] = useState<string | null>(null);
    const [sheetFilter, setSheetFilter] = useState<MissionFilter>(requested?.filter ?? "all");
    const [blocking, setBlocking] = useState(true);
    const busy = useRef(false), csrf = useRef(""), pending = useRef<{
        body: Record<string, unknown> | FormData;
        imports: boolean;
        key: string;
    } | null>(null);
    const run = view?.runs.find(r => r.id === activeId) ?? null;
    const isSales = run?.template.id === "clients.sales";
    const serverSalesDraft = useMemo(() => run ? salesDraft(run) : null, [run]);
    const panelDraft = draftOverride && run && draftOverride.id === run.id ? draftOverride.draft : serverSalesDraft;
    const canPrepare = !exactVersion && !!view?.permissions.includes("prepare"), canReview = !exactVersion && !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
    const current = run ? view?.sourcesCurrent[run.id] !== false : true;
    const editable = !!run && ["draft", "executed"].includes(run.state) && canPrepare && run.preparedBy === view?.actorId;
    const saving = status === "saving";
    const endpoint = (imports = false) => "/api/workpapers/clients" + (imports ? "/imports" : "") + "?dossierId=" + encodeURIComponent(dossierId) + "&periodId=" + encodeURIComponent(requested?.periodId || periodId(period));
    async function session() {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const identity = await response.json();
        if (!response.ok || !identity.authenticated || !identity.csrfToken)
            throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
        csrf.current = identity.csrfToken;
    }
    async function refresh(preferred?: string, keepDraft = false) {
        const response = await fetch(endpoint() + (exactVersion ? "&operation=version&id=" + encodeURIComponent(requested!.id!) + "&version=" + requested!.version : ""), { cache: "no-store" });
        const data = await response.json();
        if (!response.ok)
            throw new Error(failureMessage(data.error));
        setView(data);
        const selected = data.runs.find((r: WorkpaperRun) => r.id === (preferred || requested?.id)) ?? data.runs.filter((r:WorkpaperRun) => r.template.id === (requested?.procedure ?? "clients.frame")).at(-1) ?? data.runs.at(-1);
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
    useEffect(() => {
        if (!initialDossierId || !requested?.periodId) return;
        let active = true;
        setLoading(true);
        void (async () => {
            try {
                const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" }), identity = await sessionResponse.json();
                if (!sessionResponse.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
                const q = new URLSearchParams({ dossierId: initialDossierId, periodId: requested.periodId, ...(requested.id ? { id: requested.id, ...(requested.version !== undefined ? { operation: "version", version: String(requested.version) } : {}) } : {}) });
                const response = await fetch("/api/workpapers/clients?" + q, { cache: "no-store" }), data = await response.json();
                if (!response.ok) throw new Error(failureMessage(data.error));
                if (!active) return;
                csrf.current = identity.csrfToken; setView(data);
                const selected = data.runs.find((r: WorkpaperRun) => r.id === requested.id) ?? data.runs.filter((r:WorkpaperRun) => r.template.id === (requested.procedure ?? "clients.frame")).at(-1) ?? data.runs.find((r:WorkpaperRun) => r.template.id === "clients.frame") ?? data.runs.at(-1);
                if (selected) { setActiveId(selected.id); setPeriod(selected.period); setConclusion(selected.conclusion ?? ""); }
            } catch (e) { if (active) setError(e instanceof Error ? e.message : "Chargement impossible"); }
            finally { if (active) setLoading(false); }
        })();
        return () => { active = false; };
    }, [initialDossierId, requested]);
    useEffect(() => {
        if (!loading && requested?.noteId && run) document.getElementById("wp-note-" + encodeURIComponent(requested.noteId))?.focus();
    }, [loading, requested?.noteId, run]);
    async function mutate(body: Record<string, unknown> | FormData, imports = false, key = crypto.randomUUID()) {
        if (busy.current)
            return;
        const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const scroll = { x: window.scrollX, y: window.scrollY };
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
                throw new Error(failureMessage(data.error));
            }
            if (!data.run && !data.batch)
                throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
            pending.current = null;
            if (data.run) {
                setDraftOverride(null); salesDraftRef.current = null;
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
            if (!(body instanceof FormData) && body.command === "resolve") {
                setResolvedNoteId(String(body.noteId));
                requestAnimationFrame(() => { focus?.focus({ preventScroll: true }); window.scrollTo(scroll.x, scroll.y); });
            }
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
    <header><p className="text-sm">Recette jetable · identité serveur</p><h1 className="text-2xl font-semibold">{isSales ? "Clients et ventes" : "Cadrage Clients"}</h1>
      <p>{isSales ? "Encaissements, avoirs et jugement documenté ; cadrage lié à sa version verrouillée." : "Grand livre, auxiliaire et balance âgée à la clôture. Revue du cadrage et de ses résidus."}</p><a className="underline" href={"/clients-framing/synthesis?" + new URLSearchParams({ dossierId, periodId: requested?.periodId || periodId(period), ...(run ? { rootId: run.rootId, id:run.id, version:String(run.version) } : {}) })}>Ouvrir la Revue et Synthèse de mission</a></header>
    <style>{`@keyframes pb-exception-resolved{from{background:#293d54}to{background:transparent}}.pb-exception-resolved{animation:pb-exception-resolved 180ms ease-out}@media(prefers-reduced-motion:reduce){.pb-exception-resolved{animation:none}}`}</style>
    <form onSubmit={e => { e.preventDefault(); void load(); }} className="flex flex-wrap gap-3 rounded-xl border border-[var(--pb-border)] p-4">
      <label>Dossier<input aria-label="Dossier" className={controlClass} value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); dirty(); }}/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((key, i) => <label key={key}>{["Début", "Clôture", "Date de revue"][i]}<input type="date" className={controlClass} value={period[key]} required disabled={saving || loading} onChange={e => { setPeriod(p => ({ ...p, [key]: e.target.value })); setView(null); dirty(); }}/></label>)}
      <button className={controlClass} disabled={saving || loading}>{loading ? "Chargement…" : "Charger le cadrage"}</button>
    </form>
    <p role="status" aria-live="polite">{saveLabels[status]}{run ? " · Révision " + run.revision + (exactVersion ? " · Version affichée " : " · Version courante ") + run.version : ""}</p>
    {error && <p role="alert">{error}</p>}
    {status === "failed" && pending.current && <button className={controlClass} onClick={() => { const p = pending.current!; void mutate(p.body, p.imports, p.key); }}>Réessayer la même commande</button>}
    {conflict && <section role="alert" className="space-y-3 rounded-xl border border-amber-600 p-4">
      <h2>Une autre modification a été sauvegardée</h2>
      <div className="grid gap-4 md:grid-cols-2"><div><h3>Votre brouillon · version {conflict.expectedVersion}</h3><p className="whitespace-pre-wrap">{conclusion}</p><p>État de départ : {run?.state}</p>{isSales && draftSummary(salesDraftRef.current ?? panelDraft)}</div>
        <div><h3>Version serveur {conflict.current.version}</h3><p className="whitespace-pre-wrap">{conflict.current.conclusion ?? "Aucune conclusion"}</p><p>État : {conflict.current.state} · Dernier auteur : {conflict.current.events.at(-1)?.actorId}</p>
          <p>Sources : {conflict.current.importIds.length} · Notes : {conflict.current.notes.length}</p>{isSales && draftSummary(salesDraft(conflict.current))}</div></div>
      <button className={controlClass} onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setDraftOverride({id:conflict.current.id,draft:salesDraftRef.current ?? panelDraft}); setConflict(null); setStatus("idle"); }}>Conserver mon brouillon sur la version courante</button>{" "}
      <button className={controlClass} onClick={() => { setConclusion(conflict.current.conclusion ?? ""); setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setDraftOverride(null); salesDraftRef.current = null; setConflict(null); setStatus("idle"); }}>Reprendre le contenu serveur</button>
    </section>}
    {view && <>
      {exactVersion && <section className="rounded border border-[var(--pb-border)] p-4"><p>Examen de la version {run?.version} · version courante {run ? view.currentVersions?.[run.id] ?? "inconnue" : "—"}. {run && view.lineageCurrent?.[run.rootId] && `Révision courante ${view.lineageCurrent[run.rootId].revision}, version ${view.lineageCurrent[run.rootId].version}.`} Vue en lecture seule.</p><a className="underline" href={run ? "/clients-framing?" + new URLSearchParams({ dossierId: run.scope.dossierId, periodId: run.scope.periodId, id: view.lineageCurrent?.[run.rootId]?.id ?? run.id }) : "/clients-framing"}>Travailler sur la version courante</a></section>}
      <nav aria-label="Filtre de la feuille" className="flex flex-wrap gap-2">{(["all","blocked","exceptions","evidence","review","stale"] as MissionFilter[]).map(f => <button key={f} className="rounded border px-3 py-1" aria-pressed={sheetFilter === f} onClick={() => setSheetFilter(f)}>{{all:"Toute la feuille",blocked:"Blocages",exceptions:"Exceptions",evidence:"Pièces",review:"Revue",stale:"Périmé"}[f]}</button>)}</nav>
      <p>Identité connectée : {view.actorId}{run ? " · Préparateur réel : " + run.preparedBy : ""}</p>
      <section className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4">
        <h2 className="font-semibold">1. Imports et mapping approuvés</h2>
        {canPrepare && !isSales && <form className="space-y-3" onSubmit={e => {
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
        {canPrepare && isSales && <ClientsSalesImportForm period={period} busy={saving} onPreview={data => void mutate(data,true)}/>}
        {view.imports.filter(batch => isSales ? batch.document.documentType in salesLabels : batch.document.documentType in sourceLabels).map(batch => <article key={batch.id} className="space-y-2 border-t pt-2">
          <h3>{({...sourceLabels,...salesLabels} as Record<string,string>)[batch.document.documentType]} · {batch.document.fileName}</h3>
          <p>{batch.rowCount ?? batch.rows.length} lignes · Total normalisé {batch.report.normalizedTotal.amount} EUR · {batch.approval ? "Approuvé par " + batch.approval.actorId : "Mapping à approuver"}
            {view.sourceHeads.some(h => h.import_id === batch.id) ? " · Source courante" : batch.approval ? " · Ancienne source conservée" : ""}</p>
          <details><summary>Comparer les cinq premières lignes aux sources</summary><p>{batch.report.warnings.join(" · ")} {batch.report.blocking.join(" · ")}</p>
            <pre tabIndex={0} className="overflow-auto text-xs">{JSON.stringify(batch.rows.slice(0, 5).map(r => ({ source: r.original, normalise: r.normalized, localisateur: r.locator })), null, 2)}</pre></details>
          {!batch.approval && canPrepare && <button className={controlClass} disabled={saving || !!batch.report.blocking.length} onClick={() => void mutate({ command: "approve_import", importId: batch.id, previewHash: batch.previewHash,
                        expectedSourceId: view.sourceHeads.find(h => h.document_type === batch.document.documentType)?.import_id ?? null }, true)}>Approuver ce mapping</button>}
          {view.permissions.includes("download") && <a className="underline" href={endpoint() + "&operation=download&id=" + encodeURIComponent(batch.document.id)}>Télécharger cette version source</a>}
        </article>)}
      </section>
      <section hidden={!["all","blocked","stale"].includes(sheetFilter)} className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4"><h2 className="font-semibold">2. Population figée et calcul versionné</h2>
        {view.runs.length > 0 && <label>Feuille<select className={controlClass} disabled={saving} value={activeId} onChange={e => { const selected = view.runs.find(r => r.id === e.target.value)!; setActiveId(selected.id); setPeriod(selected.period); setConclusion(selected.conclusion ?? ""); setDraftOverride(null); salesDraftRef.current=null; dirty(); }}>
          {view.runs.map(r => <option value={r.id} key={r.id}>{r.template.id === "clients.sales" ? "Clients et ventes" : "Cadrage"} · Révision {r.revision} · {r.state} · v{r.version}</option>)}</select></label>}
        {!run && canPrepare && <button className={controlClass} disabled={saving} onClick={() => void mutate({ command: "create", period, instanceKey: "clients-framing-pilot" })}>Créer la feuille pilote</button>}
        {run && !current && <p role="alert">Une source a été remplacée. Cette décision reste attachée à ses anciennes sources ; créez une révision pour reprendre.</p>}
        {run?.state === "locked" && !isSales && current && canPrepare && <button className={controlClass} disabled={saving} onClick={() => {const linked=view.runs.filter(r=>r.template.id==="clients.sales" && (r.clientsWork?.framing.rootId ?? view.salesFraming?.[r.id]?.rootId)===run.rootId).sort((a,b)=>b.revision-a.revision)[0]; if(linked){setActiveId(linked.id);setPeriod(linked.period);setConclusion(linked.conclusion??"");setDraftOverride(null);salesDraftRef.current=null;dirty();}else void mutate({command:"create_sales",period:run.period,framingId:run.id,framingVersion:run.version});}}>Ouvrir les encaissements, avoirs et jugement</button>}
        {run?.state === "draft" && !isSales && canPrepare && <button className={controlClass} disabled={saving || view.sourceHeads.filter(h => h.document_type in sourceLabels).length !== 3 || !current} onClick={() => action("freeze", { importIds: view.sourceHeads.filter(h => h.document_type in sourceLabels).map(h => h.import_id) })}>Figer la population complète</button>}
        {run?.state === "ready" && canPrepare && <button className={controlClass} disabled={saving || !current} onClick={() => action("execute")}>{isSales ? "Exécuter les travaux Clients" : "Exécuter le cadrage"}</button>}
        {run && canPrepare && <button className={controlClass} disabled={saving} onClick={() => action("revise")}>Créer une nouvelle révision</button>}
      </section>
      {run && isSales && <section hidden={!["all","blocked","exceptions","evidence"].includes(sheetFilter)}>{view.salesFactsIssues?.[run.id] && <p role="alert">Sources à corriger : {failureMessage(view.salesFactsIssues[run.id])}</p>}<ClientReceivablesPanel key={run.id} run={run} draft={panelDraft} facts={view.salesFacts?.[run.id] ?? null} editable={!exactVersion && canPrepare && run.preparedBy===view.actorId && current && ["draft","ready","executed"].includes(run.state)} busy={saving} onDraftChange={draft => {salesDraftRef.current=draft; dirty();}} onConfigure={draft => {salesDraftRef.current=draft;action("configure_sales",{draft});}} onFreeze={input => {const frame=view.salesFraming?.[run.id] ?? run.clientsWork?.framing; if (!frame) {setError("Un cadrage courant verrouillé est nécessaire avant de figer ces travaux.");return;}action("freeze_sales",{...input,importIds:view.sourceHeads.filter(h=>h.document_type in salesLabels).map(h=>h.import_id),framingId:frame.runId,framingVersion:frame.version});}}/></section>}
      {run && <section hidden={!["all","exceptions","blocked"].includes(sheetFilter)} className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4"><h2 className="font-semibold">3. Exceptions et conclusion</h2>
        <label className="block">Conclusion<textarea aria-label="Conclusion" className={"block w-full " + controlClass} value={conclusion} disabled={saving || !editable || !current} onChange={e => { setConclusion(e.target.value); dirty(); }}/></label>
        {editable && <button className={controlClass} disabled={saving || !conclusion.trim() || !current} onClick={() => action("conclude", { text: conclusion })}>Sauvegarder la conclusion</button>}
        {editable && <><label className="block">Commentaire ou justification<textarea className={"block w-full " + controlClass} value={comment} disabled={saving || !current} onChange={e => { setComment(e.target.value); dirty(); }}/></label>
          <label><input type="checkbox" checked={blocking} disabled={saving} onChange={e => setBlocking(e.target.checked)}/> Bloquer la revue tant que le point est ouvert</label>
          <button className={controlClass} disabled={saving || !comment.trim() || !current} onClick={() => action("note", { note: { id: crypto.randomUUID(), kind: "observation", text: comment, amount: { kind: "unknown", reason: "Observation à documenter" }, blocking } })}>Ajouter le commentaire</button>
          {run.notes.map(n => <p key={n.id} id={"note-" + encodeURIComponent(n.id)} className={resolvedNoteId === n.id ? "pb-exception-resolved" : ""}>{n.text} <button id={"resolve-" + encodeURIComponent(n.id)} className={controlClass} aria-disabled={!!n.resolution || saving || !comment.trim() || !current} onClick={() => { if (!n.resolution && !saving && comment.trim() && current) action("resolve", { noteId: n.id, text: comment }); }}>{n.resolution ? "Traitement documenté : " + n.resolution.text : "Documenter le traitement avec ce texte"}</button></p>)}</>}
      </section>}
      {run && <section hidden={!["all","review"].includes(sheetFilter)} className="space-y-3 rounded-xl border border-[var(--pb-border)] p-4"><h2 className="font-semibold">4. Soumission, revue et verrouillage</h2>
        {run.state === "executed" && canPrepare && <button className={controlClass} disabled={saving || !current || conclusion !== run.conclusion} onClick={() => action("submit")}>Soumettre cette version</button>}
        {run.state === "awaiting_review" && canReview && <><label>Note de revue<textarea className={"block w-full " + controlClass} value={review} disabled={saving} onChange={e => { setReview(e.target.value); dirty(); }}/></label>
          {(["approved", "changes_requested"] as const).map(decision => <button key={decision} className={controlClass} disabled={saving || !review.trim() || !current} onClick={() => action("review", { decision, text: review, submittedHash: run.submittedHash })}>{decision === "approved" ? (isSales ? "Approuver les travaux Clients" : "Approuver le cadrage") : "Demander une correction"}</button>)}</>}
        {run.state === "awaiting_review" && !canReview && <p>Une autre identité autorisée doit revoir cette version.</p>}
        {run.state === "approved" && canReview && <button className={controlClass} disabled={saving || !current} onClick={() => action("lock")}>Verrouiller cette version approuvée</button>}
        {run.approval && <p>Décision de {run.approval.actorId} · {run.approval.at} · Version {run.approval.version}</p>}
      </section>}
      <WorkpaperPanel runs={run ? [run] : []} durable filter={sheetFilter} noteId={requested?.noteId}/>
    </>}
  </main>;
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { formatCents, PV_STATUS_KIND, PV_UNCERTAINTY_CODES, type ProvisionDraft, type ProvisionResult } from "@/lib/workpapers/provision-contract";
import { NoEntryList, ProvisionBridgeStrip, ProvisionRegister, type ProvisionFilters, type ProvisionRegisterHandle } from "./ProvisionRegister";
import { ProvisionEventPanel, type ProvisionPanelHandle } from "./ProvisionEventPanel";
import { ProvisionLedgerView } from "./ProvisionLedgerView";
import { ProvisionImportPanel } from "./ProvisionImportPanel";
import { citableOptions, parseCitation, ProvisionPreparation } from "./ProvisionPreparation";
import { dateFr, KIND_LABELS, KIND_ORDER, plural, provisionFailureMessage, STATE_LABELS, type Kind, type ProvisionView } from "./format";
import styles from "../cash/cash.module.css";
import pv from "./provisions.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
export type ProvisionTab = "registre" | "pont" | "exceptions" | "pieces" | "revue";
const TABS: { id: ProvisionTab; label: string }[] = [{ id: "registre", label: "Registre" }, { id: "pont", label: "Pont et cadrage" }, { id: "exceptions", label: "Exceptions" }, { id: "pieces", label: "Pièces" }, { id: "revue", label: "Revue" }];
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
export interface ProvisionRequested { periodId: string; id?: string; version?: number; item?: string; filters: ProvisionFilters; tab?: ProvisionTab }
const resultOf = (run: WorkpaperRun | null): ProvisionResult | null => run?.result?.execution === "completed" && run.template.id === "provisions.register" ? run.result.result as ProvisionResult : null;
const emptyFilters: ProvisionFilters = { kinds: [], type: "", state: "", q: "", view: "grid", focus: "" };

export function ProvisionWorkspace({ initialDossierId = "", requested }: { initialDossierId?: string; requested?: ProvisionRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState<AccountingPeriod>(emptyPeriod);
  const [view, setView] = useState<ProvisionView | null>(null), [activeId, setActiveId] = useState("");
  const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const [tab, setTab] = useState<ProvisionTab>(requested?.tab ?? "registre");
  const [selected, setSelected] = useState<string | null>(requested?.item ?? null);
  const [filters, setFilters] = useState<ProvisionFilters>(requested?.filters ?? emptyFilters);
  const [conclusion, setConclusion] = useState(""), [reviewText, setReviewText] = useState(""), [resolution, setResolution] = useState<Record<string, { text: string; citation: string }>>({});
  const [exactVersion] = useState(!!requested?.id && requested.version !== undefined);
  const busy = useRef(false), csrf = useRef(""), returnFocus = useRef<HTMLElement | null>(null), panelRef = useRef<ProvisionPanelHandle>(null), registerRef = useRef<ProvisionRegisterHandle>(null), tabRefs = useRef<Partial<Record<ProvisionTab, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = view?.runs.find(r => r.id === activeId) ?? null, result = useMemo(() => resultOf(run), [run]);
  const event = result?.events.find(e => e.eventId === selected) ?? null;
  const current = run ? view?.sourcesCurrent[run.id] !== false : true;
  const canPrepare = !exactVersion && !!view?.permissions.includes("prepare"), canReview = !exactVersion && !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
  const editable = !!run && canPrepare && run.preparedBy === view?.actorId && current && ["draft", "ready", "executed"].includes(run.state);
  const saving = status === "saving";
  const endpoint = (imports = false) => "/api/workpapers/provisions" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid });
  // The context (event, filters, view, highlighted movement) lives in the URL: returning to the sheet restores it.
  useEffect(() => {
    if (!dossierId || !pid || typeof window === "undefined") return;
    const q = new URLSearchParams({ dossierId, periodId: pid, ...(run ? { id: run.id } : {}), ...(selected ? { item: selected } : {}), ...(filters.type ? { type: filters.type } : {}), ...(filters.state ? { state: filters.state } : {}),
      ...(filters.kinds.length ? { kinds: filters.kinds.join(",") } : {}), ...(filters.q ? { q: filters.q } : {}), ...(filters.view === "table" ? { view: "table" } : {}), ...(filters.focus ? { focus: filters.focus } : {}), ...(tab !== "registre" ? { tab } : {}) });
    if (exactVersion && requested?.version) q.set("version", String(requested.version));
    window.history.replaceState(null, "", "/provisions?" + q);
  }, [dossierId, pid, run, selected, filters, tab, exactVersion, requested?.version]);

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (preferred?: string, dossier = dossierId, periodKey = pid) => {
    const q = new URLSearchParams({ dossierId: dossier, periodId: periodKey, ...(exactVersion ? { operation: "version", id: requested!.id!, version: String(requested!.version) } : {}) });
    const response = await fetch("/api/workpapers/provisions?" + q, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(provisionFailureMessage(data.error, data.locator));
    setView(data);
    const runs: WorkpaperRun[] = data.runs;
    const chosen = runs.find(r => r.id === (preferred || requested?.id)) ?? [...runs].sort((a, b) => b.revision - a.revision)[0];
    if (chosen) { setActiveId(chosen.id); setPeriod(chosen.period); setConclusion(chosen.conclusion ?? ""); }
    return data as ProvisionView;
  }, [dossierId, pid, exactVersion, requested]);
  const deepLinkLoaded = useRef(false);
  useEffect(() => {
    if (!initialDossierId || !requested?.periodId || deepLinkLoaded.current) return;
    deepLinkLoaded.current = true;
    let active = true; setLoading(true);
    void (async () => { try { await session(); if (active) await refresh(requested.id, initialDossierId, requested.periodId); } catch (e) { if (active) setError(e instanceof Error ? e.message : "Chargement impossible"); } finally { if (active) setLoading(false); } })();
    return () => { active = false; };
  }, [initialDossierId, requested, session, refresh]);
  async function load() {
    setLoading(true); setError(""); setStatus("idle"); setConflict(null);
    try { await session(); await refresh(activeId); } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible"); setView(null); } finally { setLoading(false); }
  }
  async function mutate(body: Record<string, unknown> | FormData, imports = false, key = crypto.randomUUID()) {
    if (busy.current) return;
    busy.current = true; setStatus("saving"); setError(""); setConflict(null);
    try {
      await session();
      const response = await fetch(endpoint(imports), { method: "POST", headers: { "Idempotency-Key": key, "x-probant-csrf": csrf.current, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.current) { setConflict(data); setStatus("conflict"); return; }
        throw new Error(provisionFailureMessage(data.error, data.locator));
      }
      if (!data.run && !data.batch) throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
      try { await refresh(data.run?.id ?? activeId); } catch { setError("Sauvegarde confirmée ; actualisation indisponible. Rechargez avant la prochaine commande."); }
      setStatus("saved");
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Échec de sauvegarde"); }
    finally { busy.current = false; }
  }
  const action = (command: string, fields: Record<string, unknown> = {}) => { if (run) void mutate({ command, id: run.id, expectedVersion: run.version, ...fields }); };
  const focusPanel = useRef(false);
  useEffect(() => { if (focusPanel.current) { focusPanel.current = false; panelRef.current?.focus(); } });
  const open = (eventId: string) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focusPanel.current = true; setSelected(eventId); };
  const returnFromPanel = () => { const t = returnFocus.current; if (t && document.contains(t)) { t.focus(); return; } if (selected) registerRef.current?.focusEvent(selected); };
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus();
  };
  const frozenSources = useMemo(() => run?.population ? run.importIds : view?.expectedSources ?? [], [run, view]);
  const options = useMemo(() => view ? citableOptions(view, frozenSources) : [], [view, frozenSources]);
  const exceptions = result?.exceptions ?? [], openNotes = run?.notes.filter(n => n.blocking && !n.resolution) ?? [];
  const counts: Record<ProvisionTab, number | null> = { registre: result ? result.events.length : run?.population?.items.length ?? null, pont: result ? result.accounts.length : null, exceptions: exceptions.length || null, pieces: view?.imports.filter(b => b.approval).length ?? null, revue: openNotes.length || null };
  const sheetUrl = "/provisions?" + new URLSearchParams({ dossierId, periodId: pid });
  const kindTotals = result ? KIND_ORDER.map(k => [k, result.events.filter(e => PV_STATUS_KIND[e.status] === k).length] as [Kind, number]) : [];

  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/tresorerie">Procédures de mission · Trésorerie</a><a href="/fiscal">Procédures de mission · Fiscalité</a><a href="/stocks">Procédures de mission · Stocks</a><span aria-current="page">Procédures de mission · Provisions et engagements</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable · identité serveur</p><h1>Provisions et engagements</h1>
      <p className={styles.muted}>Un registre unique des risques et engagements — ouverts, nouveaux et clos, avec ou sans écriture — relié au grand livre et à l’annexe. L’outil calcule les ponts et compare l’estimation documentée, l’écriture et l’information publiée ; la probabilité, la qualification et la décision comptable restent humaines.</p></div></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); void load(); }}>
      <label>Dossier<input value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required={!requested?.periodId} disabled={saving || loading || !!requested?.periodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
      <button className={styles.primary} disabled={saving || loading}>{loading ? "Chargement…" : "Charger le registre"}</button>
    </form>
    <div className={styles.context} aria-label="Contexte du dossier">
      <span>Dossier <strong>{dossierId || "—"}</strong></span><span>Organisation <strong>{run?.scope.organizationId ?? "—"}</strong></span>
      <span>Exercice <strong>{period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—"}</strong></span>
      <span>Mode <strong>réel — recette jetable</strong></span><span>Identité <strong>{view?.actorId ?? "non connectée"}</strong></span>
      <span>Confidentiel <strong>{view ? (view.confidentialAccess ? "habilitation présente" : "masqué par le serveur") : "—"}</strong></span>
      <span>Feuille <strong>{run ? `r${run.revision} · v${run.version} · ${STATE_LABELS[run.state] ?? run.state}` : "—"}</strong></span>
      <span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{SAVE_LABELS[status]}</span>
    </div>
    {loading && !view && <p role="status" className={styles.muted}>Lecture de l’état serveur…</p>}
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/connect|session/i.test(error) && <> <a href={"/api/auth/login?returnTo=" + encodeURIComponent(sheetUrl)}>Se connecter</a></>}</p>}
    {conflict && <div role="alert" className={styles.notice} data-tone="danger"><p>Conflit : la feuille est passée en version {conflict.current.version} (attendue {conflict.expectedVersion}). Aucune donnée n’a été écrasée.</p><button type="button" onClick={() => { setConflict(null); void refresh(conflict.current.id); }}>Recharger la version serveur</button></div>}
    {exactVersion && <p className={styles.notice} data-tone="info">Consultation de la version {requested?.version} : lecture seule.</p>}
    {view && !view.confidentialAccess && <p className={styles.notice} data-tone="info">Lecture sans habilitation confidentielle : pour les événements marqués confidentiels, le serveur retire l’obligation décrite, la contrepartie, la méthode, la décision, les scénarios, les estimations et les libellés de pièces confidentielles. Les montants comptabilisés restent visibles.</p>}
    {view && <>
      {!run && <section className={styles.card}><h2>Registre de l’exercice</h2><p className={styles.muted}>Aucune feuille : qualifiez les sources (registre, grand livre, puis mouvements, estimations, annexe, pièces) et créez la feuille.</p>
        {canPrepare && <button type="button" className={styles.primary} disabled={saving || !period.startDate} onClick={() => void mutate({ command: "create", period })}>Créer la feuille Provisions</button>}</section>}
      {run && !current && <p role="alert" className={styles.notice} data-tone="danger">Travail périmé : une source a été remplacée ou ajoutée après le gel. Les résultats affichés portent sur les versions figées. {canPrepare && <button type="button" disabled={saving} onClick={() => action("revise")}>Créer une révision sur les sources courantes</button>}</p>}
      {run ? <>
        <div role="tablist" aria-label="Sections de la feuille" className={styles.tabs}>{TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" id={"pv-tab-" + t.id} aria-controls={"pv-panel-" + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onKeyDown={e => onTabKey(e, i)} onClick={() => setTab(t.id)}>{t.label}{counts[t.id] !== null && <span>{counts[t.id]}</span>}</button>)}</div>
        <div className={styles.workspace}>
          <div className={styles.main} role="tabpanel" id={"pv-panel-" + tab} aria-labelledby={"pv-tab-" + tab}>
            {tab === "registre" && (result ? <>
              <p className={styles.notice} data-tone="info">Résultat {run.result?.outcome === "no_exception_detected" ? "sans différence sur les comparaisons documentées" : run.result?.outcome === "exceptions_detected" ? "avec des différences à examiner" : "non concluant sur une partie du registre"} · {kindTotals.filter(([, n]) => n).map(([k, n]) => KIND_LABELS[k] + " " + n).join(" · ")}. Informations des avocats : {result.lawyers.status === "obtained" ? "obtenues (" + result.lawyers.citation.fileName + ")" : "non obtenues"}. Aucune issue juridique n’est déduite ; aucune formule probabilité × montant n’est appliquée.</p>
              <ProvisionBridgeStrip result={result} focus={filters.focus} onFocus={focus => setFilters(f => ({ ...f, focus }))}/>
              <ProvisionRegister ref={registerRef} result={result} filters={filters} selected={selected} onFilters={setFilters} onOpen={open}/>
              <NoEntryList result={result} onOpen={open}/>
              <details className={styles.card}><summary>Méthode et limites</summary><p>{result.method}</p><ul>{result.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
            </> : <section className={styles.card} aria-labelledby="pv-pop-title"><h2 id="pv-pop-title">Population</h2>
              {run.population ? <><p>{plural(run.selection!.selectedIds.length, "événement de l’exercice", "événements de l’exercice")} sur {run.population.items.length} · {plural(run.selection!.exclusions.length, "exclusion motivée", "exclusions motivées")}. Sources figées : exécutez le calcul (Revue).</p>
                <ul className={styles.list}>{run.selection!.exclusions.map(x => <li key={x.id}><strong>{x.id}</strong> — {x.reason}</li>)}</ul></>
                : <p className={styles.muted}>Population non figée : approuvez les sources (Pièces) puis figez-les avec la déclaration sur les informations des avocats (Revue).</p>}</section>)}
            {tab === "pont" && (result ? <ProvisionLedgerView result={result}/> : <section className={styles.card}><h2>Pont et cadrage</h2><p className={styles.muted}>Feuille non exécutée.</p></section>)}
            {tab === "exceptions" && <section className={styles.card} aria-labelledby="pv-exc-title"><header><h2 id="pv-exc-title">Différences, incertitudes et traitements</h2><span className={styles.muted}>{plural(exceptions.filter(e => !PV_UNCERTAINTY_CODES.includes(e.code)).length, "différence à examiner", "différences à examiner")} · {plural(exceptions.filter(e => PV_UNCERTAINTY_CODES.includes(e.code)).length, "incertitude")}</span></header>
              {!run.notes.length && <p className={styles.muted}>Aucune différence ni note sur cette version.</p>}
              <ul className={styles.list}>{run.notes.map(n => { const r = resolution[n.id] ?? { text: "", citation: "" }, source = exceptions.find(e => "pv-exception:" + e.id === n.id), eventId = source?.eventId; return <li key={n.id} id={"pv-note-" + n.id} tabIndex={-1}>
                <div className={styles.kv}><strong>{n.text}</strong><span>{n.amount.kind === "known" ? formatCents(n.amount.value.amount.replace(".", ""), { signed: !source || !PV_UNCERTAINTY_CODES.includes(source.code) }) : n.amount.reason}</span><span className={styles.muted}>{n.kind} · {n.authorId}</span>{n.resolution ? <span>Traité</span> : n.blocking ? <span>Bloquant ouvert</span> : null}
                  {eventId && <button type="button" onClick={() => { setTab("registre"); open(eventId); }}>Voir l’événement</button>}</div>
                {n.resolution && <p className={styles.muted}>Traitement : {n.resolution.text} — {n.resolution.authorId} · {n.resolution.citation ? n.resolution.citation.fileName + " · version " + n.resolution.citation.documentVersionId.slice(7, 19) + (n.resolution.citation.row ? " · ligne " + n.resolution.citation.row : "") : "sans citation"}</p>}
                {!n.resolution && editable && n.blocking && <div className={styles.fields + " " + pv.resolve}>
                  <label>Traitement documenté<textarea value={r.text} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, text: e.target.value } }))}/></label>
                  <label>Pièce citée (version figée)<select value={r.citation} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, citation: e.target.value } }))}><option value="">Choisir…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                  <button type="button" disabled={saving || !r.text.trim() || !r.citation} onClick={() => action("resolve", { noteId: n.id, text: r.text, citation: parseCitation(r.citation) })}>Enregistrer le traitement cité</button></div>}
              </li>; })}</ul>
              <p className={styles.muted}>Un traitement documenté relie sa justification à une pièce figée et à sa version ; il ne vaut ni validation d’une anomalie ni conclusion juridique.</p>
            </section>}
            {tab === "pieces" && <>
              <ProvisionImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>
              <section className={styles.card} aria-labelledby="pv-frozen-title"><header><h2 id="pv-frozen-title">Sources {run.population ? "figées pour cette version" : "courantes"}</h2></header>
                <ul className={styles.list}>{view.imports.filter(b => frozenSources.includes(b.id)).map(b => <li key={b.id} className={styles.kv}><strong>{b.document.fileName}</strong><span>{b.document.documentType}</span><span className={styles.muted}>version {b.document.id.slice(7, 19)} · SHA-256 {b.document.byteHash.slice(0, 12)}…</span></li>)}</ul></section>
            </>}
            {tab === "revue" && <>
              <ProvisionPreparation key={run.id + ":" + run.version} run={run} view={view} busy={saving} editable={editable} frozenSources={frozenSources} onFreeze={(draft: ProvisionDraft) => action("freeze", { importIds: frozenSources, draft })} onConfigure={(draft: ProvisionDraft) => action("configure", { draft })}/>
              <section className={styles.card} aria-labelledby="pv-review-title"><header><h2 id="pv-review-title">Exécution, conclusion et revue</h2><span className={styles.muted}>État : {STATE_LABELS[run.state] ?? run.state}{run.approval ? " · approuvée par " + run.approval.actorId : ""}</span></header>
                <div className={styles.actions}>{editable && run.state === "ready" && <button type="button" className={styles.primary} disabled={saving} onClick={() => action("execute")}>Calculer les ponts et comparaisons</button>}</div>
                {editable && run.state === "executed" && <><label>Conclusion de la préparation<textarea value={conclusion} disabled={saving} onChange={e => setConclusion(e.target.value)}/></label>
                  <div className={styles.actions}><button type="button" disabled={saving || !conclusion.trim()} onClick={() => action("conclude", { text: conclusion })}>Enregistrer la conclusion</button>
                    <button type="button" className={styles.primary} disabled={saving || !run.conclusion || openNotes.length > 0} onClick={() => action("submit")}>Soumettre à la revue</button>{openNotes.length > 0 && <span className={styles.muted}>{plural(openNotes.length, "point bloquant ouvert", "points bloquants ouverts")}</span>}</div></>}
                {canReview && run.state === "awaiting_review" && <><label>Décision motivée du réviseur<textarea value={reviewText} disabled={saving} onChange={e => setReviewText(e.target.value)}/></label>
                  <div className={styles.actions}><button type="button" className={styles.primary} disabled={saving || !reviewText.trim()} onClick={() => action("review", { decision: "approved", submittedHash: run.submittedHash, text: reviewText })}>Approuver cette version</button>
                    <button type="button" className={styles.danger} disabled={saving || !reviewText.trim()} onClick={() => action("review", { decision: "changes_requested", submittedHash: run.submittedHash, text: reviewText })}>Demander une correction</button></div></>}
                {canReview && run.state === "approved" && <button type="button" className={styles.primary} disabled={saving} onClick={() => action("lock")}>Verrouiller la version approuvée</button>}
                {run.state === "awaiting_review" && !canReview && <p className={styles.muted}>Revue attendue par une autre identité autorisée.</p>}
                {canPrepare && ["locked", "approved", "changes_requested"].includes(run.state) && <button type="button" disabled={saving} onClick={() => action("revise")}>Créer une révision</button>}
                <p className={styles.muted}>Une revue documentée ne vaut ni opinion sur les comptes ni conclusion juridique. Une suite verte sur données synthétiques n’autorise aucune mission réelle.</p>
              </section>
            </>}
          </div>
          <ProvisionEventPanel ref={panelRef} event={event} result={result} view={view} dossierId={dossierId} periodId={pid} onReturn={returnFromPanel}/>
        </div>
      </> : <ProvisionImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>}
      <p className={styles.srOnly} aria-live="polite">{event ? "Fiche ouverte : " + event.eventId + " " + event.label : ""}</p>
    </>}
  </main>;
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import type { ClearanceStatus } from "@/lib/workpapers/cash";
import type { CashDraft } from "@/lib/workpapers/cash-reconciliation";
import { cashResultOf, type CashMissionFilter } from "@/lib/workpapers/cash-mission";
import { CashBridge, type BridgeHandle, type BridgeStepId } from "./CashBridge";
import { CashSuspenseTable, type SuspenseTableHandle } from "./CashSuspenseTable";
import { CashErbPanel } from "./CashErbPanel";
import { CashDetailPanel, type DetailHandle } from "./CashDetailPanel";
import { CashImportPanel } from "./CashImportPanel";
import { CashStatusLegend } from "./CashStatus";
import { cashFailureMessage, dateFr, eur, knownLabel, plural, SOURCE_TYPE_LABELS, STATE_LABELS } from "./format";
import { displayAccounts, draftNotes, serverDraft } from "./view-model";
import type { CashKind, CashView, PanelTarget } from "./types";
import styles from "./cash.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
type Tab = "population" | "tests" | "exceptions" | "pieces" | "revue";
const TABS: { id: Tab; label: string }[] = [{ id: "population", label: "Population" }, { id: "tests", label: "Tests" }, { id: "exceptions", label: "Exceptions" }, { id: "pieces", label: "Pièces" }, { id: "revue", label: "Revue" }];
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
const FILTER_TAB: Record<CashMissionFilter, Tab> = { all: "tests", blocked: "exceptions", exceptions: "exceptions", evidence: "pieces", review: "revue", stale: "population" };
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
export interface CashRequested { periodId: string; id?: string; version?: number; filter: CashMissionFilter; account?: string; item?: string; noteId?: string }

export function CashReconciliationWorkspace({ initialDossierId = "", initialPeriodValue = emptyPeriod, requested }: { initialDossierId?: string; initialPeriodValue?: AccountingPeriod; requested?: CashRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodValue);
  const [view, setView] = useState<CashView | null>(null), [activeId, setActiveId] = useState("");
  const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const [tab, setTab] = useState<Tab>(requested?.item ? "tests" : FILTER_TAB[requested?.filter ?? "all"]);
  const [accountId, setAccountId] = useState(requested?.account ?? ""), [kind, setKind] = useState<CashKind | null>(null), [statusFilter, setStatusFilter] = useState<ClearanceStatus | "none" | null>(null);
  const [sort, setSort] = useState<"date" | "age" | "amount">("date"), [panel, setPanel] = useState<PanelTarget>(requested?.item ? { kind: "item", itemId: requested.item } : null), [step, setStep] = useState<BridgeStepId | null>(null);
  const [draft, setDraft] = useState<CashDraft | null>(null), [conclusion, setConclusion] = useState(""), [comment, setComment] = useState(""), [reviewText, setReviewText] = useState("");
  const [resolvedNoteId, setResolvedNoteId] = useState<string | null>(null), [announce, setAnnounce] = useState("");
  const [exactVersion] = useState(!!requested?.id && requested.version !== undefined);
  const busy = useRef(false), csrf = useRef(""), pending = useRef<{ body: Record<string, unknown> | FormData; imports: boolean; key: string } | null>(null), returnFocus = useRef<HTMLElement | null>(null);
  const bridgeRef = useRef<BridgeHandle>(null), tableRef = useRef<SuspenseTableHandle>(null), detailRef = useRef<DetailHandle>(null), tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = view?.runs.find(r => r.id === activeId) ?? null;
  const result = useMemo(() => cashResultOf(run), [run]), facts = run ? view?.facts[run.id] ?? null : null;
  const accounts = useMemo(() => displayAccounts(result, facts), [result, facts]);
  const account = accounts.find(a => a.accountId === accountId) ?? accounts.find(a => a.inScope) ?? accounts[0] ?? null;
  const server = useMemo(() => serverDraft(run?.cashWork), [run]);
  const current = run ? view?.sourcesCurrent[run.id] !== false : true;
  const canPrepare = !exactVersion && !!view?.permissions.includes("prepare"), canReview = !exactVersion && !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
  const editable = !!run && canPrepare && run.preparedBy === view?.actorId && current && ["draft", "ready", "executed"].includes(run.state) && !!run.population;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(server);
  const saving = status === "saving";
  const endpoint = (imports = false) => "/api/workpapers/cash" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid });

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (preferred?: string, dossier = dossierId, periodKey = pid, keepDraft = false) => {
    const q = new URLSearchParams({ dossierId: dossier, periodId: periodKey, ...(exactVersion ? { operation: "version", id: requested!.id!, version: String(requested!.version) } : {}) });
    const response = await fetch("/api/workpapers/cash?" + q, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(cashFailureMessage(data.error, data.locator));
    setView(data);
    const selected: WorkpaperRun | undefined = data.runs.find((r: WorkpaperRun) => r.id === (preferred || requested?.id)) ?? [...data.runs].sort((a: WorkpaperRun, b: WorkpaperRun) => b.revision - a.revision)[0];
    if (selected) { setActiveId(selected.id); setPeriod(selected.period); setConclusion(selected.conclusion ?? ""); if (!keepDraft) setDraft(serverDraft(selected.cashWork)); }
    return data as CashView;
  }, [dossierId, pid, exactVersion, requested]);
  const deepLinkLoaded = useRef(false);
  useEffect(() => {
    // A deep link (Synthèse → feuille) loads once; later edits of the scope form use the explicit button.
    if (!initialDossierId || !requested?.periodId || deepLinkLoaded.current) return;
    deepLinkLoaded.current = true;
    let active = true; setLoading(true);
    void (async () => { try { await session(); if (active) await refresh(requested.id, initialDossierId, requested.periodId); } catch (e) { if (active) setError(e instanceof Error ? e.message : "Chargement impossible"); } finally { if (active) setLoading(false); } })();
    return () => { active = false; };
  }, [initialDossierId, requested, session, refresh]);
  useEffect(() => { if (!loading && requested?.noteId && run) document.getElementById("cash-note-" + requested.noteId)?.focus(); }, [loading, requested?.noteId, run]);
  async function load() {
    setLoading(true); setError(""); setStatus("idle"); setConflict(null);
    try { await session(); await refresh(activeId); } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible"); setView(null); } finally { setLoading(false); }
  }
  async function mutate(body: Record<string, unknown> | FormData, imports = false, key = crypto.randomUUID()) {
    if (busy.current) return;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null, scroll = { x: window.scrollX, y: window.scrollY };
    busy.current = true; pending.current = { body, imports, key }; setStatus("saving"); setError(""); setConflict(null);
    try {
      await session();
      const response = await fetch(endpoint(imports), { method: "POST", headers: { "Idempotency-Key": key, "x-probant-csrf": csrf.current, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.current) { setConflict(data); setStatus("conflict"); pending.current = null; return; }
        if (response.status < 500) pending.current = null;
        throw new Error(cashFailureMessage(data.error, data.locator));
      }
      if (!data.run && !data.batch) throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
      pending.current = null;
      // An unsaved clearance draft survives unrelated commands (note, conclusion, import); it is replaced only by its own save.
      const keepDraft = dirty && !(body instanceof FormData) && !["configure", "freeze", "revise", "create"].includes(String(body.command));
      try { await refresh(data.run?.id ?? activeId, dossierId, pid, keepDraft); } catch { setError("Sauvegarde confirmée ; actualisation indisponible. Rechargez avant la prochaine commande."); }
      setStatus("saved");
      if (!(body instanceof FormData) && body.command === "resolve") { setResolvedNoteId(String(body.noteId)); requestAnimationFrame(() => { focus?.focus({ preventScroll: true }); window.scrollTo(scroll.x, scroll.y); }); }
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Échec de sauvegarde"); }
    finally { busy.current = false; }
  }
  const action = (command: string, fields: Record<string, unknown> = {}) => { if (run) void mutate({ command, id: run.id, expectedVersion: run.version, ...fields }); };
  // Focus moves are applied after React has rendered the filtered table or the opened panel.
  const focusRequest = useRef<null | { kind: "firstRow"; fallback: BridgeStepId } | { kind: "row"; id: string } | { kind: "panel" }>(requested?.item ? { kind: "row", id: requested.item } : null);
  useEffect(() => {
    const request = focusRequest.current; if (!request) return;
    // A deep-linked row stays pending until the server data has rendered it.
    if (request.kind === "row") { if (tableRef.current?.focusRow(request.id)) focusRequest.current = null; return; }
    focusRequest.current = null;
    if (request.kind === "panel") detailRef.current?.focus();
    else if (!tableRef.current?.focusFirstRow()) bridgeRef.current?.focusStep(request.fallback);
  });
  const openPanel = (target: PanelTarget) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focusRequest.current = { kind: "panel" }; setPanel(target); };
  const onStep = (id: BridgeStepId) => {
    setStep(id);
    if (id === "receipt_in_transit" || id === "outstanding_payment" || id === "other") {
      const next = kind === id ? null : id; setKind(next); setStatusFilter(null);
      const count = account?.items.filter(i => !next || i.kind === next).length ?? 0;
      setAnnounce(count + " suspens affiché" + (count > 1 ? "s" : ""));
      focusRequest.current = { kind: "firstRow", fallback: id };
    } else if (id === "statement" || id === "ledger") openPanel({ kind: "balance", balance: id });
    else openPanel({ kind: "computation", step: id });
  };
  const returnFromPanel = () => {
    const target = returnFocus.current;
    if (target && document.contains(target)) { target.focus(); return; }
    if (panel?.kind === "item" && tableRef.current?.focusRow(panel.itemId)) return;
    bridgeRef.current?.focusStep(step ?? "statement");
  };
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus();
  };
  const showItem = (accountRef: string | null, itemId?: string) => { if (accountRef) setAccountId(accountRef); setTab("tests"); setKind(null); setStatusFilter(null); if (itemId) { setPanel({ kind: "item", itemId }); focusRequest.current = { kind: "row", id: itemId }; } };
  const windowDocumented = draft?.window.coverage === "documented" && draft.window.evidenceImportIds.length > 0;
  const settlementHeads = view?.imports.filter(b => b.document.documentType === "cash_settlements" && b.approval && view.sourceHeads.some(h => h.import_id === b.id)) ?? [];
  const requiredHeads = ["cash_ledger", "cash_statement", "cash_erb"].every(t => view?.sourceHeads.some(h => h.document_type === t));
  const exceptions = result?.exceptions ?? [], openNotes = run?.notes.filter(n => n.blocking && !n.resolution) ?? [];
  const freezeWindow = draft?.window ?? { startDate: "", endDate: period.asOfDate, coverage: "incomplete" as const, note: "", evidenceImportIds: [] };
  const setWindow = (patch: Partial<CashDraft["window"]>) => setDraft(d => ({ ...(d ?? { exclusions: [], allocations: [], corrections: [], window: freezeWindow }), window: { ...(d?.window ?? freezeWindow), ...patch } }));
  useEffect(() => {
    // Before freeze, propose the closing → review window; the preparer documents it explicitly.
    if (run && !run.population && !draft && period.closingDate) { const day = new Date(period.closingDate + "T00:00:00Z"); day.setUTCDate(day.getUTCDate() + 1); setDraft({ window: { startDate: day.toISOString().slice(0, 10), endDate: period.asOfDate, coverage: "incomplete", note: "", evidenceImportIds: [] }, exclusions: [], allocations: [], corrections: [] }); }
  }, [run, draft, period]);
  const windowEditor = (disabled: boolean) => <fieldset className={styles.card} disabled={disabled}>
    <legend className={styles.srOnly}>Fenêtre d’apurement postérieure</legend>
    <header><h3>Fenêtre d’apurement postérieure</h3><span className={styles.muted}>Clôture {period.closingDate ? dateFr(period.closingDate) : "—"} → revue {period.asOfDate ? dateFr(period.asOfDate) : "—"}</span></header>
    <div className={styles.fields}>
      <label>Début (après la clôture)<input type="date" value={freezeWindow.startDate} onChange={e => setWindow({ startDate: e.target.value })}/></label>
      <label>Fin (au plus tard la revue)<input type="date" value={freezeWindow.endDate} onChange={e => setWindow({ endDate: e.target.value })}/></label>
      <label>Couverture<select value={freezeWindow.coverage} onChange={e => setWindow({ coverage: e.target.value as "documented" | "incomplete" })}><option value="incomplete">Incomplète — suspens non testés</option><option value="documented">Documentée par les relevés postérieurs</option></select></label>
    </div>
    <label>Note de documentation<textarea value={freezeWindow.note} onChange={e => setWindow({ note: e.target.value })} placeholder="Relevés obtenus, période couverte, éventuelles lacunes"/></label>
    {settlementHeads.length ? settlementHeads.map(b => <label key={b.id} className={styles.check}><input type="checkbox" checked={freezeWindow.evidenceImportIds.includes(b.id)} onChange={e => setWindow({ evidenceImportIds: e.target.checked ? [...freezeWindow.evidenceImportIds, b.id] : freezeWindow.evidenceImportIds.filter(x => x !== b.id) })}/> Relevés postérieurs « {b.document.fileName} » ({b.rowCount ?? b.rows.length} mouvements)</label>)
      : <p className={styles.notice}>Aucun relevé postérieur approuvé : la fenêtre ne peut pas être documentée et les suspens resteront non testés.</p>}
    {freezeWindow.coverage === "documented" && !freezeWindow.evidenceImportIds.length && <p className={styles.notice} data-tone="danger">Une fenêtre documentée exige au moins un relevé postérieur coché.</p>}
  </fieldset>;

  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/dashboard/tests">Atelier synthétique</a><a href="/clients-framing">Procédures de mission · Clients</a><span aria-current="page">Procédures de mission · Trésorerie</span><a href="/immobilisations">Procédures de mission · Immobilisations</a></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable · identité serveur</p><h1>Trésorerie — pont bancaire et apurement</h1>
      <p className={styles.muted}>Relevé + suspens de l’ERB → GL, compte par compte ; apurement des suspens sur les relevés postérieurs. Aucune opinion automatique.</p></div>
      <a href={"/tresorerie/synthese?" + new URLSearchParams({ dossierId, periodId: pid, ...(run ? { rootId: run.rootId, id: run.id, version: String(run.version) } : {}) })}>Ouvrir la Revue et Synthèse Trésorerie</a></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); void load(); }}>
      <label>Dossier<input value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required disabled={saving || loading || !!requested?.periodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
      <button className={styles.primary} disabled={saving || loading}>{loading ? "Chargement…" : "Charger la feuille"}</button>
    </form>
    <div className={styles.context} aria-label="Contexte du dossier">
      <span>Dossier <strong>{dossierId || "—"}</strong></span><span>Organisation <strong>{run?.scope.organizationId ?? "—"}</strong></span>
      <span>Période <strong>{period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—"}</strong> · revue <strong>{period.asOfDate ? dateFr(period.asOfDate) : "—"}</strong></span>
      <span>Mode <strong>réel — recette jetable</strong></span><span>Identité <strong>{view?.actorId ?? "non connectée"}</strong></span>
      <span>Feuille <strong>{run ? `r${run.revision} · v${run.version} · ${STATE_LABELS[run.state] ?? run.state}` : "—"}</strong></span>
      <span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{status === "idle" && dirty ? "Brouillon d’apurement non sauvegardé" : SAVE_LABELS[status]}</span>
    </div>
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/connect|session/i.test(error) && <> <a href={"/api/auth/login?returnTo=" + encodeURIComponent("/tresorerie?" + new URLSearchParams({ dossierId, periodId: pid }))}>Se connecter</a></>}</p>}
    {status === "failed" && pending.current && <button type="button" onClick={() => { const p = pending.current!; void mutate(p.body, p.imports, p.key); }}>Réessayer la même commande</button>}
    {conflict && <section role="alert" className={styles.card}><h2>Une autre modification a été sauvegardée</h2>
      <div className={styles.sideBySide}><section><h3>Votre brouillon · version {conflict.expectedVersion}</h3><p>{draft ? `${draft.allocations.length} allocation(s), ${draft.corrections.length} correction(s), ${draft.exclusions.length} exclusion(s) ; fenêtre ${draft.window.coverage}` : "Aucun brouillon d’apurement"}</p><p>{conclusion || "Conclusion vide"}</p></section>
        <section><h3>Version serveur {conflict.current.version}</h3><p>{conflict.current.cashWork ? `${conflict.current.cashWork.allocations.length} allocation(s), ${conflict.current.cashWork.corrections.length} correction(s), ${conflict.current.cashWork.exclusions.length} exclusion(s) ; fenêtre ${conflict.current.cashWork.window.coverage}` : "Aucun travail d’apurement"}</p><p>{conflict.current.conclusion ?? "Aucune conclusion"} · état {conflict.current.state} · dernier auteur {conflict.current.events.at(-1)?.actorId}</p></section></div>
      <div className={styles.actions}><button type="button" onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setConflict(null); setStatus("idle"); }}>Conserver mon brouillon sur la version courante</button>
        <button type="button" onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setDraft(serverDraft(conflict.current.cashWork)); setConclusion(conflict.current.conclusion ?? ""); setConflict(null); setStatus("idle"); }}>Reprendre le contenu serveur</button></div>
    </section>}
    {view && <>
      {exactVersion && run && <p className={styles.notice} data-tone="info">Examen en lecture seule de la version {run.version}{view.currentVersions?.[run.id] ? " · version courante " + view.currentVersions[run.id] : ""}. <a href={"/tresorerie?" + new URLSearchParams({ dossierId: run.scope.dossierId, periodId: run.scope.periodId, id: view.lineageCurrent?.[run.rootId]?.id ?? run.id })}>Travailler sur la version courante</a></p>}
      {run && !current && <p role="alert" className={styles.notice} data-tone="danger">Une source a été remplacée : cette version reste attachée à ses anciennes sources et ses décisions restent intactes. Créez une révision pour reprendre.</p>}
      {run && view.factsIssues[run.id] && <p role="alert" className={styles.notice} data-tone="danger">Sources à corriger : {cashFailureMessage(view.factsIssues[run.id].code, view.factsIssues[run.id].locator)}</p>}
      <div className={styles.scopeNote} aria-label="Périmètre de l’écran"><span>Comptes bancaires EUR uniquement</span><span>Caisse et VMP : procédures distinctes, non couvertes ici</span><span>Devises ≠ EUR : exclues, aucune conversion</span><span>Concordance ≠ authenticité</span></div>
      <div role="tablist" aria-label="Navigation de la feuille" className={styles.tabs}>{TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" id={"cash-tab-" + t.id} aria-controls={"cash-panel-" + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={e => onTabKey(e, i)}>
        {t.label}{t.id === "exceptions" && result ? <span>{exceptions.length}</span> : null}{t.id === "population" && accounts.length ? <span>{accounts.length}</span> : null}</button>)}</div>
      <p className={styles.srOnly} role="status" aria-live="polite">{announce}</p>

      {tab === "population" && <div role="tabpanel" id="cash-panel-population" aria-labelledby="cash-tab-population" className={styles.main}>
        <section className={styles.card} aria-labelledby="cash-population-title"><header><h2 id="cash-population-title">Population des comptes de trésorerie</h2><span className={styles.muted}>Unité : compte (banque / référence / devise) du GL de clôture</span></header>
          {accounts.length ? <div className={styles.tableScroll} role="region" aria-label="Population des comptes — défilement clavier" tabIndex={0}><table><caption>Comptes du GL figé ou des sources courantes — exclusions motivées, jamais silencieuses</caption>
            <thead><tr><th scope="col">Compte GL</th><th scope="col">Banque / référence</th><th scope="col">Devise</th><th scope="col">Nature</th><th scope="col" className={styles.money}>Solde GL</th><th scope="col">Périmètre</th></tr></thead>
            <tbody>{accounts.map(a => <tr key={a.accountId}><th scope="row">{a.glAccount}<span className={styles.meaning}>{a.label}</span></th><td>{a.bankId} · {a.accountReference}</td><td>{a.currency}</td><td>{({ bank: "Banque", cash: "Caisse", securities: "VMP" } as Record<string, string>)[a.nature]}</td>
              <td className={styles.money}>{a.fact ? eur(a.fact.balances.ledger.amount) : a.result?.bridge.status !== "excluded" && a.result ? eur(a.result.bridge.ledger.amount) : "—"}</td><td>{a.inScope ? "Testé par le pont" : "Exclu : " + a.exclusionReason}</td></tr>)}</tbody></table></div>
            : <p className={styles.muted}>Population non définie : approuvez le GL de trésorerie à la clôture.</p>}
          {run?.selection && <p className={styles.muted}>Sélection figée : {run.selection.selectedIds.length}/{run.population?.items.length} comptes · {run.selection.criteria}</p>}
        </section>
        <CashImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={command => void mutate({ command: "approve_import", ...command }, true)}/>
        {!run && canPrepare && <section className={styles.card}><h2>Feuille Trésorerie</h2><p>Une seule feuille par dossier et par période ; ses révisions conservent les décisions antérieures.</p><button type="button" className={styles.primary} disabled={saving || !pid} onClick={() => void mutate({ command: "create", period })}>Créer la feuille Trésorerie</button></section>}
        {run && run.state === "draft" && !run.population && canPrepare && <section className={styles.card} aria-labelledby="cash-freeze-title"><h2 id="cash-freeze-title">Figer les sources, la population et la fenêtre</h2>
          {windowEditor(saving)}
          <button type="button" className={styles.primary} disabled={saving || !requiredHeads || !current || (freezeWindow.coverage === "documented" && !freezeWindow.evidenceImportIds.length)} onClick={() => action("freeze", { importIds: view.sourceHeads.filter(h => h.document_type.startsWith("cash_")).map(h => h.import_id), window: freezeWindow })}>Figer les sources courantes</button>
          {!requiredHeads && <p className={styles.muted}>GL, relevés à la clôture et ERB approuvés requis.</p>}</section>}
      </div>}

      {tab === "tests" && <div role="tabpanel" id="cash-panel-tests" aria-labelledby="cash-tab-tests" className={styles.workspace}>
        <div className={styles.main}>
          {accounts.length > 0 && <section className={styles.card} aria-labelledby="cash-accounts-title"><header><h2 id="cash-accounts-title">Compte rapproché</h2><span className={styles.muted}>{accounts.filter(a => a.inScope).length} compte(s) testé(s) · {accounts.filter(a => !a.inScope).length} exclu(s)</span></header>
            <div role="radiogroup" aria-label="Sélecteur de compte" className={styles.accounts} onKeyDown={e => {
              if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key) || !account) return;
              e.preventDefault();
              const index = accounts.findIndex(a => a.accountId === account.accountId), next = accounts[(index + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) + accounts.length) % accounts.length];
              setAccountId(next.accountId); setPanel(null); setKind(null); setStep(null);
              (e.currentTarget.querySelector(`[data-account="${CSS.escape(next.accountId)}"]`) as HTMLElement | null)?.focus();
            }}>{accounts.map(a => <button key={a.accountId} type="button" role="radio" data-account={a.accountId} tabIndex={account?.accountId === a.accountId ? 0 : -1} aria-checked={account?.accountId === a.accountId} onClick={() => { setAccountId(a.accountId); setPanel(null); setKind(null); setStep(null); }}>
              <strong>{a.glAccount} · {a.bankId}</strong><small>{a.accountReference} · {a.currency} · {a.inScope ? "testé" : "exclu"}</small></button>)}</div></section>}
          {!account && <p className={styles.notice}>Aucun compte : approuvez le GL de trésorerie, les relevés et l’ERB, puis figez les sources.</p>}
          {account && !account.inScope && <p className={styles.notice}>Compte {account.glAccount} exclu du pont : {account.exclusionReason}</p>}
          {account?.inScope && <>
            <section className={styles.card} aria-labelledby="cash-bridge-title"><header><h2 id="cash-bridge-title">Pont de rapprochement — {account.label}</h2><span className={styles.muted}>Montants signés en EUR · positif augmente le solde comptable</span></header>
              {account.result?.bridge.status === "computed" ? <CashBridge ref={bridgeRef} bridge={account.result.bridge} active={step} onStep={onStep} counts={{ receipt_in_transit: account.items.filter(i => i.kind === "receipt_in_transit").length, outstanding_payment: account.items.filter(i => i.kind === "outstanding_payment").length, other: account.items.filter(i => i.kind === "other").length }}/>
                : account.result?.bridge.status === "incomplete" ? <p className={styles.notice} data-tone="danger">Pont non calculé : {account.result.bridge.missing.join(" ; ")}. Aucun écart n’est réputé nul.</p>
                : <p className={styles.notice}>Pont non calculé{run?.state === "ready" ? " : exécutez le pont sur les sources figées." : run?.population ? "." : " : figez d’abord les sources dans l’onglet Population."}</p>}
              <p className={styles.notice} data-tone="info">Des totaux concordants ne donnent aucune assurance d’authenticité. Les apurements postérieurs ne modifient jamais les soldes à la clôture.</p>
            </section>
            <section className={styles.card} aria-labelledby="cash-erb-title"><header><h2 id="cash-erb-title">ERB et relevé côte à côte</h2><span className={styles.muted}>Écarts de source distincts de l’écart du pont</span></header>
              <CashErbPanel account={account} active={panel?.kind === "balance" ? panel.balance : null} onBalance={b => openPanel({ kind: "balance", balance: b })}/></section>
            {editable && <>{windowEditor(saving)}</>}
            <section className={styles.card} aria-labelledby="cash-suspense-title"><header><h2 id="cash-suspense-title">Suspens à la clôture</h2><span className={styles.muted}>Fenêtre {result ? dateFr(result.window.startDate) + " → " + dateFr(result.window.endDate) + " · " + (result.window.coverage === "documented" ? "documentée" : "incomplète") : "non calculée"}</span></header>
              <CashSuspenseTable ref={tableRef} items={account.items} kind={kind} status={statusFilter} sort={sort} selectedId={panel?.kind === "item" ? panel.itemId : null} draftNotes={draftNotes(draft, server)}
                onKind={k => { setKind(k); setStep(k); }} onStatus={setStatusFilter} onSort={setSort} onOpen={id => openPanel({ kind: "item", itemId: id })} onBackToBridge={() => bridgeRef.current?.focusStep(step ?? "statement")}/>
              <details><summary>Sens des statuts d’apurement</summary><CashStatusLegend/></details>
            </section>
            {editable && <div className={styles.actions} role="group" aria-label="Brouillon d’apurement">
              <button type="button" className={styles.primary} disabled={saving || !dirty} onClick={() => action("configure", { draft })}>Enregistrer le brouillon d’apurement</button>
              <button type="button" disabled={saving || dirty || run?.state !== "ready"} onClick={() => action("execute")}>Exécuter le pont</button>
              <span className={styles.muted}>{dirty ? "Brouillon modifié — les statuts affichés restent ceux du dernier calcul serveur." : run?.state === "ready" ? "Brouillon enregistré : exécution attendue." : "Résultat à jour du travail enregistré."}</span>
            </div>}
          </>}
        </div>
        <CashDetailPanel ref={detailRef} target={panel} account={account} view={view} dossierId={dossierId} periodId={pid} editable={editable} windowDocumented={windowDocumented} draft={draft} onDraft={setDraft} onReturn={returnFromPanel}/>
      </div>}

      {tab === "exceptions" && <div role="tabpanel" id="cash-panel-exceptions" aria-labelledby="cash-tab-exceptions" className={styles.main}>
        <section className={styles.card} aria-labelledby="cash-exceptions-title"><header><h2 id="cash-exceptions-title">Exceptions et incertitudes du calcul serveur</h2><span className={styles.muted}>Elles restent dans le résultat après revue</span></header>
          {!result ? <p className={styles.muted}>Aucun calcul exécuté pour cette version.</p> : exceptions.length ? <ul className={styles.list}>{exceptions.map(e => <li key={e.id}>
            <div className={styles.kv}><strong>{e.label}</strong><span>{e.accountId ?? "Fenêtre"} · {e.targetId}</span><span className={styles.money}>{knownLabel(e.amount)}</span></div><p>{e.message}</p>
            {e.accountId && <button type="button" onClick={() => showItem(e.accountId, e.code.startsWith("SUSPENSE") ? e.targetId : undefined)}>Voir dans le pont{e.code.startsWith("SUSPENSE") ? " et la ligne " + e.targetId : ""}</button>}</li>)}</ul> : <p>Aucune exception sur le périmètre testé. Cela ne démontre ni l’authenticité des relevés ni l’exhaustivité des comptes.</p>}
        </section>
        {run && <section className={styles.card} aria-labelledby="cash-notes-title"><h2 id="cash-notes-title">Traitements documentés et conclusion</h2>
          <ul className={styles.list}>{run.notes.map(n => <li key={n.id} id={"cash-note-" + n.id} tabIndex={-1} className={resolvedNoteId === n.id ? styles.resolved : undefined}><p>{n.text}</p><p className={styles.muted}>{n.blocking ? "Bloquant" : "Non bloquant"} · {knownLabel(n.amount)} · auteur {n.authorId}</p>
            {n.resolution ? <p>Traitement documenté par {n.resolution.authorId} : {n.resolution.text}</p> : editable && <button type="button" aria-disabled={saving || !comment.trim()} onClick={() => { if (!saving && comment.trim()) action("resolve", { noteId: n.id, text: comment }); }}>Documenter le traitement avec le texte ci-dessous</button>}</li>)}
            {!run.notes.length && <li className={styles.muted}>Aucun point ouvert.</li>}</ul>
          {editable && <label>Traitement ou commentaire<textarea value={comment} onChange={e => setComment(e.target.value)}/></label>}
          {editable && <div className={styles.actions}><button type="button" disabled={saving || !comment.trim()} onClick={() => action("note", { note: { id: crypto.randomUUID(), kind: "observation", text: comment, amount: { kind: "unknown", reason: "Observation à documenter" }, blocking: false } })}>Ajouter comme commentaire non bloquant</button></div>}
          <label>Conclusion du préparateur<textarea aria-label="Conclusion" value={conclusion} disabled={!editable || saving} onChange={e => setConclusion(e.target.value)}/></label>
          {editable && <button type="button" disabled={saving || !conclusion.trim()} onClick={() => action("conclude", { text: conclusion })}>Sauvegarder la conclusion</button>}
        </section>}
      </div>}

      {tab === "pieces" && <div role="tabpanel" id="cash-panel-pieces" aria-labelledby="cash-tab-pieces" className={styles.main}>
        <section className={styles.card} aria-labelledby="cash-pieces-title"><header><h2 id="cash-pieces-title">Index des pièces versionnées</h2><span className={styles.muted}>Originaux téléchargeables séparément avec la même permission</span></header>
          <div className={styles.tableScroll} role="region" aria-label="Index des pièces — défilement clavier" tabIndex={0}><table><caption>Sources du dossier et de la période — courantes et remplacées</caption><thead><tr><th scope="col">Type</th><th scope="col">Pièce</th><th scope="col">Version / SHA-256</th><th scope="col">Approbation</th><th scope="col">Actualité</th></tr></thead>
            <tbody>{view.imports.map(b => <tr key={b.id}><th scope="row">{SOURCE_TYPE_LABELS[b.document.documentType as keyof typeof SOURCE_TYPE_LABELS] ?? b.document.documentType}</th><td>{b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")}</td><td><code>{b.document.id.slice(0, 22)}…</code><br/><code>{b.document.byteHash.slice(0, 16)}…</code></td>
              <td>{b.approval ? b.approval.actorId + " · " + new Date(b.approval.at).toLocaleString("fr-FR") : "Aperçu non approuvé"}</td><td>{view.sourceHeads.some(h => h.import_id === b.id) ? (run?.importIds.includes(b.id) ? "Courante · figée dans la feuille" : "Courante") : b.approval ? "Remplacée — conservée" : "Non approuvée"}{view.permissions.includes("download") && <> · <a href={"/api/workpapers/cash?" + new URLSearchParams({ dossierId, periodId: pid, operation: "download", id: b.document.id })}>original</a></>}</td></tr>)}
              {!view.imports.length && <tr><td colSpan={5}>Aucune pièce importée.</td></tr>}</tbody></table></div>
          {result && <p>Fenêtre : {dateFr(result.window.startDate)} → {dateFr(result.window.endDate)} · {result.window.coverage === "documented" ? "documentée" : "incomplète"} · {result.window.note || "sans note"} · {result.window.evidence.length} pièce(s).</p>}
          <p className={styles.muted}>Une pièce absente ne devient jamais une preuve fournie. Les binaires originaux ne sont pas inclus dans l’export.</p>
        </section>
      </div>}

      {tab === "revue" && <div role="tabpanel" id="cash-panel-revue" aria-labelledby="cash-tab-revue" className={styles.main}>
        <section className={styles.card} aria-labelledby="cash-review-title"><h2 id="cash-review-title">Soumission, revue et verrouillage</h2>
          {!run ? <p className={styles.muted}>Aucune feuille.</p> : <>
            <p>État : <strong>{STATE_LABELS[run.state] ?? run.state}</strong> · préparateur réel {run.preparedBy}{run.approval ? " · approuvé par " + run.approval.actorId + " le " + new Date(run.approval.at).toLocaleString("fr-FR") : ""}</p>
            {openNotes.length > 0 && <p className={styles.notice}>{openNotes.length} point(s) bloquant(s) à documenter avant approbation (onglet Exceptions).</p>}
            {run.state === "executed" && canPrepare && <button type="button" className={styles.primary} disabled={saving || !current || conclusion !== (run.conclusion ?? "")} onClick={() => action("submit")}>Soumettre cette version</button>}
            {run.state === "awaiting_review" && canReview && <><label>Note de revue<textarea value={reviewText} onChange={e => setReviewText(e.target.value)}/></label>
              <div className={styles.actions}>{(["approved", "changes_requested"] as const).map(d => <button key={d} type="button" className={d === "approved" ? styles.primary : undefined} disabled={saving || !reviewText.trim() || !current} onClick={() => action("review", { decision: d, text: reviewText, submittedHash: run.submittedHash })}>{d === "approved" ? "Approuver le pont et l’apurement" : "Demander une correction"}</button>)}</div></>}
            {run.state === "awaiting_review" && !canReview && <p>Une autre identité autorisée doit revoir cette version.</p>}
            {run.state === "approved" && canReview && <button type="button" className={styles.primary} disabled={saving || !current} onClick={() => action("lock")}>Verrouiller cette version approuvée</button>}
            {canPrepare && <div className={styles.actions}><button type="button" className={styles.danger} disabled={saving} onClick={() => action("revise")}>Créer une nouvelle révision</button><span className={styles.muted}>L’ancienne version et ses décisions restent consultables.</span></div>}
            <p className={styles.muted}>Une revue documentée ne vaut pas conformité des comptes. Les exceptions restent dans le résultat.</p>
          </>}
        </section>
      </div>}
    </>}
  </main>;
}

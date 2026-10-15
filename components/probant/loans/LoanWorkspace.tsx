"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DossierScopedInput } from "@/components/probant/DossierScopedInput";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { ReviewKindNotice } from "@/components/probant/ReviewKindNotice";
import { approvalLabel, mayReviewOwnWork } from "@/lib/auth/review-kind";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { LOAN_LABELS, LOAN_TYPES, type LoanResult } from "@/lib/workpapers/loan-review";
import { DAY_COUNT_DEFINITIONS, INTERVAL_CONVENTION_LABEL, LOAN_RULE_VERSION } from "@/lib/workpapers/loan-rules";
import { contentHash, periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { executionProfileLabel } from "@/lib/runtime/profile";
import { LoanDetailPanel, type LoanDetailHandle } from "./LoanDetailPanel";
import { LoanImportPanel } from "./LoanImportPanel";
import { LoanAccrued, LoanContracts, LoanFraming, LoanSchedule, type LoanFilters, type LoanSelection } from "./LoanSchedule";
import { amountLabel, dateFr, loanFailureMessage, OUTCOME_TEXT, plural, sourceOf, STATE_LABELS, type LoanView, type Tone } from "./format";
import styles from "../cash/cash.module.css";
import l from "./loans.module.css";

type Tab = "population" | "tests" | "exceptions" | "pieces" | "revue";
type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
const TABS: { id: Tab; label: string }[] = [{ id: "population", label: "Population" }, { id: "tests", label: "Tests" }, { id: "exceptions", label: "Exceptions" }, { id: "pieces", label: "Pièces" }, { id: "revue", label: "Revue" }];
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Enregistrement en cours…", saved: "Enregistré — accusé serveur reçu", failed: "Échec de l’enregistrement", conflict: "Conflit de version" };
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
const CRITERIA = "Tous les contrats du pack approuvé et toutes les échéances exigibles pendant l’exercice, y compris les contrats remboursés ; références du GL sans contrat conservées.";
export interface LoanRequested { periodId: string; id?: string; version?: number; tab?: Tab; contract?: string; due?: string; month?: number; q?: string; tone?: Tone }
const resultOf = (run: WorkpaperRun | null): LoanResult | null => run?.result?.execution === "completed" && run.template.id === "loans.review" ? run.result.result as LoanResult : null;

export function LoanWorkspace({ demo = false, demoCase = "", initialDossierId = "", initialPeriodValue = emptyPeriod, requested }: { demo?: boolean; demoCase?: string; initialDossierId?: string; initialPeriodValue?: AccountingPeriod; requested?: LoanRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState<AccountingPeriod>(initialPeriodValue);
  const [view, setView] = useState<LoanView | null>(null), [activeId, setActiveId] = useState(requested?.id ?? "");
  const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const [tab, setTab] = useState<Tab>(requested?.tab ?? "tests");
  const [filters, setFilters] = useState<LoanFilters>({ month: requested?.month ?? null, contract: requested?.contract ?? "", q: requested?.q ?? "", tone: requested?.tone ?? "" });
  const [selected, setSelected] = useState<LoanSelection | null>(requested?.contract ? { contractId: requested.contract, dueId: requested.due ?? null } : null);
  const [conclusion, setConclusion] = useState({ text: "", citation: "" }), [decision, setDecision] = useState({ text: "", citation: "" }), [resolution, setResolution] = useState<Record<string, { text: string; citation: string }>>({});
  const exactVersion = !!requested?.id && requested.version !== undefined;
  const busy = useRef(false), csrf = useRef(""), detailRef = useRef<LoanDetailHandle>(null), returnFocus = useRef<HTMLElement | null>(null), tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = view?.runs.find(r => r.id === activeId) ?? null, result = useMemo(() => resultOf(run), [run]);
  const facts = useMemo(() => run ? view?.facts[run.id] ?? [] : [], [run, view]), factIndex = useMemo(() => new Map(facts.map(f => [f.rowId, f])), [facts]);
  const current = run ? view?.sourcesCurrent[run.id] !== false : true;
  const canPrepare = !demo && !exactVersion && !!view?.permissions.includes("prepare");
  const canReview = !demo && !exactVersion && !!view?.permissions.includes("review") && (view.actorId !== run?.preparedBy || mayReviewOwnWork(view.reviewKind));
  const editable = !!run && canPrepare && run.preparedBy === view?.actorId && current && ["draft", "ready", "executed"].includes(run.state);
  const saving = status === "saving";
  const row = result?.rows.find(r => r.id === selected?.contractId) ?? null, due = row?.dues.find(d => d.id === selected?.dueId) ?? null;
  const loanHeads = view?.sourceHeads.filter(h => (LOAN_TYPES as readonly string[]).includes(h.document_type)) ?? [];

  // The context (case, contract, due, filters, tab) lives in the URL: returning to the sheet restores it.
  useEffect(() => {
    if (typeof window === "undefined" || (!demo && (!dossierId || !pid))) return;
    const q = new URLSearchParams(window.location.search);
    for (const k of ["id", "contract", "due", "month", "q", "tone", "tab"]) q.delete(k);
    if (!demo) { q.set("dossierId", dossierId); q.set("periodId", pid); if (run) q.set("id", run.id); }
    if (selected) { q.set("contract", selected.contractId); if (selected.dueId) q.set("due", selected.dueId); }
    if (filters.month !== null) q.set("month", String(filters.month + 1));
    if (filters.q) q.set("q", filters.q);
    if (filters.tone) q.set("tone", filters.tone);
    if (tab !== "tests") q.set("tab", tab);
    window.history.replaceState(null, "", "/emprunts?" + q);
  }, [demo, dossierId, pid, run, selected, filters, tab]);

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (preferred?: string, dossier = dossierId, periodKey = pid) => {
    const url = demo ? "/api/workpapers/emprunts/demo" + (demoCase ? "?case=" + encodeURIComponent(demoCase) : "")
      : "/api/workpapers/emprunts?" + new URLSearchParams({ dossierId: dossier, periodId: periodKey, ...(exactVersion ? { operation: "version", id: requested!.id!, version: String(requested!.version) } : {}) });
    const response = await fetch(url, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(loanFailureMessage(data.error, response.status));
    setView(data);
    const runs: WorkpaperRun[] = data.runs;
    const chosen = runs.find(r => r.id === (preferred || requested?.id)) ?? [...runs].sort((a, b) => b.revision - a.revision)[0];
    if (chosen) { setActiveId(chosen.id); setPeriod(chosen.period); }
    return data as LoanView;
  }, [demo, demoCase, dossierId, pid, exactVersion, requested]);
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current || (!demo && (!initialDossierId || !requested?.periodId))) return;
    autoLoaded.current = true;
    let active = true; setLoading(true);
    void (async () => { try { if (!demo) await session(); if (active) await refresh(requested?.id, initialDossierId, requested?.periodId); } catch (e) { if (active) setError(e instanceof Error ? e.message : "Chargement impossible"); } finally { if (active) setLoading(false); } })();
    return () => { active = false; };
  }, [demo, initialDossierId, requested, session, refresh]);
  async function load() {
    setLoading(true); setError(""); setStatus("idle"); setConflict(null);
    try { await session(); await refresh(activeId); } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible"); setView(null); } finally { setLoading(false); }
  }
  async function mutate(body: Record<string, unknown> | FormData, imports = false, key = crypto.randomUUID()): Promise<{ run?: WorkpaperRun } | null> {
    if (busy.current || demo) return null;
    busy.current = true; setStatus("saving"); setError(""); setConflict(null);
    try {
      await session();
      const response = await fetch("/api/workpapers/emprunts" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid }), { method: "POST",
        headers: { "Idempotency-Key": key, "x-probant-csrf": csrf.current, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.current) { setConflict(data); setStatus("conflict"); return null; }
        throw new Error(loanFailureMessage(data.error, response.status));
      }
      if (!data.run && !data.batch) throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
      try { await refresh(data.run?.id ?? activeId); } catch { setError("Enregistrement confirmé ; actualisation indisponible. Rechargez avant la prochaine commande."); }
      setStatus("saved");
      return data;
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Échec de l’enregistrement"); return null; }
    finally { busy.current = false; }
  }
  const action = (command: string, fields: Record<string, unknown> = {}) => run ? mutate({ command, id: run.id, expectedVersion: run.version, ...fields }) : Promise.resolve(null);
  async function prepareAndExecute() {
    if (!run) return;
    if (run.state === "draft") {
      const frozen = await action("freeze_loans", { importIds: loanHeads.map(h => h.import_id), criteria: CRITERIA });
      if (frozen?.run) await mutate({ command: "execute", id: frozen.run.id, expectedVersion: frozen.run.version });
    } else await action("execute");
  }
  async function exportVersion(format: "html" | "json") {
    if (!run) return;
    setError("");
    try {
      if (!demo) await session();
      const response = demo ? await fetch("/api/workpapers/emprunts/demo?format=" + format + (demoCase ? "&case=" + encodeURIComponent(demoCase) : ""))
        : await fetch("/api/workpapers/emprunts/export", { method: "POST", headers: { "Content-Type": "application/json", "x-probant-csrf": csrf.current }, body: JSON.stringify({ dossierId, periodId: pid, id: run.id, version: run.version, expectedHash: contentHash(run), format }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(loanFailureMessage(data.error, response.status)); }
      const url = URL.createObjectURL(await response.blob()), a = document.createElement("a");
      a.href = url; a.download = (demo ? "EXEMPLE-" : "") + "emprunts-diagnostic-v" + run.version + "." + format; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "Export impossible"); }
  }

  // Focus moves only after the commit that shows the new selection: an unrelated pending render must not consume it.
  const focusPanel = useRef(false);
  useEffect(() => { if (focusPanel.current && selected) { focusPanel.current = false; detailRef.current?.focus(); } }, [selected]);
  const open = (s: LoanSelection) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focusPanel.current = true; setSelected(s); };
  const returnFromPanel = () => { const t = returnFocus.current; if (t && document.contains(t)) t.focus(); };
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus();
  };
  const citeOptions = useMemo(() => facts.map(f => ({ value: f.documentVersionId + "|" + f.rowId, label: LOAN_LABELS[f.type] + " · " + f.id + " · " + (sourceOf(f)?.clause ?? "") + (f.line ? " · ligne " + f.line : "") })), [facts]);
  const parseCite = (v: string) => { const [documentVersionId, rowId] = v.split("|"); return { documentVersionId, rowId }; };
  const openNotes = run?.notes.filter(n => n.blocking && !n.resolution) ?? [];
  const counts: Record<Tab, number | null> = { population: run?.population?.items.length ?? null, tests: result ? result.rows.reduce((n, r) => n + r.dues.length, 0) : null, exceptions: openNotes.length || null, pieces: loanHeads.length || null, revue: null };
  const outcomeTone: Tone = result?.outcome === "no_exception_detected" ? "ok" : result?.outcome === "exceptions_detected" ? "explain" : "unknown";
  const downloadHref = !demo && view?.permissions.includes("download") ? (id: string) => "/api/workpapers/emprunts?" + new URLSearchParams({ dossierId, periodId: pid, operation: "download", id }) : null;
  const sheetUrl = "/emprunts?" + new URLSearchParams({ dossierId, periodId: pid });

  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><DossierContextAnchor href="/dashboard/synthese">Synthèse du dossier</DossierContextAnchor><DossierContextAnchor href="/tresorerie">Procédures de mission · Trésorerie</DossierContextAnchor><DossierContextAnchor href="/capitaux-propres/parcours">Procédures de mission · Capitaux propres</DossierContextAnchor><DossierContextAnchor href="/dossier-cloture">Dossier de clôture</DossierContextAnchor><span aria-current="page">Procédures de mission · Emprunts</span></nav>
    <header className={styles.header}><div>
      <p className={styles.eyebrow}>{demo ? "Exemple synthétique · lecture seule · même moteur" : "Mission · " + executionProfileLabel(view?.executionProfile ?? undefined) + " · identité serveur"}</p>
      <h1>Emprunts et dettes financières</h1>
      <p className={l.lede}>Du contrat au paiement : chaque échéance de l’exercice rapprochée du grand livre et du relevé, chaque intérêt recalculé sur les paramètres transcrits du contrat. Aucun taux, aucune convention de jours ni aucun seuil de covenant n’est supposé ; un montant inconnu reste inconnu.</p>
    </div>{run && result && <div className={styles.actions}><button type="button" onClick={() => void exportVersion("html")}>Diagnostic de la version (HTML)</button><button type="button" onClick={() => void exportVersion("json")}>JSON</button></div>}</header>
    {demo ? <p className={styles.notice} data-tone="info">Données synthétiques calculées par le moteur Emprunts : rien n’est enregistré, aucune revue réelle. <DossierContextAnchor href="/emprunts?demo=1&case=simple">Recette simple (100 000 − 10 000 ; 3 % en 30/360)</DossierContextAnchor> · <DossierContextAnchor href="/emprunts?demo=1">Pack complet</DossierContextAnchor></p>
      : <form className={styles.scope} onSubmit={e => { e.preventDefault(); void load(); }}>
        <label>Dossier<DossierScopedInput value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
        {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required={!requested?.periodId} disabled={saving || loading || !!requested?.periodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
        <button className={styles.primary} disabled={saving || loading}>{loading ? "Chargement…" : "Charger la feuille"}</button>
      </form>}
    <div className={styles.context} aria-label="Contexte de la feuille">
      <span>Dossier <strong>{demo ? "SYN-LOANS (exemple)" : dossierId || "—"}</strong></span>
      <span>Exercice <strong>{period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—"}</strong></span><span>Revue au <strong>{period.asOfDate ? dateFr(period.asOfDate) : "—"}</strong></span>
      <span>Feuille <strong>{run ? `r${run.revision} · v${run.version} · ${STATE_LABELS[run.state] ?? run.state}` : "—"}</strong></span><span>Règle <strong>loans.review {run?.template.rule?.version ?? LOAN_RULE_VERSION}</strong></span>
      {!demo && <><span>Identité <strong>{view?.actorId ?? "non connectée"}</strong></span><span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{SAVE_LABELS[status]}</span></>}
    </div>
    {loading && !view && <p role="status" className={styles.muted}>Lecture de l’état serveur…</p>}
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/connect|session/i.test(error) && <> <DossierContextAnchor href={"/api/auth/login?returnTo=" + encodeURIComponent(sheetUrl)}>Se connecter</DossierContextAnchor></>}{/fermée sur ce serveur/.test(error) && <> <DossierContextAnchor href="/emprunts?demo=1">Ouvrir l’exemple synthétique</DossierContextAnchor></>}</p>}
    {conflict && <div role="alert" className={styles.notice} data-tone="danger"><p>Conflit : la feuille est passée en version {conflict.current.version} (attendue {conflict.expectedVersion}). Aucune donnée n’a été écrasée ; la commande n’est pas rejouée.</p><button type="button" onClick={() => { setConflict(null); void refresh(conflict.current.id); }}>Recharger la version serveur</button></div>}
    {exactVersion && <p className={styles.notice} data-tone="info">Consultation de la version {requested?.version} : lecture seule.</p>}
    {!view && !loading && !error && !demo && <section className={l.section}><h2>Ouvrir une feuille Emprunts</h2><p className={styles.muted}>Choisissez le dossier et l’exercice, ou ouvrez la feuille depuis la Synthèse du dossier. <DossierContextAnchor href="/emprunts?demo=1">Explorer l’exemple synthétique</DossierContextAnchor>.</p></section>}
    {view && <>
      {!run && <section className={l.section}><h2>{demo ? "Aucun contrat dans cette vue" : "Feuille Emprunts de l’exercice"}</h2>
        <p className={styles.muted}>{demo ? "Exemple vide : aucune source." : "Aucune feuille : approuvez les sources (contrats, échéancier, grand livre, paiements, confirmations, clauses, révisions de taux, balance), puis créez la feuille."}</p>
        {canPrepare && <button type="button" className={styles.primary} disabled={saving || !period.startDate} onClick={() => void mutate({ command: "create_loans", period, instanceKey: crypto.randomUUID() })}>Créer la feuille Emprunts</button>}
        {!demo && <LoanImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} demo={demo} onPreview={d => void mutate(d, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>}
      </section>}
      {run && !current && <p role="alert" className={styles.notice} data-tone="danger">Feuille périmée : une source a été remplacée ou ajoutée après le gel. Les résultats affichés portent sur les versions figées, conservées avec leurs preuves. {canPrepare && <button type="button" disabled={saving} onClick={() => void action("revise")}>Créer une révision sur les sources courantes</button>}</p>}
      {run && <>
        <div role="tablist" aria-label="Sections de la feuille" className={styles.tabs}>{TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" id={"ln-tab-" + t.id} aria-controls={"ln-panel-" + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onKeyDown={e => onTabKey(e, i)} onClick={() => setTab(t.id)}>{t.label}{counts[t.id] !== null && <span>{counts[t.id]}</span>}</button>)}</div>
        <div className={styles.workspace}>
          <div className={styles.main} role="tabpanel" id={"ln-panel-" + tab} aria-labelledby={"ln-tab-" + tab}>
            {tab === "tests" && (result ? <>
              <p className={l.outcome} data-tone={outcomeTone}><strong>{OUTCOME_TEXT[result.outcome]}</strong><span className={styles.muted}>{plural(result.coverage.selected, "unité testée", "unités testées")} sur {result.coverage.denominator} ({plural(result.coverage.contracts, "contrat")}, {plural(result.coverage.dues, "échéance")} de l’exercice) · {result.rules.label}</span></p>
              <LoanSchedule result={result} filters={filters} onFilters={setFilters} selected={selected} onOpen={open}/>
              <LoanContracts result={result} filters={filters} selected={selected} onOpen={open}/>
              <LoanAccrued result={result} filters={filters} onOpen={open}/>
              <LoanFraming result={result}/>
              <details className={l.section}><summary>Méthode, texte applicable et limites</summary>
                <p>{result.rules.label} — {result.rules.reason}</p>
                <ul className={l.issues}>{result.rules.articles.map(a => <li key={a.ref}><strong>{a.ref}</strong> ({a.locator}) : {a.note}</li>)}</ul>
                <p>Autres fonds propres : {result.presentationRegime.meaning}</p>
                <p>Conventions de jours reconnues (paramètres du contrat ; formules de la méthode) :</p>
                <ul className={l.issues}>{Object.entries(DAY_COUNT_DEFINITIONS).map(([k, v]) => <li key={k}><strong>{k}</strong> — {v}</li>)}</ul>
                <p>{INTERVAL_CONVENTION_LABEL} Arrondi au centime une seule fois par intervalle, demi-centime éloigné de zéro. La part d’un intervalle antérieure à l’ouverture reprend les intérêts courus d’ouverture du GL.</p>
                <ul className={l.issues}>{result.limitations.map(x => <li key={x}>{x}</li>)}</ul>
              </details>
            </> : <section className={l.section}><h2>Tests</h2><p className={styles.muted}>{run.population ? "Sources figées : lancez le calcul (Revue)." : "Feuille non calculée : approuvez puis figez les sources (Revue)."}</p></section>)}
            {tab === "population" && <section className={l.section} aria-labelledby="ln-pop-title"><header><h2 id="ln-pop-title">Population et sélection</h2></header>
              {run.population ? <><p>{plural(run.selection!.selectedIds.length, "unité testée", "unités testées")} sur {run.population.items.length} · {plural(run.selection!.exclusions.length, "exclusion motivée", "exclusions motivées")} · {run.selection!.criteria}</p>
                <div className={styles.tableScroll} role="region" aria-label="Population — défilement clavier" tabIndex={0}><table><caption>Unité : un contrat (toutes versions) ou une échéance exigible pendant l’exercice. Les montants ne s’additionnent pas : nominal du contrat, principal de l’échéance.</caption>
                  <thead><tr><th scope="col">Unité</th><th scope="col">Nature</th><th scope="col" style={{ textAlign: "right" }}>Montant de la ligne</th><th scope="col">Lignes sources</th></tr></thead>
                  <tbody>{run.population.items.map(i => <tr key={i.id}><td>{i.id.replace(/^contract:|^due:/, "")}</td><td>{i.id.startsWith("contract:") ? "Contrat" : "Échéance"}</td><td className={styles.money}>{amountLabel({ kind: "known", value: i.amount })}</td><td>{i.rowIds.length}</td></tr>)}</tbody></table></div></>
                : <p className={styles.muted}>Population non figée : approuvez les sources (Pièces) puis figez-les (Revue).</p>}
            </section>}
            {tab === "exceptions" && <section className={l.section} aria-labelledby="ln-exc-title"><header><h2 id="ln-exc-title">Points à expliquer</h2><span className={styles.muted}>{plural(run.notes.length, "point")} · {plural(openNotes.length, "ouvert")} · aucune anomalie validée automatiquement</span></header>
              {!run.notes.length && <p className={styles.muted}>Aucun point sur cette version ; aucune opinion sur le cycle.</p>}
              <ul className={styles.list}>{run.notes.map(n => { const r = resolution[n.id] ?? { text: "", citation: "" }, contractId = n.id.replace(/^loan:/, "").split(":")[0];
                return <li key={n.id}><div className={styles.kv}><strong>{n.text}</strong><span>{n.amount.kind === "known" ? amountLabel(n.amount, { signed: true }) : n.amount.reason}</span>{n.resolution ? <span>Traité</span> : <span>Bloquant ouvert</span>}
                  {result?.rows.some(x => x.id === contractId) && <button type="button" onClick={() => { setTab("tests"); open({ contractId, dueId: null }); }}>Voir le contrat</button>}</div>
                  {n.resolution && <p className={styles.muted}>Traitement : {n.resolution.text}</p>}
                  {!n.resolution && editable && <div className={styles.fields + " " + l.form}>
                    <label>Explication documentée<textarea value={r.text} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, text: e.target.value } }))}/></label>
                    <label>Pièce citée (version figée)<select value={r.citation} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, citation: e.target.value } }))}><option value="">Choisir…</option>{citeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                    <button type="button" disabled={saving || !r.text.trim() || !r.citation} onClick={() => void action("resolve", { noteId: n.id, text: r.text, citation: parseCite(r.citation) })}>Enregistrer l’explication citée</button></div>}</li>; })}</ul>
            </section>}
            {tab === "pieces" && <LoanImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} demo={demo} onPreview={d => void mutate(d, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>}
            {tab === "revue" && <section className={l.section} aria-labelledby="ln-review-title"><header><h2 id="ln-review-title">Préparation, conclusion et relecture</h2><span className={styles.muted}>État : {STATE_LABELS[run.state] ?? run.state}{run.approval ? " · " + approvalLabel(run.approval) : ""}</span></header>
              {demo && <p className={styles.muted}>Exemple en lecture seule : la préparation, la relecture et le verrouillage se font sur une feuille persistante (profil personnel local).</p>}
              {editable && ["draft", "ready"].includes(run.state) && <><p className={styles.muted}>{run.state === "draft" ? "Le gel associe toutes les lignes approuvées courantes (" + plural(loanHeads.length, "source") + "), fige la population et lance le calcul." : "Sources figées : lancez le calcul."}</p>
                <button type="button" className={styles.primary} disabled={saving || (run.state === "draft" && !loanHeads.some(h => h.document_type === "loan_ledger"))} onClick={() => void prepareAndExecute()}>{run.state === "draft" ? "Figer les sources et calculer" : "Calculer"}</button></>}
              {editable && run.state === "executed" && <div className={styles.fields + " " + l.form}>
                <label>Conclusion motivée de la préparation<textarea value={conclusion.text} disabled={saving} onChange={e => setConclusion(c => ({ ...c, text: e.target.value }))}/></label>
                <label>Pièce citée<select value={conclusion.citation} disabled={saving} onChange={e => setConclusion(c => ({ ...c, citation: e.target.value }))}><option value="">Choisir…</option>{citeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <div className={styles.actions}><button type="button" disabled={saving || !conclusion.text.trim() || !conclusion.citation} onClick={() => void action("conclude", { text: conclusion.text, citation: parseCite(conclusion.citation) })}>Enregistrer la conclusion</button>
                  <button type="button" className={styles.primary} disabled={saving || !run.conclusion || openNotes.length > 0} onClick={() => void action("submit")}>Soumettre à la relecture</button>{openNotes.length > 0 && <span className={styles.muted}>{plural(openNotes.length, "point bloquant ouvert", "points bloquants ouverts")}</span>}</div></div>}
              {run.conclusion && <p><strong>Conclusion :</strong> {run.conclusion}</p>}
              {canReview && run.state === "awaiting_review" && <><ReviewKindNotice kind={view.reviewKind}/><div className={styles.fields + " " + l.form}>
                <label>Décision motivée de relecture<textarea value={decision.text} disabled={saving} onChange={e => setDecision(c => ({ ...c, text: e.target.value }))}/></label>
                <label>Pièce citée<select value={decision.citation} disabled={saving} onChange={e => setDecision(c => ({ ...c, citation: e.target.value }))}><option value="">Choisir…</option>{citeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <div className={styles.actions}><button type="button" className={styles.primary} disabled={saving || !decision.text.trim() || !decision.citation} onClick={() => void action("review", { decision: "approved", submittedHash: run.submittedHash, text: decision.text, citation: parseCite(decision.citation) })}>Approuver cette version</button>
                  <button type="button" className={styles.danger} disabled={saving || !decision.text.trim() || !decision.citation} onClick={() => void action("review", { decision: "changes_requested", submittedHash: run.submittedHash, text: decision.text, citation: parseCite(decision.citation) })}>Demander une reprise</button></div></div></>}
              {canReview && run.state === "approved" && <button type="button" className={styles.primary} disabled={saving} onClick={() => void action("lock")}>Verrouiller la version approuvée</button>}
              {!demo && run.state === "awaiting_review" && !canReview && <p className={styles.muted}>Relecture attendue par une identité autorisée.</p>}
              {canPrepare && ["locked", "approved", "changes_requested"].includes(run.state) && <button type="button" disabled={saving} onClick={() => void action("revise")}>Créer une révision</button>}
              <details><summary>Historique des actions de cette révision</summary><ul className={styles.list}>{run.events.map(e => <li key={e.id} className={styles.kv}><span>{e.at.replace("T", " ").slice(0, 19)}</span><span>{e.action}</span><span>{e.actorId}</span><span>v{e.version}</span></li>)}</ul></details>
              <p className={styles.muted}>Une relecture documentée ne vaut ni opinion sur les comptes, ni conformité de financement, ni absence de dette omise. Une suite verte sur données synthétiques n’autorise aucune mission réelle.</p>
            </section>}
          </div>
          <LoanDetailPanel ref={detailRef} row={row} due={due} result={result} facts={factIndex} downloadHref={downloadHref} onReturn={returnFromPanel}/>
        </div>
      </>}
      <p className={styles.srOnly} aria-live="polite">{row ? "Détail ouvert : " + row.name + (due ? ", échéance du " + dateFr(due.dueDate) : "") : ""}</p>
    </>}
  </main>;
}

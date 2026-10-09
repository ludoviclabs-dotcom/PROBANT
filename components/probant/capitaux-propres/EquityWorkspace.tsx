"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { EQ_UNCERTAINTY_CODES, equityDraftFromWork, type EquityDraft } from "@/lib/workpapers/capitaux-review";
import { equityResultOf, type EquityMissionFilter } from "@/lib/workpapers/capitaux-mission";
import { EQ_COMPONENTS, EQ_EXCLUSIONS, type EqComponent } from "@/lib/workpapers/capitaux-sources";
import { VariationTable, type VariationMode, type VariationTableHandle } from "./VariationTable";
import { DecisionTimeline } from "./DecisionTimeline";
import { DecisionTable, ReconciliationLists } from "./DecisionTable";
import { EquityDetailPanel, type EquityDetailHandle } from "./EquityDetailPanel";
import { EquityImportPanel } from "./EquityImportPanel";
import { COMPONENT_LABELS, dateFr, DECISION_TYPE_LABELS, equityFailureMessage, eur, knownLabel, NATURE_LABELS, plural, SOURCE_TYPE_LABELS, STATE_LABELS } from "./format";
import { selectionFromItem, type EquitySelection, type EquityView } from "./types";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
type Tab = "population" | "tests" | "exceptions" | "pieces" | "revue";
const TABS: { id: Tab; label: string }[] = [{ id: "population", label: "Population" }, { id: "tests", label: "Tests" }, { id: "exceptions", label: "Exceptions" }, { id: "pieces", label: "Pièces" }, { id: "revue", label: "Revue" }];
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
const FILTER_TAB: Record<EquityMissionFilter, Tab> = { all: "tests", blocked: "exceptions", exceptions: "exceptions", evidence: "pieces", review: "revue", stale: "population" };
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
/** Exact cents (server ratio) displayed as EUR; the quotient itself is never rounded into a percentage. */
const fromCents = (raw: string) => { const n = BigInt(raw), abs = n < 0n ? -n : n; return (n < 0n ? "-" : "") + (abs / 100n).toString() + "." + (abs % 100n).toString().padStart(2, "0"); };
const ratioText = (r: { kind: string; numerator?: string; denominator?: string; reason?: string }) => r.kind === "ratio" ? eur(fromCents(r.numerator!)) + " / " + eur(fromCents(r.denominator!)) : r.reason ?? "—";
export interface EquityRequested { periodId: string; id?: string; version?: number; filter: EquityMissionFilter; component?: EqComponent; item?: string; noteId?: string }

export function EquityWorkspace({ initialDossierId = "", initialPeriodValue = emptyPeriod, requested }: { initialDossierId?: string; initialPeriodValue?: AccountingPeriod; requested?: EquityRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodValue);
  const [view, setView] = useState<EquityView | null>(null), [activeId, setActiveId] = useState("");
  const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const initialSelection = selectionFromItem(requested?.item);
  const [tab, setTab] = useState<Tab>(initialSelection ? "tests" : FILTER_TAB[requested?.filter ?? "all"]);
  const [mode, setMode] = useState<VariationMode>("rebuilt"), [expanded, setExpanded] = useState<EqComponent[]>(requested?.component ? [requested.component] : []);
  const [selection, setSelection] = useState<EquitySelection>(initialSelection);
  const [conclusion, setConclusion] = useState(""), [comment, setComment] = useState(""), [reviewText, setReviewText] = useState("");
  const [citation, setCitation] = useState<{ documentId: string; page: string }>({ documentId: "", page: "" });
  const [resolvedNoteId, setResolvedNoteId] = useState<string | null>(null), [announce, setAnnounce] = useState("");
  const [exactVersion] = useState(!!requested?.id && requested.version !== undefined);
  const busy = useRef(false), csrf = useRef(""), pending = useRef<{ body: Record<string, unknown> | FormData; imports: boolean; key: string } | null>(null), returnFocus = useRef<HTMLElement | null>(null);
  const tableRef = useRef<VariationTableHandle>(null), detailRef = useRef<EquityDetailHandle>(null), tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = view?.runs.find(r => r.id === activeId) ?? null;
  const result = useMemo(() => equityResultOf(run), [run]), facts = run ? view?.facts[run.id] ?? null : null;
  const readings = useMemo(() => run?.capitauxWork?.readings ?? [], [run]);
  const current = run ? view?.sourcesCurrent[run.id] !== false : true;
  const canPrepare = !exactVersion && !!view?.permissions.includes("prepare"), canReview = !exactVersion && !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
  const editable = !!run && canPrepare && run.preparedBy === view?.actorId && current && ["draft", "ready", "executed"].includes(run.state) && !!run.population;
  const saving = status === "saving";
  const endpoint = (imports = false) => "/api/workpapers/capitaux-propres" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid });

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (preferred?: string, dossier = dossierId, periodKey = pid) => {
    const q = new URLSearchParams({ dossierId: dossier, periodId: periodKey, ...(exactVersion ? { operation: "version", id: requested!.id!, version: String(requested!.version) } : {}) });
    const response = await fetch("/api/workpapers/capitaux-propres?" + q, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(equityFailureMessage(data.error, data.locator));
    setView(data);
    const chosen: WorkpaperRun | undefined = data.runs.find((r: WorkpaperRun) => r.id === (preferred || requested?.id)) ?? [...data.runs].sort((a: WorkpaperRun, b: WorkpaperRun) => b.revision - a.revision)[0];
    if (chosen) { setActiveId(chosen.id); setPeriod(chosen.period); setConclusion(chosen.conclusion ?? ""); }
    return data as EquityView;
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
  useEffect(() => { if (!loading && requested?.noteId && run) document.getElementById("eq-note-" + requested.noteId)?.focus(); }, [loading, requested?.noteId, run]);
  // A deep-linked movement opens its component so the selected movement is visible in the statement.
  useEffect(() => {
    if (selection?.kind !== "movement" || !result) return;
    const component = result.entries.find(e => e.entryId === selection.id)?.component;
    if (component) setExpanded(x => x.includes(component) ? x : [...x, component]);
  }, [selection, result]);
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
        throw new Error(equityFailureMessage(data.error, data.locator));
      }
      if (!data.run && !data.batch) throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
      pending.current = null;
      try { await refresh(data.run?.id ?? activeId); } catch { setError("Sauvegarde confirmée ; actualisation indisponible. Rechargez avant la prochaine commande."); }
      setStatus("saved");
      if (!(body instanceof FormData) && body.command === "resolve") { setResolvedNoteId(String(body.noteId)); requestAnimationFrame(() => { focus?.focus({ preventScroll: true }); window.scrollTo(scroll.x, scroll.y); }); }
      if (!(body instanceof FormData) && body.command === "configure") requestAnimationFrame(() => detailRef.current?.focus());
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Échec de sauvegarde"); }
    finally { busy.current = false; }
  }
  const action = (command: string, fields: Record<string, unknown> = {}) => { if (run) void mutate({ command, id: run.id, expectedVersion: run.version, ...fields }); };
  const draftReadings = (): EquityDraft => run?.capitauxWork ? equityDraftFromWork(run.capitauxWork) : { readings: [] };
  const validateReading = (lineId: string, text: string) => action("configure", { draft: { readings: [...draftReadings().readings.filter(r => r.lineId !== lineId), { lineId, text }] } });
  const withdrawReading = (lineId: string) => action("configure", { draft: { readings: draftReadings().readings.filter(r => r.lineId !== lineId) } });
  const focusPanel = useRef(false);
  useEffect(() => { if (focusPanel.current) { focusPanel.current = false; detailRef.current?.focus(); } });
  const open = (next: EquitySelection) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focusPanel.current = true; setSelection(next); setTab("tests"); };
  const openDecision = (lineId: string) => open({ kind: "decision", id: lineId });
  const openMovement = (entryId: string) => {
    const component = result?.entries.find(e => e.entryId === entryId)?.component ?? facts?.entries.find(e => e.entryId === entryId)?.component;
    if (component) setExpanded(x => x.includes(component) ? x : [...x, component]);
    setAnnounce("Mouvement " + entryId + " mis en évidence dans le tableau de variation");
    open({ kind: "movement", id: entryId });
  };
  const returnFromPanel = () => {
    const target = returnFocus.current;
    if (target && document.contains(target)) { target.focus(); return; }
    const component = selection?.kind === "movement" ? result?.entries.find(e => e.entryId === selection.id)?.component : selection?.kind === "decision" ? result?.decisions?.find(d => d.lineId === selection.id)?.component : undefined;
    if (component) tableRef.current?.focusComponent(component);
  };
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus();
  };
  const toggle = (component: EqComponent) => setExpanded(x => x.includes(component) ? x.filter(c => c !== component) : [...x, component]);
  const requiredHeads = ["eq_balances", "eq_entries"].every(t => view?.sourceHeads.some(h => h.document_type === t));
  const exceptions = result?.exceptions ?? [], openNotes = run?.notes.filter(n => n.blocking && !n.resolution) ?? [];
  const frozenSources = (view?.imports ?? []).filter(b => run?.importIds.includes(b.id));
  const citedSource = frozenSources.find(b => b.document.id === citation.documentId) ?? null;
  const citationValid = !!citedSource && (citedSource.document.format === "pdf" ? /^[1-9]\d*$/.test(citation.page) && Number(citation.page) <= (citedSource.rowCount ?? citedSource.rows.length) : true);
  const citationBody = () => ({ documentId: citation.documentId, ...(citedSource?.document.format === "pdf" ? { page: Number(citation.page) } : {}) });
  const cartography = result?.cartography ?? EQ_COMPONENTS.map(c => { const accounts = (facts?.accounts ?? []).filter(a => a.component === c).map(a => a.account); return { component: c, label: COMPONENT_LABELS[c], status: !accounts.length ? "not_provided" as const : EQ_EXCLUSIONS[c] ? "excluded" as const : "provided" as const, accounts, reason: EQ_EXCLUSIONS[c] ?? null }; });

  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/dashboard/tests">Atelier synthétique</a><a href="/clients-framing">Procédures de mission · Clients</a><a href="/tresorerie">Procédures de mission · Trésorerie</a><a href="/immobilisations">Procédures de mission · Immobilisations</a><span aria-current="page">Procédures de mission · Capitaux propres</span><a href="/equity">Capitaux propres · dossier /equity (procédure parallèle)</a></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable · identité serveur</p><h1>Capitaux propres — décisions et mouvements</h1>
      <p className={styles.muted}>Tableau de variation par composante, décisions des PV rapprochées des écritures et des paiements, transferts internes neutres. Aucun rapport ne vaut conclusion juridique.</p></div>
      <a href={"/capitaux-propres/synthese?" + new URLSearchParams({ dossierId, periodId: pid, ...(run ? { rootId: run.rootId, id: run.id, version: String(run.version) } : {}) })}>Ouvrir la Revue et Synthèse Capitaux propres</a></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); void load(); }}>
      <label>Dossier<input value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required disabled={saving || loading || !!requested?.periodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
      <button className={styles.primary} disabled={saving || loading}>{loading ? "Chargement…" : "Charger la feuille"}</button>
    </form>
    <div className={styles.context} aria-label="Contexte du dossier">
      <span>Dossier <strong>{dossierId || "—"}</strong></span><span>Organisation <strong>{run?.scope.organizationId ?? "—"}</strong></span>
      <span>Exercice <strong>{period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—"}</strong> · revue <strong>{period.asOfDate ? dateFr(period.asOfDate) : "—"}</strong></span>
      <span>Mode <strong>réel — recette jetable</strong></span><span>Identité <strong>{view?.actorId ?? "non connectée"}</strong></span>
      <span>Feuille <strong>{run ? `r${run.revision} · v${run.version} · ${STATE_LABELS[run.state] ?? run.state}` : "—"}</strong></span>
      <span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{SAVE_LABELS[status]}</span>
    </div>
    {loading && !view && <p role="status" className={styles.muted}>Lecture de l’état serveur…</p>}
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/connect|session/i.test(error) && <> <a href={"/api/auth/login?returnTo=" + encodeURIComponent("/capitaux-propres?" + new URLSearchParams({ dossierId, periodId: pid }))}>Se connecter</a></>}</p>}
    {status === "failed" && pending.current && <button type="button" onClick={() => { const p = pending.current!; void mutate(p.body, p.imports, p.key); }}>Réessayer la même commande</button>}
    {conflict && <section role="alert" className={styles.card}><h2>Une autre modification a été sauvegardée</h2>
      <div className={styles.sideBySide}><section><h3>Votre vue · version {conflict.expectedVersion}</h3><p>{conclusion || "Conclusion vide"}</p></section>
        <section><h3>Version serveur {conflict.current.version}</h3><p>{plural(conflict.current.capitauxWork?.readings.length ?? 0, "lecture validée", "lectures validées")} · {conflict.current.conclusion ?? "aucune conclusion"} · état {conflict.current.state} · dernier auteur {conflict.current.events.at(-1)?.actorId}</p></section></div>
      <div className={styles.actions}><button type="button" onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setConflict(null); setStatus("idle"); }}>Conserver ma conclusion sur la version courante</button>
        <button type="button" onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setConclusion(conflict.current.conclusion ?? ""); setConflict(null); setStatus("idle"); }}>Reprendre le contenu serveur</button></div>
    </section>}
    {view && <>
      {exactVersion && run && <p className={styles.notice} data-tone="info">Examen en lecture seule de la version {run.version}{view.currentVersions?.[run.id] ? " · version courante " + view.currentVersions[run.id] : ""}. <a href={"/capitaux-propres?" + new URLSearchParams({ dossierId: run.scope.dossierId, periodId: run.scope.periodId, id: view.lineageCurrent?.[run.rootId]?.id ?? run.id })}>Travailler sur la version courante</a></p>}
      {run && !current && <p role="alert" className={styles.notice} data-tone="danger">Une source (ou un PV) a été remplacée ou ajoutée : cette version reste attachée à ses anciennes sources et ses décisions restent intactes. Créez une révision pour reprendre.</p>}
      {run && view.factsIssues[run.id] && <p role="alert" className={styles.notice} data-tone="danger">Sources à corriger : {equityFailureMessage(view.factsIssues[run.id].code, view.factsIssues[run.id].locator)}</p>}
      <div className={styles.scopeNote} aria-label="Périmètre de l’écran"><span>Décision ≠ comptabilisation ≠ paiement</span><span>Transferts internes sans effet sur le total</span><span>Aucun rapport ne vaut conclusion juridique</span><span>Composante incomplète = inconnue, jamais nulle</span><span>Autres fonds propres exclus avec motif</span></div>
      <div role="tablist" aria-label="Navigation de la feuille" className={styles.tabs}>{TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" id={"eq-tab-" + t.id} aria-controls={"eq-panel-" + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={e => onTabKey(e, i)}>
        {t.label}{t.id === "exceptions" && result ? <span>{exceptions.length}</span> : null}{t.id === "population" && run?.population ? <span>{run.population.items.length}</span> : null}</button>)}</div>
      <p className={styles.srOnly} role="status" aria-live="polite">{announce}</p>

      {tab === "population" && <div role="tabpanel" id="eq-panel-population" aria-labelledby="eq-tab-population" className={styles.main}>
        <section className={styles.card} aria-labelledby="eq-carto-title"><header><h2 id="eq-carto-title">Cartographie des composantes</h2><span className={styles.muted}>Rubriques du modèle de bilan (art. 821-1 PCG) — repère documentaire, pas une règle ; au-delà du compte 10</span></header>
          <div className={styles.tableScroll} role="region" aria-label="Cartographie des composantes — défilement clavier" tabIndex={0}><table className={eq.cartography}><caption>Chaque rubrique est fournie, non fournie (rien n’est réputé nul) ou exclue avec motif</caption>
            <thead><tr><th scope="col">Composante</th><th scope="col">Statut</th><th scope="col">Comptes rattachés par les sources</th><th scope="col">Motif</th></tr></thead>
            <tbody>{cartography.map(c => <tr key={c.component}><th scope="row">{c.label}</th><td><span className={eq.flag} data-tone={c.status === "provided" ? "ok" : c.status === "excluded" ? "muted" : "warn"}>{c.status === "provided" ? "Fournie" : c.status === "excluded" ? "Exclue du total" : "Non fournie"}</span></td><td>{c.accounts.join(", ") || "—"}</td><td>{c.reason ?? "—"}</td></tr>)}</tbody></table></div>
        </section>
        <section className={styles.card} aria-labelledby="eq-population-title"><header><h2 id="eq-population-title">Population : décisions et mouvements</h2><span className={styles.muted}>Unité : ligne de décision (D:) et écriture (M:) · dates d’effet explicites</span></header>
          {run?.population ? <div className={styles.tableScroll} role="region" aria-label="Population figée — défilement clavier" tabIndex={0}><table><caption>{run.selection ? `Sélection figée : ${run.selection.selectedIds.length}/${run.population.items.length} · ${run.selection.criteria}` : "Population figée"}</caption>
            <thead><tr><th scope="col">Élément</th><th scope="col">Nature</th><th scope="col">Composante</th><th scope="col">Dates</th><th scope="col" className={styles.money}>Montant</th><th scope="col">Sélection</th></tr></thead>
            <tbody>{run.population.items.map(item => { const isDecision = item.id.startsWith("D:"), key = item.id.slice(2), d = isDecision ? facts?.decisions?.find(x => x.lineId === key) : null, e = !isDecision ? facts?.entries.find(x => x.entryId === key) : null, excluded = run.selection?.exclusions.find(x => x.id === item.id);
              return <tr key={item.id}><th scope="row"><button type="button" className={eq.linkish} onClick={() => isDecision ? openDecision(key) : openMovement(key)}>{item.id}</button></th><td>{d ? "Décision · " + DECISION_TYPE_LABELS[d.type] : e ? "Écriture · " + NATURE_LABELS[e.nature] : "—"}</td><td>{d ? COMPONENT_LABELS[d.component] : e ? COMPONENT_LABELS[e.component] : "—"}</td>
                <td>{d ? "décidé " + dateFr(d.date) + " · effet " + dateFr(d.effectDate) : e ? "comptabilisé " + dateFr(e.date) + " · effet " + dateFr(e.effectDate) : "—"}</td><td className={styles.money}>{eur(item.amount, { signed: true })}</td><td>{excluded ? "Exclu : " + excluded.reason : "Sélectionné"}</td></tr>; })}</tbody></table></div>
            : facts ? <p className={styles.muted}>Sources courantes : {plural(facts.entries.length, "écriture")} · {facts.decisions ? plural(facts.decisions.length, "ligne de décision", "lignes de décision") : "registre des décisions absent"} · {plural(facts.minutes.length, "PV")}. Figez-les pour établir la population.</p>
            : <p className={styles.muted}>Population non définie : approuvez la balance et les écritures.</p>}
        </section>
        <EquityImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={command => void mutate({ command: "approve_import", ...command }, true)}/>
        {!run && canPrepare && <section className={styles.card}><h2>Feuille Capitaux propres</h2><p>Une seule feuille par dossier et par période ; ses révisions conservent les décisions antérieures.</p><button type="button" className={styles.primary} disabled={saving || !pid} onClick={() => void mutate({ command: "create", period })}>Créer la feuille Capitaux propres</button></section>}
        {run && run.state === "draft" && !run.population && canPrepare && <section className={styles.card} aria-labelledby="eq-freeze-title"><h2 id="eq-freeze-title">Figer les sources et la population</h2>
          <p className={styles.muted}>Toutes les sources courantes approuvées sont figées, PV compris. Les lectures de PV se valident ensuite, décision par décision, dans le panneau PV.</p>
          <button type="button" className={styles.primary} disabled={saving || !requiredHeads || !current} onClick={() => action("freeze", { importIds: view.sourceHeads.filter(h => h.document_type.startsWith("eq_")).map(h => h.import_id), draft: { readings: [] } })}>Figer les sources courantes</button>
          {!requiredHeads && <p className={styles.notice} data-tone="danger">Source manquante bloquante : balance d’ouverture et de clôture et écritures de l’exercice approuvées requises avant de figer.</p>}</section>}
      </div>}

      {tab === "tests" && <div role="tabpanel" id="eq-panel-tests" aria-labelledby="eq-tab-tests" className={styles.workspace}>
        <div className={styles.main}>
          {!result && <p className={styles.notice}>{run?.state === "ready" ? "Revue non exécutée : validez les lectures de PV utiles, puis exécutez la revue sur les sources figées." : run?.population ? "Aucun résultat pour cette version." : "Figez d’abord les sources dans l’onglet Population."} Aucun tableau ni rapprochement n’est affiché sans calcul serveur.</p>}
          {!result && facts?.decisions && run?.population && <section className={styles.card} aria-labelledby="eq-toread-title"><header><h2 id="eq-toread-title">Décisions à lire avant exécution</h2><span className={styles.muted}>{plural(readings.length, "lecture validée", "lectures validées")} / {plural(facts.decisions.length, "ligne")}</span></header>
            <ul className={styles.list}>{facts.decisions.map(d => { const pv = facts.minutes.find(m => m.pieceRef === d.minutesRef); return <li key={d.lineId}><div className={styles.kv}><button type="button" onClick={() => openDecision(d.lineId)}>{d.decisionId} · {d.lineId}</button><span>{DECISION_TYPE_LABELS[d.type]} · {COMPONENT_LABELS[d.component]} · voté {eur(d.amount, { signed: true })}</span>
              <span>{pv ? d.minutesRef + (d.page ? " p. " + d.page : " — page non indiquée") : d.minutesRef ? "PV « " + d.minutesRef + " » absent" : "PV non cité"}</span><span>{readings.some(r => r.lineId === d.lineId) ? "Lecture validée" : pv ? "Lecture à valider" : "Lecture impossible"}</span></div></li>; })}</ul></section>}
          {editable && run?.state === "ready" && <div className={styles.actions} role="group" aria-label="Exécution"><button type="button" className={styles.primary} disabled={saving} onClick={() => action("execute")}>Exécuter la revue des capitaux propres</button><span className={styles.muted}>Calcul serveur sur les sources figées et les lectures enregistrées.</span></div>}
          {result && <>
            <section className={styles.card} aria-labelledby="eq-variation-title"><header><h2 id="eq-variation-title">Tableau de variation des capitaux propres</h2><span className={styles.muted}>{result.totals.complete ? "Total " + knownLabel(result.totals.opening) + " → " + knownLabel(result.totals.closing) : result.totals.closing.kind === "unknown" ? result.totals.closing.reason : ""}</span></header>
              <VariationTable ref={tableRef} result={result} mode={mode} onMode={setMode} expanded={expanded} onToggle={toggle} selectedMovement={selection?.kind === "movement" ? selection.id : null} onSelectMovement={openMovement}/>
            </section>
            <section className={styles.card} aria-labelledby="eq-timeline-title"><header><h2 id="eq-timeline-title">Frise des décisions</h2><span className={styles.muted}>Date de décision ; date d’effet signalée si différente</span></header>
              {result.decisions ? <DecisionTimeline decisions={result.decisions} period={run!.period} selectedLine={selection?.kind === "decision" ? selection.id : null} onSelect={openDecision}/> : <p className={styles.notice}>Registre des décisions non fourni : aucune frise, aucune décision réputée absente.</p>}
            </section>
            <section className={styles.card} aria-labelledby="eq-lists-title"><header><h2 id="eq-lists-title">Décision sans écriture · écriture sans décision · montant divergent</h2><span className={styles.muted}>Aucune décision n’est déduite d’un montant</span></header>
              <ReconciliationLists result={result} selected={selection} onDecision={openDecision} onMovement={openMovement}/>
            </section>
            {result.decisions && <section className={styles.card} aria-labelledby="eq-decisions-title"><header><h2 id="eq-decisions-title">Décision, comptabilisation et paiement</h2><span className={styles.muted}>{plural(result.decisions.length, "ligne de décision", "lignes de décision")}</span></header>
              <DecisionTable decisions={result.decisions} selected={selection} onSelect={openDecision}/>
            </section>}
            <section className={styles.card} aria-labelledby="eq-ratios-title"><header><h2 id="eq-ratios-title">Rapports arithmétiques — aucune conclusion juridique</h2></header>
              <div className={eq.ratios}><div><small className={styles.muted}>Capitaux propres / capital (clôture)</small><br/><strong>{ratioText(result.ratios.equityToCapital)}</strong></div><div><small className={styles.muted}>Réserves / capital (clôture)</small><br/><strong>{ratioText(result.ratios.reservesToCapital)}</strong></div></div>
              <p className={styles.muted}>{result.ratios.meaning}</p><p className={styles.notice} data-tone="info">{result.legalMeaning}</p>
            </section>
          </>}
        </div>
        <EquityDetailPanel ref={detailRef} selection={selection} result={result} facts={facts} readings={readings} view={view} dossierId={dossierId} periodId={pid} canRead={editable} saving={saving} onValidateReading={validateReading} onWithdrawReading={withdrawReading} onDecision={openDecision} onMovement={openMovement} onReturn={returnFromPanel}/>
      </div>}

      {tab === "exceptions" && <div role="tabpanel" id="eq-panel-exceptions" aria-labelledby="eq-tab-exceptions" className={styles.main}>
        <section className={styles.card} aria-labelledby="eq-exceptions-title"><header><h2 id="eq-exceptions-title">Exceptions et incertitudes du calcul serveur</h2><span className={styles.muted}>Elles restent dans le résultat après revue</span></header>
          {!result ? <p className={styles.muted}>Aucun calcul exécuté pour cette version.</p> : exceptions.length ? <ul className={styles.list}>{exceptions.map(e => { const decision = result.decisions?.some(d => d.lineId === e.targetId), movement = result.entries.some(x => x.entryId === e.targetId);
            return <li key={e.id}><div className={styles.kv}><strong>{e.label}</strong><span>{EQ_UNCERTAINTY_CODES.includes(e.code) ? "Incertitude" : "Exception"}</span><span>{e.component ? COMPONENT_LABELS[e.component] : "Toutes composantes"}</span><span className={styles.money}>{knownLabel(e.amount)}</span></div><p>{e.message}</p>
              {(decision || movement) && <button type="button" onClick={() => decision ? openDecision(e.targetId) : openMovement(e.targetId)}>{decision ? "Ouvrir la décision " + e.targetId + " et son PV" : "Mettre en évidence l’écriture " + e.targetId}</button>}</li>; })}</ul>
            : <p>Aucune exception sur le périmètre testé. Cela ne vaut ni conformité ni conclusion juridique.</p>}
        </section>
        {run && <section className={styles.card} aria-labelledby="eq-notes-title"><h2 id="eq-notes-title">Traitements documentés et conclusion</h2>
          {editable && <fieldset className={styles.fields} aria-label="Pièce citée par la décision humaine"><legend className={styles.muted}>Toute décision humaine cite une pièce figée et sa version (page pour un PV).</legend>
            <label>Pièce citée<select value={citation.documentId} onChange={e => setCitation({ documentId: e.target.value, page: "" })}><option value="">Choisir une pièce figée…</option>{frozenSources.map(b => <option key={b.id} value={b.document.id}>{(b.document.documentType === "eq_minutes" ? b.mapping.capitaux?.pieceRef + " · " : SOURCE_TYPE_LABELS[b.document.documentType as keyof typeof SOURCE_TYPE_LABELS] + " · ") + b.document.fileName}</option>)}</select></label>
            {citedSource?.document.format === "pdf" && <label>Page (1 à {citedSource.rowCount ?? citedSource.rows.length})<input inputMode="numeric" value={citation.page} onChange={e => setCitation(c => ({ ...c, page: e.target.value.trim() }))}/></label>}
            {citedSource && <p className={styles.muted} style={{ gridColumn: "1 / -1" }}>Version <code>{citedSource.document.id}</code> · SHA-256 {citedSource.document.byteHash.slice(0, 16)}…</p>}
          </fieldset>}
          <ul className={styles.list}>{run.notes.map(n => <li key={n.id} id={"eq-note-" + n.id} tabIndex={-1} data-resolved={resolvedNoteId === n.id || undefined}><p>{n.text}</p><p className={styles.muted}>{n.blocking ? "Bloquant" : "Non bloquant"} · {knownLabel(n.amount)} · auteur {n.authorId}{n.citation ? " · cite " + (n.citation.pieceRef ?? n.citation.fileName) + (n.citation.page ? " p. " + n.citation.page : "") : ""}</p>
            {n.resolution ? <p>Traitement documenté par {n.resolution.authorId} : {n.resolution.text}{n.resolution.citation && <span className={styles.meaning}>Pièce citée : {n.resolution.citation.pieceRef ? n.resolution.citation.pieceRef + " · " : ""}{n.resolution.citation.fileName} · version {n.resolution.citation.documentVersionId}{n.resolution.citation.page ? " · page " + n.resolution.citation.page : ""}</span>}</p>
              : editable && <button type="button" aria-disabled={saving || !comment.trim() || !citationValid} onClick={() => { if (!saving && comment.trim() && citationValid) action("resolve", { noteId: n.id, text: comment, citation: citationBody() }); }}>Documenter le traitement avec le texte et la pièce citée</button>}</li>)}
            {!run.notes.length && <li className={styles.muted}>Aucun point ouvert.</li>}</ul>
          {editable && <label>Traitement ou commentaire<textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Ex. : distribution de 30 votée (résolution 3) ; 25 comptabilisés ; 5 restant à comptabiliser — écriture proposée."/></label>}
          {editable && !citationValid && <p className={styles.muted}>Choisissez la pièce citée (et la page d’un PV) pour documenter un traitement.</p>}
          {editable && <div className={styles.actions}><button type="button" disabled={saving || !comment.trim()} onClick={() => action("note", { note: { id: crypto.randomUUID(), kind: "observation", text: comment, amount: { kind: "unknown", reason: "Observation à documenter" }, blocking: false }, ...(citationValid ? { citation: citationBody() } : {}) })}>Ajouter comme commentaire non bloquant</button></div>}
          <label>Conclusion du préparateur<textarea aria-label="Conclusion" value={conclusion} disabled={!editable || saving} onChange={e => setConclusion(e.target.value)}/></label>
          {editable && <button type="button" disabled={saving || !conclusion.trim()} onClick={() => action("conclude", { text: conclusion })}>Sauvegarder la conclusion</button>}
        </section>}
      </div>}

      {tab === "pieces" && <div role="tabpanel" id="eq-panel-pieces" aria-labelledby="eq-tab-pieces" className={styles.main}>
        <section className={styles.card} aria-labelledby="eq-pieces-title"><header><h2 id="eq-pieces-title">Index des pièces versionnées</h2><span className={styles.muted}>Originaux téléchargeables séparément avec la même permission</span></header>
          <div className={styles.tableScroll} role="region" aria-label="Index des pièces — défilement clavier" tabIndex={0}><table><caption>Sources du dossier et de la période — courantes et remplacées, PV compris</caption><thead><tr><th scope="col">Type</th><th scope="col">Pièce</th><th scope="col">Version / SHA-256</th><th scope="col">Approbation</th><th scope="col">Actualité</th></tr></thead>
            <tbody>{view.imports.map(b => <tr key={b.id}><th scope="row">{SOURCE_TYPE_LABELS[b.document.documentType as keyof typeof SOURCE_TYPE_LABELS] ?? b.document.documentType}</th><td>{b.document.documentType === "eq_minutes" ? (b.mapping.capitaux?.pieceRef ?? "") + " · " + (b.mapping.capitaux?.title ?? "") + " · " : ""}{b.document.fileName} · {b.document.format === "pdf" ? plural(b.rowCount ?? b.rows.length, "page") : plural(b.rowCount ?? b.rows.length, "ligne")}</td><td><code>{b.document.id.slice(0, 22)}…</code><br/><code>{b.document.byteHash.slice(0, 16)}…</code></td>
              <td>{b.approval ? b.approval.actorId + " · " + new Date(b.approval.at).toLocaleString("fr-FR") : "Aperçu non approuvé"}</td><td>{view.sourceHeads.some(h => h.import_id === b.id) ? (run?.importIds.includes(b.id) ? "Courante · figée dans la feuille" : "Courante") : b.approval ? "Remplacée — conservée" : "Non approuvée"}{view.permissions.includes("download") && <> · <a href={"/api/workpapers/capitaux-propres?" + new URLSearchParams({ dossierId, periodId: pid, operation: "download", id: b.document.id })}>original</a></>}</td></tr>)}
              {!view.imports.length && <tr><td colSpan={5}>Aucune pièce importée.</td></tr>}</tbody></table></div>
          <h3>Lectures de PV validées sur cette version</h3>
          {readings.length ? <ul className={styles.list}>{readings.map(r => <li key={r.lineId}><div className={styles.kv}><button type="button" onClick={() => openDecision(r.lineId)}>{r.lineId}</button><span>{r.pieceRef} · page {r.page}</span><span>{r.authorId} · {new Date(r.authoredAt).toLocaleString("fr-FR")}</span></div><p className={styles.muted}>Version {r.documentVersionId} · « {r.text} »</p></li>)}</ul> : <p className={styles.muted}>Aucune lecture validée.</p>}
          <p className={styles.muted}>Une pièce absente ne devient jamais une preuve fournie. Les binaires originaux ne sont pas inclus dans l’export.</p>
        </section>
      </div>}

      {tab === "revue" && <div role="tabpanel" id="eq-panel-revue" aria-labelledby="eq-tab-revue" className={styles.main}>
        <section className={styles.card} aria-labelledby="eq-review-title"><h2 id="eq-review-title">Soumission, revue et verrouillage</h2>
          {!run ? <p className={styles.muted}>Aucune feuille.</p> : <>
            <p>État : <strong>{STATE_LABELS[run.state] ?? run.state}</strong> · préparateur réel {run.preparedBy}{run.approval ? " · approuvé par " + run.approval.actorId + " le " + new Date(run.approval.at).toLocaleString("fr-FR") : ""}</p>
            {openNotes.length > 0 && <p className={styles.notice}>{plural(openNotes.length, "point bloquant", "points bloquants")} à documenter avant approbation (onglet Exceptions).</p>}
            {run.state === "executed" && canPrepare && <button type="button" className={styles.primary} disabled={saving || !current || conclusion !== (run.conclusion ?? "")} onClick={() => action("submit")}>Soumettre cette version</button>}
            {run.state === "awaiting_review" && canReview && <><label>Note de revue<textarea value={reviewText} onChange={e => setReviewText(e.target.value)}/></label>
              <div className={styles.actions}>{(["approved", "changes_requested"] as const).map(d => <button key={d} type="button" className={d === "approved" ? styles.primary : undefined} disabled={saving || !reviewText.trim() || !current} onClick={() => action("review", { decision: d, text: reviewText, submittedHash: run.submittedHash })}>{d === "approved" ? "Approuver la revue des capitaux propres" : "Demander une correction"}</button>)}</div></>}
            {run.state === "awaiting_review" && !canReview && <p>Une autre identité autorisée doit revoir cette version.</p>}
            {run.state === "approved" && canReview && <button type="button" className={styles.primary} disabled={saving || !current} onClick={() => action("lock")}>Verrouiller cette version approuvée</button>}
            {canPrepare && <div className={styles.actions}><button type="button" className={styles.danger} disabled={saving} onClick={() => action("revise")}>Créer une nouvelle révision</button><span className={styles.muted}>L’ancienne version et ses décisions restent consultables.</span></div>}
            <p className={styles.muted}>Une revue documentée ne vaut ni conformité des comptes ni conclusion juridique. Les exceptions restent dans le résultat.</p>
          </>}
        </section>
      </div>}
    </>}
  </main>;
}

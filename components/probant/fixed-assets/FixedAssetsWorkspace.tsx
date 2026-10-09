"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { fixedAssetDraftFromWork, FA_RECALC_TEXT, FA_UNCERTAINTY_CODES, type FixedAssetDraft } from "@/lib/workpapers/fixed-asset-review";
import { fixedAssetResultOf, type FixedAssetMissionFilter } from "@/lib/workpapers/fixed-asset-mission";
import type { FaTable } from "@/lib/workpapers/fixed-asset-sources";
import { FamilyBridge, type FamilyBridgeHandle, type FamilyStepId } from "./FamilyBridge";
import { AssetTable, matchesFilter, type AssetSort, type AssetTableHandle } from "./AssetTable";
import { AssetDetailPanel, type AssetDetailHandle } from "./AssetDetailPanel";
import { FixedAssetImportPanel } from "./FixedAssetImportPanel";
import { MethodsEditor } from "./MethodsEditor";
import { dateFr, eur, fixedAssetFailureMessage, knownLabel, plural, SOURCE_TYPE_LABELS, STATE_LABELS, STATUS_LABELS, TABLE_LABELS, TREATMENT_LABELS } from "./format";
import type { BridgeFilter, FixedAssetView } from "./types";
import styles from "../cash/cash.module.css";
import fa from "./fixed-assets.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
type Tab = "population" | "tests" | "exceptions" | "pieces" | "revue";
const TABS: { id: Tab; label: string }[] = [{ id: "population", label: "Population" }, { id: "tests", label: "Tests" }, { id: "exceptions", label: "Exceptions" }, { id: "pieces", label: "Pièces" }, { id: "revue", label: "Revue" }];
const TABLES: FaTable[] = ["gross", "amortization", "impairment"];
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
const FILTER_TAB: Record<FixedAssetMissionFilter, Tab> = { all: "tests", blocked: "exceptions", exceptions: "exceptions", evidence: "pieces", review: "revue", stale: "population" };
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
export interface FixedAssetRequested { periodId: string; id?: string; version?: number; filter: FixedAssetMissionFilter; asset?: string; table?: FaTable; noteId?: string }

export function FixedAssetsWorkspace({ initialDossierId = "", initialPeriodValue = emptyPeriod, requested }: { initialDossierId?: string; initialPeriodValue?: AccountingPeriod; requested?: FixedAssetRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodValue);
  const [view, setView] = useState<FixedAssetView | null>(null), [activeId, setActiveId] = useState("");
  const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const [tab, setTab] = useState<Tab>(requested?.asset ? "tests" : FILTER_TAB[requested?.filter ?? "all"]);
  const [family, setFamily] = useState(""), [table, setTable] = useState<FaTable>(requested?.table ?? "gross"), [filter, setFilter] = useState<BridgeFilter>(null), [sort, setSort] = useState<AssetSort>("unit");
  const [selected, setSelected] = useState<string | null>(requested?.asset ?? null), [step, setStep] = useState<FamilyStepId | null>(null);
  const [draft, setDraft] = useState<FixedAssetDraft | null>(null), [conclusion, setConclusion] = useState(""), [comment, setComment] = useState(""), [reviewText, setReviewText] = useState("");
  const [resolvedNoteId, setResolvedNoteId] = useState<string | null>(null), [announce, setAnnounce] = useState("");
  const [exactVersion] = useState(!!requested?.id && requested.version !== undefined);
  const busy = useRef(false), csrf = useRef(""), pending = useRef<{ body: Record<string, unknown> | FormData; imports: boolean; key: string } | null>(null), returnFocus = useRef<HTMLElement | null>(null);
  const bridgeRef = useRef<FamilyBridgeHandle>(null), tableRef = useRef<AssetTableHandle>(null), detailRef = useRef<AssetDetailHandle>(null), tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({}), subTabRefs = useRef<Partial<Record<FaTable, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = view?.runs.find(r => r.id === activeId) ?? null;
  const result = useMemo(() => fixedAssetResultOf(run), [run]), facts = run ? view?.facts[run.id] ?? null : null;
  const units = useMemo(() => result?.units ?? [], [result]);
  const families = useMemo(() => result ? result.families.map(f => f.family) : [...new Set((facts?.units ?? []).map(u => u.family))].sort(), [result, facts]);
  const activeFamily = families.includes(family) ? family : (selected && (units.find(u => u.unitId === selected)?.family ?? facts?.units.find(u => u.unitId === selected)?.family)) || families[0] || "";
  const familyData = result?.families.find(f => f.family === activeFamily) ?? null;
  const familyUnits = useMemo(() => units.filter(u => u.family === activeFamily), [units, activeFamily]);
  const server = useMemo(() => run?.fixedAssetWork ? fixedAssetDraftFromWork(run.fixedAssetWork) : null, [run]);
  const current = run ? view?.sourcesCurrent[run.id] !== false : true;
  const canPrepare = !exactVersion && !!view?.permissions.includes("prepare"), canReview = !exactVersion && !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
  const editable = !!run && canPrepare && run.preparedBy === view?.actorId && current && ["draft", "ready", "executed"].includes(run.state) && !!run.population;
  const dirty = !!draft && !!run?.population && JSON.stringify(draft) !== JSON.stringify(server);
  const saving = status === "saving";
  const referenced = useMemo(() => [...new Set((facts?.units ?? []).map(u => u.parameters?.methodRef ?? "").filter(Boolean))].sort(), [facts]);
  const comparison = run ? view?.comparisons[run.id] ?? null : null, pendingChange = run ? view?.pendingChanges[run.id] ?? null : null;
  const endpoint = (imports = false) => "/api/workpapers/immobilisations" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid });

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (preferred?: string, dossier = dossierId, periodKey = pid, keepDraft = false) => {
    const q = new URLSearchParams({ dossierId: dossier, periodId: periodKey, ...(exactVersion ? { operation: "version", id: requested!.id!, version: String(requested!.version) } : {}) });
    const response = await fetch("/api/workpapers/immobilisations?" + q, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(fixedAssetFailureMessage(data.error, data.locator));
    setView(data);
    const chosen: WorkpaperRun | undefined = data.runs.find((r: WorkpaperRun) => r.id === (preferred || requested?.id)) ?? [...data.runs].sort((a: WorkpaperRun, b: WorkpaperRun) => b.revision - a.revision)[0];
    if (chosen) { setActiveId(chosen.id); setPeriod(chosen.period); setConclusion(chosen.conclusion ?? ""); if (!keepDraft) setDraft(chosen.fixedAssetWork ? fixedAssetDraftFromWork(chosen.fixedAssetWork) : { methods: [] }); }
    return data as FixedAssetView;
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
  useEffect(() => { if (!loading && requested?.noteId && run) document.getElementById("fa-note-" + requested.noteId)?.focus(); }, [loading, requested?.noteId, run]);
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
        throw new Error(fixedAssetFailureMessage(data.error, data.locator));
      }
      if (!data.run && !data.batch) throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
      pending.current = null;
      // An unsaved methods draft survives unrelated commands; it is replaced only by its own save.
      const keepDraft = dirty && !(body instanceof FormData) && !["configure", "freeze", "revise", "create"].includes(String(body.command));
      try { await refresh(data.run?.id ?? activeId, dossierId, pid, keepDraft); } catch { setError("Sauvegarde confirmée ; actualisation indisponible. Rechargez avant la prochaine commande."); }
      setStatus("saved");
      if (!(body instanceof FormData) && body.command === "resolve") { setResolvedNoteId(String(body.noteId)); requestAnimationFrame(() => { focus?.focus({ preventScroll: true }); window.scrollTo(scroll.x, scroll.y); }); }
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Échec de sauvegarde"); }
    finally { busy.current = false; }
  }
  const action = (command: string, fields: Record<string, unknown> = {}) => { if (run) void mutate({ command, id: run.id, expectedVersion: run.version, ...fields }); };
  // Focus moves are applied after React has rendered the filtered table or the opened panel.
  const focusRequest = useRef<null | { kind: "firstRow"; fallback: FamilyStepId } | { kind: "row"; id: string } | { kind: "panel" }>(requested?.asset ? { kind: "row", id: requested.asset } : null);
  useEffect(() => {
    const request = focusRequest.current; if (!request) return;
    if (request.kind === "row") { if (tableRef.current?.focusRow(request.id)) focusRequest.current = null; return; }
    focusRequest.current = null;
    if (request.kind === "panel") detailRef.current?.focus();
    else if (!tableRef.current?.focusFirstRow()) bridgeRef.current?.focusStep(request.fallback);
  });
  const openUnit = (unitId: string) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focusRequest.current = { kind: "panel" }; setSelected(unitId); };
  const onStep = (id: FamilyStepId) => {
    setStep(id);
    if (id === "addition" || id === "disposal" || id === "reversal" || id === "reclassification" || id === "difference") {
      const next: BridgeFilter = filter === id ? null : id; setFilter(next);
      const count = familyUnits.filter(u => u.inScope && matchesFilter(u, table, next)).length;
      setAnnounce(plural(count, "actif affiché", "actifs affichés"));
      focusRequest.current = { kind: "firstRow", fallback: id };
    } else { setFilter(null); setAnnounce("Filtre retiré : " + plural(familyUnits.filter(u => u.inScope).length, "actif affiché", "actifs affichés")); }
  };
  const returnFromPanel = () => {
    const target = returnFocus.current;
    if (target && document.contains(target)) { target.focus(); return; }
    if (selected && tableRef.current?.focusRow(selected)) return;
    bridgeRef.current?.focusStep(step ?? "opening");
  };
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus();
  };
  const onSubTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABLES.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABLES.length) % TABLES.length;
    setTable(TABLES[next]); setFilter(null); setStep(null); subTabRefs.current[TABLES[next]]?.focus();
  };
  const showUnit = (unitId: string | null, t: FaTable | null) => {
    setTab("tests"); setFilter(null); setStep(null);
    if (t) setTable(t);
    if (unitId) { const f = units.find(u => u.unitId === unitId)?.family; if (f) setFamily(f); setSelected(unitId); focusRequest.current = { kind: "row", id: unitId }; }
    else requestAnimationFrame(() => document.getElementById("fa-framing-title")?.focus());
  };
  const requiredHeads = ["fa_register", "fa_ledger"].every(t => view?.sourceHeads.some(h => h.document_type === t));
  const exceptions = result?.exceptions ?? [], openNotes = run?.notes.filter(n => n.blocking && !n.resolution) ?? [];
  const populationRows = result ? result.units.map(u => ({ unitId: u.unitId, label: u.label, family: u.family, status: u.status, treatment: u.treatment, inScope: u.inScope, exclusionReason: u.exclusionReason, gross: u.tables.gross.status === "computed" ? u.tables.gross.closing : null, lines: facts?.units.find(f => f.unitId === u.unitId)?.lines.length ?? null }))
    : (facts?.units ?? []).map(u => ({ unitId: u.unitId, label: u.label, family: u.family, status: u.status, treatment: u.treatment, inScope: u.inScope, exclusionReason: u.exclusionReason, gross: u.lines.find(l => l.table === "gross" && l.movement === "closing")?.amount ?? null, lines: u.lines.length }));
  const counts = { addition: familyUnits.filter(u => u.inScope && matchesFilter(u, table, "addition")).length, disposal: familyUnits.filter(u => u.inScope && matchesFilter(u, table, "disposal")).length, reversal: familyUnits.filter(u => u.inScope && matchesFilter(u, table, "reversal")).length, reclassification: familyUnits.filter(u => u.inScope && matchesFilter(u, table, "reclassification")).length, difference: familyUnits.filter(u => u.inScope && matchesFilter(u, table, "difference")).length };
  const selectedUnit = units.find(u => u.unitId === selected) ?? null, selectedFact = facts?.units.find(u => u.unitId === selected) ?? null;
  const methodsDraft = draft ?? { methods: [] };

  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/dashboard/tests">Atelier synthétique</a><a href="/clients-framing">Procédures de mission · Clients</a><a href="/tresorerie">Procédures de mission · Trésorerie</a><span aria-current="page">Procédures de mission · Immobilisations</span><a href="/capitaux-propres">Procédures de mission · Capitaux propres (PV versionnés)</a></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable · identité serveur</p><h1>Immobilisations — mouvements et recalcul documenté</h1>
      <p className={styles.muted}>Ponts Brut, Amortissements et Dépréciations séparés, par famille et par actif ; cadrage registre → GL ; recalcul sur méthode et paramètres documentés. Aucune conclusion de valeur ni d’existence physique.</p></div>
      <a href={"/immobilisations/synthese?" + new URLSearchParams({ dossierId, periodId: pid, ...(run ? { rootId: run.rootId, id: run.id, version: String(run.version) } : {}) })}>Ouvrir la Revue et Synthèse Immobilisations</a></header>
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
      <span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{status === "idle" && dirty ? "Méthodes modifiées — non sauvegardées" : SAVE_LABELS[status]}</span>
    </div>
    {loading && !view && <p role="status" className={styles.muted}>Lecture de l’état serveur…</p>}
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/connect|session/i.test(error) && <> <a href={"/api/auth/login?returnTo=" + encodeURIComponent("/immobilisations?" + new URLSearchParams({ dossierId, periodId: pid }))}>Se connecter</a></>}</p>}
    {status === "failed" && pending.current && <button type="button" onClick={() => { const p = pending.current!; void mutate(p.body, p.imports, p.key); }}>Réessayer la même commande</button>}
    {conflict && <section role="alert" className={styles.card}><h2>Une autre modification a été sauvegardée</h2>
      <div className={styles.sideBySide}><section><h3>Votre brouillon · version {conflict.expectedVersion}</h3><p>{draft ? plural(draft.methods.length, "méthode") + " : " + draft.methods.map(m => m.id + " v" + m.version).join(", ") : "Aucun brouillon"}</p><p>{conclusion || "Conclusion vide"}</p></section>
        <section><h3>Version serveur {conflict.current.version}</h3><p>{conflict.current.fixedAssetWork ? conflict.current.fixedAssetWork.methods.map(m => m.id + " v" + m.version).join(", ") || "Aucune méthode" : "Aucun travail"}</p><p>{conflict.current.conclusion ?? "Aucune conclusion"} · état {conflict.current.state} · dernier auteur {conflict.current.events.at(-1)?.actorId}</p></section></div>
      <div className={styles.actions}><button type="button" onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setConflict(null); setStatus("idle"); }}>Conserver mon brouillon sur la version courante</button>
        <button type="button" onClick={() => { setView(v => v ? { ...v, runs: v.runs.map(r => r.id === conflict.current.id ? conflict.current : r) } : v); setDraft(conflict.current.fixedAssetWork ? fixedAssetDraftFromWork(conflict.current.fixedAssetWork) : { methods: [] }); setConclusion(conflict.current.conclusion ?? ""); setConflict(null); setStatus("idle"); }}>Reprendre le contenu serveur</button></div>
    </section>}
    {view && <>
      {exactVersion && run && <p className={styles.notice} data-tone="info">Examen en lecture seule de la version {run.version}{view.currentVersions?.[run.id] ? " · version courante " + view.currentVersions[run.id] : ""}. <a href={"/immobilisations?" + new URLSearchParams({ dossierId: run.scope.dossierId, periodId: run.scope.periodId, id: view.lineageCurrent?.[run.rootId]?.id ?? run.id })}>Travailler sur la version courante</a></p>}
      {run && !current && <p role="alert" className={styles.notice} data-tone="danger">Une source a été remplacée : cette version reste attachée à ses anciennes sources et ses décisions restent intactes. Créez une révision pour reprendre.</p>}
      {run && view.factsIssues[run.id] && <p role="alert" className={styles.notice} data-tone="danger">Sources à corriger : {fixedAssetFailureMessage(view.factsIssues[run.id].code, view.factsIssues[run.id].locator)}</p>}
      <div className={styles.scopeNote} aria-label="Périmètre de l’écran"><span>Brut, amortissements et dépréciations jamais additionnés</span><span>VNC arithmétique ≠ valeur</span><span>Pas de conclusion d’existence physique</span><span>Aucune durée ni seuil implicite</span><span>Actifs complexes exclus avec motif</span></div>
      <div role="tablist" aria-label="Navigation de la feuille" className={styles.tabs}>{TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" id={"fa-tab-" + t.id} aria-controls={"fa-panel-" + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={e => onTabKey(e, i)}>
        {t.label}{t.id === "exceptions" && result ? <span>{exceptions.length}</span> : null}{t.id === "population" && populationRows.length ? <span>{populationRows.length}</span> : null}</button>)}</div>
      <p className={styles.srOnly} role="status" aria-live="polite">{announce}</p>

      {tab === "population" && <div role="tabpanel" id="fa-panel-population" aria-labelledby="fa-tab-population" className={styles.main}>
        <section className={styles.card} aria-labelledby="fa-population-title"><header><h2 id="fa-population-title">Population des actifs et composants</h2><span className={styles.muted}>Unité : actif ou composant du registre · mesure : brut de clôture</span></header>
          {populationRows.length ? <div className={styles.tableScroll} role="region" aria-label="Population des actifs — défilement clavier" tabIndex={0}><table><caption>Actifs du registre figé ou des sources courantes — exclusions motivées, jamais silencieuses</caption>
            <thead><tr><th scope="col">Actif / composant</th><th scope="col">Famille</th><th scope="col">Statut</th><th scope="col">Traitement</th><th scope="col" className={styles.money}>Brut de clôture</th><th scope="col">Périmètre</th></tr></thead>
            <tbody>{populationRows.map(u => <tr key={u.unitId}><th scope="row">{u.unitId}<span className={styles.meaning}>{u.label}{u.lines !== null ? " · " + plural(u.lines, "ligne") : ""}</span></th><td>{u.family}</td><td><span className={fa.chip} data-status={u.status}>{STATUS_LABELS[u.status]}</span></td><td>{TREATMENT_LABELS[u.treatment] ?? u.treatment}</td>
              <td className={styles.money}>{u.gross ? eur(u.gross) : "Non établi"}</td><td>{u.inScope ? "Testé" : "Exclu : " + u.exclusionReason}</td></tr>)}</tbody></table></div>
            : <p className={styles.muted}>Population non définie : approuvez le registre des immobilisations.</p>}
          {run?.selection && <p className={styles.muted}>Sélection figée : {run.selection.selectedIds.length}/{run.population?.items.length} actifs · {run.selection.criteria}</p>}
        </section>
        <FixedAssetImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={command => void mutate({ command: "approve_import", ...command }, true)}/>
        {!run && canPrepare && <section className={styles.card}><h2>Feuille Immobilisations</h2><p>Une seule feuille par dossier et par période ; ses révisions conservent les décisions antérieures.</p><button type="button" className={styles.primary} disabled={saving || !pid} onClick={() => void mutate({ command: "create", period })}>Créer la feuille Immobilisations</button></section>}
        {run && run.state === "draft" && !run.population && canPrepare && <section className={styles.card} aria-labelledby="fa-freeze-title"><h2 id="fa-freeze-title">Figer les sources, la population et les méthodes</h2>
          <MethodsEditor draft={methodsDraft} saved={null} referenced={referenced} disabled={saving} onChange={setDraft}/>
          <button type="button" className={styles.primary} disabled={saving || !requiredHeads || !current} onClick={() => action("freeze", { importIds: view.sourceHeads.filter(h => h.document_type.startsWith("fa_")).map(h => h.import_id), draft: methodsDraft })}>Figer les sources courantes</button>
          {!requiredHeads && <p className={styles.notice} data-tone="danger">Source manquante bloquante : registre et GL / balance approuvés requis avant de figer.</p>}</section>}
      </div>}

      {tab === "tests" && <div role="tabpanel" id="fa-panel-tests" aria-labelledby="fa-tab-tests" className={styles.workspace}>
        <div className={styles.main}>
          {!result && <p className={styles.notice}>{run?.state === "ready" ? "Revue non exécutée : exécutez-la sur les sources figées (bouton ci-dessous)." : run?.population ? "Aucun résultat pour cette version." : "Figez d’abord les sources dans l’onglet Population."} Aucun pont n’est affiché sans calcul serveur.</p>}
          {families.length > 0 && <section className={styles.card} aria-labelledby="fa-families-title"><header><h2 id="fa-families-title">Famille et tableau</h2><span className={styles.muted}>{plural(families.length, "famille")} · {plural(populationRows.filter(u => u.inScope).length, result ? "actif testé" : "actif à tester", result ? "actifs testés" : "actifs à tester")} · {plural(populationRows.filter(u => !u.inScope).length, "exclu")}</span></header>
            <div role="radiogroup" aria-label="Sélecteur de famille" className={fa.familyPick} onKeyDown={e => {
              if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
              e.preventDefault();
              const index = families.indexOf(activeFamily), next = families[(index + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) + families.length) % families.length];
              setFamily(next); setFilter(null); setStep(null); setSelected(null);
              (e.currentTarget.querySelector(`[data-family="${CSS.escape(next)}"]`) as HTMLElement | null)?.focus();
            }}>{families.map(f => { const data = result?.families.find(x => x.family === f); return <button key={f} type="button" role="radio" data-family={f} tabIndex={activeFamily === f ? 0 : -1} aria-checked={activeFamily === f} onClick={() => { setFamily(f); setFilter(null); setStep(null); setSelected(null); }}>
              <strong>{f}</strong><small>{data ? plural(data.units, "actif testé", "actifs testés") + (data.excluded ? " · " + plural(data.excluded, "exclu") : "") : "non calculé"}</small></button>; })}</div>
            <div role="tablist" aria-label="Tableau des immobilisations" className={fa.subTabs} style={{ marginTop: 12 }}>{TABLES.map((t, i) => <button key={t} ref={el => { subTabRefs.current[t] = el; }} role="tab" id={"fa-subtab-" + t} aria-controls="fa-subpanel" aria-selected={table === t} tabIndex={table === t ? 0 : -1} onClick={() => { setTable(t); setFilter(null); setStep(null); }} onKeyDown={e => onSubTabKey(e, i)}>{TABLE_LABELS[t]}</button>)}</div>
          </section>}
          {result && familyData && <div id="fa-subpanel" role="tabpanel" aria-labelledby={"fa-subtab-" + table} className={styles.main}>
            <section className={styles.card} aria-labelledby="fa-bridge-title"><header><h2 id="fa-bridge-title">Pont {TABLE_LABELS[table]} — {activeFamily}</h2><span className={styles.muted}>Montants en EUR · sorties et reprises en négatif · sommes des actifs calculés</span></header>
              <FamilyBridge ref={bridgeRef} family={activeFamily} table={table} data={familyData.tables[table]} active={filter} counts={counts} onStep={onStep}/>
              <p className={styles.notice} data-tone="info">Le pont explique l’arithmétique des mouvements. Un écart reste à expliquer et documenter ; la clôture n’est jamais corrigée automatiquement.</p>
            </section>
            <section className={styles.card} aria-labelledby="fa-assets-title"><header><h2 id="fa-assets-title">Actifs et composants — {TABLE_LABELS[table]}</h2><span className={styles.muted}>{activeFamily}</span></header>
              <AssetTable ref={tableRef} units={familyUnits} table={table} filter={filter} sort={sort} selectedId={selected} onFilter={f => { setFilter(f); setStep(f); }} onSort={setSort} onOpen={openUnit} onBackToBridge={() => bridgeRef.current?.focusStep(step ?? "opening")}/>
            </section>
            <section className={styles.card} aria-labelledby="fa-framing-title"><header><h2 id="fa-framing-title" tabIndex={-1}>Cadrage registre → GL par compte</h2><span className={styles.muted}>{result.framing.net.kind === "known" ? "Écart net " + eur(result.framing.net.value, { signed: true }) + " · brut " + knownLabel(result.framing.gross) : result.framing.net.reason}</span></header>
              <p className={styles.muted}>{result.framing.convention}</p>
              <div className={styles.tableScroll} role="region" aria-label="Cadrage registre GL — défilement clavier" tabIndex={0}><table><caption>Registre converti en débit positif comparé au GL, compte par compte — aucune compensation entre comptes</caption>
                <thead><tr><th scope="col">Compte</th><th scope="col">Tableau</th><th scope="col" className={styles.money}>Registre</th><th scope="col" className={styles.money}>GL</th><th scope="col" className={styles.money}>Écart</th><th scope="col">Actifs</th></tr></thead>
                <tbody>{result.framing.rows.map(r => <tr key={r.account} data-current={r.table === table || undefined}><th scope="row">{r.account}<span className={styles.meaning}>{r.label}</span></th><td>{r.table ? TABLE_LABELS[r.table] : "—"}</td><td className={styles.money}>{r.register ? eur(r.register) : "Absent"}</td><td className={styles.money}>{r.ledger ? eur(r.ledger) : "Absent"}</td>
                  <td className={styles.money}>{r.difference.kind === "known" ? eur(r.difference.value, { signed: true }) : "Non rapprochable"}<span className={styles.meaning}>{r.difference.kind === "known" ? (r.difference.value.amount === "0.00" ? "aucun écart" : "à expliquer") : r.difference.reason}</span></td><td>{r.units.join(", ") || "Aucun actif au registre"}</td></tr>)}</tbody></table></div>
            </section>
          </div>}
          {run?.population && (table === "amortization" || !result) && <section className={styles.card} aria-labelledby="fa-methods-title"><header><h2 id="fa-methods-title">Méthodes et comparaison versionnée</h2><span className={styles.muted}>Formule et entrées de chaque actif dans le panneau de détail</span></header>
            {pendingChange && <p className={styles.notice} role="note">Méthodes modifiées depuis la version exécutée r{pendingChange.from.revision} v{pendingChange.from.version} ({pendingChange.methods.join(", ")}) : le résultat précédent reste dans l’historique. Exécutez la revue pour obtenir la comparaison ; aucun recalcul silencieux.</p>}
            {comparison ? <div className={styles.tableScroll} role="region" aria-label="Comparaison des recalculs — défilement clavier" tabIndex={0}><table className={fa.compare}><caption>Comparaison r{comparison.from.revision} v{comparison.from.version} → r{comparison.to.revision} v{comparison.to.version} : actifs dont la méthode, les paramètres ou le recalcul changent</caption>
              <thead><tr><th scope="col">Actif</th><th scope="col">Avant</th><th scope="col">Après</th><th scope="col" className={styles.money}>Variation du recalcul</th></tr></thead>
              <tbody>{comparison.rows.map(r => { const side = (b: typeof r.before) => b ? `${b.method ? b.method.id + " v" + b.method.version : "sans méthode"} · ${b.inputs.durationMonths ?? "?"} mois · résiduel ${b.inputs.residual ? eur(b.inputs.residual) : "?"} · ${b.recalculated.kind === "known" ? eur(b.recalculated.value) : FA_RECALC_TEXT[b.status].label.toLowerCase()}` : "Absent";
                return <tr key={r.unitId}><th scope="row">{r.unitId}<span className={styles.meaning}>{r.label}</span></th><td>{side(r.before)}</td><td className={fa.changed}>{side(r.after)}</td><td className={styles.money}>{r.change.kind === "known" ? eur(r.change.value, { signed: true }) : r.change.reason}</td></tr>; })}
                {!comparison.rows.length && <tr><td colSpan={4}>Aucune différence de recalcul entre ces versions.</td></tr>}</tbody></table></div>
              : !pendingChange && <p className={styles.muted}>Aucune version antérieure exécutée avec une autre méthode ou d’autres paramètres.</p>}
            {editable && <><MethodsEditor draft={methodsDraft} saved={run?.fixedAssetWork ?? null} referenced={referenced} disabled={saving} onChange={setDraft}/>
              <div className={styles.actions} role="group" aria-label="Méthodes documentées"><button type="button" className={styles.primary} disabled={saving || !dirty} onClick={() => action("configure", { draft: methodsDraft })}>Enregistrer les méthodes</button>
                <span className={styles.muted}>{dirty ? "Brouillon modifié — l’enregistrement retire le résultat courant ; une nouvelle exécution sera requise." : "Méthodes enregistrées."}</span></div></>}
          </section>}
          {editable && run?.state === "ready" && <div className={styles.actions} role="group" aria-label="Exécution"><button type="button" className={styles.primary} disabled={saving || dirty} onClick={() => action("execute")}>Exécuter la revue des immobilisations</button><span className={styles.muted}>{dirty ? "Enregistrez d’abord les méthodes modifiées." : "Calcul serveur sur les sources figées et les méthodes enregistrées."}</span></div>}
        </div>
        <AssetDetailPanel ref={detailRef} unit={selectedUnit} fact={selectedFact} table={table} result={result} view={view} dossierId={dossierId} periodId={pid} onReturn={returnFromPanel}/>
      </div>}

      {tab === "exceptions" && <div role="tabpanel" id="fa-panel-exceptions" aria-labelledby="fa-tab-exceptions" className={styles.main}>
        <section className={styles.card} aria-labelledby="fa-exceptions-title"><header><h2 id="fa-exceptions-title">Exceptions et incertitudes du calcul serveur</h2><span className={styles.muted}>Elles restent dans le résultat après revue</span></header>
          {!result ? <p className={styles.muted}>Aucun calcul exécuté pour cette version.</p> : exceptions.length ? <ul className={styles.list}>{exceptions.map(e => <li key={e.id}>
            <div className={styles.kv}><strong>{e.label}</strong><span>{FA_UNCERTAINTY_CODES.includes(e.code) ? "Incertitude" : "Exception"}</span><span>{e.unitId ?? "Compte " + e.targetId}{e.table ? " · " + TABLE_LABELS[e.table] : ""}</span><span className={styles.money}>{knownLabel(e.amount)}</span></div><p>{e.message}</p>
            <button type="button" onClick={() => showUnit(e.unitId, e.table)}>{e.unitId ? "Voir l’actif " + e.unitId + " dans le pont" : "Voir le cadrage registre → GL"}</button></li>)}</ul> : <p>Aucune exception sur le périmètre testé. Cela ne démontre ni l’existence physique ni la valeur des biens.</p>}
        </section>
        {run && <section className={styles.card} aria-labelledby="fa-notes-title"><h2 id="fa-notes-title">Traitements documentés et conclusion</h2>
          <ul className={styles.list}>{run.notes.map(n => <li key={n.id} id={"fa-note-" + n.id} tabIndex={-1} className={resolvedNoteId === n.id ? styles.resolved : undefined}><p>{n.text}</p><p className={styles.muted}>{n.blocking ? "Bloquant" : "Non bloquant"} · {knownLabel(n.amount)} · auteur {n.authorId}</p>
            {n.resolution ? <p>Traitement documenté par {n.resolution.authorId} : {n.resolution.text}</p> : editable && <button type="button" aria-disabled={saving || !comment.trim()} onClick={() => { if (!saving && comment.trim()) action("resolve", { noteId: n.id, text: comment }); }}>Documenter le traitement avec le texte ci-dessous</button>}</li>)}
            {!run.notes.length && <li className={styles.muted}>Aucun point ouvert.</li>}</ul>
          {editable && <label>Traitement ou commentaire<textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Ex. : écart −1,00 expliqué par une mise au rebut non saisie (PV R-17)"/></label>}
          {editable && <div className={styles.actions}><button type="button" disabled={saving || !comment.trim()} onClick={() => action("note", { note: { id: crypto.randomUUID(), kind: "observation", text: comment, amount: { kind: "unknown", reason: "Observation à documenter" }, blocking: false } })}>Ajouter comme commentaire non bloquant</button></div>}
          <label>Conclusion du préparateur<textarea aria-label="Conclusion" value={conclusion} disabled={!editable || saving} onChange={e => setConclusion(e.target.value)}/></label>
          {editable && <button type="button" disabled={saving || !conclusion.trim()} onClick={() => action("conclude", { text: conclusion })}>Sauvegarder la conclusion</button>}
        </section>}
      </div>}

      {tab === "pieces" && <div role="tabpanel" id="fa-panel-pieces" aria-labelledby="fa-tab-pieces" className={styles.main}>
        <section className={styles.card} aria-labelledby="fa-pieces-title"><header><h2 id="fa-pieces-title">Index des pièces versionnées</h2><span className={styles.muted}>Originaux téléchargeables séparément avec la même permission</span></header>
          <div className={styles.tableScroll} role="region" aria-label="Index des pièces — défilement clavier" tabIndex={0}><table><caption>Sources du dossier et de la période — courantes et remplacées</caption><thead><tr><th scope="col">Type</th><th scope="col">Pièce</th><th scope="col">Version / SHA-256</th><th scope="col">Approbation</th><th scope="col">Actualité</th></tr></thead>
            <tbody>{view.imports.map(b => <tr key={b.id}><th scope="row">{SOURCE_TYPE_LABELS[b.document.documentType as keyof typeof SOURCE_TYPE_LABELS] ?? b.document.documentType}</th><td>{b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")}</td><td><code>{b.document.id.slice(0, 22)}…</code><br/><code>{b.document.byteHash.slice(0, 16)}…</code></td>
              <td>{b.approval ? b.approval.actorId + " · " + new Date(b.approval.at).toLocaleString("fr-FR") : "Aperçu non approuvé"}</td><td>{view.sourceHeads.some(h => h.import_id === b.id) ? (run?.importIds.includes(b.id) ? "Courante · figée dans la feuille" : "Courante") : b.approval ? "Remplacée — conservée" : "Non approuvée"}{view.permissions.includes("download") && <> · <a href={"/api/workpapers/immobilisations?" + new URLSearchParams({ dossierId, periodId: pid, operation: "download", id: b.document.id })}>original</a></>}</td></tr>)}
              {!view.imports.length && <tr><td colSpan={5}>Aucune pièce importée.</td></tr>}</tbody></table></div>
          {result && <><h3>Méthodes documentées à l’exécution</h3><ul className={styles.list}>{result.methods.map(m => <li key={m.id}><div className={styles.kv}><strong>{m.id} v{m.version}</strong><span>{m.kind === "linear" ? "Linéaire" : "Non couverte"}</span><span>{m.applicable ? "applicable à la clôture" : "non applicable à la clôture"}</span><span>{plural(m.unitsUsing, "actif")}</span></div><p className={styles.muted}>{m.source} · {m.authorId} · {new Date(m.authoredAt).toLocaleString("fr-FR")}</p></li>)}{!result.methods.length && <li className={styles.muted}>Aucune méthode documentée.</li>}</ul></>}
          <p className={styles.muted}>Une pièce absente ne devient jamais une preuve fournie. Les binaires originaux ne sont pas inclus dans l’export.</p>
        </section>
      </div>}

      {tab === "revue" && <div role="tabpanel" id="fa-panel-revue" aria-labelledby="fa-tab-revue" className={styles.main}>
        <section className={styles.card} aria-labelledby="fa-review-title"><h2 id="fa-review-title">Soumission, revue et verrouillage</h2>
          {!run ? <p className={styles.muted}>Aucune feuille.</p> : <>
            <p>État : <strong>{STATE_LABELS[run.state] ?? run.state}</strong> · préparateur réel {run.preparedBy}{run.approval ? " · approuvé par " + run.approval.actorId + " le " + new Date(run.approval.at).toLocaleString("fr-FR") : ""}</p>
            {openNotes.length > 0 && <p className={styles.notice}>{plural(openNotes.length, "point bloquant", "points bloquants")} à documenter avant approbation (onglet Exceptions).</p>}
            {run.state === "executed" && canPrepare && <button type="button" className={styles.primary} disabled={saving || !current || conclusion !== (run.conclusion ?? "")} onClick={() => action("submit")}>Soumettre cette version</button>}
            {run.state === "awaiting_review" && canReview && <><label>Note de revue<textarea value={reviewText} onChange={e => setReviewText(e.target.value)}/></label>
              <div className={styles.actions}>{(["approved", "changes_requested"] as const).map(d => <button key={d} type="button" className={d === "approved" ? styles.primary : undefined} disabled={saving || !reviewText.trim() || !current} onClick={() => action("review", { decision: d, text: reviewText, submittedHash: run.submittedHash })}>{d === "approved" ? "Approuver la revue des immobilisations" : "Demander une correction"}</button>)}</div></>}
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

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { fiscalPeriodLabel } from "@/lib/workpapers/fiscal-labels";
import type { VatDraft, VatResult } from "@/lib/workpapers/fiscal-vat-contract";
import type { CitDraft, CitResult } from "@/lib/workpapers/fiscal-cit-contract";
import { AdjustmentsView, CitBridgeView, CitComparisons, CitDeclarationLines, ComputationView, FramingView } from "./CitViews";
import { CitPreparation } from "./CitPreparation";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { BlockedRules, BridgeView, Chip, ComparisonTable, ControlsView, PaymentsCredit, RatesView } from "./FiscalTests";
import { DeclarationLines, type DeclarationLinesHandle } from "./DeclarationLines";
import { FiscalDetailPanel, type FiscalDetailHandle } from "./FiscalDetailPanel";
import { FiscalImportPanel } from "./FiscalImportPanel";
import { citableOptions, FiscalPreparation } from "./FiscalPreparation";
import { cents, dateFr, fiscalFailureMessage, FREQUENCY_LABELS, plural, STATE_LABELS, TIER_LABELS } from "./format";
import { itemOf, selectionFromItem, type FiscalSelection, type FiscalView } from "./types";
import styles from "../cash/cash.module.css";
import fx from "./fiscal.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
type Tab = "population" | "tests" | "exceptions" | "pieces" | "revue";
export type FiscalFilter = "all" | "blocked" | "exceptions" | "evidence" | "review" | "stale";
const TABS: { id: Tab; label: string }[] = [{ id: "population", label: "Population" }, { id: "tests", label: "Tests" }, { id: "exceptions", label: "Exceptions" }, { id: "pieces", label: "Pièces" }, { id: "revue", label: "Revue" }];
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
const FILTER_TAB: Record<FiscalFilter, Tab> = { all: "tests", blocked: "exceptions", exceptions: "exceptions", evidence: "pieces", review: "revue", stale: "pieces" };
const UNCERTAINTY = ["ENGINE_BLOCKED", "LEDGER_ONLY", "PROFILE_UNCONFIRMED", "SOURCE_NOT_COVERED", "MISSING_INFORMATION"];
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
export interface FiscalRequested { periodId: string; tax?: "vat" | "cit"; period?: { startDate: string; endDate: string }; id?: string; version?: number; filter: FiscalFilter; item?: string; noteId?: string }
/** The run's own result, of its own tax; the browser never recomputes it. */
const resultOf = (run: WorkpaperRun | null): VatResult | CitResult | null => {
  const tax = (run?.result?.result as { tax?: string } | null)?.tax;
  return run?.result?.execution === "completed" && run.fiscalWork && tax === run.fiscalWork.tax ? run.result.result as VatResult | CitResult : null;
};
const UNCERTAIN_CODES = [...UNCERTAINTY, "LIASSE_ABSENT"];
const runLabel = (r: WorkpaperRun) => r.fiscalWork!.tax === "vat" ? "TVA · " + fiscalPeriodLabel(r.fiscalWork!.period, r.fiscalWork!.frequency) : "IS · " + fiscalPeriodLabel(r.fiscalWork!.period, "annual");

export function FiscalWorkspace({ initialDossierId = "", requested }: { initialDossierId?: string; requested?: FiscalRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState<AccountingPeriod>(emptyPeriod);
  const [view, setView] = useState<FiscalView | null>(null), [activeId, setActiveId] = useState(""), [tax, setTax] = useState<"vat" | "cit">(requested?.tax ?? "vat");
  const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const [tab, setTab] = useState<Tab>(requested?.item ? "tests" : FILTER_TAB[requested?.filter ?? "all"]);
  const [selection, setSelection] = useState<FiscalSelection>(selectionFromItem(requested?.item));
  const [expanded, setExpanded] = useState<string[]>(requested?.item?.startsWith("L:") ? [requested.item.slice(2)] : []);
  const [conclusion, setConclusion] = useState(""), [reviewText, setReviewText] = useState(""), [resolution, setResolution] = useState<Record<string, { text: string; citation: string }>>({});
  const [creating, setCreating] = useState({ startDate: "", endDate: "", frequency: "quarterly" as "monthly" | "quarterly" | "annual", formVintage: "" });
  const [exactVersion] = useState(!!requested?.id && requested.version !== undefined);
  const busy = useRef(false), csrf = useRef(""), returnFocus = useRef<HTMLElement | null>(null), detailRef = useRef<FiscalDetailHandle>(null), linesRef = useRef<DeclarationLinesHandle>(null), tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = view?.runs.find(r => r.id === activeId && r.fiscalWork?.tax === tax) ?? null, result = useMemo(() => resultOf(run), [run]);
  const vat = result?.tax === "vat" ? result : null, cit = result?.tax === "cit" ? result : null;
  const current = run ? view?.sourcesCurrent[run.id] !== false : true;
  const canPrepare = !exactVersion && !!view?.permissions.includes("prepare"), canReview = !exactVersion && !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
  const editable = !!run && canPrepare && run.preparedBy === view?.actorId && current && ["draft", "ready", "executed"].includes(run.state);
  const saving = status === "saving";
  const endpoint = (imports = false) => "/api/workpapers/fiscal" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid });
  // Navigation by period: the latest revision of each declarative period, in calendar order.
  const periods = useMemo(() => {
    const latest = new Map<string, WorkpaperRun>();
    for (const r of view?.runs ?? []) { const l = latest.get(r.rootId); if (!l || r.revision > l.revision) latest.set(r.rootId, r); }
    return [...latest.values()].filter(r => r.fiscalWork?.tax === tax).sort((a, b) => a.fiscalWork!.period.startDate < b.fiscalWork!.period.startDate ? -1 : 1);
  }, [view, tax]);

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (preferred?: string, dossier = dossierId, periodKey = pid) => {
    const q = new URLSearchParams({ dossierId: dossier, periodId: periodKey, ...(exactVersion ? { operation: "version", id: requested!.id!, version: String(requested!.version) } : {}) });
    const response = await fetch("/api/workpapers/fiscal?" + q, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(fiscalFailureMessage(data.error, data.locator));
    setView(data);
    const runs: WorkpaperRun[] = data.runs;
    const byPeriod = requested?.period ? runs.filter(r => r.fiscalWork?.period.startDate === requested.period!.startDate && r.fiscalWork?.period.endDate === requested.period!.endDate).sort((a, b) => b.revision - a.revision)[0] : undefined;
    const wanted = requested?.tax ?? tax;
    const chosen = runs.find(r => r.id === (preferred || requested?.id)) ?? byPeriod ?? [...runs].filter(r => r.fiscalWork?.tax === wanted).sort((a, b) => b.revision - a.revision)[0];
    if (chosen) { setActiveId(chosen.id); setTax(chosen.fiscalWork!.tax); setPeriod(chosen.period); setConclusion(chosen.conclusion ?? ""); }
    return data as FiscalView;
  }, [dossierId, pid, exactVersion, requested, tax]);
  const deepLinkLoaded = useRef(false);
  useEffect(() => {
    if (!initialDossierId || !requested?.periodId || deepLinkLoaded.current) return;
    deepLinkLoaded.current = true;
    let active = true; setLoading(true);
    void (async () => { try { await session(); if (active) await refresh(requested.id, initialDossierId, requested.periodId); } catch (e) { if (active) setError(e instanceof Error ? e.message : "Chargement impossible"); } finally { if (active) setLoading(false); } })();
    return () => { active = false; };
  }, [initialDossierId, requested, session, refresh]);
  useEffect(() => { if (!loading && requested?.noteId && run) document.getElementById("fx-note-" + requested.noteId)?.focus(); }, [loading, requested?.noteId, run]);
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
        throw new Error(fiscalFailureMessage(data.error, data.locator));
      }
      if (!data.run && !data.batch) throw new Error("Accusé serveur incomplet. Vérifiez la version avant de reprendre.");
      try { await refresh(data.run?.id ?? activeId); } catch { setError("Sauvegarde confirmée ; actualisation indisponible. Rechargez avant la prochaine commande."); }
      setStatus("saved");
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Échec de sauvegarde"); }
    finally { busy.current = false; }
  }
  const action = (command: string, fields: Record<string, unknown> = {}) => { if (run) void mutate({ command, id: run.id, expectedVersion: run.version, ...fields }); };
  const focusPanel = useRef(false);
  useEffect(() => { if (focusPanel.current) { focusPanel.current = false; detailRef.current?.focus(); } });
  const open = (next: FiscalSelection) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focusPanel.current = true; setSelection(next); };
  const openLine = (code: string) => { setExpanded(x => x.includes(code) ? x : [...x, code]); setTab("tests"); open({ kind: "line", id: code }); };
  const returnFromPanel = () => { const t = returnFocus.current; if (t && document.contains(t)) { t.focus(); return; } if (selection?.kind === "line") linesRef.current?.focusLine(selection.id); };
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus();
  };
  const frozenSources = useMemo(() => run?.population ? run.importIds : run ? view?.expectedSources[run.id] ?? [] : [], [run, view]);
  const options = useMemo(() => view ? citableOptions(view, frozenSources) : [], [view, frozenSources]);
  const exceptions: { code: string }[] = result?.exceptions ?? [], openNotes = run?.notes.filter(n => n.blocking && !n.resolution) ?? [];
  const counts: Record<Tab, number | null> = { population: run?.selection?.selectedIds.length ?? null, tests: vat ? vat.controls.length : cit ? cit.comparisons.length : null, exceptions: exceptions.length || null, pieces: view?.imports.filter(b => b.approval).length ?? null, revue: openNotes.length || null };
  const sheetUrl = "/fiscal?" + new URLSearchParams({ dossierId, periodId: pid });
  const parse = (k: string) => { const [documentId, rowId] = k.split("#"); return { documentId, ...(rowId ? { rowId } : {}) }; };

  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/dashboard/fiscalite">Cockpit fiscal (démonstration)</a><a href="/tresorerie">Procédures de mission · Trésorerie</a><a href="/capitaux-propres">Procédures de mission · Capitaux propres</a><span aria-current="page">Procédures de mission · Fiscalité (TVA, IS)</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable · identité serveur</p><h1>Fiscalité — TVA puis IS</h1>
      <p className={styles.muted}>Rapprochement des écritures, de la déclaration versionnée et des pièces par période déclarative, avec les moteurs fiscaux existants. Aucune liquidation, aucune télétransmission, aucun taux qualifié de légal.</p></div>
      <a href={"/fiscal/synthese?" + new URLSearchParams({ dossierId, periodId: pid, ...(run ? { rootId: run.rootId, id: run.id, version: String(run.version) } : {}) })}>Ouvrir la Revue et Synthèse fiscale</a></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); void load(); }}>
      <label>Dossier<input value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required={!requested?.periodId} disabled={saving || loading || !!requested?.periodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
      <button className={styles.primary} disabled={saving || loading}>{loading ? "Chargement…" : "Charger les feuilles"}</button>
    </form>
    <div className={styles.context} aria-label="Contexte du dossier">
      <span>Dossier <strong>{dossierId || "—"}</strong></span><span>Organisation <strong>{run?.scope.organizationId ?? "—"}</strong></span>
      <span>Exercice <strong>{period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—"}</strong></span>
      <span>Mode <strong>réel — recette jetable</strong></span><span>Identité <strong>{view?.actorId ?? "non connectée"}</strong></span>
      <span>Feuille <strong>{run ? `${runLabel(run)} · r${run.revision} · v${run.version} · ${STATE_LABELS[run.state] ?? run.state}` : "—"}</strong></span>
      <span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{SAVE_LABELS[status]}</span>
    </div>
    {loading && !view && <p role="status" className={styles.muted}>Lecture de l’état serveur…</p>}
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/connect|session/i.test(error) && <> <a href={"/api/auth/login?returnTo=" + encodeURIComponent(sheetUrl)}>Se connecter</a></>}</p>}
    {conflict && <div role="alert" className={styles.notice} data-tone="danger"><p>Conflit : la feuille est passée en version {conflict.current.version} (attendue {conflict.expectedVersion}). Aucune donnée n’a été écrasée.</p><button type="button" onClick={() => { setConflict(null); void refresh(conflict.current.id); }}>Recharger la version serveur</button></div>}
    {exactVersion && <p className={styles.notice} data-tone="info">Consultation de la version {requested?.version} : lecture seule.</p>}
    {view && <>
      <div className={fx.taxNav} role="group" aria-label="Impôt">
        {(["vat", "cit"] as const).map(t => <button key={t} type="button" aria-pressed={tax === t} onClick={() => { setTax(t); setSelection(null); const next = view.runs.filter(r => r.fiscalWork?.tax === t).sort((a, b) => b.revision - a.revision)[0]; setActiveId(next?.id ?? ""); setConclusion(next?.conclusion ?? ""); }}>{t === "vat" ? "TVA" : "IS"}</button>)}
      </div>
      <section aria-labelledby="fx-periods-title"><h2 id="fx-periods-title" className={styles.srOnly}>{tax === "vat" ? "Périodes déclaratives" : "Exercice"}</h2>
        {periods.length ? <ul className={fx.periodNav}>{periods.map(r => { const w = r.fiscalWork!, res = resultOf(r), stale = view.sourcesCurrent[r.id] === false; return <li key={r.rootId}>
          <button type="button" aria-current={run?.rootId === r.rootId} onClick={() => { setActiveId(r.id); setSelection(null); setConclusion(r.conclusion ?? ""); }}>
            <strong>{runLabel(r)}</strong><small>{dateFr(w.period.startDate)} → {dateFr(w.period.endDate)} · {FREQUENCY_LABELS[w.frequency]}</small>
            <span className={styles.kv}><Chip outcome={r.state === "locked" ? "passed" : undefined} label={STATE_LABELS[r.state] ?? r.state}/>{res && <Chip outcome={r.result?.outcome}/>}{stale && <span className={fx.chip} data-tone="danger">Périmée</span>}</span>
          </button></li>; })}</ul> : <p className={styles.muted}>{tax === "vat" ? "Aucune feuille TVA pour cet exercice : créez la première période déclarative." : "Aucune feuille IS pour cet exercice : créez-la en indiquant le millésime de la liasse."}</p>}
        {canPrepare && tax === "cit" && !periods.length && <form className={styles.fields} onSubmit={e => { e.preventDefault(); void mutate({ command: "create", period, tax: "cit", formVintage: Number(creating.formVintage) }); }}>
          <label>Millésime de la liasse<input type="number" required min={2000} max={2200} value={creating.formVintage} disabled={saving} onChange={e => setCreating(c => ({ ...c, formVintage: e.target.value }))} placeholder="Ex. 2026"/></label>
          <button type="submit" disabled={saving}>Créer la feuille IS de l’exercice</button>
        </form>}
        {canPrepare && tax === "vat" && <details open={!periods.length}><summary>Nouvelle période déclarative</summary><form className={styles.fields} onSubmit={e => { e.preventDefault(); void mutate({ command: "create", period, tax: "vat", declarativePeriod: { startDate: creating.startDate, endDate: creating.endDate }, frequency: creating.frequency, formVintage: Number(creating.formVintage) }); }}>
          <label>Début de période<input type="date" required value={creating.startDate} disabled={saving} onChange={e => setCreating(c => ({ ...c, startDate: e.target.value }))}/></label>
          <label>Fin de période<input type="date" required value={creating.endDate} disabled={saving} onChange={e => setCreating(c => ({ ...c, endDate: e.target.value }))}/></label>
          <label>Périodicité<select value={creating.frequency} disabled={saving} onChange={e => setCreating(c => ({ ...c, frequency: e.target.value as typeof c.frequency }))}>{Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Millésime du formulaire<input type="number" required min={2000} max={2200} value={creating.formVintage} disabled={saving} onChange={e => setCreating(c => ({ ...c, formVintage: e.target.value }))} placeholder="Ex. 2026"/></label>
          <button type="submit" disabled={saving}>Créer la feuille de cette période</button>
        </form></details>}
      </section>
      {run && !current && <p role="alert" className={styles.notice} data-tone="danger">Travail périmé : une source dont dépend {tax === "vat" ? "cette période (FEC, déclaration de la période ou de la précédente, inventaires)" : "cet exercice (FEC, liasse, 2065, pièces)"} a été remplacée ou ajoutée. Les résultats affichés portent sur les versions figées. {canPrepare && <button type="button" disabled={saving} onClick={() => action("revise")}>Créer une révision sur les sources courantes</button>}</p>}
      {run ? <>
        <div role="tablist" aria-label="Sections de la feuille" className={styles.tabs}>{TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" id={"fx-tab-" + t.id} aria-controls={"fx-panel-" + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onKeyDown={e => onTabKey(e, i)} onClick={() => setTab(t.id)}>{t.label}{counts[t.id] !== null && <span>{counts[t.id]}</span>}</button>)}</div>
        <div className={styles.workspace}>
          <div className={styles.main} role="tabpanel" id={"fx-panel-" + tab} aria-labelledby={"fx-tab-" + tab}>
            {tab === "population" && <section className={styles.card} aria-labelledby="fx-pop-title"><header><h2 id="fx-pop-title">Population et sélection</h2></header>
              {run.population ? <><p>{plural(run.selection!.selectedIds.length, tax === "vat" ? "écriture de TVA sélectionnée" : "écriture de résultat sélectionnée", tax === "vat" ? "écritures de TVA sélectionnées" : "écritures de résultat sélectionnées")} sur {plural(run.population.items.length, tax === "vat" ? "écriture de TVA du FEC figé" : "écriture de résultat du FEC figé", tax === "vat" ? "écritures de TVA du FEC figé" : "écritures de résultat du FEC figé")} · {plural(run.selection!.exclusions.length, "exclusion motivée", "exclusions motivées")}.</p>
                <p className={styles.muted}>{run.selection!.criteria}</p>
                <div className={styles.tableScroll} role="region" aria-label="Population — défilement clavier" tabIndex={0}><table><caption>{tax === "vat" ? "Écritures de TVA : montant = TVA collectée − TVA déductible de l’écriture" : "Écritures de résultat : montant = effet sur le résultat (crédit − débit, classes 6 et 7)"}</caption><thead><tr><th scope="col">Écriture</th><th scope="col">{tax === "vat" ? "Effet TVA" : "Effet sur le résultat"}</th><th scope="col">Lignes FEC</th><th scope="col">Sélection</th></tr></thead>
                  <tbody>{run.population.items.map(i => { const excl = run.selection!.exclusions.find(e => e.id === i.id), entry = vat?.entries.find(e => e.itemId === i.id); return <tr key={i.id} className={selection?.kind === "entry" && entry && selection.id === entry.id ? fx.selectedRow : undefined}>
                    <td>{entry ? <button type="button" className={fx.linkButton} onClick={() => open({ kind: "entry", id: entry.id })}>{i.id.slice(2).replace(":", " ")}</button> : i.id.slice(2).replace(":", " ")}</td><td className={styles.money}>{cents(i.amount.amount.replace(".", ""))}</td><td>{i.rowIds.length}</td><td>{excl ? "Exclue — " + excl.reason : "Sélectionnée"}</td></tr>; })}</tbody></table></div></>
                : <p className={styles.muted}>Population non figée : approuvez les sources de la période (Pièces) puis figez-les (Revue).</p>}
            </section>}
            {tab === "tests" && (vat ? <>
              <p className={styles.notice} data-tone={vat.engine.status === "blocked" ? "danger" : "info"}>{vat.engine.status === "blocked" ? "Moteur TVA bloqué : profil, millésime ou périmètre à compléter (voir règles bloquées). Aucun montant n’est calculé." : TIER_LABELS[vat.engine.evidenceTier] + " · formulaire attendu " + (vat.engine.expectedForm ?? "—") + " millésime " + vat.formVintage + "."} Résultat {run.result?.outcome === "no_exception_detected" ? "sans écart sur le périmètre testé" : run.result?.outcome === "exceptions_detected" ? "avec exceptions maintenues" : "non concluant sur une partie"} — aucune conformité déclarée.</p>
              <ComparisonTable result={vat} onLine={openLine}/>
              <BridgeView result={vat}/>
              <DeclarationLines ref={linesRef} result={vat} expanded={expanded} selection={selection} onToggle={code => setExpanded(x => x.includes(code) ? x.filter(c => c !== code) : [...x, code])} onEntry={id => open({ kind: "entry", id })} onLine={code => open({ kind: "line", id: code })}/>
              <PaymentsCredit result={vat}/>
              <RatesView result={vat} selection={selection} onSelect={key => open({ kind: "rate", id: key })}/>
              <BlockedRules result={vat} selection={selection} onSelect={code => open({ kind: "rule", id: code })}/>
              <ControlsView result={vat}/>
            </> : cit ? <>
              <p className={styles.notice} data-tone={cit.engine.status === "blocked" ? "danger" : "info"}>{cit.engine.status === "blocked" ? "Moteur IS bloqué : barème, millésime, profil ou liasse à compléter (voir règles bloquées). Aucun impôt n’est calculé." : "Barème " + (cit.engine.rateScheduleId ?? "—") + " · exercice " + cit.fiscalYear + " · millésime " + cit.formVintage + "."} Résultat {run.result?.outcome === "no_exception_detected" ? "sans écart sur le périmètre testé" : run.result?.outcome === "exceptions_detected" ? "avec exceptions maintenues" : "non concluant sur une partie"} — aucune liquidation ni conformité déclarée.</p>
              <FramingView result={cit}/>
              <CitBridgeView result={cit}/>
              <AdjustmentsView result={cit} selection={selection} onSelect={id => open({ kind: "adjustment", id })}/>
              <ComputationView result={cit}/>
              <CitComparisons result={cit}/>
              <CitDeclarationLines result={cit} selection={selection} onSelect={key => open({ kind: "line", id: key })}/>
              <BlockedRules result={cit} selection={selection} onSelect={code => open({ kind: "rule", id: code })}/>
            </> : <section className={styles.card}><h2>Tests</h2><p className={styles.muted}>{run.population ? "Sources figées : exécutez le moteur TVA (Revue)." : "Feuille non exécutée : approuvez puis figez les sources de la période."}</p></section>)}
            {tab === "exceptions" && <section className={styles.card} aria-labelledby="fx-exc-title"><header><h2 id="fx-exc-title">Exceptions, incertitudes et traitements</h2><span className={styles.muted}>{plural(exceptions.filter(e => !UNCERTAIN_CODES.includes(e.code)).length, "exception")} · {plural(exceptions.filter(e => UNCERTAIN_CODES.includes(e.code)).length, "incertitude")}</span></header>
              {!run.notes.length && <p className={styles.muted}>Aucune exception ni note sur cette version.</p>}
              <ul className={styles.list}>{run.notes.map(n => { const r = resolution[n.id] ?? { text: "", citation: "" }; return <li key={n.id} id={"fx-note-" + n.id} tabIndex={-1}>
                <div className={styles.kv}><strong>{n.text}</strong><span>{n.amount.kind === "known" ? cents(n.amount.value.amount.replace(".", ""), { signed: true }) : n.amount.reason}</span><span className={fx.chip} data-tone={n.resolution ? "ok" : n.blocking ? "danger" : "muted"}>{n.resolution ? "Traité" : n.blocking ? "Bloquant ouvert" : "Ouvert"}</span><span className={styles.muted}>{n.kind} · {n.authorId}</span></div>
                {n.resolution && <p className={styles.muted}>Traitement : {n.resolution.text} — {n.resolution.authorId} · {n.resolution.citation ? n.resolution.citation.fileName + " · version " + n.resolution.citation.documentVersionId.slice(7, 19) + (n.resolution.citation.row ? " · ligne " + n.resolution.citation.row : "") + (n.resolution.citation.zone ? " · " + n.resolution.citation.zone : "") : "sans citation"}</p>}
                {!n.resolution && editable && n.blocking && <div className={styles.fields}>
                  <label>Traitement documenté<textarea value={r.text} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, text: e.target.value } }))}/></label>
                  <label>Pièce citée (version figée)<select value={r.citation} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, citation: e.target.value } }))}><option value="">Choisir…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                  <button type="button" disabled={saving || !r.text.trim() || !r.citation} onClick={() => action("resolve", { noteId: n.id, text: r.text, citation: parse(r.citation) })}>Enregistrer le traitement cité</button></div>}
              </li>; })}</ul>
            </section>}
            {tab === "pieces" && <>
              <FiscalImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>
              <section className={styles.card} aria-labelledby="fx-frozen-title"><header><h2 id="fx-frozen-title">Sources {run.population ? "figées pour cette version" : "courantes de cette période"}</h2></header>
                <ul className={styles.list}>{view.imports.filter(b => frozenSources.includes(b.id)).map(b => <li key={b.id} className={styles.kv}><strong>{b.document.fileName}</strong><span>{b.document.logicalId}</span><span className={styles.muted}>version {b.document.id.slice(7, 19)} · SHA-256 {b.document.byteHash.slice(0, 12)}…</span></li>)}</ul></section>
            </>}
            {tab === "revue" && <>
              {tax === "vat" ? <FiscalPreparation run={run} view={view} busy={saving} editable={editable} frozenSources={frozenSources} onFreeze={(draft: VatDraft) => action("freeze", { importIds: frozenSources, draft })} onConfigure={(draft: VatDraft) => action("configure", { draft })}/>
                : <CitPreparation run={run} view={view} busy={saving} editable={editable} frozenSources={frozenSources} sources={view.citSources} onFreeze={(draft: CitDraft) => action("freeze", { importIds: frozenSources, draft })} onConfigure={(draft: CitDraft) => action("configure", { draft })}/>}
              <section className={styles.card} aria-labelledby="fx-review-title"><header><h2 id="fx-review-title">Exécution, conclusion et revue</h2><span className={styles.muted}>État : {STATE_LABELS[run.state] ?? run.state}{run.approval ? " · approuvée par " + run.approval.actorId : ""}</span></header>
                <div className={styles.actions}>
                  {editable && run.state === "ready" && <button type="button" className={styles.primary} disabled={saving} onClick={() => action("execute")}>{tax === "vat" ? "Exécuter le moteur TVA" : "Exécuter le moteur IS"}</button>}
                  {editable && run.state === "executed" && <button type="button" disabled={saving} onClick={() => action("execute")}>Réexécuter</button>}
                </div>
                {editable && run.state === "executed" && <><label>Conclusion de la préparation<textarea value={conclusion} disabled={saving} onChange={e => setConclusion(e.target.value)}/></label>
                  <div className={styles.actions}><button type="button" disabled={saving || !conclusion.trim()} onClick={() => action("conclude", { text: conclusion })}>Enregistrer la conclusion</button>
                    <button type="button" className={styles.primary} disabled={saving || !run.conclusion || openNotes.length > 0} onClick={() => action("submit")}>Soumettre à la revue</button>{openNotes.length > 0 && <span className={styles.muted}>{plural(openNotes.length, "point bloquant ouvert", "points bloquants ouverts")}</span>}</div></>}
                {canReview && run.state === "awaiting_review" && <><label>Décision motivée du réviseur<textarea value={reviewText} disabled={saving} onChange={e => setReviewText(e.target.value)}/></label>
                  <div className={styles.actions}><button type="button" className={styles.primary} disabled={saving || !reviewText.trim()} onClick={() => action("review", { decision: "approved", submittedHash: run.submittedHash, text: reviewText })}>Approuver cette version</button>
                    <button type="button" className={styles.danger} disabled={saving || !reviewText.trim()} onClick={() => action("review", { decision: "changes_requested", submittedHash: run.submittedHash, text: reviewText })}>Demander une correction</button></div></>}
                {canReview && run.state === "approved" && <button type="button" className={styles.primary} disabled={saving} onClick={() => action("lock")}>Verrouiller la version approuvée</button>}
                {run.state === "awaiting_review" && !canReview && <p className={styles.muted}>Revue attendue par une autre identité autorisée.</p>}
                {canPrepare && ["locked", "approved", "changes_requested"].includes(run.state) && <button type="button" disabled={saving} onClick={() => action("revise")}>Créer une révision</button>}
                <p className={styles.muted}>Une revue documentée ne vaut ni conformité fiscale ni liquidation. Une suite verte sur données synthétiques n’autorise aucune mission réelle.</p>
              </section>
            </>}
          </div>
          <FiscalDetailPanel ref={detailRef} selection={selection} result={result} view={view} dossierId={dossierId} periodId={pid} onEntry={id => open({ kind: "entry", id })} onLine={openLine} onReturn={returnFromPanel}/>
        </div>
      </> : <FiscalImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>}
      <p className={styles.srOnly} aria-live="polite">{selection ? "Sélection : " + itemOf(selection) : ""}</p>
    </>}
  </main>;
}

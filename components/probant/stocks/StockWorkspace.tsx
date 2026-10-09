"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { formatCents, formatQuantity, ST_STATUS_KIND, ST_UNCERTAINTY_CODES, type StockDraft, type StockResult } from "@/lib/workpapers/stock-contract";
import { CompensationView, StockGrid, type StockFilters, type StockGridHandle } from "./StockGrid";
import { StockValuationView } from "./StockValuationView";
import { StockValueReviewView } from "./StockValueReviewView";
import { StockDetailPanel, type StockDetailHandle } from "./StockDetailPanel";
import { StockImportPanel } from "./StockImportPanel";
import { citableOptions, parseCitation, StockPreparation } from "./StockPreparation";
import { dateFr, KIND_ORDER, plural, STATE_LABELS, stockFailureMessage, type Kind, type StockView } from "./format";
import styles from "../cash/cash.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
type Tab = "population" | "tests" | "exceptions" | "pieces" | "revue";
const TABS: { id: Tab; label: string }[] = [{ id: "population", label: "Population" }, { id: "tests", label: "Tests" }, { id: "exceptions", label: "Exceptions" }, { id: "pieces", label: "Pièces" }, { id: "revue", label: "Revue" }];
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Sauvegarde en cours…", saved: "Sauvegardée — accusé serveur reçu", failed: "Échec de sauvegarde", conflict: "Conflit de modification" };
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
export interface StockRequested { periodId: string; id?: string; version?: number; item?: string; filters: StockFilters; tab?: Tab }
const resultOf = (run: WorkpaperRun | null): StockResult | null => run?.result?.execution === "completed" && run.template.id === "stocks.count" ? run.result.result as StockResult : null;

export function StockWorkspace({ initialDossierId = "", requested }: { initialDossierId?: string; requested?: StockRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState<AccountingPeriod>(emptyPeriod);
  const [view, setView] = useState<StockView | null>(null), [activeId, setActiveId] = useState("");
  const [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const [tab, setTab] = useState<Tab>(requested?.tab ?? (requested?.item ? "tests" : "tests"));
  const [selected, setSelected] = useState<string | null>(requested?.item ?? null);
  const [filters, setFilters] = useState<StockFilters>(requested?.filters ?? { kinds: [], site: "", lot: "", q: "", view: "grid" });
  const [conclusion, setConclusion] = useState(""), [reviewText, setReviewText] = useState(""), [resolution, setResolution] = useState<Record<string, { text: string; citation: string }>>({});
  const [exactVersion] = useState(!!requested?.id && requested.version !== undefined);
  const busy = useRef(false), csrf = useRef(""), returnFocus = useRef<HTMLElement | null>(null), detailRef = useRef<StockDetailHandle>(null), gridRef = useRef<StockGridHandle>(null), tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = view?.runs.find(r => r.id === activeId) ?? null, result = useMemo(() => resultOf(run), [run]);
  const unit = result?.units.find(u => u.unitId === selected) ?? null;
  const current = run ? view?.sourcesCurrent[run.id] !== false : true;
  const canPrepare = !exactVersion && !!view?.permissions.includes("prepare"), canReview = !exactVersion && !!view?.permissions.includes("review") && view.actorId !== run?.preparedBy;
  const editable = !!run && canPrepare && run.preparedBy === view?.actorId && current && ["draft", "ready", "executed"].includes(run.state);
  const saving = status === "saving";
  const endpoint = (imports = false) => "/api/workpapers/stocks" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid });
  // The context (case, site, lot, filters, view) lives in the URL: returning to the sheet restores it.
  useEffect(() => {
    if (!dossierId || !pid || typeof window === "undefined") return;
    const q = new URLSearchParams({ dossierId, periodId: pid, ...(run ? { id: run.id } : {}), ...(selected ? { item: selected } : {}), ...(filters.site ? { site: filters.site } : {}), ...(filters.lot ? { lot: filters.lot } : {}),
      ...(filters.kinds.length ? { kinds: filters.kinds.join(",") } : {}), ...(filters.q ? { q: filters.q } : {}), ...(filters.view === "table" ? { view: "table" } : {}), ...(tab !== "tests" ? { tab } : {}) });
    if (exactVersion && requested?.version) q.set("version", String(requested.version));
    window.history.replaceState(null, "", "/stocks?" + q);
  }, [dossierId, pid, run, selected, filters, tab, exactVersion, requested?.version]);

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (preferred?: string, dossier = dossierId, periodKey = pid) => {
    const q = new URLSearchParams({ dossierId: dossier, periodId: periodKey, ...(exactVersion ? { operation: "version", id: requested!.id!, version: String(requested!.version) } : {}) });
    const response = await fetch("/api/workpapers/stocks?" + q, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(stockFailureMessage(data.error, data.locator));
    setView(data);
    const runs: WorkpaperRun[] = data.runs;
    const chosen = runs.find(r => r.id === (preferred || requested?.id)) ?? [...runs].sort((a, b) => b.revision - a.revision)[0];
    if (chosen) { setActiveId(chosen.id); setPeriod(chosen.period); setConclusion(chosen.conclusion ?? ""); }
    return data as StockView;
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
        throw new Error(stockFailureMessage(data.error, data.locator));
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
  const open = (unitId: string) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focusPanel.current = true; setSelected(unitId); };
  const returnFromPanel = () => { const t = returnFocus.current; if (t && document.contains(t)) { t.focus(); return; } if (selected) gridRef.current?.focusUnit(selected); };
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus();
  };
  const frozenSources = useMemo(() => run?.population ? run.importIds : view?.expectedSources ?? [], [run, view]);
  const options = useMemo(() => view ? citableOptions(view, frozenSources) : [], [view, frozenSources]);
  const exceptions = result?.exceptions ?? [], openNotes = run?.notes.filter(n => n.blocking && !n.resolution) ?? [];
  const counts: Record<Tab, number | null> = { population: run?.selection?.selectedIds.length ?? null, tests: result ? result.units.length : null, exceptions: exceptions.length || null, pieces: view?.imports.filter(b => b.approval).length ?? null, revue: openNotes.length || null };
  const sheetUrl = "/stocks?" + new URLSearchParams({ dossierId, periodId: pid });
  const kindTotals = result ? KIND_ORDER.map(k => [k, result.units.filter(u => ST_STATUS_KIND[u.status] === k).length] as [Kind, number]) : [];

  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/tresorerie">Procédures de mission · Trésorerie</a><a href="/immobilisations">Procédures de mission · Immobilisations</a><a href="/fiscal">Procédures de mission · Fiscalité</a><span aria-current="page">Procédures de mission · Stocks</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable · identité serveur</p><h1>Stocks et inventaires</h1>
      <p className={styles.muted}>Du comptage physique à la quantité de clôture, référence par référence, site par site, lot par lot. Le stock propre est distingué des stocks de tiers, consignations, transits et en-cours. L’outil ne certifie jamais la présence physique et ne déprécie rien automatiquement.</p></div></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); void load(); }}>
      <label>Dossier<input value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required={!requested?.periodId} disabled={saving || loading || !!requested?.periodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
      <button className={styles.primary} disabled={saving || loading}>{loading ? "Chargement…" : "Charger la feuille"}</button>
    </form>
    <div className={styles.context} aria-label="Contexte du dossier">
      <span>Dossier <strong>{dossierId || "—"}</strong></span><span>Organisation <strong>{run?.scope.organizationId ?? "—"}</strong></span>
      <span>Exercice <strong>{period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—"}</strong></span>
      <span>Mode <strong>réel — recette jetable</strong></span><span>Identité <strong>{view?.actorId ?? "non connectée"}</strong></span>
      <span>Feuille <strong>{run ? `r${run.revision} · v${run.version} · ${STATE_LABELS[run.state] ?? run.state}` : "—"}</strong></span>
      <span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{SAVE_LABELS[status]}</span>
    </div>
    {loading && !view && <p role="status" className={styles.muted}>Lecture de l’état serveur…</p>}
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/connect|session/i.test(error) && <> <a href={"/api/auth/login?returnTo=" + encodeURIComponent(sheetUrl)}>Se connecter</a></>}</p>}
    {conflict && <div role="alert" className={styles.notice} data-tone="danger"><p>Conflit : la feuille est passée en version {conflict.current.version} (attendue {conflict.expectedVersion}). Aucune donnée n’a été écrasée.</p><button type="button" onClick={() => { setConflict(null); void refresh(conflict.current.id); }}>Recharger la version serveur</button></div>}
    {exactVersion && <p className={styles.notice} data-tone="info">Consultation de la version {requested?.version} : lecture seule.</p>}
    {view && <>
      {!run && <section className={styles.card}><h2>Feuille Stocks de l’exercice</h2><p className={styles.muted}>Aucune feuille : qualifiez les sources (comptage, théorique, mouvements, pièces) puis créez la feuille.</p>
        {canPrepare && <button type="button" className={styles.primary} disabled={saving || !period.startDate} onClick={() => void mutate({ command: "create", period })}>Créer la feuille Stocks</button>}</section>}
      {run && !current && <p role="alert" className={styles.notice} data-tone="danger">Travail périmé : une source (comptage, théorique, mouvements ou pièces) a été remplacée ou ajoutée après le gel. Les résultats affichés portent sur les versions figées. {canPrepare && <button type="button" disabled={saving} onClick={() => action("revise")}>Créer une révision sur les sources courantes</button>}</p>}
      {run ? <>
        <div role="tablist" aria-label="Sections de la feuille" className={styles.tabs}>{TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} role="tab" id={"st-tab-" + t.id} aria-controls={"st-panel-" + t.id} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onKeyDown={e => onTabKey(e, i)} onClick={() => setTab(t.id)}>{t.label}{counts[t.id] !== null && <span>{counts[t.id]}</span>}</button>)}</div>
        <div className={styles.workspace}>
          <div className={styles.main} role="tabpanel" id={"st-panel-" + tab} aria-labelledby={"st-tab-" + tab}>
            {tab === "population" && <section className={styles.card} aria-labelledby="st-pop-title"><header><h2 id="st-pop-title">Population et sélection</h2></header>
              {run.population ? <><p>{plural(run.selection!.selectedIds.length, "référence / site / lot de stock propre testée", "références / sites / lots de stock propre testés")} sur {run.population.items.length} · {plural(run.selection!.exclusions.length, "exclusion motivée", "exclusions motivées")}.</p>
                <p className={styles.muted}>{run.selection!.criteria}</p>
                <div className={styles.tableScroll} role="region" aria-label="Population — défilement clavier" tabIndex={0}><table><caption>Unité de test : référence / site / lot. Mesure : quantité en unités de comptage (théorique, ou comptée si absente du théorique) — jamais un montant.</caption>
                  <thead><tr><th scope="col">Référence | site | lot</th><th scope="col" style={{ textAlign: "right" }}>Quantité</th><th scope="col">Lignes sources</th><th scope="col">Sélection</th></tr></thead>
                  <tbody>{run.population.items.map(i => { const excl = run.selection!.exclusions.find(e => e.id === i.id); return <tr key={i.id}><td>{i.id.replace(/\|$/, "").split("|").join(" · ")}</td><td className={styles.money}>{formatQuantity(i.amount.amount.replace(".", ""))}</td><td>{i.rowIds.length}</td><td>{excl ? "Exclue — " + excl.reason : "Testée"}</td></tr>; })}</tbody></table></div></>
                : <p className={styles.muted}>Population non figée : approuvez les sources (Pièces) puis figez-les avec la convention citée (Revue).</p>}
            </section>}
            {tab === "tests" && (result ? <>
              <p className={styles.notice} data-tone="info">Résultat {run.result?.outcome === "no_exception_detected" ? "sans écart de quantité sur le périmètre testé" : run.result?.outcome === "exceptions_detected" ? "avec écarts à expliquer" : "non concluant sur une partie du périmètre"} · {kindTotals.filter(([, n]) => n).map(([k, n]) => plural(n, ...({ ok: ["case sans écart", "cases sans écart"], quantity: ["écart de quantité", "écarts de quantité"], ownership: ["écart de propriété", "écarts de propriété"], blocked: ["case bloquée", "cases bloquées"], uncertain: ["case non concluante", "cases non concluantes"], apart: ["case présentée à part", "cases présentées à part"] } as Record<Kind, [string, string]>)[k])).join(" · ")}. Convention : mouvements du jour du comptage {result.convention.sameDay === "before_count" ? "antérieurs" : "postérieurs"} au comptage ({result.convention.instructions.fileName}). {result.valuation ? "Valeurs au coût documenté : écarts potentiels, non validés comme anomalies ; aucune présence physique certifiée, aucune dépréciation proposée ni comptabilisée." : "Aucune valeur monétaire sans coûts documentés ; aucune présence physique certifiée."}</p>
              <StockGrid ref={gridRef} result={result} filters={filters} selected={selected} onFilters={setFilters} onOpen={open}/>
              <CompensationView result={result}/>
              <StockValuationView result={result}/>
              <StockValueReviewView result={result} onOpen={open}/>
              <details className={styles.card}><summary>Méthode et limites</summary><p>{result.method}</p><ul>{result.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
            </> : <section className={styles.card}><h2>Tests</h2><p className={styles.muted}>{run.population ? "Sources figées : exécutez le calcul (Revue)." : "Feuille non exécutée : approuvez puis figez les sources."}</p></section>)}
            {tab === "exceptions" && <section className={styles.card} aria-labelledby="st-exc-title"><header><h2 id="st-exc-title">Exceptions, incertitudes et traitements</h2><span className={styles.muted}>{plural(exceptions.filter(e => !ST_UNCERTAINTY_CODES.includes(e.code)).length, "exception")} · {plural(exceptions.filter(e => ST_UNCERTAINTY_CODES.includes(e.code)).length, "incertitude")}</span></header>
              {!run.notes.length && <p className={styles.muted}>Aucune exception ni note sur cette version.</p>}
              <ul className={styles.list}>{run.notes.map(n => { const r = resolution[n.id] ?? { text: "", citation: "" }, unitId = exceptions.find(e => "st-exception:" + e.id === n.id)?.unitId; return <li key={n.id} id={"st-note-" + n.id} tabIndex={-1}>
                <div className={styles.kv}><strong>{n.text}</strong><span>{n.amount.kind === "known" ? formatCents(n.amount.value.amount.replace(".", ""), { signed: true }) : n.amount.reason}</span><span className={styles.muted}>{n.kind} · {n.authorId}</span>{n.resolution ? <span>Traité</span> : n.blocking ? <span>Bloquant ouvert</span> : null}
                  {unitId && <button type="button" onClick={() => { setTab("tests"); open(unitId); }}>Voir la case</button>}</div>
                {n.resolution && <p className={styles.muted}>Traitement : {n.resolution.text} — {n.resolution.authorId} · {n.resolution.citation ? n.resolution.citation.fileName + " · version " + n.resolution.citation.documentVersionId.slice(7, 19) + (n.resolution.citation.row ? " · ligne " + n.resolution.citation.row : "") : "sans citation"}</p>}
                {!n.resolution && editable && n.blocking && <div className={styles.fields}>
                  <label>Traitement documenté<textarea value={r.text} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, text: e.target.value } }))}/></label>
                  <label>Pièce citée (version figée)<select value={r.citation} disabled={saving} onChange={e => setResolution(x => ({ ...x, [n.id]: { ...r, citation: e.target.value } }))}><option value="">Choisir…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                  <button type="button" disabled={saving || !r.text.trim() || !r.citation} onClick={() => action("resolve", { noteId: n.id, text: r.text, citation: parseCitation(r.citation) })}>Enregistrer le traitement cité</button></div>}
              </li>; })}</ul>
            </section>}
            {tab === "pieces" && <>
              <StockImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>
              <section className={styles.card} aria-labelledby="st-frozen-title"><header><h2 id="st-frozen-title">Sources {run.population ? "figées pour cette version" : "courantes"}</h2></header>
                <ul className={styles.list}>{view.imports.filter(b => frozenSources.includes(b.id)).map(b => <li key={b.id} className={styles.kv}><strong>{b.document.fileName}</strong><span>{b.document.documentType}</span><span className={styles.muted}>version {b.document.id.slice(7, 19)} · SHA-256 {b.document.byteHash.slice(0, 12)}…</span></li>)}</ul></section>
            </>}
            {tab === "revue" && <>
              <StockPreparation key={run.id + ":" + run.version} run={run} view={view} busy={saving} editable={editable} frozenSources={frozenSources} onFreeze={(draft: StockDraft) => action("freeze", { importIds: frozenSources, draft })} onConfigure={(draft: StockDraft) => action("configure", { draft })}/>
              <section className={styles.card} aria-labelledby="st-review-title"><header><h2 id="st-review-title">Exécution, conclusion et revue</h2><span className={styles.muted}>État : {STATE_LABELS[run.state] ?? run.state}{run.approval ? " · approuvée par " + run.approval.actorId : ""}</span></header>
                <div className={styles.actions}>
                  {editable && run.state === "ready" && <button type="button" className={styles.primary} disabled={saving} onClick={() => action("execute")}>Calculer les quantités de clôture</button>}
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
                <p className={styles.muted}>Une revue documentée ne vaut ni opinion sur les comptes ni certification de la présence physique. Une suite verte sur données synthétiques n’autorise aucune mission réelle.</p>
              </section>
            </>}
          </div>
          <StockDetailPanel ref={detailRef} unit={unit} result={result} view={view} sourceIds={frozenSources} dossierId={dossierId} periodId={pid} onReturn={returnFromPanel}/>
        </div>
      </> : <StockImportPanel view={view} period={period} periodId={pid} busy={saving} canPrepare={canPrepare} dossierId={dossierId} onPreview={data => void mutate(data, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>}
      <p className={styles.srOnly} aria-live="polite">{unit ? "Case ouverte : " + unit.reference + " " + unit.site : ""}</p>
    </>}
  </main>;
}

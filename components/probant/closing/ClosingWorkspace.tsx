"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId } from "@/lib/workpapers/model";
import type { RemainingItem } from "@/lib/workpapers/closing-evaluate";
import { ClosingVerdict, IndicatorLedger } from "./ClosingSummary";
import { ClosingProgram, type ProgramFilters } from "./ClosingProgram";
import { ProcedurePanel, type ProcedurePanelHandle } from "./ProcedurePanel";
import { ClosingPieces } from "./ClosingPieces";
import { ClosingFindings } from "./ClosingFindings";
import { ClosingClose, ClosingJournal, ClosingReview } from "./ClosingClose";
import { closingFailureMessage, dateFr, type ClosingTab, type ClosingView } from "./format";
import styles from "../cash/cash.module.css";
import cl from "./closing.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
const SAVE_LABELS: Record<SaveState, string> = { idle: "Aucune modification en attente", saving: "Enregistrement en cours…", saved: "Enregistré — accusé serveur reçu", failed: "Échec de l’enregistrement", conflict: "Conflit : le journal a avancé" };
const TABS: { id: ClosingTab; label: string }[] = [{ id: "programme", label: "Programme" }, { id: "pieces", label: "Pièces" }, { id: "anomalies", label: "Anomalies et limites" }, { id: "revue", label: "Revue" }, { id: "cloture", label: "Clôture" }, { id: "journal", label: "Journal" }];
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };
const emptyFilters: ProgramFilters = { nature: "", status: "", owner: "", q: "" };
export interface ClosingRequested { periodId: string; tab?: ClosingTab; p?: string; filters: ProgramFilters }
const ROLE_LABELS: Record<string, string> = { prepare: "préparation", review: "revue", sign: "signature", download: "téléchargement" };

export function ClosingWorkspace({ initialDossierId = "", requested }: { initialDossierId?: string; requested?: ClosingRequested }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState<AccountingPeriod>(emptyPeriod);
  const [view, setView] = useState<ClosingView | null>(null), [status, setStatus] = useState<SaveState>("idle"), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<ClosingTab>(requested?.tab ?? "programme"), [selected, setSelected] = useState<string | null>(requested?.p ?? null), [filters, setFilters] = useState<ProgramFilters>(requested?.filters ?? emptyFilters);
  const csrf = useRef(""), busy = useRef(false), returnFocus = useRef<HTMLElement | null>(null), panelRef = useRef<ProcedurePanelHandle>(null), focusPanel = useRef(false), tabRefs = useRef<Partial<Record<ClosingTab, HTMLButtonElement | null>>>({});
  const pid = requested?.periodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const endpoint = useCallback((path = "", dossier = dossierId, key = pid) => "/api/workpapers/closing" + path + "?" + new URLSearchParams({ dossierId: dossier, periodId: key }), [dossierId, pid]);
  const e = view?.evaluation, closed = e?.validation.status === "validee" || e?.validation.status === "perimee";
  const canPrepare = !!view?.permissions.includes("prepare") && !closed, canReview = !!view?.permissions.includes("review") && !closed;
  const canSign = !!view?.permissions.includes("sign") && !!view.closingAuthority;
  const procedure = e?.procedures.find(p => p.procedureId === selected) ?? null, saving = status === "saving";
  const download = view?.permissions.includes("download") ? (id: string) => endpoint() + "&operation=download&id=" + encodeURIComponent(id) : undefined;

  // The context (tab, procedure, filters) lives in the URL: coming back to the file restores it.
  useEffect(() => {
    if (!dossierId || !pid || typeof window === "undefined") return;
    const q = new URLSearchParams({ dossierId, periodId: pid, ...(tab !== "programme" ? { tab } : {}), ...(selected ? { p: selected } : {}), ...(filters.nature ? { nature: filters.nature } : {}),
      ...(filters.status ? { status: filters.status } : {}), ...(filters.owner ? { owner: filters.owner } : {}), ...(filters.q ? { q: filters.q } : {}) });
    window.history.replaceState(null, "", "/dossier-cloture?" + q);
  }, [dossierId, pid, tab, selected, filters]);
  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (dossier = dossierId, key = pid) => {
    const response = await fetch(endpoint("", dossier, key), { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(closingFailureMessage(data.error));
    setView(data); if (data.evaluation.period) setPeriod(data.evaluation.period);
    return data as ClosingView;
  }, [dossierId, pid, endpoint]);
  const deepLinkLoaded = useRef(false);
  useEffect(() => {
    if (!initialDossierId || !requested?.periodId || deepLinkLoaded.current) return;
    deepLinkLoaded.current = true;
    let active = true; setLoading(true);
    void (async () => { try { await session(); if (active) await refresh(initialDossierId, requested.periodId); } catch (err) { if (active) setError(err instanceof Error ? err.message : "Chargement impossible"); } finally { if (active) setLoading(false); } })();
    return () => { active = false; };
  }, [initialDossierId, requested, session, refresh]);
  async function load() {
    setLoading(true); setError(""); setStatus("idle");
    try { await session(); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Chargement impossible"); setView(null); } finally { setLoading(false); }
  }
  /** One command against the journal head the browser has read; a newer head surfaces as a conflict, never as a silent merge. */
  async function post(path: string, body: BodyInit, json: boolean) {
    if (busy.current || !view) return false;
    busy.current = true; setStatus("saving"); setError("");
    try {
      await session();
      const response = await fetch(endpoint(path), { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID(), "x-probant-csrf": csrf.current, ...(json ? { "Content-Type": "application/json" } : {}) }, body });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && typeof data.currentSeq === "number") { setStatus("conflict"); setError(closingFailureMessage("CL_STALE_SEQ")); return false; }
        throw new Error(closingFailureMessage(data.error));
      }
      if (!data.view || !data.applied) throw new Error("Accusé serveur incomplet. Rechargez avant de reprendre.");
      setView(data.view); setStatus("saved"); return true;
    } catch (err) { setStatus("failed"); setError(err instanceof Error ? err.message : "Échec de l’enregistrement"); return false; }
    finally { busy.current = false; }
  }
  const send = (body: Record<string, unknown>) => post("", JSON.stringify({ ...body, expectedSeq: view?.seq ?? 0 }), true);
  const upload = (file: File, meta: { label: string; kind: string; pieceId?: string }) => { const form = new FormData(); form.set("file", file); form.set("meta", JSON.stringify({ ...meta, expectedSeq: view?.seq ?? 0 })); return post("/pieces", form, false); };

  useEffect(() => { if (focusPanel.current && procedure) { focusPanel.current = false; panelRef.current?.focus(); } });
  const open = (id: string, origin: HTMLElement | null) => { returnFocus.current = origin; focusPanel.current = true; setSelected(id); };
  const closePanel = () => { setSelected(null); const t = returnFocus.current; if (t && document.contains(t)) t.focus(); };
  const goTab = (t: ClosingTab) => { setTab(t); requestAnimationFrame(() => tabRefs.current[t]?.focus()); };
  const onSegment = (indicator: string, id: string) => {
    if (/^P-\d+$/.test(id)) { open(id, document.activeElement as HTMLElement); return; }
    goTab(/^R-/.test(id) ? "programme" : /^RP-/.test(id) ? "revue" : /^(A|L|C)-/.test(id) ? "anomalies" : /^D-/.test(id) ? "pieces" : indicator === "cycles" ? "cloture" : "programme");
  };
  const onItem = (b: RemainingItem, origin: HTMLElement) => {
    if (b.procedureId) { open(b.procedureId, origin); return; }
    const k = b.ref.kind;
    goTab(k === "point" ? "revue" : ["misstatement", "limitation", "contradiction"].includes(k) ? "anomalies" : k === "request" ? "pieces" : k === "cycle" || k === "file" ? "cloture" : "programme");
  };
  const onTabKey = (ev: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(ev.key)) return;
    ev.preventDefault();
    const next = ev.key === "Home" ? 0 : ev.key === "End" ? TABS.length - 1 : (index + (ev.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    goTab(TABS[next].id);
  };
  const counts: Record<ClosingTab, number | null> = e ? { programme: e.procedures.length, pieces: e.missing.length, anomalies: e.items.misstatements.length + e.items.contradictions.filter(c => !c.resolution || e.items.staleResolutions.includes(c.contradictionId)).length + e.items.limitations.length,
    revue: e.items.reviewPoints.filter(r => !r.closed).length, cloture: e.blockers.length, journal: view!.journal.length } : { programme: null, pieces: null, anomalies: null, revue: null, cloture: null, journal: null };

  return <main className={`${styles.page} ${cl.root}`}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Synthèse</a><a href="/tresorerie">Trésorerie</a><a href="/stocks">Stocks</a><a href="/provisions">Provisions et engagements</a><a href="/fiscal">Fiscalité</a><span aria-current="page">Dossier professionnel et clôture</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable · identité serveur</p><h1>Dossier professionnel — contrôle interne et clôture</h1>
      <p className={styles.muted}>Le programme relie risques, assertions, procédures et pièces. Les travaux manuels se documentent sans moteur, mais rien n’est validé automatiquement : chaque conclusion est humaine, revue par une autre personne, et la clôture appartient au professionnel habilité. PROBANT ne génère aucune opinion.</p></div></header>
    <form className={styles.scope} onSubmit={ev => { ev.preventDefault(); void load(); }}>
      <label>Dossier<input value={dossierId} required disabled={saving || loading} onChange={ev => { setDossierId(ev.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required={!requested?.periodId} disabled={saving || loading || !!requested?.periodId}
        onChange={ev => { setPeriod(p => ({ ...p, [k]: ev.target.value })); setView(null); }}/></label>)}
      <button className={styles.primary} disabled={saving || loading}>{loading ? "Chargement…" : "Charger le dossier"}</button>
    </form>
    <div className={styles.context} aria-label="Contexte du dossier">
      <span>Dossier <strong>{dossierId || "—"}</strong></span><span>Entité <strong>{e?.entity ?? "—"}</strong></span>
      <span>Exercice <strong>{e?.period ? dateFr(e.period.startDate) + " → " + dateFr(e.period.closingDate) : period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—"}</strong></span>
      <span>Identité <strong>{view?.actorId ?? "non connectée"}</strong></span>
      <span>Droits <strong>{view ? view.permissions.filter(p => p !== "read").map(p => ROLE_LABELS[p]).join(", ") || "lecture" : "—"}</strong></span>
      <span>Habilitation de clôture <strong>{view ? (view.closingAuthority ? "présente" : "absente") : "—"}</strong></span>
      <span>Journal <strong>{view ? "#" + view.seq + " · " + view.headHash.slice(0, 8) : "—"}</strong></span>
      <span role="status" aria-live="polite" className={styles.saveState} data-state={status}>{SAVE_LABELS[status]}</span>
    </div>
    {error ? <div className={styles.notice} data-tone="danger" role="alert">{error}{status === "conflict" ? <> <button type="button" onClick={() => { setStatus("idle"); setError(""); void refresh(); }}>Recharger le dossier</button></> : null}</div> : null}
    {!view ? (loading ? <p className={styles.muted} role="status">Chargement du dossier…</p> : <p className={styles.muted}>Chargez un dossier et un exercice pour afficher son programme de travail.</p>)
      : !e!.opened ? <OpenFile canPrepare={!!view.permissions.includes("prepare")} period={period} send={send} busy={saving}/>
      : <>
        <ClosingVerdict view={view}/>
        <IndicatorLedger indicators={e!.indicators} onSegment={onSegment} current={selected}/>
        <div className={styles.tabs} role="tablist" aria-label="Vues du dossier">
          {TABS.map((t, i) => <button key={t.id} ref={el => { tabRefs.current[t.id] = el; }} type="button" role="tab" id={"cl-tab-" + t.id} aria-selected={tab === t.id} aria-controls="cl-tabpanel" tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)} onKeyDown={ev => onTabKey(ev, i)}>{t.label}{counts[t.id] !== null ? <span>{counts[t.id]}</span> : null}</button>)}
        </div>
        <div className={cl.layout} data-panel={procedure ? "open" : "closed"}>
          <div role="tabpanel" id="cl-tabpanel" aria-labelledby={"cl-tab-" + tab} style={{ minWidth: 0 }}>
            {tab === "programme" ? <ClosingProgram view={view} filters={filters} setFilters={setFilters} selected={selected} onOpen={open} canPrepare={canPrepare} send={send} busy={saving}/> : null}
            {tab === "pieces" ? <ClosingPieces view={view} onOpen={open} canPrepare={canPrepare} send={send} upload={upload} busy={saving} download={download}/> : null}
            {tab === "anomalies" ? <ClosingFindings view={view} canPrepare={canPrepare} canReview={canReview} send={send} busy={saving} onOpen={open} download={download}/> : null}
            {tab === "revue" ? <ClosingReview view={view} canPrepare={canPrepare} canReview={canReview} send={send} busy={saving} onOpen={open} download={download}/> : null}
            {tab === "cloture" ? <ClosingClose view={view} canSign={canSign} send={send} busy={saving} onItem={onItem}/> : null}
            {tab === "journal" ? <ClosingJournal view={view} onOpen={open}/> : null}
          </div>
          {procedure ? <ProcedurePanel key={procedure.procedureId} ref={panelRef} view={view} p={procedure} onClose={closePanel} canPrepare={canPrepare} canReview={canReview} send={send} busy={saving} download={download} error={status === "failed" || status === "conflict" ? error : undefined}/> : null}
        </div>
      </>}
  </main>;
}

/** First event of the journal: the entity and the exercise, declared by a preparer. */
function OpenFile({ canPrepare, period, send, busy }: { canPrepare: boolean; period: AccountingPeriod; send: (b: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  if (!canPrepare) return <p className={styles.notice}>Dossier non ouvert pour cet exercice. Seul un préparateur peut l’ouvrir.</p>;
  return <form className={cl.form} onSubmit={async ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget);
    await send({ command: "open", entity: f.get("entity"), period: { startDate: f.get("startDate"), closingDate: f.get("closingDate"), asOfDate: f.get("asOfDate"), currency: "EUR", validation: "provisional" } }); }}>
    <h2>Ouvrir le dossier professionnel</h2>
    <p className={styles.muted}>Premier événement du journal. L’exercice doit correspondre à l’identifiant de période chargé.</p>
    <label>Entité<input name="entity" required maxLength={120}/></label>
    <div className={cl.row}>{(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" name={k} required defaultValue={period[k]}/></label>)}</div>
    <button className={cl.submit} disabled={busy}>Ouvrir le dossier</button>
  </form>;
}

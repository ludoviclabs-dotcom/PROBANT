"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { charteFonts } from "@/app/fonts";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { DossierScopedInput } from "@/components/probant/DossierScopedInput";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { ActionId } from "@/lib/ifrs/leases/view-model";
import type { LeaseResult } from "@/lib/workpapers/lease-review";
import type { LeaseWorkDraft } from "@/lib/workpapers/lease-work";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { executionProfileLabel } from "@/lib/runtime/profile";
import { CompletenessMatrix } from "./CompletenessMatrix";
import { ContractDetail } from "./ContractDetail";
import { dateFr, leaseFailureMessage, SHEET_STATE_LABELS, type LeaseView } from "./format";
import { Inspector, useDocked } from "./Inspector";
import { PolicyEditor } from "./PolicyEditor";
import { ActionBar, ChartFrame, ContextBand, StateNotice, StepRail } from "./Primitives";
import { SourcesPanel } from "./SourcesPanel";
import { useLeaseSelection, type LeaseSelectionState } from "./useLeaseSelection";
import s from "./ifrs.module.css";

type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";
const ACTION_LABELS: Partial<Record<ActionId, string>> = { create: "Créer la feuille de l'exercice", freeze: "Figer la population", execute: "Calculer", revise: "Créer une révision" };
const FRESHNESS = { current: "à jour", source_replaced: "source remplacée — à réexaminer", rule_replaced: "règle remplacée — à réexaminer", no_sheet: "aucune feuille" } as const;
const CRITERIA = "Tous les contrats du registre approuvé de l'exercice ; échéances, hypothèses et ouvertures liées ; lignes sans contrat conservées à part.";
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };

/**
 * Poste « Locations IFRS 16 » (C02) : bandeau de contexte, rail des étapes, matrice de complétude, inspecteur, barre d'action.
 * Toute action et tout état viennent de la lecture serveur (`workspace`, `qualification`, `capability`) ; le navigateur ne calcule rien.
 * Le scénario synthétique (`demo`) est en lecture seule et reste étiqueté « simulation non revue ».
 */
export function LeaseWorkspace({ demo = false, initialDossierId = "", initialPeriod = emptyPeriod, initialPeriodId = "", initialSelection }: { demo?: boolean; initialDossierId?: string; initialPeriod?: AccountingPeriod;
  initialPeriodId?: string; initialSelection: LeaseSelectionState }) {
  const [dossierId, setDossierId] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriod);
  const [view, setView] = useState<LeaseView | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState<SaveState>("idle");
  const [conflict, setConflict] = useState<{ current: WorkpaperRun; expectedVersion: number } | null>(null);
  const { selection, open, close, filter } = useLeaseSelection(initialSelection), docked = useDocked();
  const csrf = useRef(""), busy = useRef(false), trigger = useRef<HTMLElement | null>(null);
  const pid = initialPeriodId || (period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "");
  const run = useMemo(() => view ? [...view.runs].sort((a, b) => b.revision - a.revision)[0] ?? null : null, [view]);
  const workspace = run ? view?.workspace[run.id] ?? null : view?.emptyWorkspace ?? null;
  const qualification = run ? view?.qualification[run.id] ?? null : null;
  const result = run?.result?.execution === "completed" ? run.result.result as LeaseResult : null;
  const canPrepare = !demo && !!view?.permissions.includes("prepare");
  const saving = status === "saving";

  const session = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }), identity = await response.json();
    if (!response.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée. Reconnectez-vous pour reprendre.");
    csrf.current = identity.csrfToken;
  }, []);
  const refresh = useCallback(async (dossier = dossierId, key = pid) => {
    const response = await fetch(demo ? "/api/workpapers/locations-ifrs16/demo" : "/api/workpapers/locations-ifrs16?" + new URLSearchParams({ dossierId: dossier, periodId: key }), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(leaseFailureMessage(data.error, response.status));
    setView(data);
    const latest = [...(data.runs as WorkpaperRun[])].sort((a, b) => b.revision - a.revision)[0];
    if (latest) setPeriod(latest.period);
  }, [demo, dossierId, pid]);
  const loadedOnce = useRef(false), refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    if (loadedOnce.current || (!demo && (!initialDossierId || !initialPeriodId))) return;
    loadedOnce.current = true;
    let active = true; setLoading(true);
    void (async () => { try { if (!demo) await session(); if (active) await refreshRef.current(initialDossierId, initialPeriodId); } catch (e) { if (active) setError(e instanceof Error ? e.message : "Lecture impossible"); } finally { if (active) setLoading(false); } })();
    // A cancelled first pass (React mounts effects twice in development) re-arms the guard, so the next pass loads.
    return () => { active = false; loadedOnce.current = false; };
  }, [demo, initialDossierId, initialPeriodId, session]);
  async function load() {
    setLoading(true); setError(""); setConflict(null); setStatus("idle");
    try { await session(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Lecture impossible"); setView(null); } finally { setLoading(false); }
  }
  async function mutate(body: Record<string, unknown> | FormData, imports = false) {
    if (busy.current || demo) return;
    busy.current = true; setStatus("saving"); setError(""); setConflict(null);
    try {
      await session();
      const response = await fetch("/api/workpapers/locations-ifrs16" + (imports ? "/imports" : "") + "?" + new URLSearchParams({ dossierId, periodId: pid }), { method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID(), "x-probant-csrf": csrf.current, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        // A version conflict is shown with the server version; nothing is replayed or overwritten.
        if (response.status === 409 && data.current) { setConflict(data); setStatus("conflict"); return; }
        throw new Error(leaseFailureMessage(data.error, response.status) + (data.missing ? " Manquant : " + data.missing.join(", ") + "." : ""));
      }
      if (!data.run && !data.batch) throw new Error("Accusé serveur incomplet : rechargez avant de reprendre.");
      await refresh();
      setStatus("saved");
    } catch (e) { setStatus("failed"); setError(e instanceof Error ? e.message : "Échec de la commande"); }
    finally { busy.current = false; }
  }
  const command = (name: string, fields: Record<string, unknown> = {}) => run ? mutate({ command: name, id: run.id, expectedVersion: run.version, ...fields }) : Promise.resolve();
  function onAction(id: ActionId) {
    if (id === "create") void mutate({ command: "create_leases", period, instanceKey: "ifrs16-" + pid });
    else if (id === "freeze") void command("freeze_leases", { importIds: view!.sourceHeads.filter(h => h.document_type.startsWith("lease_")).map(h => h.import_id), criteria: CRITERIA });
    else void command(id);
  }
  const openContract = (contractId: string, column: Parameters<typeof open>[1], el: HTMLElement) => { trigger.current = el; open(contractId, column); };
  const selected = qualification?.contracts.find(c => c.contractId === selection.contractId) ?? null;
  const categories = useMemo(() => [...new Set((qualification?.contracts ?? []).flatMap(c => c.assetCategory ? [c.assetCategory] : []))].sort(), [qualification]);
  const sheetUrl = "/ifrs/locations?" + new URLSearchParams({ dossierId, periodId: pid });

  const band = [
    { label: "Dossier", value: demo ? "SYN-LEASES (synthétique)" : dossierId || "—" },
    { label: "Exercice", value: period.startDate ? dateFr(period.startDate) + " → " + dateFr(period.closingDate) : "—" },
    { label: "Revue au", value: period.asOfDate ? dateFr(period.asOfDate) : "—" },
    { label: "Référentiel", value: "IFRS 16 · IASB 2026" },
    { label: "Mode", value: demo ? "scénario synthétique" : executionProfileLabel(view?.executionProfile ?? undefined) },
    { label: "Feuille", value: run ? `r${run.revision} · v${run.version} · ${SHEET_STATE_LABELS[run.state] ?? run.state}` : "—" },
    { label: "Règle", value: view ? "ifrs16.leases " + view.capability.rule.version + " · " + (view.capability.rule.basisStatus === "validated" ? "validée" : "à revoir") : "—" },
    { label: "Fraîcheur", value: workspace ? FRESHNESS[workspace.freshness] : "—", fresh: workspace?.freshness },
  ];

  return <main data-ambiance="instruments" className={`${charteFonts} ${s.page}`}>
    <nav aria-label="Familles de travaux" className={s.families}>
      <DossierContextAnchor href="/dashboard/synthese">Synthèse du dossier</DossierContextAnchor><DossierContextAnchor href="/emprunts">Emprunts</DossierContextAnchor>
      <DossierContextAnchor href="/dossier-cloture">Dossier de clôture</DossierContextAnchor><span aria-current="page">Référentiels · Locations IFRS 16</span>
      <span>Présentation IFRS 18 — non engagée (décision après la recette IFRS 16)</span>
    </nav>
    <header className={s.header}>
      <p className={s.eyebrow}>{demo ? "Simulation non revue · lecture seule · même moteur" : "Atelier de référentiel · identité serveur"}</p>
      <h1>Locations IFRS 16</h1>
      <p className={s.lede}>Du contrat au droit d'utilisation : chaque location qualifiée sur ses pièces, puis recalculée sur paramètres sourcés. Aucun taux, aucune durée ni aucune exemption n'est supposé ; un vide reste un vide, jamais un zéro. Ce n'est ni une conformité IFRS ni une annexe exhaustive.</p>
    </header>
    {!demo && <form className={s.scope} onSubmit={e => { e.preventDefault(); void load(); }}>
      <label>Dossier<DossierScopedInput value={dossierId} required disabled={saving || loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d'exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required={!initialPeriodId} disabled={saving || loading || !!initialPeriodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
      <button className={s.primary} disabled={saving || loading}>{loading ? "Lecture…" : "Ouvrir la feuille"}</button>
    </form>}
    <ContextBand items={band} simulation={demo ? "Simulation non revue" : null}/>
    {loading && !view && <StateNotice tone="info" title="Lecture de l'état serveur…"/>}
    {error && <StateNotice tone="danger" role="alert" title="Action impossible">{error}{/connect|session/i.test(error) && <> <DossierContextAnchor href={"/api/auth/login?returnTo=" + encodeURIComponent(sheetUrl)}>Se connecter</DossierContextAnchor></>}
      {/fermé sur ce serveur/.test(error) && !demo && <> <DossierContextAnchor href="/ifrs/locations?demo=1">Ouvrir le scénario synthétique</DossierContextAnchor></>}</StateNotice>}
    {conflict && <StateNotice tone="danger" role="alert" title={"Conflit de version : la feuille est en v" + conflict.current.version + " (attendue v" + conflict.expectedVersion + ")"}>
      <p>Aucune donnée n'a été écrasée et la commande n'est pas rejouée.</p><button type="button" onClick={() => { setConflict(null); setStatus("idle"); void refresh(); }}>Recharger la version serveur</button></StateNotice>}
    {!view && !loading && !error && !demo && <StateNotice tone="info" title="Ouvrir une feuille Locations IFRS 16">Choisissez le dossier et l'exercice, ou explorez le <DossierContextAnchor href="/ifrs/locations?demo=1">scénario synthétique</DossierContextAnchor>.</StateNotice>}
    {view && workspace && <div className={s.layout}>
      <StepRail steps={workspace.steps}/>
      <div className={s.work} data-inspector={selected && docked ? "open" : "closed"}>
        <div style={{ minWidth: 0 }}>
          {view.capability.realExecution !== "allowed" && !demo && <StateNotice title="Calcul réel bloqué : règle à revoir">La relecture personnelle nommée de la règle n'est pas consignée (docs/ifrs/REVUE_REGLE_IFRS16.md). Les sources, la qualification et le gel restent possibles ; aucun montant n'est publié pour ce dossier.</StateNotice>}
          {workspace.freshness === "source_replaced" && <StateNotice tone="danger" role="alert" title="Source remplacée — à réexaminer">Une source a été remplacée ou ajoutée après le gel : les résultats affichés portent sur les versions figées, conservées avec leurs preuves. Créez une révision.</StateNotice>}
          {workspace.freshness === "rule_replaced" && <StateNotice tone="danger" role="alert" title="Règle remplacée — à réexaminer">La feuille a été créée sous une autre version de la règle : créez une révision sur le gabarit courant.</StateNotice>}
          {!demo && <ActionBar actions={workspace.actions} labels={ACTION_LABELS} busy={saving} onAction={onAction}/>}
          {!demo && <p role="status" aria-live="polite" className={s.saveState} data-state={status}>{{ idle: "", saving: "Commande en cours…", saved: "Accusé serveur reçu", failed: "Échec de la commande", conflict: "Conflit de version" }[status]}</p>}
          {run && run.result && run.result.execution !== "completed" && <StateNotice title="Calcul bloqué">{run.result.blockedControls.join(" · ")}</StateNotice>}
          {qualification ? <CompletenessMatrix qualification={qualification} filter={selection.filter} selected={selection.contractId} onFilter={filter} onOpen={openContract}/>
            : run ? <StateNotice tone="info" title="Qualification non disponible">{view.qualificationIssues[run.id] ? "Sources illisibles : " + view.qualificationIssues[run.id] : "Enregistrez les politiques pour qualifier les contrats des sources courantes."}</StateNotice> : null}
          {run && !demo && <PolicyEditor key={run.id + ":" + run.version} categories={categories} work={run.leaseWork} editable={workspace.actions.configure.allowed} busy={saving} saveState={status}
            onSave={(draft: LeaseWorkDraft) => void command("configure_leases", { work: draft })}/>}
          <ChartFrame title="Dette et droit d'utilisation par période" scope="Même devise, même population : contrats calculés seulement."
            empty={result ? "Graphiques branchés au poste visuel (lot L16-04) : les chiffres de chaque contrat calculé sont dans l'inspecteur." : demo ? "Aucun résultat calculé." : "Moteur non disponible pour ce dossier tant que la règle n'est pas validée : aucun graphique, aucun total."}/>
          <SourcesPanel view={view} period={period} required={view.capability.requiredTypes} canPrepare={canPrepare && !run?.population} busy={saving} onPreview={d => void mutate(d, true)} onApprove={c => void mutate({ command: "approve_import", ...c }, true)}/>
        </div>
        {selected && <Inspector title={"Contrat " + selected.contractId} kicker="Inspecteur" docked={docked} onClose={close} returnTo={trigger.current}>
          <ContractDetail contract={selected} result={result?.contracts.find(c => c.contractId === selected.contractId) ?? null} focusColumn={selection.column}/>
        </Inspector>}
      </div>
    </div>}
    <p className={s.srOnly} aria-live="polite">{selected ? "Inspecteur ouvert : contrat " + selected.contractId : ""}</p>
  </main>;
}

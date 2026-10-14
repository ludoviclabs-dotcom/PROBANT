"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DossierScopedInput } from "@/components/probant/DossierScopedInput";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId } from "@/lib/workpapers/model";
import type { ParcoursView } from "@/lib/workpapers/capitaux-parcours";
import { dateFr, knownLabel, plural, STATE_LABELS } from "../format";
import { amountNode, JOURNEY_CODES, PARCOURS_FAILURES } from "./format";
import { ParcoursDecisions } from "./ParcoursDecisions";
import { ParcoursDetail, type ParcoursDetailHandle } from "./ParcoursDetail";
import { ParcoursFraming } from "./ParcoursFraming";
import styles from "../../cash/cash.module.css";
import pc from "./parcours.module.css";

export interface ParcoursRequested { dossierId: string; periodId: string; capitauxId?: string; capitauxVersion?: number; equityId?: string; equityVersion?: number; decision?: string }
const emptyPeriod: AccountingPeriod = { startDate: "", closingDate: "", asOfDate: "", currency: "EUR", validation: "provisional" };

/** Single entry of the Capitaux propres cycle: a read view over both sheets; work is done in the original sheet, opened at its exact version. */
export function ParcoursWorkspace({ requested, initialPeriodValue = emptyPeriod }: { requested: ParcoursRequested; initialPeriodValue?: AccountingPeriod }) {
  const [dossierId, setDossierId] = useState(requested.dossierId), [period, setPeriod] = useState(initialPeriodValue);
  const [view, setView] = useState<ParcoursView | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(requested.decision ?? null);
  const detail = useRef<ParcoursDetailHandle>(null), lastRow = useRef<string | null>(null);
  const pid = requested.periodId && dossierId === requested.dossierId ? requested.periodId : period.startDate && period.closingDate && period.asOfDate ? periodId(period) : "";
  const exact = [requested.capitauxVersion, requested.equityVersion].some(v => v !== undefined);
  const load = useCallback(async (dossier: string, periodKey: string) => {
    setLoading(true); setError("");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" }), identity = await session.json();
      if (!session.ok || !identity.authenticated) throw new Error(PARCOURS_FAILURES.SESSION_INVALID);
      const q = new URLSearchParams({ dossierId: dossier, periodId: periodKey });
      if (requested.capitauxId) { q.set("capitauxId", requested.capitauxId); if (requested.capitauxVersion) q.set("capitauxVersion", String(requested.capitauxVersion)); }
      if (requested.equityId) { q.set("equityId", requested.equityId); if (requested.equityVersion) q.set("equityVersion", String(requested.equityVersion)); }
      const response = await fetch("/api/workpapers/capitaux-propres/parcours?" + q, { cache: "no-store" }), data = await response.json();
      if (!response.ok) throw new Error(PARCOURS_FAILURES[data.error] ?? PARCOURS_FAILURES.PARCOURS_UNAVAILABLE);
      setView(data as ParcoursView);
    } catch (e) { setView(null); setError(e instanceof Error ? e.message : PARCOURS_FAILURES.PARCOURS_UNAVAILABLE); }
    finally { setLoading(false); }
  }, [requested]);
  const loaded = useRef(false);
  useEffect(() => { if (loaded.current || !requested.dossierId || !requested.periodId) return; loaded.current = true; void load(requested.dossierId, requested.periodId); }, [requested, load]);
  const decision = view?.decisions.find(d => d.key === selected) ?? null;
  const open = (key: string) => { lastRow.current = key; setSelected(key); requestAnimationFrame(() => detail.current?.focus()); };
  const back = () => { const key = lastRow.current ?? selected; if (key) document.getElementById("pc-row-" + key)?.focus(); };
  const t = view?.totals;
  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><DossierContextAnchor href="/dashboard/synthese">Synthèse du dossier</DossierContextAnchor><DossierContextAnchor href="/dashboard/tests">Atelier · simulation</DossierContextAnchor><DossierContextAnchor href="/tresorerie">Procédures de mission · Trésorerie</DossierContextAnchor><DossierContextAnchor href="/immobilisations">Procédures de mission · Immobilisations</DossierContextAnchor><span aria-current="page">Cycle · Capitaux propres</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Cycle Capitaux propres · parcours unique</p><h1>Capitaux propres — décisions, effets, comptabilisation, paiement</h1>
      <p className={styles.muted}>Une seule entrée pour le cycle : les deux feuilles d’origine sont lues à leur version exacte, une même décision n’est comptée qu’une fois, et chaque ligne ouvre sa feuille pour y travailler. Aucune conclusion juridique.</p></div></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); if (dossierId && pid) void load(dossierId, pid); }}>
      <label>Dossier<DossierScopedInput value={dossierId} required disabled={loading} onChange={e => { setDossierId(e.target.value); setView(null); }} placeholder="Identifiant du dossier"/></label>
      {(["startDate", "closingDate", "asOfDate"] as const).map((k, i) => <label key={k}>{["Début d’exercice", "Clôture", "Date de revue"][i]}<input type="date" value={period[k]} required={!requested.periodId} disabled={loading || !!requested.periodId} onChange={e => { setPeriod(p => ({ ...p, [k]: e.target.value })); setView(null); }}/></label>)}
      <button className={styles.primary} disabled={loading || !dossierId || !pid}>{loading ? "Chargement…" : "Lire le parcours"}</button>
    </form>
    <div className={styles.context} aria-label="Contexte du dossier"><span>Dossier <strong>{dossierId || "—"}</strong></span><span className={pc.wrap}>Période <strong>{pid || "—"}</strong></span>
      <span>Feuilles reprises <strong>{view ? view.journeys.reduce((n, j) => n + j.runs.length, 0) : "—"}</strong></span><span>Lecture <strong>{exact ? "versions exactes demandées" : "versions courantes"}</strong></span></div>
    {loading && !view && <p role="status" className={styles.muted}>Lecture des deux feuilles…</p>}
    {error && <p role="alert" className={styles.notice} data-tone="danger">{error}{/onnect/.test(error) && <> <DossierContextAnchor href={"/api/auth/login?returnTo=" + encodeURIComponent("/capitaux-propres/parcours?" + new URLSearchParams({ dossierId, periodId: pid }))}>Se connecter</DossierContextAnchor></>}</p>}
    {view && <>
      <section className={styles.card} aria-labelledby="pc-journeys-title"><header><h2 id="pc-journeys-title">Feuilles reprises</h2><span className={styles.muted}>Chaque feuille garde ses tables, ses versions, ses revues et ses pièces</span></header>
        <ul className={pc.journeys}>{view.journeys.map(j => <li key={j.procedure}>
          <div className={pc.journeyHead}><strong>{j.label}</strong><span className={pc.role} data-role={j.role}>{j.role === "cible" ? "Parcours cible" : "Parcours historique"}</span><span className={styles.muted}>{j.note}</span></div>
          {j.availability !== "ready" || j.code ? <p className={styles.notice} data-tone={j.availability === "ready" ? "info" : "danger"}>{JOURNEY_CODES[j.code ?? ""] ?? (j.availability === "disabled" ? "Chaîne non ouverte sur ce serveur." : "Lecture indisponible.")}</p> : null}
          {j.runs.length ? <ul className={pc.runs}>{j.runs.map(r => <li key={r.runId + ":" + r.version}><strong className={pc.wrap}>{r.runId}</strong><span>r{r.revision} · v{r.version} · {STATE_LABELS[r.state] ?? r.state}</span><span>règle {r.ruleVersion}{r.ruleCurrent ? "" : " (remplacée : révision requise)"}</span>
            <span>{r.executed ? plural(r.decisions, "décision reprise", "décisions reprises") : "non exécutée — aucune décision reprise"}</span>{!r.sourcesCurrent && <span>sources remplacées</span>}{!r.lineageCurrent && <span>version antérieure</span>}
            <DossierContextAnchor href={r.href}>Ouvrir la feuille (version {r.version})</DossierContextAnchor><DossierContextAnchor href={r.synthesisHref}>Synthèse</DossierContextAnchor></li>)}</ul>
            : j.availability === "ready" && <p className={styles.muted}>Aucune feuille pour cette période{j.role === "cible" ? " : créez-la depuis la feuille /capitaux-propres." : "."} <DossierContextAnchor href={(j.role === "cible" ? "/capitaux-propres?" : "/equity?") + new URLSearchParams({ dossierId: view.scope.dossierId, periodId: view.scope.periodId })}>Ouvrir le parcours</DossierContextAnchor></p>}
        </li>)}</ul>
      </section>
      <div className={styles.workspace}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="pc-decisions-title"><header><h2 id="pc-decisions-title">Décisions du cycle</h2><span className={styles.muted}>{plural(t!.traces, "trace de feuille", "traces de feuilles")} · {plural(t!.counted, "décision comptée", "décisions comptées")}</span></header>
            <dl className={pc.totals}>
              <div><dt>Décisions comptées</dt><dd>{t!.counted}<small>dont {t!.linked} reliée(s) entre feuilles</small></dd></div>
              <div><dt>À rapprocher</dt><dd>{t!.toReconcile}<small>non comptées, jamais additionnées</small></dd></div>
              <div><dt>Distributions et apports votés</dt><dd>{amountNode(t!.settlements.voted, pc.reason)}<small>{plural(t!.settlements.decisions, "décision")}</small></dd></div>
              <div><dt>Payé à la date de revue</dt><dd>{amountNode(t!.settlements.paidAtReview, pc.reason)}<small>reste {knownLabel(t!.settlements.remainingAtReview)} · {plural(t!.settlements.unpaid, "non payée", "non payées")}</small></dd></div>
            </dl>
            {t!.toReconcile > 0 && <p className={styles.notice}>{plural(t!.toReconcile, "décision à rapprocher", "décisions à rapprocher")} : une décision sans PV commun, ou un PV cité par plusieurs décisions, n’est pas comptée tant que la correspondance n’est pas établie.</p>}
            <ParcoursDecisions decisions={view.decisions} selected={selected} onSelect={open}/>
            {t!.exclusions.length > 0 && <p className={styles.muted}>Hors décompte : {t!.exclusions.map(e => `${e.reason} (${e.count})`).join(" ; ")}.</p>}
          </section>
          <section className={styles.card} aria-labelledby="pc-families-title"><header><h2 id="pc-families-title">Effet voté des décisions comptées, par famille</h2><span className={styles.muted}>Une affectation déplace des montants entre familles : son effet global est nul</span></header>
            {t!.effectsByFamily.length ? <div className={styles.tableScroll} role="region" aria-label="Effets par famille — défilement clavier" tabIndex={0}><table><caption>Somme des effets votés signés (sens des capitaux propres) ; transferts déclarés du parcours historique exclus</caption>
              <thead><tr><th scope="col">Famille</th><th scope="col">Décisions</th><th scope="col" className={styles.money}>Effet voté</th></tr></thead>
              <tbody>{t!.effectsByFamily.map(f => <tr key={f.family}><th scope="row">{f.label}</th><td>{f.decisions}</td><td className={styles.money}>{knownLabel(f.voted)}</td></tr>)}</tbody></table></div>
              : <p className={styles.muted}>Aucune décision comptée.</p>}
            {t!.byType.length > 0 && <p className={styles.muted}>Par type : {t!.byType.map(b => `${b.label} ${b.count} (${knownLabel(b.magnitude)})`).join(" ; ")}.</p>}
          </section>
          <ParcoursFraming view={view}/>
          <section className={styles.card} aria-labelledby="pc-transition-title"><h2 id="pc-transition-title">Méthode, transition et limites</h2>
            <details className={pc.method}><summary>Stratégie de transition entre les deux feuilles</summary><ul>{view.transition.map(x => <li key={x}>{x}</li>)}</ul></details>
            <details className={pc.method}><summary>Limites de la vue unique</summary><ul>{view.limitations.map(x => <li key={x}>{x}</li>)}</ul></details>
            <p className={styles.muted}>Période {view.scope.periodId}{decision ? " · décision du " + dateFr(decision.decisionDate) + " sélectionnée" : ""}.</p>
          </section>
        </div>
        <ParcoursDetail ref={detail} decision={decision} onReturn={back}/>
      </div>
    </>}
  </main>;
}

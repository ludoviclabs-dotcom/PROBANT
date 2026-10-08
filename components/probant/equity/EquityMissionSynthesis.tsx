"use client";
import { useCallback, useEffect, useState } from "react";
import { equitySheetHref, type EquityMissionFilter, type EquityMissionSnapshot } from "@/lib/workpapers/equity-mission";
import { EQ_DECISION_TEXT, EQ_UNCERTAINTY_CODES } from "@/lib/workpapers/equity-review";
import { COMPONENT_LABELS, dateFr, equityFailureMessage, eur, knownLabel, STATE_LABELS } from "./format";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

type ExportFormat = "html" | "pdf" | "json" | "manifest" | "exceptions_csv" | "decisions_csv" | "procedures_csv" | "sources_csv";
const CSV = [{ id: "exceptions_csv", label: "Exceptions" }, { id: "decisions_csv", label: "Décisions" }, { id: "procedures_csv", label: "Procédures" }, { id: "sources_csv", label: "Index des sources" }] as const;
const FILTERS: { id: EquityMissionFilter; label: string }[] = [{ id: "all", label: "Tous les travaux" }, { id: "blocked", label: "Blocages" }, { id: "exceptions", label: "Exceptions à expliquer" }, { id: "evidence", label: "Pièces attendues" }, { id: "review", label: "Revues" }, { id: "stale", label: "Travaux périmés" }];
export function EquityMissionSynthesis({ initialDossierId = "", initialPeriodId = "", initialRootId = "", initialRunId = "", initialVersion }: { initialDossierId?: string; initialPeriodId?: string; initialRootId?: string; initialRunId?: string; initialVersion?: number }) {
  const [dossier, setDossier] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodId), [scope, setScope] = useState({ dossierId: initialDossierId, periodId: initialPeriodId });
  const [selection] = useState<{ rootId?: string; id?: string; version?: number }>(initialRunId && initialVersion ? { rootId: initialRootId || undefined, id: initialRunId, version: initialVersion } : initialRootId ? { rootId: initialRootId } : {});
  const [view, setView] = useState<{ actorId: string; permissions: string[]; mission: EquityMissionSnapshot } | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [filter, setFilter] = useState<EquityMissionFilter>("all"), [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    if (!scope.dossierId || !scope.periodId) return;
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ ...scope, operation: "mission", ...(selection.rootId ? { rootId: selection.rootId } : {}), ...(selection.id && selection.version ? { id: selection.id, version: String(selection.version) } : {}) });
      const response = await fetch("/api/workpapers/capitaux-propres?" + q, { cache: "no-store" }), data = await response.json();
      if (!response.ok) throw new Error(equityFailureMessage(data.error));
      setView(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible"); setView(null); } finally { setLoading(false); }
  }, [scope, selection]);
  useEffect(() => { void load(); }, [load]);
  const m = view?.mission, p = m?.procedure, equity = p?.equity;
  const approvedReady = p?.state === "locked" && !p.stale && !!equity;
  async function download(kind: "diagnostic" | "approved", format: ExportFormat) {
    if (!m || exporting) return;
    setExporting(true); setError("");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" }), identity = await session.json();
      if (!session.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée : reconnectez-vous.");
      const response = await fetch("/api/workpapers/capitaux-propres/export", { method: "POST", headers: { "Content-Type": "application/json", "x-probant-csrf": identity.csrfToken },
        body: JSON.stringify({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, ...(m.assignment.rootId ? { rootId: m.assignment.rootId } : {}), ...(p?.runId ? { id: p.runId, version: p.version } : {}), kind, format, expectedSnapshotHash: m.hash }) });
      if (!response.ok) { const e = await response.json(); throw new Error(response.status === 409 ? "L’état serveur a changé depuis l’affichage. Actualisez puis refaites l’export." : e.error === "EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED" ? "Un paquet approuvé exige une version courante, revue par une autre identité et verrouillée." : equityFailureMessage(e.error)); }
      if (response.headers.get("X-Probant-Snapshot") !== m.hash) throw new Error("L’export ne correspond pas à l’état affiché.");
      const url = URL.createObjectURL(await response.blob()), a = document.createElement("a");
      a.href = url; a.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "probant-capitaux-propres-" + kind; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Export impossible"); } finally { setExporting(false); }
  }
  const queue = m?.queue.filter(q => filter === "all" || q.category === filter) ?? [];
  return <main className={styles.page + " " + eq.synthesis}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/dashboard/tests">Atelier synthétique</a><a href="/clients-framing/synthesis">Procédures de mission · Clients</a><a href="/tresorerie/synthese">Procédures de mission · Trésorerie</a><a href="/immobilisations/synthese">Procédures de mission · Immobilisations</a><span aria-current="page">Procédures de mission · Capitaux propres</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable</p><h1>Revue et Synthèse Capitaux propres</h1><p className={styles.muted}>Programme fermé : pont par composante, tableau de variation, décisions ↔ écritures, PV lus. Les compteurs viennent du programme, jamais du nombre d’anomalies. Aucun feu vert juridique.</p></div>
      <a href={m ? equitySheetHref(m.scope, p?.runId && p.version ? { id: p.runId, version: p.version } : null, "all") : "/capitaux-propres"}>Ouvrir la feuille Capitaux propres</a></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); setScope({ dossierId: dossier.trim(), periodId: period.trim() }); }}>
      <label>Dossier<input required value={dossier} onChange={e => setDossier(e.target.value)} placeholder="Identifiant du dossier"/></label>
      <label>Période<input required value={period} onChange={e => setPeriod(e.target.value)} placeholder="Identifiant de période de la feuille"/></label>
      <button className={styles.primary} disabled={loading}>Charger la mission</button><a href={"/api/auth/login?returnTo=" + encodeURIComponent("/capitaux-propres/synthese?" + new URLSearchParams(scope))}>Se connecter</a>
    </form>
    {loading && <p role="status">Lecture de l’état serveur…</p>}{error && <p role="alert" className={styles.notice} data-tone="danger">{error}</p>}
    {m && p && <>
      <div className={styles.context}><span>Dossier <strong>{m.scope.dossierId}</strong></span><span>Organisation <strong>{m.scope.organizationId}</strong></span><span>Identité <strong>{view.actorId}</strong></span>
        <span>Programme <strong>{m.program.id} @ {m.program.version}</strong></span><span><strong>{m.counters.executed}/{m.counters.planned}</strong> procédure exécutée</span><span><strong>{m.counters.testedParts}/{m.counters.plannedParts}</strong> contrôles complets</span>
        <span><strong>{m.counters.reviewed}/{m.counters.planned}</strong> revue courante</span><span><strong>{m.counters.exceptions}</strong> exception(s) · <strong>{m.counters.uncertainties}</strong> incertitude(s)</span><button type="button" onClick={() => void load()} disabled={loading}>Actualiser</button></div>
      <div className={styles.scopeNote}>{m.program.outOfScope.map(o => <span key={o}>Hors programme : {o}</span>)}</div>
      {p.stale && <p role="status" className={styles.notice} data-tone="danger">Travail périmé — {p.staleReasons.join(" ")}</p>}
      <div className={styles.filters} role="group" aria-label="Filtres métier">{FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
      <div className={styles.workspace}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="eq-decision-title"><header><h2 id="eq-decision-title">{p.label}</h2><span className={styles.muted}>{p.runId ? `Feuille ${p.runId} · r${p.revision} · v${p.version} · ${STATE_LABELS[p.state] ?? p.state}` : "À préparer"}</span></header>
            <p><strong>{p.resultLabel}</strong> · {p.reviewLabel} · <strong>{p.legal.conclusion}</strong>{p.review ? " · " + p.review.actorId + " · " + new Date(p.review.at).toLocaleString("fr-FR") : ""}</p><p>{p.conclusion}</p>
            {p.period && <p className={styles.muted}>Période {dateFr(p.period.startDate)} → {dateFr(p.period.closingDate)} · revue {dateFr(p.period.asOfDate)} · population {p.coverage.numerator}/{p.coverage.denominator ?? "inconnu"} {p.coverage.unit}</p>}
            <div className={styles.tableScroll + " " + eq.free} role="region" aria-label="Contrôles du programme — défilement clavier" tabIndex={0}><table><caption>Contrôles du programme — numérateur, dénominateur et exclusions</caption><thead><tr><th scope="col">Contrôle</th><th scope="col">Résultat</th><th scope="col" className={styles.money}>Couverture</th><th scope="col">Exclusions et convention</th></tr></thead>
              <tbody>{p.controls.map(c => <tr key={c.id}><th scope="row">{c.label}</th><td>{c.outcome === "exceptions_detected" ? "Exceptions maintenues" : c.outcome === "inconclusive" ? "Non concluant" : c.outcome === "no_exception_detected" ? "Aucune exception sur le périmètre testé" : "Non exécuté"}</td>
                <td className={eq.coverage}>{c.coverage.numerator}/{c.coverage.denominator ?? "—"}<span className={styles.meaning}>{c.coverage.unit}</span></td><td>{c.coverage.exclusions.length ? c.coverage.exclusions.map(e => e.id + " : " + e.reason).join(" · ") : "Aucune"}<span className={styles.meaning}>{c.convention}</span></td></tr>)}</tbody></table></div>
            {equity && <div className={styles.tableScroll} role="region" aria-label="Pont par composante — défilement clavier" tabIndex={0}><table><caption>Pont par composante — ouverture, mouvements, clôture observée ; une composante incomplète reste inconnue</caption><thead><tr><th scope="col">Composante</th><th scope="col" className={styles.money}>Ouverture</th><th scope="col" className={styles.money}>Mouvements</th><th scope="col" className={styles.money}>Clôture</th><th scope="col" className={styles.money}>Écart</th></tr></thead>
              <tbody>{equity.components.map(c => <tr key={c.component}><th scope="row">{c.label}</th><td className={styles.money}>{eur(c.opening)}</td><td className={styles.money}>{eur(c.movementsTotal, { signed: true })}</td><td className={styles.money}>{eur(c.closing)}</td><td className={styles.money}>{c.status === "excluded" ? "Exclue" : knownLabel(c.difference)}</td></tr>)}
                <tr><th scope="row">Total des capitaux propres ({equity.totals.computedComponents}/{equity.totals.inScopeComponents})</th><td className={styles.money}>{knownLabel(equity.totals.opening)}</td><td className={styles.money}>{eur(equity.totals.movementsTotal, { signed: true })}</td><td className={styles.money}>{knownLabel(equity.totals.closing)}</td><td className={styles.money}>{knownLabel(equity.totals.difference)}<span className={styles.meaning}>transferts internes : effet {eur(equity.totals.transfersEffect, { signed: true })}</span></td></tr></tbody></table></div>}
            {equity?.decisions && <p className={styles.muted}>Décisions : {Object.entries(equity.decisions.reduce((n, d) => ({ ...n, [d.status]: (n[d.status] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, n]) => n + " " + EQ_DECISION_TEXT[k as keyof typeof EQ_DECISION_TEXT].label.toLowerCase()).join(" · ")}.</p>}
            <p className={styles.notice} data-tone="info">{p.legal.meaning}</p>
            <h3>Avant / après revue</h3><div className={styles.sideBySide}><section><strong>Version soumise {p.beforeReview?.version ?? "—"}</strong><p>{p.beforeReview?.conclusion || "Aucune soumission conservée."}</p></section><section><strong>Après revue · version {p.afterReview?.version ?? "—"}</strong><p>{p.review?.note ?? "Aucune décision de revue."}</p></section></div>
            <details><summary>Historique des versions et décisions</summary><ul className={styles.list}>{m.versionIndex.map(v => <li key={v.id + ":" + v.version}>r{v.revision} v{v.version} · {v.state} · {v.actorId}{v.approval ? " · " + v.approval.actorId + " : " + v.approval.note : ""}<code>{v.contentHash}</code></li>)}</ul></details>
          </section>
          {equity && <section className={styles.card} aria-labelledby="eq-synth-exceptions"><h2 id="eq-synth-exceptions">Exceptions et incertitudes conservées après revue</h2><ul className={styles.list}>{equity.exceptions.filter(e => filter === "all" || (filter === "exceptions" && !EQ_UNCERTAINTY_CODES.includes(e.code)) || (filter === "evidence" && EQ_UNCERTAINTY_CODES.includes(e.code))).map(e => { const q = m.queue.find(x => x.id === e.id);
            return <li key={e.id}><div className={styles.kv}><strong>{e.label}</strong><span>{e.component ? COMPONENT_LABELS[e.component] : "Toutes composantes"} · {e.targetId}</span><span className={styles.money}>{knownLabel(e.amount)}</span></div><p>{e.message}</p>
            {q && p.version && <a href={q.href}>Ouvrir la feuille sur cet élément (v{p.version})</a>}</li>; })}
            {!equity.exceptions.length && <li>Aucune exception : cela ne vaut ni conformité ni conclusion juridique.</li>}</ul></section>}
        </div>
        <aside className={styles.detail} aria-label="File de travail et pièces">
          <h2>File de travail</h2><p className={styles.muted}>Priorité aux travaux périmés et aux blocages.</p>
          {queue.length ? <ol className={styles.list}>{queue.map(q => <li key={q.id}><a href={q.href}>{q.label}</a><p className={styles.muted}>{q.detail}</p></li>)}</ol> : <p>Aucune action dans ce filtre.</p>}
          <h2>Index des pièces</h2><ul className={styles.list}>{m.sources.map(s => <li key={s.id}><strong>{s.label}</strong><p className={styles.muted}>{s.fileName ?? (s.required ? "Pièce requise absente" : "Pièce conditionnelle absente")} · {s.available ? (s.current ? "courante" : "périmée") : "absente"} · binaire absent du paquet</p>{s.available && view.permissions.includes("download") && <a href={"/api/workpapers/capitaux-propres?" + new URLSearchParams({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, operation: "download", id: s.id })}>Télécharger l’original</a>}</li>)}</ul>
        </aside>
      </div>
      <section className={styles.card} aria-labelledby="eq-export-title"><h2 id="eq-export-title">Export de cet état serveur</h2><p className={styles.muted}>Résumé, programme, population, cartographie, tableau de variation, transferts, décisions / comptabilisation / paiement, lectures de PV, décisions humaines citées et index des pièces. Originaux (PV compris) téléchargeables séparément.</p>
        {view.permissions.includes("download") ? <>
          <div className={styles.actions}><strong>Diagnostic</strong>{(["html", "pdf", "json", "manifest"] as const).map(f => <button key={f} type="button" disabled={exporting} onClick={() => void download("diagnostic", f)}>{f === "html" ? "HTML imprimable" : f.toUpperCase()}</button>)}
            <select aria-label="Télécharger un CSV diagnostic" value="" disabled={exporting} onChange={e => void download("diagnostic", e.target.value as ExportFormat)}><option value="" disabled>CSV…</option>{CSV.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
          <div className={styles.actions}><strong>Paquet approuvé</strong>{(["html", "pdf", "json", "manifest"] as const).map(f => <button key={f} type="button" disabled={exporting || !approvedReady} onClick={() => void download("approved", f)}>{f === "html" ? "HTML imprimable" : f.toUpperCase()}</button>)}</div>
          <p>{exporting ? "Génération et contrôle serveur…" : approvedReady ? "Version courante, revue par une autre identité et verrouillée. Aucune opinion sur les comptes ni conclusion juridique." : "Paquet approuvé disponible après revue distincte et verrouillage de la version courante."}</p></> : <p>Votre identité ne dispose pas de la permission d’export.</p>}
        <details><summary>Limites et identité de l’état</summary><ul>{m.limitations.map(l => <li key={l}>{l}</li>)}</ul><code>{m.hash}</code></details>
      </section>
    </>}
  </main>;
}

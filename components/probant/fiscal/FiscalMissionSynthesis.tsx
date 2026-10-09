"use client";
import { useCallback, useEffect, useState } from "react";
import { fiscalSheetHref, type FiscalMissionFilter } from "@/lib/workpapers/fiscal-labels";
import type { FiscalMissionSnapshot } from "@/lib/workpapers/fiscal-mission";
import { Chip } from "./FiscalTests";
import { cents, CATEGORY_LABELS, COVERAGE_LABELS, dateFr, fiscalFailureMessage, STATE_LABELS, TIER_LABELS } from "./format";
import styles from "../cash/cash.module.css";
import fx from "./fiscal.module.css";

type ExportFormat = "html" | "pdf" | "json" | "manifest" | "exceptions_csv" | "decisions_csv" | "procedures_csv" | "sources_csv";
const CSV = [{ id: "exceptions_csv", label: "Exceptions" }, { id: "decisions_csv", label: "Décisions" }, { id: "procedures_csv", label: "Procédures" }, { id: "sources_csv", label: "Index des sources" }] as const;
const FILTERS: { id: FiscalMissionFilter; label: string }[] = [{ id: "all", label: "Tous les travaux" }, { id: "blocked", label: "Blocages et règles" }, { id: "exceptions", label: "Exceptions à expliquer" }, { id: "evidence", label: "Pièces attendues" }, { id: "review", label: "Revues" }, { id: "stale", label: "Travaux périmés" }];
const UNCERTAINTY = ["ENGINE_BLOCKED", "LEDGER_ONLY", "PROFILE_UNCONFIRMED", "SOURCE_NOT_COVERED", "MISSING_INFORMATION"];
/** Synthèse of the fiscal sheets: one line per tax and period, the selected period in detail, no fiscal or legal green light. */
export function FiscalMissionSynthesis({ initialDossierId = "", initialPeriodId = "", initialRootId = "", initialRunId = "", initialVersion }: { initialDossierId?: string; initialPeriodId?: string; initialRootId?: string; initialRunId?: string; initialVersion?: number }) {
  const [dossier, setDossier] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodId), [scope, setScope] = useState({ dossierId: initialDossierId, periodId: initialPeriodId });
  const [selection, setSelection] = useState<{ rootId?: string; id?: string; version?: number }>(initialRunId && initialVersion ? { rootId: initialRootId || undefined, id: initialRunId, version: initialVersion } : initialRootId ? { rootId: initialRootId } : {});
  const [view, setView] = useState<{ actorId: string; permissions: string[]; mission: FiscalMissionSnapshot } | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [filter, setFilter] = useState<FiscalMissionFilter>("all"), [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    if (!scope.dossierId || !scope.periodId) return;
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ ...scope, operation: "mission", ...(selection.rootId ? { rootId: selection.rootId } : {}), ...(selection.id && selection.version ? { id: selection.id, version: String(selection.version) } : {}) });
      const response = await fetch("/api/workpapers/fiscal?" + q, { cache: "no-store" }), data = await response.json();
      if (!response.ok) throw new Error(fiscalFailureMessage(data.error));
      setView(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible"); setView(null); } finally { setLoading(false); }
  }, [scope, selection]);
  useEffect(() => { void load(); }, [load]);
  const m = view?.mission, p = m?.procedure, vat = p?.vat;
  const approvedReady = p?.state === "locked" && !p.stale && !!vat;
  async function download(kind: "diagnostic" | "approved", format: ExportFormat) {
    if (!m || exporting) return;
    setExporting(true); setError("");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" }), identity = await session.json();
      if (!session.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée : reconnectez-vous.");
      const response = await fetch("/api/workpapers/fiscal/export", { method: "POST", headers: { "Content-Type": "application/json", "x-probant-csrf": identity.csrfToken },
        body: JSON.stringify({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, ...(m.assignment.rootId ? { rootId: m.assignment.rootId } : {}), ...(p?.runId ? { id: p.runId, version: p.version } : {}), kind, format, expectedSnapshotHash: m.hash }) });
      if (!response.ok) { const e = await response.json(); throw new Error(response.status === 409 ? "L’état serveur a changé depuis l’affichage. Actualisez puis refaites l’export." : e.error === "EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED" ? "Un paquet approuvé exige une version courante, revue par une autre identité et verrouillée." : fiscalFailureMessage(e.error)); }
      if (response.headers.get("X-Probant-Snapshot") !== m.hash) throw new Error("L’export ne correspond pas à l’état affiché.");
      const url = URL.createObjectURL(await response.blob()), a = document.createElement("a");
      a.href = url; a.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "probant-fiscal-" + kind; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Export impossible"); } finally { setExporting(false); }
  }
  const queue = m?.queue.filter(q => filter === "all" || q.category === filter) ?? [];
  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><a href="/dashboard/synthese">Constats historiques DEMO SA</a><a href="/dashboard/fiscalite">Cockpit fiscal (démonstration)</a><a href="/tresorerie/synthese">Procédures de mission · Trésorerie</a><a href="/capitaux-propres/synthese">Procédures de mission · Capitaux propres</a><span aria-current="page">Procédures de mission · Fiscalité (TVA, IS)</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · recette jetable</p><h1>Revue et Synthèse fiscale</h1><p className={styles.muted}>Une ligne par impôt et par période déclarative. Les compteurs viennent du programme, jamais du nombre d’anomalies. Aucune liquidation, aucune conformité déclarée ; les autres impôts restent des capacités séparées.</p></div>
      <a href={m ? fiscalSheetHref(m.scope, p?.runId && p.version ? { id: p.runId, version: p.version } : null, "all", p?.period ? { tax: "vat", period: p.period } : {}) : "/fiscal"}>Ouvrir la feuille fiscale</a></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); setSelection({}); setScope({ dossierId: dossier.trim(), periodId: period.trim() }); }}>
      <label>Dossier<input required value={dossier} onChange={e => setDossier(e.target.value)} placeholder="Identifiant du dossier"/></label>
      <label>Exercice<input required value={period} onChange={e => setPeriod(e.target.value)} placeholder="Identifiant de période de l’exercice"/></label>
      <button className={styles.primary} disabled={loading}>Charger la mission</button><a href={"/api/auth/login?returnTo=" + encodeURIComponent("/fiscal/synthese?" + new URLSearchParams(scope))}>Se connecter</a>
    </form>
    {loading && <p role="status">Lecture de l’état serveur…</p>}{error && <p role="alert" className={styles.notice} data-tone="danger">{error}</p>}
    {m && p && <>
      <div className={styles.context}><span>Dossier <strong>{m.scope.dossierId}</strong></span><span>Organisation <strong>{m.scope.organizationId}</strong></span><span>Identité <strong>{view.actorId}</strong></span>
        <span>Programme <strong>{m.program.id} @ {m.program.version}</strong></span><span><strong>{m.counters.executed}/{m.counters.planned}</strong> période(s) exécutée(s)</span><span><strong>{m.counters.reviewed}/{m.counters.planned}</strong> revue(s) courante(s)</span>
        <span><strong>{m.counters.stale}</strong> périmée(s)</span><button type="button" onClick={() => void load()} disabled={loading}>Actualiser</button></div>
      <div className={styles.scopeNote}>{m.program.outOfScope.map(o => <span key={o}>Hors programme : {o}</span>)}</div>
      <section className={styles.card} aria-labelledby="fx-synth-periods"><header><h2 id="fx-synth-periods">Impôts et périodes</h2><span className={styles.muted}>IS : sous-lot suivant de la mission</span></header>
        {m.periods.length ? <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Périodes — défilement clavier" tabIndex={0}><table><caption>Une ligne par période déclarative TVA : état, résultat, revue et péremption</caption><thead><tr><th scope="col">Période</th><th scope="col">État</th><th scope="col">Résultat</th><th scope="col">Preuve / couverture</th><th scope="col">Exceptions · incertitudes · règles bloquées</th><th scope="col">Revue</th></tr></thead>
          <tbody>{m.periods.map(x => <tr key={x.rootId} className={x.rootId === m.assignment.rootId ? fx.selectedRow : undefined}>
            <th scope="row"><button type="button" className={fx.linkButton} aria-current={x.rootId === m.assignment.rootId} onClick={() => setSelection({ rootId: x.rootId })}>{x.label}</button><br/><span className={styles.muted}>{dateFr(x.period.startDate)} → {dateFr(x.period.endDate)}</span></th>
            <td>{STATE_LABELS[x.state] ?? x.state}{x.stale && <><br/><span className={fx.chip} data-tone="danger">Périmée</span></>}</td><td>{x.resultLabel}</td>
            <td>{x.engine ? TIER_LABELS[x.engine.tier] + " · " + (COVERAGE_LABELS[x.engine.coverage ?? ""] ?? "—") : "Non exécutée"}</td><td>{x.exceptions} · {x.uncertainties} · {x.blockedRules}</td><td>{x.reviewLabel}</td></tr>)}</tbody></table></div>
          : <p className={styles.muted}>Aucune feuille TVA : créez une période dans la feuille fiscale.</p>}
      </section>
      {p.stale && <p role="status" className={styles.notice} data-tone="danger">Travail périmé — {p.staleReasons.join(" ")}</p>}
      <div className={styles.filters} role="group" aria-label="Filtres métier">{FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
      <div className={styles.workspace}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="fx-synth-detail"><header><h2 id="fx-synth-detail">{p.periodLabel ?? p.label}</h2><span className={styles.muted}>{p.runId ? `Feuille r${p.revision} · v${p.version} · ${STATE_LABELS[p.state] ?? p.state}` : "À préparer"}</span></header>
            <p><strong>{p.resultLabel}</strong> · {p.reviewLabel} · <strong>{p.legal.conclusion}</strong>{p.review ? " · " + p.review.actorId + " · " + new Date(p.review.at).toLocaleString("fr-FR") : ""}</p><p>{p.conclusion}</p>
            <p className={styles.muted}>Population {p.coverage.numerator}/{p.coverage.denominator ?? "inconnu"} {p.coverage.unit}</p>
            <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Contrôles du programme — défilement clavier" tabIndex={0}><table><caption>Contrôles du programme — numérateur, dénominateur et convention</caption><thead><tr><th scope="col">Contrôle</th><th scope="col">Résultat</th><th scope="col">Couverture</th><th scope="col">Convention</th></tr></thead>
              <tbody>{p.controls.map(c => <tr key={c.id}><th scope="row">{c.label}</th><td><Chip outcome={c.outcome} label={c.outcome === "exceptions_detected" ? "Exceptions maintenues" : c.outcome === "inconclusive" ? "Non concluant" : c.outcome === "no_exception_detected" ? "Aucun écart sur le périmètre testé" : "Non exécuté"}/></td>
                <td>{c.coverage.numerator}/{c.coverage.denominator ?? "—"}<span className={styles.meaning}>{c.coverage.unit}</span></td><td><span className={styles.meaning}>{c.convention}</span></td></tr>)}</tbody></table></div>
            {vat && <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Comparaison — défilement clavier" tabIndex={0}><table><caption>Comptabilisé, déclaré, écart (euros)</caption><thead><tr><th scope="col">Ligne</th><th scope="col">Comptabilisé</th><th scope="col">Déclaré</th><th scope="col">Écart</th></tr></thead>
              <tbody>{vat.comparison.map(c => <tr key={c.key}><th scope="row">{c.label}</th><td className={styles.money}>{cents(c.accountedCents)}</td><td className={styles.money}>{cents(c.declaredCents)}</td><td className={styles.money}>{cents(c.differenceCents, { signed: true })}</td></tr>)}
                <tr><th scope="row">Résidu du pont (après explications citées)</th><td colSpan={2}>{vat.bridge.reason ?? vat.bridge.items.length + " explication(s) citée(s)"}</td><td className={styles.money}>{cents(vat.bridge.residualCents, { signed: true })}</td></tr></tbody></table></div>}
            {vat && vat.blockedRules.length > 0 && <><h3>Règles bloquées</h3><ul className={fx.rules}>{vat.blockedRules.map(r => <li key={r.code} data-category={r.category}><h3>{r.label} <span className={fx.chip} data-tone="warn">{CATEGORY_LABELS[r.category]}</span></h3><p>{r.requiredSource}</p></li>)}</ul></>}
            <p className={styles.notice} data-tone="info">{p.legal.meaning}</p>
            <h3>Avant / après revue</h3><div className={styles.sideBySide}><section><strong>Version soumise {p.beforeReview?.version ?? "—"}</strong><p>{p.beforeReview?.conclusion || "Aucune soumission conservée."}</p></section><section><strong>Après revue · version {p.afterReview?.version ?? "—"}</strong><p>{p.review?.note ?? "Aucune décision de revue."}</p></section></div>
            <details><summary>Historique des versions, profil et explications</summary><ul className={styles.list}>{m.versionIndex.map(v => <li key={v.id + ":" + v.version}>r{v.revision} v{v.version} · {v.state} · {v.actorId}{v.profile ? " · profil " + v.profile.vatRegime + " (" + v.profile.status + ")" : ""}{v.approval ? " · " + v.approval.actorId + " : " + v.approval.note : ""}<code>{v.contentHash}</code></li>)}</ul></details>
          </section>
          {vat && <section className={styles.card} aria-labelledby="fx-synth-exceptions"><h2 id="fx-synth-exceptions">Exceptions et incertitudes conservées après revue</h2><ul className={styles.list}>{vat.exceptions.filter(e => filter === "all" || (filter === "exceptions" && !UNCERTAINTY.includes(e.code)) || (filter === "evidence" && UNCERTAINTY.includes(e.code)) || filter === "blocked").map(e => { const q = m.queue.find(x => x.id === e.id);
            return <li key={e.id}><div className={styles.kv}><strong>{e.label}</strong><span className={styles.money}>{e.amount.kind === "known" ? cents(e.amount.value.amount.replace(".", ""), { signed: true }) : e.amount.reason}</span></div><p>{e.message}</p>
            {q && p.version && <a href={q.href}>Ouvrir la feuille sur cet élément (v{p.version})</a>}</li>; })}
            {!vat.exceptions.length && <li>Aucune exception : cela ne vaut ni conformité fiscale ni liquidation.</li>}</ul></section>}
        </div>
        <aside className={styles.detail} aria-label="File de travail et pièces">
          <h2>File de travail</h2><p className={styles.muted}>Priorité aux travaux périmés et aux règles bloquées.</p>
          {queue.length ? <ol className={styles.list}>{queue.map(q => <li key={q.id}><a href={q.href}>{q.label}</a><p className={styles.muted}>{q.detail}</p></li>)}</ol> : <p>Aucune action dans ce filtre.</p>}
          <h2>Index des pièces</h2><ul className={styles.list}>{m.sources.map(s => <li key={s.id}><strong>{s.label}</strong><p className={styles.muted}>{s.fileName ?? (s.required ? "Pièce requise absente" : "Pièce conditionnelle absente")} · {s.available ? (s.current ? "courante" : "remplacée") : "absente"} · binaire absent du paquet</p>{s.available && view.permissions.includes("download") && <a href={"/api/workpapers/fiscal?" + new URLSearchParams({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, operation: "download", id: s.id })}>Télécharger l’original</a>}</li>)}</ul>
          {m.replaced.length > 0 && <><h2>Versions remplacées</h2><ul className={styles.list}>{m.replaced.map(r => <li key={r.importId}>{r.key.replace("fx_vat_return:", "Déclaration ").replace(/:/g, " → ")} · {r.fileName}<p className={styles.muted}>SHA-256 {r.sha256.slice(0, 12)}… · {r.usedByRun ? "utilisée par la version affichée — travail périmé" : "non utilisée par la version affichée"}</p></li>)}</ul></>}
          <p className={fx.otherTaxes}>Autres impôts, capacités séparées non couvertes : {m.otherTaxes.map(t => t.title).join(" · ")}.</p>
        </aside>
      </div>
      <section className={styles.card} aria-labelledby="fx-export-title"><h2 id="fx-export-title">Export de cet état serveur</h2><p className={styles.muted}>Résumé, périodes, programme, population, comparaison, pont, paiements, crédit reporté, taux constatés, contrôles, règles bloquées, décisions humaines citées et index des pièces. Originaux téléchargeables séparément.</p>
        {view.permissions.includes("download") ? <>
          <div className={styles.actions}><strong>Diagnostic</strong>{(["html", "pdf", "json", "manifest"] as const).map(f => <button key={f} type="button" disabled={exporting} onClick={() => void download("diagnostic", f)}>{f === "html" ? "HTML imprimable" : f.toUpperCase()}</button>)}
            <select aria-label="Télécharger un CSV diagnostic" value="" disabled={exporting} onChange={e => void download("diagnostic", e.target.value as ExportFormat)}><option value="" disabled>CSV…</option>{CSV.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
          <div className={styles.actions}><strong>Paquet approuvé</strong>{(["html", "pdf", "json", "manifest"] as const).map(f => <button key={f} type="button" disabled={exporting || !approvedReady} onClick={() => void download("approved", f)}>{f === "html" ? "HTML imprimable" : f.toUpperCase()}</button>)}</div>
          <p>{exporting ? "Génération et contrôle serveur…" : approvedReady ? "Version courante, revue par une autre identité et verrouillée. Aucune liquidation, conformité ni opinion." : "Paquet approuvé disponible après revue distincte et verrouillage de la version courante."}</p></> : <p>Votre identité ne dispose pas de la permission d’export.</p>}
        <details><summary>Limites et identité de l’état</summary><ul>{m.limitations.map(l => <li key={l}>{l}</li>)}</ul><code>{m.hash}</code></details>
      </section>
    </>}
  </main>;
}

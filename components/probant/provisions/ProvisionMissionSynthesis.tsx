"use client";
import { DossierScopedInput } from "@/components/probant/DossierScopedInput";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { useCallback, useEffect, useState } from "react";
import { formatCents, PV_MASKED, PV_STATE_LABELS, PV_TREATMENT_LABELS, PV_TYPE_LABELS, PV_UNCERTAINTY_CODES } from "@/lib/workpapers/provision-contract";
import { provisionAmountLabel, provisionSheetHref, provisionSynthesisHref, type ProvisionControlOutcome, type ProvisionMissionFilter, type ProvisionMissionSnapshot } from "@/lib/workpapers/provision-mission";
import { executionProfileLabel, type ExecutionProfile } from "@/lib/runtime/profile";
import { dateFr, provisionFailureMessage, STATE_LABELS } from "./format";
import { KindBadge } from "./ProvisionRegister";
import styles from "../cash/cash.module.css";
import pv from "./provisions.module.css";

type ExportFormat = "html" | "pdf" | "json" | "manifest" | "exceptions_csv" | "decisions_csv" | "procedures_csv" | "sources_csv";
type MissionView = { actorId: string; permissions: string[]; executionProfile?: ExecutionProfile; confidentialAccess: boolean; mission: ProvisionMissionSnapshot };
const CSV = [{ id: "exceptions_csv", label: "Différences et incertitudes" }, { id: "decisions_csv", label: "Décisions" }, { id: "procedures_csv", label: "Contrôles" }, { id: "sources_csv", label: "Index des sources" }] as const;
const FILTERS: { id: ProvisionMissionFilter; label: string }[] = [{ id: "all", label: "Tous les travaux" }, { id: "blocked", label: "Blocages" }, { id: "exceptions", label: "Différences à examiner" }, { id: "evidence", label: "Pièces et incertitudes" }, { id: "review", label: "Revues" }, { id: "stale", label: "Travaux périmés" }];
const OUTCOMES: Record<ProvisionControlOutcome, string> = { no_exception_detected: "Aucune différence sur le périmètre testé", exceptions_detected: "Différences maintenues", inconclusive: "Non concluant", not_applicable: "Non applicable" };
const ANNEX: Record<string, string> = { not_provided: "Annexe non fournie", not_expected: "Non attendue", missing: "Absent de l’annexe", present: "Présent en annexe" };
const EXPORT_MESSAGES: Record<string, string> = { EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED: "Un paquet approuvé exige la version courante, revue par une autre identité, verrouillée et non périmée.", PV_EXPORT_LIMIT: "Export trop volumineux pour ce poste.", WORKPAPER_VERSION_NOT_FOUND: "La version demandée n’existe pas pour cette feuille.", WORKPAPER_NOT_FOUND: "Feuille ou dossier introuvable pour cette période." };
const message = (code: string) => EXPORT_MESSAGES[code] ?? provisionFailureMessage(code);

/** Mission synthesis of the provisions register: every value comes from the server restitution, at the exact version shown. */
export function ProvisionMissionSynthesis({ initialDossierId = "", initialPeriodId = "", initialRootId = "", initialRunId = "", initialVersion }: { initialDossierId?: string; initialPeriodId?: string; initialRootId?: string; initialRunId?: string; initialVersion?: number }) {
  const [dossier, setDossier] = useState(initialDossierId), [period, setPeriod] = useState(initialPeriodId), [scope, setScope] = useState({ dossierId: initialDossierId, periodId: initialPeriodId });
  const [selection] = useState<{ rootId?: string; id?: string; version?: number }>(initialRunId && initialVersion ? { rootId: initialRootId || undefined, id: initialRunId, version: initialVersion } : initialRootId ? { rootId: initialRootId } : {});
  const [view, setView] = useState<MissionView | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [filter, setFilter] = useState<ProvisionMissionFilter>("all"), [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    if (!scope.dossierId || !scope.periodId) return;
    setLoading(true); setError("");
    try {
      const q = new URLSearchParams({ ...scope, operation: "mission", ...(selection.rootId ? { rootId: selection.rootId } : {}), ...(selection.id && selection.version ? { id: selection.id, version: String(selection.version) } : {}) });
      const response = await fetch("/api/workpapers/provisions?" + q, { cache: "no-store" }), data = await response.json();
      if (!response.ok) throw new Error(message(data.error));
      setView(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible"); setView(null); } finally { setLoading(false); }
  }, [scope, selection]);
  useEffect(() => { void load(); }, [load]);
  const m = view?.mission, p = m?.procedure, r = p?.provisions;
  const shownRun = p?.runId && p.version ? { id: p.runId, version: p.version } : null;
  const approvedReady = p?.state === "locked" && !p.stale && !!r;
  const newer = !!m && !!p?.runId && !!m.assignment.currentRunId && (m.assignment.currentRunId !== p.runId || m.assignment.currentVersion !== p.version);
  async function download(kind: "diagnostic" | "approved", format: ExportFormat) {
    if (!m || exporting) return;
    setExporting(true); setError("");
    try {
      const session = await fetch("/api/auth/session", { cache: "no-store" }), identity = await session.json();
      if (!session.ok || !identity.authenticated || !identity.csrfToken) throw new Error("Session requise ou expirée : reconnectez-vous.");
      const response = await fetch("/api/workpapers/provisions/export", { method: "POST", headers: { "Content-Type": "application/json", "x-probant-csrf": identity.csrfToken },
        body: JSON.stringify({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, ...(m.assignment.rootId ? { rootId: m.assignment.rootId } : {}), ...(p?.runId ? { id: p.runId, version: p.version } : {}), kind, format, expectedSnapshotHash: m.hash }) });
      if (!response.ok) { const e = await response.json(); throw new Error(response.status === 409 ? "L’état serveur ou votre habilitation a changé depuis l’affichage. Actualisez puis refaites l’export." : message(e.error)); }
      if (response.headers.get("X-Probant-Snapshot") !== m.hash) throw new Error("L’export ne correspond pas à l’état affiché.");
      const url = URL.createObjectURL(await response.blob()), a = document.createElement("a");
      a.href = url; a.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "probant-provisions-" + kind; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Export impossible"); } finally { setExporting(false); }
  }
  const queue = m?.queue.filter(q => filter === "all" || q.category === filter) ?? [];
  const exceptions = r?.exceptions.filter(e => filter === "all" || (filter === "exceptions" && !PV_UNCERTAINTY_CODES.includes(e.code)) || (filter === "evidence" && PV_UNCERTAINTY_CODES.includes(e.code))) ?? [];
  return <main className={styles.page}>
    <nav aria-label="Familles de travaux" className={styles.families}><DossierContextAnchor href="/dashboard/synthese">Synthèse du dossier</DossierContextAnchor><DossierContextAnchor href="/dashboard/tests">Atelier · simulation</DossierContextAnchor><DossierContextAnchor href="/tresorerie/synthese">Procédures de mission · Trésorerie</DossierContextAnchor><span aria-current="page">Procédures de mission · Provisions et engagements</span></nav>
    <header className={styles.header}><div><p className={styles.eyebrow}>Mission · {executionProfileLabel(view?.executionProfile)}</p><h1>Revue et synthèse Provisions et engagements</h1><p className={styles.muted}>Programme fermé de six contrôles : pont par événement, estimation / écriture, annexe, cadrage par compte, pièces et informations des avocats. Les compteurs viennent du programme, jamais du nombre de différences.</p></div>
      <DossierContextAnchor href={m ? provisionSheetHref(m.scope, shownRun) : "/provisions"}>Ouvrir la feuille Provisions{p?.version ? " (v" + p.version + ")" : ""}</DossierContextAnchor></header>
    <form className={styles.scope} onSubmit={e => { e.preventDefault(); setScope({ dossierId: dossier.trim(), periodId: period.trim() }); }}>
      <label>Dossier<DossierScopedInput required value={dossier} onChange={e => setDossier(e.target.value)} placeholder="Identifiant du dossier"/></label>
      <label>Période<input required value={period} onChange={e => setPeriod(e.target.value)} placeholder="Identifiant de période de la feuille"/></label>
      <button className={styles.primary} disabled={loading}>Charger la mission</button><DossierContextAnchor href={"/api/auth/login?returnTo=" + encodeURIComponent("/provisions/synthese?" + new URLSearchParams(scope))}>Se connecter</DossierContextAnchor>
    </form>
    {loading && <p role="status">Lecture de l’état serveur…</p>}{error && <p role="alert" className={styles.notice} data-tone="danger">{error}</p>}
    {m && p && view && <>
      <div className={styles.context}><span>Dossier <strong>{m.scope.dossierId}</strong></span><span>Organisation <strong>{m.scope.organizationId}</strong></span><span>Identité <strong>{view.actorId}</strong></span>
        <span>Confidentiel <strong>{m.confidentiality.access ? "habilitation présente" : "masqué par le serveur"}</strong></span><span>Programme <strong>{m.program.id} @ {m.program.version}</strong></span>
        <span><strong>{m.counters.executed}/{m.counters.planned}</strong> procédure exécutée</span><span><strong>{m.counters.testedParts}/{m.counters.plannedParts}</strong> contrôles complets{m.counters.notApplicableParts ? <> · <strong>{m.counters.notApplicableParts}</strong> non applicable(s)</> : null}</span>
        <span><strong>{m.counters.reviewed}/{m.counters.planned}</strong> revue courante</span><span><strong>{m.counters.exceptions}</strong> différence(s) · <strong>{m.counters.uncertainties}</strong> incertitude(s)</span><button type="button" onClick={() => void load()} disabled={loading}>Actualiser</button></div>
      <div className={styles.scopeNote}>{m.program.outOfScope.map(o => <span key={o}>Hors programme : {o}</span>)}</div>
      {!m.confidentiality.access && <p className={styles.notice} data-tone="info">{m.confidentiality.note}</p>}
      {p.stale && <p role="status" className={styles.notice} data-tone="danger">Travail périmé — {p.staleReasons.join(" ")}{newer && m.assignment.currentRunId && m.assignment.currentVersion ? <> <DossierContextAnchor href={provisionSynthesisHref(m.scope, { id: m.assignment.currentRunId, version: m.assignment.currentVersion })}>Afficher la version courante (v{m.assignment.currentVersion})</DossierContextAnchor></> : null}</p>}
      {!p.runId && m.assignment.choices.length > 1 && <section className={styles.card} aria-labelledby="pv-assign-title"><h2 id="pv-assign-title">Affecter une feuille au programme</h2><p className={styles.muted}>Plusieurs feuilles Provisions existent pour cette période ; aucune n’est retenue d’office.</p>
        <ul className={styles.list}>{m.assignment.options.map(o => <li key={o.rootId}><DossierContextAnchor href={provisionSynthesisHref(m.scope, { rootId: o.rootId })}>Restituer la feuille {o.runId}</DossierContextAnchor><p className={styles.muted}>r{o.revision} · v{o.version} · {STATE_LABELS[o.state] ?? o.state}</p></li>)}</ul></section>}
      <div className={styles.filters} role="group" aria-label="Filtres métier">{FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div>
      <div className={styles.workspace}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="pv-decision-title"><header><h2 id="pv-decision-title">{p.label}</h2><span className={styles.muted} style={{ overflowWrap: "anywhere", minWidth: 0 }}>{p.runId ? `Feuille ${p.runId} · r${p.revision} · v${p.version} · ${STATE_LABELS[p.state] ?? p.state}` : "À préparer"}</span></header>
            <p><strong>{p.resultLabel}</strong> · {p.reviewLabel}{p.review ? " · " + p.review.actorId + " · " + new Date(p.review.at).toLocaleString("fr-FR") : ""}</p><p>{p.conclusion}</p>
            {p.period && <p className={styles.muted}>Exercice {dateFr(p.period.startDate)} → {dateFr(p.period.closingDate)} · revue {dateFr(p.period.asOfDate)} · population {p.coverage.numerator}/{p.coverage.denominator ?? "inconnu"} {p.coverage.unit}</p>}
            {r && <p className={styles.muted}>Informations des avocats : {r.lawyers.status === "obtained" ? "obtenues — " + r.lawyers.citation.fileName + (r.lawyers.citation.row ? " ligne " + r.lawyers.citation.row : "") : "non obtenues — " + r.lawyers.reason}</p>}
            <div className={styles.tableScroll + " " + pv.scrollBox} role="region" aria-label="Contrôles du programme — défilement clavier" tabIndex={0}><table><caption>Contrôles du programme — numérateur, dénominateur, non applicables et convention</caption><thead><tr><th scope="col">Contrôle</th><th scope="col">Résultat</th><th scope="col" className={styles.money}>Couverture</th><th scope="col">Non applicables et convention</th></tr></thead>
              <tbody>{p.controls.map(c => <tr key={c.id}><th scope="row">{c.label}</th><td>{c.outcome ? OUTCOMES[c.outcome] : "Non exécuté"}</td>
                <td className={styles.money}>{c.coverage.numerator}/{c.coverage.denominator ?? "—"}<span className={pv.missionUnit}>{c.coverage.unit}</span></td><td>{c.coverage.exclusions.length ? c.coverage.exclusions.map(e => e.id + " : " + e.reason).join(" ; ") : "Aucun"}<span className={styles.meaning}>{c.convention}</span></td></tr>)}</tbody></table></div>
          </section>
          {r && <section className={styles.card} aria-labelledby="pv-events-title"><header><h2 id="pv-events-title">Registre restitué — un événement par ligne</h2><span className={styles.muted}>Montants du serveur ; « Inconnu » n’est jamais zéro</span></header>
            <div className={styles.tableScroll + " " + pv.scrollBox} role="region" aria-label="Événements du registre — défilement clavier" tabIndex={0}><table className={pv.missionTable}><caption>Pont, estimation et annexe par événement, sans somme entre événements ni catégories</caption>
              <thead><tr><th scope="col">Événement</th><th scope="col">Type et traitement retenu</th><th scope="col" className={pv.num}>Provision calculée / déclarée</th><th scope="col" className={pv.num}>Écart du pont</th><th scope="col" className={pv.num}>Estimation retenue / écart</th><th scope="col">Annexe</th></tr></thead>
              <tbody>{r.events.map(e => <tr key={e.eventId}><th scope="row">{e.eventId} · {e.label}<span className={pv.sub}>{PV_STATE_LABELS[e.state]}</span><KindBadge status={e.status}/>{p.runId && p.version ? <span className={pv.sub}><DossierContextAnchor href={provisionSheetHref(m.scope, { id: p.runId, version: p.version }, { eventId: e.eventId })}>Ouvrir la fiche (v{p.version})</DossierContextAnchor></span> : null}</th>
                <td>{PV_TYPE_LABELS[e.type]}<span className={pv.sub}>{PV_TREATMENT_LABELS[e.treatment]}</span></td>
                <td className={pv.num}>{e.bridge ? <>{formatCents(e.bridge.computedClosing)}<span className={pv.sub}>déclarée {formatCents(e.bridge.declaredClosing)}</span></> : e.commitmentCents !== null ? <>Engagement {formatCents(e.commitmentCents)}</> : "Sans provision"}</td>
                <td className={pv.num}>{e.bridge ? (e.bridge.difference === null ? "Inconnu" : formatCents(e.bridge.difference, { signed: true })) : "Non applicable"}</td>
                <td className={pv.num}>{e.masked ? <span className={pv.masked}>{PV_MASKED}</span> : e.retainedEstimateCents === null ? (e.treatment === "provision" ? "Aucune estimation retenue" : "Non applicable") : <>{formatCents(e.retainedEstimateCents)}<span className={pv.sub}>{e.treatment === "provision" ? "écart " + (e.estimateDifferenceCents === null ? "inconnu" : formatCents(e.estimateDifferenceCents, { signed: true })) : "comparaison réservée aux provisions"}</span></>}</td>
                <td>{ANNEX[e.annex.status]}{e.annex.lines.map(l => <span key={l.rowId} className={pv.sub}>{l.publishedCents === null ? "montant non publié" : formatCents(l.publishedCents)}{l.differenceCents === null ? "" : " · écart " + formatCents(l.differenceCents, { signed: true })}</span>)}</td></tr>)}</tbody></table></div>
          </section>}
          {r && <section className={styles.card} aria-labelledby="pv-framing-title"><header><h2 id="pv-framing-title">Cadrage par compte de provisions</h2><span className={styles.muted}>Écart = grand livre − registre ; aucune compensation entre comptes</span></header>
            <div className={styles.tableScroll + " " + pv.scrollBox} role="region" aria-label="Cadrage par compte — défilement clavier" tabIndex={0}><table className={pv.missionTable}><caption>Ouverture, clôture et pont du grand livre par compte</caption>
              <thead><tr><th scope="col">Compte</th><th scope="col" className={pv.num}>Ouverture registre / GL</th><th scope="col" className={pv.num}>Écart d’ouverture</th><th scope="col" className={pv.num}>Clôture registre / GL</th><th scope="col" className={pv.num}>Écart de clôture</th><th scope="col" className={pv.num}>Pont du grand livre</th></tr></thead>
              <tbody>{r.accounts.map(a => <tr key={a.account}><th scope="row">{a.account}<span className={pv.sub}>{a.label || "Absent du grand livre"} · {a.events.length ? a.events.join(", ") : "aucun événement"}</span></th>
                <td className={pv.num}>{formatCents(a.registerOpeningCents)}<span className={pv.sub}>GL {formatCents(a.ledgerOpeningCents)}</span></td><td className={pv.num}>{a.openingDifference === null ? "Inconnu" : formatCents(a.openingDifference, { signed: true })}</td>
                <td className={pv.num}>{formatCents(a.registerClosingCents)}<span className={pv.sub}>GL {formatCents(a.ledgerClosingCents)}</span></td><td className={pv.num}>{a.closingDifference === null ? "Inconnu" : formatCents(a.closingDifference, { signed: true })}</td>
                <td className={pv.num}>{a.ledgerBridgeDifference === null ? "Inconnu" : formatCents(a.ledgerBridgeDifference, { signed: true })}</td></tr>)}</tbody></table></div>
          </section>}
          {r && <section className={styles.card} aria-labelledby="pv-synth-exceptions"><h2 id="pv-synth-exceptions">Différences et incertitudes conservées après revue</h2><ul className={styles.list}>{exceptions.map(e => <li key={e.id}><div className={styles.kv}><strong>{e.label}</strong><span>{PV_UNCERTAINTY_CODES.includes(e.code) ? "Incertitude" : "Différence à examiner"}</span><span className={styles.money}>{provisionAmountLabel(e.amount)}</span></div><p>{e.message}</p>
              {p.runId && p.version && <DossierContextAnchor href={provisionSheetHref(m.scope, { id: p.runId, version: p.version }, { tab: "exceptions", eventId: e.eventId })}>Ouvrir la feuille sur ce point (v{p.version})</DossierContextAnchor>}</li>)}
            {!r.exceptions.length && <li>Aucune différence : cela ne démontre ni l’exhaustivité du registre ni l’issue des risques.</li>}{!!r.exceptions.length && !exceptions.length && <li>Aucun point dans ce filtre.</li>}</ul></section>}
          <section className={styles.card} aria-labelledby="pv-review-synth"><h2 id="pv-review-synth">Avant / après revue</h2><div className={styles.sideBySide}><section><strong>Version soumise {p.beforeReview?.version ?? "—"}</strong><p>{p.beforeReview?.conclusion || "Aucune soumission conservée."}</p></section><section><strong>Après revue · version {p.afterReview?.version ?? "—"}</strong><p>{p.review?.note ?? "Aucune décision de revue."}</p></section></div>
            <details><summary>Historique des versions et décisions</summary><ul className={styles.list}>{m.versionIndex.map(v => <li key={v.id + ":" + v.version}>r{v.revision} v{v.version} · {STATE_LABELS[v.state] ?? v.state} · {v.actorId}{v.approval ? " · " + v.approval.actorId + " : " + v.approval.note : ""}<code className={pv.hash}>{v.contentHash}</code></li>)}</ul></details>
          </section>
        </div>
        <aside className={styles.detail} aria-label="File de travail et pièces">
          <h2>File de travail</h2><p className={styles.muted}>Priorité aux travaux périmés et aux blocages.</p>
          {queue.length ? <ol className={styles.list}>{queue.map(q => <li key={q.id}><DossierContextAnchor href={q.href}>{q.label}</DossierContextAnchor><p className={styles.muted}>{q.detail}</p></li>)}</ol> : <p>Aucune action dans ce filtre.</p>}
          <h2>Index des pièces</h2><ul className={styles.list}>{m.sources.map(s => <li key={s.id}><strong>{s.label}</strong><p className={styles.muted}>{s.fileName ?? (s.required ? "Pièce requise absente" : "Pièce conditionnelle absente")} · {s.available ? (s.current ? "courante" : "périmée") : "absente"}{s.maskedRows ? " · " + s.maskedRows + " ligne(s) retirée(s) par le masquage" : ""} · binaire absent du paquet</p>
            {s.available && view.permissions.includes("download") && (!s.confidential || m.confidentiality.access) && <DossierContextAnchor href={"/api/workpapers/provisions?" + new URLSearchParams({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, operation: "download", id: s.id })}>Télécharger l’original</DossierContextAnchor>}
            {s.available && s.confidential && !m.confidentiality.access && <p className={styles.muted}>Original confidentiel : habilitation dédiée requise.</p>}</li>)}</ul>
        </aside>
      </div>
      <section className={styles.card} aria-labelledby="pv-export-title"><h2 id="pv-export-title">Export de cet état serveur</h2><p className={styles.muted}>Résumé, programme, population, registre, cadrage, différences, décisions et index des pièces, avec le même masquage que cet affichage. Originaux téléchargeables séparément.</p>
        {view.permissions.includes("download") ? <>
          <div className={styles.actions}><strong>Diagnostic</strong>{(["html", "pdf", "json", "manifest"] as const).map(f => <button key={f} type="button" disabled={exporting} onClick={() => void download("diagnostic", f)}>{f === "html" ? "HTML imprimable" : f.toUpperCase()}</button>)}
            <select aria-label="Télécharger un CSV diagnostic" value="" disabled={exporting} onChange={e => void download("diagnostic", e.target.value as ExportFormat)}><option value="" disabled>CSV…</option>{CSV.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
          <div className={styles.actions}><strong>Paquet approuvé</strong>{(["html", "pdf", "json", "manifest"] as const).map(f => <button key={f} type="button" disabled={exporting || !approvedReady} onClick={() => void download("approved", f)}>{f === "html" ? "HTML imprimable" : f.toUpperCase()}</button>)}</div>
          <p role="status">{exporting ? "Génération et contrôle serveur…" : approvedReady ? "Version courante, revue par une autre identité et verrouillée. Aucune opinion sur les comptes ni conclusion juridique." : "Paquet approuvé disponible après revue distincte et verrouillage de la version courante."}</p></> : <p>Votre identité ne dispose pas de la permission d’export.</p>}
        <details><summary>Limites et identité de l’état</summary><ul>{m.limitations.map(l => <li key={l}>{l}</li>)}</ul><code className={pv.hash}>{m.hash}</code></details>
      </section>
    </>}
  </main>;
}

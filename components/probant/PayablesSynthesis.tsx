"use client";
import { useEffect, useState } from "react";
import type { PayablesMission } from "@/lib/workpapers/payables-mission";
import { amountLabel, locatorLabel } from "@/lib/workpapers/client-mission";
import { PayablesDetails } from "./PayablesDetails";
import { payablesFailure } from "./PayablesWorkspace";
import s from "./Payables.module.css";
type Initial = {
    dossierId: string;
    periodId: string;
    id?: string;
    version?: number;
    event?: string;
};
export function PayablesSynthesis({ initial, cutoff = false }: {
    initial: Initial;
    cutoff?: boolean;
}) {
    const [input, setInput] = useState(initial), [scope, setScope] = useState(initial), [view, setView] = useState<{
        actorId: string;
        permissions: string[];
        mission: PayablesMission;
    } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [filter, setFilter] = useState("all"), [flow, setFlow] = useState("all"), [periodFilter, setPeriodFilter] = useState("all"), [eventId, setEventId] = useState(initial.event ?? "");
    async function load() { if (!scope.dossierId || !scope.periodId)
        return; setBusy(true); setError(""); try {
        const q = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, operation: "mission", ...(scope.id ? { id: scope.id } : {}), ...(scope.version ? { version: String(scope.version) } : {}) });
        const r = await fetch("/api/workpapers/payables?" + q, { cache: "no-store" }), data = await r.json();
        if (!r.ok)
            throw new Error(payablesFailure(r.status, data.error));
        setView(data);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Lecture impossible");
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => {
        void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope]);
    const m = view?.mission, p = m?.procedures.find(p => p.run?.id === m.selectedRunId), active = m?.events.find(e => e.eventId === eventId);
    async function download(kind: "diagnostic" | "approved", format: string) { if (!m)
        return; setBusy(true); setError(""); try {
        const auth = await fetch("/api/auth/session", { cache: "no-store" }), a = await auth.json();
        if (!auth.ok || !a.csrfToken)
            throw new Error("Session expirée : reconnectez-vous.");
        const r = await fetch("/api/workpapers/payables/export", { method: "POST", headers: { "Content-Type": "application/json", "x-probant-csrf": a.csrfToken }, body: JSON.stringify({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, ...(m.selectedRunId ? { id: m.selectedRunId, version: m.selectedVersion } : {}), kind, format, expectedSnapshotHash: m.hash }) });
        if (!r.ok) {
            const data = await r.json();
            throw new Error(payablesFailure(r.status, data.error));
        }
        const url = URL.createObjectURL(await r.blob()), link = document.createElement("a");
        link.href = url;
        link.download = r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "probant-fournisseurs." + format;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Export impossible");
    }
    finally {
        setBusy(false);
    } }
    const events = m?.events.filter(e => (flow === "all" || e.flow === flow) && (periodFilter === "all" || e.observations.some(o => { const d = o.cutoff.timeline.find(t => t.label === "Fait générateur")?.date; const close = p?.run?.period.closingDate; if (periodFilter === "unknown")
        return !d; if (!d || !close)
        return false; return periodFilter === "before" ? d <= close : d > close; }))) ?? [];
    const href = (path: string) => path + "?" + new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...(m?.selectedRunId ? { id: m.selectedRunId, version: String(m.selectedVersion) } : {}) });
    return <main className={s.workspace}><nav className={s.links}><a href="/dashboard/synthese">DEMO SA · constats historiques</a><a href="/atelier">Atelier synthétique</a><span>Procédures de mission</span></nav><header className={s.header}><p className={s.eyebrow}>MISSION 08 · ÉTAT SERVEUR VERSIONNÉ</p><h1>{cutoff ? "Cut-off transversal" : "Synthèse Achats et fournisseurs"}</h1><p>Décisions distinctes par procédure. Événements et preuves partagés, sans double compte.</p><nav className={s.links}><a href={href("/payables")}>Feuille d’investigation</a><a href={href(cutoff ? "/payables/synthesis" : "/cutoff")}>{cutoff ? "Synthèse et export" : "Vue cut-off ventes / achats"}</a><a href={"/clients-framing?"+new URLSearchParams({dossierId:scope.dossierId,periodId:scope.periodId})}>Cycle Clients</a></nav></header><form className={s.form} onSubmit={e => { e.preventDefault(); setScope({ dossierId: input.dossierId.trim(), periodId: input.periodId.trim() }); }}><label>Dossier<input required value={input.dossierId} onChange={e => setInput({ ...input, dossierId: e.target.value })}/></label><label>Identifiant de période<input required value={input.periodId} onChange={e => setInput({ ...input, periodId: e.target.value })}/></label><button disabled={busy}>Charger la mission</button><a href={"/api/auth/login?returnTo=" + encodeURIComponent(href(cutoff ? "/cutoff" : "/payables/synthesis"))}>Se connecter</a></form>{busy && <p role="status">Lecture ou génération contrôlée par le serveur…</p>}{error && <p role="alert" className={s.notice}>{error}</p>}
 {m && <><div className={s.meta}><span>Identité réelle : {view.actorId}</span><span>Organisation {m.scope.organizationId}</span><span>{m.counters.executed}/{m.counters.planned} procédures exécutées · {m.counters.plannedControls} contrôles prévus · {m.counters.approved}/{m.counters.planned} procédures verrouillées et courantes</span><button disabled={busy} onClick={() => void load()}>Actualiser</button></div><p className={s.notice}>Une revue ne vaut pas conformité des comptes. La fenêtre de paiements ne prouve pas l’exhaustivité des dettes. Les exceptions et les inconnus restent visibles après revue.</p><section className={s.section}><h2>Programme et décisions</h2><div className={s.scroll} tabIndex={0} role="region" aria-label="Programme et décisions — défilement clavier"><table><thead><tr><th>Procédure</th><th>Version et auteur</th><th>Contrôles testés</th><th>Décision / actualité</th><th>Feuille</th></tr></thead><tbody>{m.procedures.map(procedure => <tr key={procedure.id}><th scope="row">{procedure.label}</th><td>r{procedure.run?.revision ?? "—"} · v{procedure.run?.version ?? "—"}<p>{procedure.run?.events.at(-1)?.actorId ?? "Non préparée"}</p></td><td>{procedure.controls.map((c, i) => <p key={i}>{c.label} : {c.numerator}/{c.denominator ?? "inconnu"} {c.unit}</p>)}<p>Exclusions : {procedure.coverage.exclusions.map(e => e.id + " : " + e.reason).join(" ; ") || "aucune"}</p></td><td>{procedure.stale ? "Travail périmé : " + procedure.staleReasons.join(" ") : procedure.run?.state ?? "À préparer"}<p>{procedure.reviewLabel}</p><p>{procedure.run?.approval?.actorId} {procedure.run?.approval?.note}</p></td><td><a href={procedure.href}>Ouvrir cette version</a>{procedure.run && <button onClick={() => setScope({ ...scope, id: procedure.run!.id, version: procedure.run!.version })}>Examiner dans la Synthèse</button>}</td></tr>)}</tbody></table></div>{m.versionIndex.length > 0 && <label>Version à examiner<select value={m.selectedRunId + ":" + m.selectedVersion} onChange={e => { const v = m.versionIndex.find(v => v.id + ":" + v.version === e.target.value); if (v)
            setScope({ ...scope, id: v.id, version: v.version }); }}>{m.versionIndex.map(v => <option key={v.id + ":" + v.version} value={v.id + ":" + v.version}>{v.procedureId} · r{v.revision} v{v.version} · {v.state}</option>)}</select></label>}</section>
 {!cutoff && <section className={s.section}><h2>File de travail priorisée</h2><nav className={s.filters} aria-label="Filtres métier">{["all", "blocked", "exceptions", "evidence", "review", "stale"].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{({ all: "Tout", blocked: "Blocages", exceptions: "À expliquer", evidence: "Pièces attendues", review: "Revues", stale: "Périmés" } as Record<string, string>)[f]}</button>)}</nav><ol className={s.queue}>{m.queue.filter(q => filter === "all" || q.category === filter).map(q => <li key={q.id}><a href={q.href}>{q.label}</a><p>{q.detail}</p></li>)}</ol>{p?.run && p.result && <PayablesDetails key={p.run.id + ":" + p.run.version} run={p.run} result={p.result} initialFilter={filter} canDownload={view.permissions.includes("download")}/>}<h3>Avant / après revue</h3><div className={s.compare}><div><strong>Version soumise {p?.beforeReview?.version ?? "—"}</strong><p>{p?.beforeReview?.conclusion ?? "Aucune soumission conservée."}</p><p>{p?.beforeReview?.notes.length ?? 0} points documentés avant revue</p></div><div><strong>Version affichée {p?.run?.version ?? "—"}</strong><p>{p?.run?.approval?.note ?? "Aucune décision de revue."}</p><p>Exception maintenue : {p?.result?.rows.filter(r => r.status === "omission_candidate").length ?? 0} lignes candidat omission ; ce nombre ne mesure pas l’avancement.</p></div></div></section>}
 <section className={s.section}><h2>Événements économiques · cut-off</h2><p>{m.amountConvention}</p><div className={s.form}><label>Flux<select value={flow} onChange={e => setFlow(e.target.value)}><option value="all">Ventes et achats</option><option value="purchase">Achats</option><option value="sale">Ventes</option></select></label><label>Fait générateur et période<select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}><option value="all">Toutes les dates</option><option value="before">À ou avant clôture</option><option value="after">Après clôture</option><option value="unknown">Prestation inconnue</option></select></label></div><div className={s.grid}><div className={s.scroll} tabIndex={0} role="region" aria-label="Événements cut-off — défilement clavier"><table><caption>Une ligne par événement ; Achats et RPNE ouvrent la même identité</caption><thead><tr><th>Événement / facture</th><th>Flux / tiers</th><th>Observations et versions</th><th>Résiduel unique HT</th><th>Preuve</th></tr></thead><tbody>{events.map(e => <tr key={e.eventId} aria-selected={eventId === e.eventId}><th scope="row">{e.invoiceId}<code>{e.eventId}</code></th><td>{e.flow === "sale" ? "Vente" : "Achat"}<p>{e.party}</p></td><td>{e.observations.map(o => <p key={o.procedureId}><a href={o.href}>{o.procedureId} v{o.version}</a> · {o.status} {o.stale && "· périmée"} · candidat technique {o.cutoff.candidate ?? "aucun"}</p>)}</td><td>{amountLabel(m.exposures.find(x => x.economicEventId === e.eventId)?.amount)} HT<p className={s.muted}>Montant de l’événement, sans somme par procédure</p></td><td><button onClick={() => setEventId(e.eventId)}>Examiner {e.invoiceId}</button></td></tr>)}{!events.length && <tr><td colSpan={5}>Aucun événement documenté dans ce filtre. Les ventes nécessitent leurs sources de facture et prestation dans ce périmètre.</td></tr>}</tbody></table></div><aside className={s.proof} aria-label="Preuve de l’événement"><h2>{active?.invoiceId ?? "Preuve de l’événement"}</h2>{active ? <><code>{active.eventId}</code>{active.observations.map(o => <div key={o.procedureId}><h3>{o.procedureId} · v{o.version}</h3><p>{o.status} {o.stale && "— source périmée"}</p><ol className={s.timeline}>{o.cutoff.timeline.map((t, i) => <li key={i}><time>{t.date ?? "Date inconnue"}</time> · {t.label}</li>)}</ol><p>{o.cutoff.reasons.join(" ; ")}</p>{o.cutoff.evidence.map(e => <p key={e.id}>{e.purpose} · {locatorLabel(e.locator)}<code>{e.documentVersionId}</code>{view.permissions.includes("download") && <a href={"/api/workpapers/payables?" + new URLSearchParams({ dossierId: m.scope.dossierId, periodId: m.scope.periodId, operation: "download", id: e.documentVersionId })}>Télécharger séparément</a>}</p>)}<a href={o.href}>Feuille et version de cette observation</a></div>)}</> : <p>Sélectionnez un événement. Les observations des deux procédures gardent leur version et leur décision.</p>}</aside></div></section>
 <section className={s.section}><h2>Sources et pièces attendues</h2>{m.sources.map(source => <details key={source.id}><summary>{source.label} · {source.fileName} · {source.current ? "courante" : "remplacée / périmée"}</summary><p>Approuvée par {source.approvedBy} · {source.approvedAt}. Binaire absent du paquet.</p><code>{source.id}</code><code>SHA-256 {source.sha256}</code><p>Parseur {source.parserVersion} · mapping {source.mappingVersion}</p></details>)}{m.missingSources.map(source => <p key={source.type}>Pièce attendue absente : {source.label}</p>)}</section><section className={s.section}><h2>Export concordant avec cet état</h2><p>Les originaux sont absents du paquet. HTML imprimable et PDF standard, sans archivage certifié. Chaque approbation porte sur la procédure sélectionnée.</p>{view.permissions.includes("download") && (["diagnostic", "approved"] as const).map(kind => <div className={s.exports} key={kind}><strong>{kind === "approved" ? "Paquet approuvé" : "Diagnostic distinct"}</strong>{["html", "pdf", "json", "manifest", "exceptions_csv", "decisions_csv", "procedures_csv", "sources_csv"].map(format => <button key={format} disabled={busy || (kind === "approved" && (p?.run?.state !== "locked" || p.stale))} onClick={() => void download(kind, format)}>{({ html: "HTML imprimable", pdf: "PDF", json: "JSON", manifest: "Manifeste", exceptions_csv: "Exceptions CSV", decisions_csv: "Décisions CSV", procedures_csv: "Programme CSV", sources_csv: "Sources CSV" } as Record<string, string>)[format]}</button>)}</div>)}<details><summary>Limites et identité de cet état serveur</summary><code>{m.hash}</code><ul>{m.limitations.map(l => <li key={l}>{l}</li>)}</ul></details></section></>}
 </main>;
}

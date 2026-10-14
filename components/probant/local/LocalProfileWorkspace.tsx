"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAPABILITY_CYCLE_LABELS, ENGINE_PROCEDURES } from "@/lib/capabilities/procedures";
import { REVIEW_KIND_LABELS, type ReviewKind } from "@/lib/auth/review-kind";
import { ReviewKindNotice } from "@/components/probant/ReviewKindNotice";
import s from "./local.module.css";

/**
 * Page d'accueil du profil personnel local (C07) : où l'on est (profil, base,
 * identité, type de relecture), quels dossiers existent sur ce PC, et où
 * reprendre le travail. Aucun calcul : la page lit les routes locales.
 */
interface Session { authenticated: boolean; executionProfile?: string; reviewKind?: ReviewKind; displayName?: string; permissions?: string[]; csrfToken?: string; subject?: string }
interface Status { profileId: string | null; restoredFrom: string | null; database: { name: string; serverVersion: string; migrationsApplied: number; lastMigration: string | null }; chains: { flag: string; enabled: boolean }[] }
interface Dossier { id: string; externalRef: string; legalName: string | null; siren: string | null; financialYear: string | null; status: string; createdAt: string }
type Phase = "loading" | "disabled" | "signed_out" | "ready" | "error";

/** Une entrée par feuille durable, dans l'ordre du registre ; le dossier de clôture observe ces feuilles. */
const WORK_LINKS = [...new Map(ENGINE_PROCEDURES.map(p => [p.route, { route: p.route, cycle: CAPABILITY_CYCLE_LABELS[p.cycle], labels: ENGINE_PROCEDURES.filter(q => q.route === p.route).map(q => q.label) }])).values(),
  { route: "/dossier-cloture", cycle: CAPABILITY_CYCLE_LABELS.transversal, labels: ["Programme de travail, pièces et clôture"] }];

const dateFr = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function LocalProfileWorkspace() {
  const [phase, setPhase] = useState<Phase>("loading"), [message, setMessage] = useState("");
  const [session, setSession] = useState<Session | null>(null), [status, setStatus] = useState<Status | null>(null);
  const [dossiers, setDossiers] = useState<Dossier[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ legalName: "", siren: "", financialYear: "" }), [saving, setSaving] = useState(false), [formMessage, setFormMessage] = useState("");
  const panelTitle = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setPhase("loading"); setMessage("");
    try {
      const statusResponse = await fetch("/api/local/status", { cache: "no-store", credentials: "same-origin" });
      if (statusResponse.status === 404) { setPhase("disabled"); return; }
      if (statusResponse.status === 401) { setPhase("signed_out"); return; }
      if (!statusResponse.ok) throw new Error((await statusResponse.json().catch(() => null))?.code ?? "LOCAL_STATUS_UNAVAILABLE");
      const [sessionView, list] = await Promise.all([
        fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" }).then(r => r.json() as Promise<Session>),
        fetch("/api/local/dossiers", { cache: "no-store", credentials: "same-origin" }).then(async r => { if (!r.ok) throw new Error("LOCAL_DOSSIERS_UNAVAILABLE"); return (await r.json()).dossiers as Dossier[]; }),
      ]);
      setStatus(await statusResponse.json()); setSession(sessionView); setDossiers(list);
      setSelected(current => current && list.some(d => d.id === current) ? current : list[0]?.id ?? null);
      setPhase("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lecture impossible."); setPhase("error");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dossier = useMemo(() => dossiers.find(d => d.id === selected) ?? null, [dossiers, selected]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !session?.csrfToken) return;
    setSaving(true); setFormMessage("");
    try {
      const body = { legalName: form.legalName.trim(), financialYear: form.financialYear.trim(), ...(form.siren.trim() ? { siren: form.siren.trim() } : {}) };
      const response = await fetch("/api/local/dossiers", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-probant-csrf": session.csrfToken }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setFormMessage(result?.message ?? "Création refusée (" + (result?.code ?? response.status) + ")."); return; }
      setFormMessage(result.created ? "Dossier créé." : "Ce dossier existait déjà : il est sélectionné, rien n'a été dupliqué.");
      setForm({ legalName: "", siren: "", financialYear: "" });
      const list = await fetch("/api/local/dossiers", { cache: "no-store", credentials: "same-origin" }).then(r => r.json());
      setDossiers(list.dossiers); setSelected(result.dossier.id);
      requestAnimationFrame(() => panelTitle.current?.focus());
    } catch {
      setFormMessage("Serveur local injoignable : vérifiez que npm run local:start tourne toujours.");
    } finally { setSaving(false); }
  }

  if (phase === "loading") return <main className={s.page}><p role="status">Lecture du profil local…</p></main>;
  if (phase === "disabled") return <main className={s.page}><p className={s.eyebrow}>Profil personnel local</p><h1>Ce serveur ne tourne pas dans le profil personnel</h1>
    <p className={s.lead}>Cette adresse sert la démo navigateur ou une recette jetable. Pour travailler sur vos dossiers, lancez <code>npm run local:start</code> sur votre PC : le profil personnel utilise sa propre base PostgreSQL et ses propres pièces.</p></main>;
  if (phase === "signed_out") return <main className={s.page}><p className={s.eyebrow}>Profil personnel local</p><h1>Connexion locale requise</h1>
    <p className={s.lead}>Ouvrez le lien de connexion affiché par <code>npm run local:start</code>, ou obtenez-en un nouveau avec <code>npm run local:login</code>. Le lien ne sert qu&apos;une fois et expire après quelques minutes.</p></main>;
  if (phase === "error" || !session || !status) return <main className={s.page}><p className={s.eyebrow}>Profil personnel local</p><h1>Profil local indisponible</h1>
    <p role="alert" className={s.lead}>{message || "Lecture impossible."} Vérifiez avec <code>npm run local:status</code> que PostgreSQL et Next tournent.</p><button type="button" className={s.button} onClick={() => void load()}>Réessayer</button></main>;

  const canCreate = !!session.permissions?.includes("dossier:upload");
  return <main className={s.page}>
    <header className={s.header}>
      <p className={s.eyebrow}>Profil personnel local</p>
      <h1>Dossiers sur ce PC</h1>
      <p className={s.lead}>La base PostgreSQL et les pièces importées restent sur ce poste. Choisissez un dossier pour reprendre une feuille ; chaque feuille garde ses versions, ses sources et ses exports.</p>
    </header>
    <dl className={s.context} aria-label="Contexte d'exécution">
      <div><dt>Identité</dt><dd>{session.displayName ?? session.subject}</dd></div>
      <div><dt>Relecture</dt><dd>{session.reviewKind ? REVIEW_KIND_LABELS[session.reviewKind] : "—"}</dd></div>
      <div><dt>Base</dt><dd>{status.database.name} · PostgreSQL {status.database.serverVersion}</dd></div>
      <div><dt>Migrations</dt><dd>{status.database.migrationsApplied} appliquées{status.database.lastMigration ? " · dernière " + status.database.lastMigration : ""}</dd></div>
      {status.restoredFrom && <div><dt>Restauration</dt><dd>depuis {status.restoredFrom}</dd></div>}
    </dl>
    <ReviewKindNotice kind={session.reviewKind} />
    <div className={s.layout}>
      <section aria-labelledby="local-dossiers-title" className={s.list}>
        <h2 id="local-dossiers-title">Dossiers <span className={s.count}>{dossiers.length}</span></h2>
        {dossiers.length === 0 ? <p className={s.muted}>Aucun dossier sur ce PC. Créez-en un ci-dessous : les feuilles de cycle s&apos;y rattachent.</p> :
          <div className={s.scroll} role="region" aria-label="Liste des dossiers — défilement clavier" tabIndex={0}>
            <table className={s.table}>
              <thead><tr><th scope="col">Raison sociale</th><th scope="col">SIREN</th><th scope="col">Exercice</th><th scope="col" className={s.created}>Créé le</th></tr></thead>
              <tbody>{dossiers.map(d => <tr key={d.id} data-selected={d.id === selected || undefined}>
                <th scope="row"><button type="button" className={s.rowButton} aria-pressed={d.id === selected} onClick={() => setSelected(d.id)}>{d.legalName ?? d.externalRef}</button></th>
                <td className={s.cell}>{d.siren ? <span className={s.mono}>{d.siren}</span> : <span className={s.muted}>Non renseigné</span>}</td>
                <td className={s.cell}>{d.financialYear ?? <span className={s.muted}>Non renseigné</span>}</td><td className={s.cell + " " + s.created}><span className={s.mono}>{dateFr(d.createdAt)}</span></td>
              </tr>)}</tbody>
            </table>
          </div>}
        <form className={s.form} onSubmit={create} aria-labelledby="local-new-title">
          <h3 id="local-new-title">Nouveau dossier</h3>
          <div className={s.fields}>
            <label>Raison sociale<input required maxLength={160} value={form.legalName} disabled={!canCreate || saving} onChange={e => setForm({ ...form, legalName: e.target.value })} /></label>
            <label>SIREN (facultatif)<input inputMode="numeric" pattern="\d{9}" maxLength={9} value={form.siren} disabled={!canCreate || saving} onChange={e => setForm({ ...form, siren: e.target.value })} /></label>
            <label>Exercice<input required maxLength={40} placeholder="ex. 2025 ou 2024-2025" value={form.financialYear} disabled={!canCreate || saving} onChange={e => setForm({ ...form, financialYear: e.target.value })} /></label>
          </div>
          <button type="submit" className={s.button} disabled={!canCreate || saving || !form.legalName.trim() || !form.financialYear.trim()}>{saving ? "Création…" : "Créer le dossier"}</button>
          <p role="status" className={s.muted}>{formMessage}</p>
        </form>
      </section>
      <aside aria-labelledby="local-panel-title" className={s.panel}>
        <h2 id="local-panel-title" ref={panelTitle} tabIndex={-1}>{dossier ? "Travaux · " + (dossier.legalName ?? dossier.externalRef) : "Travaux du dossier"}</h2>
        {!dossier ? <p className={s.muted}>Sélectionnez ou créez un dossier.</p> : <>
          <p className={s.muted}>Chaque feuille s&apos;ouvre avec ce dossier ; saisissez-y les dates de l&apos;exercice puis importez vos pièces.</p>
          <ul className={s.links}>{WORK_LINKS.map(l => <li key={l.route}><a href={l.route + "?dossierId=" + encodeURIComponent(dossier.id)}><span className={s.cycle}>{l.cycle}</span><span>{l.labels.join(" · ")}</span></a></li>)}</ul>
          <details className={s.method}><summary>Identifiants du dossier</summary><p>Créé le {dateFr(dossier.createdAt)}</p><p className={s.mono}>Dossier {dossier.id}</p><p className={s.mono}>Référence {dossier.externalRef}</p></details>
        </>}
      </aside>
    </div>
    <details className={s.method}>
      <summary>Méthode : profil, chaînes et sauvegarde</summary>
      <p>Profil {status.profileId ?? "non inscrit"}. Démarrer, arrêter, sauvegarder et restaurer se font depuis le terminal : <code>npm run local:start</code>, <code>npm run local:stop</code>, <code>npm run local:backup</code>, <code>npm run local:restore</code>. Voir docs/local/RUNTIME_PERSONNEL.md.</p>
      <ul className={s.chains}>{status.chains.map(c => <li key={c.flag}><span className={s.mono}>{c.flag}</span> · {c.enabled ? "ouverte" : "fermée"}</li>)}</ul>
    </details>
  </main>;
}

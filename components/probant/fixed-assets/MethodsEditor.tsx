"use client";
import { useState } from "react";
import type { FixedAssetDraft, FixedAssetMethodDraft, FixedAssetWork } from "@/lib/workpapers/fixed-asset-review";
import { dateFr } from "./format";
import styles from "../cash/cash.module.css";
import fa from "./fixed-assets.module.css";

const EMPTY: FixedAssetMethodDraft = { id: "", version: "1", kind: "linear", label: "", source: "", from: "", to: "", basis: "" };
/**
 * Methods are documented by the preparer from a cited source; nothing is proposed by default.
 * The server stamps author and date; a change removes the current result and requires a new execution.
 */
export function MethodsEditor({ draft, saved, referenced, disabled, onChange }: { draft: FixedAssetDraft; saved: FixedAssetWork | null; referenced: string[]; disabled: boolean; onChange(next: FixedAssetDraft): void }) {
  const [form, setForm] = useState<FixedAssetMethodDraft>(EMPTY), [editing, setEditing] = useState<string | null>(null);
  const valid = !!form.id.trim() && !!form.version.trim() && !!form.label.trim() && !!form.source.trim() && !!form.basis.trim() && !!form.from && !!form.to && form.from <= form.to;
  const missing = referenced.filter(ref => !draft.methods.some(m => m.id === ref));
  const author = (id: string) => saved?.methods.find(m => m.id === id);
  return <fieldset className={styles.card} disabled={disabled} aria-describedby="fa-methods-help">
    <legend className={styles.srOnly}>Méthodes d’amortissement documentées</legend>
    <header><h3>Méthodes d’amortissement documentées</h3><span className={styles.muted}>{draft.methods.length} méthode(s) · aucune méthode par défaut</span></header>
    <p id="fa-methods-help" className={styles.muted}>Chaque méthode cite sa source (politique du client, décision documentée), sa période de validité et la base amortissable. Les paramètres par actif (durée, résiduel, prorata, mise en service) viennent de la source « Paramètres ». Une méthode « non couverte » exclut explicitement ses actifs du recalcul.</p>
    {missing.length > 0 && <p className={styles.notice} role="note">Méthodes référencées par les paramètres mais non documentées : {missing.join(", ")}. Les actifs concernés resteront bloqués (source requise).</p>}
    {draft.methods.length ? <ul className={styles.list}>{draft.methods.map(m => <li key={m.id}>
      <div className={styles.kv}><strong>{m.id} v{m.version}</strong><span>{m.kind === "linear" ? "Linéaire" : "Non couverte par le recalcul"}</span><span>{dateFr(m.from)} → {dateFr(m.to)}</span>{author(m.id) && <span>par {author(m.id)!.authorId} · {new Date(author(m.id)!.authoredAt).toLocaleString("fr-FR")}</span>}</div>
      <p>{m.label}</p><p className={styles.muted}>Source : {m.source} · base : {m.basis}</p>
      <div className={styles.actions}><button type="button" onClick={() => { setForm(m); setEditing(m.id); }}>Modifier</button><button type="button" onClick={() => onChange({ methods: draft.methods.filter(x => x.id !== m.id) })}>Retirer</button></div>
    </li>)}</ul> : <p className={styles.muted}>Aucune méthode documentée : tout recalcul restera bloqué.</p>}
    <div className={`${styles.fields} ${fa.formGrid}`}>
      <label>Identifiant de méthode<input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="LIN-2024"/></label>
      <label>Version<input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}/></label>
      <label>Nature<select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as FixedAssetMethodDraft["kind"] }))}><option value="linear">Linéaire (recalcul couvert)</option><option value="not_covered">Non couverte — exclure du recalcul</option></select></label>
      <label>Valide du<input type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))}/></label>
      <label>au<input type="date" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))}/></label>
    </div>
    <div className={`${styles.fields} ${fa.formGrid}`}>
      <label>Libellé<input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}/></label>
      <label>Source citée<input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Politique d’amortissement, version, date"/></label>
      <label>Base amortissable<input value={form.basis} onChange={e => setForm(f => ({ ...f, basis: e.target.value }))} placeholder="Coût brut moins valeur résiduelle documentée"/></label>
    </div>
    {form.from && form.to && form.from > form.to && <p className={styles.notice} data-tone="danger">La validité doit commencer avant de finir.</p>}
    <div className={styles.actions}>
      <button type="button" disabled={!valid} onClick={() => { onChange({ methods: [...draft.methods.filter(m => m.id !== (editing ?? form.id)), { ...form, id: form.id.trim() }].sort((a, b) => a.id < b.id ? -1 : 1) }); setForm(EMPTY); setEditing(null); }}>{editing ? "Mettre à jour la méthode dans le brouillon" : "Ajouter la méthode au brouillon"}</button>
      {editing && <button type="button" onClick={() => { setForm(EMPTY); setEditing(null); }}>Annuler</button>}
    </div>
  </fieldset>;
}

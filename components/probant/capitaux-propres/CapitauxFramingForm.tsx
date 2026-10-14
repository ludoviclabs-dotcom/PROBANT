"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { EquityDraft } from "@/lib/workpapers/capitaux-review";
import { SOCIAL_FORMS, SOCIAL_FORM_LABELS } from "@/lib/workpapers/capitaux-legal";
import { INSTRUMENT_KINDS, INSTRUMENT_KIND_LABELS, presentationResolution, type InstrumentDraft } from "@/lib/workpapers/capitaux-presentation";
import type { ImportBatch } from "@/lib/workpapers/imports";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

type Piece = ImportBatch & { rowCount?: number };
type Citation = { documentId: string; page?: number } | null;
const TRI = [["inconnu", "Inconnu"], ["oui", "Oui"], ["non", "Non"]] as const;
const EMPTY: InstrumentDraft = { id: "", label: "", kind: "autre_instrument", accounts: [], note: "", citation: null,
  terms: { capitauxPropres: "inconnu", remboursementImposable: "inconnu", partsFixes: "sans_objet", partNonRemboursable: null, avanceFondsPublics: "inconnu", remboursementConditionneSucces: "inconnu", abandonEnCasEchec: "inconnu", interetsConditionnes: "sans_objet", presentationDeclaree: null } };

function PiecePicker({ label, pieces, value, onChange, disabled }: { label: string; pieces: Piece[]; value: Citation; onChange(v: Citation): void; disabled: boolean }) {
  const piece = pieces.find(p => p.document.id === value?.documentId), pdf = piece?.document.format === "pdf", pages = piece ? piece.rowCount ?? piece.rows.length : 0;
  return <div className={styles.fields}>
    <label>{label}<select value={value?.documentId ?? ""} disabled={disabled} onChange={e => onChange(e.target.value ? { documentId: e.target.value, ...(pieces.find(p => p.document.id === e.target.value)?.document.format === "pdf" ? { page: 1 } : {}) } : null)}>
      <option value="">Aucune pièce citée</option>{pieces.map(p => <option key={p.id} value={p.document.id}>{(p.mapping.capitaux?.pieceRef ? p.mapping.capitaux.pieceRef + " · " : "") + p.document.fileName}</option>)}</select></label>
    {pdf && <label>Page (1 à {pages})<input type="number" min={1} max={pages} value={value?.page ?? 1} disabled={disabled} onChange={e => onChange({ documentId: value!.documentId, page: Math.max(1, Math.min(pages, Number(e.target.value) || 1)) })}/></label>}
  </div>;
}

/** Declared framing of the sheet (rule 1.1.0): social form, ANC 2024-07 anticipation, instruments of the other-equity rubric. Saved by the server, which resolves the cited pieces. */
export function CapitauxFramingForm({ draft, period, pieces, otherEquityAccounts, editable, saving, onSave }: {
  draft: EquityDraft; period: AccountingPeriod; pieces: Piece[]; otherEquityAccounts: { account: string; label: string }[]; editable: boolean; saving: boolean; onSave(next: EquityDraft): void }) {
  const framing = draft.framing ?? { socialForm: null, socialFormCitation: null, anticipationAnc202407: false, anticipationCitation: null };
  const instruments = draft.instruments ?? [];
  const [form, setForm] = useState(framing), [editing, setEditing] = useState<InstrumentDraft | null>(null), [original, setOriginal] = useState<string | null>(null);
  const disabled = !editable || saving;
  const anticipation = period.startDate && period.closingDate ? presentationResolution(period, false) : null;
  const saveFraming = () => onSave({ ...draft, framing: form, instruments });
  const saveInstrument = () => { if (!editing) return; onSave({ ...draft, framing, instruments: [...instruments.filter(i => i.id !== original), editing].sort((a, b) => a.id < b.id ? -1 : 1) }); setEditing(null); setOriginal(null); };
  const remove = (id: string) => onSave({ ...draft, framing, instruments: instruments.filter(i => i.id !== id) });
  const term = <K extends keyof InstrumentDraft["terms"]>(key: K, value: InstrumentDraft["terms"][K]) => setEditing(e => e ? { ...e, terms: { ...e.terms, [key]: value } } : e);
  const triSelect = (key: "capitauxPropres" | "avanceFondsPublics" | "remboursementConditionneSucces" | "abandonEnCasEchec", label: string) =>
    <label>{label}<select value={editing!.terms[key]} disabled={disabled} onChange={e => term(key, e.target.value as "oui")}>{TRI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  const validId = !!editing && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(editing.id) && !instruments.some(i => i.id === editing.id && i.id !== original) && !!editing.label.trim();
  return <section className={styles.card} aria-labelledby="eq-framing-title"><header><h2 id="eq-framing-title">Cadre déclaré : forme sociale et autres fonds propres</h2><span className={styles.muted}>Déclarations humaines citées ; le serveur les date et les applique au calcul</span></header>
    {!editable && <p className={styles.muted}>Lecture seule : figez les sources (préparateur de la feuille, version courante) pour déclarer le cadre.</p>}
    <fieldset className={styles.fields} aria-label="Forme sociale et texte de présentation" disabled={disabled}>
      <label>Forme sociale<select value={form.socialForm ?? ""} onChange={e => setForm(f => ({ ...f, socialForm: (e.target.value || null) as typeof f.socialForm }))}><option value="">Non documentée</option>{SOCIAL_FORMS.map(s => <option key={s} value={s}>{SOCIAL_FORM_LABELS[s]}</option>)}</select></label>
      {anticipation?.textStatus === "anticipation_available" || form.anticipationAnc202407 ? <label className={styles.check}><span><input type="checkbox" checked={form.anticipationAnc202407} onChange={e => setForm(f => ({ ...f, anticipationAnc202407: e.target.checked, anticipationCitation: e.target.checked ? f.anticipationCitation : null }))}/> Application anticipée d’ANC 2024-07 décidée par l’entité</span></label>
        : <p className={styles.muted}>{anticipation ? anticipation.meaning : "Période incomplète."}</p>}
    </fieldset>
    <PiecePicker label="Pièce de la forme sociale (statuts, Kbis…)" pieces={pieces} value={form.socialFormCitation} onChange={v => setForm(f => ({ ...f, socialFormCitation: v }))} disabled={disabled}/>
    {form.anticipationAnc202407 && <PiecePicker label="Pièce documentant l’anticipation (obligatoire)" pieces={pieces} value={form.anticipationCitation} onChange={v => setForm(f => ({ ...f, anticipationCitation: v }))} disabled={disabled}/>}
    {editable && <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || (form.anticipationAnc202407 && !form.anticipationCitation)} onClick={saveFraming}>Enregistrer le cadre</button></div>}
    <h3>Instruments de la rubrique « Autres fonds propres » et instruments proches du capital</h3>
    <p className={styles.muted}>Comptes de la rubrique dans la balance figée : {otherEquityAccounts.map(a => a.account + " " + a.label).join(" ; ") || "aucun"}. Un compte sans instrument déclaré reste « à qualifier ».</p>
    {instruments.length ? <ul className={styles.list}>{instruments.map(i => <li key={i.id}><div className={styles.kv}><strong>{i.id}</strong><span>{i.label}</span><span>{INSTRUMENT_KIND_LABELS[i.kind]}</span><span>comptes {i.accounts.join(", ") || "—"}</span><span>{i.citation ? "pièce citée" : "aucune pièce citée"}</span></div>
      {editable && <div className={styles.actions}><button type="button" disabled={disabled} onClick={() => { setEditing(i); setOriginal(i.id); }}>Modifier {i.id}</button><button type="button" className={styles.danger} disabled={disabled} onClick={() => remove(i.id)}>Retirer {i.id}</button></div>}</li>)}</ul>
      : <p className={styles.muted}>Aucun instrument déclaré.</p>}
    {editable && !editing && <button type="button" disabled={disabled} onClick={() => { setEditing({ ...EMPTY, accounts: [] }); setOriginal(null); }}>Déclarer un instrument</button>}
    {editing && <fieldset className={eq.instrumentForm} aria-label="Termes contractuels déclarés" disabled={disabled}><legend>Termes contractuels déclarés — oui, non ou inconnu ; rien n’est déduit du compte</legend>
      <div className={styles.fields}>
        <label>Identifiant<input value={editing.id} onChange={e => setEditing({ ...editing, id: e.target.value.trim() })} placeholder="TP-2019"/></label>
        <label>Libellé<input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}/></label>
        <label>Nature déclarée (descriptive)<select value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as InstrumentDraft["kind"] })}>{INSTRUMENT_KINDS.map(k => <option key={k} value={k}>{INSTRUMENT_KIND_LABELS[k]}</option>)}</select></label>
        <label>Comptes (séparés par des virgules)<input value={editing.accounts.join(", ")} onChange={e => setEditing({ ...editing, accounts: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}/></label>
      </div>
      <div className={styles.fields}>
        {triSelect("capitauxPropres", "Élément de capitaux propres (art. 1211-10)")}
        <label>Remboursement en trésorerie ou par remise d’un actif imposable à l’émetteur<select value={editing.terms.remboursementImposable} onChange={e => term("remboursementImposable", e.target.value as "oui")}>{[...TRI, ["partiel", "Sur une part seulement"] as const].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {editing.terms.remboursementImposable === "partiel" && <label>Parts fixes explicites<select value={editing.terms.partsFixes} onChange={e => term("partsFixes", e.target.value as "oui")}>{[...TRI, ["sans_objet", "Sans objet"] as const].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {editing.terms.remboursementImposable === "partiel" && editing.terms.partsFixes === "oui" && <label>Part non remboursable (EUR, 2 décimales)<input inputMode="decimal" value={editing.terms.partNonRemboursable?.amount ?? ""} onChange={e => term("partNonRemboursable", /^\d+\.\d{2}$/.test(e.target.value) ? { amount: e.target.value, currency: "EUR" } : null)} placeholder="200.00"/></label>}
        {triSelect("avanceFondsPublics", "Avance de l’État ou d’un organisme public")}
        {triSelect("remboursementConditionneSucces", "Remboursement conditionné au succès")}
        {triSelect("abandonEnCasEchec", "Abandon prévu en cas d’échec")}
        <label>Intérêts conditionnés<select value={editing.terms.interetsConditionnes} onChange={e => term("interetsConditionnes", e.target.value as "oui")}>{[...TRI, ["sans_objet", "Sans objet"] as const].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Présentation retenue (exercice antérieur à ANC 2024-07)<select value={editing.terms.presentationDeclaree ?? ""} onChange={e => term("presentationDeclaree", (e.target.value || null) as "dettes")}><option value="">Non déclarée</option><option value="autres_fonds_propres">Autres fonds propres</option><option value="dettes">Dettes</option><option value="capitaux_propres">Capitaux propres</option></select></label>
      </div>
      <PiecePicker label="Pièce contractuelle citée (contrat, convention, PV)" pieces={pieces} value={editing.citation} onChange={v => setEditing({ ...editing, citation: v })} disabled={disabled}/>
      <label>Note<textarea value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })}/></label>
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || !validId} onClick={saveInstrument}>Enregistrer l’instrument</button><button type="button" onClick={() => { setEditing(null); setOriginal(null); }}>Annuler</button>
        {!validId && <span className={styles.muted}>Identifiant unique (lettres, chiffres, . _ -) et libellé requis.</span>}</div>
    </fieldset>}
  </section>;
}

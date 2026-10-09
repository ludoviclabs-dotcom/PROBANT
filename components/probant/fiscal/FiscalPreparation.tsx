"use client";
import { useEffect, useMemo, useState } from "react";
import { VAT_EXPLANATION_KINDS, VAT_EXPLANATION_LABELS, VAT_GROUP_STATUSES, VAT_REGIMES, type VatExplanationKind } from "@/lib/workpapers/fiscal-labels";
import type { VatDraft, VatWork } from "@/lib/workpapers/fiscal-vat";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { cents, dateFr, FREQUENCY_LABELS, GROUP_LABELS, parseEurInput, REGIME_LABELS, SOURCE_LABELS } from "./format";
import type { FiscalView } from "./types";
import styles from "../cash/cash.module.css";
import fx from "./fiscal.module.css";

type Cite = { documentId: string; rowId?: string };
const cite = (c: { documentVersionId: string; rowId?: string } | null) => c ? { documentId: c.documentVersionId, ...(c.rowId ? { rowId: c.rowId } : {}) } : null;
/** The stamped work back to a browser draft: the server re-resolves every citation at the next save. */
export function draftFromWork(w: VatWork): VatDraft {
  return { frequency: w.frequency, formVintage: w.formVintage, profile: { vatRegime: w.profile.vatRegime, vatGroupStatus: w.profile.vatGroupStatus, siren: w.profile.siren, evidence: cite(w.profile.evidence) },
    explanations: w.explanations.map(e => ({ id: e.id, label: e.label, kind: e.kind, amountCents: e.amountCents, citation: cite(e.citation)! })) };
}
const key = (c: Cite | null) => c ? c.documentId + (c.rowId ? "#" + c.rowId : "") : "";
const parseKey = (k: string): Cite | null => { if (!k) return null; const [documentId, rowId] = k.split("#"); return { documentId, ...(rowId ? { rowId } : {}) }; };
/** Citable pieces: whole documents, plus the rows sent by the server (declaration boxes, payments, supporting pieces). */
export function citableOptions(view: FiscalView, importIds: string[]) {
  return view.imports.filter(b => importIds.includes(b.id)).flatMap(b => [
    { value: b.document.id, label: (SOURCE_LABELS[b.document.documentType] ?? b.document.documentType) + " · " + b.document.fileName + " (document entier)" },
    ...b.rows.map(r => ({ value: b.document.id + "#" + r.id, label: b.document.fileName + " · " + (r.original.fieldCode ? "case " + r.original.fieldCode + " — " + (r.original.rawValue || "vide") : (r.normalized?.key ?? "ligne") + (r.original.libelle ? " — " + r.original.libelle : "")) + (r.locator.row ? " (ligne " + r.locator.row + ")" : "") })),
  ]);
}
export function FiscalPreparation({ run, view, busy, editable, frozenSources, onFreeze, onConfigure }: { run: WorkpaperRun; view: FiscalView; busy: boolean; editable: boolean; frozenSources: string[]; onFreeze(draft: VatDraft): void; onConfigure(draft: VatDraft): void }) {
  const work = run.fiscalWork!, frozen = !!run.population;
  const [draft, setDraft] = useState<VatDraft>(() => draftFromWork(work));
  const [line, setLine] = useState<{ id: string; label: string; kind: VatExplanationKind; amount: string; citation: string }>({ id: "", label: "", kind: "credit_carried", amount: "", citation: "" });
  useEffect(() => { setDraft(draftFromWork(work)); }, [work]);
  const options = useMemo(() => citableOptions(view, frozenSources), [view, frozenSources]);
  const amount = parseEurInput(line.amount), lineValid = /^[A-Za-z0-9._-]{1,40}$/.test(line.id) && !!line.label.trim() && amount !== null && !!line.citation && !draft.explanations.some(e => e.id === line.id);
  const set = (profile: Partial<VatDraft["profile"]>) => setDraft(d => ({ ...d, profile: { ...d.profile, ...profile } }));
  const disabled = busy || !editable;
  return <section className={styles.card} aria-labelledby="fx-prep-title">
    <header><h2 id="fx-prep-title">Préparation : période, profil confirmé et explications</h2><span className={styles.muted}>{frozen ? "Sources figées : une modification efface le résultat et la revue" : "Les sources courantes de la période seront figées"}</span></header>
    <dl className={styles.kv}><dt>Période déclarative</dt><dd>{dateFr(work.period.startDate)} → {dateFr(work.period.endDate)} (identifie la feuille)</dd></dl>
    <div className={styles.fields}>
      <label>Périodicité<select value={draft.frequency} disabled={disabled} onChange={e => setDraft(d => ({ ...d, frequency: e.target.value as VatDraft["frequency"] }))}>{Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Millésime du formulaire<input type="number" min={2000} max={2200} value={draft.formVintage} disabled={disabled} onChange={e => setDraft(d => ({ ...d, formVintage: Number(e.target.value) }))}/></label>
      <label>Régime de TVA<select value={draft.profile.vatRegime} disabled={disabled} onChange={e => set({ vatRegime: e.target.value as VatDraft["profile"]["vatRegime"] })}>{VAT_REGIMES.map(r => <option key={r} value={r}>{REGIME_LABELS[r]}</option>)}</select></label>
      <label>Groupe TVA<select value={draft.profile.vatGroupStatus} disabled={disabled} onChange={e => set({ vatGroupStatus: e.target.value as VatDraft["profile"]["vatGroupStatus"] })}>{VAT_GROUP_STATUSES.map(r => <option key={r} value={r}>{GROUP_LABELS[r]}</option>)}</select></label>
      <label>SIREN (facultatif)<input value={draft.profile.siren ?? ""} inputMode="numeric" pattern="\d{9}" disabled={disabled} onChange={e => set({ siren: e.target.value.trim() || null })}/></label>
      <label>Pièce confirmant le profil<select value={key(draft.profile.evidence)} disabled={disabled} onChange={e => set({ evidence: parseKey(e.target.value) })}><option value="">Aucune — profil non confirmé</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    </div>
    <p className={styles.muted}>Profil {work.profile.status === "confirmed" ? <>confirmé par <strong>{work.profile.confirmedBy}</strong> le {dateFr(work.profile.confirmedAt!.slice(0, 10))} · {work.profile.evidence?.fileName}{work.profile.evidence?.row ? " ligne " + work.profile.evidence.row : ""}</> : <strong>non confirmé</strong>} — un régime inconnu ou non cité bloque le moteur au lieu d’être supposé.</p>
    <h3>Explications du pont (citant une pièce figée)</h3>
    {draft.explanations.length ? <ul className={fx.explanations}>{draft.explanations.map(e => { const saved = work.explanations.find(x => x.id === e.id); return <li key={e.id}>
      <span><strong>{e.id}</strong> · {VAT_EXPLANATION_LABELS[e.kind]} — {e.label}</span><span className={styles.money}>{cents(e.amountCents, { signed: true })}</span>
      <span className={styles.muted}>{saved ? saved.citation.fileName + (saved.citation.row ? " · ligne " + saved.citation.row : "") + " · " + saved.authorId : "À enregistrer"}</span>
      <button type="button" disabled={disabled} onClick={() => setDraft(d => ({ ...d, explanations: d.explanations.filter(x => x.id !== e.id) }))}>Retirer</button></li>; })}</ul> : <p className={styles.muted}>Aucune explication : l’écart éventuel reste « non expliqué ».</p>}
    <div className={styles.fields}>
      <label>Identifiant<input value={line.id} disabled={disabled} pattern="[A-Za-z0-9._\-]{1,40}" onChange={e => setLine(l => ({ ...l, id: e.target.value.trim() }))} placeholder="CREDIT-T1"/></label>
      <label>Nature<select value={line.kind} disabled={disabled} onChange={e => setLine(l => ({ ...l, kind: e.target.value as VatExplanationKind }))}>{VAT_EXPLANATION_KINDS.map(k => <option key={k} value={k}>{VAT_EXPLANATION_LABELS[k]}</option>)}</select></label>
      <label>Libellé<input value={line.label} disabled={disabled} onChange={e => setLine(l => ({ ...l, label: e.target.value }))}/></label>
      <label>Montant signé (EUR)<input value={line.amount} disabled={disabled} inputMode="decimal" aria-invalid={!!line.amount && amount === null} onChange={e => setLine(l => ({ ...l, amount: e.target.value }))} placeholder="-100,00"/></label>
      <label>Pièce citée<select value={line.citation} disabled={disabled} onChange={e => setLine(l => ({ ...l, citation: e.target.value }))}><option value="">Choisir…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    </div>
    <button type="button" disabled={disabled || !lineValid} onClick={() => { setDraft(d => ({ ...d, explanations: [...d.explanations, { id: line.id, label: line.label.trim(), kind: line.kind, amountCents: amount!, citation: parseKey(line.citation)! }] })); setLine({ id: "", label: "", kind: "credit_carried", amount: "", citation: "" }); }}>Ajouter l’explication au brouillon</button>
    <div className={styles.actions}>
      {!frozen ? <button type="button" className={styles.primary} disabled={disabled} onClick={() => onFreeze(draft)}>Figer les sources, la population et le profil</button>
        : <button type="button" className={styles.primary} disabled={disabled} onClick={() => onConfigure(draft)}>Enregistrer profil et explications</button>}
      <span className={styles.muted}>{frozen ? "Une nouvelle exécution sera nécessaire." : "Sources figées : " + frozenSources.length + " version(s) courante(s) de la période."}</span>
    </div>
  </section>;
}

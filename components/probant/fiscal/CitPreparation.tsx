"use client";
import { useEffect, useMemo, useState } from "react";
import type { CitDraft, CitWork } from "@/lib/workpapers/fiscal-cit-contract";
import { CIT_BASIS_LABELS, CIT_CATEGORIES, CIT_CATEGORY_LABELS, CIT_GROUP_STATUSES, CIT_REGIMES, CIT_TREATMENT_LABELS, CIT_TREATMENTS, type CitCategory } from "@/lib/workpapers/fiscal-labels";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { citableOptions } from "./FiscalPreparation";
import { cents, dateFr, parseEurInput } from "./format";
import type { FiscalView } from "./types";
import styles from "../cash/cash.module.css";
import fx from "./fiscal.module.css";

type Cite = { documentId: string; rowId?: string };
const cite = (c: { documentVersionId: string; rowId?: string } | null) => c ? { documentId: c.documentVersionId, ...(c.rowId ? { rowId: c.rowId } : {}) } : null;
const key = (c: Cite | null) => c ? c.documentId + (c.rowId ? "#" + c.rowId : "") : "";
const parseKey = (k: string): Cite | null => { if (!k) return null; const [documentId, rowId] = k.split("#"); return { documentId, ...(rowId ? { rowId } : {}) }; };
const CIT_REGIME_LABELS: Record<string, string> = { standard: "Réel normal (2058-A)", simplified: "Réel simplifié (2033-B)", exempt: "Exonéré (hors périmètre)", unknown: "Inconnu" };
const CIT_GROUP_LABELS: Record<string, string> = { none: "Hors intégration fiscale", member: "Membre d’une intégration (hors périmètre)", parent: "Tête d’intégration (hors périmètre)", unknown: "Inconnu" };
/** Legal sources offered for an adjustment: the corporate income tax sources of the registry, never typed by hand. */
export interface CitSourceOption { sourceId: string; sourceVersionId: string; label: string }
export function citDraftFromWork(w: CitWork): CitDraft {
  const { status: _s, confirmedBy: _b, confirmedAt: _a, evidence, ...profile } = w.profile; void _s; void _b; void _a;
  return { formVintage: w.formVintage, resultBasis: w.resultBasis, profile: { ...profile, evidence: cite(evidence) },
    adjustments: w.adjustments.map(({ authorId: _x, at: _y, citation, ...a }) => { void _x; void _y; return { ...a, citation: cite(citation)! }; }) };
}
export function CitPreparation({ run, view, busy, editable, frozenSources, sources, onFreeze, onConfigure }: { run: WorkpaperRun; view: FiscalView; busy: boolean; editable: boolean; frozenSources: string[]; sources: CitSourceOption[]; onFreeze(draft: CitDraft): void; onConfigure(draft: CitDraft): void }) {
  const work = run.fiscalWork as CitWork, frozen = !!run.population;
  const [draft, setDraft] = useState<CitDraft>(() => citDraftFromWork(work));
  const [line, setLine] = useState({ id: "", label: "", category: "explicit_non_deductible" as CitCategory, direction: "reintegration" as "reintegration" | "deduction", amount: "", treatment: "documents_declared" as typeof CIT_TREATMENTS[number], source: "", citation: "" });
  useEffect(() => { setDraft(citDraftFromWork(work)); }, [work]);
  const options = useMemo(() => citableOptions(view, frozenSources), [view, frozenSources]);
  const amount = parseEurInput(line.amount), positive = amount !== null && !amount.startsWith("-") && amount !== "0";
  const taxCount = draft.adjustments.filter(a => a.category === "accounted_tax").length;
  // Mirrors the server guard so the preparer sees the refusal before sending; the server decides.
  const doubleTax = line.category === "accounted_tax" && (taxCount > 0 || draft.resultBasis === "before_tax" || line.direction !== "reintegration");
  const lineValid = /^[A-Za-z0-9._-]{1,40}$/.test(line.id) && !!line.label.trim() && positive && !!line.citation && !draft.adjustments.some(a => a.id === line.id) && !doubleTax && (line.treatment === "documents_declared" || !!line.source);
  const set = (profile: Partial<CitDraft["profile"]>) => setDraft(d => ({ ...d, profile: { ...d.profile, ...profile } }));
  const disabled = busy || !editable;
  const sourceOf = (v: string) => { const s = sources.find(o => o.sourceVersionId === v); return s ? { sourceId: s.sourceId, sourceVersionId: s.sourceVersionId, locator: s.label } : null; };
  return <section className={styles.card} aria-labelledby="fx-citprep-title">
    <header><h2 id="fx-citprep-title">Préparation IS : profil confirmé, base et retraitements documentés</h2><span className={styles.muted}>{frozen ? "Sources figées : une modification efface le résultat et la revue" : "Les sources courantes de l’exercice seront figées"}</span></header>
    <p className={styles.muted}>Exercice {dateFr(work.period.startDate)} → {dateFr(work.period.endDate)} (identifie la feuille)</p>
    <div className={styles.fields}>
      <label>Millésime de la liasse<input type="number" min={2000} max={2200} value={draft.formVintage} disabled={disabled} onChange={e => setDraft(d => ({ ...d, formVintage: Number(e.target.value) }))}/></label>
      <label>Régime d’imposition<select value={draft.profile.regime} disabled={disabled} onChange={e => set({ regime: e.target.value as CitDraft["profile"]["regime"] })}>{CIT_REGIMES.map(r => <option key={r} value={r}>{CIT_REGIME_LABELS[r]}</option>)}</select></label>
      <label>Intégration fiscale<select value={draft.profile.groupStatus} disabled={disabled} onChange={e => set({ groupStatus: e.target.value as CitDraft["profile"]["groupStatus"] })}>{CIT_GROUP_STATUSES.map(r => <option key={r} value={r}>{CIT_GROUP_LABELS[r]}</option>)}</select></label>
      <label>Chiffre d’affaires HT (EUR, vide = inconnu)<input inputMode="decimal" value={draft.profile.turnoverCents === null ? "" : (Number(draft.profile.turnoverCents) / 100).toString().replace(".", ",")} disabled={disabled}
        onChange={e => { const c = e.target.value.trim() ? parseEurInput(e.target.value) : null; if (c === null || !c.startsWith("-")) set({ turnoverCents: e.target.value.trim() ? c : null }); }}/></label>
      <label>Capital<select value={draft.profile.capitalPaid} disabled={disabled} onChange={e => set({ capitalPaid: e.target.value as CitDraft["profile"]["capitalPaid"] })}><option value="unknown">Libération inconnue</option><option value="fully_paid">Entièrement libéré</option><option value="partially_paid">Partiellement libéré</option></select></label>
      <label>Détention par des personnes physiques (%, vide = inconnue)<input inputMode="decimal" value={draft.profile.ownershipBasisPoints === null ? "" : String(draft.profile.ownershipBasisPoints / 100).replace(".", ",")} disabled={disabled}
        onChange={e => { const v = e.target.value.trim().replace(",", "."); const n = Math.round(Number(v) * 100); set({ ownershipBasisPoints: !v ? null : Number.isFinite(n) && n >= 0 && n <= 10000 ? n : draft.profile.ownershipBasisPoints }); }}/></label>
      <label>Pièce confirmant le profil<select value={key(draft.profile.evidence)} disabled={disabled} onChange={e => set({ evidence: parseKey(e.target.value) })}><option value="">Aucune — profil non confirmé</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    </div>
    <p className={styles.muted}>Profil {work.profile.status === "confirmed" ? <>confirmé par <strong>{work.profile.confirmedBy}</strong> le {dateFr(work.profile.confirmedAt!.slice(0, 10))} · {work.profile.evidence?.fileName}</> : <strong>non confirmé</strong>} — une condition non renseignée laisse le taux réduit non appliqué et l’impôt estimé.</p>
    <fieldset className={styles.fields}><legend>Base du pont fiscal documenté</legend>
      {(["after_tax", "before_tax"] as const).map(b => <label key={b} className={styles.check}><input type="radio" name="fx-basis" value={b} checked={draft.resultBasis === b} disabled={disabled} onChange={() => setDraft(d => ({ ...d, resultBasis: b }))}/>{CIT_BASIS_LABELS[b]}</label>)}
    </fieldset>
    <h3>Retraitements documentés</h3>
    {draft.adjustments.length ? <ul className={fx.explanations}>{draft.adjustments.map(a => { const saved = work.adjustments.find(x => x.id === a.id); return <li key={a.id}>
      <span><strong>{a.id}</strong> · {CIT_CATEGORY_LABELS[a.category]} · {a.direction === "reintegration" ? "réintégration" : "déduction"} — {a.label}</span><span className={styles.money}>{cents(a.amountCents)}</span>
      <span className={styles.muted}>{CIT_TREATMENT_LABELS[a.treatment]} · {saved ? saved.citation.fileName + (saved.citation.row ? " · ligne " + saved.citation.row : "") + " · " + saved.authorId : "À enregistrer"}</span>
      <button type="button" disabled={disabled} onClick={() => setDraft(d => ({ ...d, adjustments: d.adjustments.filter(x => x.id !== a.id) }))}>Retirer</button></li>; })}</ul> : <p className={styles.muted}>Aucun retraitement documenté.</p>}
    <div className={styles.fields}>
      <label>Identifiant<input value={line.id} disabled={disabled} pattern="[A-Za-z0-9._\-]{1,40}" onChange={e => setLine(l => ({ ...l, id: e.target.value.trim() }))} placeholder="AMENDE"/></label>
      <label>Nature<select value={line.category} disabled={disabled} onChange={e => setLine(l => ({ ...l, category: e.target.value as CitCategory }))}>{CIT_CATEGORIES.map(c => <option key={c} value={c}>{CIT_CATEGORY_LABELS[c]}</option>)}</select></label>
      <label>Sens<select value={line.direction} disabled={disabled} onChange={e => setLine(l => ({ ...l, direction: e.target.value as "reintegration" | "deduction" }))}><option value="reintegration">Réintégration</option><option value="deduction">Déduction</option></select></label>
      <label>Libellé<input value={line.label} disabled={disabled} onChange={e => setLine(l => ({ ...l, label: e.target.value }))}/></label>
      <label>Montant (EUR, positif)<input value={line.amount} disabled={disabled} inputMode="decimal" aria-invalid={!!line.amount && !positive} onChange={e => setLine(l => ({ ...l, amount: e.target.value }))} placeholder="1 000,00"/></label>
      <label>Traitement<select value={line.treatment} disabled={disabled} onChange={e => setLine(l => ({ ...l, treatment: e.target.value as typeof l.treatment }))}>{CIT_TREATMENTS.map(t => <option key={t} value={t}>{CIT_TREATMENT_LABELS[t]}</option>)}</select></label>
      <label>Source du registre{line.treatment === "proposed_correction" ? " (requise)" : " (facultative)"}<select value={line.source} disabled={disabled} onChange={e => setLine(l => ({ ...l, source: e.target.value }))}><option value="">Aucune</option>{sources.map(s => <option key={s.sourceVersionId} value={s.sourceVersionId}>{s.label}</option>)}</select></label>
      <label>Pièce citée<select value={line.citation} disabled={disabled} onChange={e => setLine(l => ({ ...l, citation: e.target.value }))}><option value="">Choisir…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    </div>
    {doubleTax && <p className={styles.notice} role="status">Double ajustement d’IS : un seul retraitement d’IS comptabilisé est admis, en réintégration, et aucun sur une base avant impôt.</p>}
    <button type="button" disabled={disabled || !lineValid} onClick={() => { setDraft(d => ({ ...d, adjustments: [...d.adjustments, { id: line.id, label: line.label.trim(), category: line.category, direction: line.direction, amountCents: amount!, treatment: line.treatment, legalSource: sourceOf(line.source), citation: parseKey(line.citation)! }] })); setLine(l => ({ ...l, id: "", label: "", amount: "", citation: "" })); }}>Ajouter le retraitement au brouillon</button>
    <div className={styles.actions}>
      {!frozen ? <button type="button" className={styles.primary} disabled={disabled} onClick={() => onFreeze(draft)}>Figer les sources, la population et le profil</button>
        : <button type="button" className={styles.primary} disabled={disabled} onClick={() => onConfigure(draft)}>Enregistrer profil, base et retraitements</button>}
      <span className={styles.muted}>{frozen ? "Une nouvelle exécution sera nécessaire." : "Sources figées : " + frozenSources.length + " version(s) courante(s) de l’exercice."}</span>
    </div>
  </section>;
}

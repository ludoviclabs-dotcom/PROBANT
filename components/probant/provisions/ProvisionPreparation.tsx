"use client";
import { useMemo, useState } from "react";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { provisionDraftFromWork, type ProvisionDraft } from "@/lib/workpapers/provision-contract";
import { SOURCE_LABELS, type ProvisionView } from "./format";
import styles from "../cash/cash.module.css";
import pv from "./provisions.module.css";

/** Citable pieces of the given sources: whole documents, and each row of the approved pieces (labels as the server returned them). */
export function citableOptions(view: ProvisionView, importIds: string[]) {
  return view.imports.filter(b => importIds.includes(b.id)).flatMap(b => {
    const label = String(b.mapping.provisions?.labelColumn ?? "");
    return [{ value: b.document.id, label: SOURCE_LABELS[b.document.documentType] + " — " + b.document.fileName + " (document entier)" },
      ...(b.document.documentType === "pv_support" ? b.rows.map(r => ({ value: b.document.id + "#" + r.id, label: "Pièce " + (r.normalized?.key ?? "?") + " — " + (r.original[label] ?? "") + " (ligne " + r.locator.row + ")" })) : [])];
  });
}
export const parseCitation = (k: string) => { const [documentId, rowId] = k.split("#"); return { documentId, ...(rowId ? { rowId } : {}) }; };
interface Props { run: WorkpaperRun; view: ProvisionView; busy: boolean; editable: boolean; frozenSources: string[]; onFreeze(draft: ProvisionDraft): void; onConfigure(draft: ProvisionDraft): void }
/** The preparer's statement on the lawyers' information (NEP 501 §§ 07-08): cited piece, or explicit reason. Nothing else is typed. */
export function ProvisionPreparation({ run, view, busy, editable, frozenSources, onFreeze, onConfigure }: Props) {
  const initial = run.provisionWork ? provisionDraftFromWork(run.provisionWork) : null;
  const [status, setStatus] = useState<"obtained" | "not_obtained" | "">(initial?.lawyers.status ?? "");
  const [citation, setCitation] = useState(initial?.lawyers.status === "obtained" ? initial.lawyers.citation.documentId + (initial.lawyers.citation.rowId ? "#" + initial.lawyers.citation.rowId : "") : "");
  const [reason, setReason] = useState(initial?.lawyers.status === "not_obtained" ? initial.lawyers.reason : "");
  const options = useMemo(() => citableOptions(view, frozenSources), [view, frozenSources]);
  const draft: ProvisionDraft | null = status === "obtained" && citation ? { lawyers: { status, citation: parseCitation(citation) } } : status === "not_obtained" && reason.trim().length >= 10 ? { lawyers: { status, reason: reason.trim() } } : null;
  const frozen = !!run.population, changed = !!draft && JSON.stringify(draft) !== JSON.stringify(initial);
  const w = run.provisionWork;
  return <section className={styles.card} aria-labelledby="pv-prep-title"><header><h2 id="pv-prep-title">Préparation : informations des avocats</h2>
    <span className={styles.muted}>{w ? "Configurée par " + w.configuredBy + (w.lawyers.status === "obtained" ? " · citant " + w.lawyers.citation.fileName + (w.lawyers.citation.row ? " ligne " + w.lawyers.citation.row : "") : " · non obtenues") : "Non configurée"}</span></header>
    {w && <p><strong>Déclaration retenue :</strong> {w.lawyers.status === "obtained" ? "informations des avocats obtenues et citées." : "informations non obtenues — motif : " + w.lawyers.reason}</p>}
    <p className={styles.muted}>Sur les procès et litiges, la direction est invitée à obtenir des informations de ses avocats (NEP 501 §§ 07-08, norme professionnelle). La feuille consigne la pièce ou le motif ; elle n’en déduit aucune issue.</p>
    <fieldset className={pv.choice} disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0 }}><legend className={styles.srOnly}>Informations des avocats</legend>
      <label className={pv.radio}><input type="radio" name="pv-lawyers" checked={status === "obtained"} onChange={() => setStatus("obtained")}/>Obtenues — citer la pièce figée</label>
      {status === "obtained" && <label>Pièce citée (version figée)<select value={citation} onChange={ev => setCitation(ev.target.value)}><option value="">Choisir…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}
      <label className={pv.radio}><input type="radio" name="pv-lawyers" checked={status === "not_obtained"} onChange={() => setStatus("not_obtained")}/>Non obtenues — motif obligatoire</label>
      {status === "not_obtained" && <label>Motif (dix caractères au moins)<textarea value={reason} onChange={ev => setReason(ev.target.value)}/></label>}
    </fieldset>
    {editable && <div className={styles.actions}>
      {!frozen && <button type="button" className={styles.primary} disabled={busy || !draft || frozenSources.length < 2} onClick={() => draft && onFreeze(draft)}>Figer les sources et la population</button>}
      {frozen && <button type="button" disabled={busy || !draft || !changed} onClick={() => draft && onConfigure(draft)}>Modifier la déclaration (invalide le calcul et la revue)</button>}
      {!frozen && frozenSources.length < 2 && <span className={styles.muted}>Approuvez au moins le registre et le grand livre.</span>}
    </div>}
  </section>;
}

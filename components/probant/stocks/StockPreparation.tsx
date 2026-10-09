"use client";
import { useMemo, useState } from "react";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { ST_SAME_DAY, ST_SAME_DAY_LABELS, stockDraftFromWork, type StockDraft } from "@/lib/workpapers/stock-contract";
import { SOURCE_LABELS, type StockView } from "./format";
import styles from "../cash/cash.module.css";
import st from "./stocks.module.css";

/** Citable pieces of the given sources: whole documents, and each row of the approved pieces. */
export function citableOptions(view: StockView, importIds: string[]) {
  return view.imports.filter(b => importIds.includes(b.id)).flatMap(b => {
    const label = b.mapping.stocks?.labelColumn ?? "";
    return [{ value: b.document.id, label: SOURCE_LABELS[b.document.documentType] + " — " + b.document.fileName + " (document entier)" },
      ...(b.document.documentType === "st_support" ? b.rows.map(r => ({ value: b.document.id + "#" + r.id, label: "Pièce " + (r.normalized?.key ?? "?") + " — " + (r.original[label] ?? "") + " (ligne " + r.locator.row + ")" })) : [])];
  });
}
export const parseCitation = (k: string) => { const [documentId, rowId] = k.split("#"); return { documentId, ...(rowId ? { rowId } : {}) }; };
interface Props { run: WorkpaperRun; view: StockView; busy: boolean; editable: boolean; frozenSources: string[]; onFreeze(draft: StockDraft): void; onConfigure(draft: StockDraft): void }
/** The only human input of the quantity test: the same-day convention, cited from the inventory instructions. */
export function StockPreparation({ run, view, busy, editable, frozenSources, onFreeze, onConfigure }: Props) {
  const initial = run.stockWork ? stockDraftFromWork(run.stockWork) : null;
  const [sameDay, setSameDay] = useState<StockDraft["sameDay"] | "">(initial?.sameDay ?? "");
  const [citation, setCitation] = useState(initial ? initial.instructions.documentId + (initial.instructions.rowId ? "#" + initial.instructions.rowId : "") : "");
  const options = useMemo(() => citableOptions(view, frozenSources), [view, frozenSources]);
  const draft = sameDay && citation ? { sameDay, instructions: parseCitation(citation) } as StockDraft : null;
  const frozen = !!run.population;
  const changed = !!draft && JSON.stringify(draft) !== JSON.stringify(initial);
  return <section className={styles.card} aria-labelledby="st-prep-title"><header><h2 id="st-prep-title">Préparation : convention du jour de comptage</h2>
    <span className={styles.muted}>{run.stockWork ? "Configurée par " + run.stockWork.configuredBy + " · citant " + run.stockWork.instructions.fileName + (run.stockWork.instructions.row ? " ligne " + run.stockWork.instructions.row : "") : "Non configurée"}</span></header>
    {run.stockWork && <p><strong>Convention retenue :</strong> {ST_SAME_DAY_LABELS[run.stockWork.sameDay]}.</p>}
    <p className={styles.muted}>Un mouvement daté du jour du comptage peut précéder ou suivre le comptage. Ce choix est un paramètre du préparateur, justifié par les instructions d’inventaire citées ; il n’est jamais présumé.</p>
    <fieldset className={st.convention} disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0 }}><legend className={styles.srOnly}>Convention du jour de comptage</legend>
      {ST_SAME_DAY.map(k => <label key={k} className={st.radio}><input type="radio" name="st-same-day" value={k} checked={sameDay === k} onChange={() => setSameDay(k)}/>{ST_SAME_DAY_LABELS[k]}</label>)}
      <label>Instructions d’inventaire citées (version figée)<select value={citation} onChange={e => setCitation(e.target.value)}><option value="">Choisir…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    </fieldset>
    {editable && <div className={styles.actions}>
      {!frozen && <button type="button" className={styles.primary} disabled={busy || !draft || frozenSources.length < 2} onClick={() => draft && onFreeze(draft)}>Figer les sources et la population</button>}
      {frozen && <button type="button" disabled={busy || !draft || !changed} onClick={() => draft && onConfigure(draft)}>Modifier la convention (invalide le calcul et la revue)</button>}
      {!frozen && frozenSources.length < 2 && <span className={styles.muted}>Approuvez au moins la feuille de comptage et l’état théorique.</span>}
    </div>}
  </section>;
}

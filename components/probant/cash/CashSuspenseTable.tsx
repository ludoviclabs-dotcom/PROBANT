"use client";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { cents } from "@/lib/canonical-model/money";
import type { ClearanceStatus } from "@/lib/workpapers/cash";
import { CashStatusBadge, STATUS_ORDER } from "./CashStatus";
import { CASH_STATUS_TEXT } from "@/lib/workpapers/cash-reconciliation";
import { dateFr, eur, KIND_LABELS, KIND_PLURALS, plural } from "./format";
import type { CashKind, DisplayItem } from "./types";
import styles from "./cash.module.css";

export interface SuspenseTableHandle { focusFirstRow(): boolean; focusRow(itemId: string): boolean }
type Sort = "date" | "age" | "amount";
interface Props { items: DisplayItem[]; kind: CashKind | null; status: ClearanceStatus | "none" | null; sort: Sort; selectedId: string | null; draftNotes: Record<string, string[]>;
  onKind(kind: CashKind | null): void; onStatus(status: ClearanceStatus | "none" | null): void; onSort(sort: Sort): void; onOpen(itemId: string): void; onBackToBridge(): void }
/** Suspense items with explanation, age, document and clearance; keyboard: Enter opens the source panel, Escape returns to the bridge. */
export const CashSuspenseTable = forwardRef<SuspenseTableHandle, Props>(function CashSuspenseTable({ items, kind, status, sort, selectedId, draftNotes, onKind, onStatus, onSort, onOpen, onBackToBridge }, ref) {
  const rows = useRef<Record<string, HTMLTableRowElement | null>>({});
  const visible = useMemo(() => items.filter(i => (!kind || i.kind === kind) && (!status || (status === "none" ? i.status === null : i.status === status)))
    .sort((a, b) => sort === "amount" ? Number(cents(b.amount) < 0n ? -cents(b.amount) : cents(b.amount)) - Number(cents(a.amount) < 0n ? -cents(a.amount) : cents(a.amount)) : sort === "age" ? (b.ageDays ?? -1) - (a.ageDays ?? -1) || a.itemId.localeCompare(b.itemId) : a.date.localeCompare(b.date) || a.itemId.localeCompare(b.itemId)), [items, kind, status, sort]);
  useImperativeHandle(ref, () => ({
    focusFirstRow: () => { const first = visible[0]; if (!first) return false; rows.current[first.itemId]?.focus(); return true; },
    focusRow: id => { const row = rows.current[id]; row?.focus(); return !!row; },
  }), [visible]);
  const statuses = STATUS_ORDER.filter(s => items.some(i => i.status === s));
  return <div>
    <div className={styles.filters} role="group" aria-label="Filtres des suspens">
      {([null, "receipt_in_transit", "outstanding_payment", "other"] as (CashKind | null)[]).map(k => <button key={k ?? "all"} type="button" aria-pressed={kind === k} onClick={() => onKind(k)}>{k ? KIND_LABELS[k] : "Toutes natures"} · {k ? items.filter(i => i.kind === k).length : items.length}</button>)}
      <label className={styles.srOnly} htmlFor="cash-status-filter">Filtrer par statut</label>
      <select id="cash-status-filter" value={status ?? ""} onChange={e => onStatus((e.target.value || null) as ClearanceStatus | "none" | null)}>
        <option value="">Tous statuts</option>{statuses.map(s => <option key={s} value={s}>{CASH_STATUS_TEXT[s].label}</option>)}{items.some(i => i.status === null) && <option value="none">Non calculé</option>}
      </select>
      <label className={styles.srOnly} htmlFor="cash-sort">Trier</label>
      <select id="cash-sort" value={sort} onChange={e => onSort(e.target.value as Sort)}><option value="date">Tri : date du suspens</option><option value="age">Tri : âge décroissant</option><option value="amount">Tri : montant absolu décroissant</option></select>
      <button type="button" onClick={onBackToBridge}>Retour au pont</button>
    </div>
    <p role="status" aria-live="polite" className={styles.muted}>{plural(visible.length, "suspens affiché", "suspens affichés")}{kind ? " — " + KIND_PLURALS[kind].toLowerCase() : ""}{status ? " — statut filtré" : ""}. Entrée : ouvrir la ligne et sa source ; Échap : revenir au pont.</p>
    <div className={styles.tableScroll} role="region" aria-label="Suspens à la clôture — défilement clavier" tabIndex={0}>
      <table className={styles.suspense}>
        <caption>Suspens de l’ERB à la clôture et leur apurement postérieur — montants signés en EUR ; la clôture n’est jamais réécrite</caption>
        {/* Status and amounts first: the critical columns stay visible without horizontal scrolling. */}
        <thead><tr><th scope="col">Suspens</th><th scope="col">Statut et sens</th><th scope="col" className={styles.money}>Montant</th><th scope="col" className={styles.money}>Apuré / reste</th><th scope="col">Date · âge</th><th scope="col">Explication (ERB)</th><th scope="col">Pièce</th></tr></thead>
        <tbody>
          {visible.map(i => <tr key={i.itemId} ref={el => { rows.current[i.itemId] = el; }} tabIndex={0} aria-selected={selectedId === i.itemId} data-item={i.itemId}
            aria-label={`${i.itemId}, ${KIND_LABELS[i.kind]}, ${eur(i.amount)}, ${i.status ? CASH_STATUS_TEXT[i.status].label : "non calculé"}`}
            onClick={() => onOpen(i.itemId)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(i.itemId); } if (e.key === "Escape") { e.preventDefault(); onBackToBridge(); } }}>
            <th scope="row">{i.itemId}<span className={styles.meaning}>{KIND_LABELS[i.kind]}</span></th>
            <td className={styles.statusCell}><CashStatusBadge status={i.status}/><span className={styles.meaning}>{i.statusMeaning}{i.exclusionReason ? " Motif : " + i.exclusionReason : ""}</span>{draftNotes[i.itemId]?.map(n => <span key={n} className={styles.draftTag}>{n}</span>)}</td>
            <td className={styles.money}>{eur(i.amount)}</td>
            <td className={styles.money}>{i.settledAmount ? eur(i.settledAmount) : "—"}<span className={styles.meaning}>reste {i.remainingAmount ? eur(i.remainingAmount) : "non calculé"}</span></td>
            <td>{dateFr(i.date)}<span className={styles.meaning}>{i.ageDays === null ? "âge à l’exécution" : plural(i.ageDays, "jour") + " à la clôture"}</span></td>
            <td>{i.explanation || <span className={styles.muted}>Aucune explication</span>}</td>
            <td>{i.pieceRef || <span className={styles.muted}>Non renseignée</span>}</td>
          </tr>)}
          {!visible.length && <tr><td colSpan={7}>Aucun suspens dans ce filtre. L’absence de ligne n’est pas une preuve d’exhaustivité de l’ERB.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
});

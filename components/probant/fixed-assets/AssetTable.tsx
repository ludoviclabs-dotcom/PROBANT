"use client";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { cents } from "@/lib/canonical-model/money";
import { FA_RECALC_TEXT, type FixedAssetUnitResult } from "@/lib/workpapers/fixed-asset-review";
import type { FaTable } from "@/lib/workpapers/fixed-asset-sources";
import { eur, plural, STATUS_LABELS, TABLE_LABELS } from "./format";
import type { BridgeFilter } from "./types";
import styles from "../cash/cash.module.css";
import fa from "./fixed-assets.module.css";

export interface AssetTableHandle { focusFirstRow(): boolean; focusRow(unitId: string): boolean }
export type AssetSort = "unit" | "difference" | "closing";
const FILTER_LABELS: Record<Exclude<BridgeFilter, null>, string> = { addition: "avec entrées", disposal: "avec sorties", reversal: "avec reprises", reclassification: "avec reclassements", difference: "en écart ou incomplets" };
const abs = (v: bigint) => v < 0n ? -v : v;
/** Matches a unit to a bridge step using the server values only. */
export function matchesFilter(u: FixedAssetUnitResult, table: FaTable, filter: BridgeFilter) {
  const t = u.tables[table];
  if (!filter) return true;
  if (t.status !== "computed") return filter === "difference" && t.status === "incomplete";
  if (filter === "difference") return t.difference.kind !== "known" || cents(t.difference.value) !== 0n;
  const value = filter === "addition" ? t.additions : filter === "disposal" ? t.disposals : filter === "reversal" ? t.reversals : t.reclassifications;
  return cents(value) !== 0n;
}
interface Props { units: FixedAssetUnitResult[]; table: FaTable; filter: BridgeFilter; sort: AssetSort; selectedId: string | null;
  onFilter(filter: BridgeFilter): void; onSort(sort: AssetSort): void; onOpen(unitId: string): void; onBackToBridge(): void }
/** Asset / component table of one family and one table; Enter opens the detail, Escape returns to the bridge. */
export const AssetTable = forwardRef<AssetTableHandle, Props>(function AssetTable({ units, table, filter, sort, selectedId, onFilter, onSort, onOpen, onBackToBridge }, ref) {
  const rows = useRef<Record<string, HTMLTableRowElement | null>>({});
  const inScope = units.filter(u => u.inScope), excluded = units.filter(u => !u.inScope);
  const visible = useMemo(() => inScope.filter(u => matchesFilter(u, table, filter)).sort((a, b) => {
    const ta = a.tables[table], tb = b.tables[table];
    if (sort === "difference") { const d = (t: typeof ta) => t.status === "computed" && t.difference.kind === "known" ? abs(cents(t.difference.value)) : -1n; const x = d(tb) - d(ta); return x > 0n ? 1 : x < 0n ? -1 : a.unitId.localeCompare(b.unitId); }
    if (sort === "closing") { const c = (t: typeof ta) => t.status === "computed" ? cents(t.closing) : -1n; const x = c(tb) - c(ta); return x > 0n ? 1 : x < 0n ? -1 : a.unitId.localeCompare(b.unitId); }
    return a.unitId.localeCompare(b.unitId);
  }), [inScope, table, filter, sort]);
  useImperativeHandle(ref, () => ({
    focusFirstRow: () => { const first = visible[0]; if (!first) return false; rows.current[first.unitId]?.focus(); return true; },
    focusRow: id => { const row = rows.current[id]; row?.focus(); return !!row; },
  }), [visible]);
  const showReversal = table === "impairment", showRecalc = table === "amortization", columns = 8 + (showReversal ? 1 : 0) + (showRecalc ? 1 : 0);
  return <div>
    <div className={styles.filters} role="group" aria-label="Filtres des actifs">
      <button type="button" aria-pressed={!filter} onClick={() => onFilter(null)}>Tous les actifs · {inScope.length}</button>
      {filter && <button type="button" aria-pressed="true" onClick={() => onFilter(null)}>Filtre : {FILTER_LABELS[filter]} — retirer</button>}
      {!filter && <button type="button" aria-pressed={false} onClick={() => onFilter("difference")}>En écart ou incomplets · {inScope.filter(u => matchesFilter(u, table, "difference")).length}</button>}
      <label className={styles.srOnly} htmlFor="fa-sort">Trier</label>
      <select id="fa-sort" value={sort} onChange={e => onSort(e.target.value as AssetSort)}><option value="unit">Tri : actif</option><option value="difference">Tri : écart absolu décroissant</option><option value="closing">Tri : clôture décroissante</option></select>
      <button type="button" onClick={onBackToBridge}>Retour au pont</button>
    </div>
    <p role="status" aria-live="polite" className={styles.muted}>{plural(visible.length, "actif affiché", "actifs affichés")}{filter ? " — " + FILTER_LABELS[filter] : ""}. Entrée : ouvrir l’actif et sa chronologie ; Échap : revenir au pont.</p>
    <div className={styles.tableScroll} role="region" aria-label={"Actifs et composants — " + TABLE_LABELS[table] + " — défilement clavier"} tabIndex={0}>
      <table className={fa.assets}>
        <caption>{TABLE_LABELS[table]} par actif ou composant — montants en EUR dans le sens du tableau ; écart = clôture observée − attendue</caption>
        <thead><tr><th scope="col">Actif / composant</th><th scope="col" className={styles.money}>Écart</th><th scope="col" className={styles.money}>Ouverture</th><th scope="col" className={styles.money}>Entrées</th><th scope="col" className={styles.money}>Sorties</th>
          {showReversal && <th scope="col" className={styles.money}>Reprises</th>}<th scope="col" className={styles.money}>Reclass.</th><th scope="col" className={styles.money}>Attendu</th><th scope="col" className={styles.money}>Clôture</th>{showRecalc && <th scope="col">Recalcul</th>}</tr></thead>
        <tbody>
          {visible.map(u => {
            const t = u.tables[table], computed = t.status === "computed" ? t : null;
            const diff = computed ? (computed.difference.kind === "known" ? (cents(computed.difference.value) === 0n ? "aucun écart" : "à expliquer") : computed.difference.reason) : "non calculé";
            return <tr key={u.unitId} ref={el => { rows.current[u.unitId] = el; }} tabIndex={0} aria-selected={selectedId === u.unitId} data-unit={u.unitId}
              aria-label={`${u.unitId}, ${u.label}, ${STATUS_LABELS[u.status]}, écart ${computed && computed.difference.kind === "known" ? eur(computed.difference.value, { signed: true }) : "non calculé"}`}
              onClick={() => onOpen(u.unitId)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(u.unitId); } if (e.key === "Escape") { e.preventDefault(); onBackToBridge(); } }}>
              <th scope="row">{u.unitId}<span className={styles.meaning}>{u.label} · <span className={fa.chip} data-status={u.status}>{STATUS_LABELS[u.status]}</span></span></th>
              <td className={styles.money} data-tone={computed && computed.difference.kind === "known" && cents(computed.difference.value) !== 0n ? "danger" : undefined}>{computed && computed.difference.kind === "known" ? eur(computed.difference.value, { signed: true }) : "—"}<span className={styles.meaning}>{diff}</span></td>
              {computed ? <>
                <td className={styles.money}>{eur(computed.opening)}</td><td className={styles.money}>{eur(computed.additions)}</td><td className={styles.money}>{eur(computed.disposals)}</td>
                {showReversal && <td className={styles.money}>{eur(computed.reversals)}</td>}<td className={styles.money}>{eur(computed.reclassifications, { signed: true })}</td><td className={styles.money}>{eur(computed.expected)}</td><td className={styles.money}>{eur(computed.closing)}</td>
              </> : <td colSpan={6 + (showReversal ? 1 : 0)}>{t.status === "incomplete" ? "Incomplet : " + t.missing.join(" ") : ""}</td>}
              {showRecalc && <td><span className={fa.recalc} data-status={u.recalculation.status}>{FA_RECALC_TEXT[u.recalculation.status].label}</span><span className={styles.meaning}>{u.recalculation.difference.kind === "known" ? "écart " + eur(u.recalculation.difference.value, { signed: true }) : u.recalculation.reason}</span></td>}
            </tr>;
          })}
          {!visible.length && <tr><td colSpan={columns}>Aucun actif dans ce filtre. L’absence de ligne n’est pas une preuve d’exhaustivité du registre.</td></tr>}
          {excluded.map(u => <tr key={u.unitId} className={fa.excluded}><th scope="row">{u.unitId}<span className={styles.meaning}>{u.label}</span></th><td colSpan={columns - 1}>Exclu du test : {u.exclusionReason}</td></tr>)}
        </tbody>
      </table>
    </div>
  </div>;
});

"use client";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { formatCents, formatQuantity, ST_STATUS_KIND, ST_STATUS_LABELS, type StockResult, type StockUnitResult } from "@/lib/workpapers/stock-contract";
import { dateFr, KIND_LABELS, KIND_ORDER, plural, type Kind } from "./format";
import styles from "../cash/cash.module.css";
import st from "./stocks.module.css";

export interface StockFilters { kinds: Kind[]; site: string; lot: string; q: string; view: "grid" | "table" }
export interface StockGridHandle { focusUnit(unitId: string): void }
interface Props { result: StockResult; filters: StockFilters; selected: string | null; onFilters(next: StockFilters): void; onOpen(unitId: string): void }
const ICONS: Record<Kind, React.ReactNode> = {
  ok: <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2"/>,
  quantity: <path d="M2 8h12M8 2v12" fill="none" stroke="currentColor" strokeWidth="2"/>,
  ownership: <path d="M8 2l5 3v4c0 3-2.5 4.5-5 5-2.5-.5-5-2-5-5V5z" fill="none" stroke="currentColor" strokeWidth="1.6"/>,
  blocked: <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="2"/>,
  uncertain: <path d="M6 6a2 2 0 114 0c0 1.5-2 1.5-2 3M8 12.5v.5" fill="none" stroke="currentColor" strokeWidth="1.8"/>,
  apart: <path d="M2 8h12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2"/>,
};
export const KindBadge = ({ status }: { status: StockUnitResult["status"] }) => <span className={st.badge}><svg viewBox="0 0 16 16" aria-hidden="true">{ICONS[ST_STATUS_KIND[status]]}</svg>{ST_STATUS_LABELS[status]}</span>;
const sign = (d: string | null) => d === null ? "none" : d === "0" ? "zero" : d.startsWith("-") ? "neg" : "pos";
/** Grid of cases (one per reference / site / lot) or dense table; every number comes from the server result. */
export const StockGrid = forwardRef<StockGridHandle, Props>(function StockGrid({ result, filters, selected, onFilters, onOpen }, ref) {
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  useImperativeHandle(ref, () => ({ focusUnit: id => buttons.current.get(id)?.focus() }), []);
  const lots = useMemo(() => [...new Set(result.units.map(u => u.lot).filter(Boolean))].sort(), [result]);
  const counts = useMemo(() => Object.fromEntries(KIND_ORDER.map(k => [k, result.units.filter(u => ST_STATUS_KIND[u.status] === k).length])) as Record<Kind, number>, [result]);
  const visible = result.units.filter(u => (!filters.kinds.length || filters.kinds.includes(ST_STATUS_KIND[u.status])) && (!filters.site || u.site === filters.site) && (!filters.lot || u.lot === filters.lot)
    && (!filters.q || (u.reference + " " + u.label + " " + u.lot).toLowerCase().includes(filters.q.toLowerCase())));
  const toggle = (k: Kind) => onFilters({ ...filters, kinds: filters.kinds.includes(k) ? filters.kinds.filter(x => x !== k) : [...filters.kinds, k] });
  // The animation key changes with the filters only: cases re-enter when the question changes, never on a mere refresh.
  const animationKey = JSON.stringify([filters.kinds, filters.site, filters.lot, filters.q]);
  const valueOf = (id: string) => result.valuation?.units.find(x => x.unitId === id) ?? null;
  const tile = (u: StockUnitResult) => {
    const val = valueOf(u.unitId);
    const kind = ST_STATUS_KIND[u.status], max = [u.expectedClosing, u.systemQuantity].filter((x): x is string => x !== null).map(x => Math.abs(Number(x))).reduce((a, b) => Math.max(a, b), 0);
    const width = (q: string | null) => q === null || max === 0 ? 0 : Math.abs(Number(q)) / max;
    return <li key={u.unitId}>
      <button type="button" ref={el => { buttons.current.set(u.unitId, el); }} className={st.tile} data-kind={kind} aria-pressed={selected === u.unitId} onClick={() => onOpen(u.unitId)}
        aria-label={u.reference + (u.lot ? " lot " + u.lot : "") + ", " + u.site + " — " + ST_STATUS_LABELS[u.status] + (u.difference !== null ? ", écart " + formatQuantity(u.difference, u.uom, { signed: true }) : "")}>
        <span className={st.tileTop}><strong>{u.reference}{u.lot ? " · " + u.lot : ""}</strong><span className={st.delta} data-sign={sign(u.difference)}>{u.difference !== null ? formatQuantity(u.difference, null, { signed: true }) : "—"}</span></span>
        <small>{u.label}</small>
        {val?.quantityDifferenceValueCents && val.quantityDifferenceValueCents !== "0" && <span className={st.valueLine}>Écart potentiel {formatCents(val.quantityDifferenceValueCents, { signed: true })}</span>}
        {val?.priceDifferenceCents && val.priceDifferenceCents !== "0" && <span className={st.valueLine}>Écart de prix {formatCents(val.priceDifferenceCents, { signed: true })}</span>}
        {(u.expectedClosing !== null || u.systemQuantity !== null) && <span className={st.meter} aria-hidden="true">
          <span style={{ width: width(u.expectedClosing) * 100 + "%" }}/><span data-kind="system" style={{ width: width(u.systemQuantity) * 100 + "%" }}/></span>}
        <small>{u.expectedClosing !== null ? "Reconstitué " + formatQuantity(u.expectedClosing, u.uom) : u.counted !== null ? "Compté " + formatQuantity(u.counted, u.uoms.count.join("/")) : "Non compté"} · {u.systemQuantity !== null ? "théorique " + formatQuantity(u.systemQuantity, u.uoms.system) : "théorique absent"}</small>
        <KindBadge status={u.status}/>
      </button></li>;
  };
  return <section className={styles.card} aria-labelledby="st-grid-title">
    <header><h2 id="st-grid-title">Quantités par référence / site / lot</h2><span className={styles.muted}>{plural(visible.length, "case affichée", "cases affichées")} sur {result.units.length}</span></header>
    <div className={st.kindBar} role="group" aria-label="Filtrer par nature d’écart">{KIND_ORDER.map(k => <button key={k} type="button" aria-pressed={filters.kinds.includes(k)} onClick={() => toggle(k)} disabled={!counts[k]}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">{ICONS[k]}</svg>{KIND_LABELS[k]} <strong>{counts[k]}</strong></button>)}</div>
    <div className={st.toolbar}>
      <label>Site<select value={filters.site} onChange={e => onFilters({ ...filters, site: e.target.value })}><option value="">Tous les sites</option>{result.sites.map(s => <option key={s.site} value={s.site}>{s.site}{s.visited ? "" : " (non visité)"}</option>)}</select></label>
      <label>Lot<select value={filters.lot} onChange={e => onFilters({ ...filters, lot: e.target.value })}><option value="">Tous les lots</option>{lots.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
      <label>Référence ou libellé<input type="search" value={filters.q} onChange={e => onFilters({ ...filters, q: e.target.value })} placeholder="Ex. REF-A, câble…"/></label>
      <span className={st.views} role="group" aria-label="Présentation"><button type="button" aria-pressed={filters.view === "grid"} onClick={() => onFilters({ ...filters, view: "grid" })}>Cases</button><button type="button" aria-pressed={filters.view === "table"} onClick={() => onFilters({ ...filters, view: "table" })}>Tableau</button></span>
    </div>
    {!visible.length && <p className={styles.muted} role="status">Aucune case pour ces filtres. <button type="button" className={st.link} onClick={() => onFilters({ ...filters, kinds: [], site: "", lot: "", q: "" })}>Effacer les filtres</button></p>}
    {filters.view === "grid" ? result.sites.filter(s => !filters.site || s.site === filters.site).map(s => {
      const units = visible.filter(u => u.site === s.site);
      return units.length > 0 && <section key={s.site + animationKey} className={st.site} aria-label={"Site " + s.site}>
        <div className={st.siteHead}><h3>{s.site}</h3><span className={styles.muted}>{s.visited ? "Comptage du " + dateFr(s.countDate!) : "Site non visité — aucune feuille de comptage"} · {plural(s.countLines, "ligne comptée", "lignes comptées")} · {plural(s.systemLines, "ligne théorique", "lignes théoriques")}</span></div>
        <ul className={st.grid}>{units.map(tile)}</ul></section>;
    }) : <div className={styles.tableScroll} role="region" aria-label="Tableau des quantités — défilement clavier" tabIndex={0}><table className={st.stockTable}>
      <caption>Quantités en unités de comptage ; écart = clôture reconstituée − théorique (négatif : manquant physique). {result.valuation ? "Valeurs en euros au coût documenté : écarts potentiels, non validés." : "Aucune valeur monétaire sans coûts documentés."}</caption>
      <thead><tr><th scope="col">Référence</th><th scope="col">Site</th><th scope="col">Lot</th><th scope="col">Unité</th><th scope="col">Compté</th><th scope="col">Entrées</th><th scope="col">Sorties</th><th scope="col">Clôture reconstituée</th><th scope="col">Théorique</th><th scope="col">Écart</th>
        {result.valuation && <><th scope="col">Coût documenté</th><th scope="col">Valeur reconstituée</th><th scope="col">Valeur théorique</th><th scope="col">Écart valorisé</th><th scope="col">Écart de prix</th></>}<th scope="col">Statut</th></tr></thead>
      <tbody>{visible.map(u => <tr key={u.unitId} className={st.rowKind} data-kind={ST_STATUS_KIND[u.status]} aria-selected={selected === u.unitId}>
        <td><button type="button" className={st.link} onClick={() => onOpen(u.unitId)}>{u.reference}</button></td><td>{u.site}</td><td>{u.lot || "—"}</td><td>{u.uom ?? [...u.uoms.count, u.uoms.system].filter(Boolean).join(" ≠ ")}</td>
        <td className={styles.money}>{formatQuantity(u.counted)}</td><td className={styles.money}>{u.movements.inQty === null ? (u.movements.coverage === "not_needed" ? "0" : "Inconnu") : formatQuantity(u.movements.inQty)}</td>
        <td className={styles.money}>{u.movements.outQty === null ? (u.movements.coverage === "not_needed" ? "0" : "Inconnu") : formatQuantity(u.movements.outQty)}</td>
        <td className={styles.money}>{formatQuantity(u.expectedClosing)}</td><td className={styles.money}>{formatQuantity(u.systemQuantity)}</td>
        <td className={styles.money}><span className={st.delta} data-sign={sign(u.difference)}>{u.difference === null ? "—" : formatQuantity(u.difference, null, { signed: true })}</span></td>
        {result.valuation && (() => { const v = valueOf(u.unitId)!; return <><td className={styles.money}>{v.cost ? formatCents(v.cost.unitCostCents) : v.costStatus === "missing" ? "Non documenté" : v.costStatus === "unit_incompatible" ? "Unité incompatible" : "—"}</td>
          <td className={styles.money}>{v.expectedValueCents === null ? "—" : formatCents(v.expectedValueCents)}</td><td className={styles.money}>{v.systemValueCents === null ? "—" : formatCents(v.systemValueCents)}</td>
          <td className={styles.money}>{v.quantityDifferenceValueCents === null ? "—" : formatCents(v.quantityDifferenceValueCents, { signed: true })}</td><td className={styles.money}>{v.priceDifferenceCents === null ? "—" : formatCents(v.priceDifferenceCents, { signed: true })}</td></>; })()}
        <td><KindBadge status={u.status}/></td></tr>)}</tbody></table></div>}
    <ul className={st.legend} aria-label="Légende">{KIND_ORDER.map(k => <li key={k} data-kind={k}><i aria-hidden="true"/>{KIND_LABELS[k]}</li>)}</ul>
  </section>;
});

/** Net and gross differences per reference: a net total never justifies the individual differences. */
export function CompensationView({ result }: { result: StockResult }) {
  if (!result.references.length) return null;
  return <section className={styles.card} aria-labelledby="st-net-title"><header><h2 id="st-net-title">Total net et écarts bruts par référence</h2><span className={styles.muted}>Même unité de comptage uniquement</span></header>
    <div className={styles.tableScroll} role="region" aria-label="Écarts nets et bruts — défilement clavier" tabIndex={0}><table>
      <thead><tr><th scope="col">Référence</th><th scope="col">Unité</th><th scope="col">Sites / lots</th><th scope="col" style={{ textAlign: "right" }}>Net</th><th scope="col" style={{ textAlign: "right" }}>Brut</th><th scope="col">Lecture</th></tr></thead>
      <tbody>{result.references.map(r => <tr key={r.reference + r.uom}><td>{r.reference}</td><td>{r.uom}</td><td>{r.units}</td><td className={styles.money}>{formatQuantity(r.net, null, { signed: true })}</td><td className={styles.money}>{formatQuantity(r.gross)}</td>
        <td>{r.compensated ? <strong>Écarts compensés : le net masque {formatQuantity(r.gross, r.uom)} d’écarts</strong> : r.gross === "0" ? "Sans écart" : "Écarts de même sens"}</td></tr>)}</tbody></table></div></section>;
}

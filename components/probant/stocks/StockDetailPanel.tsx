"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { formatQuantity, ST_CATEGORY_LABELS, type StockResult, type StockUnitResult } from "@/lib/workpapers/stock-contract";
import { KindBadge } from "./StockGrid";
import { dateFr, unitLabel, type StockView } from "./format";
import styles from "../cash/cash.module.css";
import st from "./stocks.module.css";

export interface StockDetailHandle { focus(): void }
interface Props { unit: StockUnitResult | null; result: StockResult | null; view: StockView; dossierId: string; periodId: string; onReturn(): void }
type Line = { importId: string; rowId: string; documentVersionId: string; fileName: string; row: number | null; key: string; quantity: string; date: string };
/** Inventory → closing bridge of one unit, with its tabular alternative. Bars are positioned on the server quantities only. */
export function StockBridge({ unit }: { unit: StockUnitResult }) {
  const m = unit.movements, counted = unit.counted === null ? null : BigInt(unit.counted), inQ = m.inQty === null ? null : BigInt(m.inQty);
  const back = m.direction === "backward";
  type Step = { label: string; detail: string; from: bigint | null; to: bigint | null; kind: string; value: string };
  const after = counted !== null && inQ !== null ? (back ? counted - inQ : counted + inQ) : null;
  const steps: Step[] = [
    { label: "Compté", detail: unit.countDate ? "Comptage du " + dateFr(unit.countDate) : "Non compté", from: 0n, to: counted, kind: "total", value: formatQuantity(unit.counted, unit.uom) },
    { label: back ? "− Entrées après la clôture" : "+ Entrées jusqu’à la clôture", detail: m.window ? dateFr(m.window.from) + " → " + dateFr(m.window.to) : "Aucune période intercalaire", from: counted, to: after, kind: "receipt", value: m.inQty === null ? (m.coverage === "not_needed" ? "0" : "Inconnu") : formatQuantity(m.inQty, unit.uom, { signed: false }) },
    { label: back ? "+ Sorties après la clôture" : "− Sorties jusqu’à la clôture", detail: m.coverage === "covered" ? "Journal couvrant la période" : m.coverage === "not_needed" ? "Comptage à la clôture" : m.coverage === "missing_journal" ? "Journal absent" : "Couverture insuffisante", from: after, to: unit.expectedClosing === null ? null : BigInt(unit.expectedClosing), kind: "payment", value: m.outQty === null ? (m.coverage === "not_needed" ? "0" : "Inconnu") : formatQuantity(m.outQty, unit.uom) },
    { label: "= Clôture reconstituée", detail: "Méthode interne", from: 0n, to: unit.expectedClosing === null ? null : BigInt(unit.expectedClosing), kind: "total", value: formatQuantity(unit.expectedClosing, unit.uom) },
    { label: "Théorique à la clôture", detail: unit.system ? unit.system.fileName + (unit.system.row ? " · ligne " + unit.system.row : "") : "Absent de l’état théorique", from: 0n, to: unit.systemQuantity === null ? null : BigInt(unit.systemQuantity), kind: "ledger", value: formatQuantity(unit.systemQuantity, unit.uoms.system) },
  ];
  const known = steps.flatMap(s => [s.from, s.to]).filter((x): x is bigint => x !== null);
  const max = known.reduce((a, b) => b > a ? b : a, 1n), pct = (v: bigint) => Number((v * 10000n) / max) / 100;
  return <figure style={{ margin: 0 }}>
    <figcaption className={styles.muted}>Passage inventaire → clôture, en {unit.uom ?? "unités incompatibles"} ; aucune valeur monétaire.</figcaption>
    <ol className={styles.bridge}>{steps.map(s => { const a = s.from, b = s.to, left = a === null || b === null ? 0 : pct(a < b ? a : b), width = a === null || b === null ? 0 : Math.max(pct(a > b ? a - b : b - a), a === b ? 0 : 0.6);
      return <li key={s.label}><div className={styles.step + " " + st.stepStack} data-kind={s.kind === "total" && s.label.startsWith("=") ? "total" : s.kind === "ledger" ? "ledger" : undefined}>
        <span className={styles.stepLabel}>{s.label}<small>{s.detail}</small></span>
        <span className={styles.track} aria-hidden="true">{b !== null && <span className={styles.bar} data-kind={s.kind} style={{ left: left + "%", width: width + "%" }}/>}</span>
        <span className={styles.stepValue}>{s.value}</span></div></li>; })}
      <li><div className={styles.step + " " + st.stepStack} data-kind="total"><span className={styles.stepLabel}>Écart<small>Reconstitué − théorique</small></span><span className={styles.track} aria-hidden="true"/>
        <span className={styles.stepValue + " " + (unit.difference === "0" ? styles.differenceOk : unit.difference ? styles.differenceKo : "")}>{unit.difference === null ? "Non établi" : formatQuantity(unit.difference, unit.uom, { signed: true })}</span></div></li></ol>
    <details className={styles.altTable}><summary>Alternative tabulaire du pont</summary><table><thead><tr><th scope="col">Étape</th><th scope="col">Quantité</th><th scope="col">Précision</th></tr></thead>
      <tbody>{steps.map(s => <tr key={s.label}><td>{s.label}</td><td className={styles.money}>{s.value}</td><td>{s.detail}</td></tr>)}<tr><td>Écart</td><td className={styles.money}>{unit.difference === null ? "Non établi" : formatQuantity(unit.difference, unit.uom, { signed: true })}</td><td>Reconstitué − théorique</td></tr></tbody></table></details>
  </figure>;
}

export const StockDetailPanel = forwardRef<StockDetailHandle, Props>(function StockDetailPanel({ unit, result, view, dossierId, periodId, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null), [piece, setPiece] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  const close = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setPiece(null); onReturn(); } };
  const canDownload = view.permissions.includes("download");
  const download = (id: string) => "/api/workpapers/stocks?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const supportBatch = view.imports.find(b => b.document.documentType === "st_support" && view.sourceHeads.some(h => h.import_id === b.id)), supports = supportBatch?.rows ?? [];
  const pieceRow = (ref: string) => ref ? supports.find(r => r.normalized?.key === ref) : undefined;
  const pieceLabel = (r: (typeof supports)[number]) => r.original[supportBatch?.mapping.stocks?.labelColumn ?? ""] ?? "";
  const lineBox = (l: Line, refName: string, extra: React.ReactNode, className?: string) => {
    const id = l.importId + ":" + l.rowId, open = piece === id, support = pieceRow(refName);
    return <li key={id} className={className}><button type="button" aria-expanded={open} onClick={() => setPiece(open ? null : id)}><span>{l.key}{refName ? " · " + refName : ""} {extra}</span><span className={styles.money}>{formatQuantity(l.quantity)}</span></button>
      {open && <div className={styles.sourceBox}><dl><dt>Source</dt><dd>{l.fileName}</dd><dt>Version</dt><dd><code>{l.documentVersionId}</code></dd><dt>Ligne</dt><dd>{l.row ?? "—"}</dd><dt>Date</dt><dd>{dateFr(l.date)}</dd></dl>
        {support ? <p><strong>Pièce {refName}</strong> — {pieceLabel(support)} (pièces citables, ligne {support.locator.row})</p> : refName ? <p className={styles.muted}>Pièce {refName} absente des pièces citables approuvées : à demander.</p> : <p className={styles.muted}>Aucune référence de pièce sur cette ligne.</p>}
        {canDownload && <a href={download(l.documentVersionId)}>Télécharger cette version de la source</a>}</div>}</li>;
  };
  if (!unit || !result) return <aside className={styles.detail} aria-label="Comptage et pièce" onKeyDown={close}><h2 ref={heading} tabIndex={-1}>Comptage et pièce</h2>
    <p className={styles.muted}>Choisissez une case : le pont inventaire → clôture, les lignes de comptage, la ligne théorique et les mouvements s’affichent ici, chacun avec sa pièce. Échap revient à la case d’origine.</p></aside>;
  return <aside className={styles.detail} data-open="true" aria-label="Comptage et pièce" onKeyDown={close} key={unit.unitId}>
    <h2 ref={heading} tabIndex={-1}>{unitLabel(unit)}</h2>
    <p>{unit.label}</p>
    <KindBadge status={unit.status}/>
    {unit.reason && <p className={styles.muted}>{unit.reason}</p>}
    <dl><dt>Propriété</dt><dd>{unit.systemCategory ? "Théorique : " + ST_CATEGORY_LABELS[unit.systemCategory] : "Absent du théorique"}{unit.countCategories.length ? " · Compté : " + unit.countCategories.map(c => ST_CATEGORY_LABELS[c]).join(", ") : ""}</dd>
      <dt>Unités</dt><dd>{[...unit.uoms.count.map(u => "comptage " + u), unit.uoms.system ? "théorique " + unit.uoms.system : "", ...unit.uoms.movements.map(u => "mouvements " + u)].filter(Boolean).join(" · ") || "—"}</dd></dl>
    {unit.inScope && unit.status !== "ownership_mismatch" && <StockBridge unit={unit}/>}
    <h3>Lignes de comptage</h3>
    {unit.countLines.length ? <ul className={st.pieceList}>{unit.countLines.map(l => lineBox(l, l.sheetRef, <small>{ST_CATEGORY_LABELS[l.category]} · {l.uomLabel}</small>))}</ul> : <p className={styles.muted}>Aucune ligne de comptage : la quantité réelle reste inconnue.</p>}
    <h3>Ligne théorique</h3>
    {unit.system ? <ul className={st.pieceList}>{lineBox(unit.system, "", <small>{ST_CATEGORY_LABELS[unit.system.category]} · {unit.system.uomLabel}</small>)}</ul> : <p className={styles.muted}>Absente de l’état théorique à la clôture.</p>}
    <h3>Mouvements intercalaires</h3>
    {unit.movements.lines.length ? <ul className={st.pieceList}>{unit.movements.lines.map(l => lineBox(l, l.pieceRef, <small>{l.direction === "in" ? "Entrée" : "Sortie"} · {dateFr(l.date)} · {l.inWindow ? "pris en compte" : "hors période intercalaire"}</small>, l.inWindow ? undefined : st.outWindow))}</ul>
      : <p className={styles.muted}>{unit.movements.coverage === "missing_journal" ? "Aucun journal de mouvements approuvé." : unit.movements.coverage === "not_needed" ? "Aucun mouvement requis : comptage à la date de clôture." : "Aucun mouvement pour cette référence dans le journal."}</p>}
    {result.coverage && <p className={styles.muted}>Journal : {result.coverage.fileName}, période couverte déclarée du {dateFr(result.coverage.from)} au {dateFr(result.coverage.to)}.</p>}
    <p className={styles.muted}>L’outil ne certifie pas la présence physique des stocks et ne déprécie rien automatiquement.</p>
  </aside>;
});

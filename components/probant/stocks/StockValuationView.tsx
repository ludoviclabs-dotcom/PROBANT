"use client";
import { formatCents, type StockResult } from "@/lib/workpapers/stock-contract";
import styles from "../cash/cash.module.css";
import st from "./stocks.module.css";

const STATUS: Record<string, string> = { framed: "Cadré", difference: "Écart à expliquer", ledger_missing: "Grand livre absent — cadrage impossible", system_missing: "Aucune ligne théorique sur ce compte", values_missing: "Valeurs théoriques non mappées — cadrage impossible" };
/** Framing of the stated stock values against the closing ledger, and valued differences (sub-lot 2). Every amount comes from the server. */
export function StockValuationView({ result }: { result: StockResult }) {
  const v = result.valuation;
  if (!v) return <section className={styles.card} aria-labelledby="st-val-title"><header><h2 id="st-val-title">Coûts et cadrage</h2></header>
    <p className={styles.muted}>Aucune liste de coûts ni grand livre figés : aucune valeur n’est dérivée des quantités. Qualifiez les coûts documentés et le grand livre (Pièces) puis révisez la feuille.</p></section>;
  const max = v.accounts.reduce((m, a) => [a.systemValueCents, a.ledgerCents].filter((x): x is string => x !== null).reduce((n, x) => { const b = BigInt(x) < 0n ? -BigInt(x) : BigInt(x); return b > n ? b : n; }, m), 1n);
  const pct = (x: string | null) => x === null ? 0 : Number(((BigInt(x) < 0n ? -BigInt(x) : BigInt(x)) * 10000n) / max) / 100;
  return <section className={styles.card} aria-labelledby="st-val-title">
    <header><h2 id="st-val-title">Coûts et cadrage — état valorisé ↔ grand livre</h2><span className={styles.muted}>{v.costsProvided ? "Coûts documentés figés" : "Sans liste de coûts"} · {v.ledgerProvided ? "grand livre figé" : "sans grand livre"}</span></header>
    <p className={styles.muted}>Stock détenu par l’entité (propre, déposé chez un tiers, en transit, en-cours, références exclues) ; stocks de tiers et consignations reçues exclus du cadrage et signalés s’ils sont valorisés.</p>
    <div className={styles.tableScroll} role="region" aria-label="Cadrage par compte — défilement clavier" tabIndex={0}><table className={st.valueTable}>
      <caption>Cadrage par compte de stock, en euros ; écart = grand livre − état théorique valorisé</caption>
      <thead><tr><th scope="col">Compte</th><th scope="col">État valorisé (détenu)</th><th scope="col">Grand livre</th><th scope="col">Écart</th><th scope="col">Comparaison</th><th scope="col">Lecture</th></tr></thead>
      <tbody>{v.accounts.map(a => <tr key={a.account} className={st.rowKind} data-kind={a.status === "framed" ? "ok" : a.status === "ledger_missing" || a.status === "values_missing" ? "uncertain" : "quantity"}>
        <th scope="row">{a.account}<small className={st.sub}>{a.lines} ligne(s){a.methods.length ? " · " + a.methods.join(" ; ") : ""}</small></th>
        <td className={styles.money}>{formatCents(a.systemValueCents)}</td><td className={styles.money}>{formatCents(a.ledgerCents)}</td>
        <td className={styles.money}><span className={st.delta} data-sign={a.differenceCents === null ? "none" : a.differenceCents === "0" ? "zero" : a.differenceCents.startsWith("-") ? "neg" : "pos"}>{a.differenceCents === null ? "Inconnu" : formatCents(a.differenceCents, { signed: true })}</span></td>
        <td aria-hidden="true"><span className={st.meter + " " + st.meterCell}><span style={{ width: pct(a.systemValueCents) + "%" }}/><span data-kind="system" style={{ width: pct(a.ledgerCents) + "%" }}/></span></td>
        <td>{STATUS[a.status]}{a.notOwnedCents !== "0" ? " · " + formatCents(a.notOwnedCents) + " hors propriété exclus" : ""}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Total</th><td className={styles.money}>{formatCents(v.totals.systemValueCents)}</td><td className={styles.money}>{formatCents(v.totals.ledgerCents)}</td><td colSpan={3}/></tr></tfoot></table></div>
    <p className={styles.muted}>Barres : état valorisé (bleu) puis grand livre (gris), à la même échelle.</p>
    {v.depreciation.length > 0 && <p className={styles.notice} data-tone="info">Comptes de dépréciation au grand livre : {v.depreciation.map(d => d.account + " " + formatCents(d.ledgerCents)).join(" · ")}. Ils relèvent de la revue de valeur (sous-lot 3) : aucune dépréciation n’est calculée ici.</p>}
    <h3>Écarts de quantité valorisés</h3>
    <p>Total net {formatCents(v.totals.netQuantityDifferenceCents, { signed: true })} · écarts bruts {formatCents(v.totals.grossQuantityDifferenceCents)} sur {v.totals.valuedDifferences} référence(s) / site(s) / lot(s){v.totals.compensated ? <> — <strong>écarts compensés : le net ne justifie aucun écart individuel</strong></> : ""}. Écarts potentiels, non validés comme anomalies.</p>
    {v.references.length > 0 && <ul className={styles.list}>{v.references.map(r => <li key={r.reference} className={styles.kv}><strong>{r.reference}</strong><span>net {formatCents(r.net, { signed: true })}</span><span>brut {formatCents(r.gross)}</span>{r.compensated && <span>compensé</span>}</li>)}</ul>}
    <p className={styles.muted}>Écart de prix net (valeur théorique − quantité × coût documenté) : {formatCents(v.totals.priceDifferenceNetCents, { signed: true })}.</p>
  </section>;
}

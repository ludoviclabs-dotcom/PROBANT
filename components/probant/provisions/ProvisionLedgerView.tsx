"use client";
import { formatCents, type ProvisionResult } from "@/lib/workpapers/provision-contract";
import styles from "../cash/cash.module.css";
import pv from "./provisions.module.css";

const STATUS: Record<string, [string, string]> = { framed: ["Cadré", "ok"], difference: ["Écart à expliquer", "difference"], incomplete: ["Incomplet — montant inconnu", "uncertain"], ledger_missing: ["Absent du grand livre", "uncertain"] };
const sign = (d: string | null) => d === null ? "none" : d === "0" ? "zero" : d.startsWith("-") ? "neg" : "pos";
/** Framing per provision account and provisions table by category (PCG art. 832-13). Every amount comes from the server. */
export function ProvisionLedgerView({ result }: { result: ProvisionResult }) {
  return <>
    <section className={styles.card} aria-labelledby="pv-ledger-title">
      <header><h2 id="pv-ledger-title">Cadrage par compte de provisions</h2><span className={styles.muted}>Registre et mouvements ↔ grand livre</span></header>
      <div className={styles.tableScroll} role="region" aria-label="Cadrage par compte — défilement clavier" tabIndex={0}><table className={pv.ledgerTable}>
        <caption>Euros. Écart = grand livre − registre ; pont du grand livre = clôture − (ouverture + dotations − utilisations − reprises). « Inconnu » : non établi, jamais zéro.</caption>
        <thead><tr><th scope="col">Compte</th><th scope="col" className={pv.num}>Ouverture registre</th><th scope="col" className={pv.num}>Ouverture GL</th><th scope="col" className={pv.num}>Dotations</th><th scope="col" className={pv.num}>Utilisations</th><th scope="col" className={pv.num}>Reprises</th>
          <th scope="col" className={pv.num}>Clôture registre</th><th scope="col" className={pv.num}>Clôture GL</th><th scope="col" className={pv.num}>Écart clôture</th><th scope="col" className={pv.num}>Pont GL</th><th scope="col">Lecture</th></tr></thead>
        <tbody>{result.accounts.map(a => <tr key={a.account} className={pv.rowKind} data-kind={STATUS[a.status][1]}>
          <th scope="row">{a.account}<span className={pv.sub}>{a.label || "—"} · {a.events.length ? a.events.join(", ") : "aucun événement"}</span></th>
          <td className={pv.num}>{formatCents(a.registerOpeningCents)}</td><td className={pv.num}>{formatCents(a.ledgerOpeningCents)}</td><td className={pv.num}>{formatCents(a.dotations)}</td><td className={pv.num}>{formatCents(a.utilisations)}</td><td className={pv.num}>{formatCents(a.reprises)}</td>
          <td className={pv.num}>{formatCents(a.registerClosingCents)}</td><td className={pv.num}>{formatCents(a.ledgerClosingCents)}</td>
          <td className={pv.num}><span className={pv.delta} data-sign={sign(a.closingDifference)}>{a.closingDifference === null ? "Inconnu" : formatCents(a.closingDifference, { signed: true })}</span></td>
          <td className={pv.num}><span className={pv.delta} data-sign={sign(a.ledgerBridgeDifference)}>{a.ledgerBridgeDifference === null ? "Inconnu" : formatCents(a.ledgerBridgeDifference, { signed: true })}</span></td>
          <td>{STATUS[a.status][0]}{a.openingDifference && a.openingDifference !== "0" ? " · ouverture " + formatCents(a.openingDifference, { signed: true }) : ""}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">Total</th><td className={pv.num}>{formatCents(result.totals.opening)}</td><td className={pv.num}>{formatCents(result.totals.ledgerOpening)}</td><td className={pv.num}>{formatCents(result.totals.dotations)}</td><td className={pv.num}>{formatCents(result.totals.utilisations)}</td><td className={pv.num}>{formatCents(result.totals.reprises)}</td>
          <td className={pv.num}>{formatCents(result.totals.computedClosing)}</td><td className={pv.num}>{formatCents(result.totals.ledgerClosing)}</td><td colSpan={3}/></tr></tfoot></table></div>
    </section>
    <section className={styles.card} aria-labelledby="pv-table-title">
      <header><h2 id="pv-table-title">Tableau des provisions par catégorie</h2><span className={styles.muted}>Colonnes du tableau de l’annexe (PCG art. 832-13), calculées sur le registre</span></header>
      <div className={styles.tableScroll} role="region" aria-label="Tableau des provisions — défilement clavier" tabIndex={0}><table>
        <thead><tr><th scope="col">Rubrique</th><th scope="col" className={pv.num}>Ouverture</th><th scope="col" className={pv.num}>Dotations</th><th scope="col" className={pv.num}>Reprises utilisées</th><th scope="col" className={pv.num}>Reprises non utilisées</th><th scope="col" className={pv.num}>Clôture</th></tr></thead>
        <tbody>{result.categories.map(c => <tr key={c.category}><th scope="row">{c.label}</th><td className={pv.num}>{formatCents(c.opening)}</td><td className={pv.num}>{formatCents(c.dotations)}</td><td className={pv.num}>{formatCents(c.utilisations)}</td><td className={pv.num}>{formatCents(c.reprises)}</td><td className={pv.num}>{formatCents(c.closing)}</td></tr>)}</tbody></table></div>
      <p className={styles.muted}>Le tableau est reconstitué à partir du registre pour comparaison ; il ne remplace pas l’annexe établie par l’entité.</p>
    </section>
  </>;
}

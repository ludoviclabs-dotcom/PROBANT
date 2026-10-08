"use client";
import type { Money } from "@/lib/canonical-model/money";
import { cents } from "@/lib/canonical-model/money";
import { eur, KIND_PLURALS } from "./format";
import type { DisplayAccount } from "./types";
import styles from "./cash.module.css";

type Balance = "ledger" | "statement" | "erbBook" | "erbBank";
/** ERB (client document) next to its independent sources; source differences stay separate from the bridge difference. */
export function CashErbPanel({ account, onBalance, active }: { account: DisplayAccount; onBalance(balance: Balance): void; active: Balance | null }) {
  const b = account.fact?.balances, computed = account.result?.bridge.status === "computed" ? account.result.bridge : null;
  const amount = (key: Balance) => b?.[key]?.amount ?? null;
  // Per-kind totals come from the server result only; before execution the browser shows counts, never its own sums.
  const totals = { receipt_in_transit: computed?.receiptsInTransit, outstanding_payment: computed?.outstandingPayments, other: computed?.otherItems };
  const kinds = (["receipt_in_transit", "outstanding_payment", "other"] as const).map(k => ({ k, count: account.items.filter(i => i.kind === k).length, total: totals[k] }));
  const link = (key: Balance, label: string) => b?.[key] ? <button type="button" aria-pressed={active === key} onClick={() => onBalance(key)}>{label}</button> : <span className={styles.muted}>Absent</span>;
  const diff = (value: Money | undefined) => computed && value ? <span className={cents(value) === 0n ? styles.differenceOk : styles.differenceKo}>{eur(value, { signed: true })}</span> : <span className={styles.muted}>Calculé à l’exécution</span>;
  return <div>
    <div className={styles.sideBySide}>
      <section aria-labelledby="erb-title"><h3 id="erb-title">ERB — document fourni par le client</h3>
        <dl>
          <dt>Solde banque selon l’ERB</dt><dd>{amount("erbBank") ? eur(amount("erbBank")) : "Absent"}</dd>
          {kinds.map(({ k, count, total }) => [<dt key={k + "t"}>{KIND_PLURALS[k]} ({count})</dt>, <dd key={k + "d"}>{total ? eur(total, { signed: true }) : <span className={styles.muted}>Calculé à l’exécution</span>}</dd>])}
          <dt>Solde comptable selon l’ERB</dt><dd>{amount("erbBook") ? eur(amount("erbBook")) : "Absent"}</dd>
        </dl>
        <p className={styles.actions}>{link("erbBank", "Source du solde banque ERB")}{link("erbBook", "Source du solde comptable ERB")}</p>
      </section>
      <section aria-labelledby="sources-title"><h3 id="sources-title">Sources indépendantes de l’ERB</h3>
        <dl>
          <dt>Solde du relevé à la clôture</dt><dd>{amount("statement") ? eur(amount("statement")) : "Absent — pont non calculable"}</dd>
          <dt>Solde comptable (GL)</dt><dd>{amount("ledger") ? eur(amount("ledger")) : "Absent"}</dd>
        </dl>
        <p className={styles.actions}>{link("statement", "Source du relevé")}{link("ledger", "Source du GL")}</p>
        <p className={styles.muted}>Relevé et GL proviennent d’imports qualifiés distincts de l’ERB. Leur concordance ne prouve pas leur authenticité.</p>
      </section>
    </div>
    <table className={styles.sourceDiffs}><caption>Écarts de source — distincts de l’écart du pont, jamais additionnés</caption>
      <thead><tr><th scope="col">Comparaison</th><th scope="col" className={styles.money}>Écart</th></tr></thead>
      <tbody>
        <tr><th scope="row">Solde banque ERB − relevé</th><td className={styles.money}>{diff(computed?.bankSourceDifference)}</td></tr>
        <tr><th scope="row">Solde comptable ERB − GL</th><td className={styles.money}>{diff(computed?.bookSourceDifference)}</td></tr>
        <tr><th scope="row">Arithmétique ERB : comptable − banque − suspens</th><td className={styles.money}>{diff(computed?.erbArithmeticDifference)}</td></tr>
      </tbody>
    </table>
  </div>;
}

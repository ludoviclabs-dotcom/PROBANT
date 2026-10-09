"use client";
import { formatCents, formatQuantity, type StockResult } from "@/lib/workpapers/stock-contract";
import { dateFr, plural, unitLabel } from "./format";
import styles from "../cash/cash.module.css";
import st from "./stocks.module.css";

const STATUS: Record<string, string> = { gap: "Valeur actuelle selon l’hypothèse inférieure au coût", no_gap: "Valeur actuelle selon l’hypothèse au moins égale au coût", booked_without_hypothesis: "Dépréciation comptabilisée sans hypothèse",
  not_reviewed: "Non revue", cost_missing: "Coût absent — revue incomplète", unit_incompatible: "Unités incompatibles — revue incomplète" };
const KIND: Record<string, string> = { gap: "quantity", no_gap: "ok", booked_without_hypothesis: "uncertain", not_reviewed: "apart", cost_missing: "uncertain", unit_incompatible: "blocked" };
/** Value review (sub-lot 3): the tool compares a cited hypothesis with the cost and the booked depreciation; it never proposes nor books one. */
export function StockValueReviewView({ result, onOpen }: { result: StockResult; onOpen(unitId: string): void }) {
  const r = result.valueReview;
  if (!r) return <section className={styles.card} aria-labelledby="st-rev-title"><header><h2 id="st-rev-title">Revue de valeur</h2></header>
    <p className={styles.muted}>Aucune hypothèse de valeur figée : la revue de valeur n’est pas lancée. Qualifiez les hypothèses citées et justifiées (Pièces), puis révisez la feuille. L’outil ne déprécie jamais automatiquement, ni sur la rotation ni autrement.</p></section>;
  const units = r.units.filter(u => u.status !== "not_reviewed"), label = (id: string) => { const u = result.units.find(x => x.unitId === id)!; return unitLabel(u); };
  return <section className={styles.card} aria-labelledby="st-rev-title">
    <header><h2 id="st-rev-title">Revue de valeur — hypothèses citées</h2><span className={styles.muted}>{plural(r.totals.reviewed, "référence revue", "références revues")} · {plural(r.totals.notReviewed, "non revue", "non revues")}</span></header>
    <p className={styles.notice} data-tone="info">Valeur actuelle selon l’hypothèse = prix de vente estimé − coûts de sortie (PCG art. 214-6 et 214-22). L’écart indicatif est comparé à la dépréciation comptabilisée : <strong>l’outil ne propose ni ne comptabilise aucune dépréciation</strong>, et la rotation n’est qu’un indice (art. 214-16). Chaque différence appelle un jugement motivé et cité.</p>
    <div className={styles.tableScroll} role="region" aria-label="Revue de valeur — défilement clavier" tabIndex={0}><table className={st.reviewTable}>
      <caption>Revue de valeur par référence / site / lot, en euros ; différence = écart indicatif − dépréciation comptabilisée</caption>
      <thead><tr><th scope="col">Référence / site / lot</th><th scope="col">Coût</th><th scope="col">Valeur actuelle (hypothèse)</th><th scope="col">Écart unitaire</th><th scope="col">Quantité théorique</th><th scope="col">Écart indicatif</th><th scope="col">Dépréciation comptabilisée</th><th scope="col">Différence</th><th scope="col">Indice de rotation</th><th scope="col">Hypothèse citée</th></tr></thead>
      <tbody>{units.map(u => <tr key={u.unitId} className={st.rowKind} data-kind={KIND[u.status]}>
        <th scope="row"><button type="button" className={st.link} onClick={() => onOpen(u.unitId)}>{label(u.unitId)}</button><small className={st.sub}>{STATUS[u.status]}</small></th>
        <td className={styles.money}>{formatCents(u.costCents)}</td>
        <td className={styles.money}>{u.hypothesis ? formatCents(u.hypothesis.currentValueCents) : "—"}{u.hypothesis && <small className={st.sub}>{formatCents(u.hypothesis.sellingPriceCents)} − {formatCents(u.hypothesis.exitCostsCents)}</small>}</td>
        <td className={styles.money}>{formatCents(u.unitGapCents)}</td><td className={styles.money}>{formatQuantity(u.systemQuantity)}</td><td className={styles.money}>{formatCents(u.indicativeGapCents)}</td>
        <td className={styles.money}>{formatCents(u.bookedCents)}</td>
        <td className={styles.money}><span className={st.delta} data-sign={u.differenceCents === null ? "none" : u.differenceCents === "0" ? "zero" : u.differenceCents.startsWith("-") ? "neg" : "pos"}>{u.differenceCents === null ? "Non établie" : formatCents(u.differenceCents, { signed: true })}</span></td>
        <td>{u.rotation ? "Dernier mouvement le " + dateFr(u.rotation.lastMovement) + " (" + u.rotation.days + " j avant la clôture) — indice, aucun calcul" : "—"}</td>
        <td>{u.hypothesis ? <>{u.hypothesis.kind} · {u.hypothesis.pieceRef}<small className={st.sub}>{u.hypothesis.justification}</small></> : "Aucune"}</td></tr>)}</tbody></table></div>
    <p>Écart indicatif total {formatCents(r.totals.indicativeGapCents)} · dépréciations comptabilisées (détail) {formatCents(r.totals.bookedCents)} · comptes 39 au grand livre {formatCents(r.totals.ledgerDepreciationCents)}
      {r.totals.depreciationFramingDifferenceCents !== null && <> · écart de cadrage <strong>{formatCents(r.totals.depreciationFramingDifferenceCents, { signed: true })}</strong></>}.</p>
  </section>;
}

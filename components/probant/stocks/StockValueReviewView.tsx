"use client";
import { formatCents, formatQuantity, isLegacyValueReview, ST_CATEGORY_LABELS, ST_REVIEW_STATUS_LABELS, type StockResult, type StockReviewStatus, type StockValueReview, type StockValueReviewLegacy } from "@/lib/workpapers/stock-contract";
import { dateFr, plural, unitLabel } from "./format";
import styles from "../cash/cash.module.css";
import st from "./stocks.module.css";

const KIND: Record<StockReviewStatus, string> = { gap: "quantity", gap_partial: "uncertain", no_gap: "ok", booked_without_hypothesis: "uncertain", not_reviewed: "apart", cost_missing: "uncertain", unit_incompatible: "blocked", not_in_system: "uncertain" };
/** Short status in the table; the full wording stays in the detail panel. */
const SHORT_STATUS: Record<StockReviewStatus, string> = { gap: "Sous le coût · quantité rapprochée", gap_partial: "Sous le coût · estimation partielle", no_gap: "Au moins égale au coût",
  booked_without_hypothesis: "Dépréciation sans hypothèse", not_reviewed: "Non revue", cost_missing: "Coût absent · revue incomplète", unit_incompatible: "Unités incompatibles · revue incomplète", not_in_system: "Absente du théorique · revue incomplète" };
const QUANTITY_BASIS: Record<string, string> = { reconciled: "rapprochée", theoretical_unreconciled: "théorique non rapprochée", unknown: "inconnue" };
const GROUP_LABELS: Record<string, string> = { ...ST_CATEGORY_LABELS, site_not_visited: "Site non visité", ownership_mismatch: "Écart de propriété" };
const sign = (v: string | null) => v === null ? "none" : v === "0" ? "zero" : v.startsWith("-") ? "neg" : "pos";

/**
 * Value review (sub-lot 3, rule 1.1.0): three distinct amounts per unit — economic gross comparison, loss of value of the asset
 * bounded at its carrying amount, and the excess to be qualified. Every amount comes from the server; nothing is proposed nor booked.
 */
export function StockValueReviewView({ result, onOpen }: { result: StockResult; onOpen(unitId: string): void }) {
  const r = result.valueReview;
  if (!r) return <section className={styles.card} aria-labelledby="st-rev-title"><header><h2 id="st-rev-title">Revue de valeur</h2></header>
    <p className={styles.muted}>Aucune hypothèse de valeur figée : la revue de valeur n’est pas lancée. Qualifiez les hypothèses citées et justifiées (Pièces), puis révisez la feuille. L’outil ne déprécie jamais automatiquement, ni sur la rotation ni autrement.</p></section>;
  if (isLegacyValueReview(r)) return <LegacyValueReview result={result} review={r} onOpen={onOpen}/>;
  return <CurrentValueReview result={result} review={r} onOpen={onOpen}/>;
}

function CurrentValueReview({ result, review: r, onOpen }: { result: StockResult; review: StockValueReview; onOpen(unitId: string): void }) {
  const units = r.units.filter(u => u.status !== "not_reviewed"), t = r.totals, label = (id: string) => unitLabel(result.units.find(x => x.unitId === id)!);
  const withoutHypothesis = t.units.notReviewed + t.units.bookedWithoutHypothesis;
  return <section className={styles.card} aria-labelledby="st-rev-title">
    <header><h2 id="st-rev-title">Revue de valeur — hypothèses citées</h2>
      <span className={styles.muted}>{plural(t.units.complete, "estimation complète", "estimations complètes")} · {plural(t.units.partial, "partielle", "partielles")} · {plural(t.units.incomplete, "incomplète", "incomplètes")} · {plural(withoutHypothesis, "unité sans hypothèse", "unités sans hypothèse")} · sur {t.units.tested} testées</span></header>
    <p className={styles.notice} data-tone="info">Valeur actuelle selon l’hypothèse = prix de vente estimé − coûts de sortie (PCG art. 214-6 et 214-22), conservée même négative. Trois montants distincts : la <strong>comparaison économique</strong> (coût − valeur actuelle) × quantité ; la <strong>perte de valeur de l’actif</strong>, bornée à sa valeur comptable de référence (quantité × coût documenté) et seule comparée à la dépréciation comptabilisée ; le <strong>complément à qualifier</strong> au-delà, ni dépréciation ni provision automatique. <strong>L’outil ne propose ni ne comptabilise aucune dépréciation.</strong></p>
    <div className={styles.tableScroll} role="region" aria-label="Revue de valeur — défilement clavier" tabIndex={0}><table className={st.reviewTable}>
      <caption>Revue de valeur par référence / site / lot, en euros ; différence = perte de valeur de l’actif − dépréciation comptabilisée</caption>
      <thead><tr><th scope="col">Référence / site / lot</th><th scope="col">Coût documenté</th><th scope="col">Valeur actuelle (hypothèse)</th><th scope="col">Quantité retenue</th><th scope="col">Comparaison économique</th><th scope="col">Perte de valeur de l’actif</th><th scope="col">Complément à qualifier</th><th scope="col">Différence (dépréciation comptabilisée)</th></tr></thead>
      <tbody>{units.map(u => <tr key={u.unitId} className={st.rowKind} data-kind={KIND[u.status]}>
        <th scope="row"><button type="button" className={st.link} onClick={() => onOpen(u.unitId)}>{label(u.unitId)}</button><small className={st.sub} title={ST_REVIEW_STATUS_LABELS[u.status]}>{SHORT_STATUS[u.status]}</small></th>
        <td className={styles.money}>{u.cost ? formatCents(u.cost.unitCostCents) : "Inconnu"}{u.cost && <small className={st.sub}>par {u.cost.uomLabel} · déclaré le {dateFr(u.cost.date)}{u.cost.basis === "reference_fallback" ? " · repli sur la référence" : ""}</small>}</td>
        <td className={styles.money}>{u.hypothesis ? formatCents(u.hypothesis.currentValueCents) : "—"}{u.hypothesis && <small className={st.sub}>{formatCents(u.hypothesis.sellingPriceCents)} − {formatCents(u.hypothesis.exitCostsCents)} par {u.hypothesis.uomLabel} · {u.hypothesis.pieceRef} du {dateFr(u.hypothesis.date)}</small>}</td>
        <td className={styles.money}>{formatQuantity(u.quantity.used, u.quantity.uomLabel)}<small className={st.sub}>{QUANTITY_BASIS[u.quantity.basis]}{u.quantity.basis === "theoretical_unreconciled" ? " · reconstituée " + formatQuantity(u.quantity.reconstituted, u.quantity.uomLabel) : ""}</small></td>
        <td className={styles.money}>{formatCents(u.economicGapCents)}</td>
        <td className={styles.money}>{formatCents(u.assetImpairmentCents)}{u.carryingCents !== null && <small className={st.sub}>valeur comptable {formatCents(u.carryingCents)}</small>}</td>
        <td className={styles.money}>{u.excessCents === null ? "Inconnu" : u.excessCents === "0" ? "—" : <strong>{formatCents(u.excessCents)}</strong>}{u.excessCents !== null && u.excessCents !== "0" && <small className={st.sub}>obligation à qualifier</small>}</td>
        <td className={styles.money}><span className={st.delta} data-sign={u.status === "gap_partial" ? "none" : sign(u.differenceCents)}>{u.differenceCents === null ? "Non établie" : formatCents(u.differenceCents, { signed: true })}</span>
          <small className={st.sub}>{u.status === "gap_partial" && u.differenceCents !== null ? "partielle · " : ""}comptabilisée {formatCents(u.bookedCents)}</small></td></tr>)}</tbody></table></div>
    <h3>Totaux et populations</h3>
    <ul className={styles.list}>
      <li className={styles.kv}><strong>Estimation complète</strong><span>{plural(t.units.complete, "unité", "unités")} (quantité rapprochée, ou valeur au moins égale au coût)</span><span>comparaison économique {formatCents(t.complete.economicGapCents)}</span><span>perte de valeur de l’actif {formatCents(t.complete.assetImpairmentCents)}</span><span>complément à qualifier {formatCents(t.complete.excessCents)}</span></li>
      <li className={styles.kv}><strong>Estimation partielle</strong><span>{plural(t.units.partial, "unité", "unités")} sur quantité théorique non rapprochée, non additionnée au total complet</span><span>comparaison {formatCents(t.partial.economicGapCents)}</span><span>perte de valeur {formatCents(t.partial.assetImpairmentCents)}</span><span>complément {formatCents(t.partial.excessCents)}</span></li>
      <li className={styles.kv}><strong>Revue incomplète</strong><span>{plural(t.units.incomplete, "unité", "unités")} avec hypothèse mais sans coût, en unités incompatibles ou absente du théorique : montants inconnus</span></li>
      <li className={styles.kv}><strong>Part non revue</strong><span>{plural(withoutHypothesis, "unité sans hypothèse", "unités sans hypothèse")}{t.units.bookedWithoutHypothesis ? " (dont " + t.units.bookedWithoutHypothesis + " avec dépréciation comptabilisée)" : ""}</span><span>{formatCents(t.notReviewedCostCents)} au coût documenté{t.notReviewedUnknown ? " + " + plural(t.notReviewedUnknown, "unité de valeur inconnue", "unités de valeur inconnue") : ""}</span></li>
      <li className={styles.kv}><strong>Hors revue</strong>{t.excluded.length ? t.excluded.map(g => <span key={g.group}>{GROUP_LABELS[g.group] ?? g.group} : {g.units} ({g.statedValueCents === null ? "valeur déclarée inconnue" : formatCents(g.statedValueCents) + " déclarés" + (g.unknownValues ? ", " + g.unknownValues + " inconnue(s)" : "")})</span>) : <span>aucune unité</span>}</li>
      <li className={styles.kv}><strong>Dépréciations</strong><span>détail de l’état théorique {formatCents(t.bookedCents)}</span><span>comptes 39 au grand livre {formatCents(t.ledgerDepreciationCents)}</span>{t.depreciationFramingDifferenceCents !== null && <span>écart de cadrage <strong>{formatCents(t.depreciationFramingDifferenceCents, { signed: true })}</strong></span>}</li>
    </ul>
  </section>;
}

const LEGACY_STATUS: Record<string, string> = { gap: "Valeur actuelle selon l’hypothèse inférieure au coût", no_gap: "Valeur actuelle selon l’hypothèse au moins égale au coût", booked_without_hypothesis: "Dépréciation comptabilisée sans hypothèse",
  not_reviewed: "Non revue", cost_missing: "Coût absent — revue incomplète", unit_incompatible: "Unités incompatibles — revue incomplète" };
/** Result written by rule 1.0.0: displayed as frozen, with what it did not establish. */
function LegacyValueReview({ result, review: r, onOpen }: { result: StockResult; review: StockValueReviewLegacy; onOpen(unitId: string): void }) {
  const units = r.units.filter(u => u.status !== "not_reviewed"), label = (id: string) => unitLabel(result.units.find(x => x.unitId === id)!);
  return <section className={styles.card} aria-labelledby="st-rev-title">
    <header><h2 id="st-rev-title">Revue de valeur — règle 1.0.0 (périmée)</h2><span className={styles.muted}>{plural(r.totals.reviewed, "référence revue", "références revues")} · {plural(r.totals.notReviewed, "non revue", "non revues")}</span></header>
    <p className={styles.notice} data-tone="danger">Résultat établi avec la règle Stocks 1.0.0 : l’écart indicatif n’y est ni borné à la valeur comptable, ni rattaché à une quantité rapprochée, et le repli du coût d’un lot sur la référence n’y est pas signalé. Il reste consultable tel qu’il a été figé ; créez une révision pour appliquer la règle courante.</p>
    <div className={styles.tableScroll} role="region" aria-label="Revue de valeur 1.0.0 — défilement clavier" tabIndex={0}><table className={st.reviewTable}>
      <caption>Revue de valeur 1.0.0 par référence / site / lot, en euros, telle que figée</caption>
      <thead><tr><th scope="col">Référence / site / lot</th><th scope="col">Coût</th><th scope="col">Valeur actuelle (hypothèse)</th><th scope="col">Quantité théorique</th><th scope="col">Écart indicatif (non borné)</th><th scope="col">Dépréciation comptabilisée</th><th scope="col">Différence</th></tr></thead>
      <tbody>{units.map(u => <tr key={u.unitId} className={st.rowKind} data-kind="uncertain">
        <th scope="row"><button type="button" className={st.link} onClick={() => onOpen(u.unitId)}>{label(u.unitId)}</button><small className={st.sub}>{LEGACY_STATUS[u.status]}</small></th>
        <td className={styles.money}>{formatCents(u.costCents)}</td><td className={styles.money}>{u.hypothesis ? formatCents(u.hypothesis.currentValueCents) : "—"}</td>
        <td className={styles.money}>{formatQuantity(u.systemQuantity)}</td><td className={styles.money}>{formatCents(u.indicativeGapCents)}</td><td className={styles.money}>{formatCents(u.bookedCents)}</td>
        <td className={styles.money}>{u.differenceCents === null ? "Non établie" : formatCents(u.differenceCents, { signed: true })}</td></tr>)}</tbody></table></div>
  </section>;
}

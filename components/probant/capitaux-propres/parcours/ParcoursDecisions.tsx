"use client";
import type { ParcoursDecision } from "@/lib/workpapers/capitaux-parcours";
import { dateFr, eur, knownLabel, plural } from "../format";
import { CORRESPONDENCE_LABELS, paymentLabel } from "./format";
import styles from "../../cash/cash.module.css";
import pc from "./parcours.module.css";

/** One row per economic decision: effect by component, booking, payment and cited PV stay four separate measures. */
export function ParcoursDecisions({ decisions, selected, onSelect }: { decisions: ParcoursDecision[]; selected: string | null; onSelect(key: string): void }) {
  if (!decisions.length) return <p className={styles.muted}>Aucune décision dans les résultats exécutés des feuilles reprises. Aucune décision n’est réputée absente : exécutez une feuille pour la reprendre ici.</p>;
  return <div className={styles.tableScroll + " " + pc.decisionsScroll} role="region" aria-label="Décisions du cycle — défilement clavier" tabIndex={0}>
    <table className={pc.decisions}><caption>Une ligne par décision économique ; une décision reliée à deux feuilles n’est comptée qu’une fois</caption>
      <thead><tr><th scope="col">Décision</th><th scope="col">Effet voté par composante</th><th scope="col" className={styles.money}>Comptabilisé</th><th scope="col">Paiement</th><th scope="col">PV cité</th><th scope="col">Correspondance</th></tr></thead>
      <tbody>{decisions.map(d => <tr key={d.key} aria-selected={selected === d.key} data-counted={d.counted}>
        <th scope="row"><button type="button" className={pc.pick} id={"pc-row-" + d.key} aria-label={`${dateFr(d.decisionDate)} — ${d.typeLabel}${d.organ ? " — " + d.organ : ""} : ouvrir le détail`} onClick={() => onSelect(d.key)}>
          <span>{dateFr(d.decisionDate)} · {d.typeLabel}</span><small>{[d.organ, d.traces[0].label].filter(Boolean).join(" · ")}</small>
          {d.effectDates.some(e => e !== d.decisionDate) && <small>effet au {d.effectDates.map(dateFr).join(", ")}</small>}</button></th>
        <td><ul className={pc.effects}>{d.effects.map((e, i) => <li key={i}><span>{e.componentLabel}</span><span>{e.direction === "transfer" ? "transfert " + eur(e.voted) : eur(e.voted, { signed: true })}</span></li>)}</ul>
          {d.amendments.length > 0 && <span className={styles.meaning}>remplace {d.amendments.map(a => a.lineId).join(", ")}</span>}</td>
        <td className={styles.money}>{knownLabel(d.booked)}</td>
        <td><span className={pc.pay} data-status={d.payment?.status ?? "none"}>{paymentLabel(d.payment, d.correspondence === "to_reconcile" ? "Non comparé (à rapprocher)" : d.traces[0].paymentNote)}</span></td>
        <td>{d.pv ? <>{d.pv.pieceRef ?? d.pv.fileName}<span className={styles.meaning}>page {d.pv.page}</span></> : <span className={styles.muted}>Aucun PV commun</span>}</td>
        <td><span className={pc.corr} data-corr={d.correspondence}>{CORRESPONDENCE_LABELS[d.correspondence]}</span><span className={styles.meaning}>{plural(d.traces.length, "feuille")}</span></td>
      </tr>)}</tbody></table></div>;
}

"use client";
import { EQ_DECISION_TEXT, EQ_ENTRY_TEXT, type EquityDecisionResult, type EquityResult } from "@/lib/workpapers/equity-review";
import { COMPONENT_LABELS, dateFr, DECISION_TYPE_LABELS, eur, knownLabel, NATURE_LABELS, plural } from "./format";
import type { EquitySelection } from "./types";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

/** Decision / booking / payment kept as three separate measures for each decision line. */
export function DecisionTable({ decisions, selected, onSelect }: { decisions: EquityDecisionResult[]; selected: EquitySelection; onSelect(lineId: string): void }) {
  return <><p className={styles.muted + " " + eq.lead}>Montant voté, montant comptabilisé (écritures qui citent la ligne) et montant payé restent distincts ; écart = comptabilisé − voté, calculé après lecture validée du PV.</p><div className={styles.tableScroll + " " + eq.free} role="region" aria-label="Décisions, comptabilisation et paiement — défilement clavier" tabIndex={0}>
    <table className={eq.decisions}><caption>Une ligne par ligne de décision</caption>
      <thead><tr><th scope="col">Décision · ligne</th><th scope="col">Statut</th><th scope="col">Type · composante</th><th scope="col">Décision → effet</th><th scope="col" className={styles.money}>Voté</th><th scope="col" className={styles.money}>Comptabilisé</th><th scope="col" className={styles.money}>Payé</th><th scope="col" className={styles.money}>Écart</th><th scope="col">PV · lecture</th></tr></thead>
      <tbody>{decisions.map(d => <tr key={d.lineId} aria-current={selected?.kind === "decision" && selected.id === d.lineId || undefined}>
        <th scope="row"><button type="button" onClick={() => onSelect(d.lineId)}>{d.decisionId} · {d.lineId}</button><span className={styles.meaning}>{d.label}</span></th>
        <td><span className={eq.status} data-status={d.status}>{EQ_DECISION_TEXT[d.status].label}</span></td>
        <td>{DECISION_TYPE_LABELS[d.type]}<span className={styles.meaning}>{COMPONENT_LABELS[d.component]}</span></td>
        <td>{dateFr(d.decisionDate)} → {dateFr(d.effectDate)}</td>
        <td className={styles.money}>{eur(d.voted, { signed: true })}</td><td className={styles.money}>{knownLabel(d.booked)}</td><td className={styles.money}>{knownLabel(d.payment)}</td>
        <td className={styles.money}>{d.difference.kind === "known" ? eur(d.difference.value, { signed: true }) : "—"}</td>
        <td>{d.pv.status === "available" ? d.pv.pieceRef + " p. " + d.pv.page : d.pv.status === "missing" ? "PV absent" : "Page introuvable"}<span className={styles.meaning}>{d.reading.status === "validated" ? "Lecture validée" : d.reading.status === "pending" ? "Lecture à valider" : "Lecture impossible"}</span></td>
      </tr>)}</tbody></table></div></>;
}
/** The three searches of the prompt, each with its count and a direct way to the decision or the movement. */
export function ReconciliationLists({ result, selected, onDecision, onMovement }: { result: EquityResult; selected: EquitySelection; onDecision(lineId: string): void; onMovement(entryId: string): void }) {
  const decisions = result.decisions ?? [];
  const withoutEntry = decisions.filter(d => d.status === "without_entry");
  const withoutDecision = result.entries.filter(e => ["without_decision", "unknown_decision", "mismatch"].includes(e.decisionStatus));
  const divergent = decisions.filter(d => d.status === "amount_divergent");
  const current = (kind: "decision" | "movement", id: string) => selected?.kind === kind && selected.id === id || undefined;
  return <div className={eq.lists}>
    <section aria-labelledby="eq-list-without-entry"><h3 id="eq-list-without-entry"><span>Décision sans écriture</span> <span>{withoutEntry.length}</span></h3>
      {!result.decisions ? <p className={styles.muted}>Registre des décisions absent : recherche impossible.</p> : withoutEntry.length ? <ul>{withoutEntry.map(d => <li key={d.lineId}><button type="button" aria-current={current("decision", d.lineId)} onClick={() => onDecision(d.lineId)}><strong>{d.lineId}</strong><span>{DECISION_TYPE_LABELS[d.type]} · {COMPONENT_LABELS[d.component]} · voté {eur(d.voted, { signed: true })}</span><span className={styles.muted}>effet au {dateFr(d.effectDate)}</span></button></li>)}</ul> : <p className={styles.muted}>Aucune décision à effet dans l’exercice sans écriture.</p>}</section>
    <section aria-labelledby="eq-list-without-decision"><h3 id="eq-list-without-decision"><span>Écriture sans décision</span> <span>{withoutDecision.length}</span></h3>
      {!result.decisions ? <p className={styles.muted}>Registre des décisions absent : les écritures restent non rapprochées, aucune n’est déclarée « sans décision ».</p> : withoutDecision.length ? <ul>{withoutDecision.map(e => <li key={e.entryId}><button type="button" aria-current={current("movement", e.entryId)} onClick={() => onMovement(e.entryId)}><strong>{e.entryId}</strong><span>{NATURE_LABELS[e.nature]} · {COMPONENT_LABELS[e.component]} · {eur(e.amount, { signed: true })}</span><span className={styles.muted}>{EQ_ENTRY_TEXT[e.decisionStatus].label}{e.decisionRef ? " : « " + e.decisionRef + " »" : ""}</span></button></li>)}</ul> : <p className={styles.muted}>Aucune écriture appelant une décision sans décision rattachée.</p>}</section>
    <section aria-labelledby="eq-list-divergent"><h3 id="eq-list-divergent"><span>Montant divergent</span> <span>{divergent.length}</span></h3>
      {divergent.length ? <ul>{divergent.map(d => <li key={d.lineId}><button type="button" aria-current={current("decision", d.lineId)} onClick={() => onDecision(d.lineId)}><strong>{d.lineId}</strong><span>voté {eur(d.voted, { signed: true })} · comptabilisé {knownLabel(d.booked)}</span><span className={styles.muted}>écart {d.difference.kind === "known" ? eur(d.difference.value, { signed: true }) : "—"} · {plural(d.entryIds.length, "écriture")}</span></button></li>)}</ul>
        : <p className={styles.muted}>{decisions.some(d => d.status === "reading_required") ? "Aucun écart établi ; des comparaisons attendent la lecture du PV." : "Aucun montant divergent sur les décisions lues."}</p>}</section>
  </div>;
}

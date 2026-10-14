"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { PARCOURS_PROCEDURE_LABELS, type ParcoursDecision } from "@/lib/workpapers/capitaux-parcours";
import { PAYMENT_STATUS_LABELS } from "@/lib/workpapers/capitaux-payment";
import { dateFr, eur, knownLabel } from "../format";
import { CORRESPONDENCE_LABELS } from "./format";
import styles from "../../cash/cash.module.css";
import pc from "./parcours.module.css";

export interface ParcoursDetailHandle { focus(): void }
/** Detail of the selected economic decision: each trace opens its original sheet at its exact version, with the dossier context. */
export const ParcoursDetail = forwardRef<ParcoursDetailHandle, { decision: ParcoursDecision | null; onReturn(): void }>(function ParcoursDetail({ decision, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  const d = decision;
  return <aside className={styles.detail} aria-labelledby="pc-detail-title" data-open={!!d}>
    <h2 id="pc-detail-title" ref={heading} tabIndex={-1}>{d ? `Décision du ${dateFr(d.decisionDate)} — ${d.typeLabel}` : "Détail d’une décision"}</h2>
    {!d ? <p className={styles.muted}>Choisissez une décision dans le tableau : ses feuilles d’origine, son PV, sa comptabilisation et son paiement s’affichent ici.</p> : <>
      <p><span className={pc.corr} data-corr={d.correspondence}>{CORRESPONDENCE_LABELS[d.correspondence]}</span></p>
      <p className={styles.muted}>{d.reason}</p>
      <dl>
        <dt>Organe</dt><dd>{d.organ || "Non indiqué"}</dd>
        <dt>Date(s) d’effet</dt><dd>{d.effectDates.map(dateFr).join(", ")}</dd>
        <dt>PV cité</dt><dd>{d.pv ? `${d.pv.pieceRef ?? d.pv.fileName}, page ${d.pv.page}` : "Aucun PV commun"}{d.pv && <code>SHA-256 {d.pv.sha256}</code>}</dd>
        <dt>Montant de la décision</dt><dd>{knownLabel(d.magnitude)}</dd>
        <dt>Comptabilisé</dt><dd>{knownLabel(d.booked)}</dd>
        <dt>Paiement</dt><dd>{d.payment ? <>{PAYMENT_STATUS_LABELS[d.payment.status]} · voté {knownLabel(d.payment.voted)} · payé à la clôture {knownLabel(d.payment.paidAtClosing)} · payé à la revue {knownLabel(d.payment.paidAtReview)} · reste {knownLabel(d.payment.remainingAtReview)}<span className={styles.meaning}>{d.payment.meaning}</span></> : "Non comparé"}</dd>
      </dl>
      {d.amendments.length > 0 && <><h3>Historique d’amendement</h3><ul className={styles.list}>{d.amendments.map(a => <li key={a.lineId}><div className={styles.kv}><strong>{a.lineId}</strong><span>décision du {dateFr(a.decisionDate)}</span><span>voté {eur(a.voted, { signed: true })}</span><span>PV {a.pieceRef || "non cité"}</span></div><p className={styles.muted}>Ligne remplacée : visible, jamais comptée une seconde fois.</p></li>)}</ul></>}
      <h3>Feuilles d’origine</h3>
      <ul className={pc.traces}>{d.traces.map(t => <li key={t.id}>
        <div className={styles.kv}><strong>{PARCOURS_PROCEDURE_LABELS[t.procedure]}</strong><span>règle {t.ruleVersion}</span><span>r{t.revision} · v{t.version}</span>{t.id === d.reference && <span>référence de la ligne</span>}</div>
        <p>{t.decisionRefs.join(", ")} · {t.statusLabel}<span className={styles.meaning}>{t.reading} · comptabilisé {knownLabel(t.booked)} · montant {knownLabel(t.magnitude)}</span></p>
        {t.stale && <p className={styles.notice} data-tone="danger">{t.staleReasons.join(" ")}</p>}
        <DossierContextAnchor href={t.href}>Ouvrir dans la feuille d’origine (version {t.version})</DossierContextAnchor>
      </li>)}</ul>
      <button type="button" onClick={onReturn}>Revenir au tableau des décisions</button>
    </>}
  </aside>;
});

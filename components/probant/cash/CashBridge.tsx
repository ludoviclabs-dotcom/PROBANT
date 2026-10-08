"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cents, type Money } from "@/lib/canonical-model/money";
import type { CashAccountResult } from "@/lib/workpapers/cash-reconciliation";
import { eur } from "./format";
import styles from "./cash.module.css";

export type BridgeStepId = "statement" | "receipt_in_transit" | "outstanding_payment" | "other" | "reconstructed" | "ledger" | "difference";
type Computed = Extract<CashAccountResult["bridge"], { status: "computed" }>;
const toNumber = (m: Money) => Number(cents(m)) / 100;
export interface BridgeHandle { focusStep(id: BridgeStepId): void }
/**
 * Horizontal waterfall: each step is a button with its value written in clear.
 * Suspense steps filter the table; balance steps open their source. The table below repeats every value.
 */
export const CashBridge = forwardRef<BridgeHandle, { bridge: Computed; active: BridgeStepId | null; onStep: (id: BridgeStepId) => void; counts: Record<"receipt_in_transit" | "outstanding_payment" | "other", number> }>(function CashBridge({ bridge, active, onStep, counts }, ref) {
  const buttons = useRef<Partial<Record<BridgeStepId, HTMLButtonElement | null>>>({});
  useImperativeHandle(ref, () => ({ focusStep: id => buttons.current[id]?.focus() }), []);
  // Numbers serve the bar geometry only; every displayed value is the exact server string.
  const statement = toNumber(bridge.statement.amount), receipts = toNumber(bridge.receiptsInTransit), payments = toNumber(bridge.outstandingPayments);
  const reconstructed = toNumber(bridge.reconstructed), ledger = toNumber(bridge.ledger.amount), difference = toNumber(bridge.difference);
  const points = [0, statement, statement + receipts, statement + receipts + payments, reconstructed, ledger];
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const segment = (from: number, to: number) => ({ left: ((Math.min(from, to) - min) / span) * 100 + "%", width: Math.max(0.6, (Math.abs(to - from) / span) * 100) + "%" });
  const zeroLeft = ((0 - min) / span) * 100;
  const steps: { id: BridgeStepId; label: string; hint: string; value: Money; signed?: boolean; from: number; to: number; kind: string }[] = [
    { id: "statement", label: "Solde du relevé à la clôture", hint: "Source : relevé bancaire", value: bridge.statement.amount, from: 0, to: statement, kind: "statement" },
    { id: "receipt_in_transit", label: "+ Remises non créditées", hint: counts.receipt_in_transit + " suspens · filtrer la table", value: bridge.receiptsInTransit, signed: true, from: statement, to: statement + receipts, kind: "receipt" },
    { id: "outstanding_payment", label: "− Paiements non débités", hint: counts.outstanding_payment + " suspens · filtrer la table", value: bridge.outstandingPayments, signed: true, from: statement + receipts, to: statement + receipts + payments, kind: "payment" },
    { id: "other", label: "± Autres suspens", hint: counts.other + " suspens · filtrer la table", value: bridge.otherItems, signed: true, from: statement + receipts + payments, to: reconstructed, kind: "other" },
    { id: "reconstructed", label: "= Solde reconstitué", hint: "Relevé + suspens", value: bridge.reconstructed, from: 0, to: reconstructed, kind: "total" },
    { id: "ledger", label: "Solde comptable (GL)", hint: "Source : grand livre", value: bridge.ledger.amount, from: 0, to: ledger, kind: "ledger" },
  ];
  const ok = difference === 0;
  return <div>
    <ol className={styles.bridge} aria-label="Pont de rapprochement — chaque étape est un bouton">
      {steps.map(s => <li key={s.id}><button type="button" ref={el => { buttons.current[s.id] = el; }} className={styles.step} data-kind={s.kind} aria-pressed={active === s.id} onClick={() => onStep(s.id)}
        aria-label={`${s.label} : ${eur(s.value, { signed: s.signed })}. ${s.hint}`}>
        <span className={styles.stepLabel}>{s.label}<small>{s.hint}</small></span>
        <span className={styles.track} aria-hidden="true">{min < 0 && <span className={styles.zero} style={{ left: zeroLeft + "%" }}/>}<span className={styles.bar} data-kind={s.kind} style={segment(s.from, s.to)}/></span>
        <span className={styles.stepValue}>{eur(s.value, { signed: s.signed })}</span>
      </button></li>)}
      <li><button type="button" ref={el => { buttons.current.difference = el; }} className={styles.step} data-kind="difference" aria-pressed={active === "difference"} onClick={() => onStep("difference")}
        aria-label={`Écart du pont, GL moins reconstitué : ${eur(bridge.difference, { signed: true })}. ${ok ? "Aucun écart arithmétique ; ne démontre pas l’authenticité." : "Écart à expliquer."}`}>
        <span className={styles.stepLabel}>Écart du pont<small>GL − reconstitué · distinct des écarts de source</small></span>
        <span className={styles.track} aria-hidden="true">{!ok && <span className={styles.bar} data-kind="difference" style={segment(reconstructed, ledger)}/>}</span>
        <span className={`${styles.stepValue} ${ok ? styles.differenceOk : styles.differenceKo}`}>{eur(bridge.difference, { signed: true })}{ok ? " · aucun écart" : " · à expliquer"}</span>
      </button></li>
    </ol>
    <details className={styles.altTable}><summary>Alternative tabulaire du pont</summary>
      <table><caption>Pont de rapprochement — montants signés en EUR, convention : positif augmente le solde comptable</caption><thead><tr><th scope="col">Étape</th><th scope="col" className={styles.money}>Montant</th></tr></thead>
        <tbody>{steps.map(s => <tr key={s.id}><th scope="row">{s.label}</th><td className={styles.money}>{eur(s.value, { signed: s.signed })}</td></tr>)}<tr><th scope="row">Écart du pont (GL − reconstitué)</th><td className={styles.money}>{eur(bridge.difference, { signed: true })}</td></tr></tbody></table>
    </details>
  </div>;
});

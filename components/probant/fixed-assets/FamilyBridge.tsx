"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cents, type Money } from "@/lib/canonical-model/money";
import type { FixedAssetResult } from "@/lib/workpapers/fixed-asset-review";
import type { FaTable } from "@/lib/workpapers/fixed-asset-sources";
import { eur, plural, TABLE_LABELS, TABLE_UNITS } from "./format";
import type { BridgeFilter } from "./types";
import styles from "../cash/cash.module.css";

type FamilyTable = FixedAssetResult["families"][number]["tables"]["gross"];
export type FamilyStepId = "opening" | "addition" | "disposal" | "reversal" | "reclassification" | "expected" | "closing" | "difference";
export interface FamilyBridgeHandle { focusStep(id: FamilyStepId): void }
const toNumber = (m: Money) => Number(cents(m)) / 100;
/**
 * Waterfall of one family for one table: every step is a button with its exact server value.
 * Variation steps filter the asset table; the alternative table repeats every value with its unit.
 */
export const FamilyBridge = forwardRef<FamilyBridgeHandle, { family: string; table: FaTable; data: FamilyTable; active: BridgeFilter; counts: Record<Exclude<BridgeFilter, null>, number>; onStep(id: FamilyStepId): void }>(function FamilyBridge({ family, table, data, active, counts, onStep }, ref) {
  const buttons = useRef<Partial<Record<FamilyStepId, HTMLButtonElement | null>>>({});
  useImperativeHandle(ref, () => ({ focusStep: id => buttons.current[id]?.focus() }), []);
  // Numbers serve the bar geometry only; every displayed value is the exact server string.
  const opening = toNumber(data.opening), additions = toNumber(data.additions), disposals = toNumber(data.disposals), reversals = toNumber(data.reversals), reclass = toNumber(data.reclassifications);
  const expected = toNumber(data.expected), closing = toNumber(data.closing);
  const afterAdd = opening + additions, afterDisposal = afterAdd - disposals, afterReversal = afterDisposal - reversals;
  const points = [0, opening, afterAdd, afterDisposal, afterReversal, expected, closing];
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const segment = (from: number, to: number) => ({ left: ((Math.min(from, to) - min) / span) * 100 + "%", width: Math.max(0.6, (Math.abs(to - from) / span) * 100) + "%" });
  const neg = (m: Money) => ({ amount: m.amount.startsWith("-") || m.amount === "0.00" ? m.amount : "-" + m.amount, currency: m.currency } as Money);
  const steps: { id: FamilyStepId; label: string; hint: string; value: Money; signed?: boolean; from: number; to: number; kind: string }[] = [
    { id: "opening", label: "Ouverture", hint: "Registre en début d’exercice", value: data.opening, from: 0, to: opening, kind: "statement" },
    { id: "addition", label: "+ Entrées", hint: plural(counts.addition, "actif") + " · filtrer", value: data.additions, signed: true, from: opening, to: afterAdd, kind: "receipt" },
    { id: "disposal", label: "− Sorties", hint: plural(counts.disposal, "actif") + " · filtrer", value: neg(data.disposals), signed: true, from: afterAdd, to: afterDisposal, kind: "payment" },
    ...(table === "impairment" ? [{ id: "reversal" as const, label: "− Reprises", hint: plural(counts.reversal, "actif") + " · filtrer", value: neg(data.reversals), signed: true, from: afterDisposal, to: afterReversal, kind: "payment" }] : []),
    { id: "reclassification", label: "± Reclassements", hint: plural(counts.reclassification, "actif") + " · filtrer", value: data.reclassifications, signed: true, from: afterReversal, to: afterReversal + reclass, kind: "other" },
    { id: "expected", label: "= Clôture attendue", hint: "Ouverture + mouvements", value: data.expected, from: 0, to: expected, kind: "total" },
    { id: "closing", label: "Clôture observée", hint: "Registre à la clôture", value: data.closing, from: 0, to: closing, kind: "ledger" },
  ];
  const ok = cents(data.difference) === 0n && data.unitsWithDifference === 0;
  const caption = `Pont ${TABLE_LABELS[table]} — ${family} : ${TABLE_UNITS[table]} en EUR`;
  return <div>
    {data.inScopeUnits === 0 && <p className={styles.notice} role="note">Aucun actif testé dans cette famille : tous ses actifs sont exclus avec motif (voir le tableau).</p>}
    {!data.complete && data.inScopeUnits > 0 && <p className={styles.notice} role="note">Pont partiel : {data.computedUnits}/{data.inScopeUnits} actifs calculés. Les tableaux incomplets restent hors du pont, jamais comptés à zéro.</p>}
    <ol className={styles.bridge} aria-label={caption + " — chaque étape est un bouton"}>
      {steps.map(s => {
        const filters = s.id === "addition" || s.id === "disposal" || s.id === "reversal" || s.id === "reclassification";
        return <li key={s.id}><button type="button" ref={el => { buttons.current[s.id] = el; }} className={styles.step} data-kind={s.kind} aria-pressed={filters ? active === s.id : undefined} onClick={() => onStep(s.id)}
          aria-label={`${s.label} : ${eur(s.value, { signed: s.signed })}. ${s.hint}`}>
          <span className={styles.stepLabel}>{s.label}<small>{s.hint}</small></span>
          <span className={styles.track} aria-hidden="true"><span className={styles.bar} data-kind={s.kind} style={segment(s.from, s.to)}/></span>
          <span className={styles.stepValue}>{eur(s.value, { signed: s.signed })}</span>
        </button></li>;
      })}
      <li><button type="button" ref={el => { buttons.current.difference = el; }} className={styles.step} data-kind="difference" aria-pressed={active === "difference"} onClick={() => onStep("difference")}
        aria-label={`Écart, clôture observée moins attendue : ${eur(data.difference, { signed: true })} ; ${plural(data.unitsWithDifference, "actif")} en écart, brut non compensé ${eur(data.absoluteDifference)}. ${ok ? "Aucun écart arithmétique ; ne démontre ni l’existence ni la valeur." : "Écart à expliquer ; filtrer les actifs."}`}>
        <span className={styles.stepLabel}>Écart<small>observée − attendue · {plural(data.unitsWithDifference, "actif")} · brut {eur(data.absoluteDifference)}</small></span>
        <span className={styles.track} aria-hidden="true">{!ok && <span className={styles.bar} data-kind="difference" style={segment(expected, closing)}/>}</span>
        <span className={`${styles.stepValue} ${ok ? styles.differenceOk : styles.differenceKo}`}>{eur(data.difference, { signed: true })}{ok ? " · aucun écart" : " · à expliquer"}</span>
      </button></li>
    </ol>
    <details className={styles.altTable}><summary>Alternative tabulaire du pont</summary>
      <table><caption>{caption} ; sorties et reprises en négatif ; {data.computedUnits}/{data.inScopeUnits} actifs calculés</caption><thead><tr><th scope="col">Étape</th><th scope="col" className={styles.money}>Montant</th></tr></thead>
        <tbody>{steps.map(s => <tr key={s.id}><th scope="row">{s.label}</th><td className={styles.money}>{eur(s.value, { signed: s.signed })}</td></tr>)}<tr><th scope="row">Écart (observée − attendue)</th><td className={styles.money}>{eur(data.difference, { signed: true })}</td></tr><tr><th scope="row">Écarts bruts non compensés</th><td className={styles.money}>{eur(data.absoluteDifference)}</td></tr></tbody></table>
    </details>
  </div>;
});

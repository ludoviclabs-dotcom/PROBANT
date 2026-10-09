"use client";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { EQ_DECISION_TEXT, type EquityDecisionResult } from "@/lib/workpapers/capitaux-review";
import { dateFr, plural, TIMING_LABELS } from "./format";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

const day = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;
const SEVERITY = ["without_entry", "amount_divergent", "effect_outside_period", "reading_required", "matched", "not_expected", "prior_period", "excluded"] as const;
/** Decisions on a date axis: the financial year, then the period after closing up to the review date. Positions only; an alternative table carries the same facts. */
export function DecisionTimeline({ decisions, period, selectedLine, onSelect }: { decisions: EquityDecisionResult[]; period: AccountingPeriod; selectedLine: string | null; onSelect(lineId: string): void }) {
  const groups = [...new Set(decisions.map(d => d.decisionId))].map(id => {
    const lines = decisions.filter(d => d.decisionId === id), first = lines[0];
    const worst = [...lines].sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status))[0].status;
    const effects = [...new Set(lines.map(l => l.effectDate))].sort();
    return { id, organ: first.organ, date: first.decisionDate, effects, lines, worst, pv: first.pv.pieceRef, pvStatus: first.pv.status };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!groups.length) return <p className={styles.muted}>Aucune décision dans le registre figé.</p>;
  const dates = [period.startDate, period.asOfDate, ...groups.flatMap(g => [g.date, ...g.effects])].map(day);
  const from = Math.min(...dates), to = Math.max(...dates), span = Math.max(1, to - from), x = (date: string) => ((day(date) - from) / span) * 100;
  const pct = (v: number) => Math.max(0, Math.min(100, v)).toFixed(2) + "%";
  return <div>
    <div className={eq.timeline} role="group" aria-label="Frise des décisions">
      <div className={eq.axis} aria-hidden="true">
        <span className={eq.band} data-band="period" style={{ left: pct(x(period.startDate)), width: pct(x(period.closingDate) - x(period.startDate)) }}>Exercice {dateFr(period.startDate)} → {dateFr(period.closingDate)}</span>
        <span className={eq.band} data-band="after" style={{ left: pct(x(period.closingDate)), width: pct(x(period.asOfDate) - x(period.closingDate)) }} title={"Après clôture, jusqu’à la revue du " + dateFr(period.asOfDate)}>Après clôture</span>
      </div>
      <ol className={eq.markers}>{groups.map((g, i) => {
        const left = x(g.date), selected = g.lines.some(l => l.lineId === selectedLine);
        return <li key={g.id} data-lane={i % 2} data-edge={left > 72 ? "end" : undefined} style={{ left: pct(left) }}>
          <button type="button" aria-pressed={selected} onClick={() => onSelect(g.lines[0].lineId)} aria-label={`${g.id} — ${g.organ || "organe non indiqué"}, décision du ${dateFr(g.date)}, ${plural(g.lines.length, "ligne")}, ${EQ_DECISION_TEXT[g.worst].label}`}>
            <strong>{g.id}</strong><small>{g.organ ? g.organ + " · " : ""}{dateFr(g.date)} · {plural(g.lines.length, "ligne")}</small>
            <small>{g.pvStatus === "available" ? "PV " + g.pv : g.pv ? "PV " + g.pv + " absent" : "PV non cité"}</small>
            <span className={eq.status} data-status={g.worst}>{EQ_DECISION_TEXT[g.worst].label}</span>
            {g.effects.some(e => e !== g.date) && <span className={eq.effect}>effet au {g.effects.map(dateFr).join(", ")}</span>}
          </button></li>;
      })}</ol>
    </div>
    <details className={styles.altTable}><summary>Alternative tabulaire de la frise</summary>
      <div className={styles.tableScroll} role="region" aria-label="Décisions — alternative tabulaire" tabIndex={0}><table><caption>Décisions par date, avec date d’effet et situation par rapport à l’exercice</caption>
        <thead><tr><th scope="col">Décision</th><th scope="col">Organe</th><th scope="col">Date de décision</th><th scope="col">Date(s) d’effet</th><th scope="col">Situation</th><th scope="col">Lignes</th><th scope="col">Statut le plus sévère</th></tr></thead>
        <tbody>{groups.map(g => <tr key={g.id}><th scope="row">{g.id}</th><td>{g.organ || "—"}</td><td>{dateFr(g.date)}</td><td>{g.effects.map(dateFr).join(", ")}</td><td>{[...new Set(g.lines.map(l => TIMING_LABELS[l.timing]))].join(" ; ")}</td><td>{g.lines.length}</td><td>{EQ_DECISION_TEXT[g.worst].label}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}

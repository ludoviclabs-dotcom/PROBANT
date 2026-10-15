import {
  cents,
  money,
  type KnownAmount,
  type Money,
} from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen } from "./model";
import {
  qualifyPayrollSource,
  payrollEvents,
  payrollLines,
} from "./payroll-import";
import type {
  PayrollEvent,
  PayrollKind,
  PayrollLine,
  PayrollModule,
  PayrollState,
} from "./payroll-contract";
export const unknown = (reason: string): KnownAmount => ({
  kind: "unknown",
  reason,
});
export const known = (value: Money): KnownAmount => ({ kind: "known", value });
export function sumRows(
  rows: PayrollLine[],
  field: "amount" | "base" = "amount",
): KnownAmount {
  if (!rows.length || rows.some((r) => r[field] === null))
    return unknown("Source ou base non fournie pour ce périmètre");
  return known(money(rows.reduce((a, r) => a + cents(r[field]!), 0n)));
}
export function difference(
  a: KnownAmount,
  b: KnownAmount,
  comparable: boolean,
): KnownAmount {
  return comparable && a.kind === "known" && b.kind === "known"
    ? known(money(cents(a.value) - cents(b.value)))
    : unknown("Périmètres, sources ou mapping non comparables");
}
export const dependencies: Record<PayrollModule, PayrollKind[]> = {
  framing: ["journal", "ledger", "events"],
  settlements: ["journal", "ledger", "declaration", "payments", "events"],
  leave: ["leave"],
};
export function payrollInputHash(state: PayrollState, module: PayrollModule) {
  return stableSha256({
    version: "payroll-review-1",
    module,
    scope: state.scope,
    period: state.period,
    sources: dependencies[module].map((k) => state.sources[k] ?? null),
    exclusions: module === "leave" ? [] : state.exclusions,
  });
}
/** Semantic dependencies of one posting month; byte identity remains in immutable source history. */
export function payrollGroupHash(state: PayrollState, module: PayrollModule, key: string) {
  const parts = key.split("|"), month = parts[1];
  const [y, m] = month.split("-").map(Number);
  const previous = String(m === 1 ? y - 1 : y) + "-" + String(m === 1 ? 12 : m - 1).padStart(2, "0");
  const related = (r: Record<string, string>) => r.establishment === parts[0] && r.rubric === parts[2] && r.organism === parts[3] && (r.month === month || (module === "framing" && r.month === previous));
  const sameBasis = (r: Record<string, string>) => related(r) && r.basisCode === parts[4];
  // Event rows have no basis; payment references may intentionally connect months and bases.
  const paymentRefs = new Set((state.sources.payments?.batch.rows.filter(r => sameBasis(r.original)).flatMap(r => r.original.paymentRef ? [r.original.paymentRef] : [])) ?? []);
  const basisJournalRowIds = new Set((state.sources.journal?.batch.rows ?? []).filter(r => sameBasis(r.original)).map(r => r.id));
  const units = new Set(payrollPopulation(state).filter(u => u.month === month && u.establishment === parts[0] && u.rubric === parts[2] && u.organism === parts[3] && u.rowIds.some(id => basisJournalRowIds.has(id))).map(u => u.id));
  return stableSha256({ version: "payroll-period-2", scope: state.scope, period: state.period, module, key,
    sources: dependencies[module].map(kind => {
      const source = state.sources[kind]; if (!source) return null;
      return { kind, mapping: { version: source.mapping.version, qualified: source.mapping.qualified, coverage: source.mapping.coverage, synthetic: source.mapping.synthetic },
        rows: source.batch.rows.map(r => r.original).filter(r => (kind === "events" ? related(r) : sameBasis(r)) || (kind === "payments" && r.establishment === parts[0] && r.organism === parts[3] && paymentRefs.has(r.paymentRef))).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
    }), exclusions: state.exclusions.filter(e => units.has(e.unitId)) });
}
export function sourceReady(state: PayrollState, kind: PayrollKind): boolean {
  const s = state.sources[kind];
  if (!s) return false;
  // Monthly aggregates cannot prove a partial first/last accounting month.
  const closing = new Date(state.period.closingDate + "T00:00:00Z");
  const lastDay = new Date(
    Date.UTC(closing.getUTCFullYear(), closing.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (
    kind !== "leave" &&
    (!state.period.startDate.endsWith("-01") ||
      closing.getUTCDate() !== lastDay)
  )
    return false;
  assertScope(state.scope, s.batch.scope);
  qualifyPayrollSource(s);
  for (const r of s.batch.rows) assertScope(state.scope, r.scope);
  return (
    !!s.batch.approval &&
    s.batch.report.calculationAllowed &&
    s.mapping.qualified &&
    s.mapping.coverage === "complete"
  );
}
export function lines(
  state: PayrollState,
  kind: "journal" | "ledger" | "declaration" | "payments",
) {
  const s = state.sources[kind];
  return s && sourceReady(state, kind) ? payrollLines(s) : [];
}
export function events(state: PayrollState) {
  const s = state.sources.events;
  return s && sourceReady(state, "events") ? payrollEvents(s) : [];
}
export const groupKey = (
  r: Pick<
    PayrollLine,
    "establishment" | "month" | "rubric" | "organism" | "basisCode"
  >,
) => [r.establishment, r.month, r.rubric, r.organism, r.basisCode].join("|");
export const within = (s: PayrollState, month: string) =>
  month >= s.period.startDate.slice(0, 7) &&
  month <= s.period.closingDate.slice(0, 7);
export interface PayrollUnit {
  id: string;
  pseudonym: string;
  month: string;
  rubric: string;
  establishment: string;
  organism: string;
  rowIds: string[];
  excluded: boolean;
  reason: string | null;
}
/** Employee × posting month × rubric. Facility, organism and basis retain partitioning; exit never excludes an employee. */
export function payrollPopulation(state: PayrollState): PayrollUnit[] {
  const groups = new Map<string, PayrollLine[]>();
  for (const line of lines(state, "journal")) {
    const key = groupKey(line) + "|" + line.pseudonym;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return [...groups].map(([key, rows]) => {
    const r = rows[0],
      id = stableSha256(key),
      e = state.exclusions.find((x) => x.unitId === id),
      outside = !within(state, r.month);
    return {
      id,
      pseudonym: r.pseudonym!,
      month: r.month,
      rubric: r.rubric,
      establishment: r.establishment,
      organism: r.organism,
      rowIds: rows.map((x) => x.id),
      excluded: !!e || outside,
      reason: outside ? "outside_reporting_period" : (e?.reason ?? null),
    };
  });
}
export function matchesEvent(
  event: PayrollEvent,
  row: Pick<PayrollLine, "establishment" | "month" | "rubric" | "organism">,
) {
  return (
    event.establishment === row.establishment &&
    event.month === row.month &&
    event.rubric === row.rubric &&
    event.organism === row.organism
  );
}
const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
};
export function buildPayrollFraming(state: PayrollState) {
  const journalReady = sourceReady(state, "journal"),
    ledgerReady = sourceReady(state, "ledger");
  const journal = lines(state, "journal"),
    ledger = lines(state, "ledger"),
    proofs = events(state),
    population = payrollPopulation(state),
    inputHash = payrollInputHash(state, "framing");
  const all = [...journal, ...ledger].filter((r) => within(state, r.month)),
    keys = [...new Set(all.map(groupKey))].sort();
  const groups = keys.map((key) => {
    const r = all.find((x) => groupKey(x) === key)!,
      j = journal.filter((x) => groupKey(x) === key),
      gl = ledger.filter((x) => groupKey(x) === key),
      units = population.filter((u) =>
        u.rowIds.some((id) => j.some((x) => x.id === id)),
      );
    const current = sumRows(j),
      booked = sumRows(gl),
      complete = journalReady && ledgerReady && [...j, ...gl].every(x => x.base !== null) && units.every((u) => !u.excluded);
    const delta = difference(booked, current, complete),
      prev = journal.filter(
        (x) =>
          groupKey(x) ===
          [
            r.establishment,
            previousMonth(r.month),
            r.rubric,
            r.organism,
            r.basisCode,
          ].join("|"),
      );
    const previousUnits = population.filter((u) =>
      u.rowIds.some((id) => prev.some((x) => x.id === id)),
    );
    const groupHash = payrollGroupHash(state, "framing", key);
    const review = state.reviews.find(
      (x) => x.module === "framing" && x.targetId === stableSha256(key),
    );
    return {
      id: stableSha256(key),
      inputHash: groupHash,
      establishment: r.establishment,
      month: r.month,
      rubric: r.rubric,
      organism: r.organism,
      basisCode: r.basisCode,
      journal: current,
      ledger: booked,
      base: sumRows(j, "base"),
      delta,
      variation: difference(
        current,
        sumRows(prev),
        complete && prev.length > 0 && prev.every(x => x.base !== null) && previousUnits.every((u) => !u.excluded),
      ),
      previousMonth: previousMonth(r.month),
      details: j,
      evidence: proofs.filter((p) => matchesEvent(p, r)),
      coverage: {
        included: units.filter((u) => !u.excluded).length,
        excluded: units.filter((u) => u.excluded).length,
      },
      status:
        delta.kind !== "known"
          ? ("blocked" as const)
          : review?.inputHash === groupHash
            ? ("documented" as const)
            : review
              ? ("stale" as const)
              : cents(delta.value) !== 0n
                ? ("to_explain" as const)
                : ("matched" as const),
    };
  });
  return frozen({
    module: "framing" as const,
    inputHash,
    groups,
    population,
    sourceComplete: journalReady && ledgerReady,
    limitations: [
      "Écart arithmétique soumis à revue ; aucune anomalie validée automatiquement.",
      "La couverture complète est déclarée par le pack, sans preuve externe d’exhaustivité.",
      "Les salariés sortis et les rappels restent dans la population. Les exclusions partielles bloquent les comparaisons avec des totaux agrégés.",
    ],
  });
}
export type PayrollFraming = ReturnType<typeof buildPayrollFraming>;

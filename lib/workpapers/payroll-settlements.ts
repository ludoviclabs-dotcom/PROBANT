import { cents } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { frozen } from "./model";
import {
  difference,
  events,
  groupKey,
  lines,
  matchesEvent,
  payrollInputHash,
  payrollPopulation,
  sourceReady,
  sumRows,
  unknown,
  within,
} from "./payroll-framing";
import type { PayrollLine, PayrollState } from "./payroll-contract";
export function buildPayrollSettlements(state: PayrollState) {
  const ready = {
    journal: sourceReady(state, "journal"),
    ledger: sourceReady(state, "ledger"),
    declaration: sourceReady(state, "declaration"),
    payments: sourceReady(state, "payments"),
  };
  const journal = lines(state, "journal"),
    ledger = lines(state, "ledger"),
    decl = lines(state, "declaration"),
    payments = lines(state, "payments"),
    proofs = events(state),
    units = payrollPopulation(state),
    inputHash = payrollInputHash(state, "settlements");
  const all = [...journal, ...ledger, ...decl, ...payments].filter((r) =>
      within(state, r.month),
    ),
    keys = [...new Set(all.map(groupKey))].sort();
  // A repeated bank reference is a blocking candidate, never silently deduplicated. Split allocations require a validated future mapping.
  const active = payments.filter((p) => p.paymentStatus === "posted");
  const referenceKey = (p: PayrollLine) =>
    [p.establishment, p.organism, p.paymentRef].join("|");
  const referenceCounts = new Map<string, number>();
  for (const p of active) {
    const key = referenceKey(p);
    referenceCounts.set(key, (referenceCounts.get(key) ?? 0) + 1);
  }
  const duplicateRefs = new Set(
    [...referenceCounts].filter(([, count]) => count > 1).map(([key]) => key),
  );
  return frozen({
    module: "settlements" as const,
    inputHash,
    groups: keys.map((key) => {
      const r = all.find((x) => groupKey(x) === key)!,
        j = journal.filter((x) => groupKey(x) === key),
        gl = ledger.filter((x) => groupKey(x) === key),
        d = decl.filter((x) => groupKey(x) === key),
        p = active.filter((x) => groupKey(x) === key),
        u = units.filter((x) =>
          x.rowIds.some((id) => j.some((row) => row.id === id)),
        );
      const declaration = sumRows(d),
        booked = sumRows(gl),
        duplicates = p.filter((x) => duplicateRefs.has(referenceKey(x))),
        future = p.some((x) => x.date > state.period.asOfDate),
        paid = duplicates.length
          ? unknown("Référence de paiement répétée : affectation à revoir")
          : future
            ? unknown("Paiement après la date de revue")
            : sumRows(p);
      const same =
          ready.journal &&
          ready.ledger &&
          ready.declaration &&
          u.every((x) => !x.excluded),
        glDelta = difference(booked, declaration, same),
        journalDelta = difference(sumRows(j), declaration, same),
        paymentDelta = difference(paid, declaration, same && ready.payments);
      const review = state.reviews.find(
          (x) => x.module === "settlements" && x.targetId === stableSha256(key),
        ),
        blocked = [glDelta, journalDelta, paymentDelta].some(
          (x) => x.kind !== "known",
        );
      return {
        id: stableSha256(key),
        establishment: r.establishment,
        month: r.month,
        rubric: r.rubric,
        organism: r.organism,
        basisCode: r.basisCode,
        declaration,
        ledger: booked,
        journal: sumRows(j),
        paid,
        glDelta,
        journalDelta,
        paymentDelta,
        duplicates: duplicates.map((x) => ({ id: x.id, proof: x.proof })),
        payments: p,
        cancelled: payments.filter(
          (x) => groupKey(x) === key && x.paymentStatus === "cancelled",
        ),
        evidence: proofs.filter((x) => matchesEvent(x, r)),
        status: blocked
          ? ("blocked" as const)
          : review?.inputHash === inputHash
            ? ("documented" as const)
            : review
              ? ("stale" as const)
              : [glDelta, journalDelta, paymentDelta].some(
                    (x) => x.kind === "known" && cents(x.value) !== 0n,
                  )
                ? ("to_explain" as const)
                : ("matched" as const),
      };
    }),
    limitations: [
      "Le mois de rattachement est fourni par le mapping ; la date bancaire reste distincte.",
      "La répétition d’une référence bloque le total payé ; aucun paiement n’est effacé.",
      "Un fichier nommé DSN est traité comme un export CSV qualifié, jamais comme une DSN native.",
    ],
  });
}
export type PayrollSettlements = ReturnType<typeof buildPayrollSettlements>;

import { comparePaidLeave, type PaidLeaveInput } from "./paid-leave";
import { leaveSchema, payrollProof } from "./payroll-import";
import { payrollInputHash, sourceReady } from "./payroll-framing";
import { frozen } from "./model";
import type { PayrollState } from "./payroll-contract";
export function buildPayrollLeave(state: PayrollState) {
  const source = state.sources.leave,
    ready = sourceReady(state, "leave");
  return frozen({
    module: "leave" as const,
    inputHash: payrollInputHash(state, "leave"),
    sourceReady: ready,
    rows:
      source && ready
        ? source.batch.rows.map((row) => {
            const p = leaveSchema.parse(row.original),
              proof = payrollProof(source, row.id),
              rights = {
                employeePseudonym: p.pseudonym,
                from: p.from,
                to: p.to,
                unit: p.unit,
                acquired: p.acquired,
                taken: p.taken,
                remaining: p.remaining,
              };
            const method =
              p.ruleApproved === "yes"
                ? {
                    id: p.ruleRef,
                    version: p.ruleVersion,
                    source: `Pièce ${p.pieceRef}, page ${p.page}`,
                    from: p.validFrom,
                    to: p.validTo,
                    approvedBy: source.batch.approval!.actorId,
                    synthetic: source.mapping.synthetic,
                  }
                : null;
            const first = {
              rights,
              method,
              base: {
                amount: { amount: p.firstBase, currency: "EUR" as const },
                date: p.date,
                basis: p.ruleRef,
                evidence: [proof],
              },
              numerator: p.firstNumerator,
              denominator: p.firstDenominator,
              inclusions: p.firstInclusions?.split("|") ?? (state.scope.mode === "demo" ? ["Base décrite par la méthode importée"] : []),
              exclusions: p.firstExclusions?.split("|") ?? (state.scope.mode === "demo" ? ["Charges associées et extrapolation non fournies"] : []),
            };
            const second = {
              ...first,
              inclusions: p.secondInclusions?.split("|") ?? (state.scope.mode === "demo" ? first.inclusions : []),
              exclusions: p.secondExclusions?.split("|") ?? (state.scope.mode === "demo" ? first.exclusions : []),
              rights: {
                ...rights,
                unit: p.secondUnit,
                from: p.secondFrom,
                to: p.secondTo,
              },
              base: {
                ...first.base,
                amount: { amount: p.secondBase, currency: "EUR" as const },
              },
              numerator: p.secondNumerator,
              denominator: p.secondDenominator,
            };
            const input: PaidLeaveInput = {
              context: {
                scope: state.scope,
                period: state.period,
                purpose: state.scope.mode === "demo" ? "synthetic_technical" : "real",
                procedure: "payroll.leave",
              },
              rights,
              first,
              second,
              comparisonMethod: method,
              equivalenceEvidence: [proof],
              booked: null,
              associatedCharges: p.chargesAmount && p.chargesBasis ? { amount: { amount: p.chargesAmount, currency: "EUR" }, date: p.date, basis: p.chargesBasis, evidence: [proof] } : null,
            };
            try {
              return {
                id: row.id,
                pseudonym: p.pseudonym,
                rights,
                firstBasis: first,
                secondBasis: second,
                rule: {
                  id: p.ruleRef,
                  version: p.ruleVersion,
                  pieceRef: p.pieceRef,
                  page: Number(p.page),
                  from: p.validFrom,
                  to: p.validTo,
                },
                accounting: { qualification: p.accountingQualification ?? "unqualified", reason: p.accountingReason ?? "Qualification comptable non fournie ; dette de personnel, estimation et provision restent distinctes" },
                proof,
                result: comparePaidLeave(input),
                error: null,
              };
            } catch {
              return {
                id: row.id,
                pseudonym: p.pseudonym,
                rights,
                firstBasis: first,
                secondBasis: second,
                rule: {
                  id: p.ruleRef,
                  version: p.ruleVersion,
                  pieceRef: p.pieceRef,
                  page: Number(p.page),
                  from: p.validFrom,
                  to: p.validTo,
                },
                accounting: { qualification: p.accountingQualification ?? "unqualified", reason: p.accountingReason ?? "Qualification comptable non fournie ; dette de personnel, estimation et provision restent distinctes" },
                proof,
                result: null,
                error: "HR_LEAVE_INCONSISTENT",
              };
            }
          })
        : [],
    limitations: [
      "Droits acquis/pris/restants fournis, sans calcul légal automatique.",
      "Les jours ouvrables, jours ouvrés et heures ne sont jamais convertis sans règle validée.",
      "Le montant concerne les droits comparés ; aucune provision des droits restants ni taux social par défaut.",
    ],
  });
}
export type PayrollLeave = ReturnType<typeof buildPayrollLeave>;

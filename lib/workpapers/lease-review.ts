import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { computeLease, LEASE_ENGINE_VERSION, type ClosingFigures, type ContractComputation, type ScheduleRow } from "@/lib/ifrs/leases/engine";
import { qualifyLeases, CONTRACT_STATUSES, type ContractStatus, type LeaseQualification, type QualificationReason, type QualifiedDue, type SourceProof } from "@/lib/ifrs/leases/qualification";
import { LEASE_RULE_BASIS, LEASE_RULE_VERSION } from "@/lib/ifrs/leases/rule";
import type { ImportBatch } from "./imports";
import { leaseFacts } from "./lease-sources";
import type { LeaseWork } from "./lease-work";

const NOT_COMPUTED: Record<Exclude<ContractStatus, "eligible_v1">, string> = { non_location: "non-location documentée", exemption_documentee: "exemption documentée", a_qualifier: "données à compléter", hors_scope_v1: "hors périmètre V1" };
import type { EvidenceLink, Population, SelectionSet, WorkpaperScope } from "./model";

/**
 * Résultat canonique de la feuille « Locations IFRS 16 » (C00 § 4.6, `ifrs16-result-1`) : une seule projection lue par la table, la revue
 * et l'export ; aucun montant n'est recalculé dans React. Le cadrage sur le grand livre PCG et le retraitement de clôture arrivent en L16-03 :
 * tant qu'ils manquent, le résultat de contrôle reste « non concluant », jamais « sans exception ».
 */
export type LeaseResultKind = "computed" | "diagnostic" | "not_commenced" | "not_applicable";
export interface LeaseContractResult {
  contractId: string; version: string | null; status: ContractStatus; reasons: QualificationReason[]; fingerprint: string; dues: QualifiedDue[];
  result: LeaseResultKind; resultReasons: string[];
  exact?: { monthlyRate: string; debtInitial: string }; debtInitial?: Money; depreciationMonths?: number; schedule?: ScheduleRow[]; closing?: ClosingFigures; maxAbsRoundingGap?: Money;
  opening?: Extract<ContractComputation, { result: "computed" | "diagnostic" }>["opening"];
}
export interface LeaseResult {
  schemaVersion: "ifrs16-result-1"; runId: string; scope: WorkpaperScope; period: AccountingPeriod;
  rule: { id: "ifrs16.leases"; version: string; basisStatus: "review_required" | "validated" }; engineVersion: string;
  arithmetic: { scale: 40; rounding: "half_away_from_zero_cent"; publication: "rounded_balances" };
  contracts: LeaseContractResult[];
  portfolio: { byStatus: Record<ContractStatus, number>; byResult: Record<LeaseResultKind, number>; computedSubtotal: null | { label: "contrats calculés"; contracts: number } & Omit<ClosingFigures, "periodStart" | "closing" | "paymentsInPeriod">; blockedIds: string[] };
  coverage: LeaseQualification["coverage"]; orphans: LeaseQualification["orphans"];
  ledgerFraming: null; bundle: null;
  limitations: string[]; evidence: EvidenceLink[];
  outcome: "no_exception_detected" | "exceptions_detected" | "inconclusive";
}
const SUMMED = ["payments", "debtOpening", "additions", "interest", "principal", "debtClosing", "rouGross", "accumulatedOpening", "depreciation", "accumulatedClosing", "rouNetOpening", "rouNetClosing", "openingEquityEffect"] as const;

export function evaluateLeases(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, population: Population, selection: SelectionSet, work: LeaseWork): LeaseResult {
  const facts = leaseFacts(imports.filter(b => population.importIds.includes(b.id)));
  const rule = { id: "ifrs16.leases" as const, version: LEASE_RULE_VERSION, basisStatus: LEASE_RULE_BASIS.status };
  const q = qualifyLeases(facts, period, work, rule), selected = new Set(selection.selectedIds);
  const contracts: LeaseContractResult[] = q.contracts.filter(c => selected.has(c.contractId)).map(c => {
    const base = { contractId: c.contractId, version: c.version, status: c.status, reasons: c.reasons, fingerprint: c.fingerprint, dues: c.dues };
    if (c.status !== "eligible_v1" || !c.inputs) return { ...base, result: "not_applicable" as const, resultReasons: ["Aucun calcul : " + (c.status === "eligible_v1" ? "entrées incomplètes" : NOT_COMPUTED[c.status])] };
    const r = computeLease(c.inputs, period);
    if (r.result === "not_commenced") return { ...base, result: "not_commenced" as const, resultReasons: r.reasons };
    return { ...base, result: r.result, resultReasons: r.reasons, exact: r.exact, debtInitial: r.debtInitial, depreciationMonths: r.depreciationMonths, schedule: r.schedule, closing: r.closing, maxAbsRoundingGap: r.maxAbsRoundingGap, opening: r.opening };
  });
  const computed = contracts.filter(c => c.result === "computed");
  const sum = (k: typeof SUMMED[number]) => money(computed.reduce((t, c) => t + cents(c.closing![k]), 0n));
  const byResult = Object.fromEntries((["computed", "diagnostic", "not_commenced", "not_applicable"] as const).map(k => [k, contracts.filter(c => c.result === k).length])) as Record<LeaseResultKind, number>;
  const byStatus = Object.fromEntries(CONTRACT_STATUSES.map(s => [s, contracts.filter(c => c.status === s).length])) as Record<ContractStatus, number>;
  const proofs = new Map<string, SourceProof>();
  for (const c of q.contracts.filter(x => selected.has(x.contractId))) for (const p of c.evidence) proofs.set(p.rowId, p);
  const evidence: EvidenceLink[] = [...proofs.values()].sort((a, b) => (a.rowId < b.rowId ? -1 : 1)).map(p => ({ id: runId + ":lease:" + p.rowId, scope, procedureId: runId, documentVersionId: p.documentVersionId, rowId: p.rowId,
    ...(p.row ? { locator: { row: p.row } } : {}), precision: "row" as const, status: "verified" as const, purpose: "Source de location citée (contrat, hypothèses, échéances ou ouverture)" }));
  const limitations = [
    "Cadrage sur le grand livre PCG et retraitement de clôture non réalisés dans ce lot (L16-03) : résultat de contrôle non concluant",
    "Sous-total limité aux contrats calculés ; le registre fourni ne prouve pas l'exhaustivité des contrats de l'entité",
    ...(LEASE_RULE_BASIS.status === "review_required" ? ["Règle à revoir : scénario synthétique seulement, aucune exécution réelle"] : []),
  ];
  return { schemaVersion: "ifrs16-result-1", runId, scope, period, rule, engineVersion: LEASE_ENGINE_VERSION, arithmetic: { scale: 40, rounding: "half_away_from_zero_cent", publication: "rounded_balances" }, contracts,
    portfolio: { byStatus, byResult, computedSubtotal: computed.length ? { label: "contrats calculés", contracts: computed.length, ...Object.fromEntries(SUMMED.map(k => [k, sum(k)])) as Omit<ClosingFigures, "periodStart" | "closing" | "paymentsInPeriod"> } : null,
      blockedIds: contracts.filter(c => c.result !== "computed").map(c => c.contractId) },
    coverage: q.coverage, orphans: q.orphans, ledgerFraming: null, bundle: null, limitations, evidence, outcome: "inconclusive" };
}

/** Points de revue générés à l'exécution : un par contrat non calculé, à son seul motif ; aucun montant attribué (jamais un zéro). */
export function leaseReviewPoints(result: LeaseResult): { key: string; text: string; amount: KnownAmount; blocking: boolean }[] {
  return result.contracts.filter(c => c.result !== "computed").map(c => ({
    key: c.contractId, blocking: c.status === "a_qualifier" || c.result === "diagnostic",
    text: "Contrat " + c.contractId + " — " + (c.result === "diagnostic" ? "diagnostic" : c.result === "not_commenced" ? "prise d'effet postérieure" : c.status) + " : "
      + [...c.reasons.filter(r => r.effect !== "info").map(r => r.code + " " + r.message), ...c.resultReasons].join(" ; "),
    amount: { kind: "unknown" as const, reason: "Point à documenter, sans montant attribué" },
  }));
}
export function isLeaseResult(value: unknown): value is LeaseResult { return !!value && typeof value === "object" && (value as LeaseResult).schemaVersion === "ifrs16-result-1"; }

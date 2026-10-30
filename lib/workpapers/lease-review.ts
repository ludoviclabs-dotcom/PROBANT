import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { AdjustmentBundleCore } from "@/lib/ifrs/shared/bundle";
import { buildLeaseBundle, leaseBridge, LOGICAL_ACCOUNTS_VERSION, type LeaseBridge } from "@/lib/ifrs/leases/adjustment";
import { computeLease, LEASE_ENGINE_VERSION, type ClosingFigures, type ContractComputation, type ScheduleRow } from "@/lib/ifrs/leases/engine";
import { frameLeases, type ContractFraming, type LeaseFraming } from "@/lib/ifrs/leases/framing";
import { qualifyLeases, CONTRACT_STATUSES, type ContractStatus, type LeaseQualification, type QualificationReason, type QualifiedDue, type SourceProof } from "@/lib/ifrs/leases/qualification";
import { LEASE_RULE_BASIS, LEASE_RULE_VERSION } from "@/lib/ifrs/leases/rule";
import type { ImportBatch } from "./imports";
import { leaseFacts } from "./lease-sources";
import type { LeaseWork } from "./lease-work";

const NOT_COMPUTED: Record<Exclude<ContractStatus, "eligible_v1">, string> = { non_location: "non-location documentée", exemption_documentee: "exemption documentée", a_qualifier: "données à compléter", hors_scope_v1: "hors périmètre V1" };
import type { EvidenceLink, Population, SelectionSet, WorkpaperScope } from "./model";

/**
 * Résultat canonique de la feuille « Locations IFRS 16 » (C00 § 4.6, `ifrs16-result-1`) : une seule projection lue par la table, la revue
 * et l'export ; aucun montant n'est recalculé dans React. Calcul (moteur), cadrage sur la base PCG et retraitement proposé restent trois objets :
 * un contrat calculé mais non cadré garde ses chiffres, sans retraitement sélectionnable (X27, X28).
 */
export type LeaseResultKind = "computed" | "diagnostic" | "not_commenced" | "not_applicable";
/** Inclusion d'un contrat dans le retraitement proposé : seul un contrat calculé et cadré au centime y entre. */
export interface LeaseContractAdjustment { status: "included" | "excluded" | "not_applicable"; reason: string | null }
export interface LeaseContractResult {
  contractId: string; version: string | null; status: ContractStatus; reasons: QualificationReason[]; fingerprint: string; dues: QualifiedDue[];
  result: LeaseResultKind; resultReasons: string[];
  exact?: { monthlyRate: string; debtInitial: string }; debtInitial?: Money; depreciationMonths?: number; schedule?: ScheduleRow[]; closing?: ClosingFigures; maxAbsRoundingGap?: Money;
  opening?: Extract<ContractComputation, { result: "computed" | "diagnostic" }>["opening"];
  framing: ContractFraming; adjustment: LeaseContractAdjustment;
}
export interface LeaseResult {
  schemaVersion: "ifrs16-result-1"; runId: string; scope: WorkpaperScope; period: AccountingPeriod;
  rule: { id: "ifrs16.leases"; version: string; basisStatus: "review_required" | "validated" }; engineVersion: string;
  arithmetic: { scale: 40; rounding: "half_away_from_zero_cent"; publication: "rounded_balances" };
  contracts: LeaseContractResult[];
  portfolio: { byStatus: Record<ContractStatus, number>; byResult: Record<LeaseResultKind, number>; computedSubtotal: null | { label: "contrats calculés"; contracts: number } & Omit<ClosingFigures, "periodStart" | "closing" | "paymentsInPeriod">; blockedIds: string[] };
  coverage: LeaseQualification["coverage"]; orphans: LeaseQualification["orphans"];
  /** Cadrage du portefeuille, sans la répétition du détail par contrat (porté par chaque contrat). */
  ledgerFraming: Omit<LeaseFraming, "contracts">;
  /** Contenu du retraitement (C01-D02) ; version de feuille, empreinte et statut proposé / revu sont matérialisés à la lecture. */
  bundle: AdjustmentBundleCore | null; bundleTotals: { debit: Money; credit: Money } | null; bridge: LeaseBridge | null; logicalAccountsVersion: typeof LOGICAL_ACCOUNTS_VERSION;
  limitations: string[]; evidence: EvidenceLink[];
  outcome: "no_exception_detected" | "exceptions_detected" | "inconclusive";
}
const SUMMED = ["payments", "debtOpening", "additions", "interest", "principal", "debtClosing", "rouGross", "accumulatedOpening", "depreciation", "accumulatedClosing", "rouNetOpening", "rouNetClosing", "openingEquityEffect"] as const;
const evidenceId = (runId: string, rowId: string) => runId + ":lease:" + rowId;

/** Lignée de la feuille, posée par le serveur : le retraitement porte sa lignée et sa révision exactes. */
export interface LeaseLineage { runId: string; rootId: string; revision: number }

export function evaluateLeases(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], lineage: LeaseLineage, population: Population, selection: SelectionSet, work: LeaseWork): LeaseResult {
  const runId = lineage.runId, frozen = imports.filter(b => population.importIds.includes(b.id)), facts = leaseFacts(frozen);
  const rule = { id: "ifrs16.leases" as const, version: LEASE_RULE_VERSION, basisStatus: LEASE_RULE_BASIS.status };
  const q = qualifyLeases(facts, period, work, rule), selected = new Set(selection.selectedIds), framing = frameLeases(q, facts.lease_ledger, period);
  const framingOf = new Map(framing.contracts.map(f => [f.contractId, f]));
  const contracts: LeaseContractResult[] = q.contracts.filter(c => selected.has(c.contractId)).map(c => {
    const f = framingOf.get(c.contractId)!;
    const base = { contractId: c.contractId, version: c.version, status: c.status, reasons: c.reasons, fingerprint: c.fingerprint, dues: c.dues, framing: f };
    const none = { status: "not_applicable" as const, reason: null };
    if (c.status !== "eligible_v1" || !c.inputs) return { ...base, result: "not_applicable" as const, resultReasons: ["Aucun calcul : " + (c.status === "eligible_v1" ? "entrées incomplètes" : NOT_COMPUTED[c.status])], adjustment: none };
    const r = computeLease(c.inputs, period);
    if (r.result === "not_commenced") return { ...base, result: "not_commenced" as const, resultReasons: r.reasons, adjustment: none };
    // Calculation and framing stay separate: a computed contract without framed rent keeps its figures, without a selectable adjustment.
    const adjustment: LeaseContractAdjustment = r.result !== "computed" ? { status: "excluded", reason: "Calcul en diagnostic : aucun retraitement déterminé (X24)" }
      : f.status === "framed" ? { status: "included", reason: null }
      : { status: "excluded", reason: (f.status === "difference" ? "Écart connu de cadrage : " : "Loyer de la base non cadré : ") + f.gaps.filter(g => g.code !== "info").map(g => g.code + " " + g.message).join(" ; ") };
    return { ...base, result: r.result, resultReasons: r.reasons, exact: r.exact, debtInitial: r.debtInitial, depreciationMonths: r.depreciationMonths, schedule: r.schedule, closing: r.closing, maxAbsRoundingGap: r.maxAbsRoundingGap, opening: r.opening, adjustment };
  });
  const computed = contracts.filter(c => c.result === "computed");
  const sum = (k: typeof SUMMED[number]) => money(computed.reduce((t, c) => t + cents(c.closing![k]), 0n));
  const byResult = Object.fromEntries((["computed", "diagnostic", "not_commenced", "not_applicable"] as const).map(k => [k, contracts.filter(c => c.result === k).length])) as Record<LeaseResultKind, number>;
  const byStatus = Object.fromEntries(CONTRACT_STATUSES.map(s => [s, contracts.filter(c => c.status === s).length])) as Record<ContractStatus, number>;
  const proofs = new Map<string, SourceProof>();
  for (const c of q.contracts.filter(x => selected.has(x.contractId))) for (const p of c.evidence) proofs.set(p.rowId, p);
  // Ledger lines cited by a framed contract join the evidence: the neutralized rent points to its PCG rows.
  const included = contracts.filter(c => c.adjustment.status === "included");
  for (const c of included) for (const l of c.framing.lines) if (l.status === "matched") proofs.set(l.proof.rowId, l.proof);
  const evidence: EvidenceLink[] = [...proofs.values()].sort((a, b) => (a.rowId < b.rowId ? -1 : 1)).map(p => ({ id: evidenceId(runId, p.rowId), scope, procedureId: runId, documentVersionId: p.documentVersionId, rowId: p.rowId,
    ...(p.row ? { locator: { row: p.row } } : {}), precision: "row" as const, status: "verified" as const, purpose: "Source de location citée (contrat, hypothèses, échéances, ouverture ou charge PCG cadrée)" }));
  const ledgerBatch = frozen.find(b => b.document.documentType === "lease_ledger" && b.approval) ?? null;
  const qualified = new Map(q.contracts.map(c => [c.contractId, c]));
  const bundle = buildLeaseBundle({ runId, rootId: lineage.rootId, revision: lineage.revision, scope, period,
    ledgerRef: ledgerBatch ? { importId: ledgerBatch.id, documentVersionId: ledgerBatch.document.id, sha256: ledgerBatch.document.byteHash } : null,
    contracts: included.map(c => {
      // Calculation proofs: contract, assumptions and opening rows; the dues stay on the schedule, the rent line cites the ledger.
      const own = qualified.get(c.contractId)!.evidence.filter(p => !c.dues.some(d => d.proof.rowId === p.rowId));
      return { contractId: c.contractId, version: c.version!, closing: c.closing!, evidence: { calculation: own.map(p => evidenceId(runId, p.rowId)), ledger: c.framing.lines.filter(l => l.status === "matched").map(l => evidenceId(runId, l.proof.rowId)) } };
    }) });
  const excluded = contracts.filter(c => c.adjustment.status === "excluded").map(c => ({ contractId: c.contractId, reason: c.adjustment.reason! }));
  const bridge = bundle ? leaseBridge(bundle, money(included.reduce((t, c) => t + cents((c.framing.bookedRent as { value: Money }).value), 0n)), { contracts: excluded, unattachedLines: framing.lines.unattached, absUnattached: framing.lines.absUnattached }) : null;
  // Outcome: a known framing or opening difference is an exception, never hidden by an unknown elsewhere; then anything unknown is inconclusive.
  const knownDifference = contracts.some(c => c.result !== "not_applicable" && c.result !== "not_commenced" && c.framing.status === "difference")
    || contracts.some(c => c.opening && Object.values(c.opening.differences).some(d => d.amount !== "0.00"));
  const unknown = contracts.some(c => c.status === "a_qualifier" || c.result === "diagnostic" || (c.result === "computed" && c.framing.status === "not_framed"));
  const outcome: LeaseResult["outcome"] = knownDifference ? "exceptions_detected" : unknown ? "inconclusive" : "no_exception_detected";
  const limitations = [
    "Retraitement proposé limité aux contrats calculés et cadrés au centime ; les autres restent listés avec leur motif, jamais compensés",
    "Base PCG du droit d'utilisation, de la dette et de l'ouverture : 0,00 par condition de la base visée, vérifiée à la sélection par son manifeste (X29)",
    "Impôt non calculé (taxStatus not_computed) : effet avant impôt seulement, sans taux ni effet nul supposé ; le résultat net IFRS n'est pas attesté",
    "Sélection pour une base et comptabilisation hors de la feuille : sélection par le journal de clôture (L16-05) ; sélectionner ne prouve pas la comptabilisation",
    "Sous-total limité aux contrats calculés ; le registre fourni ne prouve pas l'exhaustivité des contrats de l'entité",
    ...(LEASE_RULE_BASIS.status === "review_required" ? ["Règle à revoir : scénario synthétique seulement, aucune exécution réelle"] : []),
  ];
  const side = (x: "debit" | "credit") => money(bundle!.lines.filter(l => l.side === x).reduce((t, l) => t + cents(l.amount), 0n));
  const { contracts: _framed, ...ledgerFraming } = framing;
  void _framed;
  return { schemaVersion: "ifrs16-result-1", runId, scope, period, rule, engineVersion: LEASE_ENGINE_VERSION, arithmetic: { scale: 40, rounding: "half_away_from_zero_cent", publication: "rounded_balances" }, contracts,
    portfolio: { byStatus, byResult, computedSubtotal: computed.length ? { label: "contrats calculés", contracts: computed.length, ...Object.fromEntries(SUMMED.map(k => [k, sum(k)])) as Omit<ClosingFigures, "periodStart" | "closing" | "paymentsInPeriod"> } : null,
      blockedIds: contracts.filter(c => c.result !== "computed").map(c => c.contractId) },
    coverage: q.coverage, orphans: q.orphans, ledgerFraming, bundle, bundleTotals: bundle ? { debit: side("debit"), credit: side("credit") } : null, bridge, logicalAccountsVersion: LOGICAL_ACCOUNTS_VERSION, limitations, evidence, outcome };
}

const NO_AMOUNT: KnownAmount = { kind: "unknown", reason: "Point à documenter, sans montant attribué" };
/**
 * Points de revue générés à l'exécution, chacun à son seul motif et sans montant attribué (jamais un zéro, jamais une anomalie C05) :
 * - un par contrat non calculé ; bloquant pour un contrat à qualifier ou en diagnostic ;
 * - un par contrat calculé non cadré, bloquant : la résolution documente l'écart, elle ne rend pas le contrat cadré ;
 * - un point non bloquant pour les lignes de la base sans contrat du registre.
 */
export function leaseReviewPoints(result: LeaseResult): { key: string; text: string; amount: KnownAmount; blocking: boolean }[] {
  const contracts = result.contracts.filter(c => c.result !== "computed").map(c => ({
    key: c.contractId, blocking: c.status === "a_qualifier" || c.result === "diagnostic",
    text: "Contrat " + c.contractId + " — " + (c.result === "diagnostic" ? "diagnostic" : c.result === "not_commenced" ? "prise d'effet postérieure" : c.status) + " : "
      + [...c.reasons.filter(r => r.effect !== "info").map(r => r.code + " " + r.message), ...c.resultReasons].join(" ; "),
    amount: NO_AMOUNT,
  }));
  const framing = result.contracts.filter(c => c.result === "computed" && c.adjustment.status === "excluded").map(c => ({
    key: "cadrage:" + c.contractId, blocking: true, amount: NO_AMOUNT,
    text: "Contrat " + c.contractId + " — cadrage PCG " + (c.framing.status === "difference" ? "en écart" : "non établi") + " : " + c.framing.gaps.filter(g => g.code !== "info").map(g => g.code + " " + g.message).join(" ; ") + ". Aucun retraitement sélectionnable pour ce contrat.",
  }));
  const unattached = result.ledgerFraming.lines.unattached ? [{ key: "cadrage:sans-contrat", blocking: false, amount: NO_AMOUNT,
    text: result.ledgerFraming.lines.unattached + " ligne(s) de la base sans contrat du registre : conservée(s), jamais compensée(s) ; contrat à identifier ou charge hors location à documenter." }] : [];
  return [...contracts, ...framing, ...unattached];
}
export function isLeaseResult(value: unknown): value is LeaseResult { return !!value && typeof value === "object" && (value as LeaseResult).schemaVersion === "ifrs16-result-1"; }

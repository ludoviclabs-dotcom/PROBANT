import { cents, money, type Money } from "@/lib/canonical-model/money";
import { assertBundleCore, RESULT_ACCOUNTS, type AdjustmentBundleCore, type LogicalAccount } from "@/lib/ifrs/shared/bundle";
import { leaseIdentity, type ManifestSourceRef } from "@/lib/ifrs/shared/manifest";
import type { WorkpaperScope } from "@/lib/workpapers/model";
import type { ClosingFigures } from "./engine";

/**
 * Retraitement de clôture de l'atelier Locations (L16-03) : comptes logiques versionnés, lignes débit / crédit par contrat, contenu du
 * `closing_adjustment` et pont par poste. Le retraitement vise une base PCG qui a passé en charge les loyers échus de l'exercice :
 * - aucune ligne de trésorerie (le décaissement est déjà dans la base), le loyer cadré est neutralisé et la ventilation reconstituée ;
 * - un exercice ultérieur porte les soldes de clôture, l'effet de la période et l'effet d'ouverture séparément ; aucun amortissement historique en charge de N ;
 * - impôt non calculé (`taxStatus: "not_computed"`) : ni taux par défaut, ni effet fiscal nul supposé.
 * Le détail économique des mouvements (entrée, intérêts, paiements, dotation) reste celui de l'échéancier : il n'est jamais additionné au retraitement.
 */
export const LOGICAL_ACCOUNTS_VERSION = "ifrs16-logical-accounts-1";
export type BridgePoste = "rou" | "debt" | "pnl_before_tax" | "opening_equity";
export interface LogicalAccountSpec { label: string; family: "asset" | "contra_asset" | "liability" | "expense" | "neutralization" | "equity"; poste: BridgePoste }
export const LOGICAL_ACCOUNT_CATALOG: Record<LogicalAccount, LogicalAccountSpec> = {
  rou_gross: { label: "Droit d'utilisation — valeur brute", family: "asset", poste: "rou" },
  rou_accumulated_depreciation: { label: "Droit d'utilisation — amortissements cumulés", family: "contra_asset", poste: "rou" },
  lease_liability: { label: "Dette locative", family: "liability", poste: "debt" },
  lease_interest_expense: { label: "Charge d'intérêts sur la dette locative", family: "expense", poste: "pnl_before_tax" },
  rou_depreciation_expense: { label: "Dotation aux amortissements du droit d'utilisation", family: "expense", poste: "pnl_before_tax" },
  pcg_rent_neutralized: { label: "Loyer de la base PCG neutralisé", family: "neutralization", poste: "pnl_before_tax" },
  opening_equity_effect: { label: "Effet d'ouverture sur les capitaux propres", family: "equity", poste: "opening_equity" },
};
export const LOGICAL_ACCOUNT_NOTE = "Codes internes du retraitement (" + LOGICAL_ACCOUNTS_VERSION + "), ni comptes PCG ni plan de reporting. Le loyer neutralisé vise les comptes de la base portés par les lignes cadrées ; aucun mapping vers un plan de reporting n'est fourni ni supposé.";

type Line = AdjustmentBundleCore["lines"][number];
export interface ContractAdjustmentInput { contractId: string; version: string; closing: ClosingFigures; evidence: { calculation: string[]; ledger: string[] } }

/** Lignes d'un contrat cadré : soldes de clôture et charges de l'exercice ; un montant nul ne fait pas de ligne, un signe négatif inverse le sens. */
export function contractAdjustmentLines(c: ContractAdjustmentInput): Line[] {
  const f = c.closing;
  const line = (account: LogicalAccount, side: "debit" | "credit", amount: Money, nature: Line["nature"], evidence: string[]): Line[] => {
    const v = cents(amount);
    if (v === 0n) return [];
    return [{ account, side: v > 0n ? side : side === "debit" ? "credit" : "debit", amount: money(v < 0n ? -v : v), contractId: c.contractId, contractVersion: c.version, nature, evidence: [...evidence].sort() }];
  };
  return [
    ...line("rou_gross", "debit", f.rouGross, "recognition", c.evidence.calculation),
    ...line("rou_accumulated_depreciation", "credit", f.accumulatedClosing, "depreciation", c.evidence.calculation),
    ...line("lease_liability", "credit", f.debtClosing, "recognition", c.evidence.calculation),
    ...line("lease_interest_expense", "debit", f.interest, "interest", c.evidence.calculation),
    ...line("rou_depreciation_expense", "debit", f.depreciation, "depreciation", c.evidence.calculation),
    ...line("pcg_rent_neutralized", "credit", f.payments, "rent_neutralization", c.evidence.ledger),
    // Opening effect = ROU net − debt at the opening (C00 § 5.3): negative decreases opening equity, hence a debit.
    ...line("opening_equity_effect", "credit", f.openingEquityEffect, "opening_effect", c.evidence.calculation),
  ];
}

/** Contribution signée au résultat (produit positif, charge négative), par compte de résultat, dérivée des seules lignes. */
const contributionsOf = (lines: Line[]) => {
  const out = new Map<string, bigint>();
  for (const l of lines) if ((RESULT_ACCOUNTS as readonly string[]).includes(l.account)) out.set(l.contractId + "|" + l.account, (out.get(l.contractId + "|" + l.account) ?? 0n) + (l.side === "debit" ? -cents(l.amount) : cents(l.amount)));
  return [...out.entries()].filter(([, v]) => v !== 0n).map(([k, v]) => ({ contractId: k.split("|")[0], nature: k.split("|")[1] as typeof RESULT_ACCOUNTS[number], amount: money(v) }));
};

/**
 * Contenu du retraitement d'une révision de feuille pour les seuls contrats calculés et cadrés. `null` si aucun contrat n'est cadré ou si la base
 * PCG n'est pas identifiée par une source `lease_ledger` : jamais un retraitement à zéro présenté comme déterminé.
 */
export function buildLeaseBundle(input: { runId: string; rootId: string; revision: number; scope: WorkpaperScope; period: { startDate: string; closingDate: string }; ledgerRef: ManifestSourceRef | null; contracts: ContractAdjustmentInput[] }): AdjustmentBundleCore | null {
  if (!input.contracts.length || !input.ledgerRef) return null;
  const contracts = [...input.contracts].sort((a, b) => (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0));
  const lines = contracts.flatMap(contractAdjustmentLines);
  if (lines.length < 2) return null;
  return assertBundleCore({ schemaVersion: "ifrs-bundle-1", kind: "closing_adjustment", logicalId: "ifrs16.leases:" + input.rootId, revision: input.revision, runId: input.runId, scope: input.scope,
    period: { startDate: input.period.startDate, closingDate: input.period.closingDate }, expectedBase: { baseKind: "PCG", sourceRefs: [input.ledgerRef] },
    identities: [...new Set(lines.map(l => leaseIdentity(l.contractId)))].sort(), lines, resultContributions: contributionsOf(lines), taxStatus: "not_computed" });
}

export interface BridgeRow { poste: BridgePoste; label: string; base: Money; baseBasis: "ledger" | "condition"; baseNote: string; adjustment: Money; target: Money }
export interface LeaseBridge {
  scope: string; contractIds: string[]; rows: BridgeRow[];
  /** Effet d'ouverture + effet de la période = droit d'utilisation net − dette, sur le périmètre retenu. */
  identity: { openingPlusPeriod: Money; rouNetMinusDebt: Money };
  notCovered: { contracts: { contractId: string; reason: string }[]; unattachedLines: number; absUnattached: Money };
  taxStatus: "not_computed"; note: string;
}
const CONDITION = "0,00 sur ce périmètre : la base PCG visée n'inscrit pas cet objet pour ces contrats. Condition de la base, vérifiée à la sélection par son manifeste (X29), pas une mesure";

/**
 * Pont par poste, jamais totalisé : droit d'utilisation (actif), dette (passif), résultat avant impôt et ouverture restent quatre lignes.
 * Base PCG + ajustements retenus = cible retraitée, sur les seuls contrats du retraitement ; ce qui n'est pas couvert reste listé à part.
 */
export function leaseBridge(bundle: AdjustmentBundleCore, bookedRent: Money, notCovered: LeaseBridge["notCovered"]): LeaseBridge {
  const signed = (account: LogicalAccount) => bundle.lines.filter(l => l.account === account).reduce((t, l) => t + (l.side === "debit" ? cents(l.amount) : -cents(l.amount)), 0n);
  const rou = signed("rou_gross") + signed("rou_accumulated_depreciation"), debt = -signed("lease_liability"), opening = -signed("opening_equity_effect");
  const pnl = bundle.resultContributions.reduce((t, c) => t + cents(c.amount), 0n), base = -cents(bookedRent);
  const row = (poste: BridgePoste, label: string, baseValue: bigint, basis: BridgeRow["baseBasis"], note: string, adjustment: bigint): BridgeRow =>
    ({ poste, label, base: money(baseValue), baseBasis: basis, baseNote: note, adjustment: money(adjustment), target: money(baseValue + adjustment) });
  const rows = [
    row("rou", "Droit d'utilisation net (actif)", 0n, "condition", CONDITION, rou),
    row("debt", "Dette locative (passif, encours positif)", 0n, "condition", CONDITION, debt),
    row("pnl_before_tax", "Résultat avant impôt de l'exercice (charge négative)", base, "ledger", "Loyers des lignes cadrées de la base PCG, en charge", pnl),
    row("opening_equity", "Capitaux propres d'ouverture (diminution négative)", 0n, "condition", CONDITION, opening),
  ];
  // Balanced lines imply the identity; a failure is an internal defect, never balanced by a residual.
  if (opening + pnl !== rou - debt) throw new Error("L16_BRIDGE_IDENTITY");
  return { scope: "Contrats calculés et cadrés, retenus dans le retraitement proposé", contractIds: bundle.identities.map(i => i.slice("ifrs16:lease:".length)), rows,
    identity: { openingPlusPeriod: money(opening + pnl), rouNetMinusDebt: money(rou - debt) }, notCovered, taxStatus: "not_computed",
    note: "Effet avant impôt seulement : aucun effet fiscal n'est calculé ni supposé nul, et le résultat net IFRS n'est pas attesté. Les postes d'actif et de passif ne sont jamais additionnés." };
}

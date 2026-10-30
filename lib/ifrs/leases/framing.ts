import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { NOT_APPLICABLE_TOKEN, UNKNOWN_TOKEN } from "./dictionary";
import type { LeaseQualification, QualifiedContract, SourceFact, SourceProof } from "./qualification";

/**
 * Cadrage des loyers sur la base PCG (L16-03), fonction pure. Pour chaque contrat calculable, les charges 612 / 613 / 614 rattachées au contrat
 * sont comparées **ligne à ligne** aux loyers hors TVA des échéances qu'elles couvrent. Convention interne, jamais attribuée à une norme :
 * - une ligne compte dans la base de l'exercice si elle est comptabilisée dans l'exercice et si la période qu'elle couvre y est incluse ;
 * - une ligne qui déborde de l'exercice révèle une charge constatée d'avance ou à payer non couverte (X28) : le loyer de la base est alors inconnu ;
 * - une échéance de l'exercice sans ligne laisse le loyer à neutraliser non identifié (X27) ;
 * - aucune compensation : ni entre lignes, ni entre contrats, ni avec les lignes sans contrat du registre.
 * Le compte n'est qu'un indice de recherche, jamais une preuve d'exhaustivité. La TVA est montrée telle que la source la qualifie : l'outil ne décide pas de sa récupération.
 */
export const FRAMING_CONVENTION = "Charge PCG du loyer : lignes rattachées au contrat, comptabilisées dans l'exercice, couvrant une période incluse dans l'exercice ; comparée ligne à ligne aux loyers hors TVA des échéances couvertes ; aucune compensation entre lignes ni entre contrats.";
export type FramingLineStatus = "matched" | "excess" | "shortfall" | "vat_included" | "no_due" | "duplicate" | "straddles_period" | "other_period" | "unattachable" | "not_applicable";
export interface FramingLine {
  key: string; account: string | null; piece: string | null; periodStart: string | null; periodEnd: string | null; postedOn: string; amount: Money;
  coveredDues: string[]; expected: Money | null; difference: Money | null; status: FramingLineStatus; proof: SourceProof;
}
export type FramingGapKind = "missing_charge" | "unattachable_line" | "cut_off" | "other_period" | "excess_or_mixed" | "shortfall" | "vat_in_charge" | "duplicate" | "charge_without_due" | "settled_after_closing" | "account_hint";
/** X27 : loyer non identifié ; X28 : décalage ou écart non couvert ; `info` : constat sans effet sur le cadrage. */
export interface FramingGap { code: "X27" | "X28" | "info"; kind: FramingGapKind; message: string; amount: KnownAmount; dueDates?: string[]; lineKeys?: string[] }
export interface VatBridgeRow { dueDate: string; rent: Money; paidTotal: Money | null; paidVat: Money | null; paidOn: string | null }
export type FramingStatus = "framed" | "difference" | "not_framed" | "not_applicable";
export interface ContractFraming {
  contractId: string; status: FramingStatus; reason: string | null;
  /** Loyers hors TVA des échéances de l'exercice (échéancier qualifié). */
  expectedRent: Money;
  /** Charges retenues dans la base de l'exercice ; inconnues si une échéance n'est pas couverte ou si une ligne déborde. */
  bookedRent: KnownAmount;
  /** Base − attendu, au net ; les écarts de ligne restent dans `lines`, jamais compensés. */
  difference: KnownAmount;
  lines: FramingLine[]; gaps: FramingGap[];
  vatBridge: { rows: VatBridgeRow[]; paidTotal: Money; paidVat: Money; note: string } | null;
  /** Comptes de la base portés par les lignes cadrées : le loyer neutralisé vise ces comptes. */
  baseAccounts: string[];
}
export interface LeaseFraming {
  convention: string;
  contracts: ContractFraming[];
  byStatus: Record<FramingStatus, number>;
  /** Lignes rattachées à un contrat du registre (cadrées ou non) et lignes sans contrat du registre, en sommes absolues. */
  lines: { attached: number; framed: number; notFramed: number; unattached: number; absFramed: Money; absNotFramed: Money; absUnattached: Money };
  /** Écarts connus, ligne par ligne, jamais nettés. */
  differences: { contractId: string; lineKey: string; amount: Money }[];
  unattached: { key: string; contractId: string | null; account: string | null; amount: Money; proof: SourceProof }[];
}

const sum = (values: Money[]) => money(values.reduce((t, v) => t + cents(v), 0n));
const abs = (values: Money[]) => money(values.reduce((t, v) => { const c = cents(v); return t + (c < 0n ? -c : c); }, 0n));
const known = (value: Money): KnownAmount => ({ kind: "known", value });
const read = (fact: SourceFact, key: string) => { const v = fact.fields[key]; return v && v !== UNKNOWN_TOKEN && v !== NOT_APPLICABLE_TOKEN ? v : null; };
const SEARCH_HINT = /^61[234]/;

function notApplicable(contractId: string, reason: string, lines: FramingLine[] = []): ContractFraming {
  return { contractId, status: "not_applicable", reason, expectedRent: money(0n), bookedRent: { kind: "not_applicable", reason }, difference: { kind: "not_applicable", reason }, lines, gaps: [], vatBridge: null, baseAccounts: [] };
}

export function frameContract(contract: QualifiedContract, ledger: readonly SourceFact[], period: { startDate: string; closingDate: string }): ContractFraming {
  const id = contract.contractId, inPeriod = (date: string) => date >= period.startDate && date <= period.closingDate;
  const rows = ledger.filter(l => l.contractId === id).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const shell = (l: SourceFact, status: FramingLineStatus): FramingLine => ({ key: l.key, account: read(l, "account"), piece: read(l, "piece"), periodStart: read(l, "periodStart"), periodEnd: read(l, "periodEnd"),
    postedOn: l.date, amount: l.amount, coveredDues: [], expected: null, difference: null, status, proof: l.proof });
  if (contract.status !== "eligible_v1" || !contract.inputs) return notApplicable(id, "Contrat non calculé sur ce périmètre : rien à neutraliser", rows.map(l => shell(l, "not_applicable")));
  if (contract.notCommenced) return notApplicable(id, "Prise d'effet postérieure à la clôture : aucun loyer de l'exercice à neutraliser", rows.map(l => shell(l, "not_applicable")));
  const dues = contract.dues.filter(d => inPeriod(d.dueDate)), expectedRent = sum(dues.map(d => d.amount));
  const gaps: FramingGap[] = [], covers = new Map<string, string[]>();
  const lines: FramingLine[] = rows.map((l): FramingLine => {
    const line = shell(l, "matched");
    // Only dated, cited lines are attachable; a posting outside the period is not in this exercise's base.
    if (!line.piece || !line.periodStart || !line.periodEnd || line.periodStart > line.periodEnd) return { ...line, status: "unattachable" as const };
    if (!inPeriod(line.postedOn)) return { ...line, status: "other_period" as const };
    if (line.periodStart < period.startDate || line.periodEnd > period.closingDate) return { ...line, status: "straddles_period" as const };
    const covered = dues.filter(d => d.dueDate >= line.periodStart! && d.dueDate <= line.periodEnd!);
    if (!covered.length) return { ...line, status: "no_due" as const, expected: money(0n), difference: line.amount };
    for (const d of covered) covers.set(d.dueDate, [...(covers.get(d.dueDate) ?? []), line.key]);
    const expected = sum(covered.map(d => d.amount)), difference = money(cents(line.amount) - cents(expected));
    const paidTotal = covered.every(d => d.paidAmount) ? sum(covered.map(d => d.paidAmount!)) : null, vat = sum(covered.flatMap(d => d.paidVat ? [d.paidVat] : []));
    const status: FramingLineStatus = cents(difference) === 0n ? "matched" : paidTotal && cents(vat) !== 0n && cents(line.amount) === cents(paidTotal) ? "vat_included" : cents(difference) > 0n ? "excess" : "shortfall";
    return { ...line, coveredDues: covered.map(d => d.dueDate), expected, difference, status };
  });
  // A due covered by two counted lines makes every line on it a possible double entry, whatever each line's own comparison.
  const doubled = new Set([...covers.entries()].filter(([, keys]) => keys.length > 1).flatMap(([, keys]) => keys));
  for (const line of lines) if (doubled.has(line.key)) line.status = "duplicate";
  const missing = dues.filter(d => !covers.has(d.dueDate));
  const gap = (code: FramingGap["code"], kind: FramingGapKind, message: string, amount: KnownAmount, extra: Pick<FramingGap, "dueDates" | "lineKeys"> = {}) => gaps.push({ code, kind, message, amount, ...extra });
  const unknownBase = (reason: string): KnownAmount => ({ kind: "unknown", reason });
  if (missing.length) gap("X27", "missing_charge", missing.length + " échéance(s) de l'exercice sans charge PCG rattachée : loyer à neutraliser non identifié", known(sum(missing.map(d => d.amount))), { dueDates: missing.map(d => d.dueDate) });
  const by = (status: FramingLineStatus) => lines.filter(l => l.status === status);
  if (by("unattachable").length) gap("X27", "unattachable_line", "Ligne sans pièce ou sans période couverte : non rattachable", known(abs(by("unattachable").map(l => l.amount))), { lineKeys: by("unattachable").map(l => l.key) });
  if (by("straddles_period").length) gap("X28", "cut_off", "Ligne couvrant une période hors de l'exercice : charge constatée d'avance ou charge à payer non couverte", unknownBase("Part de l'exercice non documentée"), { lineKeys: by("straddles_period").map(l => l.key) });
  if (by("other_period").length) gap("info", "other_period", "Ligne comptabilisée hors de l'exercice : hors de la base, non retenue", known(abs(by("other_period").map(l => l.amount))), { lineKeys: by("other_period").map(l => l.key) });
  if (by("excess").length) gap("X28", "excess_or_mixed", "Charge supérieure aux loyers couverts : charge mixte (services, charges locatives) ou autre composante, jamais neutralisée", known(sum(by("excess").map(l => l.difference!))), { lineKeys: by("excess").map(l => l.key) });
  if (by("shortfall").length) gap("X28", "shortfall", "Charge inférieure aux loyers couverts", known(sum(by("shortfall").map(l => l.difference!))), { lineKeys: by("shortfall").map(l => l.key) });
  if (by("vat_included").length) gap("X28", "vat_in_charge", "Charge égale aux règlements TTC : TVA possiblement passée en charge ; la récupération n'est pas décidée par l'outil", known(sum(by("vat_included").map(l => l.difference!))), { lineKeys: by("vat_included").map(l => l.key) });
  if (by("duplicate").length) gap("X28", "duplicate", "Échéance couverte par plusieurs lignes : double comptabilisation possible", known(sum(by("duplicate").map(l => l.amount))), { lineKeys: by("duplicate").map(l => l.key) });
  if (by("no_due").length) gap("X28", "charge_without_due", "Ligne sans échéance dans sa période couverte", known(sum(by("no_due").map(l => l.amount))), { lineKeys: by("no_due").map(l => l.key) });
  const late = dues.filter(d => d.paidOn && d.paidOn > period.closingDate);
  if (late.length) gap("info", "settled_after_closing", "Échéance de l'exercice réglée après la clôture : dette fournisseur dans la base PCG ; le retraitement ne crée aucun mouvement de trésorerie", known(sum(late.map(d => d.amount))), { dueDates: late.map(d => d.dueDate) });
  const hint = lines.filter(l => l.account && !SEARCH_HINT.test(l.account));
  if (hint.length) gap("info", "account_hint", "Compte hors 612 / 613 / 614 : rattachement déclaré par la source, à confirmer (le compte n'est qu'un indice)", known(abs(hint.map(l => l.amount))), { lineKeys: hint.map(l => l.key) });
  const counted = lines.filter(l => !["unattachable", "other_period", "straddles_period"].includes(l.status));
  const vatRows: VatBridgeRow[] = dues.map(d => ({ dueDate: d.dueDate, rent: d.amount, paidTotal: d.paidAmount ?? null, paidVat: d.paidVat ?? null, paidOn: d.paidOn ?? null }));
  const vatBridge = dues.length ? { rows: vatRows, paidTotal: sum(vatRows.flatMap(r => r.paidTotal ? [r.paidTotal] : [])), paidVat: sum(vatRows.flatMap(r => r.paidVat ? [r.paidVat] : [])),
    note: "Règlement total − TVA réglée = loyer hors TVA, tel que la source le qualifie (TVA déclarée récupérable par le contrat) ; l'outil ne décide pas de la récupération." } : null;
  const unknownReason = [missing.length ? "Échéance(s) sans charge rattachée (X27)" : null, by("unattachable").length ? "Ligne non rattachable (X27)" : null,
    by("straddles_period").length ? "Décalage de période non couvert (X28)" : null].filter(Boolean).join(" ; ") || null;
  const booked: KnownAmount = unknownReason ? unknownBase(unknownReason) : known(sum(counted.map(l => l.amount)));
  const difference: KnownAmount = booked.kind === "known" ? known(money(cents(booked.value) - cents(expectedRent))) : booked;
  const status: FramingStatus = !dues.length && !counted.length && !unknownReason ? "framed" : unknownReason ? "not_framed" : counted.every(l => l.status === "matched") ? "framed" : "difference";
  return { contractId: id, status, reason: !dues.length && status === "framed" ? "Aucun loyer échu dans l'exercice : rien à neutraliser" : unknownReason, expectedRent, bookedRent: booked, difference, lines, gaps, vatBridge,
    baseAccounts: status === "framed" ? [...new Set(counted.flatMap(l => l.account ? [l.account] : []))].sort() : [] };
}
/** Cadrage du portefeuille sur la population comptable fournie : un cadrage par contrat, lignes sans contrat du registre listées, jamais compensées. */
export function frameLeases(qualification: LeaseQualification, ledger: readonly SourceFact[], period: { startDate: string; closingDate: string }): LeaseFraming {
  const registry = new Set(qualification.contracts.map(c => c.contractId));
  const contracts = qualification.contracts.map(c => frameContract(c, ledger, period));
  const attached = contracts.flatMap(c => c.lines), framed = contracts.flatMap(c => c.status === "framed" ? c.lines.filter(l => l.status === "matched") : []);
  const notFramed = attached.filter(l => !framed.includes(l)), unattached = ledger.filter(l => !l.contractId || !registry.has(l.contractId)).sort((a, b) => (a.key < b.key ? -1 : 1));
  const byStatus = Object.fromEntries((["framed", "difference", "not_framed", "not_applicable"] as const).map(s => [s, contracts.filter(c => c.status === s).length])) as Record<FramingStatus, number>;
  return { convention: FRAMING_CONVENTION, contracts, byStatus,
    lines: { attached: attached.length, framed: framed.length, notFramed: notFramed.length, unattached: unattached.length, absFramed: abs(framed.map(l => l.amount)), absNotFramed: abs(notFramed.map(l => l.amount)), absUnattached: abs(unattached.map(l => l.amount)) },
    differences: contracts.flatMap(c => c.status === "not_applicable" ? [] : c.lines.filter(l => l.difference && cents(l.difference) !== 0n).map(l => ({ contractId: c.contractId, lineKey: l.key, amount: l.difference! }))),
    unattached: unattached.map(l => ({ key: l.key, contractId: l.contractId ?? null, account: read(l, "account"), amount: l.amount, proof: l.proof })) };
}

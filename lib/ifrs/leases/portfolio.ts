import { cents, money, type Money } from "@/lib/canonical-model/money";
import type { WorkpaperNote, WorkpaperRun } from "@/lib/workpapers/model";
import type { LeaseContractResult, LeaseResult, LeaseResultKind } from "@/lib/workpapers/lease-review";
import { accumulatedDepreciationCents } from "./engine";
import type { FramingStatus } from "./framing";
import { monthEnd, monthIndex, type ContractStatus, type LeaseQualification } from "./qualification";

/**
 * Vue de portefeuille du poste visuel (L16-04), `ifrs16-portfolio-1`, établie par le serveur depuis le résultat canonique de la feuille :
 * ligne de synthèse, table des contrats, séries mensuelles et ponts de variation, comparaison de deux versions exécutées.
 * Les séries relisent les lignes de l'échéancier du résultat et la règle d'arrondi du moteur ; elles ne recalculent ni dette ni taux.
 * Chaque série est contrôlée contre le sous-total des contrats calculés : un écart d'un centime est un défaut du code (L16_CHART_IDENTITY).
 */
export const LEASE_PORTFOLIO_VERSION = "ifrs16-portfolio-1";
const EXCLUDED_STATUSES = ["non_location", "exemption_documentee", "hors_scope_v1"] as const satisfies readonly ContractStatus[];

export interface PortfolioSummary {
  /** Contrats du registre fourni ; aucune exhaustivité des contrats de l'entité n'en découle. */
  registry: number; calculable: number; toQualify: number;
  excluded: { count: number; byStatus: { status: typeof EXCLUDED_STATUSES[number]; count: number }[] };
  /** Résultats du moteur ; `null` tant que la feuille n'est pas calculée. */
  results: Record<LeaseResultKind, number> | null;
  /** Montants de clôture des seuls contrats calculés ; `partial` dès qu'un contrat qui pourrait porter une dette en est exclu. */
  amounts: null | { contracts: number; debtClosing: Money; rouNetClosing: Money; partial: boolean; blocked: string[] };
}
export type ReviewMark = "open" | "documented" | "none";
export interface PortfolioRow {
  contractId: string; lessor: string | null; assetCategory: string | null; status: ContractStatus;
  commencement: string | null; lastDue: string | null; months: number | null; payment: Money | null; annualRate: string | null;
  result: LeaseResultKind | null; debtClosing: Money | null; rouNetClosing: Money | null;
  framing: FramingStatus | null; adjustment: LeaseContractResult["adjustment"]["status"] | null;
  /** Points de revue générés pour ce contrat : ouvert, documenté, aucun ; `null` avant calcul. */
  review: ReviewMark | null;
}
export interface ChartPoint { date: string; debt: Money; rouNet: Money; payments: Money; interest: Money; principal: Money }
export interface LeaseCharts {
  currency: "EUR";
  /** Population des séries : contrats calculés, la même que le sous-total du résultat. */
  contracts: string[];
  excluded: { contractId: string; status: ContractStatus; result: LeaseResultKind; reason: string }[];
  partial: boolean;
  opening: { date: string; debt: Money; rouNet: Money };
  /** Une fin de mois par mois de l'exercice ; soldes de fin de mois et flux de l'échéance du mois. */
  points: ChartPoint[];
  /** Totaux de l'exercice des flux mensuels, égaux au sous-total canonique. */
  flows: { payments: Money; interest: Money; principal: Money };
  debtBridge: { opening: Money; additions: Money; interest: Money; payments: Money; closing: Money };
  rouBridge: { opening: Money; additions: Money; depreciation: Money; closing: Money };
}
export interface ComparedFigures { result: LeaseResultKind; debtClosing: Money | null; rouNetClosing: Money | null; interest: Money | null; depreciation: Money | null }
export interface VersionComparison {
  previous: { runId: string; revision: number; version: number }; current: { runId: string; revision: number; version: number };
  rows: { contractId: string; previous: ComparedFigures | null; current: ComparedFigures | null; delta: Omit<ComparedFigures, "result"> | null; changes: string[] }[];
  limits: string[];
}
export interface LeasePortfolioView { version: typeof LEASE_PORTFOLIO_VERSION; summary: PortfolioSummary; rows: PortfolioRow[]; charts: LeaseCharts | null; comparison: VersionComparison | null }

const ZERO = 0n;
const sumOf = (values: bigint[]) => values.reduce((t, v) => t + v, ZERO);
const identity = (ok: boolean) => { if (!ok) throw new Error("L16_CHART_IDENTITY"); };

/** Contrat bloqué : il pourrait porter une dette mais n'a pas de chiffre déterminé (à qualifier, hors V1, diagnostic). */
const blocks = (c: Pick<LeaseContractResult, "status" | "result">) => c.result === "diagnostic" || c.status === "a_qualifier" || c.status === "hors_scope_v1";

export function portfolioSummary(qualification: LeaseQualification | null, result: LeaseResult | null): PortfolioSummary {
  const byStatus = result?.portfolio.byStatus ?? qualification?.coverage.registry.byStatus;
  const count = (s: ContractStatus) => byStatus?.[s] ?? 0;
  const registry = result ? result.contracts.length : qualification?.coverage.registry.contracts ?? 0;
  const excluded = EXCLUDED_STATUSES.map(status => ({ status, count: count(status) })).filter(e => e.count);
  const subtotal = result?.portfolio.computedSubtotal ?? null, blocked = result ? result.contracts.filter(blocks).map(c => c.contractId) : [];
  return { registry, calculable: count("eligible_v1"), toQualify: count("a_qualifier"), excluded: { count: excluded.reduce((t, e) => t + e.count, 0), byStatus: excluded },
    results: result ? result.portfolio.byResult : null,
    amounts: subtotal ? { contracts: subtotal.contracts, debtClosing: subtotal.debtClosing, rouNetClosing: subtotal.rouNetClosing, partial: blocked.length > 0, blocked } : null };
}

function reviewMark(notes: readonly WorkpaperNote[], contractId: string): ReviewMark {
  const mine = notes.filter(n => n.id === "lease:" + contractId || n.id === "lease:cadrage:" + contractId);
  return mine.some(n => n.blocking && !n.resolution) ? "open" : mine.some(n => n.resolution) ? "documented" : "none";
}

/** Table de portefeuille : contrats du résultat (ou de la qualification avant calcul), termes qualifiés et chiffres du moteur. */
export function portfolioRows(qualification: LeaseQualification | null, result: LeaseResult | null, notes: readonly WorkpaperNote[]): PortfolioRow[] {
  const qualified = new Map((qualification?.contracts ?? []).map(c => [c.contractId, c]));
  const ids = result ? result.contracts.map(c => c.contractId) : [...qualified.keys()];
  const computed = new Map((result?.contracts ?? []).map(c => [c.contractId, c]));
  return ids.map(id => {
    const q = qualified.get(id), r = computed.get(id), inputs = q?.inputs ?? null;
    return { contractId: id, lessor: q?.lessor ?? null, assetCategory: q?.assetCategory ?? null, status: r?.status ?? q!.status,
      commencement: inputs?.commencement ?? null, lastDue: inputs ? monthEnd(monthIndex(inputs.commencement) + inputs.months - 1) : null, months: inputs?.months ?? null,
      payment: inputs?.payment ?? null, annualRate: inputs?.annualRate ?? null,
      result: r?.result ?? null, debtClosing: r?.closing?.debtClosing ?? null, rouNetClosing: r?.closing?.rouNetClosing ?? null,
      framing: r?.framing.status ?? null, adjustment: r?.adjustment.status ?? null, review: result ? reviewMark(notes, id) : null };
  });
}

/** Solde de dette et droit d'utilisation net d'un contrat calculé à une fin de mois, et flux de l'échéance de ce mois (zéro avant le commencement). */
function contractAt(c: LeaseContractResult, index: number) {
  const s = c.schedule!, n = s.t.length, start = monthIndex(s.dueDate[0]), elapsed = index - start + 1;
  if (elapsed < 1) return { debt: ZERO, rouNet: ZERO, payments: ZERO, interest: ZERO, principal: ZERO };
  const rou = cents(c.debtInitial!), k = elapsed <= n ? elapsed - 1 : -1, amount = (column: string[], i: number) => cents({ amount: column[i], currency: s.currency });
  return { debt: amount(s.closingDebt, Math.min(elapsed, n) - 1), rouNet: rou - accumulatedDepreciationCents(rou, c.depreciationMonths!, elapsed),
    payments: k >= 0 ? amount(s.payment, k) : ZERO, interest: k >= 0 ? amount(s.interest, k) : ZERO, principal: k >= 0 ? amount(s.principal, k) : ZERO };
}

/** Séries et ponts du portefeuille calculé ; `null` sans contrat calculé. Toute identité manquée au centime lève L16_CHART_IDENTITY. */
export function leaseCharts(result: LeaseResult): LeaseCharts | null {
  const subtotal = result.portfolio.computedSubtotal;
  if (!subtotal) return null;
  const computed = result.contracts.filter(c => c.result === "computed"), first = monthIndex(result.period.startDate), last = monthIndex(result.period.closingDate);
  const at = (index: number) => computed.map(c => contractAt(c, index));
  const total = (xs: ReturnType<typeof at>, k: keyof ReturnType<typeof contractAt>) => sumOf(xs.map(x => x[k]));
  const open = at(first - 1), points: ChartPoint[] = [];
  for (let i = first; i <= last; i++) {
    const xs = at(i);
    points.push({ date: monthEnd(i), debt: money(total(xs, "debt")), rouNet: money(total(xs, "rouNet")), payments: money(total(xs, "payments")), interest: money(total(xs, "interest")), principal: money(total(xs, "principal")) });
  }
  const flow = (k: "payments" | "interest" | "principal") => sumOf(points.map(p => cents(p[k])));
  const c = (m: Money) => cents(m);
  // The series and the canonical subtotal are two readings of the same schedule lines: they must agree to the cent.
  identity(total(open, "debt") === c(subtotal.debtOpening) && total(open, "rouNet") === c(subtotal.rouNetOpening));
  identity(cents(points.at(-1)!.debt) === c(subtotal.debtClosing) && cents(points.at(-1)!.rouNet) === c(subtotal.rouNetClosing));
  identity(flow("payments") === c(subtotal.payments) && flow("interest") === c(subtotal.interest) && flow("principal") === c(subtotal.principal));
  identity(c(subtotal.debtOpening) + c(subtotal.additions) + c(subtotal.interest) - c(subtotal.payments) === c(subtotal.debtClosing));
  identity(c(subtotal.rouNetOpening) + c(subtotal.additions) - c(subtotal.depreciation) === c(subtotal.rouNetClosing));
  const excluded = result.contracts.filter(x => x.result !== "computed").map(x => ({ contractId: x.contractId, status: x.status, result: x.result, reason: x.resultReasons[0] ?? x.result }));
  return { currency: "EUR", contracts: computed.map(x => x.contractId), excluded, partial: result.contracts.some(blocks),
    opening: { date: monthEnd(first - 1), debt: money(total(open, "debt")), rouNet: money(total(open, "rouNet")) }, points,
    flows: { payments: subtotal.payments, interest: subtotal.interest, principal: subtotal.principal },
    debtBridge: { opening: subtotal.debtOpening, additions: subtotal.additions, interest: subtotal.interest, payments: subtotal.payments, closing: subtotal.debtClosing },
    rouBridge: { opening: subtotal.rouNetOpening, additions: subtotal.additions, depreciation: subtotal.depreciation, closing: subtotal.rouNetClosing } };
}

const figures = (c: LeaseContractResult): ComparedFigures => ({ result: c.result, debtClosing: c.closing?.debtClosing ?? null, rouNetClosing: c.closing?.rouNetClosing ?? null, interest: c.closing?.interest ?? null, depreciation: c.closing?.depreciation ?? null });
const minus = (a: Money | null, b: Money | null) => a && b ? money(cents(a) - cents(b)) : null;

/** Faits observables entre deux versions d'un même contrat ; aucune cause n'est déduite d'une différence de montants. */
function factualChanges(a: LeaseContractResult, b: LeaseContractResult): string[] {
  const out: string[] = [], ra = a.schedule, rb = b.schedule;
  if (a.version !== b.version) out.push("version du contrat " + (a.version ?? "—") + " → " + (b.version ?? "—"));
  if (a.status !== b.status) out.push("statut " + a.status + " → " + b.status);
  if (a.result !== b.result) out.push("résultat " + a.result + " → " + b.result);
  if (ra && rb) {
    if (ra.dueDate[0] !== rb.dueDate[0]) out.push("première échéance " + ra.dueDate[0] + " → " + rb.dueDate[0]);
    if (ra.t.length !== rb.t.length) out.push("nombre d'échéances " + ra.t.length + " → " + rb.t.length);
    if (ra.payment[0] !== rb.payment[0]) out.push("loyer mensuel " + ra.payment[0] + " → " + rb.payment[0]);
  }
  if (a.exact && b.exact && a.exact.monthlyRate !== b.exact.monthlyRate) out.push("taux mensuel exact modifié");
  if (a.depreciationMonths !== b.depreciationMonths && a.depreciationMonths && b.depreciationMonths) out.push("durée d'amortissement " + a.depreciationMonths + " → " + b.depreciationMonths + " mois");
  if (JSON.stringify(a.opening?.declared ?? null) !== JSON.stringify(b.opening?.declared ?? null)) out.push("ouverture déclarée modifiée");
  if (a.fingerprint !== b.fingerprint && !out.length) out.push("sources du contrat modifiées sans changement des paramètres ci-dessus");
  return out;
}

/**
 * Comparaison de deux versions exécutées de la même feuille et du même exercice : montant antérieur, courant, écart et faits observés.
 * Aucune attribution d'effet à un paramètre ; plusieurs faits sur un contrat sont signalés comme non séparables.
 */
export function compareLeaseResults(previous: { runId: string; revision: number; version: number; result: LeaseResult }, current: { runId: string; revision: number; version: number; result: LeaseResult }): VersionComparison {
  const p = previous.result, c = current.result;
  if (p.period.startDate !== c.period.startDate || p.period.closingDate !== c.period.closingDate) throw new Error("L16_COMPARISON_PERIOD_MISMATCH");
  const before = new Map(p.contracts.map(x => [x.contractId, x])), after = new Map(c.contracts.map(x => [x.contractId, x]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const rows = ids.map(id => {
    const a = before.get(id), b = after.get(id);
    if (!a) return { contractId: id, previous: null, current: figures(b!), delta: null, changes: ["contrat absent de la version antérieure"] };
    if (!b) return { contractId: id, previous: figures(a), current: null, delta: null, changes: ["contrat absent de la version courante"] };
    const fa = figures(a), fb = figures(b), both = a.result === "computed" && b.result === "computed";
    return { contractId: id, previous: fa, current: fb, changes: factualChanges(a, b),
      delta: both ? { debtClosing: minus(fb.debtClosing, fa.debtClosing), rouNetClosing: minus(fb.rouNetClosing, fa.rouNetClosing), interest: minus(fb.interest, fa.interest), depreciation: minus(fb.depreciation, fa.depreciation) } : null };
  });
  const limits = ["Écarts calculés seulement entre deux contrats calculés ; un contrat bloqué dans l'une des versions n'a pas d'écart",
    "Les faits listés sont observés dans les versions figées ; aucun effet n'est attribué à un paramètre isolé"];
  if (rows.some(r => r.changes.length > 1)) limits.push("Plusieurs faits sur un même contrat : leurs effets ne sont pas séparables par différence");
  return { previous: { runId: previous.runId, revision: previous.revision, version: previous.version }, current: { runId: current.runId, revision: current.revision, version: current.version }, rows, limits };
}

const completed = (run: WorkpaperRun) => run.result?.execution === "completed" && (run.result.result as LeaseResult | undefined)?.schemaVersion === "ifrs16-result-2" ? run.result.result as LeaseResult : null;

/**
 * Vue de portefeuille d'une version de feuille : sans résultat, la synthèse et la table lisent la qualification seule (montants absents) ;
 * la comparaison porte sur la révision exécutée précédente de la même lignée et du même exercice, s'il y en a une.
 */
export function leasePortfolioView(run: WorkpaperRun, runs: readonly WorkpaperRun[], qualification: LeaseQualification | null): LeasePortfolioView | null {
  const result = completed(run);
  if (!result && !qualification) return null;
  const earlier = result ? runs.filter(r => r.rootId === run.rootId && r.revision < run.revision && r.period.startDate === run.period.startDate && r.period.closingDate === run.period.closingDate && completed(r))
    .sort((a, b) => b.revision - a.revision)[0] : undefined;
  return { version: LEASE_PORTFOLIO_VERSION, summary: portfolioSummary(qualification, result), rows: portfolioRows(qualification, result, run.notes), charts: result ? leaseCharts(result) : null,
    comparison: result && earlier ? compareLeaseResults({ runId: earlier.id, revision: earlier.revision, version: earlier.version, result: completed(earlier)! }, { runId: run.id, revision: run.revision, version: run.version, result }) : null };
}

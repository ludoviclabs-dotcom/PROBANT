import { money, type Money } from "@/lib/canonical-model/money";
import { add, div, FIXED_ONE, FIXED_ZERO, formatFixed, fromMoney, monthlyRateFromAnnual, mul, parseRate, sub, toCents, type Fixed } from "@/lib/ifrs/shared/fixed-point";
import { monthEnd, type LeaseEngineInputs } from "./qualification";

/**
 * Moteur pur IFRS 16 du périmètre V1 (L16-02) : preneur, euros, loyers fixes mensuels à terme échu, mois entiers, modèle du coût.
 * Conventions internes (C00 § 5, `internalPolicies` de la fiche), jamais attribuées à la norme :
 * - taux mensuel i = (1 + r)^(1/12) − 1 en virgule fixe à 40 décimales ; r / 12 interdit ;
 * - dette exacte D0 = Σ L / (1 + i)^t, puis D_t = D_(t−1) × (1 + i) − L (§ 26, § 36) ;
 * - publication des soldes au centime, moitié à l'opposé de zéro ; intérêt publié = dette publiée de clôture − d'ouverture + loyers ;
 *   l'écart avec l'intérêt économique arrondi est tracé par mois et borné à un centime, jamais caché ni forcé ;
 * - droit d'utilisation initial = dette initiale publiée (autres composantes déclarées nulles, § 23-24) ; amortissement linéaire depuis le
 *   commencement sur min(durée d'utilité, durée du contrat) (§ 31-32) ; cumul publié = arrondi(ROU × j / m).
 * Les montants exacts sortent en chaînes ; aucun `number` dans le chemin monétaire.
 */
export const LEASE_ENGINE_VERSION = "1.0.0";
export interface ScheduleRow { t: number; dueDate: string; payment: Money; openingDebt: Money; interest: Money; principal: Money; closingDebt: Money; economicInterestRounded: Money; roundingGap: Money }
export interface ClosingFigures {
  periodStart: string; closing: string; paymentsInPeriod: number; payments: Money; debtOpening: Money; additions: Money; interest: Money; principal: Money; debtClosing: Money;
  rouGross: Money; accumulatedOpening: Money; depreciation: Money; accumulatedClosing: Money; rouNetOpening: Money; rouNetClosing: Money;
  /** ROU net d'ouverture − dette d'ouverture : négatif = diminution des capitaux propres d'ouverture (C00 § 5.3). */
  openingEquityEffect: Money;
}
export type ContractComputation =
  | { result: "not_commenced"; reasons: string[] }
  | { result: "computed" | "diagnostic"; reasons: string[]; exact: { monthlyRate: string; debtInitial: string }; debtInitial: Money; rouInitial: Money; depreciationMonths: number;
      schedule: ScheduleRow[]; closing: ClosingFigures; maxAbsRoundingGap: Money; opening: null | { expected: OpeningFigures; declared: OpeningFigures; differences: OpeningFigures } };
type OpeningFigures = { debt: Money; rouGross: Money; rouAccumulated: Money; rouNet: Money };

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const eur = (value: bigint) => money(value);
const cent = (m: Money) => BigInt(m.amount.replace(".", ""));

/** Échéancier exact et publié d'un contrat (indépendant de la période). */
export function leaseSchedule(inputs: Pick<LeaseEngineInputs, "commencement" | "months" | "payment" | "annualRate">) {
  const n = inputs.months;
  if (!Number.isSafeInteger(n) || n < 1 || n > 120 || !/^\d{4}-\d{2}-01$/.test(inputs.commencement)) throw new Error("L16_CONTRACT_INVALID");
  const payment = fromMoney(inputs.payment), i = monthlyRateFromAnnual(parseRate(inputs.annualRate));
  const discount = div(FIXED_ONE, add(FIXED_ONE, i));
  let factor = FIXED_ONE, d0 = FIXED_ZERO;
  for (let t = 1; t <= n; t++) { factor = mul(factor, discount); d0 = add(d0, mul(payment, factor)); }
  const exact: Fixed[] = [d0];
  for (let t = 1; t <= n; t++) exact.push(sub(add(exact[t - 1], mul(exact[t - 1], i)), payment));
  const published = exact.map(toCents), L = cent(inputs.payment), start = monthIndex(inputs.commencement);
  if (published[n] !== 0n) throw new Error("L16_SCHEDULE_RESIDUAL");
  const rows: ScheduleRow[] = [];
  let maxGap = 0n;
  for (let t = 1; t <= n; t++) {
    const interest = published[t] - published[t - 1] + L, economic = toCents(mul(exact[t - 1], i)), gap = interest - economic;
    // A rounding gap above one cent is a residual to explain: never forced to zero, never hidden in the last due.
    if (gap > 1n || gap < -1n) throw new Error("L16_ROUNDING_GAP_EXCEEDED");
    if ((gap < 0n ? -gap : gap) > maxGap) maxGap = gap < 0n ? -gap : gap;
    rows.push({ t, dueDate: monthEnd(start + t - 1), payment: eur(L), openingDebt: eur(published[t - 1]), interest: eur(interest), principal: eur(L - interest), closingDebt: eur(published[t]), economicInterestRounded: eur(economic), roundingGap: eur(gap) });
  }
  return { monthly: i, exact, published, rows, maxGap };
}

/**
 * Chiffres d'un contrat éligible pour un exercice (périmètre de début et de clôture en mois entiers).
 * Un contrat historique n'est `computed` que si l'ouverture déclarée est égale au centime au recalcul depuis l'origine ; sinon `diagnostic` (D14, X24).
 */
export function computeLease(inputs: LeaseEngineInputs, period: { startDate: string; closingDate: string }): ContractComputation {
  if (!/^\d{4}-\d{2}-01$/.test(period.startDate) || period.closingDate !== monthEnd(monthIndex(period.closingDate)) || period.startDate > period.closingDate) throw new Error("L16_PERIOD_CALENDAR_INVALID");
  if (!Number.isSafeInteger(inputs.usefulLifeMonths) || inputs.usefulLifeMonths < 1) throw new Error("L16_CONTRACT_INVALID");
  const start = monthIndex(inputs.commencement);
  if (start > monthIndex(period.closingDate)) return { result: "not_commenced", reasons: ["X34 : prise d'effet postérieure à la clôture, rien de reconnu à cette date"] };
  const s = leaseSchedule(inputs), n = inputs.months, L = cent(inputs.payment), rou = s.published[0], m = Math.min(inputs.usefulLifeMonths, n);
  const paymentsMade = (date: string) => Math.max(0, Math.min(n, monthIndex(date) - start + 1));
  // Exact integer rounding of ROU x j / m in cents, half away from zero (ROU is never negative).
  const accumulated = (date: string) => { const j = BigInt(Math.max(0, Math.min(m, monthIndex(date) - start + 1))), M = BigInt(m); return (2n * rou * j + M) / (2n * M); };
  const openingDate = monthEnd(monthIndex(period.startDate) - 1), inPeriod = start >= monthIndex(period.startDate);
  const kOpen = paymentsMade(openingDate), kClose = paymentsMade(period.closingDate), rent = L * BigInt(kClose - kOpen);
  const debtOpen = inPeriod ? 0n : s.published[kOpen], debtBase = inPeriod ? rou : s.published[kOpen], debtClose = s.published[kClose];
  const interest = debtClose - debtBase + rent, accOpen = inPeriod ? 0n : accumulated(openingDate), accClose = accumulated(period.closingDate);
  const rouNetOpen = inPeriod ? 0n : rou - accOpen, rouNetClose = rou - accClose;
  if (accClose > rou || rouNetClose < 0n) throw new Error("L16_DEPRECIATION_INVALID");
  const closing: ClosingFigures = { periodStart: period.startDate, closing: period.closingDate, paymentsInPeriod: kClose - kOpen, payments: eur(rent), debtOpening: eur(debtOpen), additions: eur(inPeriod ? rou : 0n),
    interest: eur(interest), principal: eur(rent - interest), debtClosing: eur(debtClose), rouGross: eur(rou), accumulatedOpening: eur(accOpen), depreciation: eur(accClose - accOpen),
    accumulatedClosing: eur(accClose), rouNetOpening: eur(rouNetOpen), rouNetClosing: eur(rouNetClose), openingEquityEffect: eur(rouNetOpen - debtOpen) };
  const reasons: string[] = [];
  let result: "computed" | "diagnostic" = "computed", opening: Extract<ContractComputation, { result: "computed" | "diagnostic" }>["opening"] = null;
  if (!inPeriod) {
    const expected = { debt: eur(debtOpen), rouGross: eur(rou), rouAccumulated: eur(accOpen), rouNet: eur(rouNetOpen) };
    if (inputs.opening === null || inputs.opening === "absent" || inputs.opening === "incomplete") { result = "diagnostic"; reasons.push("X24 : contrat historique sans ouverture validée complète ; calcul affiché, aucun retraitement déterminé"); }
    else {
      const o = inputs.opening, declared = { debt: { amount: o.debt, currency: "EUR" as const }, rouGross: { amount: o.rouGross, currency: "EUR" as const }, rouAccumulated: { amount: o.rouAccumulated, currency: "EUR" as const }, rouNet: { amount: o.rouNet, currency: "EUR" as const } };
      const differences = { debt: eur(cent(declared.debt) - debtOpen), rouGross: eur(cent(declared.rouGross) - rou), rouAccumulated: eur(cent(declared.rouAccumulated) - accOpen), rouNet: eur(cent(declared.rouNet) - rouNetOpen) };
      opening = { expected, declared, differences };
      // The external opening is compared, never used to balance: one cent of difference is a diagnostic.
      if (Object.values(differences).some(x => x.amount !== "0.00") || o.date !== openingDate || cent(declared.rouGross) - cent(declared.rouAccumulated) !== cent(declared.rouNet)) {
        result = "diagnostic"; reasons.push("X24 : ouverture déclarée différente du recalcul depuis l'origine, ou datée hors de la veille de l'exercice");
      }
    }
  }
  return { result, reasons, exact: { monthlyRate: formatFixed(s.monthly), debtInitial: formatFixed(s.exact[0]) }, debtInitial: eur(rou), rouInitial: eur(rou), depreciationMonths: m,
    schedule: s.rows, closing, maxAbsRoundingGap: eur(s.maxGap), opening };
}

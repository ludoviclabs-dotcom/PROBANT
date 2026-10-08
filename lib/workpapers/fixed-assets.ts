import { z } from "zod";
import { cents, money, type KnownAmount } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertDate, assertFixedAssetsContext, assertUnique, type CycleContext } from "./cycle-context";
import { frozen, type EvidenceLink } from "./model";
import { evidence, known, methodEligible, reconcileFixedAssetFrameBalances, supportedAmountSchema, unknown, type BalanceLine, type DocumentedMethod, type SupportedAmount } from "./cycle-review";

export const movementSchema = z.object({ opening: supportedAmountSchema, additions: z.array(supportedAmountSchema), disposals: z.array(supportedAmountSchema), reversals: z.array(supportedAmountSchema), reclassifications: z.array(supportedAmountSchema), closing: supportedAmountSchema });
export type Movement = z.infer<typeof movementSchema>;
export interface FixedAsset { id: string; family: string; status: "in_progress" | "in_service" | "disposed"; inServiceDate?: string; gross: Movement; amortization: Movement; impairment: Movement }
/** One table bridge (brut, amortissements or dépréciations); the three tables are never added together. */
export function movementBridge(context: CycleContext, input: Movement, kind: "gross" | "amortization" | "impairment") {
  assertFixedAssetsContext(context);
  movementSchema.parse(input);
  if (kind !== "impairment" && input.reversals.length) throw new Error("REVERSAL_TABLE_MISMATCH");
  if (input.opening.date !== context.period.startDate || input.closing.date !== context.period.closingDate) throw new Error("MOVEMENT_ENDPOINT_DATE");
  const movements = [...input.additions, ...input.disposals, ...input.reversals, ...input.reclassifications];
  movements.forEach((r) => { if (r.date < context.period.startDate || r.date > context.period.closingDate) throw new Error("MOVEMENT_OUTSIDE_PERIOD"); });
  const all = [input.opening, input.closing, ...movements];
  const validEvidence = all.map((r) => evidence(context, r.evidence)).every(Boolean);
  if ([input.opening, input.closing, ...input.additions, ...input.disposals, ...input.reversals].some((r) => cents(r.amount) < 0n)) throw new Error("MOVEMENT_SIGN_INVALID");
  const sum = (rows: SupportedAmount[]) => rows.reduce((s, r) => s + cents(r.amount), 0n);
  const expected = money(cents(input.opening.amount) + sum(input.additions) - sum(input.disposals) - sum(input.reversals) + sum(input.reclassifications));
  const comparable = new Set(all.map((r) => r.basis)).size === 1 && validEvidence;
  return { kind, input, expected, difference: comparable ? known(money(cents(input.closing.amount) - cents(expected))) : unknown("SOURCE REQUISE : pièces ou base de mouvements"), convention: "clôture observée moins ouverture + entrées − sorties − reprises + reclassements signés" };
}
export function fixedAssetMovements(context: CycleContext, assets: FixedAsset[]) {
  assertFixedAssetsContext(context); assertUnique(assets.map((a) => a.id));
  const rows = assets.map((a) => {
    if (!a.family.trim() || !["in_progress", "in_service", "disposed"].includes(a.status)) throw new Error("ASSET_IDENTITY_REQUIRED");
    if (a.inServiceDate) assertDate(a.inServiceDate);
    const gross = movementBridge(context, a.gross, "gross"), amortization = movementBridge(context, a.amortization, "amortization"), impairment = movementBridge(context, a.impairment, "impairment");
    const vnc = money(cents(a.gross.closing.amount) - cents(a.amortization.closing.amount) - cents(a.impairment.closing.amount));
    return { id: a.id, family: a.family, status: a.status, inServiceDate: a.inServiceDate, gross, amortization, impairment, vnc, limitation: "VNC arithmétique, pas une conclusion de valeur ni une seconde exposition" };
  });
  return frozen({ rows, inputHash: stableSha256({ context, assets }), conclusion: null, mode: context.scope.mode });
}
/** Real-mode method: documented by an identified preparer from a cited source, applicable at the date, with verified evidence. Never a default. */
export interface FixedAssetDocumentedMethod { id: string; version: string; source: string; from: string; to: string; basis: string; authorId: string; evidence: EvidenceLink[]; synthetic: false }
export function fixedAssetMethodEligible(context: CycleContext, method: DocumentedMethod | FixedAssetDocumentedMethod | null, date: string) {
  assertFixedAssetsContext(context); assertDate(date);
  if (context.scope.mode === "demo") return method?.synthetic === true && methodEligible(method, date);
  if (!method || method.synthetic !== false) return false;
  assertDate(method.from); assertDate(method.to);
  return !!method.id && !!method.version && !!method.source.trim() && !!method.basis.trim() && !!method.authorId.trim() && evidence(context, method.evidence) && method.from <= date && date <= method.to;
}
export interface DepreciationParameters { method: DocumentedMethod | FixedAssetDocumentedMethod | null; kind: "linear"; cost: SupportedAmount; residual: SupportedAmount; inServiceDate: string | null; durationMonths: number; prorata: { numerator: string; denominator: string; evidence: SupportedAmount["evidence"] }; rounding: "half_up_cent" }
export function recalculateDepreciation(context: CycleContext, p: DepreciationParameters): KnownAmount {
  assertFixedAssetsContext(context); supportedAmountSchema.parse(p.cost); supportedAmountSchema.parse(p.residual);
  if (!p.inServiceDate || !fixedAssetMethodEligible(context, p.method, context.period.closingDate)) return unknown("SOURCE REQUISE : méthode et mise en service");
  assertDate(p.inServiceDate);
  if (p.inServiceDate > context.period.closingDate) return unknown("Mise en service postérieure à clôture");
  if (p.cost.basis !== p.residual.basis || p.cost.date !== p.residual.date || p.cost.date > context.period.closingDate) return unknown("Bases ou dates du coût et du résiduel non comparables");
  if (p.kind !== "linear" || p.rounding !== "half_up_cent" || !Number.isSafeInteger(p.durationMonths) || p.durationMonths <= 0 || !/^\d+$/.test(p.prorata.numerator) || !/^[1-9]\d*$/.test(p.prorata.denominator)) throw new Error("DEPRECIATION_PARAMETERS_INVALID");
  if (![p.cost.evidence, p.residual.evidence, p.prorata.evidence].map((e) => evidence(context, e)).every(Boolean)) return unknown("SOURCE REQUISE : base, résiduel ou prorata");
  const base = cents(p.cost.amount) - cents(p.residual.amount), n = BigInt(p.prorata.numerator), d = BigInt(p.prorata.denominator);
  if (base < 0n || cents(p.residual.amount) < 0n || n > d) throw new Error("DEPRECIATION_BASE_OR_PRORATA");
  const numerator = base * 12n * n, denominator = BigInt(p.durationMonths) * d;
  const result = (numerator * 2n + denominator) / (2n * denominator);
  return known(money(result > base ? base : result));
}
type Frame = ReturnType<typeof reconcileFixedAssetFrameBalances>;
type Candidate = { line: BalanceLine; criterion: string; explanation: string };
/** With a module export: register → module → GL. Without one (module = null): register → GL directly, never a fabricated module. */
export function frameFixedAssets(context: CycleContext, register: BalanceLine[], module: BalanceLine[], ledger: BalanceLine[], chargeCandidates: Candidate[]): { registerToModule: Frame; moduleToLedger: Frame; registerToLedger: null; candidates: (Candidate & { status: string; automaticReclassification: false })[]; limitation: string };
export function frameFixedAssets(context: CycleContext, register: BalanceLine[], module: null, ledger: BalanceLine[], chargeCandidates: Candidate[]): { registerToModule: null; moduleToLedger: null; registerToLedger: Frame; candidates: (Candidate & { status: string; automaticReclassification: false })[]; limitation: string };
export function frameFixedAssets(context: CycleContext, register: BalanceLine[], module: BalanceLine[] | null, ledger: BalanceLine[], chargeCandidates: Candidate[]) {
  chargeCandidates.forEach((c) => { if (!c.criterion.trim() || !c.explanation.trim()) throw new Error("CANDIDATE_CRITERION_REQUIRED"); evidence(context, c.line.value.evidence); });
  const candidates = chargeCandidates.map((c) => ({ ...c, status: "revue humaine requise", automaticReclassification: false as const }));
  const limitation = "Clés actif/compte explicites ; aucun seuil automatique ni reclassement sans revue";
  if (!module) return frozen({ registerToModule: null, moduleToLedger: null, registerToLedger: reconcileFixedAssetFrameBalances(context, register, ledger, "account"), candidates, limitation });
  return frozen({ registerToModule: reconcileFixedAssetFrameBalances(context, register, module, "party"), moduleToLedger: reconcileFixedAssetFrameBalances(context, module, ledger, "account"), registerToLedger: null, candidates, limitation });
}

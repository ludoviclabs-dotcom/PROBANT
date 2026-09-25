import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, knownAmountSchema, type EvidenceLink, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";
import { assertContext, assertDate, SOURCE_REQUIRED, type CycleContext } from "./cycle-context";

export type CutoffCandidate = "FAE" | "PCA" | "FNP" | "CCA";
export interface CutoffInput {
  context: CycleContext; economicEventKey: string; flow: "purchase" | "sale";
  documentKind: "invoice" | "credit_note"; originalEventKey?: string;
  invoice: { id: string; date?: string; availableAtClosing: "yes" | "no" | "unknown"; evidence: EvidenceLink[] } | null;
  performance: { date?: string; startDate?: string; endDate?: string; kind: "point" | "spread"; verified: boolean; evidence: EvidenceLink[]; allocationMethod?: string } | null;
  basis: { net: KnownAmount; tax: KnownAmount; gross: KnownAmount; evidence: EvidenceLink[] };
  recognition: { searched: boolean; alreadyRecognizedAmount: KnownAmount; bookingDate?: string; evidence: EvidenceLink[];
    existingAdjustments: { id: string; kind: CutoffCandidate; amount: KnownAmount; evidence: EvidenceLink[] }[] };
}
export interface CutoffResult {
  scope: WorkpaperScope;
  id: string; economicEventId: string; inputHash: string; version: "1.0.0";
  status: "candidate" | "already_treated" | "no_difference_on_tested_items" | "inconclusive";
  candidate: CutoffCandidate | null; amount: KnownAmount; reasons: string[];
  humanStatus: "pending"; evidence: EvidenceLink[];
  timeline: { label: string; date: string | null; verified: boolean }[];
  limitations: string[];
}
export function economicEventId(context: CycleContext, key: string) {
  if (!key.trim()) throw new Error("ECONOMIC_EVENT_KEY_REQUIRED");
  return `event-${stableSha256({ scope: context.scope, key })}`;
}
/** One shared, synthetic decision table. Real normative activation deliberately unavailable. */
export function analyzeCutoff(input: CutoffInput): CutoffResult {
  const eventId = economicEventId(input.context, input.economicEventKey);
  const inputHash = stableSha256(input);
  const evidence = [...(input.invoice?.evidence ?? []), ...(input.performance?.evidence ?? []), ...input.basis.evidence, ...input.recognition.evidence, ...input.recognition.existingAdjustments.flatMap((a) => a.evidence)];
  evidence.forEach((e) => assertScope(input.context.scope, e.scope));
  const timeline = [
    { label: "Fait générateur", date: input.performance?.date ?? null, verified: input.performance?.verified ?? false },
    { label: "Facture", date: input.invoice?.date ?? null, verified: !!input.invoice?.evidence.some((e) => e.status === "verified") },
    { label: "Comptabilisation", date: input.recognition.bookingDate ?? null, verified: input.recognition.searched },
    { label: "Clôture", date: input.context.period.closingDate, verified: input.context.period.validation === "confirmed" },
  ];
  const common = { scope: input.context.scope, id: `cutoff-${inputHash}`, economicEventId: eventId, inputHash, version: "1.0.0" as const, humanStatus: "pending" as const, evidence, timeline,
    limitations: [`${SOURCE_REQUIRED}: guide ch. 11–13 et méthode applicable ; grille technique synthétique, règle réelle désactivée.`, "Aucune écriture, TVA ou allocation linéaire automatique. Le candidat doit être revu avec motif."] };
  const result = (status: CutoffResult["status"], reasons: string[], candidate: CutoffCandidate | null = null, amount: KnownAmount = { kind: "unknown", reason: reasons.join(" ; ") || "Montant non déterminé" }): CutoffResult => frozen({ ...common, status, candidate, amount, reasons });
  if (input.context.scope.mode !== "demo" || input.context.purpose !== "synthetic_technical") return result("inconclusive", [SOURCE_REQUIRED, "REAL_CUTOFF_RULE_DISABLED"]);
  assertContext(input.context);
  for (const point of timeline) if (point.date) assertDate(point.date);
  for (const amount of [input.basis.net, input.basis.tax, input.basis.gross, input.recognition.alreadyRecognizedAmount, ...input.recognition.existingAdjustments.map((a) => a.amount)]) knownAmountSchema.parse(amount);
  if (!["purchase", "sale"].includes(input.flow) || !["invoice", "credit_note"].includes(input.documentKind)) throw new Error("CUTOFF_FLOW_INVALID");
  if (input.documentKind === "credit_note" && !input.originalEventKey) return result("inconclusive", ["AVOIR_EVENEMENT_ORIGINAL_REQUIS"]);
  if (!input.performance?.verified || !input.performance.evidence.some((e) => e.status === "verified")) return result("inconclusive", ["FAIT_GENERATEUR_VERIFIE_REQUIS"]);
  if (!["point", "spread"].includes(input.performance.kind)) throw new Error("PERFORMANCE_KIND_INVALID");
  if (input.performance.kind === "spread") {
    if (input.performance.startDate) assertDate(input.performance.startDate); if (input.performance.endDate) assertDate(input.performance.endDate);
    return result("inconclusive", [input.performance.allocationMethod ? "METHODE_ET_SOURCE_A_VALIDER" : "PERIODE_ET_METHODE_ALLOCATION_REQUISES"]);
  }
  if (!input.performance.date) return result("inconclusive", ["DATE_FAIT_GENERATEUR_REQUISE"]);
  if (!input.recognition.searched || !input.recognition.evidence.some((e) => e.status === "verified") || input.recognition.alreadyRecognizedAmount.kind !== "known") return result("inconclusive", ["RECHERCHE_COMPTABLE_A_CLOTURE_REQUISE"]);
  if (input.recognition.existingAdjustments.some((a) => a.amount.kind !== "known" || !a.evidence.some((e) => e.status === "verified"))) return result("inconclusive", ["REGULARISATION_EXISTANTE_A_VERIFIER"]);
  if (new Set(input.recognition.existingAdjustments.map((a) => a.id)).size !== input.recognition.existingAdjustments.length) throw new Error("DUPLICATE_ADJUSTMENT");
  const close = input.context.period.closingDate, happened = input.performance.date <= close;
  if (input.performance.date < input.context.period.startDate) return result("inconclusive", ["EVENEMENT_ANTERIEUR_A_L_EXERCICE"]);
  const kind: CutoffCandidate = input.flow === "sale" ? happened ? "FAE" : "PCA" : happened ? "FNP" : "CCA";
  if (input.recognition.existingAdjustments.some((a) => a.kind !== kind)) return result("inconclusive", ["NATURE_REGULARISATION_A_RAPPROCHER"]);
  const recognized = cents(input.recognition.alreadyRecognizedAmount.value);
  const adjustment = input.recognition.existingAdjustments.reduce((n, a) => n + (a.amount.kind === "known" ? cents(a.amount.value) : 0n), 0n);
  if (recognized !== 0n && (!input.recognition.bookingDate || input.recognition.bookingDate > close)) return result("inconclusive", ["DATE_COMPTABILISATION_A_CLOTURE_A_VERIFIER"]);
  if (!happened && recognized === 0n) return result("no_difference_on_tested_items", ["AUCUNE_CHARGE_OU_PRODUIT_ENREGISTRE_AVANT_CLOTURE"], null, { kind: "not_applicable", reason: "Aucun montant enregistré à reporter sur les éléments testés" });
  if (input.basis.net.kind !== "known" || !input.basis.evidence.some((e) => e.status === "verified")) return result("inconclusive", ["BASE_HT_VERIFIEE_REQUISE"]);
  if (input.basis.tax.kind === "known" && input.basis.gross.kind === "known" && cents(input.basis.net.value) + cents(input.basis.tax.value) !== cents(input.basis.gross.value)) return result("inconclusive", ["BASE_HT_TVA_TTC_INCOHERENTE"]);
  const target = happened ? cents(input.basis.net.value) : recognized;
  const handled = happened ? recognized + adjustment : adjustment;
  if (target * handled < 0n || (target === 0n && handled !== 0n)) return result("inconclusive", ["SIGNES_REGULARISATION_A_EXPLIQUER"]);
  const remainder = target - handled;
  if (remainder === 0n) return result("already_treated", ["ENREGISTREMENT_OU_REGULARISATION_EXISTANTE"], null, { kind: "not_applicable", reason: "Montant déjà rattaché ; aucun double ajustement" });
  if ((target > 0n && remainder < 0n) || (target < 0n && remainder > 0n)) return result("inconclusive", ["SUR_REGULARISATION_OU_SIGNE_A_EXPLIQUER"]);
  if (happened && input.invoice?.availableAtClosing === "yes") return result("inconclusive", ["FACTURE_RECUE_MAIS_ENREGISTREMENT_A_EXPLIQUER_HORS_GRILLE_FNP_FAE"]);
  if (happened && input.invoice?.availableAtClosing === "unknown") return result("inconclusive", ["DISPONIBILITE_FACTURE_A_CLOTURE_INCONNUE"]);
  return result("candidate", ["CANDIDAT_TECHNIQUE_A_REVOIR"], kind, { kind: "known", value: money(remainder) });
}
export interface CandidateDecision { resultId: string; inputHash: string; decision: "validated" | "rejected"; reason: string; actorId: string; at: string }
export function reviewCutoff(result: CutoffResult, context: CycleContext, decision: "validated" | "rejected", reason: string, at: string, principal: Principal): CandidateDecision {
  assertContext(context); authorize(principal, context.scope, "review");
  assertScope(context.scope, result.scope);
  result.evidence.forEach((e) => assertScope(context.scope, e.scope));
  if (result.status !== "candidate" || !reason.trim() || !Number.isFinite(Date.parse(at)) || !["validated", "rejected"].includes(decision)) throw new Error("CANDIDATE_REVIEW_INVALID");
  return frozen({ resultId: result.id, inputHash: result.inputHash, decision, reason, actorId: principal.id, at });
}
/** Preserve both procedures/evidence, never sum an economic event twice. */
export function uniqueEconomicExposures(results: { procedureId: string; result: CutoffResult }[]) {
  const groups = new Map<string, { economicEventId: string; amount: KnownAmount; procedureIds: string[]; evidence: EvidenceLink[] }>();
  for (const entry of results.filter((e) => e.result.status === "candidate")) {
    const current = groups.get(entry.result.economicEventId);
    if (current) {
      if (stableSha256(current.amount) !== stableSha256(entry.result.amount)) current.amount = { kind: "unknown", reason: "Estimations divergentes du même événement : revue requise" };
      current.procedureIds.push(entry.procedureId); current.evidence.push(...entry.result.evidence);
    } else groups.set(entry.result.economicEventId, { economicEventId: entry.result.economicEventId, amount: entry.result.amount, procedureIds: [entry.procedureId], evidence: [...entry.result.evidence] });
  }
  return frozen([...groups.values()].map((g) => ({ ...g, procedureIds: [...new Set(g.procedureIds)], evidence: [...new Map(g.evidence.map((e) => [e.id, e])).values()] })));
}
export function knownMoney(value: Money): KnownAmount { return { kind: "known", value }; }

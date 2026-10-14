import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, knownAmountSchema, type EvidenceLink, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";
import { assertContext, assertPayablesContext, assertDate, SOURCE_REQUIRED, type CycleContext } from "./cycle-context";
import { resolveCutoffRule, type CutoffRule } from "./cutoff-rule";
import type { FrenchGaapTextId } from "@/lib/knowledge/french-gaap";

/**
 * 1.1.0 (C11) : texte français applicable cité par résultat (exercice et, pour une vente sous ANC 2026-03, date du
 * contrat) ; un avoir propose un avoir à établir (AAE, 4198) ou à recevoir (AAR, 4098), jamais une FAE ou une FNP
 * négative. La grille des factures est inchangée.
 */
export const CUTOFF_RULE_VERSION = "1.1.0" as const;
/** FAE 418 · PCA 487 · FNP 408 · CCA 486 · AAE 4198 (avoir à établir) · AAR 4098 (avoir à recevoir). */
export type CutoffCandidate = "FAE" | "PCA" | "FNP" | "CCA" | "AAE" | "AAR";
export interface CutoffInput {
  context: CycleContext; economicEventKey: string; flow: "purchase" | "sale";
  documentKind: "invoice" | "credit_note"; originalEventKey?: string;
  invoice: { id: string; date?: string; availableAtClosing: "yes" | "no" | "unknown"; evidence: EvidenceLink[] } | null;
  /** Pour un avoir, le fait générateur est sa cause (retour, défaut, accord) ; ses montants sont des réductions positives. */
  performance: { date?: string; startDate?: string; endDate?: string; kind: "point" | "spread"; verified: boolean; evidence: EvidenceLink[]; allocationMethod?: string } | null;
  basis: { net: KnownAmount; tax: KnownAmount; gross: KnownAmount; evidence: EvidenceLink[] };
  recognition: { searched: boolean; alreadyRecognizedAmount: KnownAmount; bookingDate?: string; evidence: EvidenceLink[];
    existingAdjustments: { id: string; kind: CutoffCandidate; amount: KnownAmount; evidence: EvidenceLink[] }[] };
  /** Options d'anticipation déclarées pour le dossier (C11). Absentes : aucun texte n'est anticipé. */
  framework?: { anticipated: FrenchGaapTextId[] };
  /** Date de conclusion ou de dernier renouvellement du contrat de vente, si elle est sourcée (C11). */
  contract?: { date: string | null };
}
export interface CutoffResult {
  scope: WorkpaperScope;
  /** 1.0.0 : résultats antérieurs à C11, conservés tels qu'exécutés (sans `rule`). */
  id: string; economicEventId: string; inputHash: string; version: "1.0.0" | typeof CUTOFF_RULE_VERSION;
  status: "candidate" | "already_treated" | "no_difference_on_tested_items" | "inconclusive";
  candidate: CutoffCandidate | null; amount: KnownAmount; reasons: string[];
  humanStatus: "pending"; evidence: EvidenceLink[];
  timeline: { label: string; date: string | null; verified: boolean }[];
  limitations: string[];
  rule?: CutoffRule;
}
export function economicEventId(context: CycleContext, key: string) {
  if (!key.trim()) throw new Error("ECONOMIC_EVENT_KEY_REQUIRED");
  return `event-${stableSha256({ scope: context.scope, key })}`;
}
/** Shared investigation table; real entry is limited to the documented Mission 08 contract. */
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
  const rule = resolveCutoffRule({ startDate: input.context.period.startDate, closingDate: input.context.period.closingDate, flow: input.flow, anticipated: input.framework?.anticipated, contractDate: input.contract?.date ?? null });
  const common = { scope: input.context.scope, id: `cutoff-${inputHash}`, economicEventId: eventId, inputHash, version: CUTOFF_RULE_VERSION, humanStatus: "pending" as const, evidence, timeline, rule,
    limitations: [input.context.scope.mode === "real" ? "Investigation technique interne Mission 08 ; méthode et pièces documentées, sans opinion normative ni écriture automatique." : `${SOURCE_REQUIRED}: guide ch. 11–13 et méthode applicable ; grille technique synthétique, règle réelle désactivée.`, "Aucune écriture, TVA ou allocation linéaire automatique. Le candidat doit être revu avec motif.",
      rule.status === "resolved" ? `Rattachement : ${rule.label} — ${rule.articles}.` : rule.reasons.join(" ")] };
  const result = (status: CutoffResult["status"], reasons: string[], candidate: CutoffCandidate | null = null, amount: KnownAmount = { kind: "unknown", reason: reasons.join(" ; ") || "Montant non déterminé" }): CutoffResult => frozen({ ...common, status, candidate, amount, reasons });
  if (input.context.scope.mode === "real") {
    try { assertPayablesContext(input.context); } catch { return result("inconclusive", [SOURCE_REQUIRED, "REAL_CUTOFF_RULE_DISABLED"]); }
  } else assertContext(input.context);
  for (const point of timeline) if (point.date) assertDate(point.date);
  if (input.contract?.date) assertDate(input.contract.date);
  for (const amount of [input.basis.net, input.basis.tax, input.basis.gross, input.recognition.alreadyRecognizedAmount, ...input.recognition.existingAdjustments.map((a) => a.amount)]) knownAmountSchema.parse(amount);
  if (!["purchase", "sale"].includes(input.flow) || !["invoice", "credit_note"].includes(input.documentKind)) throw new Error("CUTOFF_FLOW_INVALID");
  if (input.documentKind === "credit_note" && !input.originalEventKey) return result("inconclusive", ["AVOIR_EVENEMENT_ORIGINAL_REQUIS"]);
  // Deux textes peuvent régir la même vente (ANC 2026-03 ou texte antérieur) : sans date de contrat, rien n'est proposé.
  if (input.context.scope.mode === "real" && rule.status === "contract_information_required") return result("inconclusive", [rule.contract.status === "entry_day" ? "CONTRAT_CONCLU_LE_JOUR_DE_L_ENTREE_EN_VIGUEUR_ANC_2026_03" : "DATE_DU_CONTRAT_REQUISE_ANC_2026_03"]);
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
  if (input.documentKind === "credit_note") return creditNote(input, happened, result);
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
/**
 * Avoir dont la cause (retour, défaut, accord commercial) est datée : rattaché à l'exercice si la cause précède la
 * clôture (PCG 512-4 / 511-3 ; ANC 2026-03, art. 522-6 et 522-7 pour une vente), sinon sans effet sur l'exercice.
 * Convention signée de la Mission 08 conservée : un avoir porte des montants négatifs ; le candidat AAE / AAR l'est
 * aussi. La part déjà comptabilisée ou régularisée avant clôture n'est jamais reproposée.
 */
function creditNote(input: CutoffInput, happened: boolean, result: (status: CutoffResult["status"], reasons: string[], candidate?: CutoffCandidate | null, amount?: KnownAmount) => CutoffResult): CutoffResult {
  const close = input.context.period.closingDate, kind: CutoffCandidate = input.flow === "sale" ? "AAE" : "AAR";
  if (input.recognition.existingAdjustments.some((a) => a.kind !== kind)) return result("inconclusive", ["NATURE_REGULARISATION_A_RAPPROCHER"]);
  const recognized = input.recognition.alreadyRecognizedAmount.kind === "known" ? cents(input.recognition.alreadyRecognizedAmount.value) : 0n;
  const adjustment = input.recognition.existingAdjustments.reduce((n, a) => n + (a.amount.kind === "known" ? cents(a.amount.value) : 0n), 0n);
  if (recognized !== 0n && (!input.recognition.bookingDate || input.recognition.bookingDate > close)) return result("inconclusive", ["DATE_COMPTABILISATION_A_CLOTURE_A_VERIFIER"]);
  if (input.basis.net.kind !== "known" || !input.basis.evidence.some((e) => e.status === "verified")) return result("inconclusive", ["BASE_HT_VERIFIEE_REQUISE"]);
  const net = cents(input.basis.net.value);
  if (net >= 0n || recognized > 0n || adjustment > 0n) return result("inconclusive", ["AVOIR_MONTANTS_NEGATIFS_ATTENDUS"]);
  if (input.basis.tax.kind === "known" && input.basis.gross.kind === "known" && net + cents(input.basis.tax.value) !== cents(input.basis.gross.value)) return result("inconclusive", ["BASE_HT_TVA_TTC_INCOHERENTE"]);
  if (!happened) return recognized === 0n && adjustment === 0n
    ? result("no_difference_on_tested_items", ["AVOIR_DE_CAUSE_POSTERIEURE_A_LA_CLOTURE"], null, { kind: "not_applicable", reason: "Cause de l’avoir postérieure à la clôture : aucun rattachement à l’exercice" })
    : result("inconclusive", ["AVOIR_ENREGISTRE_AVANT_SA_CAUSE_A_EXPLIQUER"]);
  const remainder = net - recognized - adjustment;
  if (remainder === 0n) return result("already_treated", ["AVOIR_ENREGISTRE_OU_REGULARISE"], null, { kind: "not_applicable", reason: "Avoir déjà rattaché ; aucun double ajustement" });
  if (remainder > 0n) return result("inconclusive", ["SUR_REGULARISATION_OU_SIGNE_A_EXPLIQUER"]);
  if (input.invoice?.availableAtClosing === "yes") return result("inconclusive", ["AVOIR_DISPONIBLE_A_CLOTURE_MAIS_ENREGISTREMENT_A_EXPLIQUER"]);
  if (input.invoice?.availableAtClosing === "unknown") return result("inconclusive", ["DISPONIBILITE_AVOIR_A_CLOTURE_INCONNUE"]);
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

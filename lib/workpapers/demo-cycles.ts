/** SERVER ONLY: fixtures generated locally, never populated from a real dossier. */
import { z } from "zod";
import { createTaxProfile, createTaxPeriod } from "@/lib/tax/canonical";
import { money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { clientReceivables, clientImpairment, frameClients, clientEvidence } from "./clients";
import { fixedAssetMovements, recalculateDepreciation, frameFixedAssets, type Movement } from "./fixed-assets";
import { reviewEquity } from "./equity";
import { testPurchases } from "./purchases";
import { comparePaidLeave } from "./paid-leave";
import { reviewInvestment } from "./investments";
import { adaptTaxWorkpaper } from "./tax-adapter";
import { reconcileCash } from "./cash";
import { analyzeCutoff } from "./cutoff";
import { searchUnrecordedLiabilities } from "./payables";
import { amountFromImport, type CycleContext } from "./cycle-context";
import { type EvidenceLink, type Population, type SelectionSet } from "./model";
import { type ImportBatch } from "./imports";
import { type Principal } from "./policy";
import type { CutoffInput } from "./cutoff";
import { demoAssessment, cutoffOutcome, type DemoCycleReport } from "./demo-assessment";
import { differenceOutcome } from "./result-contract";
export const demoCycleSchema = z.enum(["cash", "cutoff", "fournisseurs", "clients", "immobilisations", "capitaux", "achats", "conges", "participations", "is"]);
export type DemoCycle = z.infer<typeof demoCycleSchema>;
export const demoParameterSchema = z.object({ cycle: demoCycleSchema, missingEvidence: z.boolean(), methodAvailable: z.boolean(), scenario: z.enum(["nominal", "exception", "invalid"]).optional() }).strict();
export type DemoParameters = z.infer<typeof demoParameterSchema>;
export function computeDemoCycle(p: DemoParameters, context: CycleContext, batch: ImportBatch, population: Population, selection: SelectionSet, actor: Principal): DemoCycleReport {
  demoParameterSchema.parse(p);
  const { control, pending, report, target, prerequisiteReason } = demoAssessment(p);
  if (prerequisiteReason) return report({ status: p.scenario === "invalid" ? "invalid_input" : "prerequisite_missing", reason: prerequisiteReason }, [pending(target.id, target.label, prerequisiteReason, true), ...(p.cycle === "is" ? [pending("is.tax-engine", "Calcul IS", "Profil, sources, paramètres et raccord effectif au moteur IS requis ; millésime 2024 non couvert.", true, "blocked")] : [])]);
  const tested = (outcome: Parameters<typeof control>[2], reason?: string) => control(target.id, target.label, outcome, reason);
  const row = batch.rows[0], proof: EvidenceLink = { id: `proof-${row.id}`, scope: context.scope, procedureId: "SYNTHETIC-PARAMETERS", documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision: "row", status: "verified", purpose: "Fixture synthétique générée, paramètres manuels de démonstration, aucune PBC réelle" };
  const links = p.missingEvidence ? [] : [proof];
  const v = (n: bigint, date = context.period.closingDate, basis = "EUR") => ({ amount: money(n), date, basis, evidence: links });
  const k = (n: bigint) => ({ kind: "known" as const, value: money(n) });
  const method = p.methodAvailable ? { id: "SYNTHETIC-ONLY", version: "1.0.0", source: "Méthode arithmétique synthétique ; pas du guide ni d’une norme", from: context.period.startDate, to: context.period.closingDate, approvedBy: "SYNTHETIC-REVIEWER", synthetic: true as const } : null;
  const cutoff = (flow: "purchase" | "sale"): CutoffInput => ({ context, economicEventKey: "SYNTHETIC-EVENT", flow, documentKind: "invoice", invoice: { id: "SYNTHETIC-I", date: context.period.asOfDate, availableAtClosing: "no", evidence: links }, performance: { date: context.period.closingDate, kind: "point", verified: !p.missingEvidence, evidence: links }, basis: { net: k(10000n), tax: k(2000n), gross: k(12000n), evidence: links }, recognition: { searched: true, alreadyRecognizedAmount: k(0n), evidence: links, existingAdjustments: [] } });
  const line = (id: string, n: bigint) => ({ id, key: "SYNTHETIC-ACCOUNT", account: "SYNTHETIC-ACCOUNT", party: "SYNTHETIC-SUBJECT", value: v(n) });
  switch (p.cycle) {
    case "cash": {
      const first = amountFromImport(batch, batch.rows[0].id, actor), second = amountFromImport(batch, batch.rows[1].id, actor);
      const r = reconcileCash({ context, account: { id: "SYN-ACCOUNT", bankId: "SYN-BANK", bankLabel: "Banque synthétique", accountReference: "SYN-ACCOUNT", aliases: [], currency: "EUR" }, convention: { version: "synthetic-1", label: "positive_increases_book_balance", validatedBy: actor.id, bankColumn: "Bank", accountColumn: "Account" }, ledger: first, statement: p.scenario === "exception" ? second : first, erbBook: first, erbBank: p.scenario === "exception" ? second : first, items: [] });
      return report(r, [tested(r.hasArithmeticException ? "exceptions_detected" : "no_exception_detected"), pending("cash.confirmations", "Confirmations bancaires", "Confirmation et apurement non testés dans cette fixture.")]);
    }
    case "cutoff": { const r = analyzeCutoff({ ...cutoff("purchase"), recognition: { ...cutoff("purchase").recognition, alreadyRecognizedAmount: k(p.scenario === "exception" ? 0n : 10000n), bookingDate: context.period.closingDate } });
      return report(r, [tested(cutoffOutcome(r), r.status === "candidate" ? "Rattachement absent démontré ; candidat FNP synthétique à qualifier en revue." : "Événement déjà rattaché, aucun double ajustement."), pending("cutoff.qualification", "Qualification métier", "Qualification du candidat et règle réelle à confirmer.")]);
    }
    case "fournisseurs": {
      const event = cutoff("purchase");
      const payments = batch.rows.map((r, i) => ({ id: `SYN-P${i + 1}`, bankAccountId: "SYN-BANK-ACCOUNT", value: amountFromImport(batch, r.id, actor) }));
      const r = searchUnrecordedLiabilities({ paymentAccountColumn: "BankAccount", context, window: { startDate: "2024-07-01", endDate: context.period.asOfDate, coverage: p.missingEvidence ? "incomplete" : "documented", documentVersionIds: [batch.document.id] }, imports: [batch], population, selection, payments, events: [{ ...event, recognition: { ...event.recognition, alreadyRecognizedAmount: k(p.scenario === "exception" ? 0n : 10000n), bookingDate: context.period.closingDate } }], allocations: p.missingEvidence ? [] : [{ paymentId: "SYN-P1", economicEventKey: event.economicEventKey, amount: money(12000n), evidence: proof }] });
      const status = r.rows[0].status;
      return report(r, [tested(status === "omission_candidate" ? "exceptions_detected" : status === "booked_in_period" || status === "existing_accrual" || status === "outside_period_justified" ? "no_exception_detected" : "inconclusive"), pending("fournisseurs.unallocated", "Paiement non affecté", "Le second paiement reste sans facture affectée ; exhaustivité non démontrée.")]);
    }
    case "clients": { const r = { receivables: clientReceivables({ context, invoices: [{ id: "SYNTHETIC-I", customerId: "SYNTHETIC-C", amount: money(100000n), issuedOn: context.period.startDate, letteringStatus: "unknown", bookedImpairment: k(0n), evidence: [proof] }], payments: [{ id: "P1", customerId: "SYNTHETIC-C", amount: money(30000n), paidOn: context.period.closingDate, evidence: [proof] }, { id: "P2", customerId: "SYNTHETIC-C", amount: money(20000n), paidOn: context.period.asOfDate, evidence: [proof] }], allocations: [{ paymentId: "P1", invoiceId: "SYNTHETIC-I", amount: money(30000n), evidence: [proof] }, { paymentId: "P2", invoiceId: "SYNTHETIC-I", amount: money(20000n), evidence: [proof] }], credits: [] }), frame: frameClients(context, [line("G", 70000n)], [line("A", p.scenario === "exception" ? 69000n : 70000n)], [line("B", 70000n)], []), impairment: clientImpairment(context, v(10000n), v(10000n), method), evidence: clientEvidence(context, [], [{ ...cutoff("sale"), recognition: { ...cutoff("sale").recognition, alreadyRecognizedAmount: k(10000n), bookingDate: context.period.closingDate } }]) };
      return report(r, [tested(differenceOutcome(r.frame.generalToAuxiliary.gross)), control("clients.auxiliary-aged", "Cadrage auxiliaire / balance âgée", differenceOutcome(r.frame.auxiliaryToAged.gross)), control("clients.impairment", "Estimation / dépréciation comptabilisée", differenceOutcome(r.impairment)), control("clients.cutoff", "Cut-off ventes testé", cutoffOutcome(r.evidence.cutoff[0])), pending("clients.confirmations", "Confirmations et recouvrabilité", "Confirmations absentes ; l’âge seul ne prouve pas la recouvrabilité.")]);
    }
    case "immobilisations": {
      const bridge = (o: bigint, a: bigint, d: bigint, c: bigint): Movement => ({ opening: v(o, context.period.startDate), additions: [v(a)], disposals: [v(d)], reversals: [], reclassifications: [], closing: v(c) });
      const r = { movements: fixedAssetMovements(context, [{ id: "SYNTHETIC-A", family: "SYNTHETIC-F", status: "in_service", inServiceDate: context.period.startDate, gross: bridge(100000n, 20000n, 10000n, p.scenario === "exception" ? 109000n : 110000n), amortization: bridge(30000n, 10000n, 4000n, 36000n), impairment: bridge(2000n, 0n, 0n, 2000n) }]), recalculation: recalculateDepreciation(context, { method, kind: "linear", cost: v(100000n), residual: v(10000n), inServiceDate: context.period.startDate, durationMonths: 60, prorata: { numerator: "1", denominator: "1", evidence: links }, rounding: "half_up_cent" }), frame: frameFixedAssets(context, [line("R", 110000n)], [line("M", 110000n)], [line("G", 110000n)], []) };
      return report(r, [tested(differenceOutcome(r.movements.rows[0].gross.difference)), control("immobilisations.amortization", "Pont des amortissements", differenceOutcome(r.movements.rows[0].amortization.difference)), control("immobilisations.impairment", "Pont des dépréciations", differenceOutcome(r.movements.rows[0].impairment.difference)), control("immobilisations.register-module", "Registre / module", differenceOutcome(r.frame.registerToModule.gross)), control("immobilisations.module-ledger", "Module / GL", differenceOutcome(r.frame.moduleToLedger.gross)), pending("immobilisations.recalculation-booked", "Recalcul / dotation comptabilisée", "Recalcul documenté, mais dotation comparable absente ; aucune conclusion de valeur.")]);
    }
    case "capitaux": { const r = reviewEquity({ context, capitalComponentId: "SYN-CAP", reserveComponentIds: [], components: [{ id: "SYN-CAP", accounts: ["SYN-101"], opening: v(10000n, context.period.startDate), movements: [], closing: v(p.scenario === "exception" ? 9000n : 10000n) }], allocations: [{ id: "SYN-AFFECT", decision: p.missingEvidence ? null : v(5000n), booked: v(5000n), payment: null, decisionReference: "SYN-PV-v1", readingValidated: !p.missingEvidence }], events: [{ id: "SYN-E", description: "Événement synthétique sans écriture", effectiveDate: context.period.closingDate, evidence: links, review: "pending", accountingMovementId: null }] });
      return report(r, [tested(differenceOutcome(r.rows[0].difference)), control("capitaux.allocation", "Affectation votée / comptabilisée", differenceOutcome(r.allocations[0].difference)), pending("capitaux.legal", "Événement sans écriture et conclusion juridique", "Événement en attente de revue et règle juridique applicable requise.")]);
    }
    case "achats": {
      const event: CutoffInput = { ...cutoff("purchase"), basis: { net: k(30n), tax: k(0n), gross: k(30n), evidence: links } };
      const r = testPurchases({ context, imports: [batch], population, selection, invoices: [{ id: "SYNTHETIC-I", amount: v(30n, context.period.closingDate, "HT") }], tests: batch.rows.map((r, index) => ({ id: r.id, line: amountFromImport(batch, r.id, actor), invoiceId: "SYNTHETIC-I", allocated: p.scenario === "exception" && index === 0 ? money(0n) : r.normalized!.amount, basis: "HT", evidence: links, cutoff: event })) });
      const differences = r.rows.map((row) => differenceOutcome(row.difference));
      return report(r, [tested(differences.includes("exceptions_detected") ? "exceptions_detected" : differences.includes("inconclusive") ? "inconclusive" : "no_exception_detected"), ...r.rows.map((row, i) => control(`achats.cutoff-${i + 1}`, `Rattachement de la ligne ${i + 1}`, cutoffOutcome(row.cutoffResult))), pending("achats.completeness", "Exhaustivité des charges", "Une sélection GL ne prouve pas l’exhaustivité des charges absentes.")]);
    }
    case "conges": {
      const rights = { employeePseudonym: "SYN-001", from: context.period.startDate, to: context.period.closingDate, unit: "hours" as const, acquired: "10.00", taken: "4.00", remaining: "6.00" };
      const first = { rights, method, base: v(10000n), numerator: "2", denominator: "3", inclusions: ["base synthétique"], exclusions: [] };
      const r = comparePaidLeave({ context, rights, first, second: first, comparisonMethod: method, equivalenceEvidence: links, booked: v(p.scenario === "exception" ? 6000n : 6667n, context.period.closingDate, stableSha256(rights)), associatedCharges: null });
      return report(r, [tested(differenceOutcome(r.bookedDifference)), control("conges.comparability", "Comparabilité des droits et des méthodes", r.comparable ? "no_exception_detected" : "inconclusive"), pending("conges.remaining", "Droits restants et charges associées", "Méthode dédiée aux droits restants et charges associées absente ; aucune extrapolation.")]);
    }
    case "participations": { const r = reviewInvestment({ context, securityId: "SYN-T", categoryProposed: "à qualifier", intention: "Détention synthétique documentée", classificationMethod: method, distribution: p.missingEvidence ? null : v(4000n), rights: { classId: "SYN-ORDINARY", from: context.period.startDate, to: context.period.closingDate, entitlementDate: context.period.closingDate, numerator: "1", denominator: "4", homogeneous: true, evidence: links }, bookedDividend: v(p.scenario === "exception" ? 900n : 1000n), receivedDividend: null, cost: v(10000n), bookedImpairment: v(1000n), externalModel: null });
      return report(r, [tested(differenceOutcome(r.bookedDifference)), pending("participations.value", "Valeur et dépréciation des titres", "Modèle externe versionné et qualification des titres requis.")]);
    }
    case "is": {
      const owned = { organizationId: context.scope.organizationId, dossierId: context.scope.dossierId, entityId: "SYN-E" };
      const profile = createTaxProfile({ ...owned, id: "SYN-PROFILE", version: "1", jurisdiction: "FR", status: "draft", corporateIncomeTaxRegime: "unknown", vatRegime: "unknown", accountingPeriod: { startDate: context.period.startDate, endDate: context.period.closingDate }, corporateIncomeTaxGroupStatus: "unknown", vatGroupStatus: "unknown", turnoverAmountCents: null, capitalPaidStatus: "unknown", ownershipStatus: "unknown", qualifyingIndividualOwnershipBasisPoints: null, vatLiabilityRatioStatus: "unknown", vatLiabilityRatioBasisPoints: null, establishments: [], parameters: [], confirmedBy: null, confirmedAt: null, createdAt: "2024-08-01T00:00:00Z" });
      const period = createTaxPeriod({ ...owned, id: context.scope.periodId, taxType: "corporate_income_tax", startDate: context.period.startDate, endDate: context.period.closingDate, fiscalYear: 2024, formVintage: 2024, frequency: "annual", accountingPeriodId: context.scope.periodId, status: "open", version: "1", sourceRefs: [batch.document.id], createdAt: "2024-08-01T00:00:00Z" });
      const r = adaptTaxWorkpaper({ context, tax: { ...owned, profile, period, documents: [], executionStates: [], plannerVersion: "tax-control-planner-1.0.0" }, ruleVersion: "SYNTHETIC-BRIDGE-1", sourceVersions: [batch.document.id], resultConvention: "profit_positive", resultBasis: "after_tax", accountingResult: v(10000n, context.period.closingDate, "after_tax"), clientAccountingResult: v(p.scenario === "exception" ? 9000n : 10000n, context.period.closingDate, "after_tax"), adjustments: [] });
      return report(r, [tested(differenceOutcome(r.accountingDifference)), pending("is.tax-engine", "Calcul IS", `${r.taxEngine.reason}. Profil confirmé, sources, paramètres et raccord effectif au moteur requis.`, true, "blocked")], true);
    }
  }
}
export const demoResultHash = (value: unknown) => stableSha256(value);

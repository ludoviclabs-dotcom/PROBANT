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
import { amountFromImport, type CycleContext } from "./cycle-context";
import { type EvidenceLink, type Population, type SelectionSet } from "./model";
import { type ImportBatch } from "./imports";
import { type Principal } from "./policy";
import type { CutoffInput } from "./cutoff";
export const demoCycleSchema = z.enum(["clients", "immobilisations", "capitaux", "achats", "conges", "participations", "is"]);
export type DemoCycle = z.infer<typeof demoCycleSchema>;
export const demoParameterSchema = z.object({ cycle: demoCycleSchema, missingEvidence: z.boolean(), methodAvailable: z.boolean() }).strict();
export type DemoParameters = z.infer<typeof demoParameterSchema>;
export function computeDemoCycle(p: DemoParameters, context: CycleContext, batch: ImportBatch, population: Population, selection: SelectionSet, actor: Principal) {
  demoParameterSchema.parse(p);
  const row = batch.rows[0], proof: EvidenceLink = { id: `proof-${row.id}`, scope: context.scope, procedureId: "SYNTHETIC-PARAMETERS", documentVersionId: batch.document.id, rowId: row.id, locator: row.locator, precision: "row", status: "verified", purpose: "Fixture synthétique générée, paramètres manuels de démonstration, aucune PBC réelle" };
  const links = p.missingEvidence ? [] : [proof];
  const v = (n: bigint, date = context.period.closingDate, basis = "EUR") => ({ amount: money(n), date, basis, evidence: links });
  const k = (n: bigint) => ({ kind: "known" as const, value: money(n) });
  const method = p.methodAvailable ? { id: "SYNTHETIC-ONLY", version: "1.0.0", source: "Méthode arithmétique synthétique ; pas du guide ni d’une norme", from: context.period.startDate, to: context.period.closingDate, approvedBy: "SYNTHETIC-REVIEWER", synthetic: true as const } : null;
  const cutoff = (flow: "purchase" | "sale"): CutoffInput => ({ context, economicEventKey: "SYNTHETIC-EVENT", flow, documentKind: "invoice", invoice: { id: "SYNTHETIC-I", date: context.period.asOfDate, availableAtClosing: "no", evidence: links }, performance: { date: context.period.closingDate, kind: "point", verified: !p.missingEvidence, evidence: links }, basis: { net: k(10000n), tax: k(2000n), gross: k(12000n), evidence: links }, recognition: { searched: true, alreadyRecognizedAmount: k(0n), evidence: links, existingAdjustments: [] } });
  const line = (id: string, n: bigint) => ({ id, key: "SYNTHETIC-ACCOUNT", account: "SYNTHETIC-ACCOUNT", party: "SYNTHETIC-SUBJECT", value: v(n) });
  switch (p.cycle) {
    case "clients": return { receivables: clientReceivables({ context, invoices: [{ id: "SYNTHETIC-I", customerId: "SYNTHETIC-C", amount: money(100000n), issuedOn: context.period.startDate, letteringStatus: "unknown", bookedImpairment: k(0n), evidence: [proof] }], payments: [{ id: "P1", customerId: "SYNTHETIC-C", amount: money(30000n), paidOn: context.period.closingDate, evidence: [proof] }, { id: "P2", customerId: "SYNTHETIC-C", amount: money(20000n), paidOn: context.period.asOfDate, evidence: [proof] }], allocations: [{ paymentId: "P1", invoiceId: "SYNTHETIC-I", amount: money(30000n), evidence: [proof] }, { paymentId: "P2", invoiceId: "SYNTHETIC-I", amount: money(20000n), evidence: [proof] }], credits: [] }), frame: frameClients(context, [line("G", 70000n)], [line("A", 70000n)], [line("B", 70000n)], []), impairment: clientImpairment(context, v(0n), v(10000n), method), evidence: clientEvidence(context, [], [cutoff("sale")]) };
    case "immobilisations": {
      const bridge = (o: bigint, a: bigint, d: bigint, c: bigint): Movement => ({ opening: v(o, context.period.startDate), additions: [v(a)], disposals: [v(d)], reversals: [], reclassifications: [], closing: v(c) });
      return { movements: fixedAssetMovements(context, [{ id: "SYNTHETIC-A", family: "SYNTHETIC-F", status: "in_service", inServiceDate: context.period.startDate, gross: bridge(100000n, 20000n, 10000n, 110000n), amortization: bridge(30000n, 10000n, 4000n, 36000n), impairment: bridge(2000n, 0n, 0n, 2000n) }]), recalculation: recalculateDepreciation(context, { method, kind: "linear", cost: v(100000n), residual: v(10000n), inServiceDate: context.period.startDate, durationMonths: 60, prorata: { numerator: "1", denominator: "1", evidence: links }, rounding: "half_up_cent" }), frame: frameFixedAssets(context, [line("R", 110000n)], [line("M", 110000n)], [line("G", 110000n)], []) };
    }
    case "capitaux": return reviewEquity({ context, capitalComponentId: "SYN-CAP", reserveComponentIds: [], components: [{ id: "SYN-CAP", accounts: ["SYN-101"], opening: v(10000n, context.period.startDate), movements: [], closing: v(10000n) }], allocations: [{ id: "SYN-AFFECT", decision: p.missingEvidence ? null : v(5000n), booked: v(5000n), payment: null, decisionReference: "SYN-PV-v1", readingValidated: !p.missingEvidence }], events: [{ id: "SYN-E", description: "Événement synthétique sans écriture", effectiveDate: context.period.closingDate, evidence: links, review: "pending", accountingMovementId: null }] });
    case "achats": return testPurchases({ context, imports: [batch], population, selection, invoices: [{ id: "SYNTHETIC-I", amount: v(30n, context.period.closingDate, "HT") }], tests: batch.rows.map((r) => ({ id: r.id, line: amountFromImport(batch, r.id, actor), invoiceId: "SYNTHETIC-I", allocated: r.normalized!.amount, basis: "HT", evidence: links, cutoff: cutoff("purchase") })) });
    case "conges": {
      const rights = { employeePseudonym: "SYN-001", from: context.period.startDate, to: context.period.closingDate, unit: "hours" as const, acquired: "10.00", taken: "4.00", remaining: "6.00" };
      const first = { rights, method, base: v(10000n), numerator: "2", denominator: "3", inclusions: ["base synthétique"], exclusions: [] };
      return comparePaidLeave({ context, rights, first, second: { ...first, numerator: "1", denominator: "2" }, comparisonMethod: method, equivalenceEvidence: links, booked: null, associatedCharges: null });
    }
    case "participations": return reviewInvestment({ context, securityId: "SYN-T", categoryProposed: "à qualifier", intention: "Détention synthétique documentée", classificationMethod: method, distribution: p.missingEvidence ? null : v(4000n), rights: { classId: "SYN-ORDINARY", from: context.period.startDate, to: context.period.closingDate, entitlementDate: context.period.closingDate, numerator: "1", denominator: "4", homogeneous: true, evidence: links }, bookedDividend: v(1000n), receivedDividend: null, cost: v(10000n), bookedImpairment: v(1000n), externalModel: null });
    case "is": {
      const owned = { organizationId: context.scope.organizationId, dossierId: context.scope.dossierId, entityId: "SYN-E" };
      const profile = createTaxProfile({ ...owned, id: "SYN-PROFILE", version: "1", jurisdiction: "FR", status: "draft", corporateIncomeTaxRegime: "unknown", vatRegime: "unknown", accountingPeriod: { startDate: context.period.startDate, endDate: context.period.closingDate }, corporateIncomeTaxGroupStatus: "unknown", vatGroupStatus: "unknown", turnoverAmountCents: null, capitalPaidStatus: "unknown", ownershipStatus: "unknown", qualifyingIndividualOwnershipBasisPoints: null, vatLiabilityRatioStatus: "unknown", vatLiabilityRatioBasisPoints: null, establishments: [], parameters: [], confirmedBy: null, confirmedAt: null, createdAt: "2024-08-01T00:00:00Z" });
      const period = createTaxPeriod({ ...owned, id: context.scope.periodId, taxType: "corporate_income_tax", startDate: context.period.startDate, endDate: context.period.closingDate, fiscalYear: 2024, formVintage: 2024, frequency: "annual", accountingPeriodId: context.scope.periodId, status: "open", version: "1", sourceRefs: [batch.document.id], createdAt: "2024-08-01T00:00:00Z" });
      return adaptTaxWorkpaper({ context, tax: { ...owned, profile, period, documents: [], executionStates: [], plannerVersion: "tax-control-planner-1.0.0" }, ruleVersion: "SYNTHETIC-BRIDGE-1", sourceVersions: [batch.document.id], resultConvention: "profit_positive", resultBasis: "after_tax", accountingResult: v(10000n, context.period.closingDate, "after_tax"), clientAccountingResult: v(10000n, context.period.closingDate, "after_tax"), adjustments: [] });
    }
  }
}
export const demoResultHash = (value: unknown) => stableSha256(value);

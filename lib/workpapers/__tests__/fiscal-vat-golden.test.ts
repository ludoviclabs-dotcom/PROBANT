import { describe, expect, it } from "vitest";
import type { FecEntry } from "@/lib/canonical-model";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { buildVatGoldenInput, runVatGoldenCase, type VatGoldenCaseId } from "@/lib/tax/release/golden-cases";
import { previewImport, type ImportBatch } from "../imports";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { previewDeclaration, previewFec } from "../fiscal-sources";
import { evaluateVat, initialVatWork, stampVatWork } from "../fiscal-vat";

/**
 * Independent path check (Mission 13). The release gate feeds the VAT engine canonical objects built in memory;
 * here the same golden data is written as files (FEC text, CA3 template, invoice inventory), read by the existing
 * parsers, approved, frozen and evaluated by the sheet. Both paths must give the same amounts and control outcomes.
 */
const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const fecText = (entries: readonly FecEntry[]) => ["JournalCode;JournalLib;EcritureNum;EcritureDate;CompteNum;CompteLib;CompAuxNum;CompAuxLib;PieceRef;PieceDate;EcritureLib;Debit;Credit;EcritureLet;DateLet;ValidDate",
  ...entries.map(e => [e.journalCode, e.journalLib || "J", e.ecritureNum, e.ecritureDate, e.compteNum, e.compteLib || "C", e.compAuxNum, e.compAuxLib, e.pieceRef, e.pieceDate, e.ecritureLib || "L",
    euros(Math.round(e.debit * 100)), euros(Math.round(e.credit * 100)), e.ecritureLet, e.dateLet, e.validDate].join(";"))].join("\n") + "\n";
const CASES: VatGoldenCaseId[] = ["vat-ca3-exact", "vat-collected-difference", "vat-deductible-difference", "vat-missing-invoice", "vat-multiple-rates", "vat-credit-note", "vat-credit", "vat-reverse-charge", "vat-shifted-period"];

describe("TVA — cas golden de la gate de release rejoués par le chemin fichiers → parseurs → feuille", () => {
  for (const id of CASES) it(id, async () => {
    const input = buildVatGoldenInput(id), golden = runVatGoldenCase(id).snapshot;
    const accounting: AccountingPeriod = { startDate: input.profile.accountingPeriod.startDate, closingDate: input.profile.accountingPeriod.endDate, asOfDate: input.profile.accountingPeriod.endDate, currency: "EUR", validation: "provisional" };
    const scope: WorkpaperScope = { organizationId: "org-golden", dossierId: "88888888-8888-4888-8888-888888888888", periodId: periodId(accounting), mode: "real" };
    const actor: Principal = { id: "preparer-golden", grants: [{ scope, permissions: ["read", "prepare", "download"] }] };
    const approve = (b: ImportBatch): ImportBatch => { expect(b.report.blocking).toEqual([]); return { ...b, approval: { actorId: actor.id, at: input.createdAt, previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } }; };
    const p = input.period, ca3 = input.documentSnapshots[0];
    const declaration = ["documentType;formNumber;formVintage;periodStart;periodEnd;fiscalYear;fieldCode;rawValue;page;box",
      ...ca3.fields.map(f => ["declaration_tva_ca3", ca3.formNumber, p.formVintage, p.startDate, p.endDate, p.fiscalYear, f.fieldCode, euros(f.amountCents ?? 0), "1", f.fieldCode].join(";"))].join("\n") + "\n";
    const invoices = ["piece;tva;date", ...(input.availableInvoiceRefs ?? []).map(r => `${r};0,00;${p.endDate}`)].join("\n") + "\n";
    const file = (text: string, name: string) => new File([text], name, { type: "text/csv" });
    const imports = [
      approve(await previewFec(file(fecText(input.fecEntries), "fec.txt"), scope, accounting, actor)),
      approve(await previewDeclaration(file(declaration, "ca3.csv"), scope, accounting, { documentType: "declaration_tva_ca3" }, actor)),
      approve(await previewImport(file(invoices, "factures.csv"), scope, { version: "fiscal-1", headerRow: 1, columns: { key: "piece", amount: "tva", date: "date" }, delimiter: ";", decimal: ",", dateFormat: "ISO", sign: 1, currency: "EUR", fiscal: { basis: "invoices" } }, actor, "fx_invoices", "tva.reconciliation")),
    ];
    const work = initialVatWork({ period: { startDate: p.startDate, endDate: p.endDate }, frequency: p.frequency as "quarterly", formVintage: p.formVintage, actor, at: input.createdAt });
    const stamped = stampVatWork({ scope, runId: "golden", imports, actor, at: input.createdAt, previous: work,
      draft: { frequency: p.frequency as "quarterly", formVintage: p.formVintage, explanations: [], profile: { vatRegime: input.profile.vatRegime, vatGroupStatus: input.profile.vatGroupStatus, siren: null, evidence: null } } });
    const r = evaluateVat(scope, accounting, imports, "golden", stamped);
    const net = r.comparison.find(c => c.key === "net")!, collected = r.comparison.find(c => c.key === "collected")!, deductible = r.comparison.find(c => c.key === "deductible")!;
    expect({ collected: collected.accountedCents, deductible: deductible.accountedCents, net: net.accountedCents, declared: net.declaredCents, theoretical: collected.theoreticalCents })
      .toEqual({ collected: golden.collectedAccountedCents, deductible: golden.deductibleAccountedCents, net: golden.netAccountedCents, declared: golden.netDeclaredCents, theoretical: golden.collectedTheoreticalCents });
    expect(Object.fromEntries(r.controls.map(c => [c.controlId, c.outcome]))).toEqual(Object.fromEntries(golden.controls.map(c => [c.controlId, c.outcome])));
    expect({ outcome: r.engine.outcome, tier: r.engine.evidenceTier }).toEqual({ outcome: golden.outcome, tier: golden.evidenceTier });
  });
});

import { describe, expect, it } from "vitest";
import { assertCashBatch, buildCashFacts, CashSourceError } from "../cash-sources";
import { cashOutcome, CASH_STATUS_TEXT, evaluateCashReconciliation, stampCashWork, cashDraftFromWork, type CashDraft, type CashResult } from "../cash-reconciliation";
import { approve, CASH_CSV, cashMapping, cashPeriod, cashPreparer, cashScope, cashSources, nominalDraft, previewCash, rowOf } from "./cash-reconciliation-fixtures";
import type { ImportBatch } from "../imports";

const RUN = "workpaper-cash-synthetic";
function work(imports: ImportBatch[], draft: CashDraft = nominalDraft(imports), actor = cashPreparer, at = "2025-03-02T10:00:00Z", previous?: ReturnType<typeof stampCashWork>) {
  return stampCashWork({ scope: cashScope, period: cashPeriod, runId: RUN, imports, draft, actor, at, previous });
}
function evaluate(imports: ImportBatch[], draft?: CashDraft): CashResult { return evaluateCashReconciliation(cashScope, cashPeriod, imports, RUN, work(imports, draft)); }
const bank = (r: CashResult) => r.accounts.find(a => a.accountId === "512100")!;
const item = (r: CashResult, id: string) => bank(r).items.find(i => i.itemId === id)!;
const codes = (r: CashResult) => r.exceptions.map(e => e.code).sort();
function refusal(run: () => unknown) { try { run(); } catch (error) { return error; } throw new Error("Refus attendu"); }
const replace = (text: string, from: string, to: string) => { if (!text.includes(from)) throw new Error("Fixture introuvable : " + from); return text.replace(from, to); };

describe("CASH-901 population des comptes et sources qualifiées", () => {
  it("définit la population par compte (banque/compte/devise) et motive chaque exclusion : devise, caisse, VMP", async () => {
    const facts = buildCashFacts(cashScope, cashPeriod, await cashSources(), RUN);
    expect(facts.accounts.map(a => [a.accountId, a.inScope])).toEqual([["512100", true], ["512200", false], ["530000", false], ["503000", false]]);
    expect(facts.accounts.find(a => a.accountId === "512200")!.exclusionReason).toMatch(/Devise du compte non gérée \(USD\).*aucune conversion implicite/);
    expect(facts.accounts.find(a => a.accountId === "530000")!.exclusionReason).toMatch(/^Caisse/);
    expect(facts.accounts.find(a => a.accountId === "503000")!.exclusionReason).toMatch(/^VMP/);
    const a = facts.accounts[0];
    expect([a.statement!.value.amount.amount, a.erbBook!.value.amount.amount, a.erbBank!.value.amount.amount]).toEqual(["90.00", "100.00", "90.00"]);
    expect(a.items.map(i => [i.itemId, i.kind, i.value.amount.amount, i.pieceRef])).toEqual([["R1", "receipt_in_transit", "15.00", "BRD-1230"], ["P1", "outstanding_payment", "-5.00", "CHQ-1045"]]);
  });
  it("refuse explicitement une devise non gérée côté banque, avec la ligne et la colonne physiques", async () => {
    const batch = await previewCash("cash_statement", replace(CASH_CSV.cash_statement, "FR76-0001;EUR", "FR76-0001;USD"));
    const error = refusal(() => assertCashBatch(batch, cashPeriod)) as CashSourceError;
    expect(error).toBeInstanceOf(CashSourceError); expect(error.code).toBe("CASH_CURRENCY_UNSUPPORTED"); expect(error.locator).toMatchObject({ row: 2, column: "devise", value: "USD" });
  });
  it("refuse un signe incohérent : remise négative ou convention de signe inversée", async () => {
    const negative = await previewCash("cash_erb", replace(CASH_CSV.cash_erb, "R1;15.00", "R1;-15.00"));
    expect((refusal(() => assertCashBatch(negative, cashPeriod)) as CashSourceError)).toMatchObject({ code: "CASH_ITEM_SIGN_INCONSISTENT", locator: { row: 4, column: "montant" } });
    const inverted = await previewCash("cash_erb", CASH_CSV.cash_erb, cashMapping("cash_erb", { sign: -1 }));
    expect((refusal(() => assertCashBatch(inverted, cashPeriod)) as CashSourceError).code).toBe("CASH_ITEM_SIGN_INCONSISTENT");
  });
  it("refuse une ligne de mauvaise banque au lieu de l’ignorer", async () => {
    const imports = await cashSources({ cash_settlements: CASH_CSV.cash_settlements + "\nS9;20.00;2025-01-12;BNK-Z;FR76-0009;EUR;Virement autre banque;VIR-9" });
    const error = refusal(() => buildCashFacts(cashScope, cashPeriod, imports, RUN)) as CashSourceError;
    expect(error.code).toBe("CASH_ACCOUNT_UNKNOWN"); expect(error.locator).toMatchObject({ row: 4, value: "BNK-Z / FR76-0009" });
  });
  it("ne fusionne jamais deux comptes par libellé ; refuse une identité bancaire dupliquée", async () => {
    const twin = CASH_CSV.cash_ledger + "\n512300;0.00;2024-12-31;BNK-A;FR76-0003;EUR;banque;Banque A — compte courant";
    const facts = buildCashFacts(cashScope, cashPeriod, await cashSources({ cash_ledger: twin }), RUN);
    expect(facts.accounts.filter(a => a.label === "Banque A — compte courant").map(a => a.accountReference)).toEqual(["FR76-0001", "FR76-0003"]);
    const duplicate = CASH_CSV.cash_ledger + "\n512900;0.00;2024-12-31;BNK-A;FR76-0001;EUR;banque;Doublon";
    const ledgerOnly = [approve(await previewCash("cash_ledger", duplicate))];
    expect((refusal(() => buildCashFacts(cashScope, cashPeriod, ledgerOnly, RUN)) as CashSourceError).code).toBe("CASH_SOURCES_REQUIRED");
    const imports = await cashSources({ cash_ledger: duplicate });
    expect((refusal(() => buildCashFacts(cashScope, cashPeriod, imports, RUN)) as CashSourceError).code).toBe("CASH_ACCOUNT_IDENTITY_DUPLICATE");
  });
  it("lit l’identité de chaque source avec ses propres en-têtes", async () => {
    const statement = "ref;solde;date;etablissement;iban;monnaie\nREL-A-1231;90.00;2024-12-31;BNK-A;FR76-0001;EUR";
    const imports = await cashSources();
    const other = approve(await previewCash("cash_statement", statement, cashMapping("cash_statement", { cashOverrides: { bankColumn: "etablissement", accountColumn: "iban", currencyColumn: "monnaie" } })));
    const result = evaluate(imports.map(b => b.document.documentType === "cash_statement" ? other : b));
    expect(bank(result).bridge).toMatchObject({ status: "computed", difference: { amount: "0.00" } });
  });
  it("refuse les dates hors contrat : solde hors clôture, suspens après clôture, règlement avant clôture", async () => {
    const late = await previewCash("cash_statement", replace(CASH_CSV.cash_statement, "90.00;2024-12-31", "90.00;2025-01-02"));
    expect((refusal(() => assertCashBatch(late, cashPeriod)) as CashSourceError).code).toBe("CASH_CLOSING_BALANCE_DATE_REQUIRED");
    const suspense = await previewCash("cash_erb", replace(CASH_CSV.cash_erb, "R1;15.00;2024-12-30", "R1;15.00;2025-01-02"));
    expect((refusal(() => assertCashBatch(suspense, cashPeriod)) as CashSourceError).code).toBe("CASH_SUSPENSE_AFTER_CLOSING");
    const early = await previewCash("cash_settlements", replace(CASH_CSV.cash_settlements, "S1;15.00;2025-01-03", "S1;15.00;2024-12-31"));
    expect((refusal(() => assertCashBatch(early, cashPeriod)) as CashSourceError).code).toBe("CASH_SETTLEMENT_OUTSIDE_POST_CLOSING");
  });
});

describe("CASH-902 pont de rapprochement et écarts de source distincts", () => {
  it("recette nominale : banque 90 + remises 15 − paiements en circulation 5 = GL 100", async () => {
    const r = evaluate(await cashSources()), b = bank(r).bridge;
    expect(b).toMatchObject({ status: "computed", statement: { amount: { amount: "90.00" } }, receiptsInTransit: { amount: "15.00" }, outstandingPayments: { amount: "-5.00" }, otherItems: { amount: "0.00" },
      reconstructed: { amount: "100.00" }, ledger: { amount: { amount: "100.00" } }, difference: { amount: "0.00" }, bookSourceDifference: { amount: "0.00" }, bankSourceDifference: { amount: "0.00" }, erbArithmeticDifference: { amount: "0.00" } });
    expect(r.controls.find(c => c.id === "bridge")).toMatchObject({ outcome: "no_exception_detected", numerator: 1, denominator: 1 });
    expect(r.controls.find(c => c.id === "bridge")!.exclusions.map(e => e.id)).toEqual(["512200", "530000", "503000"]);
    expect(r.limitations.join(" ")).toMatch(/aucune assurance d’authenticité/);
  });
  it("conserve l’écart du pont et les écarts de source séparément, sans les additionner", async () => {
    const r = evaluate(await cashSources({ cash_ledger: replace(CASH_CSV.cash_ledger, "512100;100.00", "512100;101.00"), cash_erb: replace(replace(CASH_CSV.cash_erb, "ERB-BOOK;100.00", "ERB-BOOK;102.00"), "ERB-BANK;90.00", "ERB-BANK;91.00") }));
    const b = bank(r).bridge as Extract<CashResult["accounts"][number]["bridge"], { status: "computed" }>;
    expect([b.difference.amount, b.bookSourceDifference.amount, b.bankSourceDifference.amount, b.erbArithmeticDifference.amount]).toEqual(["1.00", "1.00", "1.00", "1.00"]);
    expect(codes(r)).toEqual(["BRIDGE_DIFFERENCE", "ERB_ARITHMETIC_DIFFERENCE", "ERB_BANK_SOURCE_DIFFERENCE", "ERB_BOOK_SOURCE_DIFFERENCE", "SUSPENSE_OPEN"]);
    expect(r.exceptions.filter(e => e.code.startsWith("ERB")).every(e => e.controlId === "sources")).toBe(true);
    expect(r.exceptions.find(e => e.code === "BRIDGE_DIFFERENCE")!.amount).toEqual({ kind: "known", value: { amount: "1.00", currency: "EUR" } });
  });
  it("un relevé absent rend le pont non concluant, jamais égal à zéro", async () => {
    const r = evaluate(await cashSources({ cash_statement: "ref;solde;date;banque;compte;devise\nREL-CAISSE;12.00;2024-12-31;CAISSE;SIEGE;EUR" }), undefined);
    expect(bank(r).bridge).toMatchObject({ status: "incomplete", statement: null, missing: ["Solde du relevé à la clôture absent"] });
    expect(r.exceptions.find(e => e.code === "BRIDGE_SOURCE_MISSING")!.amount.kind).toBe("unknown");
    expect(r.controls.find(c => c.id === "bridge")).toMatchObject({ outcome: "inconclusive", numerator: 0, denominator: 1 });
    expect(bank(r).items.every(i => i.status === "not_tested" && /Pont non calculable/.test(i.exclusionReason!))).toBe(true);
  });
});

describe("CASH-903 apurement postérieur des suspens", () => {
  it("état nominal : remise apurée, paiement de 5 encore ouvert ; clôture inchangée", async () => {
    const imports = await cashSources(), r = evaluate(imports), before = evaluate(imports, nominalDraft(imports, { allocations: [] }));
    expect(item(r, "R1")).toMatchObject({ status: "cleared", statusLabel: "Apuré", settledAmount: { amount: "15.00" }, remainingAmount: { amount: "0.00" }, ageDays: 1 });
    expect(item(r, "P1")).toMatchObject({ status: "open", statusLabel: "Ouvert", settledAmount: { amount: "0.00" }, remainingAmount: { amount: "5.00" }, ageDays: 3, explanation: "Chèque 1045 émis non débité" });
    expect(item(r, "R1").allocations[0]).toMatchObject({ settlementId: "S1", effective: true, authorId: cashPreparer.id });
    expect(r.exceptions.map(e => [e.code, e.targetId, e.amount])).toEqual([["SUSPENSE_OPEN", "P1", { kind: "known", value: { amount: "5.00", currency: "EUR" } }]]);
    expect(bank(r).bridge).toEqual(bank(before).bridge);
    expect(r.controls.find(c => c.id === "clearance")).toMatchObject({ outcome: "exceptions_detected", numerator: 2, denominator: 2 });
    expect(bank(r).settlements.find(s => s.settlementId === "S1")).toMatchObject({ allocated: { amount: "15.00" }, unallocated: { amount: "0.00" } });
    expect(cashOutcome(r)).toBe("exceptions_detected");
  });
  it("apurement partiel : 10 sur 15 retrouvés, 5 restent à expliquer", async () => {
    const imports = await cashSources({ cash_settlements: replace(CASH_CSV.cash_settlements, "S1;15.00", "S1;10.00") });
    const r = evaluate(imports, nominalDraft(imports, { allocations: [{ id: "A-R1-S1", itemId: "R1", settlementId: "S1", amount: { amount: "10.00", currency: "EUR" } }] }));
    expect(item(r, "R1")).toMatchObject({ status: "partially_cleared", statusLabel: "Partiellement apuré", settledAmount: { amount: "10.00" }, remainingAmount: { amount: "5.00" } });
    expect(r.exceptions.find(e => e.targetId === "R1")).toMatchObject({ code: "SUSPENSE_PARTIALLY_CLEARED", amount: { kind: "known", value: { amount: "5.00" } } });
    expect(bank(r).bridge).toMatchObject({ receiptsInTransit: { amount: "15.00" }, reconstructed: { amount: "100.00" } });
  });
  it("fenêtre incomplète : suspens non testés, aucune allocation validable", async () => {
    const imports = await cashSources();
    const incomplete = { startDate: "2025-01-01", endDate: "2025-02-28", coverage: "incomplete" as const, note: "Relevés de février non obtenus", evidenceImportIds: [] };
    const r = evaluate(imports, nominalDraft(imports, { window: incomplete, allocations: [] }));
    expect(bank(r).items.map(i => [i.status, i.statusLabel])).toEqual([["not_tested", "Non testé"], ["not_tested", "Non testé"]]);
    expect(codes(r)).toEqual(["WINDOW_INCOMPLETE"]);
    expect(r.controls.find(c => c.id === "clearance")).toMatchObject({ outcome: "inconclusive", numerator: 0, denominator: 2 });
    expect(() => work(imports, nominalDraft(imports, { window: incomplete }))).toThrow("SETTLEMENT_OUTSIDE_DOCUMENTED_WINDOW");
    const short = evaluate(imports, nominalDraft(imports, { window: { ...nominalDraft(imports).window, endDate: "2025-01-31" } }));
    expect(codes(short)).toEqual(["SUSPENSE_OPEN", "WINDOW_INCOMPLETE"]); expect(item(short, "R1").status).toBe("cleared");
  });
  it("double allocation refusée : un règlement ne peut pas apurer deux suspens au-delà de son montant", async () => {
    const imports = await cashSources({ cash_erb: CASH_CSV.cash_erb + "\nR2;15.00;2024-12-30;BNK-A;FR76-0001;EUR;remise_non_creditee;Seconde remise;BRD-1231" });
    const twice = nominalDraft(imports, { allocations: [{ id: "A1", itemId: "R1", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }, { id: "A2", itemId: "R2", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }] });
    expect(() => work(imports, twice)).toThrow("CASH_OVERALLOCATION");
    const samePair = nominalDraft(imports, { allocations: [{ id: "A1", itemId: "R1", settlementId: "S1", amount: { amount: "5.00", currency: "EUR" } }, { id: "A2", itemId: "R1", settlementId: "S1", amount: { amount: "5.00", currency: "EUR" } }] });
    expect(() => work(imports, samePair)).toThrow("CASH_ALLOCATION_DUPLICATE");
  });
  it("refuse une allocation entre comptes différents ou de signe opposé", async () => {
    const ledger = CASH_CSV.cash_ledger + "\n512300;20.00;2024-12-31;BNK-C;FR76-0003;EUR;banque;Banque C";
    const imports = await cashSources({ cash_ledger: ledger, cash_settlements: CASH_CSV.cash_settlements + "\nS9;15.00;2025-01-04;BNK-C;FR76-0003;EUR;Remise banque C;BRD-C" });
    expect(() => work(imports, nominalDraft(imports, { allocations: [{ id: "A9", itemId: "R1", settlementId: "S9", amount: { amount: "15.00", currency: "EUR" } }] }))).toThrow("CASH_ALLOCATION_ACCOUNT_MISMATCH");
    expect(() => work(imports, nominalDraft(imports, { allocations: [{ id: "A2", itemId: "R1", settlementId: "S2", amount: { amount: "15.00", currency: "EUR" } }] }))).toThrow("CASH_ALLOCATION_SIGN_MISMATCH");
  });
  it("corrigé : une pièce de correction documentée traite le paiement sans réécrire la clôture", async () => {
    const imports = await cashSources();
    const r = evaluate(imports, nominalDraft(imports, { corrections: [{ id: "C-P1", itemId: "P1", proof: rowOf(imports, "cash_support", "COR-1045"), reason: "Chèque annulé et contrepassé en janvier" }] }));
    expect(item(r, "P1")).toMatchObject({ status: "corrected", statusLabel: "Corrigé", correction: { reason: "Chèque annulé et contrepassé en janvier" }, settledAmount: { amount: "0.00" } });
    expect(r.exceptions).toEqual([]); expect(cashOutcome(r)).toBe("no_exception_detected");
    expect(bank(r).bridge).toMatchObject({ outstandingPayments: { amount: "-5.00" }, ledger: { amount: { amount: "100.00" } } });
  });
  it("non testé avec motif et non expliqué restent visibles", async () => {
    const imports = await cashSources();
    const excluded = evaluate(imports, nominalDraft(imports, { exclusions: [{ itemId: "P1", reason: "Chèque bloqué par opposition : relevé de mars à obtenir" }] }));
    expect(item(excluded, "P1")).toMatchObject({ status: "not_tested", exclusionReason: "Chèque bloqué par opposition : relevé de mars à obtenir" });
    expect(excluded.controls.find(c => c.id === "clearance")).toMatchObject({ outcome: "inconclusive", numerator: 1, denominator: 2, exclusions: [{ id: "P1" }] });
    const silent = await cashSources({ cash_erb: replace(CASH_CSV.cash_erb, "paiement_non_debite;Chèque 1045 émis non débité;", "paiement_non_debite;;") });
    const r = evaluate(silent);
    expect(item(r, "P1")).toMatchObject({ status: "unexplained", statusLabel: "Non expliqué", explained: false });
    expect(r.exceptions.find(e => e.targetId === "P1")!.code).toBe("SUSPENSE_UNEXPLAINED");
  });
  it("chaque statut porte un sens textuel ; l’auteur vient du serveur et reste stable sur un enregistrement inchangé", async () => {
    expect(Object.values(CASH_STATUS_TEXT).every(t => t.label && t.meaning.length > 40)).toBe(true);
    const imports = await cashSources(), first = work(imports);
    expect(first.allocations[0]).toMatchObject({ authorId: cashPreparer.id, authoredAt: "2025-03-02T10:00:00Z" });
    expect(first.convention).toMatchObject({ validatedBy: cashPreparer.id, label: "positive_increases_book_balance" });
    const other = { ...cashPreparer, id: "preparer-2" };
    const again = work(imports, { ...cashDraftFromWork(first), exclusions: [{ itemId: "P1", reason: "Motif" }] }, other, "2025-03-03T10:00:00Z", first);
    expect(again.allocations[0].authorId).toBe(cashPreparer.id); expect(again.exclusions[0].authorId).toBe("preparer-2");
    expect(JSON.stringify(cashDraftFromWork(first))).not.toContain("authorId");
  });
  it("résultat déterministe et indépendant de l’ordre des imports", async () => {
    const imports = await cashSources(), w = work(imports);
    expect(evaluateCashReconciliation(cashScope, cashPeriod, [...imports].reverse(), RUN, w)).toEqual(evaluateCashReconciliation(cashScope, cashPeriod, imports, RUN, w));
  });
});

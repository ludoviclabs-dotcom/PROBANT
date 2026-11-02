import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CalculationRun } from "@/lib/canonical-model/calculation";
import { leaseSchedule } from "@/lib/ifrs/leases/engine";
import { qualifyLeases } from "@/lib/ifrs/leases/qualification";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { ImportBatch } from "../imports";
import { leaseCalculationInput, LeaseRegistry } from "../lease-adapter";
import { leaseReviewPoints, leaseRunEvidence, scheduleRows, type LeaseResult } from "../lease-review";
import { leaseFacts, type LeaseType } from "../lease-sources";
import { stampLeaseWork } from "../lease-work";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { freezePopulation, selectPopulation } from "../selection";
import { approvedLeaseBatches, ASSUMPTION_FIELDS, CONTRACT_FIELDS, dueRows, LEASE_PERIOD, ledgerRow, type LeaseRow } from "./lease-fixture";

/**
 * L16-06 — cas de la matrice de recette qui n'avaient pas de test propre, exécutés par le registre de calcul de la feuille (le chemin du
 * serveur, sans l'écran) : taux, durées et dates, composantes exclues, TVA, reprise historique cadrée, empreintes par contrat, et garde
 * contre une mutation laissée dans le code livré. Attendus écrits avant exécution, ou repris de l'oracle C00 (F03 au 31/12/2028).
 */
const scope: WorkpaperScope = { organizationId: "org-l16-06-recette", dossierId: "dossier-l16-06-recette", periodId: periodId(LEASE_PERIOD), mode: "demo" };
const actor: Principal = { id: "preparer-l16-06", grants: [{ scope, permissions: ["read", "prepare"] }] };
const SHORT = "Matériel de courte durée";
const work = stampLeaseWork({ framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }, firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16" },
  policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }, { kind: "short_term_exemption", assetCategory: SHORT, answer: { kind: "value", value: "not_elected" } }],
  confirmations: [] }, () => { throw new Error("unused"); }, actor.id, "2027-02-01T10:00:00.000Z");
type Rows = Record<LeaseType, LeaseRow[]>;
const src = (title: string) => ({ title, pack: "Pack synthétique L16-06", date: "2026-01-02", page: 1, clause: "Article 3 — loyers" });
/** One more contract of `months` × `payment` from 01/01/2026, its assumptions, its dues and, unless told otherwise, its 2026 rent framed by one annual line. */
function add(rows: Rows, id: string, months: number, payment: string, edit: (contract: Record<string, string>, assumptions: Record<string, string>) => void = () => {}, framed = true, category = "Locaux") {
  const contract = CONTRACT_FIELDS(months, payment, category) as Record<string, string>, assumptions = ASSUMPTION_FIELDS("0.04") as Record<string, string>;
  edit(contract, assumptions);
  const cents = BigInt(payment.replace(".", "")), total = cents * BigInt(months), inYear = cents * BigInt(Math.min(12, months));
  const eur = (v: bigint) => (v / 100n) + "." + String(v % 100n).padStart(2, "0");
  rows.lease_contracts.push({ key: id, amount: eur(total), date: "2026-01-01", details: { contractId: id, source: src("Contrat " + id), fields: contract } });
  rows.lease_assumptions.push({ key: id, amount: "0.00", date: "2026-01-01", details: { contractId: id, source: src("Note " + id), fields: assumptions } });
  rows.lease_schedule.push(...dueRows(id, months, payment));
  if (framed) rows.lease_ledger.push(ledgerRow("GL-613-" + id + "-2026", id, eur(inYear), "613500", "2026-01-01", "2026-12-31", "OD-2026-" + id));
}
async function execute(edit: (rows: Rows) => void) {
  const batches: ImportBatch[] = await approvedLeaseBatches(scope, actor, edit);
  const population = freezePopulation(scope, batches, "lease_contract", actor, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  const run = new LeaseRegistry().execute({ scope, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: "1.0.0" }, imports: batches, population, selection, parameters: { runId: "recette-r1", rootId: "recette", revision: 1, work } });
  expect(run.execution, run.blockedControls.join(",")).toBe("completed");
  const result = run.result as LeaseResult, of = (id: string) => result.contracts.find(c => c.contractId === id)!;
  // The detail of the dues is read again from the frozen sources, as the server's read does (the result only counts them).
  const q = qualifyLeases(leaseFacts(batches), LEASE_PERIOD, work, { id: "ifrs16.leases", version: "1.0.0", basisStatus: "review_required" });
  return { run, batches, result, of, dues: (id: string) => q.contracts.find(c => c.contractId === id)!.dues, codes: (id: string) => of(id).reasons.map(r => r.code),
    inBundle: (id: string) => !!result.bundle?.lines.some(l => l.contractId === id) };
}

describe("L16-06 matrice de recette — cas complétés, par l'exécution serveur", () => {
  it("taux : zéro documenté calculé sans intérêt ; base mensuelle ou nominale, taux absent → à qualifier (X19) ; taux négatif → hors V1 ; aucun n'entre dans le retraitement", async () => {
    const r = await execute(rows => {
      add(rows, "TZ", 24, "400.00", (_c, a) => { a.annualEffectiveRate = "0"; });
      add(rows, "TM", 24, "400.00", (_c, a) => { a.rateBasis = "monthly"; });
      add(rows, "TN", 24, "400.00", (_c, a) => { a.rateBasis = "nominal"; });
      add(rows, "TA", 24, "400.00", (_c, a) => { delete a.annualEffectiveRate; });
      add(rows, "TG", 24, "400.00", (_c, a) => { a.annualEffectiveRate = "-0.01"; });
    });
    expect(r.of("TZ")).toMatchObject({ status: "eligible_v1", result: "computed", closing: { interest: { amount: "0.00" }, additions: { amount: "9600.00" }, debtClosing: { amount: "4800.00" }, depreciation: { amount: "4800.00" } }, adjustment: { status: "included" } });
    for (const id of ["TM", "TN", "TA"]) { expect(r.of(id), id).toMatchObject({ status: "a_qualifier", result: "not_applicable" }); expect(r.codes(id), id).toContain("X19"); expect(r.inBundle(id), id).toBe(false); }
    expect(r.of("TG")).toMatchObject({ status: "hors_scope_v1", result: "not_applicable" }); expect(r.codes("TG")).toContain("X19");
    expect(r.inBundle("TZ")).toBe(true);
  });

  it("durées et dates : 1, 12 et 120 mois avec leurs flux de l'exercice, sans mois doublé ; commencement le 15 → hors convention (X17) ; échéance en double → à qualifier (Q10) ; 12 mois sans politique → Q08", async () => {
    const r = await execute(rows => {
      add(rows, "U1", 1, "900.00", () => {}, true, SHORT);
      add(rows, "U12", 12, "500.00", () => {}, true, SHORT);
      add(rows, "U12P", 12, "500.00", () => {}, true, "Catégorie sans politique");
      add(rows, "U120", 120, "250.00");
      add(rows, "C15", 24, "400.00");
      rows.lease_contracts.find(c => c.key === "C15")!.date = "2026-01-15";
      add(rows, "DD", 24, "400.00");
      rows.lease_schedule.push({ ...rows.lease_schedule.find(d => d.key === "DD-2026-03-31")!, key: "DD-2026-03-31-bis" });
    });
    expect(r.of("U1").closing).toMatchObject({ paymentsInPeriod: 1, payments: { amount: "900.00" }, debtClosing: { amount: "0.00" }, rouNetClosing: { amount: "0.00" } });
    expect(r.of("U12").closing).toMatchObject({ paymentsInPeriod: 12, payments: { amount: "6000.00" }, debtClosing: { amount: "0.00" } });
    expect(r.of("U120")).toMatchObject({ result: "computed", depreciationMonths: 120, closing: { paymentsInPeriod: 12, payments: { amount: "3000.00" } } });
    expect(r.of("U120").schedule!.t).toHaveLength(120);
    expect(new Set(r.of("U120").schedule!.dueDate).size).toBe(120);
    expect(r.of("U12P")).toMatchObject({ status: "a_qualifier", result: "not_applicable" }); expect(r.codes("U12P")).toContain("Q08");
    expect(r.of("C15")).toMatchObject({ status: "hors_scope_v1", result: "not_applicable" }); expect(r.codes("C15")).toContain("X17");
    expect(r.of("DD")).toMatchObject({ status: "a_qualifier", result: "not_applicable" }); expect(r.codes("DD")).toContain("Q10");
    for (const id of ["U12P", "C15", "DD"]) expect(r.inBundle(id), id).toBe(false);
  });

  it("composantes : service non séparé, coût direct initial, dépôt non qualifié, avantage incitatif, indexation, remise en état, option d'achat — refusés par le serveur, chacun avec son motif et un point de revue sans montant", async () => {
    const cases: [string, string, "a_qualifier" | "hors_scope_v1", (c: Record<string, string>, a: Record<string, string>) => void][] = [
      ["K07", "X07", "a_qualifier", c => { c.serviceComponents = "present"; }],
      ["K05", "X05", "hors_scope_v1", (_c, a) => { a.initialDirectCosts = "1500.00"; }],
      ["K08", "X08", "a_qualifier", (_c, a) => { a.deposit = "unqualified"; }],
      ["K04", "X04", "hors_scope_v1", (_c, a) => { a.leaseIncentives = "200.00"; }],
      ["K01", "X01", "hors_scope_v1", (_c, a) => { a.variablePayments = "index"; }],
      ["K06", "X06", "hors_scope_v1", (_c, a) => { a.restorationCosts = "300.00"; }],
      ["K10", "X10", "hors_scope_v1", (_c, a) => { a.purchaseOption = "present"; }],
    ];
    const r = await execute(rows => { for (const [id, , , edit] of cases) add(rows, id, 24, "400.00", edit); });
    const points = leaseReviewPoints(r.result);
    for (const [id, code, status] of cases) {
      expect(r.of(id), id).toMatchObject({ status, result: "not_applicable", adjustment: { status: "not_applicable" } });
      expect(r.codes(id), id).toContain(code);
      expect(r.inBundle(id), id).toBe(false);
      expect(points.find(p => p.key === id), id).toMatchObject({ blocking: status === "a_qualifier", amount: { kind: "unknown" } });
    }
    expect(r.result.portfolio.byResult.not_applicable).toBe(cases.length);
    expect(r.result.portfolio.computedSubtotal!.contracts).toBe(2);
  });

  it("TVA : récupération incertaine → hors calcul (X21), sans décision fiscale ; règlement TTC qualifié : loyer, TVA et total distincts, contrat calculé et cadré hors TVA", async () => {
    const r = await execute(rows => {
      add(rows, "VU", 24, "400.00", c => { c.vatTreatment = "uncertain"; });
      add(rows, "VT", 24, "400.00");
      rows.lease_schedule = rows.lease_schedule.map(d => d.details.contractId !== "VT" || (d.details.fields as Record<string, string>).paidAmount === "non_applicable" ? d
        : { ...d, details: { ...d.details, fields: { ...(d.details.fields as Record<string, string>), paidAmount: "480.00", paidVat: "80.00" } } });
    });
    expect(r.of("VU")).toMatchObject({ status: "hors_scope_v1", result: "not_applicable" }); expect(r.codes("VU")).toContain("X21");
    expect(r.of("VT")).toMatchObject({ status: "eligible_v1", result: "computed", framing: { status: "framed" }, adjustment: { status: "included" } });
    expect(r.dues("VT").filter(d => d.role === "exigible").every(d => d.settlement === "regle" && d.amount.amount === "400.00" && d.paidAmount?.amount === "480.00" && d.paidVat?.amount === "80.00")).toBe(true);
    expect(r.result.bundle!.taxStatus).toBe("not_computed");
  });

  it("reprise historique cadrée (oracle F03 au 31/12/2028) : calcul depuis l'origine, effet d'ouverture de −538,91 distinct de l'effet de l'exercice, seule la dotation de l'exercice en charge ; sans ouverture → diagnostic exclu", async () => {
    const r = await execute(rows => {
      for (const id of ["H1", "H2"]) {
        add(rows, id, 36, "1000.00", (c, a) => { c.endDate = "2027-12-31"; c.signatureDate = "2024-12-15"; a.annualEffectiveRate = "0.05"; }, true, "Véhicules utilitaires");
        rows.lease_contracts.find(c => c.key === id)!.date = "2025-01-01";
        rows.lease_schedule = [...rows.lease_schedule.filter(d => d.details.contractId !== id), ...dueRows(id, 36, "1000.00", LEASE_PERIOD.asOfDate, 2025 * 12)];
        rows.lease_ledger.find(l => l.key === "GL-613-" + id + "-2026")!.amount = "12000.00";
      }
      rows.lease_opening.push({ key: "H1", amount: "0.00", date: "2025-12-31", details: { contractId: "H1", source: src("Reporting IFRS 2025 H1"),
        fields: { openingDate: "2025-12-31", debt: "22819.76", rouGross: "33421.27", rouAccumulated: "11140.42", rouNet: "22280.85", reportingRef: "Reporting IFRS 2025 validé (synthétique)", reviewEvidence: "Revue de l'ouverture (synthétique)" } } });
    });
    expect(r.of("H1")).toMatchObject({ status: "eligible_v1", result: "computed", closing: { debtOpening: { amount: "22819.76" }, interest: { amount: "868.41" }, depreciation: { amount: "11140.43" },
      debtClosing: { amount: "11688.17" }, rouNetClosing: { amount: "11140.42" }, openingEquityEffect: { amount: "-538.91" }, payments: { amount: "12000.00" } }, adjustment: { status: "included" } });
    const lines = r.result.bundle!.lines.filter(l => l.contractId === "H1"), amount = (account: string) => lines.filter(l => l.account === account).map(l => l.side + " " + l.amount.amount);
    expect(amount("opening_equity_effect")).toEqual(["debit 538.91"]);
    expect([amount("lease_interest_expense"), amount("rou_depreciation_expense"), amount("pcg_rent_neutralized")]).toEqual([["debit 868.41"], ["debit 11140.43"], ["credit 12000.00"]]);
    // Only the period's P&L is in the result contributions (oracle: −8,84): the opening effect stays in equity, never in the year's charge.
    expect(r.result.bundle!.resultContributions.filter(k => k.contractId === "H1").reduce((t, k) => t + BigInt(k.amount.amount.replace(".", "")), 0n)).toBe(-884n);
    expect(r.of("H2")).toMatchObject({ status: "eligible_v1", result: "diagnostic", adjustment: { status: "excluded" } });
    expect(r.inBundle("H2")).toBe(false);
  });

  it("versions : un taux modifié ne change que l'empreinte de son contrat ; une politique changée touche tous les contrats", async () => {
    const scopeReal: WorkpaperScope = { ...scope, mode: "real" }, rule = { id: "ifrs16.leases", version: "1.0.0", basisStatus: "review_required" as const };
    const qualify = async (edit?: (rows: Rows) => void, w = work) => qualifyLeases(leaseFacts(await approvedLeaseBatches(scopeReal, { id: actor.id, grants: [{ scope: scopeReal, permissions: ["read", "prepare"] }] }, edit)), LEASE_PERIOD, w, rule);
    const fingerprints = (q: Awaited<ReturnType<typeof qualify>>) => Object.fromEntries(q.contracts.map(c => [c.contractId, c.fingerprint]));
    const base = fingerprints(await qualify());
    const rate = fingerprints(await qualify(rows => { (rows.lease_assumptions.find(a => a.key === "F03")!.details.fields as Record<string, string>).annualEffectiveRate = "0.051"; }));
    expect(rate.F01).toBe(base.F01); expect(rate.F03).not.toBe(base.F03);
    const policy = fingerprints(await qualify(undefined, { ...work, policies: work.policies.slice(1) }));
    expect(policy.F01).not.toBe(base.F01); expect(policy.F03).not.toBe(base.F03);
  });
});

describe("Capacité (CAPACITE_LOCATIONS.md, O1 + O2) : feuille compacte, preuves intactes", () => {
  const portfolio = (rows: Rows) => { for (const [id, months] of [["C1", 36], ["C2", 120], ["C3", 24]] as const) add(rows, id, months, "500.00"); };
  it("O1 : la feuille ne recopie pas les lignes sources ; leurs nombre et empreinte redonnent l'empreinte des entrées ; une source altérée est refusée", async () => {
    const r = await execute(portfolio), calc = r.run as CalculationRun, input = calc.input as { imports: Record<string, unknown>[] };
    expect(input.imports.every(b => !("rows" in b) && typeof b.rowCount === "number" && /^[a-f0-9]{64}$/.test(String(b.rowsHash)))).toBe(true);
    expect(JSON.stringify(calc.input)).not.toContain("Details");
    expect(stableSha256(leaseCalculationInput(calc, r.batches))).toBe(calc.inputHash);
    const altered = r.batches.map(b => b.document.documentType !== "lease_schedule" ? b : { ...b, rows: b.rows.slice(1) });
    expect(() => leaseCalculationInput(calc, altered)).toThrow("L16_INPUT_SOURCE_MISMATCH");
  });

  it("O2 : échéancier en colonnes identique aux lignes du moteur ; échéances comptées comme la qualification ; preuves ligne à ligne complètes, regroupées par pièce", async () => {
    const r = await execute(portfolio), q = qualifyLeases(leaseFacts(r.batches), LEASE_PERIOD, work, { id: "ifrs16.leases", version: "1.0.0", basisStatus: "review_required" });
    expect(r.result.schemaVersion).toBe("ifrs16-result-2");
    for (const c of r.result.contracts.filter(x => x.result === "computed")) {
      const inputs = q.contracts.find(x => x.contractId === c.contractId)!.inputs!;
      expect(scheduleRows(c.schedule!), c.contractId).toEqual(leaseSchedule(inputs).rows);
    }
    for (const c of r.result.contracts) expect(c.dues, c.contractId).toEqual({ count: r.dues(c.contractId).length, payable: r.dues(c.contractId).filter(d => d.role === "exigible").length });
    // Every proof of the selected contracts and every matched ledger line, once, sorted; the adjustment cites only rows that are there.
    const cited = r.result.evidence.documents.flatMap(d => d.rows.map(x => x.rowId));
    const expected = new Set([...q.contracts.flatMap(c => c.evidence.map(p => p.rowId)), ...r.result.contracts.filter(c => c.adjustment.status === "included").flatMap(c => c.framing.lines.filter(l => l.status === "matched").map(l => l.proof.rowId))]);
    expect(new Set(cited)).toEqual(expected);
    expect(cited.length).toBe(expected.size);
    expect(r.result.bundle!.lines.flatMap(l => l.evidence).every(id => cited.includes(id.slice((r.result.runId + ":lease:").length)))).toBe(true);
  });

  it("O2 : sur la feuille, une preuve vérifiée par pièce citée, avec son nombre de lignes ; aucune copie ligne à ligne", async () => {
    const r = await execute(portfolio), links = leaseRunEvidence(r.result);
    expect(links.map(l => l.documentVersionId)).toEqual(r.result.evidence.documents.map(d => d.documentVersionId));
    expect(links.every(l => l.precision === "document" && l.status === "verified" && l.procedureId === r.result.runId && !l.rowId)).toBe(true);
    expect(links.map(l => Number(/: (\d+) ligne/.exec(l.purpose)![1]))).toEqual(r.result.evidence.documents.map(d => d.rows.length));
  });
});

describe("L16-06 garde des mutations", () => {
  it("aucun marqueur de mutation (scripts/ifrs/mutations-l16.mjs) dans le code livré", () => {
    // Built from two parts so that this guard does not find itself.
    const root = resolve(__dirname, "../../.."), marker = "MUTATION " + "L16-06 */", found: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p); } else if (/\.(ts|tsx|mjs)$/.test(p) && readFileSync(p, "utf8").includes(marker)) found.push(p); } };
    for (const dir of ["lib", "components", "app"]) walk(join(root, dir));
    expect(found).toEqual([]);
  });
});

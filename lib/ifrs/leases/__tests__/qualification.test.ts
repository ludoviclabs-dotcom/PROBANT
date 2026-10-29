import { describe, expect, it } from "vitest";
import { leaseFacts } from "@/lib/workpapers/lease-sources";
import { periodId, type WorkpaperScope } from "@/lib/workpapers/model";
import type { Principal } from "@/lib/workpapers/policy";
import { approvedLeaseBatches, dueRows, LEASE_PERIOD, type LeaseRow } from "@/lib/workpapers/__tests__/lease-fixture";
import type { LeaseType } from "@/lib/workpapers/lease-sources";
import { qualifyLeases, type QualificationWork } from "../qualification";

/** L16-01 — qualification du portefeuille : chaque cas du prompt, son statut, sa cause ; aucun contrat incomplet calculable par défaut. */
const scope: WorkpaperScope = { organizationId: "org-q", dossierId: "dossier-q", periodId: periodId(LEASE_PERIOD), mode: "real" };
const actor: Principal = { id: "preparer-q", grants: [{ scope, permissions: ["read", "prepare"] }] };
const rule = { id: "ifrs16.leases", version: "1.0.0", basisStatus: "review_required" as const };
const NO_WORK: QualificationWork = { policies: [], confirmations: [] };
type Rows = Record<LeaseType, LeaseRow[]>;
const fields = (rows: Rows, type: "lease_contracts" | "lease_assumptions", id: string) => rows[type].find(r => r.key === id)!.details.fields as Record<string, string>;
async function qualify(edit?: (rows: Rows) => void, work: QualificationWork = NO_WORK, period = LEASE_PERIOD) {
  return qualifyLeases(leaseFacts(await approvedLeaseBatches(scope, actor, edit)), period, work, rule);
}
const one = async (id: string, edit?: (rows: Rows) => void, work?: QualificationWork) => (await qualify(edit, work)).contracts.find(c => c.contractId === id)!;
const codes = (c: { reasons: { code: string }[] }) => c.reasons.map(r => r.code);

describe("L16-01 qualification — cas du prompt", () => {
  it("contrat complet : éligible V1, entrées du calcul toutes sourcées, échéances exigibles réglées et futures non exigibles", async () => {
    const c = await one("F03");
    expect(c).toMatchObject({ status: "eligible_v1", historical: false, notCommenced: false, inputs: { commencement: "2026-01-01", months: 36, payment: { amount: "1000.00" }, annualRate: "0.05", usefulLifeMonths: 36, opening: null } });
    expect(c.reasons).toEqual([]);
    expect(c.dues.filter(d => d.role === "exigible").map(d => d.settlement)).toEqual(Array(13).fill("regle"));
    expect(c.dues.filter(d => d.role === "non_encore_exigible")).toHaveLength(23);
    expect(c.dues.filter(d => d.role === "non_encore_exigible").every(d => d.settlement === "non_applicable")).toBe(true);
    expect(c.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it("champ vide ≠ zéro : un coût initial vide rend le contrat à qualifier ; « 0.00 » est une valeur ; « inconnu » garde son motif", async () => {
    expect(await one("F03", r => { delete fields(r, "lease_assumptions", "F03").initialDirectCosts; })).toMatchObject({ status: "a_qualifier", reasons: [expect.objectContaining({ code: "X25", field: "initialDirectCosts" })], inputs: null });
    expect((await one("F03")).status).toBe("eligible_v1");
    const unknown = await one("F03", r => { fields(r, "lease_assumptions", "F03").initialDirectCosts = "inconnu"; });
    expect(unknown).toMatchObject({ status: "a_qualifier", reasons: [expect.objectContaining({ message: expect.stringContaining("inconnu") })] });
    expect(await one("F03", r => { fields(r, "lease_assumptions", "F03").initialDirectCosts = "non_applicable"; })).toMatchObject({ status: "a_qualifier", reasons: [expect.objectContaining({ code: "Q07" })] });
  });
  it("durée absente → à qualifier (X20) ; durée de 121 mois → hors V1 (X18)", async () => {
    expect(codes(await one("F03", r => { delete fields(r, "lease_contracts", "F03").termMonths; }))).toContain("X20");
    const long = await one("F03", r => { fields(r, "lease_contracts", "F03").termMonths = "121"; });
    expect(long.status).toBe("hors_scope_v1"); expect(codes(long)).toContain("X18");
  });
  it("taux nominal non converti → à qualifier, jamais converti en silence ; taux négatif → hors V1", async () => {
    const nominal = await one("F03", r => { fields(r, "lease_assumptions", "F03").rateBasis = "nominal"; });
    expect(nominal).toMatchObject({ status: "a_qualifier", inputs: null }); expect(codes(nominal)).toEqual(["X19"]);
    expect(await one("F03", r => { fields(r, "lease_assumptions", "F03").annualEffectiveRate = "-0.01"; })).toMatchObject({ status: "hors_scope_v1", reasons: [expect.objectContaining({ code: "X19" })] });
    expect((await one("F03", r => { delete fields(r, "lease_assumptions", "F03").annualEffectiveRate; })).status).toBe("a_qualifier");
  });
  it("exemption court terme : politique de la catégorie, 12 mois au plus, sans option d'achat ; refusée avec une option d'achat (X22) ; politique absente → à qualifier", async () => {
    const shortTerm: QualificationWork = { policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "elected" } }], confirmations: [] };
    expect((await one("F01", undefined, shortTerm)).status).toBe("exemption_documentee");
    const option = await one("F01", r => { fields(r, "lease_assumptions", "F01").purchaseOption = "present"; }, shortTerm);
    expect(option.status).toBe("a_qualifier"); expect(codes(option)).toEqual(["X22"]);
    expect(codes(await one("F01"))).toEqual(["Q08"]);
    const notElected: QualificationWork = { policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }], confirmations: [] };
    expect((await one("F01", undefined, notElected)).status).toBe("eligible_v1");
  });
  it("faible valeur : jamais sur un montant ; sans valeur à neuf ni jugement B3-B8 → à qualifier (X23) ; justifiée → exemption documentée", async () => {
    expect(await one("F03", r => { fields(r, "lease_assumptions", "F03").lowValueExemption = "elected"; })).toMatchObject({ status: "a_qualifier", reasons: [expect.objectContaining({ code: "X23" })] });
    expect((await one("F03", r => { Object.assign(fields(r, "lease_assumptions", "F03"), { lowValueExemption: "elected", lowValueNewValue: "900.00", lowValueJudgement: "Ordinateur portable, utilisable seul (B5)" }); })).status).toBe("exemption_documentee");
  });
  it("service non séparé sans élection § 15 → à qualifier (X07) ; élection § 15 sans politique de la catégorie → à qualifier", async () => {
    expect(codes(await one("F03", r => { fields(r, "lease_contracts", "F03").serviceComponents = "present"; }))).toEqual(["X07"]);
    expect(codes(await one("F03", r => { fields(r, "lease_contracts", "F03").serviceComponents = "election_15"; }))).toEqual(["X07"]);
    const elected: QualificationWork = { policies: [{ kind: "non_lease_components_election", assetCategory: "Véhicules utilitaires", answer: { kind: "value", value: "elected" } }], confirmations: [] };
    expect((await one("F03", r => { fields(r, "lease_contracts", "F03").serviceComponents = "election_15"; }, elected)).status).toBe("eligible_v1");
  });
  it("indexation (X01), loyers non constants (X01), paiement anticipé (X03), loyers à échoir (X03) → hors V1", async () => {
    expect(codes(await one("F03", r => { fields(r, "lease_assumptions", "F03").variablePayments = "index"; }))).toEqual(["X01"]);
    expect(codes(await one("F03", r => { r.lease_schedule.find(d => d.key === "F03-2026-06-30")!.amount = "1010.00"; }))).toContain("X01");
    expect(codes(await one("F03", r => { fields(r, "lease_assumptions", "F03").prepaidPayments = "1000.00"; }))).toEqual(["X03"]);
    expect(codes(await one("F03", r => { fields(r, "lease_contracts", "F03").paymentTiming = "advance"; }))).toEqual(["X03"]);
  });
  it("échéance exigible : preuve absente → à qualifier (X13, inconnu) ; règlement partiel → hors V1 ; règlement supérieur → à qualifier ; TTC avec TVA qualifiée → réglée", async () => {
    const due = (r: Rows) => r.lease_schedule.find(d => d.key === "F03-2026-03-31")!.details.fields as Record<string, string>;
    const missing = await one("F03", r => { delete due(r).paidAmount; });
    expect(missing.status).toBe("a_qualifier"); expect(missing.dues.find(d => d.dueDate === "2026-03-31")!.settlement).toBe("inconnu");
    expect((await one("F03", r => { due(r).paidAmount = "900.00"; })).status).toBe("hors_scope_v1");
    expect(codes(await one("F03", r => { due(r).paidAmount = "1100.00"; }))).toContain("Q06");
    const ttc = await one("F03", r => { Object.assign(due(r), { paidAmount: "1200.00", paidVat: "200.00" }); });
    expect(ttc.status).toBe("eligible_v1");
    expect(ttc.dues.find(d => d.dueDate === "2026-03-31")).toMatchObject({ settlement: "regle", amount: { amount: "1000.00" }, paidAmount: { amount: "1200.00" }, paidVat: { amount: "200.00" } });
  });
  it("contrat comptable non rapproché : ligne du grand livre sans contrat du registre, mesurée à part, sans compensation", async () => {
    const q = await qualify(r => { r.lease_ledger.push({ key: "GL-613-X", amount: "-500.00", date: "2026-12-31", details: { contractId: "INCONNU-9", source: { title: "GL", pack: "P", date: "2026-01-02", page: null, clause: "613" }, fields: { account: "613200", periodStart: "2026-01-01", periodEnd: "2026-12-31", piece: "OD-9" } } }); });
    expect(q.coverage.ledger).toEqual({ lines: 2, matched: 1, unmatched: 1, absMatched: { amount: "15000.00", currency: "EUR" }, absUnmatched: { amount: "500.00", currency: "EUR" }, unknownContracts: ["INCONNU-9"] });
    expect(q.coverage.registry).toEqual({ contracts: 2, byStatus: { non_location: 0, exemption_documentee: 0, eligible_v1: 1, a_qualifier: 1, hors_scope_v1: 0 } });
  });
  it("échéances ou hypothèses sans contrat du registre : conservées comme orphelines, jamais appariées", async () => {
    const q = await qualify(r => { r.lease_schedule.push(...dueRows("F99", 1, "100.00")); });
    expect(q.orphans).toEqual([expect.objectContaining({ type: "lease_schedule", contractId: "F99" })]);
  });
  it("contrat historique sans ouverture validée : éligible, ouverture absente signalée (le calcul sera un diagnostic, X24)", async () => {
    const c = await one("F03", undefined, NO_WORK);
    expect(c.historical).toBe(false);
    const q = await qualifyLeases(leaseFacts(await approvedLeaseBatches(scope, actor)), { ...LEASE_PERIOD, startDate: "2026-07-01" }, NO_WORK, rule);
    expect(q.contracts.find(x => x.contractId === "F03")).toMatchObject({ status: "eligible_v1", historical: true, inputs: { opening: "absent" }, reasons: [expect.objectContaining({ code: "X24", effect: "info" })] });
  });
  it("mauvais périmètre : bailleur (X30), autre devise (X16), modification économique (X12), TVA non récupérable (X21) → hors V1", async () => {
    expect(codes(await one("F03", r => { fields(r, "lease_contracts", "F03").role = "lessor"; }))).toEqual(["X30"]);
    expect(codes(await one("F03", r => { fields(r, "lease_contracts", "F03").contractCurrency = "USD"; }))).toEqual(["X16"]);
    expect(codes(await one("F03", r => { fields(r, "lease_contracts", "F03").versionNature = "economic_modification"; }))).toEqual(["X12"]);
    expect(codes(await one("F03", r => { fields(r, "lease_contracts", "F03").vatTreatment = "uncertain"; }))).toEqual(["X21"]);
  });
  it("non-location documentée : hors calcul ; « non » sans preuve → à qualifier ; jamais déduite du bailleur ni du compte", async () => {
    expect((await one("F03", r => { fields(r, "lease_contracts", "F03").controlOfUse = "no"; })).status).toBe("non_location");
    expect((await one("F03", r => { const f = fields(r, "lease_contracts", "F03"); f.controlOfUse = "no"; delete f.identificationEvidence; })).status).toBe("a_qualifier");
    expect((await one("F03", r => { delete fields(r, "lease_contracts", "F03").identifiedAsset; })).status).toBe("a_qualifier");
  });
  it("une confirmation citée complète la source ; elle ne rend calculable qu'une réponse explicite", async () => {
    const work: QualificationWork = { policies: [], confirmations: [{ contractId: "F03", field: "initialDirectCosts", answer: { kind: "value", value: "0.00" } }] };
    expect((await one("F03", r => { delete fields(r, "lease_assumptions", "F03").initialDirectCosts; }, work)).status).toBe("eligible_v1");
    const unknown: QualificationWork = { policies: [], confirmations: [{ contractId: "F03", field: "initialDirectCosts", answer: { kind: "unknown", reason: "Facture du courtier non reçue" } }] };
    expect((await one("F03", undefined, unknown)).status).toBe("a_qualifier");
  });
  it("prise d'effet postérieure à la clôture : éligible, marquée à suivre (X34)", async () => {
    const c = await one("F03", r => { const f = fields(r, "lease_contracts", "F03"); r.lease_contracts.find(x => x.key === "F03")!.date = "2027-01-01"; f.endDate = "2029-12-31"; f.signatureDate = "2026-12-01";
      r.lease_schedule = r.lease_schedule.filter(d => d.details.contractId !== "F03").concat(dueRows("F03", 36, "1000.00", LEASE_PERIOD.asOfDate, 2027 * 12)); });
    expect(c).toMatchObject({ status: "eligible_v1", notCommenced: true }); expect(codes(c)).toEqual(["X34"]);
  });
  it("même faits, même travail : même qualification, quel que soit l'ordre des lignes", async () => {
    const a = await qualify(), b = await qualify(r => { r.lease_contracts.reverse(); r.lease_schedule.reverse(); });
    expect(JSON.stringify(b.contracts.map(c => ({ ...c, evidence: [], dues: c.dues.map(d => ({ ...d, proof: null })) })))).toBe(JSON.stringify(a.contracts.map(c => ({ ...c, evidence: [], dues: c.dues.map(d => ({ ...d, proof: null })) }))));
  });
});

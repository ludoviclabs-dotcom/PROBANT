import { describe, expect, it } from "vitest";
import { leaseFacts, type LeaseType } from "@/lib/workpapers/lease-sources";
import { periodId, type WorkpaperScope } from "@/lib/workpapers/model";
import type { Principal } from "@/lib/workpapers/policy";
import { approvedLeaseBatches, ledgerRow, LEASE_PERIOD, type LeaseRow } from "@/lib/workpapers/__tests__/lease-fixture";
import { frameLeases } from "../framing";
import { qualifyLeases, type QualificationWork } from "../qualification";

/**
 * L16-03 — cadrage des loyers sur la base PCG : chaque cas de la recette (charges absentes, mauvaise période, charge mixte, compensation
 * interdite, décalage CCA / FNP, doublon, TVA, règlement postérieur, ligne sans contrat). Attendus posés à la main depuis l'échéancier
 * synthétique : F01 = 3 × 1 000,00 (janvier à mars 2026), F03 = 12 × 1 000,00 sur 2026.
 */
const scope: WorkpaperScope = { organizationId: "org-f", dossierId: "dossier-f", periodId: periodId(LEASE_PERIOD), mode: "real" };
const actor: Principal = { id: "preparer-f", grants: [{ scope, permissions: ["read", "prepare"] }] };
const rule = { id: "ifrs16.leases", version: "1.0.0", basisStatus: "review_required" as const };
const WORK: QualificationWork = { policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }], confirmations: [] };
type Rows = Record<LeaseType, LeaseRow[]>;
async function frame(edit?: (rows: Rows) => void) {
  const facts = leaseFacts(await approvedLeaseBatches(scope, actor, edit)), q = qualifyLeases(facts, LEASE_PERIOD, WORK, rule);
  return frameLeases(q, facts.lease_ledger, LEASE_PERIOD);
}
const of = async (id: string, edit?: (rows: Rows) => void) => (await frame(edit)).contracts.find(c => c.contractId === id)!;
const kinds = (c: { gaps: { code: string; kind: string }[] }) => c.gaps.map(g => g.code + ":" + g.kind);
const f01Line = (rows: Rows, month: number) => rows.lease_ledger.find(r => r.key === "GL-613-F01-2026-0" + month)!;

describe("L16-03 cadrage des loyers sur la base PCG", () => {
  it("base cadrée : F01 par facture mensuelle, F03 par ligne annuelle ; loyers neutralisables sur les comptes de la base", async () => {
    const f = await frame();
    const [f01, f03] = ["F01", "F03"].map(id => f.contracts.find(c => c.contractId === id)!);
    expect(f01).toMatchObject({ status: "framed", expectedRent: { amount: "3000.00" }, bookedRent: { kind: "known", value: { amount: "3000.00" } }, difference: { kind: "known", value: { amount: "0.00" } }, baseAccounts: ["613200"], gaps: [] });
    expect(f01.lines.map(l => [l.key, l.status, l.coveredDues])).toEqual([["GL-613-F01-2026-01", "matched", ["2026-01-31"]], ["GL-613-F01-2026-02", "matched", ["2026-02-28"]], ["GL-613-F01-2026-03", "matched", ["2026-03-31"]]]);
    expect(f03).toMatchObject({ status: "framed", expectedRent: { amount: "12000.00" }, baseAccounts: ["613500"] });
    expect(f03.lines[0].coveredDues).toHaveLength(12);
    expect(f).toMatchObject({ byStatus: { framed: 2, difference: 0, not_framed: 0, not_applicable: 0 }, differences: [], lines: { attached: 4, framed: 4, notFramed: 0, unattached: 0, absFramed: { amount: "15000.00" } } });
  });
  it("charge absente : une échéance sans ligne laisse le loyer non identifié (X27), montant de l'échéance connu, base inconnue — jamais zéro", async () => {
    const f01 = await of("F01", r => { r.lease_ledger = r.lease_ledger.filter(l => l.key !== "GL-613-F01-2026-02"); });
    expect(f01).toMatchObject({ status: "not_framed", bookedRent: { kind: "unknown" }, difference: { kind: "unknown" } });
    expect(f01.gaps).toEqual([expect.objectContaining({ code: "X27", kind: "missing_charge", dueDates: ["2026-02-28"], amount: { kind: "known", value: { amount: "1000.00", currency: "EUR" } } })]);
    const none = await frame(r => { r.lease_ledger = []; });
    expect(none.contracts.filter(c => c.status === "not_framed").map(c => c.contractId)).toEqual(["F01", "F03"]);
  });
  it("mauvaise période : une ligne comptabilisée dans un autre exercice est hors de la base ; l'échéance qu'elle visait reste sans charge", async () => {
    const f01 = await of("F01", r => { f01Line(r, 1).date = "2025-12-31"; });
    expect(f01.lines.find(l => l.key === "GL-613-F01-2026-01")!.status).toBe("other_period");
    expect(kinds(f01)).toEqual(["X27:missing_charge", "info:other_period"]);
    expect(f01.status).toBe("not_framed");
  });
  it("charge mixte : une charge supérieure au loyer est un écart connu (X28), jamais neutralisée pour sa part non locative", async () => {
    const f03 = await of("F03", r => { r.lease_ledger.find(l => l.key === "GL-613-F03-2026")!.amount = "12600.00"; });
    expect(f03).toMatchObject({ status: "difference", difference: { kind: "known", value: { amount: "600.00" } }, baseAccounts: [] });
    expect(f03.gaps).toEqual([expect.objectContaining({ code: "X28", kind: "excess_or_mixed", amount: { kind: "known", value: { amount: "600.00", currency: "EUR" } } })]);
  });
  it("compensation interdite : +100 en janvier et −100 en février ne s'annulent pas ; deux contrats en écart opposé non plus", async () => {
    const f = await frame(r => { f01Line(r, 1).amount = "1100.00"; f01Line(r, 2).amount = "900.00"; });
    const f01 = f.contracts.find(c => c.contractId === "F01")!;
    // The net difference is zero, yet each line keeps its own difference and the contract is not framed.
    expect(f01).toMatchObject({ status: "difference", difference: { kind: "known", value: { amount: "0.00" } } });
    expect(f.differences).toEqual([{ contractId: "F01", lineKey: "GL-613-F01-2026-01", amount: { amount: "100.00", currency: "EUR" } }, { contractId: "F01", lineKey: "GL-613-F01-2026-02", amount: { amount: "-100.00", currency: "EUR" } }]);
    const across = await frame(r => { f01Line(r, 3).amount = "1100.00"; r.lease_ledger.find(l => l.key === "GL-613-F03-2026")!.amount = "11900.00"; });
    expect(across.contracts.map(c => c.status)).toEqual(["difference", "difference"]);
    expect(across.differences.map(d => d.amount.amount)).toEqual(["100.00", "-100.00"]);
  });
  it("décalage CCA / FNP : une ligne qui déborde de l'exercice rend la part de la base inconnue (X28), sans prorata inventé", async () => {
    const f03 = await of("F03", r => {
      r.lease_ledger = r.lease_ledger.filter(l => l.key !== "GL-613-F03-2026");
      r.lease_ledger.push(ledgerRow("GL-613-F03-T1-T3", "F03", "11000.00", "613500", "2026-01-01", "2026-11-30", "OD-2026-11"), ledgerRow("GL-613-F03-T4", "F03", "3000.00", "613500", "2026-12-01", "2027-02-28", "FA-2026-12", "2026-12-15"));
    });
    expect(f03).toMatchObject({ status: "not_framed", bookedRent: { kind: "unknown", reason: expect.stringContaining("X28") } });
    expect(f03.lines.find(l => l.key === "GL-613-F03-T4")!.status).toBe("straddles_period");
    expect(kinds(f03)).toEqual(["X27:missing_charge", "X28:cut_off"]);
  });
  it("doublon d'écriture : une échéance couverte par deux lignes marque les deux lignes, sans en choisir une", async () => {
    const f01 = await of("F01", r => { r.lease_ledger.push({ ...f01Line(r, 1), key: "GL-613-F01-2026-01-BIS" }); });
    expect(f01.lines.filter(l => l.status === "duplicate").map(l => l.key)).toEqual(["GL-613-F01-2026-01", "GL-613-F01-2026-01-BIS"]);
    expect(f01).toMatchObject({ status: "difference", difference: { kind: "known", value: { amount: "1000.00" } } });
  });
  it("TVA : règlement TTC qualifié ; une charge au montant hors TVA est cadrée, une charge au montant TTC est un écart signalé, sans décision de récupération", async () => {
    const ttc = (r: Rows) => { for (const d of r.lease_schedule.filter(x => x.details.contractId === "F01")) Object.assign(d.details.fields as Record<string, string>, { paidAmount: "1200.00", paidVat: "200.00" }); };
    const framed = await of("F01", ttc);
    expect(framed).toMatchObject({ status: "framed", vatBridge: { paidTotal: { amount: "3600.00" }, paidVat: { amount: "600.00" } } });
    expect(framed.vatBridge!.rows[0]).toMatchObject({ rent: { amount: "1000.00" }, paidTotal: { amount: "1200.00" }, paidVat: { amount: "200.00" } });
    const booked = await of("F01", r => { ttc(r); for (const m of [1, 2, 3]) f01Line(r, m).amount = "1200.00"; });
    expect(booked.status).toBe("difference");
    expect(kinds(booked)).toEqual(["X28:vat_in_charge"]);
  });
  it("règlement après la clôture : constat sans effet sur le cadrage, aucun mouvement de trésorerie attendu", async () => {
    const f03 = await of("F03", r => { Object.assign(r.lease_schedule.find(d => d.key === "F03-2026-12-31")!.details.fields as Record<string, string>, { paidDate: "2027-01-10" }); });
    expect(f03.status).toBe("framed");
    expect(f03.gaps).toEqual([expect.objectContaining({ code: "info", kind: "settled_after_closing", dueDates: ["2026-12-31"] })]);
  });
  it("lignes sans contrat du registre : listées à part, jamais rattachées ni compensées ; un compte hors 612 / 613 / 614 n'est qu'un indice", async () => {
    const f = await frame(r => { r.lease_ledger.push(ledgerRow("GL-614-X", null, "-500.00", "614000", "2026-01-01", "2026-12-31", "OD-X"), ledgerRow("GL-622-F03", "F03", "50.00", "622600", "2026-06-01", "2026-06-30", "FA-622")); });
    expect(f.unattached.map(u => [u.key, u.amount.amount])).toEqual([["GL-614-X", "-500.00"]]);
    expect(f.lines).toMatchObject({ unattached: 1, absUnattached: { amount: "500.00" } });
    const f03 = f.contracts.find(c => c.contractId === "F03")!;
    expect(f03.status).toBe("difference");
    expect(kinds(f03)).toEqual(["X28:duplicate", "info:account_hint"]);
  });
  it("ligne sans pièce ou sans période : non rattachable (X27) ; contrat non calculé : cadrage sans objet", async () => {
    const f01 = await of("F01", r => { delete (f01Line(r, 2).details.fields as Record<string, string>).piece; });
    expect(f01.status).toBe("not_framed");
    expect(kinds(f01)).toEqual(["X27:missing_charge", "X27:unattachable_line"]);
    const excluded = await of("F01", r => { r.lease_contracts.find(c => c.key === "F01")!.details.fields = { ...(r.lease_contracts.find(c => c.key === "F01")!.details.fields as object), vatTreatment: "non_recoverable" }; });
    expect(excluded).toMatchObject({ status: "not_applicable", bookedRent: { kind: "not_applicable" } });
    expect(excluded.lines.every(l => l.status === "not_applicable")).toBe(true);
  });
  it("même base dans un autre ordre : même cadrage", async () => {
    // The reordered file has other row identifiers: only the framing itself is compared, not the proofs.
    const project = (f: Awaited<ReturnType<typeof frame>>) => JSON.parse(JSON.stringify(f, (k, v) => k === "proof" ? undefined : v));
    const a = await frame(), b = await frame(r => { r.lease_ledger.reverse(); });
    expect(project(b)).toEqual(project(a));
  });
});

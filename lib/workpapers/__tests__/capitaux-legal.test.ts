import { describe, expect, it } from "vitest";
import { articleVersion, legalMarkers, type LegalInput } from "../capitaux-legal";
import { paymentState } from "../capitaux-payment";

/** Versions read on Légifrance on 14/10/2026; amounts set by hand. */
const m = (amount: string) => ({ amount, currency: "EUR" as const });
const eur = (amount: string) => ({ kind: "known" as const, value: m(amount) });
const base = (over: Partial<LegalInput> = {}): LegalInput => ({
  socialForm: "sarl", period: { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31" },
  components: { capital: { opening: m("1000.00"), closing: m("1000.00") }, reserve_legale: { opening: m("20.00"), closing: m("22.00") }, report_a_nouveau: { opening: m("0.00"), closing: m("-650.00") }, resultat: { opening: m("100.00"), closing: m("-400.00") } },
  equityClosing: eur("400.00"), decisions: [{ type: "affectation_resultat", component: "reserve_legale", voted: m("2.00"), decisionDate: "2026-05-20" }, { type: "affectation_resultat", component: "report_a_nouveau", voted: m("98.00"), decisionDate: "2026-05-20" }], ...over });

describe("C09 — versions datées des articles du code de commerce", () => {
  it("L232-10 : version 2000 jusqu’au 30/09/2025, version de l’ordonnance 2025-229 dès le 01/10/2025", () => {
    expect(articleVersion("L232-10", "2025-09-30")!.label).toContain("du 21/09/2000 au 30/09/2025");
    expect(articleVersion("L232-10", "2025-10-01")!.label).toContain("depuis le 01/10/2025");
  });
  it("L223-42 et L225-248 : versions de la loi 2023-171 dès le 11/03/2023 ; L227-1 non relu avant le 21/07/2019", () => {
    expect(articleVersion("L223-42", "2023-03-10")!.label).toContain("05/08/2003 au 10/03/2023");
    expect(articleVersion("L223-42", "2023-03-11")!.label).toContain("loi n° 2023-171");
    expect(articleVersion("L225-248", "2023-03-11")!.label).toContain("loi n° 2023-171");
    expect(articleVersion("L227-1", "2019-07-20")).toBeNull();
  });
});

describe("C09 — repères légaux : calculs arithmétiques, signaux à examiner, jamais de conclusion", () => {
  it("SARL, capitaux propres 400 pour un capital 1 000 : rapport sous la moitié → « à examiner » au regard de L223-42, sans alerte de dissolution ni délai", () => {
    const half = legalMarkers(base()).items[2];
    expect(half.articles.map(a => a.label)).toEqual(["C. com. art. L223-42, version en vigueur depuis le 11/03/2023 (loi n° 2023-171 du 09/03/2023, art. 14)"]);
    expect(half.computed[2].value).toEqual({ kind: "fraction", numerator: "40000", denominator: "100000", unit: "cents_ratio" });
    expect(half.signal.kind).toBe("a_examiner");
    expect(half.signal.text).toContain("Aucune alerte de dissolution, aucun délai calculé");
  });
  it("réserve légale : base 100, 1/20 = 5, affectation votée 2 alors que la réserve reste sous 1/10 du capital → « à examiner » ; vote de 5 → aucun signal", () => {
    expect(legalMarkers(base()).items[0].signal.kind).toBe("a_examiner");
    const five = legalMarkers(base({ decisions: [{ type: "affectation_resultat", component: "reserve_legale", voted: m("5.00"), decisionDate: "2026-05-20" }] })).items[0];
    expect(five.signal.kind).toBe("aucun");
    // Reserve already at a tenth of the capital at opening: the levy is no longer required (al. 2).
    expect(legalMarkers(base({ components: { ...base().components, reserve_legale: { opening: m("100.00"), closing: m("102.00") } } })).items[0].signal.text).toContain("dixième du capital");
  });
  it("distribution : capitaux propres de clôture sous capital + réserve légale → « à examiner » (al. 3) ; écarts de réévaluation non fournis jamais réputés nuls", () => {
    const dist = legalMarkers(base({ decisions: [{ type: "distribution", component: "resultat", voted: m("-50.00"), decisionDate: "2026-05-20" }] })).items[1];
    expect(dist.computed.map(c => c.value)).toEqual([eur("50.00"), eur("400.00"), eur("1022.00")]);
    expect(dist.computed[2].basis).toContain("écarts de réévaluation");
    expect(dist.signal.kind).toBe("a_examiner");
  });
  it("forme non documentée : rien n’est calculé comme applicable ; autre forme : L232-10 et L223-42 / L225-248 non visés", () => {
    expect(legalMarkers(base({ socialForm: null })).items.map(i => [i.applies, i.signal.kind])).toEqual([["inconnu", "non_calcule"], ["inconnu", "non_calcule"], ["inconnu", "non_calcule"]]);
    expect(legalMarkers(base({ socialForm: "autre" })).items.map(i => i.applies)).toEqual(["non", "inconnu", "non"]);
  });
  it("SAS clôturant avant le 21/07/2019 : renvoi de L227-1 non relu → rapport non apprécié", () => {
    const old = legalMarkers(base({ socialForm: "sas", period: { startDate: "2018-07-01", closingDate: "2019-06-30", asOfDate: "2019-09-30" } })).items[2];
    expect(old).toMatchObject({ applies: "inconnu", signal: { kind: "non_calcule" } });
  });
  it("registre des décisions absent : repères de réserve légale et de distribution non calculés", () => {
    const r = legalMarkers(base({ decisions: null }));
    expect(r.items[0].signal.text).toContain("Registre des décisions absent");
    expect(r.items[1].computed[0].value).toMatchObject({ kind: "unknown" });
  });
});

describe("C09 — paiement d’une décision en vigueur", () => {
  const p = (payments: { id: string; amount: string; date: string }[], over: Partial<Parameters<typeof paymentState>[0]> = {}) =>
    paymentState({ voted: m("120.00"), payments: payments.map(x => ({ ...x, amount: m(x.amount) })), sourcePresent: true, applies: true, closingDate: "2026-12-31", asOfDate: "2027-03-31", ...over });
  it("payé après la clôture : reste 120 à la clôture, 0 à la revue", () => {
    expect(p([{ id: "P", amount: "120.00", date: "2027-01-15" }])).toMatchObject({ status: "paid", remainingAtClosing: eur("120.00"), remainingAtReview: eur("0.00") });
  });
  it("partiel, dépassement, aucune source, aucune attente", () => {
    expect(p([{ id: "P", amount: "20.00", date: "2026-06-01" }])).toMatchObject({ status: "partially_paid", remainingAtReview: eur("100.00") });
    expect(p([{ id: "P", amount: "130.00", date: "2026-06-01" }])).toMatchObject({ status: "overpaid", remainingAtReview: eur("-10.00") });
    expect(p([], { sourcePresent: false })).toMatchObject({ status: "unknown", paidAtReview: { kind: "unknown" } });
    expect(p([], { applies: false })).toMatchObject({ status: "not_applicable" });
    expect(p([{ id: "P", amount: "5.00", date: "2026-06-01" }], { applies: false }).status).toBe("unknown");
  });
});

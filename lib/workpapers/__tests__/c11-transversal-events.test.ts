import { describe, expect, it } from "vitest";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { qualifyVatExigibility, type VatQualificationInput } from "@/lib/tax/vat/exigibility";
import { periodId } from "../model";
import { analyzeCutoff, CUTOFF_RULE_VERSION, type CutoffInput } from "../cutoff";
import { resolveCutoffRule } from "../cutoff-rule";
import { buildTransversalEventMap, type TransversalEvent } from "../transversal-events";
import { facts, input, k, m, period, PURCHASES, recette, RPNE, run, scope, SPEC } from "./c11-fixtures";

/**
 * C11 — recette « Clients, achats, cut-off et TVA ». Attendus posés à la main dans docs/recette/c11/RECETTE.md avant
 * exécution ; le moteur de cut-off réel (contexte Achats) produit les résultats que la carte projette.
 */
const byInvoice = (events: TransversalEvent[], invoice: string) => events.find((e) => e.invoiceId === invoice)!;
const tranches = (e: TransversalEvent) => e.dates.vat.exigibility.tranches.map((t) => [t.basis, t.date, t.amountTtc.kind === "known" ? t.amountTtc.value.amount : "?"]);

describe("C11 — texte français applicable au rattachement", () => {
  it("exercice 2025-2026 : ANC 2022-06, ANC 2026-03 non applicable", () => {
    const r = resolveCutoffRule({ startDate: period.startDate, closingDate: period.closingDate, flow: "sale" });
    expect(r).toMatchObject({ status: "resolved", textId: "anc-2022-06", anc202603: "not_yet_applicable", contract: { status: "not_applicable" } });
    expect(r.articles).toContain("512-4"); expect(r.articles).toContain("1214-41");
  });
  it("exercice 2027 : la vente suit la date du contrat ; l'achat n'a pas de condition contractuelle", () => {
    const y27 = { startDate: "2027-01-01", closingDate: "2027-12-31" };
    expect(resolveCutoffRule({ ...y27, flow: "sale", contractDate: "2026-09-01" })).toMatchObject({ status: "resolved", textId: "pcg-2026-01-01", basis: "contract_before_entry_into_force", contract: { status: "out_of_scope", entryIntoForce: "2026-09-04" } });
    expect(resolveCutoffRule({ ...y27, flow: "sale", contractDate: "2026-09-05" })).toMatchObject({ status: "resolved", textId: "anc-2026-03", basis: "mandatory", contract: { status: "in_scope" } });
    expect(resolveCutoffRule({ ...y27, flow: "sale", contractDate: "2026-09-04" })).toMatchObject({ status: "contract_information_required", textId: null, contract: { status: "entry_day" } });
    expect(resolveCutoffRule({ ...y27, flow: "sale" })).toMatchObject({ status: "contract_information_required", contract: { status: "contract_date_required" } });
    expect(resolveCutoffRule({ ...y27, flow: "purchase" })).toMatchObject({ status: "resolved", textId: "anc-2026-03", contract: { status: "not_applicable" } });
  });
  it("exercice 2026 : ANC 2026-03 seulement sur option déclarée ; exercice ouvert avant 2024 : aucun article cité", () => {
    const y26 = { startDate: "2026-01-01", closingDate: "2026-12-31", flow: "sale" as const };
    expect(resolveCutoffRule(y26)).toMatchObject({ textId: "pcg-2026-01-01", anc202603: "anticipation_available" });
    expect(resolveCutoffRule({ ...y26, anticipated: ["anc-2026-03"], contractDate: "2026-10-01" })).toMatchObject({ textId: "anc-2026-03", basis: "anticipation_elected" });
    expect(resolveCutoffRule({ startDate: "2023-07-01", closingDate: "2024-06-30", flow: "purchase" })).toMatchObject({ status: "no_text_read", textId: null });
  });
  it("dans la chaîne réelle, une vente 2027 sans contrat daté est non concluante ; le résultat porte la règle 1.1.0", () => {
    const p27: AccountingPeriod = { startDate: "2027-01-01", closingDate: "2027-12-31", asOfDate: "2028-02-15", currency: "EUR", validation: "confirmed" };
    const s27 = { ...scope, periodId: periodId(p27) };
    const base = input(SPEC.c1);
    const ctx = { scope: s27, period: p27, purpose: "real" as const, procedure: "payables.purchases" as const };
    const relink = (i: CutoffInput): CutoffInput => ({ ...i, context: ctx, invoice: { ...i.invoice!, date: "2028-01-05", evidence: i.invoice!.evidence.map((e) => ({ ...e, scope: s27 })) }, performance: { ...i.performance!, date: "2027-12-20", evidence: i.performance!.evidence.map((e) => ({ ...e, scope: s27 })) }, basis: { ...i.basis, evidence: i.basis.evidence.map((e) => ({ ...e, scope: s27 })) }, recognition: { ...i.recognition, evidence: i.recognition.evidence.map((e) => ({ ...e, scope: s27 })) } });
    const undated = analyzeCutoff(relink(base));
    expect(undated).toMatchObject({ status: "inconclusive", version: CUTOFF_RULE_VERSION, reasons: ["DATE_DU_CONTRAT_REQUISE_ANC_2026_03"] });
    expect(analyzeCutoff({ ...relink(base), contract: { date: "2026-09-04" } }).reasons).toEqual(["CONTRAT_CONCLU_LE_JOUR_DE_L_ENTREE_EN_VIGUEUR_ANC_2026_03"]);
    expect(analyzeCutoff({ ...relink(base), contract: { date: "2026-10-01" } })).toMatchObject({ status: "candidate", candidate: "FAE", rule: { textId: "anc-2026-03" } });
  });
});

describe("C11 — moteur de cut-off 1.1.0 sur les cas de la recette (attendus comptables)", () => {
  it.each([
    ["1 livraison mars / facture avril", SPEC.c1, "candidate", "FAE", "1000.00"],
    ["2 facture mars / prestation avril", SPEC.c2, "candidate", "PCA", "2000.00"],
    ["3a service encaissé ultérieurement", SPEC.c3a, "already_treated", null, null],
    ["3b option pour les débits", SPEC.c3b, "already_treated", null, null],
    ["4 acompte en 4191, livraison après clôture", SPEC.c4, "no_difference_on_tested_items", null, null],
    ["5a avoir post-clôture, cause antérieure", SPEC.c5a, "candidate", "AAE", "-500.00"],
    ["6 fournisseur hors période", SPEC.c6, "no_difference_on_tested_items", null, null],
    ["7a livraison mars, facture avril, sans FNP", SPEC.c7a, "candidate", "FNP", "1000.00"],
    ["8 prestation mars, facture avril", SPEC.c8, "candidate", "FNP", "400.00"],
  ] as const)("%s", (_label, spec, status, candidate, amount) => {
    const r = analyzeCutoff(input(spec));
    expect(r.status).toBe(status); expect(r.candidate).toBe(candidate);
    if (amount) expect(r.amount).toEqual(k(amount));
    expect(r.rule).toMatchObject({ status: "resolved", textId: "anc-2022-06" });
  });
  it("4b acompte enregistré en produit avant la clôture : PCA du montant enregistré", () => {
    const r = analyzeCutoff(input({ ...SPEC.c4, booked: "1000.00", bookingDate: "2026-03-28" }));
    expect(r).toMatchObject({ status: "candidate", candidate: "PCA", amount: k("1000.00") });
  });
  it("avoir : cause postérieure sans effet ; avoir déjà enregistré traité ; montant positif refusé", () => {
    expect(analyzeCutoff(input({ ...SPEC.c5a, perf: "2026-04-03" })).status).toBe("no_difference_on_tested_items");
    expect(analyzeCutoff(input({ ...SPEC.c5a, booked: "-500.00", bookingDate: "2026-03-30" })).status).toBe("already_treated");
    expect(analyzeCutoff(input({ ...SPEC.c5a, net: "500.00", tax: "100.00", gross: "600.00" })).reasons).toEqual(["AVOIR_MONTANTS_NEGATIFS_ATTENDUS"]);
  });
});

describe("C11 — carte des événements : dates, TVA, règlements, pont et C03", () => {
  const map = buildTransversalEventMap(recette());
  it("1 : FAE 1 000 HT, 418 TTC 1 200 ; TVA exigible à la livraison sous réserve d'acompte ; mars contre avril observé", () => {
    const e = byInvoice(map.events, "F-101");
    expect(e.accounting).toMatchObject({ status: "candidate", candidate: "FAE", amountHt: k("1000.00"), balanceSheet: { account: "418", amountTtc: k("1200.00") }, vatAccount: "44587" });
    expect(e.dates).toMatchObject({ invoice: "2026-04-02", performance: { date: "2026-03-25" }, booking: null, closing: "2026-03-31", review: "2026-05-15" });
    expect(e.dates.vat.exigibility.status).toBe("partially_qualified");
    expect(tranches(e)).toEqual([["delivery", "2026-03-25", "?"]]);
    expect(e.dates.vat.exigibilityPeriod).toMatchObject({ startDate: "2026-03-01", basis: "vat_sheet" });
    expect(e.dates.vat.observedPeriods.map((p) => p.startDate)).toEqual(["2026-04-01"]);
    expect(e.dates.vat.shift).toBe("later");
    expect(e.observations.map((o) => o.procedureId)).toEqual(["payables.purchases", "payables.rpne"]);
    expect(e.effect).toMatchObject({ amountCents: 100000, direction: "increase", contributors: 2 });
    expect(e.procedure).toMatchObject({ status: "resolved", title: "Rattachement des produits non encore facturés" });
  });
  it("2 : PCA 2 000 HT ; exigible à l'encaissement du 25/04 ; TVA observée en mars, plus tôt ; solde clients 0", () => {
    const e = byInvoice(map.events, "F-102");
    expect(e.accounting).toMatchObject({ candidate: "PCA", amountHt: k("2000.00"), balanceSheet: { account: "487", amountTtc: k("2000.00") }, vatAccount: null });
    expect(e.dates.vat.exigibility.status).toBe("qualified");
    expect(tranches(e)).toEqual([["payment", "2026-04-25", "2400.00"]]);
    expect(e.dates.vat.shift).toBe("earlier");
    expect(e.observations.map((o) => o.status)).toEqual(["candidate", "candidate", "observed"]);
    expect(e.settlement).toMatchObject({ dueAtClosing: m("2400.00"), dueAtReview: m("0.00"), allocatedTtc: m("2400.00") });
    expect(e.effect).toMatchObject({ amountCents: 200000, direction: "decrease", contributors: 2 });
    expect(e.procedure?.title).toBe("Rattachement des produits encaissés d'avance");
  });
  it("3 : sans option, exigible à l'encaissement (avril, plus tôt observé) ; avec option documentée, au débit (mars, même période)", () => {
    const a = byInvoice(map.events, "F-103"), b = byInvoice(map.events, "F-104");
    expect(a.accounting.status).toBe("already_treated"); expect(b.accounting.status).toBe("already_treated");
    expect(tranches(a)).toEqual([["payment", "2026-04-20", "3600.00"]]); expect(a.dates.vat.shift).toBe("earlier");
    expect(tranches(b)).toEqual([["debit", "2026-03-15", "3600.00"]]); expect(b.dates.vat.shift).toBe("same");
    expect(b.dates.vat.exigibility.rule?.articles).toContain("CGI, art. 269, 2-c");
    expect(a.effect).toBeNull(); expect(a.procedure).toBeNull();
  });
  it("4 : acompte exigible à son encaissement (mars), solde à la livraison (avril) ; aucune différence comptable", () => {
    const e = byInvoice(map.events, "F-105");
    expect(e.accounting.status).toBe("no_difference_on_tested_items");
    expect(e.dates.vat.exigibility.status).toBe("qualified");
    expect(tranches(e)).toEqual([["advance", "2026-03-28", "1200.00"], ["delivery", "2026-04-12", "4800.00"]]);
    expect(e.dates.vat.exigibilityPeriod?.startDate).toBe("2026-03-01"); expect(e.dates.vat.shift).toBe("later");
  });
  it("5a : avoir à établir −500 HT (4198 TTC 600) ; TVA de l'avoir hors catégories couvertes ; 5b : avoir appliqué, solde de clôture fixe", () => {
    const a = byInvoice(map.events, "AV-106");
    expect(a.accounting).toMatchObject({ candidate: "AAE", amountHt: k("-500.00"), balanceSheet: { account: "4198", amountTtc: k("-600.00") } });
    expect(a.dates.vat.exigibility.status).toBe("information_required");
    expect(a.effect).toMatchObject({ amountCents: 50000, direction: "decrease" });
    expect(a.procedure?.title).toBe("Rattachement des avoirs à établir");
    const b = byInvoice(map.events, "F-107");
    expect(b.accounting.status).toBe("not_evaluated");
    expect(b.settlement).toMatchObject({ dueAtClosing: m("1800.00"), dueAtReview: m("1500.00"), creditsTtc: m("300.00"), residualTtc: k("1500.00") });
    expect(b.information.some((i) => i.startsWith("Avoir postérieur à la clôture : date de sa cause"))).toBe(true);
  });
  it("6 : fournisseur hors période, droit à déduction au paiement du 30/04, même période observée", () => {
    const e = byInvoice(map.events, "FS-201");
    expect(e.accounting.status).toBe("no_difference_on_tested_items");
    expect(e.dates.vat.exigibility).toMatchObject({ status: "qualified", subject: "deduction_right" });
    expect(tranches(e)).toEqual([["payment", "2026-04-30", "960.00"]]); expect(e.dates.vat.shift).toBe("same");
  });
  it("7 : FNP 1 000 HT comptée une fois ; reliquat du paiement groupé gardé sans répartition ; encaissement partiel client sans perte", () => {
    const e = byInvoice(map.events, "FS-202");
    expect(e.accounting).toMatchObject({ candidate: "FNP", amountHt: k("1000.00"), balanceSheet: { account: "408", amountTtc: k("1200.00") } });
    expect(e.observations.map((o) => [o.procedureId, o.basis, o.status])).toEqual([["payables.purchases", "event_analysis", "candidate"], ["payables.rpne", "procedure_row", "candidate"]]);
    expect(tranches(e)).toEqual([["delivery", "2026-03-20", "1200.00"]]);
    expect(map.globalSettlements.find((g) => g.id === "P-202")).toMatchObject({ unallocatedTtc: m("600.00"), allocated: [{ invoiceId: "FS-202", amount: m("1200.00") }] });
    expect(e.settlement.groupedPaymentIds).toEqual(["P-202"]);
    const c = byInvoice(map.events, "F-108");
    expect(c.settlement).toMatchObject({ dueAtReview: m("700.00"), partial: true }); expect(c.effect).toBeNull();
  });
  it("8 : source ultérieure incomplète — candidat FNP 400 suspendu par la RPNE non concluante, aucun effet, déduction partiellement qualifiée", () => {
    const e = byInvoice(map.events, "FS-203");
    expect(e.accounting).toMatchObject({ status: "inconclusive", candidate: null, amountHt: { kind: "unknown" } });
    expect(e.observations.map((o) => [o.procedureId, o.basis, o.status, o.candidate])).toEqual([["payables.purchases", "event_analysis", "candidate", "FNP"], ["payables.rpne", "procedure_row", "inconclusive", null]]);
    expect(e.dates.vat.exigibility.status).toBe("partially_qualified");
    expect(e.information.some((i) => i.startsWith("Source ultérieure incomplète"))).toBe(true);
    expect(e.information).toContain("FENETRE_NON_COUVERTE");
    expect(e.effect).toBeNull(); expect(e.procedure).toBeNull();
  });
  it("pont C05 : chaque effet compté une fois, par poste et sens, sans incidence fiscale inventée", () => {
    const stage = (direction: "increase" | "decrease") => map.bridge.stages.find((s) => s.target === "resultat" && s.direction === direction)!;
    expect(stage("increase")).toMatchObject({ detectedCents: 200000, exactRepeatsCents: 100000, initialCents: 100000 });
    expect(stage("decrease")).toMatchObject({ detectedCents: 650000, exactRepeatsCents: 300000, initialCents: 350000 });
    expect(map.bridge).toMatchObject({ candidateObservations: 7, countedEffects: 4, divergentEvents: 0 });
  });
  it("une procédure qui conclut « déjà rattaché » face à l'analyse candidate rend l'événement divergent, sans effet", () => {
    const divergent = buildTransversalEventMap({ ...recette(), cutoffEvents: [facts(SPEC.c7a, PURCHASES), facts(SPEC.c7a, RPNE, { status: "booked_in_period", reasons: [] })] });
    expect(byInvoice(divergent.events, "FS-202")).toMatchObject({ accounting: { status: "divergent" }, effect: null });
    expect(divergent.bridge.countedEffects).toBe(0);
  });
  it("un règlement lu dans une feuille périmée ne réduit aucun reste et ne date aucune exigibilité", () => {
    const base = recette();
    const map2 = buildTransversalEventMap({ ...base, settlements: base.settlements.map((p) => p.id === "P-201" ? { ...p, run: run("payables.rpne", "RUN-RPNE-OLD", true) } : p) });
    const e = byInvoice(map2.events, "FS-201");
    expect(e.settlement.allocatedTtc).toEqual(m("0.00"));
    expect(e.dates.vat.exigibility.status).toBe("information_required");
    expect(e.information.some((i) => i.startsWith("Règlements lus dans une feuille périmée (P-201)"))).toBe(true);
  });
  it("facture lue seulement dans des feuilles périmées : visible, sans date, montant ni TVA courants", () => {
    const base = recette(), stale = { stale: true, staleReasons: ["Une source approuvée a été remplacée."] };
    const e = byInvoice(buildTransversalEventMap({ ...base, cutoffEvents: base.cutoffEvents.map((f) => f.invoiceId === "F-101" ? { ...f, run: { ...f.run, ...stale } } : f) }).events, "F-101");
    expect(e.observations.map((o) => o.stale)).toEqual([true, true]);
    expect(e).toMatchObject({ accounting: { status: "not_evaluated" }, effect: null, dates: { invoice: null, performance: null, booking: null } });
    expect(e.settlement.invoiceTtc).toMatchObject({ kind: "unknown", reason: expect.stringContaining("feuille périmée") });
    expect(e.dates.vat.exigibility).toMatchObject({ status: "information_required", firstDate: null });
    expect(e.dates.vat).toMatchObject({ exigibilityPeriod: null, shift: "not_comparable" });
    expect(e.information).toContain("Facture lue seulement dans des feuilles périmées : dates, montants et TVA non retenus tant qu’une feuille n’est pas relancée.");
    expect(e.dependencies.filter((d) => d.kind === "run").every((d) => d.stale)).toBe(true);
  });
  it("solde ouvert et avoir d'une feuille Clients périmée : visibles, jamais retenus dans le résidu", () => {
    const base = recette(), OLD = run("clients.sales", "RUN-CLI-OLD", true);
    const e = byInvoice(buildTransversalEventMap({ ...base, openInvoices: base.openInvoices.map((o) => o.invoiceId === "F-107" ? { ...o, run: OLD } : o), credits: base.credits.map((c) => ({ ...c, run: OLD })) }).events, "F-107");
    expect(e.settlement).toMatchObject({ creditsTtc: m("0.00"), residualTtc: { kind: "unknown" }, dueAtClosing: null, dueAtReview: null, partial: false });
    expect(e.dates.credits).toEqual([]);
    expect(e.observations).toMatchObject([{ basis: "open_balance", stale: true }]);
    expect(e.information).toEqual(expect.arrayContaining([expect.stringMatching(/^Solde ouvert lu seulement dans une feuille Clients périmée/), expect.stringMatching(/^Avoirs lus dans une feuille périmée \(AV-107\)/)]));
    expect(e.sources.some((s) => s.rowId === "AV-107")).toBe(true);
  });
  it("feuille TVA périmée : ni période d'exigibilité confirmée, ni période observée, ni décalage ; reste une dépendance", () => {
    const base = recette(), stale = { stale: true, staleReasons: ["Une source de la période déclarative a été remplacée."] };
    const map2 = buildTransversalEventMap({ ...base, vatSheets: base.vatSheets.map((v) => v.runId === "RUN-TVA-MAR" ? { ...v, stale: true } : v),
      vatEntries: base.vatEntries.map((v) => v.run.runId === "RUN-TVA-MAR" ? { ...v, run: { ...v.run, ...stale } } : v) });
    const f101 = byInvoice(map2.events, "F-101"), f104 = byInvoice(map2.events, "F-104");
    expect(f101.dates.vat.exigibilityPeriod).toMatchObject({ startDate: "2026-03-01", basis: "calendar_month_unconfirmed" });
    expect(f104.dates.vat).toMatchObject({ observedPeriods: [], shift: "not_comparable" });
    expect(f104.dependencies).toContainEqual(expect.objectContaining({ kind: "vat_sheet", stale: true, label: "Feuille TVA périmée" }));
    expect(f104.information.some((i) => i.startsWith("TVA lue dans une feuille périmée (RUN-TVA-MAR)"))).toBe(true);
    expect(f104.accounting.status).toBe("already_treated");
  });
  it("une observation périmée reste visible mais ne compte pas ; deux montants divergents rendent l'effet inconnu", () => {
    const base = recette();
    const stale = buildTransversalEventMap({ ...base, cutoffEvents: [facts(SPEC.c1, run("payables.purchases", "RUN-ACH", true)), facts(SPEC.c1, RPNE)] });
    expect(byInvoice(stale.events, "F-101")).toMatchObject({ effect: { contributors: 1 }, observations: [{ stale: true }, { stale: false }] });
    const other = facts({ ...SPEC.c1, net: "900.00", tax: "180.00", gross: "1080.00" }, RPNE);
    const divergent = buildTransversalEventMap({ ...base, cutoffEvents: [facts(SPEC.c1, PURCHASES), other] });
    expect(byInvoice(divergent.events, "F-101")).toMatchObject({ accounting: { status: "divergent", amountHt: { kind: "unknown" } }, effect: null });
  });
  it("dépendances d'invalidation : chaque partie de l'événement nomme ses sources ; la carte est déterministe", () => {
    const e = byInvoice(map.events, "FS-202");
    expect(e.sources.find((s) => s.role === "invoice")?.parts).toEqual(["accounting", "vat", "settlement"]);
    expect(e.sources.find((s) => s.role === "payment")?.parts).toEqual(["settlement", "vat"]);
    expect(e.dependencies.some((d) => d.kind === "framework" && d.part === "accounting")).toBe(true);
    expect(map.invalidation.find((i) => i.sourceType.startsWith("fx_fec"))?.parts).toEqual(["vat"]);
    expect(buildTransversalEventMap(recette()).hash).toBe(map.hash);
  });
});

describe("C11 — qualification TVA : catégories fermées et couverture", () => {
  const base: VatQualificationInput = { flow: "sale", category: "goods", debitOption: null, performance: { kind: "point", date: "2026-03-25" }, debitDate: null, net: k("1000.00"), tax: k("200.00"), gross: k("1200.00"), settlements: { status: "complete", items: [], reviewDate: "2026-05-15" } };
  it("taux constaté descriptif, jamais légal", () => {
    expect(qualifyVatExigibility(base).observedRate).toMatchObject({ basisPoints: 2000 });
    expect(qualifyVatExigibility(base).observedRate.meaning).toMatch(/aucun taux légal/);
  });
  it("date hors registre (art. 269 arrêté au 31/08/2026) ou achat avant le 21/02/2026 (art. 271) : information requise", () => {
    expect(qualifyVatExigibility({ ...base, performance: { kind: "point", date: "2026-09-15" } })).toMatchObject({ status: "information_required" });
    expect(qualifyVatExigibility({ ...base, flow: "purchase", category: "services", debitOption: "no", settlements: { status: "complete", items: [{ id: "P", date: "2026-02-10", amountTtc: m("1200.00"), kind: "payment", source: "rpne" }], reviewDate: "2026-05-15" } }).missing[0]).toMatch(/271/);
  });
  it("catégorie absente ou non couverte, option inconnue, option du fournisseur, livraison étalée : information requise", () => {
    expect(qualifyVatExigibility({ ...base, category: null }).status).toBe("information_required");
    expect(qualifyVatExigibility({ ...base, category: "other" }).missing[0]).toMatch(/non couverte/);
    expect(qualifyVatExigibility({ ...base, category: "services", debitOption: null }).missing[0]).toMatch(/débits/);
    expect(qualifyVatExigibility({ ...base, flow: "purchase", category: "services", debitOption: "yes" }).missing[0]).toMatch(/fournisseur/);
    expect(qualifyVatExigibility({ ...base, performance: { kind: "spread", date: null } }).missing[0]).toMatch(/décomptes successifs/);
  });
  it("services sans option, non encaissés à la revue : exigibles à l'encaissement futur, sans date inventée", () => {
    const q = qualifyVatExigibility({ ...base, category: "services", debitOption: "no", settlements: { status: "complete", items: [{ id: "E1", date: "2026-04-20", amountTtc: m("500.00"), kind: "payment", source: "clients" }], reviewDate: "2026-05-15" } });
    expect(q.status).toBe("qualified");
    expect(q.tranches.map((t) => [t.basis, t.date, t.amountTtc.kind === "known" ? t.amountTtc.value.amount : "?"])).toEqual([["payment", "2026-04-20", "500.00"], ["payment_pending", null, "700.00"]]);
  });
  it("encaissements supérieurs au TTC : information requise, aucune exigibilité négative", () => {
    expect(qualifyVatExigibility({ ...base, category: "services", debitOption: "no", settlements: { status: "complete", items: [{ id: "E1", date: "2026-04-20", amountTtc: m("1300.00"), kind: "payment", source: "clients" }], reviewDate: "2026-05-15" } }).status).toBe("information_required");
  });
});

import { describe, expect, it } from "vitest";
import { buildPresentation, classifyInstrument, presentationResolution, type InstrumentDeclaration, type InstrumentTerms } from "../capitaux-presentation";

/** Expectations read in ANC 2024-07 (art. 1er : 314-1, 315-1, 316-1, 1211-16 ; art. 6) and in the PCG 2024 edition (821-1 renvoi *, 167). */
const m = (amount: string) => ({ amount, currency: "EUR" as const });
const eur = (amount: string) => ({ kind: "known" as const, value: m(amount) });
const TERMS: InstrumentTerms = { capitauxPropres: "non", remboursementImposable: "inconnu", partsFixes: "sans_objet", partNonRemboursable: null, avanceFondsPublics: "inconnu", remboursementConditionneSucces: "inconnu", abandonEnCasEchec: "inconnu", interetsConditionnes: "sans_objet", presentationDeclaree: null };
const CITED = { documentVersionId: "source-contrat", importId: "import-contrat", fileName: "contrat.pdf", sha256: "a".repeat(64), pieceRef: "CONTRAT", page: 2 };
const decl = (over: Partial<Omit<InstrumentDeclaration, "terms">> & { terms?: Partial<InstrumentTerms> }): InstrumentDeclaration => ({ id: "I1", label: "Instrument", kind: "autre_instrument", accounts: ["167110"], note: "", citation: CITED, authorId: "p", authoredAt: "2027-01-01T00:00:00Z", ...over, terms: { ...TERMS, ...over.terms } });
const closing = new Map([["167110", m("500.00")], ["167300", m("80.00")], ["164000", m("300.00")], ["104000", m("12.00")], ["229000", m("40.00")]]);
const N = "anc_2024_07" as const;

describe("C09 — régime de présentation daté par le résolveur C04", () => {
  it("exercice 2026 : ANC 2024-07 de plein droit ; exercice 2024 : texte antérieur ; exercice civil 2025 : anticipation ouverte mais non appliquée sans option", () => {
    expect(presentationResolution({ startDate: "2026-01-01", closingDate: "2026-12-31" }, false)).toMatchObject({ regime: "anc_2024_07", textStatus: "mandatory" });
    expect(presentationResolution({ startDate: "2024-01-01", closingDate: "2024-12-31" }, false)).toMatchObject({ regime: "anterieur", textStatus: "not_yet_applicable" });
    const y2025 = presentationResolution({ startDate: "2025-01-01", closingDate: "2025-12-31" }, false);
    expect(y2025).toMatchObject({ regime: "anterieur", textStatus: "anticipation_available", anticipationEffective: false });
    expect(y2025.anticipationWindow).toContain("2025-12-27");
  });
  it("anticipation déclarée : appliquée sur l’exercice en cours au 27/12/2025, sans effet sur un exercice clos avant", () => {
    expect(presentationResolution({ startDate: "2025-01-01", closingDate: "2025-12-31" }, true)).toMatchObject({ regime: "anc_2024_07", textStatus: "anticipation_elected", anticipationEffective: true });
    expect(presentationResolution({ startDate: "2025-01-01", closingDate: "2025-12-26" }, true)).toMatchObject({ regime: "anterieur", textStatus: "not_yet_applicable", anticipationDeclared: true, anticipationEffective: false });
  });
});

describe("C09 — classement par termes contractuels déclarés, jamais par compte", () => {
  it("art. 315-1 : aucun remboursement imposable → fonds non remboursables ; remboursement imposable → dettes, même au compte 1671 (signal, aucun reclassement)", () => {
    expect(classifyInstrument(N, decl({ terms: { remboursementImposable: "non" } }), closing)).toMatchObject({ category: "fonds_non_remboursables", status: "qualifie", amount: eur("500.00"), accountSignals: [] });
    const debt = classifyInstrument(N, decl({ terms: { remboursementImposable: "oui" } }), closing);
    expect(debt).toMatchObject({ category: "dettes", status: "qualifie" });
    expect(debt.accountSignals[0]).toContain("Compte 167110");
  });
  it("art. 315-1 : remboursement partiel — parts fixes explicites → ventilation ; sans parts fixes → dettes pour le tout ; parts inconnues → à qualifier", () => {
    expect(classifyInstrument(N, decl({ terms: { remboursementImposable: "partiel", partsFixes: "oui", partNonRemboursable: m("200.00") } }), closing))
      .toMatchObject({ category: "ventilation", parts: { fondsNonRemboursables: eur("200.00"), dettes: eur("300.00") } });
    expect(classifyInstrument(N, decl({ terms: { remboursementImposable: "partiel", partsFixes: "non" } }), closing)).toMatchObject({ category: "dettes", status: "qualifie" });
    expect(classifyInstrument(N, decl({ terms: { remboursementImposable: "partiel", partsFixes: "inconnu" } }), closing)).toMatchObject({ category: "a_qualifier", status: "incertain" });
    expect(classifyInstrument(N, decl({ terms: { remboursementImposable: "partiel", partsFixes: "oui", partNonRemboursable: m("600.00") } }), closing)).toMatchObject({ category: "a_qualifier", status: "incertain" });
  });
  it("art. 316-1 : avance publique conditionnée au succès avec abandon en cas d’échec → avances conditionnées ; intérêts selon leur propre conditionnement", () => {
    const base = { kind: "avance_conditionnee" as const, accounts: ["167300"], terms: { avanceFondsPublics: "oui" as const, remboursementConditionneSucces: "oui" as const, abandonEnCasEchec: "oui" as const } };
    expect(classifyInstrument(N, decl({ ...base, terms: { ...base.terms, interetsConditionnes: "oui" } }), closing)).toMatchObject({ category: "avances_conditionnees", interest: "autres_fonds_propres", amount: eur("80.00") });
    expect(classifyInstrument(N, decl({ ...base, terms: { ...base.terms, interetsConditionnes: "non" } }), closing)).toMatchObject({ category: "avances_conditionnees", interest: "dettes" });
    expect(classifyInstrument(N, decl({ ...base, terms: { ...base.terms, interetsConditionnes: "inconnu" } }), closing)).toMatchObject({ category: "a_qualifier", status: "incertain" });
    // One unmet condition: no longer an advance under 316-1, examined under 315-1 (here repayable → debt).
    expect(classifyInstrument(N, decl({ ...base, terms: { ...base.terms, abandonEnCasEchec: "non", remboursementImposable: "oui" } }), closing)).toMatchObject({ category: "dettes" });
    expect(classifyInstrument(N, decl({ ...base, terms: { ...base.terms, abandonEnCasEchec: "inconnu" } }), closing)).toMatchObject({ category: "a_qualifier" });
  });
  it("instrument proche du capital : élément de capitaux propres déclaré (art. 1211-10) hors autres fonds propres ; inconnu → à qualifier", () => {
    expect(classifyInstrument(N, decl({ kind: "bons_souscription", accounts: ["104000"], terms: { capitauxPropres: "oui" } }), closing)).toMatchObject({ category: "capitaux_propres", status: "declare", accountSignals: [] });
    expect(classifyInstrument(N, decl({ kind: "obligations_remboursables_actions", terms: { capitauxPropres: "inconnu", remboursementImposable: "non" } }), closing)).toMatchObject({ category: "a_qualifier" });
    // Bonds repayable only in shares: no cash repayment can be imposed → non-repayable funds, never equity by default.
    expect(classifyInstrument(N, decl({ kind: "obligations_remboursables_actions", terms: { remboursementImposable: "non" } }), closing)).toMatchObject({ category: "fonds_non_remboursables" });
  });
  it("droits du concédant présentés en autres fonds propres (art. 314-1, 1212-22) ; pièce non citée → à qualifier", () => {
    expect(classifyInstrument(N, decl({ kind: "droits_concedant", accounts: ["229000"] }), closing)).toMatchObject({ category: "droits_concedant", status: "qualifie", amount: eur("40.00") });
    expect(classifyInstrument(N, decl({ citation: null, terms: { remboursementImposable: "non" } }), closing)).toMatchObject({ category: "a_qualifier", status: "incertain" });
  });
  it("texte antérieur : aucun critère codé ; présentation déclarée par l’entité ou à qualifier", () => {
    expect(classifyInstrument("anterieur", decl({ terms: { presentationDeclaree: "autres_fonds_propres" } }), closing)).toMatchObject({ category: "autres_fonds_propres_declares", status: "declare" });
    expect(classifyInstrument("anterieur", decl({ terms: { remboursementImposable: "non" } }), closing)).toMatchObject({ category: "a_qualifier", status: "incertain" });
  });
  it("compte de la rubrique sans instrument et compte hors balance : total des autres fonds propres inconnu, jamais compté zéro", () => {
    const p = buildPresentation({ period: { startDate: "2026-01-01", closingDate: "2026-12-31" }, anticipationDeclared: false, closingByAccount: closing,
      declarations: [decl({ id: "FNR", terms: { remboursementImposable: "non" } }), decl({ id: "HORS", accounts: ["168999"], terms: { remboursementImposable: "oui" } })],
      otherEquityAccounts: [{ account: "167110", label: "Titres" }, { account: "167300", label: "Avance" }] });
    expect(p.unqualifiedAccounts).toEqual([{ account: "167300", label: "Avance", closing: m("80.00") }]);
    expect(p.otherEquityTotal.kind).toBe("unknown");
    expect(p.lines.find(l => l.id === "fonds_non_remboursables")!.amount).toEqual(eur("500.00"));
    expect(p.debts).toMatchObject({ kind: "unknown" });
  });
});

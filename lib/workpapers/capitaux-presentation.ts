import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { resolveFrenchGaap, type ApplicabilityStatus } from "@/lib/knowledge/french-gaap";
import { knownAmountSchema, moneySchema } from "./model";

/**
 * Debt / other equity funds presentation (C09). The applicable text is dated by the shared C04 resolver
 * (ANC 2024-07: periods opened from 01/01/2026, anticipation on the period in progress at 27/12/2025).
 * The engine never classifies by account number: a category follows only from contractual terms
 * declared by a person and cited to a frozen piece. Unknown terms keep the instrument « à qualifier »,
 * outside both the other-equity total and the debts.
 */

const ANC = "Règlement ANC n° 2024-07 du 6 décembre 2024 (homologué le 26/12/2025, JO du 27/12/2025), art. 1er";
export const PRESENTATION_SOURCES = {
  anc_2024_07: [
    { ref: "PCG art. 314-1", text: ANC, note: "Rubrique « Autres fonds propres » : fonds non remboursables (315-1), avances conditionnées (316-1), droits du concédant (1212-22)." },
    { ref: "PCG art. 315-1", text: ANC, note: "Fonds non remboursables : non inscriptible en capitaux propres (1211-10) et aucun remboursement en trésorerie ou par remise d’un actif imposable à l’émetteur ; ventilation si parts fixes explicites, à défaut dettes pour le tout." },
    { ref: "PCG art. 315-2", text: ANC, note: "Classement réapprécié si les termes contractuels ou les faits et circonstances évoluent." },
    { ref: "PCG art. 316-1", text: ANC, note: "Avances conditionnées : État ou organisme public, remboursement conditionné au succès, abandon prévu en cas d’échec ; intérêts en 1674 seulement s’ils sont eux-mêmes conditionnés." },
    { ref: "PCG art. 1211-10 et 1211-16", text: ANC, note: "Capitaux propres (comptes 10) ; compte 167 réservé aux fonds non remboursables et avances conditionnées, autres emprunts dans les autres subdivisions du compte 16." },
    { ref: "PCG art. 821-1 et 838-18", text: ANC, note: "Modèle de bilan : « Total des autres fonds propres (II) » ; annexe par instrument." },
    { ref: "ANC 2024-07, art. 6", text: "Règlement ANC n° 2024-07, art. 6", note: "Exercices ouverts à compter du 01/01/2026 ; anticipation possible, dès la publication au JO, pour l’exercice en cours à cette date." },
  ],
  anterieur: [
    { ref: "PCG art. 821-1 (renvoi *)", text: "Recueil des normes comptables françaises, version du 1er janvier 2024 (SHA-256 f608f78f…), p. 429 ; même rédaction dans le règlement ANC n° 2022-06", note: "« Le cas échéant », rubrique « Autres fonds propres » entre capitaux propres et provisions (émissions de titres participatifs, avances conditionnées…) : aucun critère de classement." },
    { ref: "PCG art. 932-1 / 1121-1 (compte 167)", text: "Recueil 2024 p. 512 ; ANC 2022-06 art. 1121-1", note: "167 « Emprunts et dettes assortis de conditions particulières » : 1671 titres participatifs, 1674 avances conditionnées de l’État, 1675 emprunts participatifs." },
    { ref: "PCG art. 941-16 / 1211-16", text: "Recueil 2024 p. 538 ; ANC 2022-06 art. 1211-16", note: "Enregistrement au compte 167 ; la présentation au bilan relève du choix documenté de l’entité." },
  ],
} as const;

const tri = z.enum(["oui", "non", "inconnu"]);
export type Tri = z.infer<typeof tri>;
export const INSTRUMENT_KINDS = ["titres_participatifs", "avance_conditionnee", "obligations_convertibles", "obligations_remboursables_actions", "bons_souscription", "pret_participatif", "compte_courant_associe", "droits_concedant", "autre_instrument"] as const;
export type InstrumentKind = typeof INSTRUMENT_KINDS[number];
export const INSTRUMENT_KIND_LABELS: Record<InstrumentKind, string> = {
  titres_participatifs: "Titres participatifs", avance_conditionnee: "Avance de fonds publics", obligations_convertibles: "Obligations convertibles", obligations_remboursables_actions: "Obligations remboursables en actions",
  bons_souscription: "Bons de souscription de titres en capital", pret_participatif: "Prêt participatif", compte_courant_associe: "Compte courant d’associé", droits_concedant: "Droits du concédant", autre_instrument: "Autre instrument",
};
export const PRESENTATION_CATEGORIES = ["capitaux_propres", "fonds_non_remboursables", "avances_conditionnees", "droits_concedant", "autres_fonds_propres_declares", "dettes", "ventilation", "a_qualifier"] as const;
export type PresentationCategory = typeof PRESENTATION_CATEGORIES[number];
export const PRESENTATION_CATEGORY_LABELS: Record<PresentationCategory, string> = {
  capitaux_propres: "Capitaux propres (déclaré, art. 1211-10)", fonds_non_remboursables: "Fonds non remboursables", avances_conditionnees: "Avances conditionnées", droits_concedant: "Droits du concédant",
  autres_fonds_propres_declares: "Autres fonds propres (présentation déclarée)", dettes: "Dettes", ventilation: "Ventilé : fonds non remboursables et dettes", a_qualifier: "À qualifier",
};

/** Contractual terms as declared by a person; never inferred from an account, a label or an amount. */
export const instrumentTermsSchema = z.object({
  /** The instrument is an equity element under art. 1211-10 (capital, BSA meeting the 1211-10 conditions…). */
  capitauxPropres: tri,
  /** A cash or asset repayment can be imposed on the issuer by the holder, a third party or an event outside its control (liquidation and repayment in equity instruments excluded). */
  remboursementImposable: z.enum(["oui", "non", "partiel", "inconnu"]),
  /** Only for a partial repayment: fixed parts explicitly set by the contractual terms. */
  partsFixes: z.enum(["oui", "non", "inconnu", "sans_objet"]),
  partNonRemboursable: moneySchema.nullable(),
  /** Advance terms (art. 316-1). */
  avanceFondsPublics: tri, remboursementConditionneSucces: tri, abandonEnCasEchec: tri, interetsConditionnes: z.enum(["oui", "non", "inconnu", "sans_objet"]),
  /** Presentation declared by the entity for a period read under the text preceding ANC 2024-07. */
  presentationDeclaree: z.enum(["autres_fonds_propres", "dettes", "capitaux_propres"]).nullable(),
}).strict();
export type InstrumentTerms = z.infer<typeof instrumentTermsSchema>;
const slug = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const account = z.string().trim().min(1).max(40);
const text = z.string().trim().max(4000);
export const instrumentDraftSchema = z.object({
  id: slug, label: z.string().trim().min(1).max(300), kind: z.enum(INSTRUMENT_KINDS), accounts: z.array(account).max(20),
  terms: instrumentTermsSchema, note: text, citation: z.object({ documentId: z.string().min(1).max(200), page: z.number().int().positive().max(10000).optional() }).strict().nullable(),
}).strict();
export type InstrumentDraft = z.infer<typeof instrumentDraftSchema>;
/** Server-stamped declaration: the cited piece, its version and page are resolved from the frozen sources. */
export const instrumentDeclarationSchema = instrumentDraftSchema.omit({ citation: true }).extend({
  citation: z.object({ documentVersionId: z.string().min(1), importId: z.string().min(1), fileName: z.string().min(1), sha256: z.string().min(1), pieceRef: z.string().optional(), page: z.number().int().positive().optional() }).strict().nullable(),
  authorId: z.string().min(1), authoredAt: z.string().min(1),
}).strict();
export type InstrumentDeclaration = z.infer<typeof instrumentDeclarationSchema>;

export type PresentationRegime = "anc_2024_07" | "anterieur" | "unknown";
export const presentationResolutionSchema = z.object({
  regime: z.enum(["anc_2024_07", "anterieur", "unknown"]), textStatus: z.string().min(1), reasons: z.array(z.string()), anticipationDeclared: z.boolean(), anticipationEffective: z.boolean(),
  anticipationWindow: z.string().nullable(), articles: z.array(z.string()), meaning: z.string().min(1),
}).strict();
export type PresentationResolution = z.infer<typeof presentationResolutionSchema>;

/** Which text governs the other-equity presentation of a period, from the shared resolver (C04). */
export function presentationResolution(period: { startDate: string; closingDate: string }, anticipationDeclared: boolean): PresentationResolution {
  const resolved = resolveFrenchGaap({ startDate: period.startDate, closingDate: period.closingDate, anticipated: anticipationDeclared ? ["anc-2024-07"] : [] });
  const text = resolved.texts.find(t => t.textId === "anc-2024-07");
  const status: ApplicabilityStatus = text?.status ?? "unknown";
  const regime: PresentationRegime = status === "mandatory" || status === "anticipation_elected" ? "anc_2024_07" : status === "not_yet_applicable" || status === "anticipation_available" ? "anterieur" : "unknown";
  const window = text?.anticipationWindow ? `Anticipation ouverte depuis le ${text.anticipationWindow.from} (exercice en cours à la publication)` : null;
  const meaning = regime === "anc_2024_07"
    ? (status === "anticipation_elected" ? "ANC 2024-07 appliqué par anticipation déclarée : critères des art. 315-1 et 316-1." : "ANC 2024-07 applicable de plein droit : critères des art. 315-1 et 316-1.")
    : regime === "anterieur" ? "Texte antérieur à ANC 2024-07 : rubrique « Autres fonds propres » le cas échéant, sans critère de classement ; la présentation retenue par l’entité doit être déclarée et citée."
      : "Période invalide : régime de présentation non déterminé.";
  return { regime, textStatus: status, reasons: text?.reasons ?? [], anticipationDeclared, anticipationEffective: status === "anticipation_elected", anticipationWindow: window,
    articles: (regime === "anc_2024_07" ? PRESENTATION_SOURCES.anc_2024_07 : regime === "anterieur" ? PRESENTATION_SOURCES.anterieur : []).map(s => s.ref), meaning };
}

export const classifiedInstrumentSchema = z.object({
  id: slug, label: z.string(), kind: z.enum(INSTRUMENT_KINDS), accounts: z.array(z.string()), category: z.enum(PRESENTATION_CATEGORIES), status: z.enum(["qualifie", "declare", "incertain"]),
  amount: knownAmountSchema, parts: z.object({ fondsNonRemboursables: knownAmountSchema, dettes: knownAmountSchema }).strict().nullable(),
  interest: z.enum(["autres_fonds_propres", "dettes", "a_qualifier", "sans_objet"]),
  reasons: z.array(z.string()), missing: z.array(z.string()), articles: z.array(z.string()), accountSignals: z.array(z.string()),
  citation: instrumentDeclarationSchema.shape.citation, authorId: z.string(), authoredAt: z.string(), note: z.string(),
}).strict();
export type ClassifiedInstrument = z.infer<typeof classifiedInstrumentSchema>;

const ACCOUNT_PREFIX: Partial<Record<PresentationCategory, string[]>> = { fonds_non_remboursables: ["1671"], avances_conditionnees: ["1673", "1674"], droits_concedant: ["229"], capitaux_propres: ["10"] };
/** A declared category inconsistent with the account is signalled, never reclassified. */
function accountSignals(category: PresentationCategory, accounts: string[]): string[] {
  const expected = ACCOUNT_PREFIX[category];
  if (expected) return accounts.filter(a => !expected.some(p => a.startsWith(p))).map(a => `Compte ${a} : classement déclaré « ${PRESENTATION_CATEGORY_LABELS[category]} » attendu en ${expected.join(" / ")} (art. 1211-16) — signal, aucun reclassement.`);
  if (category === "dettes") return accounts.filter(a => a.startsWith("167")).map(a => `Compte ${a} : le compte 167 est réservé aux art. 314-1 à 316-1 ; un instrument déclaré en dettes y figure — signal, aucun reclassement.`);
  return [];
}

/** Classification of one declared instrument for a regime; amount = closing balance of its accounts when every account is in the frozen balance. */
export function classifyInstrument(regime: PresentationRegime, d: InstrumentDeclaration, closingByAccount: Map<string, Money>): ClassifiedInstrument {
  const t = d.terms, reasons: string[] = [], missing: string[] = [], articles: string[] = [];
  const amounts = d.accounts.map(a => closingByAccount.get(a));
  const amount: KnownAmount = !d.accounts.length ? { kind: "unknown", reason: "Aucun compte déclaré pour l’instrument" }
    : amounts.every(Boolean) ? { kind: "known", value: money(amounts.reduce((s, m) => s + cents(m!), 0n)) } : { kind: "unknown", reason: "Compte absent de la balance de clôture figée" };
  let category: PresentationCategory = "a_qualifier", status: ClassifiedInstrument["status"] = "incertain", parts: ClassifiedInstrument["parts"] = null;
  let interest: ClassifiedInstrument["interest"] = "sans_objet";
  if (!d.citation) missing.push("Pièce contractuelle citée (contrat, convention, PV) et sa version");
  if (regime === "unknown") { reasons.push("Régime de présentation non déterminé pour la période."); }
  else if (regime === "anterieur") {
    articles.push(...PRESENTATION_SOURCES.anterieur.map(s => s.ref));
    if (!t.presentationDeclaree) missing.push("Présentation retenue par l’entité (texte antérieur à ANC 2024-07 : aucun critère de classement codé)");
    else {
      category = t.presentationDeclaree === "autres_fonds_propres" ? "autres_fonds_propres_declares" : t.presentationDeclaree;
      status = "declare";
      reasons.push("Présentation déclarée par l’entité sous le texte antérieur à ANC 2024-07 ; PROBANT n’en vérifie pas le bien-fondé.", "ANC 2024-07 s’applique aux exercices ouverts dès le 01/01/2026 : classement à réapprécier selon les art. 315-1 et 316-1.");
    }
  } else {
    articles.push("PCG art. 314-1");
    if (d.kind === "droits_concedant") {
      category = "droits_concedant"; status = "qualifie"; articles.push("PCG art. 1212-22");
      reasons.push("Droits du concédant présentés dans la rubrique « Autres fonds propres » (art. 314-1 et 1212-22).");
    } else if (t.capitauxPropres === "oui") {
      category = "capitaux_propres"; status = "declare"; articles.push("PCG art. 1211-10");
      reasons.push("Instrument déclaré élément de capitaux propres (art. 1211-10) : hors rubrique « Autres fonds propres » ; vérifier les conditions du texte (ex. bons de souscription).");
    } else if (t.capitauxPropres === "inconnu") {
      missing.push("Inscription ou non en capitaux propres selon l’art. 1211-10");
    } else {
      const advance = [t.avanceFondsPublics, t.remboursementConditionneSucces, t.abandonEnCasEchec];
      const advanceDeclared = d.kind === "avance_conditionnee" || advance.some(v => v !== "inconnu");
      if (advanceDeclared && advance.every(v => v === "oui")) {
        category = "avances_conditionnees"; status = "qualifie"; articles.push("PCG art. 316-1");
        reasons.push("Avance de l’État ou d’un organisme public, remboursement conditionné au succès et abandon prévu en cas d’échec (art. 316-1) : principal en 1673.");
        interest = t.interetsConditionnes === "oui" ? "autres_fonds_propres" : t.interetsConditionnes === "non" ? "dettes" : t.interetsConditionnes === "inconnu" ? "a_qualifier" : "sans_objet";
        if (interest === "a_qualifier") missing.push("Conditionnement des intérêts (1674 si conditionnés, dettes sinon)");
      } else if (advanceDeclared && advance.some(v => v === "inconnu") && !advance.some(v => v === "non")) {
        missing.push("Conditions de l’avance (art. 316-1) : origine publique, remboursement conditionné au succès, abandon en cas d’échec");
      } else {
        if (advanceDeclared) reasons.push("Au moins une condition de l’art. 316-1 n’est pas remplie : examen au titre de l’art. 315-1.");
        articles.push("PCG art. 315-1");
        if (t.remboursementImposable === "non") {
          category = "fonds_non_remboursables"; status = "qualifie";
          reasons.push("Non inscriptible en capitaux propres et aucun remboursement en trésorerie ou par remise d’un actif imposable à l’émetteur (art. 315-1) : principal en 1671.");
        } else if (t.remboursementImposable === "oui") {
          category = "dettes"; status = "qualifie";
          reasons.push("Remboursement en trésorerie ou par remise d’un actif imposable à l’émetteur : instrument présenté en dettes (art. 315-1 a contrario, art. 1211-16).");
        } else if (t.remboursementImposable === "partiel") {
          if (t.partsFixes === "oui" && t.partNonRemboursable && amount.kind === "known") {
            const total = cents(amount.value), fnr = cents(t.partNonRemboursable);
            if (fnr < 0n || fnr > total) missing.push("Part non remboursable comprise entre 0 et le principal de clôture");
            else { category = "ventilation"; status = "qualifie"; parts = { fondsNonRemboursables: { kind: "known", value: money(fnr) }, dettes: { kind: "known", value: money(total - fnr) } };
              reasons.push("Remboursement imposable sur une part seulement, parts fixes explicites : principal ventilé entre fonds non remboursables et dettes (art. 315-1)."); }
          } else if (t.partsFixes === "non") {
            category = "dettes"; status = "qualifie";
            reasons.push("Remboursement partiel sans parts fixes explicites : l’intégralité du principal est inscrite en dettes (art. 315-1).");
          } else missing.push(t.partsFixes === "oui" ? "Part non remboursable chiffrée et principal de clôture établi" : "Parts fixes explicitement prévues ou non par les termes contractuels");
        } else missing.push("Remboursement en trésorerie ou par remise d’un actif imposable ou non à l’émetteur (art. 315-1)");
      }
    }
  }
  if (missing.length && status !== "incertain") { status = "incertain"; category = "a_qualifier"; parts = null; }
  if (status === "incertain") { category = "a_qualifier"; parts = null; if (!reasons.length) reasons.push("Modalités contractuelles insuffisantes : instrument à qualifier, exclu des autres fonds propres comme des dettes."); }
  return { id: d.id, label: d.label, kind: d.kind, accounts: d.accounts, category, status, amount, parts, interest, reasons, missing, articles: [...new Set(articles)],
    accountSignals: regime === "anc_2024_07" && status !== "incertain" ? accountSignals(category, d.accounts) : [], citation: d.citation, authorId: d.authorId, authoredAt: d.authoredAt, note: d.note };
}

export const presentationSchema = z.object({
  resolution: presentationResolutionSchema,
  instruments: z.array(classifiedInstrumentSchema),
  /** Accounts mapped to the other-equity rubric of the frozen balance and covered by no declaration. */
  unqualifiedAccounts: z.array(z.object({ account: z.string(), label: z.string(), closing: moneySchema.nullable() }).strict()),
  lines: z.array(z.object({ id: z.enum(["fonds_non_remboursables", "avances_conditionnees", "droits_concedant", "autres_fonds_propres_declares"]), label: z.string(), amount: knownAmountSchema, instrumentIds: z.array(z.string()) }).strict()),
  otherEquityTotal: knownAmountSchema, debts: knownAmountSchema, toQualify: z.number().int().nonnegative(),
  sources: z.array(z.object({ ref: z.string(), text: z.string(), note: z.string() }).strict()), limitations: z.array(z.string()),
}).strict();
export type Presentation = z.infer<typeof presentationSchema>;

/** Sum of established amounts; not-applicable members are left out, one unknown keeps the sum unknown, an empty population is not applicable (never zero). */
function sum(values: KnownAmount[], reason: string, empty: string): KnownAmount {
  const present = values.filter(v => v.kind !== "not_applicable");
  if (!present.length) return { kind: "not_applicable", reason: empty };
  return present.every(v => v.kind === "known") ? { kind: "known", value: money(present.reduce((s, v) => s + cents((v as { value: Money }).value), 0n)) } : { kind: "unknown", reason };
}
const LINE_LABELS = { fonds_non_remboursables: "Fonds non remboursables", avances_conditionnees: "Avances conditionnées", droits_concedant: "Droits du concédant", autres_fonds_propres_declares: "Autres fonds propres (présentation déclarée)" } as const;

/** Presentation of the other-equity rubric: totals only on qualified amounts; any account or instrument to qualify keeps the rubric total unknown. */
export function buildPresentation(input: { period: { startDate: string; closingDate: string }; anticipationDeclared: boolean; declarations: InstrumentDeclaration[];
  closingByAccount: Map<string, Money>; otherEquityAccounts: { account: string; label: string }[] }): Presentation {
  const resolution = presentationResolution(input.period, input.anticipationDeclared);
  const instruments = input.declarations.map(d => classifyInstrument(resolution.regime, d, input.closingByAccount)).sort((a, b) => a.id < b.id ? -1 : 1);
  const covered = new Set(input.declarations.flatMap(d => d.accounts));
  const unqualifiedAccounts = input.otherEquityAccounts.filter(a => !covered.has(a.account)).map(a => ({ account: a.account, label: a.label, closing: input.closingByAccount.get(a.account) ?? null }));
  const lineIds = resolution.regime === "anc_2024_07" ? ["fonds_non_remboursables", "avances_conditionnees", "droits_concedant"] as const : resolution.regime === "anterieur" ? ["autres_fonds_propres_declares"] as const : [] as const;
  const lines = lineIds.map(id => {
    const members = instruments.filter(i => i.category === id || (id === "fonds_non_remboursables" && i.category === "ventilation"));
    const amounts = members.map(i => i.category === "ventilation" ? i.parts!.fondsNonRemboursables : i.amount);
    return { id, label: LINE_LABELS[id], amount: sum(amounts, "Montant d’un instrument non établi par la balance figée", "Aucun instrument déclaré dans cette ligne"), instrumentIds: members.map(i => i.id) };
  });
  const uncertainInRubric = instruments.filter(i => i.status === "incertain").length + unqualifiedAccounts.length;
  const otherEquityTotal: KnownAmount = uncertainInRubric ? { kind: "unknown", reason: `${uncertainInRubric} instrument(s) ou compte(s) à qualifier : total des autres fonds propres non établi` }
    : resolution.regime === "unknown" ? { kind: "unknown", reason: "Régime de présentation non déterminé" }
      : sum(lines.map(l => l.amount), "Montant d’une ligne non établi", "Aucun autre fonds propre déclaré ni compte rattaché à la rubrique");
  const debtMembers = instruments.filter(i => i.category === "dettes" || i.category === "ventilation");
  const debts = sum(debtMembers.map(i => i.category === "ventilation" ? i.parts!.dettes : i.amount), "Montant d’un instrument présenté en dettes non établi", "Aucun instrument déclaré présenté en dettes");
  const sources = resolution.regime === "anc_2024_07" ? [...PRESENTATION_SOURCES.anc_2024_07] : resolution.regime === "anterieur" ? [...PRESENTATION_SOURCES.anterieur] : [];
  return { resolution, instruments, unqualifiedAccounts, lines, otherEquityTotal, debts, toQualify: uncertainInRubric, sources: sources.map(s => ({ ...s })),
    limitations: [
      "Aucun classement déduit d’un numéro de compte, d’un libellé ou d’un montant : tous les comptes 16 ne sont pas des dettes, ni les instruments proches du capital des capitaux propres.",
      "Les termes contractuels sont déclarés par une personne et cités à une pièce figée ; PROBANT ne lit pas le contrat.",
      "Les dettes présentées ici sont celles des instruments déclarés ; elles n’entrent pas dans les capitaux propres et ne constituent pas un inventaire des emprunts.",
      "Le texte d’ANC 2024-07 ne prévoit pas de disposition propre de première application : le traitement de la transition n’est pas tranché ici.",
    ] };
}

import { applicableArticle, frenchGaapText, type FrenchGaapTextId } from "@/lib/knowledge/french-gaap";

/**
 * Emprunts (C13) — règles versionnées, browser-safe.
 *
 * Trois choses distinctes, jamais confondues :
 * - le TEXTE applicable à l'exercice (PCG au 01/01/2024, ANC 2022-06, PCG consolidé au 01/01/2026),
 *   résolu par le résolveur partagé C04 (`financial_debts`) ;
 * - ce que ce texte dit des comptes 16, lu dans le PDF officiel (articles cités ci-dessous) ;
 * - les choix de méthode PROBANT (correspondance nature → intitulé de poste, conventions de jours
 *   reconnues, rattachement d'une échéance à une version), présentés comme tels.
 *
 * Aucune règle n'est tirée d'un numéro de compte : la nature de l'instrument est déclarée et citée ;
 * un compte incohérent avec cette nature est signalé, jamais reclassé.
 */
export const LOAN_RULE_VERSION = "1.0.0";

/** Natures d'instrument déclarées au contrat. Les natures proches des fonds propres passent par le moteur C09. */
export const LOAN_NATURES = ["emprunt_bancaire", "autre_emprunt", "emprunt_participatif", "avance_conditionnee", "titres_participatifs", "emprunt_obligataire",
  "obligations_convertibles", "obligations_remboursables_actions", "compte_courant_associe", "concours_bancaires", "credit_bail", "autre_instrument"] as const;
export type LoanNature = typeof LOAN_NATURES[number];
export const LOAN_NATURE_LABELS: Record<LoanNature, string> = {
  emprunt_bancaire: "Emprunt auprès d’un établissement de crédit", autre_emprunt: "Autre emprunt", emprunt_participatif: "Emprunt (prêt) participatif",
  avance_conditionnee: "Avance conditionnée", titres_participatifs: "Titres participatifs", emprunt_obligataire: "Emprunt obligataire",
  obligations_convertibles: "Obligations convertibles", obligations_remboursables_actions: "Obligations remboursables en actions", compte_courant_associe: "Compte courant d’associé",
  concours_bancaires: "Concours bancaires courants", credit_bail: "Crédit-bail", autre_instrument: "Autre instrument",
};
/** Seules ces natures entrent dans le calcul simple (pont, échéances, intérêts). */
export const SIMPLE_NATURES: readonly LoanNature[] = ["emprunt_bancaire", "autre_emprunt"];
/** Natures dont le classement dettes / autres fonds propres est établi par le moteur C09 (termes contractuels déclarés). */
export const C09_NATURES = { emprunt_participatif: "pret_participatif", avance_conditionnee: "avance_conditionnee", titres_participatifs: "titres_participatifs",
  obligations_convertibles: "obligations_convertibles", obligations_remboursables_actions: "obligations_remboursables_actions", compte_courant_associe: "compte_courant_associe", autre_instrument: "autre_instrument" } as const;
export type C09Nature = keyof typeof C09_NATURES;
export const isC09Nature = (n: LoanNature): n is C09Nature => n in C09_NATURES;

/** Cas complexes exclus du calcul et nommés (aucune valorisation, aucun taux effectif). */
export const LOAN_EXCLUSIONS: Record<string, string> = {
  emprunt_obligataire: "Emprunt obligataire : primes de remboursement (compte 169) et conditions d’émission non couvertes par le calcul simple.",
  obligations_convertibles: "Obligations convertibles : conversion et classement à établir par le moteur des autres fonds propres ; aucun calcul d’intérêts.",
  obligations_remboursables_actions: "Obligations remboursables en actions : classement à établir par le moteur des autres fonds propres ; aucun calcul d’intérêts.",
  emprunt_participatif: "Prêt participatif : rémunération participative non couverte par le calcul simple ; classement par termes contractuels déclarés.",
  avance_conditionnee: "Avance conditionnée : remboursement conditionnel, hors calcul simple ; classement par termes contractuels déclarés.",
  titres_participatifs: "Titres participatifs : rémunération variable, hors calcul simple ; classement par termes contractuels déclarés.",
  compte_courant_associe: "Compte courant d’associé : hors calcul simple ; classement par termes contractuels déclarés.",
  concours_bancaires: "Concours bancaires courants : non inscrits au compte 164 (compte 519, cycle Trésorerie).",
  credit_bail: "Crédit-bail : contrat hors périmètre de la feuille Emprunts.",
  autre_instrument: "Autre instrument : hors calcul simple ; classement par termes contractuels déclarés.",
  currency: "Devise autre que l’euro : conversion non couverte.",
  fees: "Frais non réglés séparément (capitalisés, étalés ou intégrés au taux) : non couverts ; aucun taux effectif calculé.",
  bounds: "Plancher ou plafond d’index : non couvert.",
  day_count: "Convention de jours non reconnue par la méthode : calcul bloqué.",
  derivative: "Instruments dérivés de couverture (swaps, caps) : hors périmètre.",
};

/** Conventions de jours reconnues : paramètres du contrat, définies ici telles qu’appliquées (méthode PROBANT). */
export const DAY_COUNTS = ["ACT/360", "ACT/365F", "30/360", "30E/360"] as const;
export type DayCount = typeof DAY_COUNTS[number];
export const DAY_COUNT_DEFINITIONS: Record<DayCount, string> = {
  "ACT/360": "Jours calendaires réels de l’intervalle / 360.",
  "ACT/365F": "Jours calendaires réels de l’intervalle / 365, y compris en année bissextile.",
  "30/360": "Mois de 30 jours, année de 360 jours : J1 = 30 si J1 = 31 ; J2 = 30 si J2 = 31 et J1 ajusté ≥ 30.",
  "30E/360": "Mois de 30 jours, année de 360 jours : J1 = min(J1, 30) ; J2 = min(J2, 30).",
};
export const INTERVAL_CONVENTION = "start_included_end_excluded;principal_effective_on_event_date" as const;
export const INTERVAL_CONVENTION_LABEL = "Départ inclus, fin exclue ; un mouvement de principal prend effet à sa date.";

const day = (date: string) => Date.parse(date + "T00:00:00Z") / 86_400_000;
/** Nombre de jours d’un intervalle [start, end) selon la convention nommée au contrat. */
export function contractualDays(start: string, end: string, convention: DayCount): number {
  if (!(start < end)) throw new Error("LOAN_INTEREST_INTERVAL_INVALID");
  if (convention === "ACT/360" || convention === "ACT/365F") return day(end) - day(start);
  const [y1, m1, d1raw] = start.split("-").map(Number), [y2, m2, d2raw] = end.split("-").map(Number);
  let d1 = d1raw, d2 = d2raw;
  if (convention === "30E/360") { d1 = Math.min(d1, 30); d2 = Math.min(d2, 30); }
  else { if (d1 === 31) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; }
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
}
export const dayBase = (convention: DayCount) => convention === "ACT/365F" ? 365 : 360;

/** Taux en pourcentage, au plus 6 décimales, converti en millionièmes de point (entier exact). */
export const RATE_PATTERN = /^-?(0|[1-9]\d{0,2})(\.\d{1,6})?$/;
export function ratePpm(percent: string): bigint {
  if (!RATE_PATTERN.test(percent)) throw new Error("LOAN_RATE_FORMAT_INVALID");
  const negative = percent.startsWith("-"), [whole, fraction = ""] = percent.replace("-", "").split(".");
  const value = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  return negative ? -value : value;
}
export function formatRatePpm(value: bigint): string {
  const negative = value < 0n, abs = negative ? -value : value, whole = abs / 1_000_000n, fraction = String(abs % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + whole + (fraction ? "," + fraction : "") + " %";
}

/**
 * Comptes et intitulés de poste par texte applicable, lus dans les PDF officiels de l'ANC (empreintes du registre C04).
 * `principal` / `accrued` : racines de comptes prévues par la liste des comptes du texte ; `rubric` : intitulé du poste
 * du modèle de bilan (art. 821-1) correspondant par son libellé à la nature déclarée — correspondance de méthode PROBANT,
 * le PCG ne fournissant pas de table comptes → postes.
 */
export type LoanRuleTextId = "pcg-2024" | "anc-2022-06" | "pcg-2026-01-01";
interface NatureAccounts { principal: string[]; accrued: string[]; rubric: string }
export interface LoanRuleSet {
  textId: LoanRuleTextId; label: string; articles: { ref: string; locator: string; note: string }[];
  natures: Partial<Record<LoanNature, NatureAccounts>>; accruedRule: string; otherEquityRubric: string;
}
const OTHER_DEBTS = "Emprunts et dettes financières diverses";
export const LOAN_RULE_SETS: Record<LoanRuleTextId, LoanRuleSet> = {
  "pcg-2024": {
    textId: "pcg-2024", label: "PCG (règlement ANC n° 2014-03) — recueil au 1er janvier 2024",
    articles: [
      { ref: "PCG art. 821-1", locator: "recueil 2024, article p. 427, passif p. 429 (pages PDF 428 et 430)", note: "Passif : « Emprunts obligataires convertibles », « Autres emprunts obligataires », « Emprunts et dettes auprès des établissements de crédit », « Emprunts et dettes financières diverses (dont emprunts participatifs) » ; « le cas échéant », rubrique « Autres fonds propres » (titres participatifs, avances conditionnées…)." },
      { ref: "PCG art. 932-1", locator: "recueil 2024, p. 511 (page PDF 512)", note: "Comptes 161, 163, 164, 165, 166, 167 (1671 titres participatifs, 1674 avances conditionnées de l’État, 1675 emprunts participatifs), 168 (1681 autres emprunts ; 1688 intérêts courus, dont 16884 sur emprunts auprès des établissements de crédit)." },
      { ref: "PCG art. 941-16", locator: "recueil 2024, p. 536-537 (pages PDF 537-538)", note: "« Les intérêts courus sur emprunts et dettes sont regroupés dans une subdivision du compte 168 » ; concours bancaires courants hors compte 164 (compte 519)." },
    ],
    natures: {
      emprunt_bancaire: { principal: ["164"], accrued: ["16884"], rubric: "Emprunts et dettes auprès des établissements de crédit" },
      autre_emprunt: { principal: ["1681"], accrued: ["16888"], rubric: OTHER_DEBTS },
      emprunt_participatif: { principal: ["1675"], accrued: ["16887"], rubric: OTHER_DEBTS + " (dont emprunts participatifs)" },
      avance_conditionnee: { principal: ["1674"], accrued: ["16887"], rubric: "Autres fonds propres le cas échéant (présentation déclarée)" },
      titres_participatifs: { principal: ["1671"], accrued: ["16887"], rubric: "Autres fonds propres le cas échéant (présentation déclarée)" },
      emprunt_obligataire: { principal: ["163"], accrued: ["16883"], rubric: "Autres emprunts obligataires" },
      obligations_convertibles: { principal: ["161"], accrued: ["16881"], rubric: "Emprunts obligataires convertibles" },
      concours_bancaires: { principal: ["519"], accrued: [], rubric: "Hors compte 164 (compte 519)" },
    },
    accruedRule: "Intérêts courus regroupés dans une subdivision du compte 168 (art. 941-16).",
    otherEquityRubric: "Rubrique « Autres fonds propres » le cas échéant (renvoi * de l’art. 821-1), sans critère de classement.",
  },
  "anc-2022-06": {
    textId: "anc-2022-06", label: "Règlement ANC n° 2022-06 (exercices ouverts à compter du 01/01/2025)",
    articles: [
      { ref: "PCG art. 821-1", locator: "règlement ANC 2022-06, article p. 7, passif p. 10/106", note: "Passif : mêmes postes de dettes financières ; « (2) Dont emprunts participatifs » ; rubrique « Autres fonds propres » le cas échéant." },
      { ref: "PCG art. 1121-1", locator: "règlement ANC 2022-06, p. 42-43/106", note: "Intérêts courus dans une subdivision de chaque compte : 1648 (établissements de crédit), 16748 (avances conditionnées), 16758 (emprunts participatifs), 1688 (autres emprunts et dettes)." },
      { ref: "PCG art. 1211-16", locator: "règlement ANC 2022-06, p. 70-71/106", note: "« Les intérêts courus sur emprunts et dettes sont inscrits dans une subdivision du compte des emprunts ou des dettes auxquels les intérêts courus se rapportent » ; concours bancaires courants au compte 519 ; 1671 / 1674 / 1675." },
    ],
    natures: {
      emprunt_bancaire: { principal: ["164"], accrued: ["1648"], rubric: "Emprunts et dettes auprès des établissements de crédit" },
      autre_emprunt: { principal: ["1681"], accrued: ["1688"], rubric: OTHER_DEBTS },
      emprunt_participatif: { principal: ["1675"], accrued: ["16758"], rubric: OTHER_DEBTS + " (dont emprunts participatifs)" },
      avance_conditionnee: { principal: ["1674"], accrued: ["16748"], rubric: "Autres fonds propres le cas échéant (présentation déclarée)" },
      titres_participatifs: { principal: ["1671"], accrued: ["16718"], rubric: "Autres fonds propres le cas échéant (présentation déclarée)" },
      emprunt_obligataire: { principal: ["163"], accrued: ["1638"], rubric: "Autres emprunts obligataires" },
      obligations_convertibles: { principal: ["161"], accrued: ["1618"], rubric: "Emprunts obligataires convertibles" },
      concours_bancaires: { principal: ["519"], accrued: [], rubric: "Hors compte 164 (compte 519)" },
    },
    accruedRule: "Intérêts courus dans une subdivision du compte de l’emprunt auquel ils se rapportent (art. 1211-16).",
    otherEquityRubric: "Rubrique « Autres fonds propres » le cas échéant, sans critère de classement (texte antérieur à ANC 2024-07).",
  },
  "pcg-2026-01-01": {
    textId: "pcg-2026-01-01", label: "PCG consolidé au 1er janvier 2026 (intègre ANC 2022-06 et ANC 2024-07)",
    articles: [
      { ref: "PCG art. 821-1", locator: "PCG au 01/01/2026, article p. 96, passif p. 98/183", note: "Passif : « Total des autres fonds propres (II) » (fonds non remboursables, avances conditionnées, droits du concédant) ; dettes financières inchangées, « (2) Dont emprunts participatifs »." },
      { ref: "PCG art. 1121-1", locator: "PCG au 01/01/2026, p. 134/183", note: "164 « si non inscrits dans le compte 167 » (1648 intérêts courus) ; 167 fonds non remboursables (16711 titres participatifs, 16712 autres) et avances conditionnées (1673 principal, 1674 intérêts courus) ; 1682 emprunts participatifs ; 1688." },
      { ref: "PCG art. 1211-16", locator: "PCG au 01/01/2026, p. 155-156/183", note: "Compte 167 en application des art. 314-1 à 316-1 ; autres emprunts dans les autres subdivisions du compte 16 selon leur nature ; intérêts courus dans une subdivision du compte auquel ils se rapportent ; emprunts participatifs au compte 1682 ; concours bancaires courants au compte 519." },
    ],
    natures: {
      emprunt_bancaire: { principal: ["164"], accrued: ["1648"], rubric: "Emprunts et dettes auprès des établissements de crédit" },
      autre_emprunt: { principal: ["1681"], accrued: ["1688"], rubric: OTHER_DEBTS },
      emprunt_participatif: { principal: ["1682"], accrued: ["1688"], rubric: OTHER_DEBTS + " (dont emprunts participatifs)" },
      emprunt_obligataire: { principal: ["163"], accrued: ["1638"], rubric: "Autres emprunts obligataires" },
      obligations_convertibles: { principal: ["161"], accrued: ["1618"], rubric: "Emprunts obligataires convertibles" },
      concours_bancaires: { principal: ["519"], accrued: [], rubric: "Hors compte 164 (compte 519)" },
    },
    accruedRule: "Intérêts courus dans une subdivision du compte de l’emprunt (art. 1211-16) ; 1674 pour les intérêts conditionnés d’une avance conditionnée, 1688 sinon.",
    otherEquityRubric: "Rubrique « Autres fonds propres » : fonds non remboursables (315-1), avances conditionnées (316-1), droits du concédant — classement par le moteur C09.",
  },
};

export interface LoanRuleResolution { textId: LoanRuleTextId | null; resolvedTextId: FrenchGaapTextId | null; label: string; articles: LoanRuleSet["articles"]; editions: { url: string; sha256: string | null }[]; reason: string }
/**
 * Texte applicable aux comptes 16 pour la période, via le résolveur partagé C04 ; aucune anticipation déclarée par cette feuille.
 * ANC 2026-03 (exercices ouverts dès 2027) ne modifie ni le compte 16 ni le passif de l'art. 821-1 (lu le 15/10/2026) : ses
 * exercices gardent les règles du PCG consolidé au 01/01/2026.
 */
export function resolveLoanRules(period: { startDate: string; closingDate: string }): LoanRuleResolution {
  const resolved = applicableArticle("financial_debts", { startDate: period.startDate, closingDate: period.closingDate });
  const id = resolved?.textId ?? null;
  const setId: LoanRuleTextId | null = id === "pcg-2024" || id === "anc-2022-06" || id === "pcg-2026-01-01" ? id : id === "anc-2026-03" ? "pcg-2026-01-01" : null;
  if (id && setId) {
    const set = LOAN_RULE_SETS[setId], editions = [...new Set([setId, id])].flatMap(t => frenchGaapText(t as FrenchGaapTextId).editions.map(e => ({ url: e.url, sha256: e.sha256 })));
    return { textId: setId, resolvedTextId: id, label: id === "anc-2026-03" ? set.label + " — comptes 16 inchangés par ANC 2026-03" : set.label, articles: set.articles, editions,
      reason: "Texte appliqué à un exercice ouvert le " + period.startDate + " (résolveur C04, sujet « financial_debts »)." };
  }
  return { textId: null, resolvedTextId: id, label: "Texte non déterminé", articles: [], editions: [], reason: "Aucun texte lu ne couvre cette période pour les comptes 16 : comptes et postes non vérifiés." };
}

/** Racines attendues pour une nature ; null si le texte ne prévoit rien pour elle ou s’il n’est pas déterminé. */
export function expectedAccounts(textId: LoanRuleTextId | null, nature: LoanNature): NatureAccounts | null {
  return textId ? LOAN_RULE_SETS[textId].natures[nature] ?? null : null;
}
/** Signal d’un compte incohérent avec la nature déclarée — aucun reclassement. */
export function accountSignal(textId: LoanRuleTextId | null, nature: LoanNature, account: string | null, kind: "principal" | "accrued"): string | null {
  const expected = expectedAccounts(textId, nature);
  if (!expected || !account) return null;
  const roots = kind === "principal" ? expected.principal : expected.accrued;
  if (!roots.length || roots.some(r => account.startsWith(r))) return null;
  const article = textId === "pcg-2024" ? "art. 932-1 et 941-16" : "art. 1121-1 et 1211-16";
  return `Compte ${account} : ${kind === "principal" ? "principal" : "intérêts courus"} d’un instrument déclaré « ${LOAN_NATURE_LABELS[nature]} » attendu en ${roots.join(" / ")} (${article}) — signal, aucun reclassement.`;
}

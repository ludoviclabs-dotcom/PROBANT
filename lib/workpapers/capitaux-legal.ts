import { z } from "zod";
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { knownAmountSchema } from "./model";

/**
 * Legal markers of the equity cycle (C09) — arithmetic only, never a legal conclusion.
 * Texts read on Légifrance on 14/10/2026 (versions dated below). For each topic the engine states the
 * applicable article version for the declared social form and the reference date, computes what the
 * sources allow (sourced balances, voted amounts, exact fractions) and raises at most a neutral
 * « à examiner » signal. Qualification, deadlines, nullity or dissolution stay human and legal:
 * no dissolution alert and no deadline are ever computed.
 */
export const SOCIAL_FORMS = ["sarl", "sa", "sas", "sca", "autre"] as const;
export type SocialForm = typeof SOCIAL_FORMS[number];
export const SOCIAL_FORM_LABELS: Record<SocialForm, string> = { sarl: "SARL (y compris à associé unique)", sa: "Société anonyme", sas: "SAS (y compris à associé unique)", sca: "Société en commandite par actions", autre: "Autre forme (SNC, SCS, société civile, GIE…)" };

interface ArticleVersion { from: string; to: string | null; label: string; url: string }
const LF = "https://www.legifrance.gouv.fr/codes/article_lc/";
/** Versions read on Légifrance (14/10/2026); a date before the first version read stays « version non relue ». */
export const LEGAL_ARTICLE_VERSIONS: Record<"L232-10" | "L232-11" | "L223-42" | "L225-248" | "L227-1", ArticleVersion[]> = {
  "L232-10": [
    { from: "2000-09-21", to: "2025-09-30", label: "C. com. art. L232-10, version du 21/09/2000 au 30/09/2025 (ord. n° 2000-912)", url: LF + "LEGIARTI000051322888/2024-12-31" },
    { from: "2025-10-01", to: null, label: "C. com. art. L232-10, version en vigueur depuis le 01/10/2025 (ord. n° 2025-229 du 12/03/2025, art. 62 ; application : art. 70)", url: LF + "LEGIARTI000051322888" },
  ],
  "L232-11": [{ from: "2003-01-04", to: null, label: "C. com. art. L232-11, version en vigueur depuis le 04/01/2003 (loi n° 2003-7, art. 50)", url: LF + "LEGIARTI000006229026" }],
  "L223-42": [
    { from: "2003-08-05", to: "2023-03-10", label: "C. com. art. L223-42, version du 05/08/2003 au 10/03/2023 (loi n° 2003-721)", url: LF + "LEGIARTI000047292166/2023-01-01" },
    { from: "2023-03-11", to: null, label: "C. com. art. L223-42, version en vigueur depuis le 11/03/2023 (loi n° 2023-171 du 09/03/2023, art. 14)", url: LF + "LEGIARTI000047292166" },
  ],
  "L225-248": [
    { from: "2000-09-21", to: "2023-03-10", label: "C. com. art. L225-248, version du 21/09/2000 au 10/03/2023 (ord. n° 2000-912)", url: LF + "LEGIARTI000047292156/2023-01-01" },
    { from: "2023-03-11", to: null, label: "C. com. art. L225-248, version en vigueur depuis le 11/03/2023 (loi n° 2023-171 du 09/03/2023, art. 14)", url: LF + "LEGIARTI000047292156" },
  ],
  "L227-1": [
    { from: "2019-07-21", to: "2023-05-25", label: "C. com. art. L227-1, version du 21/07/2019 au 25/05/2023 (loi n° 2019-744, art. 27)", url: LF + "LEGIARTI000048535177/2023-03-31" },
    { from: "2023-05-26", to: "2024-12-31", label: "C. com. art. L227-1, version du 26/05/2023 au 31/12/2024 (ord. n° 2023-393, art. 12)", url: LF + "LEGIARTI000048535177/2024-06-30" },
    { from: "2025-01-01", to: null, label: "C. com. art. L227-1, version en vigueur depuis le 01/01/2025 (ord. n° 2023-1142, art. 5)", url: LF + "LEGIARTI000048535177" },
  ],
};
export function articleVersion(article: keyof typeof LEGAL_ARTICLE_VERSIONS, date: string): ArticleVersion | null {
  return LEGAL_ARTICLE_VERSIONS[article].find(v => v.from <= date && (v.to === null || date <= v.to)) ?? null;
}

/** Exact fraction: `cents` = an amount of numerator / denominator cents; `cents_ratio` = two amounts in cents (ratio, never rounded). */
const fraction = z.object({ kind: z.literal("fraction"), numerator: z.string().regex(/^-?\d+$/), denominator: z.string().regex(/^[1-9]\d*$/), unit: z.enum(["cents", "cents_ratio"]) }).strict();
const valueSchema = z.union([knownAmountSchema, fraction]);
export const legalItemSchema = z.object({
  topic: z.enum(["reserve_legale", "distribution", "moitie_capital"]), title: z.string(),
  articles: z.array(z.object({ label: z.string(), url: z.string() }).strict()), referenceDate: z.string(), applies: z.enum(["oui", "non", "inconnu"]), appliesReason: z.string(),
  computed: z.array(z.object({ label: z.string(), value: valueSchema, basis: z.string() }).strict()),
  signal: z.object({ kind: z.enum(["a_examiner", "aucun", "non_calcule"]), text: z.string() }).strict(),
  juridical: z.array(z.string()),
}).strict();
export type LegalItem = z.infer<typeof legalItemSchema>;
export const legalMarkersSchema = z.object({ socialForm: z.enum(SOCIAL_FORMS).nullable(), socialFormLabel: z.string(), items: z.array(legalItemSchema).length(3), meaning: z.string(), limitations: z.array(z.string()) }).strict();
export type LegalMarkers = z.infer<typeof legalMarkersSchema>;

export interface LegalInput {
  socialForm: SocialForm | null;
  period: { startDate: string; closingDate: string; asOfDate: string };
  /** Component opening / closing as established by the sheet (null = not established); absent component = not provided. */
  components: Partial<Record<"capital" | "reserve_legale" | "report_a_nouveau" | "resultat" | "ecarts_reevaluation", { opening: Money | null; closing: Money | null }>>;
  equityClosing: KnownAmount;
  /** Decision lines in force with an effect in the period (amended lines already replaced). Null = decisions register absent. */
  decisions: { type: string; component: string; voted: Money; decisionDate: string }[] | null;
}

const known = (value: Money): KnownAmount => ({ kind: "known", value });
const unknown = (reason: string): KnownAmount => ({ kind: "unknown", reason });
const frac = (numerator: bigint, denominator: bigint, unit: "cents" | "cents_ratio" = "cents") => ({ kind: "fraction" as const, numerator: numerator.toString(), denominator: denominator.toString(), unit });
const article = (v: ArticleVersion | null, name: string, date: string) => v ? { label: v.label, url: v.url } : { label: `C. com. art. ${name} : version applicable au ${date} non relue`, url: LF };
const BY_ACTIONS: SocialForm[] = ["sa", "sas", "sca"];

export function legalMarkers(input: LegalInput): LegalMarkers {
  const form = input.socialForm, c = input.components, decisions = input.decisions;
  const formLabel = form ? SOCIAL_FORM_LABELS[form] : "Forme sociale non documentée";
  const val = (m: Money | null | undefined, what: string): KnownAmount => m ? known(m) : unknown(what + " non établi(e) par la feuille");

  // Legal reserve (L232-10): SARL and companies by shares.
  const affectations = decisions?.filter(d => d.type === "affectation_resultat") ?? [];
  const refDate = affectations.map(d => d.decisionDate).sort()[0] ?? input.period.closingDate;
  const v1032 = articleVersion("L232-10", refDate);
  const appliesRl = !form ? "inconnu" as const : form === "sarl" || BY_ACTIONS.includes(form) ? "oui" as const : "non" as const;
  const resOpening = c.resultat?.opening ?? null, ranOpening = c.report_a_nouveau?.opening ?? null, capOpening = c.capital?.opening ?? null, rlOpening = c.reserve_legale?.opening ?? null;
  const losses = ranOpening ? (cents(ranOpening) < 0n ? -cents(ranOpening) : 0n) : null;
  const base = resOpening && losses !== null ? cents(resOpening) - losses : null;
  const votedRl = decisions === null ? null : affectations.filter(d => d.component === "reserve_legale").reduce((s, d) => s + cents(d.voted), 0n);
  const rlComputed = [
    { label: "Résultat à l’ouverture (exercice précédent, selon la balance)", value: val(resOpening, "Résultat d’ouverture"), basis: "Balance d’ouverture, composante Résultat" },
    { label: "Report à nouveau débiteur à l’ouverture (pertes antérieures, repère)", value: losses === null ? unknown("Report à nouveau d’ouverture non établi") : known(money(losses)), basis: "Balance d’ouverture, composante Report à nouveau (solde débiteur seulement)" },
    { label: "Base repère : résultat − report à nouveau débiteur", value: base === null ? unknown("Base non calculable") : known(money(base)), basis: "Repère arithmétique sur les soldes d’ouverture" },
    { label: "Un vingtième de la base repère", value: base === null ? unknown("Base non calculable") : frac(base, 20n), basis: "Fraction exacte, sans arrondi" },
    { label: "Un dixième du capital à l’ouverture", value: capOpening ? frac(cents(capOpening), 10n) : unknown("Capital d’ouverture non établi"), basis: "Fraction exacte, sans arrondi" },
    { label: "Réserve légale à l’ouverture", value: val(rlOpening, "Réserve légale d’ouverture"), basis: "Balance d’ouverture" },
    { label: "Affectation votée à la réserve légale dans l’exercice", value: votedRl === null ? unknown("Registre des décisions absent") : known(money(votedRl)), basis: "Lignes d’affectation en vigueur, composante Réserve légale" },
  ];
  let rlSignal: LegalItem["signal"];
  if (appliesRl !== "oui") rlSignal = { kind: "non_calcule", text: appliesRl === "non" ? "Forme déclarée non visée par l’art. L232-10." : "Forme sociale non documentée : repère non calculé." };
  else if (!affectations.length) rlSignal = { kind: "non_calcule", text: decisions === null ? "Registre des décisions absent : repère non calculé." : "Aucune affectation du résultat en vigueur dans l’exercice : repère non calculé." };
  else if (base === null || !capOpening || !rlOpening || votedRl === null) rlSignal = { kind: "non_calcule", text: "Solde d’ouverture du résultat, du report à nouveau, du capital ou de la réserve légale non établi : repère non calculé." };
  else if (base <= 0n) rlSignal = { kind: "aucun", text: "Base repère nulle ou négative : aucun prélèvement à rechercher selon les soldes d’ouverture (repère, non une appréciation)." };
  else if (cents(rlOpening) * 10n >= cents(capOpening)) rlSignal = { kind: "aucun", text: "Réserve légale d’ouverture au moins égale au dixième du capital (al. 2) : repère sans objet." };
  else if (votedRl * 20n >= base || (cents(rlOpening) + votedRl) * 10n >= cents(capOpening)) rlSignal = { kind: "aucun", text: "Affectation votée au moins égale au vingtième de la base repère, ou réserve portée au dixième du capital : aucun signal." };
  else rlSignal = { kind: "a_examiner", text: "Affectation votée inférieure au vingtième de la base repère alors que la réserve légale reste sous le dixième du capital : à examiner (base légale, statuts, délibération). Aucune conclusion." };

  // Distribution (L232-11, al. 3): equity after distribution vs capital + non-distributable reserves known from the sources.
  const distributions = decisions?.filter(d => d.type === "distribution") ?? [];
  const appliesDist = !form ? "inconnu" as const : form === "sarl" || BY_ACTIONS.includes(form) ? "oui" as const : "inconnu" as const;
  const provided = (["capital", "reserve_legale", "ecarts_reevaluation"] as const).filter(k => c[k]);
  const floorParts = provided.map(k => c[k]!.closing);
  const floor = c.capital && floorParts.every(Boolean) ? floorParts.reduce((s, m) => s + cents(m!), 0n) : null;
  const notProvided = (["reserve_legale", "ecarts_reevaluation"] as const).filter(k => !c[k]);
  const voted = distributions.reduce((s, d) => s + (cents(d.voted) < 0n ? -cents(d.voted) : cents(d.voted)), 0n);
  const distComputed = [
    { label: "Distributions en vigueur à effet dans l’exercice (montants votés)", value: decisions === null ? unknown("Registre des décisions absent") : known(money(voted)), basis: "Lignes de distribution en vigueur" },
    { label: "Capitaux propres de clôture (après distributions comptabilisées)", value: input.equityClosing, basis: "Total des composantes de capitaux propres de la feuille" },
    { label: "Capital + réserve légale + écarts de réévaluation à la clôture (repère minimal)", value: floor === null ? unknown("Capital ou une composante fournie non établi(e) à la clôture") : known(money(floor)), basis: notProvided.length ? `Composante(s) non fournie(s), non incluse(s) et jamais réputée(s) nulle(s) : ${notProvided.map(k => k === "reserve_legale" ? "réserve légale" : "écarts de réévaluation").join(", ")}` : "Balance de clôture" },
  ];
  let distSignal: LegalItem["signal"];
  if (appliesDist === "inconnu") distSignal = { kind: "non_calcule", text: "Forme sociale non documentée ou hors des formes examinées : repère non calculé." };
  else if (!distributions.length) distSignal = { kind: "non_calcule", text: decisions === null ? "Registre des décisions absent : repère non calculé." : "Aucune distribution en vigueur à effet dans l’exercice : repère non calculé." };
  else if (input.equityClosing.kind !== "known" || floor === null) distSignal = { kind: "non_calcule", text: "Capitaux propres de clôture ou repère minimal non établis : repère non calculé." };
  else if (cents(input.equityClosing.value) < floor) distSignal = { kind: "a_examiner", text: "Capitaux propres de clôture inférieurs au capital augmenté des réserves non distribuables connues des sources : distribution à examiner (al. 3). Aucune conclusion." };
  else distSignal = { kind: "aucun", text: "Capitaux propres de clôture au moins égaux au repère minimal connu des sources ; les réserves statutaires indisponibles restent à apprécier." };

  // Half of the capital (L223-42 SARL; L225-248 SA/SCA; SAS through L227-1).
  const close = input.period.closingDate;
  const articles: { label: string; url: string }[] = [];
  let appliesHalf: "oui" | "non" | "inconnu" = "inconnu", halfReason = "Forme sociale non documentée.";
  if (form === "sarl") { const v = articleVersion("L223-42", close); articles.push(article(v, "L223-42", close)); appliesHalf = v ? "oui" : "inconnu"; halfReason = v ? "SARL : art. L223-42." : "Version de L223-42 non relue pour cette date."; }
  else if (form === "sa" || form === "sca") { const v = articleVersion("L225-248", close); articles.push(article(v, "L225-248", close)); appliesHalf = v ? "oui" : "inconnu"; halfReason = v ? "Société par actions : art. L225-248." : "Version de L225-248 non relue pour cette date."; }
  else if (form === "sas") { const v = articleVersion("L225-248", close), r = articleVersion("L227-1", close); articles.push(article(v, "L225-248", close), article(r, "L227-1", close)); appliesHalf = v && r ? "oui" : "inconnu"; halfReason = v && r ? "SAS : art. L225-248, applicable par le renvoi de l’art. L227-1 al. 3 (non exclu)." : "Version de L225-248 ou du renvoi L227-1 non relue pour cette date."; }
  else if (form === "autre") { appliesHalf = "non"; halfReason = "Aucune disposition équivalente lue pour cette forme."; }
  const capClose = c.capital?.closing ?? null;
  const halfComputed = [
    { label: "Capitaux propres de clôture", value: input.equityClosing, basis: "Total des composantes de capitaux propres de la feuille (autres fonds propres exclus)" },
    { label: "Capital à la clôture", value: val(capClose, "Capital de clôture"), basis: "Balance de clôture" },
    { label: "Capitaux propres / capital", value: input.equityClosing.kind === "known" && capClose && cents(capClose) > 0n ? frac(cents(input.equityClosing.value), cents(capClose), "cents_ratio") : unknown("Rapport non calculable"), basis: "Rapport exact capitaux propres / capital, sans arrondi" },
  ];
  let halfSignal: LegalItem["signal"];
  if (appliesHalf !== "oui") halfSignal = { kind: "non_calcule", text: halfReason };
  else if (input.equityClosing.kind !== "known" || !capClose || cents(capClose) <= 0n) halfSignal = { kind: "non_calcule", text: "Capitaux propres ou capital de clôture non établis : rapport non calculé." };
  else if (cents(input.equityClosing.value) * 2n < cents(capClose)) halfSignal = { kind: "a_examiner", text: "Capitaux propres comptables de clôture inférieurs à la moitié du capital : situation à examiner au regard du texte cité. Aucune alerte de dissolution, aucun délai calculé." };
  else halfSignal = { kind: "aucun", text: "Rapport au moins égal à la moitié du capital sur les soldes de la feuille ; cela ne vaut pas appréciation juridique." };

  return {
    socialForm: form, socialFormLabel: formLabel,
    items: [
      { topic: "reserve_legale", title: "Réserve légale", articles: [article(v1032, "L232-10", refDate)], referenceDate: refDate, applies: appliesRl,
        appliesReason: appliesRl === "oui" ? "SARL et sociétés par actions (art. L232-10)." : appliesRl === "non" ? "Forme hors du champ de l’art. L232-10." : "Forme sociale non documentée.", computed: rlComputed, signal: rlSignal,
        juridical: ["Notions légales de bénéfice de l’exercice et de pertes antérieures : les soldes d’ouverture ne sont qu’un repère.", "Réserves statutaires et affectations antérieures.", "Nullité d’une décision contraire et ses suites.", "Capital à retenir en cas d’opération sur le capital dans l’exercice."] },
      { topic: "distribution", title: "Distribution et capitaux propres", articles: [{ label: LEGAL_ARTICLE_VERSIONS["L232-11"][0].label, url: LEGAL_ARTICLE_VERSIONS["L232-11"][0].url }], referenceDate: close, applies: appliesDist,
        appliesReason: appliesDist === "oui" ? "Disposition commune aux sociétés commerciales, examinée pour la forme déclarée." : "Applicabilité à apprécier pour cette forme.", computed: distComputed, signal: distSignal,
        juridical: ["Bénéfice distribuable de l’al. 1 (réserves légales et statutaires à doter, report bénéficiaire).", "Réserves que les statuts rendent indisponibles.", "Postes de réserves désignés par la décision (al. 2).", "Acomptes sur dividendes (art. L232-12) et dividende fictif."] },
      { topic: "moitie_capital", title: "Capitaux propres inférieurs à la moitié du capital", articles, referenceDate: close, applies: appliesHalf, appliesReason: halfReason, computed: halfComputed, signal: halfSignal,
        juridical: ["Capitaux propres retenus pour ce test (rubriques incluses ou non).", "Pertes constatées dans les comptes approuvés et date d’approbation.", "Décision des associés dans les quatre mois et publicité.", "Reconstitution ou réduction du capital et délais ; seuil fixé par décret depuis la loi n° 2023-171.", "Sociétés en sauvegarde ou en redressement judiciaire exclues.", "Disposition transitoire de la loi n° 2023-171 non lue (page Légifrance protégée par une vérification anti-robot)."] },
    ],
    meaning: "Repères arithmétiques datés par forme sociale : ils ne valent ni conformité, ni irrégularité, ni alerte de dissolution. Un signal « à examiner » appelle une appréciation juridique humaine.",
    limitations: ["Textes lus sur Légifrance le 14/10/2026 ; une version antérieure à la première version relue n’est pas appliquée.", "La forme sociale est déclarée par une personne ; PROBANT ne lit pas les statuts.", "Aucun délai, aucune échéance ni aucune conséquence juridique n’est calculé."],
  };
}

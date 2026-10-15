/**
 * Qualification de l'exigibilité de la TVA d'un événement (Mission C11).
 *
 * Ce n'est pas un moteur fiscal : aucune TVA n'est calculée ni liquidée. Le module dit, pour une facture dont la
 * nature est déclarée, à quelle(s) date(s) la taxe devient exigible (vente) ou le droit à déduction prend naissance
 * (achat). Il ne couvre qu'une liste FERMÉE de catégories, lues dans les textes ci-dessous ; tout autre cas rend
 * « information requise ». Le montant de TVA de la facture reste descriptif : TVA ÷ HT est un taux constaté, jamais un
 * taux légal.
 *
 * Couverture temporelle : une date n'est qualifiée que si le registre fiscal (`data/tax`, autorité de la couverture
 * du moteur TVA) ET la version lue ici la couvrent toutes deux. Le registre arrête l'art. 269 au 31/08/2026 alors que
 * Légifrance, lu le 15/10/2026, porte son abrogation au 01/01/2027 : l'écart est consigné (docs/mission-c11) et la
 * qualification s'arrête au plus tôt des deux, sans corriger ici une source partagée.
 */
import { cents, money, type KnownAmount, type Money } from "@/lib/canonical-model/money";
import { assessSourceCoverage } from "../source-coverage";

export const VAT_EXIGIBILITY_VERSION = "1.0.0" as const;
const READ_AT = "2026-10-15";

export interface ReadVatSource {
  key: string;
  /** Identifiant du registre fiscal, ou null pour une doctrine lue mais non enregistrée au registre. */
  registrySourceId: string | null;
  title: string;
  url: string;
  version: string;
  /** Fenêtre de la version lue (bornes incluses). */
  readFrom: string;
  readTo: string | null;
  readAt: string;
  excerpt: string;
}

export const VAT_EXIGIBILITY_SOURCES: Record<"cgi269" | "cgi271" | "boiGoods" | "boiServices" | "boiDebits", ReadVatSource> = {
  cgi269: {
    key: "cgi269", registrySourceId: "cgi-art-269", title: "CGI, art. 269 (1-a, 2-a, 2-c)",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044983827",
    version: "Version en vigueur depuis le 01/01/2023 (loi n° 2021-1900, art. 30) ; abrogée au 01/01/2027 par l’ordonnance n° 2025-1247 (art. 9, 15 et 49), l’option pour les débits (2-c, premier et dernier alinéas) étant maintenue jusqu’à sa reprise réglementaire.",
    readFrom: "2023-01-01", readTo: "2026-12-31", readAt: READ_AT,
    excerpt: "1-a : fait générateur au moment où la livraison ou la prestation est effectuée. 2-a : livraisons — exigibilité à la réalisation du fait générateur ; en cas d’acompte préalable, à son encaissement, à concurrence du montant encaissé. 2-c : prestations de services — lors de l’encaissement des acomptes, du prix, de la rémunération ou, sur option, d’après les débits.",
  },
  cgi271: {
    key: "cgi271", registrySourceId: "cgi-art-271", title: "CGI, art. 271, I-2",
    url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053545646",
    version: "Versions du 31/12/2023 au 21/02/2026 (loi n° 2023-1322, art. 83) et depuis le 21/02/2026 (loi n° 2026-103, art. 100) : rédaction du I-2 identique ; abrogé au 01/01/2027 par l’ordonnance n° 2025-1247.",
    readFrom: "2023-12-31", readTo: "2026-12-31", readAt: READ_AT,
    excerpt: "I-2 : le droit à déduction prend naissance lorsque la taxe déductible devient exigible chez le redevable.",
  },
  boiGoods: {
    key: "boiGoods", registrySourceId: "bofip-tva-exigibilite", title: "BOI-TVA-BASE-20-10 (publication du 21/12/2022), § 1 et § 65",
    url: "https://bofip.impots.gouv.fr/bofip/534-PGP.html/identifiant=BOI-TVA-BASE-20-10-20221221",
    version: "Publication du 21/12/2022", readFrom: "2022-12-21", readTo: null, readAt: READ_AT,
    excerpt: "§ 1 : pour les livraisons de biens, fait générateur et exigibilité sont constitués par le même événement. § 65 : acompte versé avant la livraison — taxe exigible à son encaissement, à concurrence de son montant, si les éléments de la future livraison sont déjà connus.",
  },
  boiServices: {
    key: "boiServices", registrySourceId: null, title: "BOI-TVA-BASE-20-20 (publication du 07/11/2018), § 30",
    url: "https://bofip.impots.gouv.fr/bofip/283-PGP.html/identifiant=BOI-TVA-BASE-20-20-20181107",
    version: "Publication du 07/11/2018", readFrom: "2018-11-07", readTo: null, readAt: READ_AT,
    excerpt: "§ 30 : prestations de services — exigibilité lors de l’encaissement des acomptes, du prix, de la rémunération, ou sur option d’après les débits ; les encaissements comprennent avances, acomptes et règlements pour solde.",
  },
  boiDebits: {
    key: "boiDebits", registrySourceId: null, title: "BOI-TVA-BASE-20-50-10 (publication du 12/09/2012), § 20, 40, 50 et 70",
    url: "https://bofip.impots.gouv.fr/bofip/998-PGP.html/identifiant=BOI-TVA-BASE-20-50-10-20120912",
    version: "Publication du 12/09/2012", readFrom: "2012-09-12", readTo: null, readAt: READ_AT,
    excerpt: "§ 20 : débit = inscription des sommes au débit des comptes clients. § 40 : option expresse, déclarée par écrit au service des impôts. § 50 : option globale, applicable aux opérations à compter du premier jour du mois suivant. § 70 : l’option ne peut retarder l’exigibilité après l’encaissement.",
  },
};

/** Catégories couvertes : opérations dont le lieu est en France, hors régimes particuliers. « other » n'est jamais qualifié. */
export type VatOperationCategory = "goods" | "services" | "other";
export const VAT_CATEGORY_LABELS: Record<VatOperationCategory, string> = {
  goods: "Livraison de biens meubles corporels en France (hors régimes particuliers)",
  services: "Prestation de services dont le lieu est en France (hors autoliquidation et régimes particuliers)",
  other: "Catégorie non couverte (intracommunautaire, importation, exportation, autoliquidation, travaux ou livraisons d’immeubles, décomptes successifs, électricité et gaz…)",
};

export interface VatSettlement { id: string; date: string; amountTtc: Money; kind: "advance" | "payment"; source: string }
export interface VatQualificationInput {
  flow: "sale" | "purchase";
  /** Un avoir (réduction de la TVA collectée ou déductible) n'appartient à aucune catégorie couverte. */
  documentKind?: "invoice" | "credit_note";
  /** Nature déclarée de l'opération ; null = non fournie. */
  category: VatOperationCategory | null;
  /** Option pour les débits applicable à la facture (déclarée d'après la pièce) ; null = non fournie. */
  debitOption: "yes" | "no" | "unknown" | null;
  /** Livraison du bien ou exécution de la prestation. */
  performance: { kind: "point" | "spread"; date: string | null } | null;
  /** Inscription au débit du compte client (vente) : date de comptabilisation de la facture, si sourcée. */
  debitDate: string | null;
  net: KnownAmount; tax: KnownAmount; gross: KnownAmount;
  /**
   * Encaissements (vente) ou paiements (achat) rattachés à la facture. `complete` : tous sont connus jusqu'à la date de
   * revue ; `partial` : d'autres peuvent exister, notamment avant la clôture ; `unknown` : aucune source.
   */
  settlements: { status: "complete" | "partial" | "unknown"; items: VatSettlement[]; reviewDate: string };
}
export interface VatTranche {
  basis: "delivery" | "advance" | "payment" | "debit" | "payment_pending";
  /** Date d'exigibilité (vente) ou de naissance du droit à déduction (achat) ; null si l'encaissement n'est pas intervenu à la revue. */
  date: string | null;
  amountTtc: KnownAmount;
  label: string;
}
export interface VatQualification {
  version: typeof VAT_EXIGIBILITY_VERSION;
  status: "qualified" | "partially_qualified" | "information_required";
  /** Exigibilité chez le vendeur, ou naissance du droit à déduction chez l'acheteur. */
  subject: "exigibility" | "deduction_right";
  category: VatOperationCategory | null;
  rule: { id: string; label: string; articles: string[] } | null;
  tranches: VatTranche[];
  /** Première date qualifiée, utile au rattachement de période. */
  firstDate: string | null;
  missing: string[];
  reserves: string[];
  observedRate: { basisPoints: number | null; meaning: string };
  sources: ReadVatSource[];
}

const OBSERVED_RATE_MEANING = "Taux constaté = TVA ÷ HT de la facture : descriptif, aucun taux légal n’est qualifié dans ce lot.";

function observedRate(net: KnownAmount, tax: KnownAmount): VatQualification["observedRate"] {
  if (net.kind !== "known" || tax.kind !== "known" || cents(net.value) === 0n) return { basisPoints: null, meaning: OBSERVED_RATE_MEANING };
  // Arrondi au point de base le plus proche, demi vers le haut en valeur absolue : présentation, jamais un taux légal.
  const n = cents(net.value), t = cents(tax.value), sign = (n < 0n) !== (t < 0n) ? -1n : 1n;
  const an = n < 0n ? -n : n, at = t < 0n ? -t : t;
  return { basisPoints: Number(sign * ((at * 20000n + an) / (2n * an))), meaning: OBSERVED_RATE_MEANING };
}

/** Une date n'est qualifiée que si le registre et la version lue la couvrent. */
function uncovered(date: string, flow: "sale" | "purchase"): string | null {
  const needs = flow === "sale" ? [VAT_EXIGIBILITY_SOURCES.cgi269] : [VAT_EXIGIBILITY_SOURCES.cgi269, VAT_EXIGIBILITY_SOURCES.cgi271];
  for (const s of needs) {
    const read = s.readFrom <= date && (s.readTo === null || date <= s.readTo);
    const registry = assessSourceCoverage({ startDate: date, endDate: date, sourceIds: [s.registrySourceId!] }).status === "covered";
    if (!read || !registry) return `${s.title} : ${!registry ? "registre fiscal sans version couvrant" : "version lue ne couvrant pas"} le ${date}.`;
  }
  return null;
}

export function qualifyVatExigibility(input: VatQualificationInput): VatQualification {
  const subject = input.flow === "sale" ? "exigibility" as const : "deduction_right" as const;
  const base = { version: VAT_EXIGIBILITY_VERSION, subject, category: input.category, observedRate: observedRate(input.net, input.tax) };
  const need = (missing: string[], rule: VatQualification["rule"] = null, sources: ReadVatSource[] = []): VatQualification =>
    ({ ...base, status: "information_required", rule, tranches: [], firstDate: null, missing, reserves: [], sources });
  if (input.documentKind === "credit_note") return need(["Avoir : réduction de la TVA collectée ou déductible (CGI, art. 272 et 267) hors catégories couvertes par ce lot ; textes non lus."]);
  if (input.category === null) return need(["Nature de l’opération (livraison de biens ou prestation de services en France) non fournie."]);
  if (input.category === "other") return need([`${VAT_CATEGORY_LABELS.other} : hors catégories couvertes par ce lot.`]);
  const S = VAT_EXIGIBILITY_SOURCES;
  const deduction = input.flow === "purchase" ? ["CGI, art. 271, I-2"] : [];
  const goods = input.category === "goods";
  const gross = input.gross.kind === "known" ? cents(input.gross.value) : null;
  const items = [...input.settlements.items].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const i of items) if (cents(i.amountTtc) <= 0n) return need([`Encaissement ${i.id} : montant positif attendu.`]);
  const known = (v: bigint): KnownAmount => ({ kind: "known", value: money(v) });
  const unknownAmount = (reason: string): KnownAmount => ({ kind: "unknown", reason });
  // Date pivot : livraison (biens), débit (services avec option) ; les encaissements antérieurs la devancent (269-2-a, § 70).
  let pivot: { basis: "delivery" | "debit"; date: string } | null = null;
  let rule: NonNullable<VatQualification["rule"]>;
  let sources: ReadVatSource[];
  if (goods) {
    rule = { id: `${input.flow}_goods`, label: input.flow === "sale" ? "Livraison de biens : exigible à la livraison, ou à l’encaissement d’un acompte préalable" : "Achat de biens : droit à déduction à l’exigibilité chez le fournisseur (livraison, ou acompte préalable)", articles: ["CGI, art. 269, 1-a et 2-a", ...deduction] };
    sources = [S.cgi269, S.boiGoods, ...(input.flow === "purchase" ? [S.cgi271] : [])];
    if (!input.performance || input.performance.kind !== "point" || !input.performance.date) return need([input.performance?.kind === "spread" ? "Livraison étalée ou à décomptes successifs (269, 1-a bis) : hors catégories couvertes." : "Date de livraison du bien non fournie."], rule, sources);
    pivot = { basis: "delivery", date: input.performance.date };
  } else {
    sources = [S.cgi269, S.boiServices, ...(input.flow === "purchase" ? [S.cgi271] : [])];
    if (input.debitOption === null || input.debitOption === "unknown") return need([input.flow === "sale" ? "Option pour les débits : applicabilité à la facture non documentée (déclaration écrite au service des impôts, BOI-TVA-BASE-20-50-10 § 40)." : "Option du fournisseur pour les débits : non documentée sur la facture."], null, sources);
    if (input.debitOption === "yes") {
      rule = { id: `${input.flow}_services_debits`, label: input.flow === "sale" ? "Prestation de services, option pour les débits : exigible au débit, ou à l’encaissement s’il le précède" : "Achat de services, fournisseur ayant opté pour les débits", articles: ["CGI, art. 269, 2-c", ...deduction] };
      sources = [...sources, S.boiDebits];
      if (input.flow === "purchase") return need(["Date d’inscription au débit chez le fournisseur : inconnue de l’acheteur ; la date de facture n’en tient pas lieu."], rule, sources);
      if (!input.debitDate) return need(["Date d’inscription de la facture au débit du compte client non fournie."], rule, sources);
      pivot = { basis: "debit", date: input.debitDate };
    } else {
      rule = { id: `${input.flow}_services_cash`, label: input.flow === "sale" ? "Prestation de services : exigible à l’encaissement (acomptes, prix, rémunération)" : "Achat de services : droit à déduction au paiement (encaissement chez le fournisseur)", articles: ["CGI, art. 269, 2-c", ...deduction] };
    }
  }
  const tranches: VatTranche[] = [], reserves: string[] = [], missing: string[] = [];
  let settled = 0n;
  if (pivot) {
    // Biens ou débits : les encaissements antérieurs à la date pivot sont exigibles à leur date, à concurrence de leur montant.
    for (const i of items.filter((i) => i.date < pivot.date)) { tranches.push({ basis: "advance", date: i.date, amountTtc: known(cents(i.amountTtc)), label: `Acompte ${i.id} encaissé avant ${pivot.basis === "delivery" ? "la livraison" : "le débit"}` }); settled += cents(i.amountTtc); }
    if (input.settlements.status === "complete") {
      tranches.push({ basis: pivot.basis, date: pivot.date, amountTtc: gross === null ? unknownAmount("TTC de la facture inconnu") : known(gross - settled), label: pivot.basis === "delivery" ? "Livraison : solde du prix" : "Inscription au débit : solde du prix" });
    } else {
      tranches.push({ basis: pivot.basis, date: pivot.date, amountTtc: unknownAmount("Acomptes antérieurs non documentés : montant exigible à cette date inconnu"), label: pivot.basis === "delivery" ? "Livraison : prix, hors acomptes éventuels" : "Inscription au débit : prix, hors acomptes éventuels" });
      reserves.push(input.settlements.status === "unknown" ? "Encaissements non fournis : un acompte encaissé avant cette date rendrait la TVA exigible à son encaissement, à concurrence de son montant." : "Encaissements partiellement documentés (source postérieure à la clôture) : un acompte antérieur non fourni rendrait la TVA exigible à son encaissement.");
    }
  } else {
    // Services sans option : chaque encaissement porte l'exigibilité de son montant.
    if (input.settlements.status === "unknown") return need([input.flow === "sale" ? "Encaissements de la facture non fournis : exigibilité non datée." : "Paiements de la facture non fournis : droit à déduction non daté."], rule!, sources);
    for (const i of items) { tranches.push({ basis: i.kind === "advance" ? "advance" : "payment", date: i.date, amountTtc: known(cents(i.amountTtc)), label: `${i.kind === "advance" ? "Acompte" : "Encaissement"} ${i.id}` }); settled += cents(i.amountTtc); }
    if (gross === null) missing.push("TTC de la facture inconnu : part restant à encaisser non déterminée.");
    else if (settled > gross) return need([`Encaissements (${settled} c) supérieurs au TTC de la facture (${gross} c) : allocation à expliquer.`], rule!, sources);
    else if (settled < gross) {
      if (input.settlements.status === "complete") tranches.push({ basis: "payment_pending", date: null, amountTtc: known(gross - settled), label: `Non encaissé au ${input.settlements.reviewDate} : exigible à l’encaissement futur` });
      else { tranches.push({ basis: "payment_pending", date: null, amountTtc: unknownAmount("Encaissements partiellement documentés"), label: "Reste du prix : encaissements antérieurs ou postérieurs non tous documentés" }); reserves.push("Encaissements partiellement documentés : d’autres encaissements, notamment avant la clôture, peuvent exister."); }
    }
  }
  if (pivot && gross !== null && settled > gross) return need([`Acomptes (${settled} c) supérieurs au TTC de la facture (${gross} c) : allocation à expliquer.`], rule!, sources);
  for (const t of tranches) if (t.date) { const gap = uncovered(t.date, input.flow); if (gap) return need([`Source non couverte : ${gap}`], rule!, sources); }
  const dated = tranches.filter((t) => t.date).map((t) => t.date!).sort();
  const status = missing.length ? "information_required" as const : reserves.length || tranches.some((t) => t.amountTtc.kind !== "known") ? "partially_qualified" as const : "qualified" as const;
  return { ...base, status, rule: rule!, tranches, firstDate: dated[0] ?? null, missing, reserves, sources };
}

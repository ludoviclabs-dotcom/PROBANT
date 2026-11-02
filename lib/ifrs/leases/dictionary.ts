import { isCivilDate } from "@/lib/canonical-model/period";

/**
 * Dictionnaire fermé des sources de l'atelier « Locations IFRS 16 » (L16-01), mapping `ifrs16-leases-2`.
 * Chaque champ vit dans l'objet `fields` de la colonne `Details` d'un CSV `Key;Amount;Date;Details` lu par l'import existant.
 *
 * Trois états restent distincts (vide ≠ zéro ≠ non applicable, X25) :
 * - champ absent : **vide**, jamais une réponse ; un champ obligatoire vide rend le contrat `a_qualifier` ;
 * - `inconnu` : réponse explicite « on ne sait pas » ; même effet qu'un vide, motif différent ;
 * - `non_applicable` : admis seulement si le champ le prévoit (`naAllowed`) ;
 * - zéro : une valeur (`0.00`, `none`), qui doit être déclarée comme telle.
 */
export const UNKNOWN_TOKEN = "inconnu";
export const NOT_APPLICABLE_TOKEN = "non_applicable";
export type FieldKind = "text" | "date" | "amount" | "integer" | "rate" | "enum";
export interface FieldSpec {
  key: string; kind: FieldKind; label: string; required: boolean; naAllowed: boolean;
  values?: readonly string[]; unit?: string;
  /** Effet d'une valeur, ou d'un vide, sur la qualification (codes de SCOPE_V1, ou contrôles Qnn de cohérence). */
  blocking: string;
}
const f = (key: string, kind: FieldKind, label: string, blocking: string, options: Partial<Pick<FieldSpec, "required" | "naAllowed" | "values" | "unit">> = {}): FieldSpec =>
  ({ key, kind, label, blocking, required: options.required ?? true, naAllowed: options.naAllowed ?? false, ...(options.values ? { values: options.values } : {}), ...(options.unit ? { unit: options.unit } : {}) });
const NONE_PRESENT = ["none", "present"] as const;

export const LEASE_DICTIONARY = {
  lease_contracts: [
    f("lessor", "text", "Bailleur", "Vide → à qualifier"),
    f("assetCategory", "text", "Catégorie d'actif sous-jacent (niveau de l'élection court terme, § 8)", "Vide → à qualifier"),
    f("contractVersion", "text", "Version du contrat et pièce", "Vide → à qualifier"),
    f("versionNature", "enum", "Nature de la version", "economic_modification → hors V1 (X12) ; une correction de transcription garde la lignée", { values: ["initial", "transcription_correction", "economic_modification"] }),
    f("role", "enum", "Rôle de l'entité", "≠ lessee → hors périmètre (X30)", { values: ["lessee", "lessor", "sublease", "sale_leaseback"] }),
    f("contractCurrency", "text", "Devise du contrat", "≠ EUR → hors V1 (X16)"),
    f("signatureDate", "date", "Date de signature, distincte du commencement", "Vide → à qualifier ; postérieure au commencement → à qualifier (Q01)"),
    f("endDate", "date", "Fin du contrat retenue", "Vide → à qualifier ; différente de la fin du mois n → à qualifier (Q02)"),
    f("termMonths", "integer", "Durée retenue en mois", "Vide → à qualifier (X20) ; < 1 ou > 120 → hors V1 (X18)", { unit: "mois" }),
    f("payment", "amount", "Loyer fixe mensuel du modèle, hors TVA", "Vide → à qualifier ; Amount ≠ loyer × durée → à qualifier (Q03)", { unit: "EUR" }),
    f("paymentFrequency", "enum", "Périodicité des loyers", "≠ monthly → hors V1 (X17)", { values: ["monthly", "quarterly", "annual", "other"] }),
    f("paymentTiming", "enum", "Terme des loyers", "advance → hors V1 (X03)", { values: ["arrears", "advance"] }),
    f("vatTreatment", "enum", "TVA sur les loyers", "non_recoverable ou uncertain → hors V1 (X21)", { values: ["excluded_recoverable", "no_vat", "non_recoverable", "uncertain"] }),
    f("identifiedAsset", "enum", "Actif identifié (§ 9, B13-B20)", "no → non-location ; vide → à qualifier (R01)", { values: ["yes", "no"] }),
    f("controlOfUse", "enum", "Contrôle de l'utilisation (B21-B30)", "no → non-location ; vide → à qualifier (R01)", { values: ["yes", "no"] }),
    f("identificationEvidence", "text", "Preuve et jugement d'identification", "Vide → à qualifier (R01)"),
    f("serviceComponents", "enum", "Composantes non locatives (§ 12-15)", "present sans ventilation ni élection § 15 → à qualifier (X07)", { values: ["none", "separated", "election_15", "present"] }),
    f("usefulLifeMonths", "integer", "Durée d'utilité retenue du droit d'utilisation", "Vide → à qualifier ; < 1 → à qualifier (Q04)", { unit: "mois" }),
    f("depreciationMethod", "enum", "Méthode d'amortissement", "≠ straight_line → hors V1 (Q05)", { values: ["straight_line", "other"] }),
    f("depreciationJustification", "text", "Justification de la durée et de la méthode", "Vide → à qualifier"),
  ],
  lease_assumptions: [
    f("rateKind", "enum", "Nature du taux (§ 26)", "Vide → à qualifier (X19)", { values: ["implicit", "incremental_borrowing"] }),
    f("rateBasis", "enum", "Base du taux fourni", "nominal ou monthly → à qualifier, jamais converti en silence (X19)", { values: ["annual_effective", "nominal", "monthly"] }),
    f("annualEffectiveRate", "rate", "Taux annuel effectif décimal (0,05 = 5 %)", "Vide → à qualifier (X19) ; négatif ou > 1 → hors V1 (X19)", { unit: "fraction décimale" }),
    f("rateDate", "date", "Date pertinente du taux", "Vide → à qualifier (X19)"),
    f("rateJustification", "text", "Justification et preuve du taux (IFRIC 09/2019)", "Vide → à qualifier (X19)"),
    f("termJudgement", "text", "Jugement de durée : options examinées, période exécutoire (B34-B41)", "Vide → à qualifier (X20)"),
    f("lowValueExemption", "enum", "Exemption faible valeur, contrat par contrat (§ 5, B3-B8)", "Vide → à qualifier", { values: ["elected", "not_elected"] }),
    f("lowValueNewValue", "amount", "Valeur à neuf de l'actif (B3-B8)", "Exigée si exemption faible valeur ; vide → à qualifier (X23)", { naAllowed: true, required: false, unit: "EUR" }),
    f("lowValueJudgement", "text", "Jugement faible valeur (B3-B8), sans seuil par défaut", "Exigé si exemption faible valeur ; vide → à qualifier (X23)", { naAllowed: true, required: false }),
    f("variablePayments", "enum", "Loyers variables", "index → hors V1 (X01) ; usage → hors V1 (X02)", { values: ["none", "index", "usage"] }),
    f("prepaidPayments", "amount", "Paiements d'avance (§ 24 b)", "≠ 0 → hors V1 (X03)", { unit: "EUR" }),
    f("leaseIncentives", "amount", "Avantages incitatifs reçus", "≠ 0 → hors V1 (X04)", { unit: "EUR" }),
    f("initialDirectCosts", "amount", "Coûts directs initiaux (§ 24 c)", "≠ 0 → hors V1 (X05)", { unit: "EUR" }),
    f("restorationCosts", "amount", "Coûts de remise en état (§ 24 d)", "≠ 0 → hors V1 (X06)", { unit: "EUR" }),
    f("deposit", "enum", "Dépôt de garantie", "unqualified → à qualifier (X08)", { values: ["none", "qualified", "unqualified"] }),
    f("residualValueGuarantee", "enum", "Garantie de valeur résiduelle", "present → hors V1 (X09)", { values: NONE_PRESENT }),
    f("purchaseOption", "enum", "Option d'achat", "present → hors V1 (X10) ; interdit l'exemption court terme (X22)", { values: NONE_PRESENT }),
    f("ownershipTransfer", "enum", "Transfert de propriété", "present → hors V1 (X10)", { values: NONE_PRESENT }),
    f("terminationPenalty", "enum", "Pénalité de résiliation incluse dans la durée", "present → hors V1 (X11)", { values: NONE_PRESENT }),
    f("modification", "enum", "Modification ou réestimation en cours", "present → hors V1 (X12)", { values: NONE_PRESENT }),
    f("impairmentIndicator", "enum", "Indice de dépréciation (IAS 36)", "present → hors V1 (X14)", { values: NONE_PRESENT }),
    f("capitalizedInOtherAsset", "enum", "Charges incorporées au coût d'un autre actif", "present → hors V1 (X15)", { values: NONE_PRESENT }),
  ],
  lease_schedule: [
    f("contractVersion", "text", "Version du contrat de l'échéance", "Vide → à qualifier"),
    f("paidDate", "date", "Date de règlement", "Échéance exigible : vide, inconnu ou postérieure à la date de revue → à qualifier (X13) ; future : non applicable", { naAllowed: true, required: false }),
    f("paidAmount", "amount", "Montant réglé total", "Échéance exigible : vide → à qualifier ; réglé < dû → hors V1 (X13) ; réglé > dû → à qualifier (Q06)", { naAllowed: true, required: false, unit: "EUR" }),
    f("paidVat", "amount", "TVA comprise dans le règlement (TVA récupérable qualifiée)", "Règlement TTC : loyer, TVA et total restent distincts ; TVA ou montant réglé négatif → règlement inconnu, à qualifier (X13)", { naAllowed: true, required: false, unit: "EUR" }),
  ],
  lease_ledger: [
    f("account", "text", "Compte PCG (612, 613, 614…)", "Indice de recherche, jamais une preuve d'exhaustivité"),
    f("periodStart", "date", "Début de la période couverte", "Vide → ligne non rattachable"),
    f("periodEnd", "date", "Fin de la période couverte", "Vide → ligne non rattachable"),
    f("piece", "text", "Pièce comptable", "Vide → ligne non rattachable"),
  ],
  lease_opening: [
    f("openingDate", "date", "Date de l'ouverture (veille du début de l'exercice)", "Vide → diagnostic (X24)"),
    f("debt", "amount", "Dette locative d'ouverture", "Écart au recalcul ≠ 0,00 → diagnostic (X24)", { unit: "EUR" }),
    f("rouGross", "amount", "Droit d'utilisation brut d'ouverture", "Écart au recalcul ≠ 0,00 → diagnostic (X24)", { unit: "EUR" }),
    f("rouAccumulated", "amount", "Amortissements cumulés d'ouverture", "Écart au recalcul ≠ 0,00 → diagnostic (X24)", { unit: "EUR" }),
    f("rouNet", "amount", "Droit d'utilisation net d'ouverture", "Écart au recalcul ou brut − cumul ≠ net → diagnostic (X24)", { unit: "EUR" }),
    f("reportingRef", "text", "Reporting IFRS validé de référence", "Vide → diagnostic (X24)"),
    f("reviewEvidence", "text", "Preuve de revue de l'ouverture", "Vide → diagnostic (X24)"),
  ],
} as const satisfies Record<string, readonly FieldSpec[]>;
export type LeaseDocumentType = keyof typeof LEASE_DICTIONARY;

const DECIMAL_AMOUNT = /^-?(0|[1-9]\d*)\.\d{2}$/, INTEGER = /^-?(0|[1-9]\d*)$/, RATE = /^-?(0|[1-9]\d*)(\.\d{1,30})?$/;
/** Forme d'une valeur présente (hors jetons) ; une forme invalide rejette l'import, un vide ou un jeton se qualifie ensuite. */
export function fieldValueValid(spec: FieldSpec, value: string): boolean {
  if (value === UNKNOWN_TOKEN || value === NOT_APPLICABLE_TOKEN) return true;
  switch (spec.kind) {
    case "text": return value.trim().length > 0 && value.length <= 2000;
    case "date": return isCivilDate(value);
    case "amount": return DECIMAL_AMOUNT.test(value);
    case "integer": return INTEGER.test(value) && Math.abs(Number(value)) <= 100_000;
    case "rate": return RATE.test(value);
    case "enum": return spec.values!.includes(value);
  }
}
/** Champs inconnus du dictionnaire ou valeurs mal formées : la source est rejetée (`L16_IMPORT_SCHEMA_INVALID`). */
export function assertFields(type: LeaseDocumentType, fields: Record<string, string> | undefined) {
  const specs: readonly FieldSpec[] = LEASE_DICTIONARY[type];
  for (const [key, value] of Object.entries(fields ?? {})) {
    const spec = specs.find(s => s.key === key);
    if (!spec || !fieldValueValid(spec, value)) throw new Error("L16_IMPORT_SCHEMA_INVALID");
  }
}

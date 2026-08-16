/**
 * Lecture de la liasse fiscale pour le calcul d'IS.
 *
 * Les codes de case ne sont pas ecrits en dur dans le moteur : ils sont resolus
 * contre le millesime publie par le registre. Une case absente du millesime
 * produit une limitation, jamais une valeur supposee ni un repli sur un autre
 * millesime.
 */
import type {
  CentAmount,
  EvidenceStrength,
  TaxDeclarationField,
  TaxDocumentSnapshot,
} from "@/lib/canonical-model";
import { getTaxFormVintage } from "@/lib/knowledge/tax-registry";
import type { CorporateTaxAdjustmentCategory } from "./types";

export type CorporateTaxRegime = "standard" | "simplified";

interface DetailBoxMapping {
  readonly code: string;
  readonly category: CorporateTaxAdjustmentCategory;
  readonly direction: "reintegration" | "deduction";
}

interface RegimeFormMapping {
  readonly formNumber: string;
  readonly accountingProfit: string;
  readonly accountingLoss: string;
  /** Total declare des reintegrations, `null` si le millesime ne l'expose pas. */
  readonly reintegrationsTotal: string | null;
  readonly deductionsTotal: string | null;
  /** Cases detaillees, utilisees lorsque le total agrege n'existe pas. */
  readonly detailBoxes: readonly DetailBoxMapping[];
  readonly resultBeforeDeficitsProfit: string;
  readonly resultBeforeDeficitsDeficit: string;
  readonly deficitsOffset: string;
  readonly finalProfit: string;
  readonly finalDeficit: string;
}

export const CORPORATE_TAX_FORM_MAPPINGS: Readonly<Record<CorporateTaxRegime, RegimeFormMapping>> = {
  standard: {
    formNumber: "2058-A-SD",
    accountingProfit: "WA",
    accountingLoss: "WS",
    reintegrationsTotal: "WR",
    deductionsTotal: "XH",
    detailBoxes: [],
    resultBeforeDeficitsProfit: "XI",
    resultBeforeDeficitsDeficit: "XJ",
    deficitsOffset: "XL",
    finalProfit: "XN",
    finalDeficit: "XO",
  },
  simplified: {
    formNumber: "2033-B-SD",
    accountingProfit: "312",
    accountingLoss: "314",
    // Le millesime 2033-B publie n'expose pas de total agrege : le moteur
    // additionne les cases detaillees et le declare explicitement dans la trace.
    reintegrationsTotal: null,
    deductionsTotal: null,
    detailBoxes: [
      { code: "316", category: "explicit_non_deductible", direction: "reintegration" },
      { code: "318", category: "depreciation", direction: "reintegration" },
      { code: "322", category: "provisions", direction: "reintegration" },
      { code: "324", category: "accounted_tax", direction: "reintegration" },
    ],
    resultBeforeDeficitsProfit: "352",
    resultBeforeDeficitsDeficit: "354",
    deficitsOffset: "360",
    finalProfit: "370",
    finalDeficit: "372",
  },
} as const;

export const DEFICIT_FOLLOW_UP_FORM = "2058-B-SD";
export const DEFICIT_BOXES = {
  openingStock: "K4",
  transferred: "K4bis",
  offset: "K5",
  currentDeficit: "YJ",
  closingStock: "YK",
} as const;

export const DECLARATION_FORM = "2065-SD";
export const DECLARATION_BOXES = {
  normalRateBase: "C.RESULTAT_TAUX_NORMAL",
  reducedRateBase: "C.RESULTAT_TAUX_REDUIT",
  taxResultProfit: "C.RESULTAT_FISCAL_BENEFICE",
  taxResultDeficit: "C.RESULTAT_FISCAL_DEFICIT",
} as const;

export interface DeclarationAmount {
  readonly fieldCode: string;
  readonly amountCents: CentAmount;
  readonly snapshotId: string;
  readonly contentHash: string;
  readonly evidenceStrength: EvidenceStrength;
}

export interface DeclarationReadingIssue {
  readonly fieldCode: string;
  readonly formNumber: string;
  readonly reason:
    | "missing_field"
    | "field_not_usable"
    | "unsupported_millesime"
    | "box_absent_from_vintage"
    | "duplicate_field";
  readonly detail: string;
}

export interface DeclarationReading {
  readonly formNumber: string;
  readonly snapshotIds: readonly string[];
  readonly amounts: readonly DeclarationAmount[];
  readonly issues: readonly DeclarationReadingIssue[];
}

/** Un champ n'alimente un calcul que s'il a ete accepte et declare exploitable. */
function isUsableForCalculation(field: TaxDeclarationField): boolean {
  return field.processingStatus === "accepted" &&
    field.usableForAutomatedCalculation &&
    field.dataType === "amount" &&
    field.amountCents !== null;
}

function snapshotsForForm(
  snapshots: readonly TaxDocumentSnapshot[],
  formNumber: string,
  formVintage: number,
): readonly TaxDocumentSnapshot[] {
  return snapshots
    .filter((snapshot) =>
      snapshot.formNumber === formNumber &&
      snapshot.formVintage === formVintage &&
      snapshot.status === "active")
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Lit un jeu de cases sur un formulaire donne. La resolution passe d'abord par le
 * millesime du registre : une case inconnue du millesime n'est pas cherchee dans
 * les documents.
 */
export function readDeclarationBoxes(options: {
  readonly snapshots: readonly TaxDocumentSnapshot[];
  readonly formNumber: string;
  readonly formVintage: number;
  readonly fieldCodes: readonly string[];
}): DeclarationReading {
  const { snapshots, formNumber, formVintage, fieldCodes } = options;
  const issues: DeclarationReadingIssue[] = [];
  const amounts: DeclarationAmount[] = [];

  const vintage = getTaxFormVintage(formNumber, formVintage);
  if (!vintage) {
    return {
      formNumber,
      snapshotIds: [],
      amounts: [],
      issues: fieldCodes.map((fieldCode) => ({
        fieldCode,
        formNumber,
        reason: "unsupported_millesime" as const,
        detail: `Le millesime ${formVintage} du formulaire ${formNumber} n'est pas publie par le registre.`,
      })),
    };
  }

  const knownBoxes = new Set(vintage.boxes.map((box) => box.code));
  const documents = snapshotsForForm(snapshots, formNumber, formVintage);

  for (const fieldCode of fieldCodes) {
    if (!knownBoxes.has(fieldCode)) {
      issues.push({
        fieldCode,
        formNumber,
        reason: "box_absent_from_vintage",
        detail: `La case ${fieldCode} n'existe pas dans le millesime ${formVintage} de ${formNumber}.`,
      });
      continue;
    }
    const matches = documents.flatMap((snapshot) =>
      snapshot.fields
        .filter((field) => field.fieldCode === fieldCode)
        .map((field) => ({ snapshot, field })));

    if (matches.length === 0) {
      issues.push({
        fieldCode,
        formNumber,
        reason: "missing_field",
        detail: `La case ${fieldCode} de ${formNumber} n'est presente dans aucun snapshot actif.`,
      });
      continue;
    }
    if (matches.length > 1) {
      issues.push({
        fieldCode,
        formNumber,
        reason: "duplicate_field",
        detail: `La case ${fieldCode} de ${formNumber} apparait dans ${matches.length} snapshots actifs sans arbitrage.`,
      });
      continue;
    }

    const [{ snapshot, field }] = matches;
    if (!isUsableForCalculation(field)) {
      issues.push({
        fieldCode,
        formNumber,
        reason: "field_not_usable",
        detail: `La case ${fieldCode} de ${formNumber} n'est pas exploitable pour un calcul automatise (statut ${field.processingStatus}).`,
      });
      continue;
    }
    amounts.push({
      fieldCode,
      amountCents: field.amountCents as CentAmount,
      snapshotId: snapshot.id,
      contentHash: field.fieldHash,
      evidenceStrength: field.evidenceStrength,
    });
  }

  return {
    formNumber,
    snapshotIds: documents.map((snapshot) => snapshot.id),
    amounts: amounts.sort((left, right) => left.fieldCode.localeCompare(right.fieldCode)),
    issues: issues.sort((left, right) => left.fieldCode.localeCompare(right.fieldCode)),
  };
}

export function amountFor(reading: DeclarationReading, fieldCode: string): DeclarationAmount | undefined {
  return reading.amounts.find((amount) => amount.fieldCode === fieldCode);
}

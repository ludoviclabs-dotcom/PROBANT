/**
 * Lecture générique d'un formulaire déclaratif.
 *
 * Extrait de `corporate-tax/liasse.ts` (TAX-05) pour être partagé avec le moteur
 * TVA (TAX-06) : le comportement est identique, seules les cartes de cases
 * diffèrent d'un formulaire à l'autre.
 *
 * Deux garde-fous portés ici, valables pour tous les impôts :
 *  - une case inconnue du millésime publié n'est pas cherchée dans les documents ;
 *  - un champ non accepté ou non exploitable ne devient jamais une valeur.
 */
import type {
  CentAmount,
  EvidenceStrength,
  TaxDeclarationField,
  TaxDocumentSnapshot,
} from "@/lib/canonical-model";
import { getTaxFormVintage } from "@/lib/knowledge/tax-registry";

export interface DeclarationAmount {
  readonly fieldCode: string;
  /** Magnitude absolue ; le signe natif reste dans `sign`. */
  readonly amountCents: CentAmount;
  readonly sign: TaxDeclarationField["sign"];
  readonly status: "valid" | "normalized_with_warning";
  readonly diagnostics: readonly string[];
  readonly snapshotId: string;
  readonly contentHash: string;
  readonly evidenceStrength: EvidenceStrength;
}

export interface DeclarationReadingIssue {
  readonly fieldCode: string;
  readonly formNumber: string;
  readonly status: "normalized_with_warning" | "invalid" | "missing";
  readonly reason:
    | "missing_field"
    | "field_not_usable"
    | "unsupported_millesime"
    | "box_absent_from_vintage"
    | "duplicate_field"
    | "invalid_amount_invariant";
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
        status: "missing" as const,
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
        status: "missing",
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
        status: "missing",
        reason: "missing_field",
        detail: `La case ${fieldCode} de ${formNumber} n'est presente dans aucun snapshot actif.`,
      });
      continue;
    }
    if (matches.length > 1) {
      issues.push({
        fieldCode,
        formNumber,
        status: "invalid",
        reason: "duplicate_field",
        detail: `La case ${fieldCode} de ${formNumber} apparait dans ${matches.length} snapshots actifs sans arbitrage.`,
      });
      continue;
    }

    const [{ snapshot, field }] = matches;
    if (field.amountCents !== null && field.amountCents < 0) {
      issues.push({
        fieldCode,
        formNumber,
        status: "invalid",
        reason: "invalid_amount_invariant",
        detail: `La case ${fieldCode} porte un montant negatif contraire a l'invariant canonique (magnitude absolue et signe separe).`,
      });
      continue;
    }
    if (!isUsableForCalculation(field)) {
      const normalized = field.warnings.includes("DECLARATION_AMOUNT_SIGN_NORMALIZED");
      issues.push({
        fieldCode,
        formNumber,
        status: normalized ? "normalized_with_warning" : "invalid",
        reason: "field_not_usable",
        detail: `La case ${fieldCode} de ${formNumber} n'est pas exploitable pour un calcul automatise (statut ${field.processingStatus}).`,
      });
      continue;
    }
    amounts.push({
      fieldCode,
      amountCents: field.amountCents as CentAmount,
      sign: field.sign,
      status: field.warnings.includes("DECLARATION_AMOUNT_SIGN_NORMALIZED")
        ? "normalized_with_warning"
        : "valid",
      diagnostics: [...field.warnings].sort(),
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

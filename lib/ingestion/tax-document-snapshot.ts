import { getTaxFormVintage } from "@/lib/knowledge/tax-registry";
import type { TaxFormBox } from "@/lib/knowledge/tax-types";
import type {
  TaxDeclarationField,
  TaxDocumentSnapshot,
  TaxPeriod,
  TaxType,
} from "@/lib/canonical-model";
import { createTaxDeclarationField, createTaxDocumentSnapshot, createTaxPeriod } from "@/lib/tax/canonical";
import { stableHash } from "@/lib/synthesis/canonical";
import type { ParsedTaxDocumentInput, RawTaxFieldInput } from "./tax-document-input";
import type { IngestionDocumentMetadata, IngestionDocumentType } from "./types";

/**
 * Construction pure d'un snapshot de déclaration fiscale (TAX-03).
 *
 * Extrait de `processTaxDocument` pour être partagé avec les feuilles de
 * travail fiscales (Mission 13) : même normalisation, mêmes avertissements,
 * mêmes identifiants. Aucune entrée/sortie ici : le processeur d'ingestion
 * garde le stockage objet, le suivi de job et la persistance.
 */
export const TAX_DOCUMENT_PARSER_VERSION = "tax-document-processor-1.0.0";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

interface TaxDocumentSpec {
  taxType: TaxType;
  formNumbers: readonly string[];
  frequency: TaxPeriod["frequency"];
}

export const TAX_DOCUMENT_SPECS: Partial<Record<IngestionDocumentType, TaxDocumentSpec>> = {
  liasse_2050_2059: {
    taxType: "corporate_income_tax",
    formNumbers: ["2058-A-SD", "2058-B-SD"],
    frequency: "annual",
  },
  liasse_2033: {
    taxType: "corporate_income_tax",
    formNumbers: ["2033-B-SD"],
    frequency: "annual",
  },
  declaration_2065: {
    taxType: "corporate_income_tax",
    formNumbers: ["2065-SD"],
    frequency: "annual",
  },
  declaration_tva_ca3: {
    taxType: "vat",
    formNumbers: ["3310-CA3-SD"],
    frequency: "monthly",
  },
  declaration_tva_ca12: {
    taxType: "vat",
    formNumbers: ["3517-S-SD"],
    frequency: "annual",
  },
};

export interface TaxFieldImportTrace {
  documentId: string;
  page: number | null;
  sheet: string | null;
  cell: string | null;
  box: string | null;
  rawValue: string | null;
  normalizedValue: string | number | boolean | null;
  parserVersion: string;
  confidence: number;
  documentHash: string;
  warnings: readonly string[];
  processingStatus: "accepted" | "needs_manual_review" | "rejected";
  usableForAutomatedCalculation: boolean;
}

function defaultFormNumber(
  documentType: IngestionDocumentType,
  parsed: ParsedTaxDocumentInput,
): string | null {
  const configured = TAX_DOCUMENT_SPECS[documentType]?.formNumbers ?? [];
  if (configured.length === 1) return configured[0];
  if (documentType === "liasse_2050_2059") {
    const codes = parsed.fields.map((field) => field.code.toUpperCase());
    if (codes.some((code) => code.startsWith("2058B.") || ["K4", "K5", "K6", "YJ", "YK", "YN", "YO"].includes(code))) {
      return "2058-B-SD";
    }
    return "2058-A-SD";
  }
  return null;
}

function normalizedCode(code: string): string {
  return code
    .trim()
    .replace(/^(2058A|2058B|2033B)\./iu, "")
    .toUpperCase();
}

export function parseFrenchAmount(rawValue: string | null): number | null {
  if (!rawValue) return null;
  let value = rawValue
    .replace(/ | |\s/gu, "")
    .replace(/EUR|€/giu, "")
    .trim();
  let negative = false;
  if (/^\(.+\)$/u.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.startsWith("-")) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  if (!/^\d+(?:[.,]\d+)*$/u.test(value)) return null;
  let integerPart: string;
  let decimalPart = "";
  const commaIndex = value.lastIndexOf(",");
  if (commaIndex >= 0) {
    integerPart = value.slice(0, commaIndex).replace(/\./gu, "");
    decimalPart = value.slice(commaIndex + 1);
  } else {
    const dotIndex = value.lastIndexOf(".");
    if (dotIndex >= 0 && value.length - dotIndex - 1 <= 2) {
      integerPart = value.slice(0, dotIndex).replace(/\./gu, "");
      decimalPart = value.slice(dotIndex + 1);
    } else {
      integerPart = value.replace(/\./gu, "");
    }
  }
  if (!/^\d+$/u.test(integerPart) || !/^\d{0,2}$/u.test(decimalPart)) return null;
  const cents = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

function fieldDataType(box: TaxFormBox | undefined, raw: RawTaxFieldInput) {
  const declared = raw.declaredDataType;
  if (box) return box.dataType;
  if (["amount", "date", "text", "boolean", "percentage", "identifier"].includes(declared ?? "")) {
    return declared as TaxDeclarationField["dataType"];
  }
  return "text" as const;
}

interface DocumentOwner {
  organizationId: string;
  dossierId: string;
  documentId: string;
}

function buildFieldDraft(input: {
  raw: RawTaxFieldInput;
  box: TaxFormBox | undefined;
  formVintage: number;
  snapshotId: string;
  owner: DocumentOwner;
  documentHash: string;
  index: number;
}) {
  const warnings: string[] = [];
  const dataType = fieldDataType(input.box, input.raw);
  const parsedAmountCents = dataType === "amount" ? parseFrenchAmount(input.raw.rawValue) : null;
  // La frontière d'ingestion est le seul endroit autorisé à normaliser un
  // signe natif. La magnitude canonique reste absolue et le warning rend la
  // transformation traçable puis impose une revue humaine.
  const amountCents = parsedAmountCents !== null && parsedAmountCents < 0
    ? Math.abs(parsedAmountCents)
    : parsedAmountCents;
  let normalizedValue: string | boolean | null = null;
  let percentageBasisPoints: number | null = null;
  if (dataType === "text" || dataType === "date" || dataType === "identifier") {
    normalizedValue = input.raw.rawValue;
  } else if (dataType === "boolean") {
    const value = input.raw.rawValue?.trim().toLowerCase();
    if (["true", "1", "oui", "yes"].includes(value ?? "")) normalizedValue = true;
    else if (["false", "0", "non", "no"].includes(value ?? "")) normalizedValue = false;
  } else if (dataType === "percentage") {
    const parsed = parseFrenchAmount(input.raw.rawValue);
    percentageBasisPoints = parsed;
  }
  if (!input.box) warnings.push("UNKNOWN_FORM_BOX");
  if (input.raw.formula) warnings.push("SPREADSHEET_FORMULA_BLOCKED");
  if (dataType === "amount" && amountCents === null) warnings.push("AMOUNT_NORMALIZATION_FAILED");
  if (parsedAmountCents !== null && parsedAmountCents < 0) {
    warnings.push("DECLARATION_AMOUNT_SIGN_NORMALIZED");
  }
  if (parsedAmountCents !== null && parsedAmountCents < 0 && input.box?.sign === "positive") {
    warnings.push("NEGATIVE_AMOUNT_UNEXPECTED");
  }
  if (input.raw.extractionMethod === "text_layer") warnings.push("PDF_FIELD_REQUIRES_REVIEW");
  const processingStatus = warnings.length === 0
    ? "accepted" as const
    : "needs_manual_review" as const;
  const usableForAutomatedCalculation = processingStatus === "accepted" && input.raw.confidence >= 0.9;
  const fieldId = `taxfield_${stableHash({
    documentId: input.owner.documentId,
    code: input.raw.code,
    index: input.index,
    rawValue: input.raw.rawValue,
  }).slice(0, 32)}`;
  return {
    id: fieldId,
    organizationId: input.owner.organizationId,
    dossierId: input.owner.dossierId,
    taxDocumentSnapshotId: input.snapshotId,
    formVintage: input.formVintage,
    fieldCode: normalizedCode(input.raw.code),
    label: input.box?.label ?? `Case non reconnue ${input.raw.code}`,
    dataType,
    rawValue: input.raw.rawValue,
    amountCents,
    normalizedValue,
    percentageBasisPoints,
    unit: dataType === "amount"
      ? "cent" as const
      : dataType === "percentage"
        ? "basis_point" as const
        : dataType === "identifier"
          ? "identifier" as const
          : dataType,
    // Le signe natif est conservé séparément après normalisation de la
    // magnitude ; il n'est jamais réappliqué à `amountCents`.
    sign: parsedAmountCents !== null && parsedAmountCents < 0
      ? "negative" as const
      : input.box?.sign ?? "not_applicable" as const,
    documentHash: input.documentHash,
    sourceLocation: {
      page: input.raw.page,
      sheet: input.raw.sheet,
      cell: input.raw.cell,
      box: input.raw.box,
      zone: input.raw.box ? `case-${input.raw.box}` : null,
      structuredPath: input.raw.structuredPath,
    },
    extractionMethod: input.raw.extractionMethod,
    parserVersion: TAX_DOCUMENT_PARSER_VERSION,
    confidence: input.raw.confidence,
    processingStatus,
    usableForAutomatedCalculation,
    reviewStatus: "unreviewed" as const,
    warnings,
    evidenceStrength: input.raw.extractionMethod === "structured" ? "direct" as const : "insufficient" as const,
  };
}

export function tracesFromFields(
  documentId: string,
  fields: readonly TaxDeclarationField[],
): TaxFieldImportTrace[] {
  return fields.map((field) => ({
    documentId,
    page: field.sourceLocation.page,
    sheet: field.sourceLocation.sheet,
    cell: field.sourceLocation.cell,
    box: field.sourceLocation.box,
    rawValue: field.rawValue,
    normalizedValue: field.amountCents ?? field.percentageBasisPoints ?? field.normalizedValue,
    parserVersion: field.parserVersion,
    confidence: field.confidence,
    documentHash: field.documentHash,
    warnings: field.warnings,
    processingStatus: field.processingStatus,
    usableForAutomatedCalculation: field.usableForAutomatedCalculation,
  }));
}

export function emptyParsedTaxDocument(): ParsedTaxDocumentInput {
  return {
    schemaVersion: null,
    documentType: null,
    formNumber: null,
    formVintage: null,
    siren: null,
    periodStart: null,
    periodEnd: null,
    fiscalYear: null,
    fields: [],
    warnings: [],
  };
}

export function rawTaxFieldTraces(
  documentId: string,
  fields: readonly RawTaxFieldInput[],
  documentHash: string,
): TaxFieldImportTrace[] {
  return fields.map((field) => ({
    documentId,
    page: field.page,
    sheet: field.sheet,
    cell: field.cell,
    box: field.box,
    rawValue: field.rawValue,
    normalizedValue: null,
    parserVersion: TAX_DOCUMENT_PARSER_VERSION,
    confidence: field.confidence,
    documentHash,
    warnings: ["DOCUMENT_METADATA_INCOMPLETE"],
    processingStatus: "needs_manual_review",
    usableForAutomatedCalculation: false,
  }));
}

export interface TaxDocumentBuildInput {
  organizationId: string;
  dossierId: string;
  entityId: string;
  documentId: string;
  documentType: IngestionDocumentType;
  parsed: ParsedTaxDocumentInput;
  /** Erreurs du lecteur structuré, reprises comme avertissements. */
  parserWarnings: readonly string[];
  /** Métadonnées déclarées au dépôt ; le document les complète, jamais l'inverse. */
  metadata: IngestionDocumentMetadata;
  documentHash: string;
  createdAt: string;
}

export type TaxDocumentBuild =
  | { kind: "metadata_incomplete"; warnings: string[] }
  | { kind: "built"; period: TaxPeriod; snapshot: TaxDocumentSnapshot; warnings: string[]; requiresReview: boolean };

/**
 * Normalise une déclaration lue en `TaxPeriod` + `TaxDocumentSnapshot`.
 * Un snapshot n'est `active` que sans avertissement et avec des champs tous
 * exploitables ; sinon il reste `review_required` et n'alimente aucun calcul.
 */
export function buildTaxDocumentSnapshot(input: TaxDocumentBuildInput): TaxDocumentBuild {
  const { parsed, documentType } = input;
  const spec = TAX_DOCUMENT_SPECS[documentType];
  if (!spec) throw new Error(`TAX_PROCESSOR_NOT_CONFIGURED:${documentType}`);
  const metadata = {
    formNumber: parsed.formNumber ?? input.metadata.formNumber ?? defaultFormNumber(documentType, parsed),
    formVintage: parsed.formVintage ?? input.metadata.formVintage ?? null,
    siren: parsed.siren ?? input.metadata.siren ?? null,
    periodStart: parsed.periodStart ?? input.metadata.periodStart ?? null,
    periodEnd: parsed.periodEnd ?? input.metadata.periodEnd ?? null,
    fiscalYear: parsed.fiscalYear ?? input.metadata.fiscalYear ?? null,
  };
  const warnings = [...parsed.warnings, ...input.parserWarnings];
  if (parsed.documentType && parsed.documentType !== documentType) warnings.push("DOCUMENT_TYPE_MISMATCH");
  if (!metadata.formNumber) warnings.push("FORM_NUMBER_MISSING");
  if (!metadata.formVintage) warnings.push("FORM_VINTAGE_MISSING");
  if (!metadata.periodStart || !metadata.periodEnd) warnings.push("TAX_PERIOD_MISSING");
  if (metadata.periodStart && !ISO_DATE.test(metadata.periodStart)) warnings.push("TAX_PERIOD_START_INVALID");
  if (metadata.periodEnd && !ISO_DATE.test(metadata.periodEnd)) warnings.push("TAX_PERIOD_END_INVALID");
  if (metadata.periodStart && metadata.periodEnd && metadata.periodEnd < metadata.periodStart) {
    warnings.push("TAX_PERIOD_INCOHERENT");
  }
  if (metadata.formNumber && !spec.formNumbers.includes(metadata.formNumber)) warnings.push("FORM_NUMBER_DOCUMENT_TYPE_MISMATCH");
  if (metadata.siren && !/^\d{9}$/u.test(metadata.siren)) warnings.push("SIREN_INVALID");
  const expectedSiren = input.metadata.expectedSiren;
  if (expectedSiren && metadata.siren !== expectedSiren) warnings.push("SIREN_MISMATCH");
  if (input.metadata.expectedPeriodStart && metadata.periodStart !== input.metadata.expectedPeriodStart) warnings.push("PERIOD_START_MISMATCH");
  if (input.metadata.expectedPeriodEnd && metadata.periodEnd !== input.metadata.expectedPeriodEnd) warnings.push("PERIOD_END_MISMATCH");
  const fiscalYear = metadata.fiscalYear ?? (
    metadata.periodEnd && ISO_DATE.test(metadata.periodEnd)
      ? Number(metadata.periodEnd.slice(0, 4))
      : null
  );
  if (metadata.fiscalYear && metadata.periodEnd && metadata.fiscalYear !== Number(metadata.periodEnd.slice(0, 4))) {
    warnings.push("FISCAL_YEAR_PERIOD_MISMATCH");
  }

  const hasRequiredMetadata = Boolean(
    metadata.formNumber &&
    metadata.formVintage &&
    metadata.periodStart &&
    metadata.periodEnd &&
    ISO_DATE.test(metadata.periodStart) &&
    ISO_DATE.test(metadata.periodEnd) &&
    metadata.periodStart <= metadata.periodEnd &&
    fiscalYear,
  );
  if (!hasRequiredMetadata) return { kind: "metadata_incomplete", warnings: [...new Set(warnings)] };

  const form = getTaxFormVintage(metadata.formNumber!, metadata.formVintage!);
  if (!form) warnings.push("FORM_VINTAGE_UNKNOWN");
  const boxes = new Map((form?.boxes ?? []).map((box) => [box.code.toUpperCase(), box]));
  const periodId = `taxperiod_${stableHash({
    organizationId: input.organizationId,
    dossierId: input.dossierId,
    taxType: spec.taxType,
    startDate: metadata.periodStart,
    endDate: metadata.periodEnd,
    formVintage: metadata.formVintage,
  }).slice(0, 32)}`;
  const snapshotId = `taxdoc_${stableHash({
    organizationId: input.organizationId,
    dossierId: input.dossierId,
    sourceDocumentId: input.documentId,
    documentHash: input.documentHash,
  }).slice(0, 32)}`;
  const owner = { organizationId: input.organizationId, dossierId: input.dossierId, documentId: input.documentId };
  const draftFields = parsed.fields.map((raw, index) => buildFieldDraft({
    raw,
    box: boxes.get(normalizedCode(raw.code)),
    formVintage: metadata.formVintage!,
    snapshotId,
    owner,
    documentHash: input.documentHash,
    index,
  }));
  const counts = new Map<string, number>();
  for (const field of draftFields) counts.set(field.fieldCode, (counts.get(field.fieldCode) ?? 0) + 1);
  const fields = draftFields.map((draft) => {
    if ((counts.get(draft.fieldCode) ?? 0) <= 1) return createTaxDeclarationField(draft);
    return createTaxDeclarationField({
      ...draft,
      warnings: [...draft.warnings, "DUPLICATE_FORM_BOX"],
      processingStatus: "needs_manual_review",
      usableForAutomatedCalculation: false,
    });
  });
  if (fields.some((field) => field.warnings.includes("DUPLICATE_FORM_BOX"))) warnings.push("DUPLICATE_FORM_BOX");
  if (fields.some((field) => field.processingStatus !== "accepted")) warnings.push("FIELD_REVIEW_REQUIRED");
  if (fields.length === 0) warnings.push("NO_DECLARATION_FIELD");

  const period = createTaxPeriod({
    id: periodId,
    organizationId: input.organizationId,
    dossierId: input.dossierId,
    entityId: input.entityId,
    taxType: spec.taxType,
    startDate: metadata.periodStart!,
    endDate: metadata.periodEnd!,
    fiscalYear: fiscalYear!,
    formVintage: metadata.formVintage!,
    frequency: spec.frequency,
    accountingPeriodId: null,
    status: "unknown",
    version: "1",
    sourceRefs: [form?.sourceVersionId ?? `unverified:${metadata.formNumber}:${metadata.formVintage}`],
    createdAt: input.createdAt,
  });
  const uniqueWarnings = [...new Set(warnings)];
  const requiresReview = uniqueWarnings.length > 0 || fields.some((field) => !field.usableForAutomatedCalculation);
  const snapshot = createTaxDocumentSnapshot({
    id: snapshotId,
    organizationId: input.organizationId,
    dossierId: input.dossierId,
    entityId: input.entityId,
    logicalDocumentId: input.documentId,
    sourceDocumentId: input.documentId,
    taxPeriodId: period.id,
    taxPeriodVersion: period.version,
    taxType: spec.taxType,
    documentType,
    formNumber: metadata.formNumber!,
    formVintage: metadata.formVintage!,
    snapshotVersion: "1",
    schemaVersion: parsed.schemaVersion ?? "probant-tax-document-1",
    parserName: "PROBANT TaxDocumentProcessor",
    parserVersion: TAX_DOCUMENT_PARSER_VERSION,
    sourceHash: input.documentHash,
    fields,
    warnings: uniqueWarnings,
    limitationIds: requiresReview ? ["tax-document-manual-review"] : [],
    supersedesSnapshotId: null,
    status: requiresReview ? "review_required" : "active",
    createdAt: input.createdAt,
    createdBy: "system:tax-document-processor",
  });
  return { kind: "built", period, snapshot, warnings: uniqueWarnings, requiresReview };
}

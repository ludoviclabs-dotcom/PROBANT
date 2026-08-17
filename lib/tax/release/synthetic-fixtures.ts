/**
 * Corpus synthétique de release TAX-10.
 *
 * Ces données ne décrivent aucune entreprise réelle. Les millésimes 2025 et
 * 2027 sont volontairement présents pour vérifier qu'un moteur n'emprunte
 * jamais silencieusement le registre 2026, seul millésime fiscal publié dans
 * PROBANT à la date de cette release.
 */
import type { FecEntry, TaxDocumentSnapshot, TaxPeriod, TaxProfile } from "@/lib/canonical-model";
import { sha256Hex } from "@/lib/synthesis/canonical";
import {
  createTaxDeclarationField,
  createTaxDocumentSnapshot,
  createTaxPeriod,
  createTaxProfile,
} from "@/lib/tax/canonical";

export const TAX_RELEASE_YEARS = [2025, 2026, 2027] as const;
export type TaxReleaseYear = (typeof TAX_RELEASE_YEARS)[number];

export const TAX_RELEASE_CREATED_AT = "2026-08-17T08:00:00.000Z";
export const TAX_RELEASE_ORGANIZATION_ID = "org-tax-release-synthetic";
export const TAX_RELEASE_DOSSIER_ID = "dossier-tax-release-synthetic";
export const TAX_RELEASE_ENTITY_ID = "entity-tax-release-synthetic";

export type SyntheticTaxDocumentKind =
  | "fec"
  | "balance"
  | "form_2058_a"
  | "form_2033_b"
  | "declaration_2065"
  | "declaration_tva_ca3"
  | "declaration_tva_ca12"
  | "invoices"
  | "tax_notice"
  | "payroll_summary";

export interface SyntheticTaxFile {
  readonly id: string;
  readonly kind: SyntheticTaxDocumentKind;
  readonly fiscalYear: TaxReleaseYear;
  readonly fileName: string;
  readonly mediaType: string;
  readonly content: string;
  readonly sha256: string;
  readonly synthetic: true;
}

export interface SyntheticTaxFixtureSet {
  readonly id: string;
  readonly fiscalYear: TaxReleaseYear;
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly files: readonly SyntheticTaxFile[];
  readonly fecEntries: readonly FecEntry[];
  readonly profile: TaxProfile;
  readonly corporatePeriod: TaxPeriod;
  readonly vatPeriod: TaxPeriod;
  readonly documentSnapshots: readonly TaxDocumentSnapshot[];
  readonly availableInvoiceRefs: readonly string[];
  readonly fixtureHash: string;
}

export function cents(euros: number): number {
  const value = euros * 100;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`TAX_RELEASE_AMOUNT_NOT_EXACT:${euros}`);
  }
  return value;
}

function syntheticFile(
  year: TaxReleaseYear,
  kind: SyntheticTaxDocumentKind,
  extension: string,
  mediaType: string,
  content: string,
): SyntheticTaxFile {
  const normalized = content.replace(/\r\n/gu, "\n");
  return Object.freeze({
    id: `tax-release-${year}-${kind}`,
    kind,
    fiscalYear: year,
    fileName: `${year}-${kind}.${extension}`,
    mediaType,
    content: normalized,
    sha256: sha256Hex(normalized),
    synthetic: true,
  });
}

function fecEntries(year: TaxReleaseYear): readonly FecEntry[] {
  const date = `${year}0315`;
  const rows: FecEntry[] = [];
  let line = 0;
  const add = (input: {
    journalCode: string;
    ecritureNum: string;
    compteNum: string;
    debit?: number;
    credit?: number;
    pieceRef: string;
    label: string;
  }) => {
    line += 1;
    const debit = input.debit ?? 0;
    const credit = input.credit ?? 0;
    rows.push({
      ligne: line,
      journalCode: input.journalCode,
      journalLib: input.journalCode === "VE" ? "Ventes" : "Achats",
      ecritureNum: input.ecritureNum,
      ecritureDate: date,
      compteNum: input.compteNum,
      compteLib: `Compte ${input.compteNum}`,
      compAuxNum: "",
      compAuxLib: "",
      pieceRef: input.pieceRef,
      pieceDate: date,
      ecritureLib: input.label,
      debit,
      credit,
      ecritureLet: "",
      dateLet: "",
      validDate: `${year}0331`,
      montant: debit - credit,
    });
  };

  add({ journalCode: "VE", ecritureNum: "V001", compteNum: "411000", debit: 1_200, pieceRef: "FA-001", label: "Facture vente synthétique" });
  add({ journalCode: "VE", ecritureNum: "V001", compteNum: "706000", credit: 1_000, pieceRef: "FA-001", label: "Facture vente synthétique" });
  add({ journalCode: "VE", ecritureNum: "V001", compteNum: "445710", credit: 200, pieceRef: "FA-001", label: "TVA collectée synthétique" });
  add({ journalCode: "AC", ecritureNum: "A001", compteNum: "607000", debit: 500, pieceRef: "FF-001", label: "Facture achat synthétique" });
  add({ journalCode: "AC", ecritureNum: "A001", compteNum: "445660", debit: 100, pieceRef: "FF-001", label: "TVA déductible synthétique" });
  add({ journalCode: "AC", ecritureNum: "A001", compteNum: "401000", credit: 600, pieceRef: "FF-001", label: "Facture achat synthétique" });
  return Object.freeze(rows);
}

function fecContent(entries: readonly FecEntry[]): string {
  const header = "JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise";
  const rows = entries.map((entry) => [
    entry.journalCode,
    entry.journalLib,
    entry.ecritureNum,
    entry.ecritureDate,
    entry.compteNum,
    entry.compteLib,
    entry.compAuxNum,
    entry.compAuxLib,
    entry.pieceRef,
    entry.pieceDate,
    entry.ecritureLib,
    entry.debit.toFixed(2).replace(".", ","),
    entry.credit.toFixed(2).replace(".", ","),
    entry.ecritureLet,
    entry.dateLet,
    entry.validDate,
    "",
    "EUR",
  ].join("|"));
  return `${[header, ...rows].join("\n")}\n`;
}

export function buildSyntheticTaxProfile(
  year: TaxReleaseYear,
  overrides: Partial<Parameters<typeof createTaxProfile>[0]> = {},
): TaxProfile {
  return createTaxProfile({
    id: `tax-profile-${year}`,
    organizationId: TAX_RELEASE_ORGANIZATION_ID,
    dossierId: TAX_RELEASE_DOSSIER_ID,
    entityId: TAX_RELEASE_ENTITY_ID,
    version: String(year),
    jurisdiction: "FR",
    status: "confirmed",
    corporateIncomeTaxRegime: "standard",
    vatRegime: "real_normal",
    accountingPeriod: { startDate: `${year}-01-01`, endDate: `${year}-12-31` },
    corporateIncomeTaxGroupStatus: "none",
    vatGroupStatus: "none",
    turnoverAmountCents: cents(5_000_000),
    capitalPaidStatus: "partially_paid",
    ownershipStatus: "unknown",
    qualifyingIndividualOwnershipBasisPoints: null,
    vatLiabilityRatioStatus: "unknown",
    vatLiabilityRatioBasisPoints: null,
    establishments: [],
    parameters: [],
    confirmedBy: "reviewer-tax-release",
    confirmedAt: TAX_RELEASE_CREATED_AT,
    createdAt: TAX_RELEASE_CREATED_AT,
    ...overrides,
  });
}

export function buildSyntheticTaxPeriod(
  year: TaxReleaseYear,
  taxType: "corporate_income_tax" | "vat",
  overrides: Partial<Parameters<typeof createTaxPeriod>[0]> = {},
): TaxPeriod {
  const monthly = taxType === "vat";
  return createTaxPeriod({
    id: `${taxType}-period-${year}`,
    organizationId: TAX_RELEASE_ORGANIZATION_ID,
    dossierId: TAX_RELEASE_DOSSIER_ID,
    entityId: TAX_RELEASE_ENTITY_ID,
    taxType,
    startDate: monthly ? `${year}-03-01` : `${year}-01-01`,
    endDate: monthly ? `${year}-03-31` : `${year}-12-31`,
    fiscalYear: year,
    formVintage: year,
    frequency: monthly ? "monthly" : "annual",
    accountingPeriodId: `accounting-period-${year}`,
    status: "filed",
    version: String(year),
    sourceRefs: taxType === "vat" ? [`synthetic-ca3-${year}`] : [`synthetic-liasse-${year}`],
    createdAt: TAX_RELEASE_CREATED_AT,
    ...overrides,
  });
}

export function buildSyntheticFormSnapshot(options: {
  readonly year: TaxReleaseYear;
  readonly id: string;
  readonly taxType: "corporate_income_tax" | "vat";
  readonly taxPeriodId: string;
  readonly documentType: string;
  readonly formNumber: string;
  readonly boxes: Readonly<Record<string, number>>;
  /** Hash du fichier synthétique réellement déposé, lorsque le snapshot en dérive. */
  readonly sourceHash?: string;
}): TaxDocumentSnapshot {
  const raw = JSON.stringify({
    synthetic: true,
    fiscalYear: options.year,
    formNumber: options.formNumber,
    boxes: options.boxes,
  });
  const sourceHash = options.sourceHash ?? sha256Hex(raw);
  return createTaxDocumentSnapshot({
    id: options.id,
    organizationId: TAX_RELEASE_ORGANIZATION_ID,
    dossierId: TAX_RELEASE_DOSSIER_ID,
    entityId: TAX_RELEASE_ENTITY_ID,
    logicalDocumentId: `logical-${options.id}`,
    sourceDocumentId: `source-${options.id}`,
    taxPeriodId: options.taxPeriodId,
    taxPeriodVersion: String(options.year),
    taxType: options.taxType,
    documentType: options.documentType,
    formNumber: options.formNumber,
    formVintage: options.year,
    snapshotVersion: "1",
    schemaVersion: `synthetic-${options.year}.1`,
    parserName: "tax-release-synthetic-fixture",
    parserVersion: "1",
    sourceHash,
    fields: Object.entries(options.boxes).map(([fieldCode, amountCents]) =>
      createTaxDeclarationField({
        id: `${options.id}:${fieldCode}`,
        organizationId: TAX_RELEASE_ORGANIZATION_ID,
        dossierId: TAX_RELEASE_DOSSIER_ID,
        taxDocumentSnapshotId: options.id,
        formVintage: options.year,
        fieldCode,
        label: `Case synthétique ${fieldCode}`,
        dataType: "amount",
        rawValue: String(amountCents),
        amountCents,
        normalizedValue: null,
        percentageBasisPoints: null,
        unit: "cent",
        sign: "signed",
        documentHash: sourceHash,
        sourceLocation: {
          page: 1,
          sheet: null,
          cell: null,
          box: fieldCode,
          zone: `synthetic-${fieldCode}`,
          structuredPath: `boxes.${fieldCode}`,
        },
        extractionMethod: "structured",
        parserVersion: "1",
        confidence: 1,
        processingStatus: "accepted",
        usableForAutomatedCalculation: true,
        reviewStatus: "verified",
        warnings: [],
        evidenceStrength: "direct",
      })),
    warnings: ["SYNTHETIC_RELEASE_FIXTURE"],
    limitationIds: [],
    supersedesSnapshotId: null,
    status: "active",
    createdAt: TAX_RELEASE_CREATED_AT,
    createdBy: "tax-release-fixture",
  });
}

export function buildSyntheticTaxFixtureSet(year: TaxReleaseYear): SyntheticTaxFixtureSet {
  const entries = fecEntries(year);
  const profile = buildSyntheticTaxProfile(year);
  const corporatePeriod = buildSyntheticTaxPeriod(year, "corporate_income_tax");
  const vatPeriod = buildSyntheticTaxPeriod(year, "vat");
  const corporateBoxes = {
    WA: cents(100_000), WS: 0, WR: 0, XH: 0,
    XI: cents(100_000), XJ: 0, XL: 0, XN: cents(100_000), XO: 0,
  };
  const simplifiedBoxes = {
    312: cents(100_000), 314: 0, 316: 0, 318: 0, 322: 0, 324: 0,
    352: cents(100_000), 354: 0, 360: 0, 370: cents(100_000), 372: 0,
  };
  const ca3Boxes = {
    "08": cents(1_000), "16": cents(200), "23": cents(100),
    "28": cents(100), "25": 0, "22": 0, "27": 0,
  };
  const ca12Boxes = {
    "19": cents(200), "26": cents(100), "54": cents(100),
    "29": 0, "24": 0, "51": 0,
  };
  const declaration2065Boxes = {
    "C.RESULTAT_TAUX_NORMAL": cents(100_000),
    "C.IS_BRUT": cents(25_000),
  };
  const files = [
    syntheticFile(year, "fec", "txt", "text/plain", fecContent(entries)),
    syntheticFile(year, "balance", "csv", "text/csv", `Compte;Libellé;Débit;Crédit\n411000;Clients;${cents(1_200)};0\n706000;Prestations;0;${cents(1_000)}\n445710;TVA collectée;0;${cents(200)}\n`),
    syntheticFile(year, "form_2058_a", "json", "application/json", JSON.stringify({ synthetic: true, year, boxes: corporateBoxes })),
    syntheticFile(year, "form_2033_b", "json", "application/json", JSON.stringify({ synthetic: true, year, boxes: simplifiedBoxes })),
    syntheticFile(year, "declaration_2065", "json", "application/json", JSON.stringify({ synthetic: true, year, boxes: declaration2065Boxes })),
    syntheticFile(year, "declaration_tva_ca3", "json", "application/json", JSON.stringify({ synthetic: true, year, boxes: ca3Boxes })),
    syntheticFile(year, "declaration_tva_ca12", "json", "application/json", JSON.stringify({ synthetic: true, year, boxes: ca12Boxes })),
    syntheticFile(year, "invoices", "json", "application/json", JSON.stringify({ synthetic: true, year, invoices: [{ reference: "FA-001", totalCents: cents(1_200) }, { reference: "FF-001", totalCents: cents(600) }] })),
    syntheticFile(year, "tax_notice", "json", "application/json", JSON.stringify({ synthetic: true, year, tax: "CFE", amountCents: cents(1_250), establishment: "SYNTHETIC-PARIS" })),
    syntheticFile(year, "payroll_summary", "csv", "text/csv", `Période;BrutCents;CotisationsCents\n${year}-03;${cents(50_000)};${cents(21_000)}\n`),
  ] as const;
  const fileHash = (kind: SyntheticTaxDocumentKind): string => {
    const file = files.find((candidate) => candidate.kind === kind);
    if (!file) throw new Error(`TAX_RELEASE_FIXTURE_DOCUMENT_MISSING:${kind}`);
    return file.sha256;
  };
  const snapshots = [
    buildSyntheticFormSnapshot({ year, id: `snapshot-2058-a-${year}`, taxType: "corporate_income_tax", taxPeriodId: corporatePeriod.id, documentType: "form_2058_a", formNumber: "2058-A-SD", boxes: corporateBoxes, sourceHash: fileHash("form_2058_a") }),
    buildSyntheticFormSnapshot({ year, id: `snapshot-2033-b-${year}`, taxType: "corporate_income_tax", taxPeriodId: corporatePeriod.id, documentType: "form_2033_b", formNumber: "2033-B-SD", boxes: simplifiedBoxes, sourceHash: fileHash("form_2033_b") }),
    buildSyntheticFormSnapshot({ year, id: `snapshot-2065-${year}`, taxType: "corporate_income_tax", taxPeriodId: corporatePeriod.id, documentType: "declaration_2065", formNumber: "2065-SD", boxes: declaration2065Boxes, sourceHash: fileHash("declaration_2065") }),
    buildSyntheticFormSnapshot({ year, id: `snapshot-ca3-${year}`, taxType: "vat", taxPeriodId: vatPeriod.id, documentType: "declaration_tva_ca3", formNumber: "3310-CA3-SD", boxes: ca3Boxes, sourceHash: fileHash("declaration_tva_ca3") }),
    buildSyntheticFormSnapshot({ year, id: `snapshot-ca12-${year}`, taxType: "vat", taxPeriodId: vatPeriod.id, documentType: "declaration_tva_ca12", formNumber: "3517-S-SD", boxes: ca12Boxes, sourceHash: fileHash("declaration_tva_ca12") }),
  ] as const;
  const fixtureHash = sha256Hex(JSON.stringify(files.map((file) => ({
    kind: file.kind,
    fiscalYear: file.fiscalYear,
    sha256: file.sha256,
  }))));

  return Object.freeze({
    id: `tax-release-fixture-${year}`,
    fiscalYear: year,
    organizationId: TAX_RELEASE_ORGANIZATION_ID,
    dossierId: TAX_RELEASE_DOSSIER_ID,
    entityId: TAX_RELEASE_ENTITY_ID,
    files: Object.freeze(files),
    fecEntries: entries,
    profile,
    corporatePeriod,
    vatPeriod,
    documentSnapshots: Object.freeze(snapshots),
    availableInvoiceRefs: Object.freeze(["FA-001", "FF-001"]),
    fixtureHash,
  });
}

export const SYNTHETIC_TAX_FIXTURES = Object.freeze(
  TAX_RELEASE_YEARS.map((year) => buildSyntheticTaxFixtureSet(year)),
);

export function fixtureDocument(
  fixture: SyntheticTaxFixtureSet,
  kind: SyntheticTaxDocumentKind,
): SyntheticTaxFile {
  const file = fixture.files.find((candidate) => candidate.kind === kind);
  if (!file) throw new Error(`TAX_RELEASE_FIXTURE_DOCUMENT_MISSING:${kind}`);
  return file;
}

export function fixtureSnapshot(
  fixture: SyntheticTaxFixtureSet,
  documentType: string,
): TaxDocumentSnapshot {
  const snapshot = fixture.documentSnapshots.find((candidate) => candidate.documentType === documentType);
  if (!snapshot) throw new Error(`TAX_RELEASE_FIXTURE_SNAPSHOT_MISSING:${documentType}`);
  return snapshot;
}

/** Golden cases exécutables de la release gate TAX-10. */
import type { FecEntry, TaxDocumentSnapshot } from "@/lib/canonical-model";
import type { CorporateTaxComputationInput, CorporateTaxComputationResult } from "@/lib/tax/corporate-tax";
import { computeCorporateTax } from "@/lib/tax/corporate-tax";
import type { VatReconciliationInput, VatReconciliationResult } from "@/lib/tax/vat";
import { reconcileVat } from "@/lib/tax/vat";
import {
  TAX_RELEASE_CREATED_AT,
  TAX_RELEASE_DOSSIER_ID,
  TAX_RELEASE_ENTITY_ID,
  TAX_RELEASE_ORGANIZATION_ID,
  buildSyntheticFormSnapshot,
  buildSyntheticTaxFixtureSet,
  buildSyntheticTaxPeriod,
  buildSyntheticTaxProfile,
  cents,
  fixtureSnapshot,
} from "./synthetic-fixtures";

export const CORPORATE_TAX_GOLDEN_CASE_IDS = [
  "is-zero-adjustment",
  "is-reintegration",
  "is-deduction",
  "is-loss",
  "is-deficit",
  "is-reduced-rate",
  "is-reduced-rate-unproven",
  "is-inconsistent-return",
  "is-divergent-tax-charge",
  "is-missing-declaration",
] as const;

export const VAT_GOLDEN_CASE_IDS = [
  "vat-ca3-exact",
  "vat-collected-difference",
  "vat-deductible-difference",
  "vat-missing-invoice",
  "vat-multiple-rates",
  "vat-credit-note",
  "vat-credit",
  "vat-reverse-charge",
  "vat-shifted-period",
  "vat-ca12",
  "vat-unknown-regime",
] as const;

export type CorporateTaxGoldenCaseId = (typeof CORPORATE_TAX_GOLDEN_CASE_IDS)[number];
export type VatGoldenCaseId = (typeof VAT_GOLDEN_CASE_IDS)[number];

export interface TaxGoldenCaseDefinition<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly expectedStatus: string;
  readonly expectedOutcome: string;
  readonly expectedSnapshotHash: string;
  readonly requiredEvidence: readonly string[];
}

export const CORPORATE_TAX_GOLDEN_CASES: readonly TaxGoldenCaseDefinition<CorporateTaxGoldenCaseId>[] = Object.freeze([
  { id: "is-zero-adjustment", label: "Zéro retraitement", expectedStatus: "computed", expectedOutcome: "passed", expectedSnapshotHash: "0eb1b5028ad63493a81c04c0a94666c17146f2572c0eb9b1af9dec38577c4033", requiredEvidence: ["2058-A"] },
  { id: "is-reintegration", label: "Réintégration", expectedStatus: "computed", expectedOutcome: "passed", expectedSnapshotHash: "77cbdf1fb3194d6368ce0734f85a0f6521cfb975ba0cdb246850d81a73038f99", requiredEvidence: ["2058-A"] },
  { id: "is-deduction", label: "Déduction", expectedStatus: "computed", expectedOutcome: "passed", expectedSnapshotHash: "142f79f59651eb0fb15070453d3dec1eb1f53fd8e66822667d3f63848d17d71f", requiredEvidence: ["2058-A"] },
  { id: "is-loss", label: "Perte", expectedStatus: "computed", expectedOutcome: "passed", expectedSnapshotHash: "5ddc0ce75d098fd4046084659a14e97b7f3de3f99cd51a89d730f43aa06ecdb5", requiredEvidence: ["2058-A"] },
  { id: "is-deficit", label: "Déficit", expectedStatus: "computed", expectedOutcome: "passed", expectedSnapshotHash: "02b976ff9468994cdb9d9df7f624af882b5add36243d6aee836265d2b22544cc", requiredEvidence: ["2058-A", "2058-B"] },
  { id: "is-reduced-rate", label: "Taux réduit démontré", expectedStatus: "computed", expectedOutcome: "passed", expectedSnapshotHash: "cd41520ded4f57dacc6d7a37047758444bc7356f6dae62e160deb7fa077d1c84", requiredEvidence: ["2058-A", "profil confirmé"] },
  { id: "is-reduced-rate-unproven", label: "Taux réduit non démontré", expectedStatus: "computed", expectedOutcome: "missing_information", expectedSnapshotHash: "9d895ab3e6db92fd5b57977a4d0198cc4bcae18a7c2c0cffe3ee6a57e52b818f", requiredEvidence: ["2058-A", "capital et détention"] },
  { id: "is-inconsistent-return", label: "Liasse incohérente", expectedStatus: "blocked", expectedOutcome: "reconciliation_difference", expectedSnapshotHash: "786df5411eafb9101c29731585ce708f9bacbaa6bf8f7b383434050fe95937c9", requiredEvidence: ["2058-A"] },
  { id: "is-divergent-tax-charge", label: "Charge d’IS divergente", expectedStatus: "computed", expectedOutcome: "reconciliation_difference", expectedSnapshotHash: "3e98b2fbf98e986ec550f080ddc1e3f40947dbb10ac6be6a8c8ea3cf8f58f4f1", requiredEvidence: ["2058-A", "FEC"] },
  { id: "is-missing-declaration", label: "Déclaration absente", expectedStatus: "blocked", expectedOutcome: "missing_information", expectedSnapshotHash: "4fe975b0b3e2ef33a7eaeb04c2a339018838009ced9cbf8336977cdd44121fae", requiredEvidence: ["2058-A ou 2033-B"] },
]);

export const VAT_GOLDEN_CASES: readonly TaxGoldenCaseDefinition<VatGoldenCaseId>[] = Object.freeze([
  { id: "vat-ca3-exact", label: "CA3 exacte", expectedStatus: "reconciled", expectedOutcome: "passed", expectedSnapshotHash: "88c4ec92cb0bb488d0c56b72880aa67205e1732e75dc715c512548cfa383f7b1", requiredEvidence: ["FEC", "CA3", "factures"] },
  { id: "vat-collected-difference", label: "Écart de TVA collectée", expectedStatus: "reconciled", expectedOutcome: "reconciliation_difference", expectedSnapshotHash: "b749943833d068f15e67504b9cdc899ed5acde755da42c53aefcb8b6b2687f43", requiredEvidence: ["FEC", "CA3"] },
  { id: "vat-deductible-difference", label: "Écart de TVA déductible", expectedStatus: "reconciled", expectedOutcome: "reconciliation_difference", expectedSnapshotHash: "9b103ecb76a9cd3a280ae2757ca4990d5b80d85c66b583a000581cd63063196f", requiredEvidence: ["FEC", "CA3", "factures"] },
  { id: "vat-missing-invoice", label: "Facture absente", expectedStatus: "reconciled", expectedOutcome: "potential_tax_risk", expectedSnapshotHash: "b9344478b7a54e4b05ff82de1a687b6c40eab0993ce1ebaba6e87438bfda5ebc", requiredEvidence: ["inventaire de factures"] },
  { id: "vat-multiple-rates", label: "Taux multiples", expectedStatus: "reconciled", expectedOutcome: "reconciliation_difference", expectedSnapshotHash: "3b8232a13122f88c8491568d63d17acb01238ef57bf622deb04895e6e2200332", requiredEvidence: ["FEC", "CA3"] },
  { id: "vat-credit-note", label: "Avoir", expectedStatus: "reconciled", expectedOutcome: "passed", expectedSnapshotHash: "1e72e3a91175ec5fedeb9e0f84f7e821ff14d173bbd19484a0151e64c3e3cab8", requiredEvidence: ["FEC", "CA3"] },
  { id: "vat-credit", label: "Crédit", expectedStatus: "reconciled", expectedOutcome: "reconciliation_difference", expectedSnapshotHash: "72aad40c7ada3953301781961d357e171055f57d2c76d9b9a21f5956baa27ef9", requiredEvidence: ["FEC", "CA3"] },
  { id: "vat-reverse-charge", label: "Autoliquidation avec base collectée non rattachée", expectedStatus: "reconciled", expectedOutcome: "missing_information", expectedSnapshotHash: "2637163f6180a1b33cbf83b05f837be89d8c70f4ba0ae2ac09445f5f7b57c58c", requiredEvidence: ["FEC", "CA3", "base HT ou pièce de rattachement"] },
  { id: "vat-shifted-period", label: "Période décalée", expectedStatus: "reconciled", expectedOutcome: "review_recommendation", expectedSnapshotHash: "b1b0010d2a52fce6d7d2b600c3a55a4129e0e52e1ceb16927c899ebace05cdd5", requiredEvidence: ["FEC", "dates de pièces"] },
  { id: "vat-ca12", label: "CA12", expectedStatus: "reconciled", expectedOutcome: "missing_information", expectedSnapshotHash: "55fdb178c82b2ad8f79e03c4c9803c557bcef3e3afe5f4f3f6e4491449ce784f", requiredEvidence: ["FEC", "CA12"] },
  { id: "vat-unknown-regime", label: "Régime inconnu", expectedStatus: "blocked", expectedOutcome: "missing_information", expectedSnapshotHash: "c54c15c93b1a4738aae6755fee7d7562b3e28ba38cba56f9c6aaf456ce114f3a", requiredEvidence: ["profil fiscal"] },
]);

const fixture = buildSyntheticTaxFixtureSet(2026);

function isForm(
  id: string,
  documentType: string,
  formNumber: string,
  boxes: Readonly<Record<string, number>>,
): TaxDocumentSnapshot {
  return buildSyntheticFormSnapshot({
    year: 2026,
    id,
    taxType: "corporate_income_tax",
    taxPeriodId: fixture.corporatePeriod.id,
    documentType,
    formNumber,
    boxes,
  });
}

function coherent2058A(options: {
  readonly profit?: number;
  readonly loss?: number;
  readonly reintegrations?: number;
  readonly deductions?: number;
  readonly deficitOffset?: number;
}): TaxDocumentSnapshot {
  const profit = options.profit ?? 0;
  const loss = options.loss ?? 0;
  const reintegrations = options.reintegrations ?? 0;
  const deductions = options.deductions ?? 0;
  const deficitOffset = options.deficitOffset ?? 0;
  const beforeDeficit = profit - loss + reintegrations - deductions;
  const afterDeficit = beforeDeficit - deficitOffset;
  return isForm(`golden-2058-a-${profit}-${loss}-${reintegrations}-${deductions}-${deficitOffset}`, "form_2058_a", "2058-A-SD", {
    WA: profit,
    WS: loss,
    WR: reintegrations,
    XH: deductions,
    XI: Math.max(beforeDeficit, 0),
    XJ: Math.max(-beforeDeficit, 0),
    XL: deficitOffset,
    XN: Math.max(afterDeficit, 0),
    XO: Math.max(-afterDeficit, 0),
  });
}

export function buildCorporateTaxGoldenInput(id: CorporateTaxGoldenCaseId): CorporateTaxComputationInput {
  let profile = fixture.profile;
  let documents: readonly TaxDocumentSnapshot[] = [coherent2058A({ profit: cents(100_000) })];
  let accountedPositions: CorporateTaxComputationInput["accountedPositions"];

  switch (id) {
    case "is-reintegration":
      documents = [coherent2058A({ profit: cents(100_000), reintegrations: cents(20_000) })];
      break;
    case "is-deduction":
      documents = [coherent2058A({ profit: cents(100_000), deductions: cents(30_000) })];
      break;
    case "is-loss":
      documents = [coherent2058A({ loss: cents(50_000) })];
      break;
    case "is-deficit":
      documents = [
        coherent2058A({ profit: cents(100_000), deficitOffset: cents(40_000) }),
        isForm("golden-2058-b-deficit", "form_2058_b", "2058-B-SD", { K4: cents(40_000) }),
      ];
      break;
    case "is-reduced-rate":
      profile = buildSyntheticTaxProfile(2026, {
        capitalPaidStatus: "fully_paid",
        ownershipStatus: "known",
        qualifyingIndividualOwnershipBasisPoints: 10_000,
      });
      documents = [coherent2058A({ profit: cents(30_000) })];
      break;
    case "is-reduced-rate-unproven":
      profile = buildSyntheticTaxProfile(2026, {
        capitalPaidStatus: "unknown",
        ownershipStatus: "unknown",
        qualifyingIndividualOwnershipBasisPoints: null,
      });
      documents = [coherent2058A({ profit: cents(60_000) })];
      break;
    case "is-inconsistent-return":
      documents = [isForm("golden-2058-a-inconsistent", "form_2058_a", "2058-A-SD", {
        WA: cents(100_000), WS: cents(50_000), WR: 0, XH: 0,
        XI: cents(100_000), XL: 0, XN: cents(100_000),
      })];
      break;
    case "is-divergent-tax-charge":
      accountedPositions = {
        chargeCents: cents(26_000),
        liabilityCents: null,
        snapshotId: "golden-fec-is-charge",
        contentHash: fixtureDocumentHash("fec"),
      };
      break;
    case "is-missing-declaration":
      documents = [];
      break;
    case "is-zero-adjustment":
      break;
  }

  return {
    organizationId: TAX_RELEASE_ORGANIZATION_ID,
    dossierId: TAX_RELEASE_DOSSIER_ID,
    entityId: TAX_RELEASE_ENTITY_ID,
    executionId: `golden-execution-${id}`,
    snapshotId: `golden-snapshot-${id}`,
    profile,
    period: fixture.corporatePeriod,
    documentSnapshots: documents,
    accountedPositions,
    createdAt: TAX_RELEASE_CREATED_AT,
    createdBy: "tax-release-gate",
  };
}

function fixtureDocumentHash(kind: string): string {
  const file = fixture.files.find((candidate) => candidate.kind === kind);
  if (!file) throw new Error(`TAX_RELEASE_FIXTURE_DOCUMENT_MISSING:${kind}`);
  return file.sha256;
}

function line(options: {
  readonly n: number;
  readonly journal: "VE" | "AC";
  readonly entry: string;
  readonly account: string;
  readonly debit?: number;
  readonly credit?: number;
  readonly piece: string;
  readonly pieceDate?: string;
  readonly label?: string;
}): FecEntry {
  const debit = options.debit ?? 0;
  const credit = options.credit ?? 0;
  return {
    ligne: options.n,
    journalCode: options.journal,
    journalLib: options.journal === "VE" ? "Ventes" : "Achats",
    ecritureNum: options.entry,
    ecritureDate: "20260315",
    compteNum: options.account,
    compteLib: `Compte ${options.account}`,
    compAuxNum: "",
    compAuxLib: "",
    pieceRef: options.piece,
    pieceDate: options.pieceDate ?? "20260315",
    ecritureLib: options.label ?? "Écriture synthétique",
    debit,
    credit,
    ecritureLet: "",
    dateLet: "",
    validDate: "20260331",
    montant: debit - credit,
  };
}

function sale(entry: string, base: number, vat: number, start: number, pieceDate?: string): readonly FecEntry[] {
  return [
    line({ n: start, journal: "VE", entry, account: "411000", debit: base + vat, piece: `FA-${entry}`, pieceDate }),
    line({ n: start + 1, journal: "VE", entry, account: "706000", credit: base, piece: `FA-${entry}`, pieceDate }),
    line({ n: start + 2, journal: "VE", entry, account: "445710", credit: vat, piece: `FA-${entry}`, pieceDate }),
  ];
}

function purchase(entry: string, base: number, vat: number, start: number): readonly FecEntry[] {
  return [
    line({ n: start, journal: "AC", entry, account: "607000", debit: base, piece: `FF-${entry}` }),
    line({ n: start + 1, journal: "AC", entry, account: "445660", debit: vat, piece: `FF-${entry}` }),
    line({ n: start + 2, journal: "AC", entry, account: "401000", credit: base + vat, piece: `FF-${entry}` }),
  ];
}

function ca3(id: string, boxes: Readonly<Record<string, number>>): TaxDocumentSnapshot {
  return buildSyntheticFormSnapshot({
    year: 2026,
    id,
    taxType: "vat",
    taxPeriodId: fixture.vatPeriod.id,
    documentType: "declaration_tva_ca3",
    formNumber: "3310-CA3-SD",
    boxes,
  });
}

function nominalVatLedger(): readonly FecEntry[] {
  return [...sale("V1", 1_000, 200, 1), ...purchase("A1", 500, 100, 4)];
}

function nominalCa3(overrides: Readonly<Record<string, number>> = {}): TaxDocumentSnapshot {
  return ca3(`golden-ca3-${Object.values(overrides).join("-") || "exact"}`, {
    "08": cents(1_000), "16": cents(200), "23": cents(100),
    "28": cents(100), "25": 0, "22": 0, "27": 0,
    ...overrides,
  });
}

export function buildVatGoldenInput(id: VatGoldenCaseId): VatReconciliationInput {
  let profile = fixture.profile;
  let period = fixture.vatPeriod;
  let entries: readonly FecEntry[] = nominalVatLedger();
  let documents: readonly TaxDocumentSnapshot[] = [nominalCa3()];
  let availableInvoiceRefs: readonly string[] | undefined = ["FA-V1", "FF-A1"];

  switch (id) {
    case "vat-collected-difference":
      documents = [nominalCa3({ "16": cents(190), "28": cents(90) })];
      break;
    case "vat-deductible-difference":
      documents = [nominalCa3({ "23": cents(80), "28": cents(120) })];
      break;
    case "vat-missing-invoice":
      availableInvoiceRefs = ["FA-V1"];
      break;
    case "vat-multiple-rates":
      entries = [
        ...sale("V20", 100_000, 20_000, 1),
        ...sale("V10", 10_000, 1_000, 4),
        ...sale("V03", 100, 3, 7),
      ];
      availableInvoiceRefs = ["FA-V20", "FA-V10", "FA-V03"];
      documents = [ca3("golden-ca3-multiple-rates", {
        "08": cents(110_100), "16": cents(21_003), "23": 0,
        "28": cents(21_003), "25": 0, "22": 0, "27": 0,
      })];
      break;
    case "vat-credit-note":
      entries = [
        ...nominalVatLedger(),
        line({ n: 7, journal: "VE", entry: "AV1", account: "706000", debit: 100, piece: "AV-AV1", label: "Avoir synthétique" }),
        line({ n: 8, journal: "VE", entry: "AV1", account: "445710", debit: 20, piece: "AV-AV1", label: "Avoir synthétique" }),
        line({ n: 9, journal: "VE", entry: "AV1", account: "411000", credit: 120, piece: "AV-AV1", label: "Avoir synthétique" }),
      ];
      availableInvoiceRefs = ["FA-V1", "FF-A1", "AV-AV1"];
      documents = [ca3("golden-ca3-credit-note", {
        "08": cents(900), "16": cents(180), "23": cents(100),
        "28": cents(80), "25": 0, "22": 0, "27": 0,
      })];
      break;
    case "vat-credit":
      entries = [...sale("V1", 500, 100, 1), ...purchase("A1", 2_000, 400, 4)];
      documents = [ca3("golden-ca3-credit", {
        "08": cents(500), "16": cents(100), "23": cents(400),
        "28": 0, "25": cents(300), "22": 0, "27": cents(300),
      })];
      break;
    case "vat-reverse-charge":
      entries = [
        line({ n: 1, journal: "AC", entry: "RC1", account: "607000", debit: 1_000, piece: "FF-RC1" }),
        line({ n: 2, journal: "AC", entry: "RC1", account: "401000", credit: 1_000, piece: "FF-RC1" }),
        line({ n: 3, journal: "AC", entry: "RC1", account: "445710", credit: 200, piece: "FF-RC1" }),
        line({ n: 4, journal: "AC", entry: "RC1", account: "445660", debit: 200, piece: "FF-RC1" }),
      ];
      availableInvoiceRefs = ["FF-RC1"];
      documents = [ca3("golden-ca3-reverse-charge", {
        "08": 0, "16": cents(200), "23": cents(200),
        "28": 0, "25": 0, "22": 0, "27": 0,
      })];
      break;
    case "vat-shifted-period":
      entries = sale("V1", 1_000, 200, 1, "20260225");
      availableInvoiceRefs = ["FA-V1"];
      documents = [ca3("golden-ca3-shifted", {
        "08": cents(1_000), "16": cents(200), "23": 0,
        "28": cents(200), "25": 0, "22": 0, "27": 0,
      })];
      break;
    case "vat-ca12": {
      profile = buildSyntheticTaxProfile(2026, { vatRegime: "real_simplified" });
      period = buildSyntheticTaxPeriod(2026, "vat", {
        id: "vat-period-annual-2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        frequency: "annual",
      });
      documents = [buildSyntheticFormSnapshot({
        year: 2026,
        id: "golden-ca12",
        taxType: "vat",
        taxPeriodId: period.id,
        documentType: "declaration_tva_ca12",
        formNumber: "3517-S-SD",
        boxes: { "19": cents(200), "26": cents(100), "54": cents(100), "29": 0, "24": 0, "51": 0 },
      })];
      break;
    }
    case "vat-unknown-regime":
      profile = buildSyntheticTaxProfile(2026, { vatRegime: "unknown" });
      documents = [];
      break;
    case "vat-ca3-exact":
      break;
  }

  return {
    organizationId: TAX_RELEASE_ORGANIZATION_ID,
    dossierId: TAX_RELEASE_DOSSIER_ID,
    entityId: TAX_RELEASE_ENTITY_ID,
    executionId: `golden-execution-${id}`,
    snapshotId: `golden-snapshot-${id}`,
    profile,
    period,
    fecEntries: entries,
    documentSnapshots: documents,
    availableInvoiceRefs,
    createdAt: TAX_RELEASE_CREATED_AT,
    createdBy: "tax-release-gate",
  };
}

export function runCorporateTaxGoldenCase(id: CorporateTaxGoldenCaseId): CorporateTaxComputationResult {
  return computeCorporateTax(buildCorporateTaxGoldenInput(id));
}

export function runVatGoldenCase(id: VatGoldenCaseId): VatReconciliationResult {
  return reconcileVat(buildVatGoldenInput(id));
}

/** Snapshot 2026 nominal partagé par les tests d'export de release. */
export function nominalTaxReleaseSnapshot(): TaxDocumentSnapshot {
  return fixtureSnapshot(fixture, "form_2058_a");
}

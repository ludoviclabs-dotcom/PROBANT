/**
 * Dossier fiscal de démonstration du cockpit (TAX-08).
 *
 * Aucun montant affiché par /dashboard/fiscalite n'est écrit à la main ici :
 * ce module construit des ENTRÉES fictives (liasse, CA3, FEC, avis de CFE)
 * puis exécute réellement les moteurs TAX-05 (IS), TAX-06 (TVA), TAX-07 (CFE)
 * et le planificateur TAX-04. Le cockpit ne reçoit que leurs snapshots —
 * même discipline que le mode démo comptable (`buildDemoDossierSnapshot`).
 *
 * Le jeu est déterministe : horloge figée, identifiants stables, hachages
 * reproductibles. Aucune persistance (le snapshot reste en mémoire, cf.
 * TAX_ROADMAP § TAX-08).
 */
import type {
  FecEntry,
  TaxCapabilityMatrix,
  TaxControlContext,
  TaxControlInputDocument,
  TaxControlOutcome,
  TaxCoverage,
  TaxDocumentSnapshot,
  TaxLimitation,
  TaxPeriod,
  TaxProfile,
} from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";
import {
  createFiscalSynthesisSnapshot,
  createTaxDeclarationField,
  createTaxDocumentSnapshot,
  createTaxPeriod,
  createTaxProfile,
} from "../canonical";
import { TAX_CONTROL_DEFINITIONS } from "../control-catalog";
import { buildTaxCapabilityMatrix } from "../control-planner";
import { computeCorporateTax, type CorporateTaxComputationResult } from "../corporate-tax";
import { reconcileVat, type VatReconciliationResult } from "../vat";
import { reconcileCfe, type CfeReconciliationResult } from "@/lib/tax-engine/cfe/engine";
import type { CfeNotice } from "@/lib/tax-engine/cfe/types";
import { TAX_OUTCOME_ORDER } from "../cockpit/labels";
import type { TaxCockpitDocumentRef, TaxCockpitSource } from "../cockpit/types";

export const DEMO_TAX_CREATED_AT = "2026-08-16T10:00:00.000Z";
const ORG = "org-demo";
const DOSSIER = "dossier-demo";
const ENTITY = "entity-demo-sa";
const ENTITY_NAME = "DEMO SA";
const FISCAL_YEAR = 2026;
const CREATED_BY = "demo-fixture";
const SOURCE_HASH = "e".repeat(64);
const PLANNER_VERSION = "tax-control-planner-1.0.0";

function euros(amount: number): number {
  return Math.round(amount * 100);
}

export interface DemoTaxCockpitOptions {
  /** Inclure le volet IS (défaut : oui). */
  readonly includeCorporateTax?: boolean;
  /** Inclure le volet TVA (défaut : oui). */
  readonly includeVat?: boolean;
  /** Inclure le volet CFE (défaut : oui). */
  readonly includeCfe?: boolean;
  /**
   * Retirer toutes les pièces (liasse, CA3, FEC, avis) : les moteurs tournent
   * mais aucun impôt n'est calculable — scénario « données manquantes ».
   */
  readonly withoutDocuments?: boolean;
}

// ---------------------------------------------------------------------------
// Entrées fictives
// ---------------------------------------------------------------------------

function demoProfile(): TaxProfile {
  return createTaxProfile({
    id: "profile-demo",
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    version: "1",
    jurisdiction: "FR",
    status: "confirmed",
    corporateIncomeTaxRegime: "standard",
    vatRegime: "real_normal",
    accountingPeriod: { startDate: "2026-01-01", endDate: "2026-12-31" },
    corporateIncomeTaxGroupStatus: "none",
    vatGroupStatus: "none",
    turnoverAmountCents: euros(5_000_000),
    capitalPaidStatus: "fully_paid",
    // Détention non confirmée : l'éligibilité au taux réduit reste « unknown »
    // et le planner recommande de confirmer la détention — voulu pour la démo.
    ownershipStatus: "unknown",
    qualifyingIndividualOwnershipBasisPoints: null,
    vatLiabilityRatioStatus: "unknown",
    vatLiabilityRatioBasisPoints: null,
    establishments: [{
      establishmentId: "etab-paris",
      countryCode: "FR",
      postalCode: "75001",
      municipality: "Paris",
      isPrincipal: true,
      verificationStatus: "verified",
    }],
    parameters: [{
      key: "cfe_exemption",
      value: false,
      verificationStatus: "verified",
      sourceRefs: ["profil-fiscal"],
      verifiedBy: "reviewer-demo",
      verifiedAt: DEMO_TAX_CREATED_AT,
    }],
    confirmedBy: "reviewer-demo",
    confirmedAt: DEMO_TAX_CREATED_AT,
    createdAt: DEMO_TAX_CREATED_AT,
  });
}

function demoPeriod(options: {
  readonly id: string;
  readonly taxType: TaxPeriod["taxType"];
  readonly startDate: string;
  readonly endDate: string;
  readonly frequency: TaxPeriod["frequency"];
  readonly sourceRefs: readonly string[];
}): TaxPeriod {
  return createTaxPeriod({
    id: options.id,
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    taxType: options.taxType,
    startDate: options.startDate,
    endDate: options.endDate,
    fiscalYear: FISCAL_YEAR,
    formVintage: 2026,
    frequency: options.frequency,
    accountingPeriodId: "accounting-period-demo",
    status: "filed",
    version: "1",
    sourceRefs: [...options.sourceRefs],
    createdAt: DEMO_TAX_CREATED_AT,
  });
}

function formSnapshot(options: {
  readonly id: string;
  readonly taxPeriodId: string;
  readonly taxType: TaxDocumentSnapshot["taxType"];
  readonly documentType: string;
  readonly formNumber: string;
  readonly boxes: Readonly<Record<string, number>>;
}): TaxDocumentSnapshot {
  return createTaxDocumentSnapshot({
    id: options.id,
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    logicalDocumentId: `logical-${options.id}`,
    sourceDocumentId: `source-${options.id}`,
    taxPeriodId: options.taxPeriodId,
    taxPeriodVersion: "1",
    taxType: options.taxType,
    documentType: options.documentType,
    formNumber: options.formNumber,
    formVintage: 2026,
    snapshotVersion: "1",
    schemaVersion: "2026.1",
    parserName: "demo-fixture",
    parserVersion: "1",
    sourceHash: SOURCE_HASH,
    fields: Object.entries(options.boxes).map(([fieldCode, amountCents]) =>
      createTaxDeclarationField({
        id: `${options.id}:${fieldCode}`,
        organizationId: ORG,
        dossierId: DOSSIER,
        taxDocumentSnapshotId: options.id,
        formVintage: 2026,
        fieldCode,
        label: `Case ${fieldCode}`,
        dataType: "amount",
        rawValue: String(amountCents),
        amountCents,
        normalizedValue: null,
        percentageBasisPoints: null,
        unit: "cent",
        sign: "positive",
        documentHash: SOURCE_HASH,
        sourceLocation: {
          page: 1,
          sheet: null,
          cell: null,
          box: fieldCode,
          zone: `case-${fieldCode}`,
          structuredPath: null,
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
    warnings: [],
    limitationIds: [],
    supersedesSnapshotId: null,
    status: "active",
    createdAt: DEMO_TAX_CREATED_AT,
    createdBy: CREATED_BY,
  });
}

/** Fabrique de lignes FEC — montants en euros décimaux, comme un vrai FEC. */
function fecLineFactory(): (overrides: Partial<FecEntry> & { compteNum: string }) => FecEntry {
  let counter = 0;
  return (overrides) => {
    counter += 1;
    const debit = overrides.debit ?? 0;
    const credit = overrides.credit ?? 0;
    return {
      ligne: overrides.ligne ?? counter,
      journalCode: overrides.journalCode ?? "VE",
      journalLib: overrides.journalLib ?? "Ventes",
      ecritureNum: overrides.ecritureNum ?? `E${counter}`,
      ecritureDate: overrides.ecritureDate ?? "20260315",
      compteNum: overrides.compteNum,
      compteLib: overrides.compteLib ?? `Compte ${overrides.compteNum}`,
      compAuxNum: overrides.compAuxNum ?? "",
      compAuxLib: overrides.compAuxLib ?? "",
      pieceRef: overrides.pieceRef ?? "PIECE-1",
      pieceDate: overrides.pieceDate ?? "20260315",
      ecritureLib: overrides.ecritureLib ?? "Écriture de démonstration",
      debit,
      credit,
      ecritureLet: overrides.ecritureLet ?? "",
      dateLet: overrides.dateLet ?? "",
      validDate: overrides.validDate ?? "20260331",
      montant: debit - credit,
    };
  };
}

/** Écritures TVA de mars 2026 : ventes à 20 % et 10 %, achats, une pièce absente. */
function demoVatFecEntries(): FecEntry[] {
  const line = fecLineFactory();
  const entries: FecEntry[] = [];
  const sale = (num: string, base: number, vat: number, vatAccount = "445710") => {
    const shared = { journalCode: "VE", ecritureNum: num, pieceRef: `FA-${num}`, pieceDate: "20260310", ecritureDate: "20260310" };
    entries.push(
      line({ ...shared, compteNum: "411000", debit: base + vat }),
      line({ ...shared, compteNum: "706000", credit: base }),
      line({ ...shared, compteNum: vatAccount, credit: vat }),
    );
  };
  sale("V1", 4_000, 800);
  sale("V2", 3_500, 700);
  sale("V3", 2_500, 500);
  sale("V4", 1_000, 100); // taux constaté 10 %
  const purchase = (num: string, base: number, vat: number, pieceRef: string | null) => {
    const shared = {
      journalCode: "AC",
      journalLib: "Achats",
      ecritureNum: num,
      pieceRef: pieceRef === null ? "" : pieceRef,
      pieceDate: "20260318",
      ecritureDate: "20260318",
    };
    entries.push(
      line({ ...shared, compteNum: "607000", debit: base }),
      line({ ...shared, compteNum: "445660", debit: vat }),
      line({ ...shared, compteNum: "401000", credit: base + vat }),
    );
  };
  purchase("A1", 3_000, 600, "FF-A1");
  purchase("A2", 1_000, 200, null); // référence de pièce absente : signal, pas une faute
  return entries;
}

/** Écritures CFE : charge 635110 puis règlement, alignées sur l'avis. */
function demoCfeFecEntries(): FecEntry[] {
  const line = fecLineFactory();
  return [
    line({ journalCode: "OD", journalLib: "Opérations diverses", ecritureNum: "CFE1", ecritureDate: "20260615", pieceRef: "CFE-2026", compteNum: "635110", debit: 1_200 }),
    line({ journalCode: "OD", journalLib: "Opérations diverses", ecritureNum: "CFE1", ecritureDate: "20260615", pieceRef: "CFE-2026", compteNum: "447000", credit: 1_200 }),
    line({ journalCode: "BQ", journalLib: "Banque", ecritureNum: "CFE2", ecritureDate: "20261215", pieceRef: "CFE-2026", compteNum: "447000", debit: 1_200 }),
    line({ journalCode: "BQ", journalLib: "Banque", ecritureNum: "CFE2", ecritureDate: "20261215", pieceRef: "CFE-2026", compteNum: "512000", credit: 1_200 }),
  ];
}

function demoCfeNotice(): CfeNotice {
  const body = {
    establishmentId: "etab-paris",
    taxYear: FISCAL_YEAR,
    periodStartDate: "2026-05-01",
    periodEndDate: "2026-12-31",
    lines: [],
    totalDueCents: euros(1_200),
    provenance: "imported_document" as const,
    sourceDocumentId: "tax-notice-demo",
    capturedBy: "reviewer-demo",
    capturedAt: DEMO_TAX_CREATED_AT,
  };
  return Object.freeze({ ...body, id: "cfe-notice-demo", noticeHash: stableHash(body) });
}

function plannerDocument(options: {
  readonly documentType: string;
  readonly snapshotId: string;
  readonly period: TaxPeriod;
  readonly usableFieldCodes?: readonly string[];
}): TaxControlInputDocument {
  return {
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    documentId: `document-${options.documentType}`,
    snapshotId: options.snapshotId,
    documentType: options.documentType,
    formVintage: 2026,
    periodStart: options.period.startDate,
    periodEnd: options.period.endDate,
    status: "active",
    usableFieldCodes: options.usableFieldCodes ?? [],
    evidenceStrength: "direct",
    contentHash: stableHash({ documentType: options.documentType, snapshotId: options.snapshotId }),
  };
}

// ---------------------------------------------------------------------------
// Construction du dossier
// ---------------------------------------------------------------------------

export function buildDemoTaxCockpitSource(options: DemoTaxCockpitOptions = {}): TaxCockpitSource {
  const includeCorporateTax = options.includeCorporateTax ?? true;
  const includeVat = options.includeVat ?? true;
  const includeCfe = options.includeCfe ?? true;
  const withDocuments = !options.withoutDocuments;

  const profile = demoProfile();
  const periods: TaxPeriod[] = [];
  const documents: TaxDocumentSnapshot[] = [];
  const availableDocuments: TaxCockpitDocumentRef[] = [];
  const matrices: TaxCapabilityMatrix[] = [];

  let corporateTax: CorporateTaxComputationResult | null = null;
  let vat: VatReconciliationResult | null = null;
  let cfe: CfeReconciliationResult | null = null;

  // -- IS -------------------------------------------------------------------
  if (includeCorporateTax) {
    const period = demoPeriod({
      id: "period-is-2026",
      taxType: "corporate_income_tax",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      frequency: "annual",
      sourceRefs: ["form-2050-liasse-v2026"],
    });
    periods.push(period);

    const liasse = formSnapshot({
      id: "snapshot-2058-a-demo",
      taxPeriodId: period.id,
      taxType: "corporate_income_tax",
      documentType: "form_2058_a",
      formNumber: "2058-A-SD",
      boxes: {
        WA: euros(482_650),
        WS: 0,
        WR: euros(35_000),
        XH: euros(12_000),
        XI: euros(505_650),
        XJ: 0,
        XL: 0,
        XN: euros(505_650),
        XO: 0,
      },
    });
    const declaration = formSnapshot({
      id: "snapshot-2065-demo",
      taxPeriodId: period.id,
      taxType: "corporate_income_tax",
      documentType: "declaration_2065",
      formNumber: "2065-SD",
      boxes: {
        "C.RESULTAT_TAUX_NORMAL": euros(505_650),
        "C.RESULTAT_TAUX_REDUIT": 0,
        "C.RESULTAT_FISCAL_BENEFICE": euros(505_650),
      },
    });
    if (withDocuments) {
      documents.push(liasse, declaration);
      availableDocuments.push(
        { documentType: "fec", formNumber: null, taxType: "corporate_income_tax", status: "active" },
        { documentType: "liasse_2050_2059", formNumber: "2058-A-SD", taxType: "corporate_income_tax", status: "active" },
        { documentType: "declaration_2065", formNumber: "2065-SD", taxType: "corporate_income_tax", status: "active" },
      );
    }

    corporateTax = computeCorporateTax({
      organizationId: ORG,
      dossierId: DOSSIER,
      entityId: ENTITY,
      executionId: "execution-is-demo",
      snapshotId: "corporate-tax-snapshot-demo",
      profile,
      period,
      documentSnapshots: withDocuments ? [liasse, declaration] : [],
      ledgerObservations: withDocuments
        ? [{
            id: "obs-6712",
            accountCode: "6712",
            label: "Pénalités et amendes inscrites au compte 6712",
            amountCents: euros(3_000),
            direction: "reintegration",
            category: "explicit_non_deductible",
            snapshotId: "fec-snapshot-demo",
            contentHash: "f".repeat(64),
          }]
        : [],
      accountedPositions: withDocuments
        ? {
            // Charge d'impôt comptabilisée volontairement inférieure de
            // 24 850,00 EUR à l'impôt brut recalculé : l'écart de démonstration.
            chargeCents: euros(101_562.5),
            liabilityCents: null,
            snapshotId: "fec-snapshot-demo",
            contentHash: "f".repeat(64),
          }
        : undefined,
      createdAt: DEMO_TAX_CREATED_AT,
      createdBy: CREATED_BY,
    });

    const context: TaxControlContext = {
      organizationId: ORG,
      dossierId: DOSSIER,
      entityId: ENTITY,
      profile,
      period,
      documents: withDocuments
        ? [
            plannerDocument({ documentType: "fec", snapshotId: "fec-snapshot-demo", period }),
            plannerDocument({ documentType: "liasse_2050_2059", snapshotId: liasse.id, period }),
            plannerDocument({ documentType: "declaration_2065", snapshotId: declaration.id, period }),
          ]
        : [],
      executionStates: [],
      plannerVersion: PLANNER_VERSION,
    };
    matrices.push(buildTaxCapabilityMatrix(context, TAX_CONTROL_DEFINITIONS));
  }

  // -- TVA ------------------------------------------------------------------
  if (includeVat) {
    const period = demoPeriod({
      id: "period-vat-2026-03",
      taxType: "vat",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      frequency: "monthly",
      sourceRefs: ["form-ca3-v2026"],
    });
    periods.push(period);

    const ca3 = formSnapshot({
      id: "snapshot-ca3-demo",
      taxPeriodId: period.id,
      taxType: "vat",
      documentType: "declaration_tva_ca3",
      formNumber: "3310-CA3-SD",
      boxes: {
        "08": euros(10_000),
        "16": euros(2_100),
        // TVA déductible déclarée 780,00 EUR contre 800,00 EUR comptabilisés :
        // écart de rapprochement de 20,00 EUR, répercuté sur le net (case 28).
        "23": euros(780),
        "28": euros(1_320),
        "25": 0,
        "22": 0,
        "27": 0,
      },
    });
    if (withDocuments) {
      documents.push(ca3);
      availableDocuments.push(
        { documentType: "fec", formNumber: null, taxType: "vat", status: "active" },
        { documentType: "declaration_tva_ca3", formNumber: "3310-CA3-SD", taxType: "vat", status: "active" },
      );
    }

    vat = reconcileVat({
      organizationId: ORG,
      dossierId: DOSSIER,
      entityId: ENTITY,
      executionId: "execution-vat-demo",
      snapshotId: "vat-snapshot-demo",
      profile,
      period,
      fecEntries: withDocuments ? demoVatFecEntries() : [],
      documentSnapshots: withDocuments ? [ca3] : [],
      createdAt: DEMO_TAX_CREATED_AT,
      createdBy: CREATED_BY,
    });

    const context: TaxControlContext = {
      organizationId: ORG,
      dossierId: DOSSIER,
      entityId: ENTITY,
      profile,
      period,
      documents: withDocuments
        ? [
            plannerDocument({ documentType: "fec", snapshotId: "fec-snapshot-demo", period }),
            plannerDocument({
              documentType: "declaration_tva_ca3",
              snapshotId: ca3.id,
              period,
              usableFieldCodes: ["16", "23"],
            }),
            // Les factures d'achat ne sont volontairement pas fournies : la
            // revue de TVA déductible reste non concluante et le planner
            // recommande de les demander.
          ]
        : [],
      executionStates: [],
      plannerVersion: PLANNER_VERSION,
    };
    matrices.push(buildTaxCapabilityMatrix(context, TAX_CONTROL_DEFINITIONS));
  }

  // -- CFE ------------------------------------------------------------------
  if (includeCfe) {
    const period = demoPeriod({
      id: "period-cfe-2026",
      taxType: "cfe",
      startDate: "2026-05-01",
      endDate: "2026-12-31",
      frequency: "annual",
      sourceRefs: ["bofip-cfe-v2026-04-29"],
    });
    periods.push(period);
    if (withDocuments) {
      availableDocuments.push(
        { documentType: "tax_notice", formNumber: null, taxType: "cfe", status: "active" },
      );
    }

    cfe = reconcileCfe({
      organizationId: ORG,
      dossierId: DOSSIER,
      entityId: ENTITY,
      executionId: "execution-cfe-demo",
      snapshotId: "cfe-snapshot-demo",
      profile,
      period,
      notices: withDocuments ? [demoCfeNotice()] : [],
      fecEntries: withDocuments ? demoCfeFecEntries() : [],
      createdAt: DEMO_TAX_CREATED_AT,
      createdBy: CREATED_BY,
    });

    const context: TaxControlContext = {
      organizationId: ORG,
      dossierId: DOSSIER,
      entityId: ENTITY,
      profile,
      period,
      documents: withDocuments
        ? [
            plannerDocument({ documentType: "fec", snapshotId: "fec-snapshot-demo", period }),
            plannerDocument({ documentType: "tax_notice", snapshotId: "tax-notice-demo", period }),
          ]
        : [],
      executionStates: [],
      plannerVersion: PLANNER_VERSION,
    };
    matrices.push(buildTaxCapabilityMatrix(context, TAX_CONTROL_DEFINITIONS));
  }

  // -- Synthèse fiscale ------------------------------------------------------
  const outcomes: TaxControlOutcome[] = [];
  if (corporateTax) outcomes.push(corporateTax.snapshot.outcome);
  if (vat) outcomes.push(...vat.snapshot.controls.map((control) => control.outcome));
  if (cfe) outcomes.push(...cfe.snapshot.controls.map((control) => control.outcome));

  const outcomeCounts: Record<TaxControlOutcome, number> = {
    passed: 0,
    confirmed_non_compliance: 0,
    reconciliation_difference: 0,
    potential_tax_risk: 0,
    missing_information: 0,
    inconclusive: 0,
    review_recommendation: 0,
  };
  for (const outcome of outcomes) outcomeCounts[outcome] += 1;
  const headlineStatus: TaxControlOutcome | "no_conclusion" =
    TAX_OUTCOME_ORDER.find((outcome) => outcomeCounts[outcome] > 0) ?? "no_conclusion";

  const limitations: TaxLimitation[] = [
    ...(corporateTax?.snapshot.limitations ?? []),
    ...(vat?.snapshot.limitations ?? []),
    ...(cfe?.snapshot.limitations ?? []),
  ];

  const coverage = buildDemoCoverage({
    matrices,
    documents: availableDocuments,
    fieldSources: documents,
    periods,
  });

  const pendingProposals =
    corporateTax?.snapshot.adjustmentLines.filter((line) => line.status === "candidate").length ??
    0;

  const executionIds = [
    ...(corporateTax ? ["execution-is-demo"] : []),
    ...(vat ? ["execution-vat-demo"] : []),
    ...(cfe ? ["execution-cfe-demo"] : []),
  ];

  const synthesis = createFiscalSynthesisSnapshot({
    id: "fiscal-synthesis-demo",
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    snapshotVersion: "1",
    fiscalYear: FISCAL_YEAR,
    formVintage: 2026,
    periodIds: periods.map((period) => period.id),
    executionIds,
    computationSnapshotIds: corporateTax ? [corporateTax.snapshot.id] : [],
    outcomeCounts,
    coverage,
    limitations,
    reviewSummary: { pending: pendingProposals, accepted: 0, rejected: 0, amended: 0 },
    headlineStatus,
    headlinePolicyVersion: "tax-headline-presentation-order-1",
    trace: [],
    generatedAt: DEMO_TAX_CREATED_AT,
  });

  return {
    organizationId: ORG,
    dossierId: DOSSIER,
    entityId: ENTITY,
    entityName: ENTITY_NAME,
    fiscalYear: FISCAL_YEAR,
    generatedAt: DEMO_TAX_CREATED_AT,
    profile,
    documentSnapshots: documents,
    synthesis,
    corporateTax,
    vat,
    cfe,
    capabilityMatrices: matrices,
    periods,
    availableDocuments,
  };
}

function buildDemoCoverage(input: {
  readonly matrices: readonly TaxCapabilityMatrix[];
  readonly documents: readonly TaxCockpitDocumentRef[];
  readonly fieldSources: readonly TaxDocumentSnapshot[];
  readonly periods: readonly TaxPeriod[];
}): TaxCoverage {
  const allControls = input.matrices.flatMap((matrix) => matrix.controls);
  const applicable = allControls.filter((control) => control.status !== "not_applicable");
  const blocked = allControls.filter((control) => control.status === "missing_inputs");
  const executedIds = new Set(
    input.matrices.flatMap((matrix) => [
      ...matrix.verifiedControlIds,
      ...matrix.calculatedControlIds,
    ]),
  );
  const requiredDocumentTypes = new Set<string>();
  for (const matrix of input.matrices) {
    for (const control of matrix.controls) {
      if (control.status === "not_applicable") continue;
      const definition = TAX_CONTROL_DEFINITIONS.find(
        (candidate) => candidate.controlId === control.controlId,
      );
      for (const documentType of definition?.requiredDocumentTypes ?? []) {
        requiredDocumentTypes.add(documentType);
      }
    }
  }
  const availableTypes = new Set(input.documents.map((doc) => doc.documentType));
  const availableRequired = [...requiredDocumentTypes].filter((documentType) =>
    availableTypes.has(documentType),
  );
  const fields = input.fieldSources.flatMap((snapshot) => snapshot.fields);
  return {
    applicableControlCount: applicable.length,
    executedControlCount: executedIds.size,
    blockedControlCount: blocked.length,
    requiredDocumentCount: requiredDocumentTypes.size,
    availableDocumentCount: availableRequired.length,
    requiredFieldCount: fields.length,
    usableFieldCount: fields.filter((field) => field.usableForAutomatedCalculation).length,
    verifiedFieldCount: fields.filter((field) => field.reviewStatus === "verified").length,
    coveredPeriodIds: input.periods.map((period) => period.id),
    uncoveredPeriodIds: [],
    excludedScopes: [],
  };
}

let cachedDefaultSource: TaxCockpitSource | null = null;

/** Source de démonstration mémoïsée — déterministe, aucune horloge système. */
export function getDemoTaxCockpitSource(): TaxCockpitSource {
  if (!cachedDefaultSource) cachedDefaultSource = buildDemoTaxCockpitSource();
  return cachedDefaultSource;
}

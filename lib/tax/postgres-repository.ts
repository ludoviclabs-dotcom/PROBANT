import { and, eq } from "drizzle-orm";
import type {
  Finding,
  FiscalSynthesisSnapshot,
  TaxAdjustment,
  TaxComputationSnapshot,
  TaxControlExecution,
  TaxDocumentSnapshot,
  TaxPeriod,
  TaxProfile,
  TaxReconciliationLine,
} from "@/lib/canonical-model";
import { getDatabase } from "@/lib/persistence/db";
import {
  findings,
  synthesisSnapshots,
  taxAdjustments,
  taxComputationSnapshots,
  taxControlExecutions,
  taxDeclarationFields,
  taxDocuments,
  taxPeriods,
  taxProfiles,
  taxReconciliationLines,
} from "@/lib/persistence/schema";
import type { TaxRepository, TaxRepositoryScope } from "./repository";

function assertScope(scope: TaxRepositoryScope, value: TaxRepositoryScope): void {
  if (scope.organizationId !== value.organizationId || scope.dossierId !== value.dossierId) {
    throw new Error("Tax artifact is outside the organization/dossier scope.");
  }
}

export class PostgresTaxRepository implements TaxRepository {
  async saveProfile(scope: TaxRepositoryScope, profile: TaxProfile): Promise<void> {
    assertScope(scope, profile);
    await getDatabase().insert(taxProfiles).values({
      id: profile.id,
      organizationId: profile.organizationId,
      dossierId: profile.dossierId,
      entityId: profile.entityId,
      periodStart: profile.accountingPeriod.startDate,
      periodEnd: profile.accountingPeriod.endDate,
      version: profile.version,
      status: profile.status,
      turnoverAmountCents: profile.turnoverAmountCents,
      canonicalJson: profile.canonicalJson,
      contentHash: profile.contentHash,
      payload: profile,
      createdAt: profile.createdAt,
    });
  }

  async getProfile(scope: TaxRepositoryScope, id: string): Promise<TaxProfile | null> {
    const rows = await getDatabase().select({ payload: taxProfiles.payload })
      .from(taxProfiles)
      .where(and(
        eq(taxProfiles.organizationId, scope.organizationId),
        eq(taxProfiles.dossierId, scope.dossierId),
        eq(taxProfiles.id, id),
      )).limit(1);
    return rows[0]?.payload ?? null;
  }

  async savePeriod(scope: TaxRepositoryScope, period: TaxPeriod): Promise<void> {
    assertScope(scope, period);
    await getDatabase().insert(taxPeriods).values({
      id: period.id,
      organizationId: period.organizationId,
      dossierId: period.dossierId,
      entityId: period.entityId,
      taxType: period.taxType,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      fiscalYear: period.fiscalYear,
      formVintage: period.formVintage,
      frequency: period.frequency,
      version: period.version,
      canonicalJson: period.canonicalJson,
      contentHash: period.contentHash,
      payload: period,
      createdAt: period.createdAt,
    });
  }

  async getPeriod(scope: TaxRepositoryScope, id: string): Promise<TaxPeriod | null> {
    const rows = await getDatabase().select({ payload: taxPeriods.payload })
      .from(taxPeriods)
      .where(and(
        eq(taxPeriods.organizationId, scope.organizationId),
        eq(taxPeriods.dossierId, scope.dossierId),
        eq(taxPeriods.id, id),
      )).limit(1);
    return rows[0]?.payload ?? null;
  }

  async saveDocument(scope: TaxRepositoryScope, document: TaxDocumentSnapshot): Promise<void> {
    assertScope(scope, document);
    for (const field of document.fields) assertScope(scope, field);
    await getDatabase().transaction(async (tx) => {
      await tx.insert(taxDocuments).values({
        id: document.id,
        organizationId: document.organizationId,
        dossierId: document.dossierId,
        entityId: document.entityId,
        logicalDocumentId: document.logicalDocumentId,
        sourceDocumentId: document.sourceDocumentId,
        taxPeriodId: document.taxPeriodId,
        taxPeriodVersion: document.taxPeriodVersion,
        taxType: document.taxType,
        documentType: document.documentType,
        formNumber: document.formNumber,
        formVintage: document.formVintage,
        snapshotVersion: document.snapshotVersion,
        status: document.status,
        sourceHash: document.sourceHash,
        canonicalJson: document.canonicalJson,
        snapshotHash: document.snapshotHash,
        payload: document,
        createdAt: document.createdAt,
      });
      if (document.fields.length > 0) {
        await tx.insert(taxDeclarationFields).values(document.fields.map((field) => ({
          id: field.id,
          organizationId: field.organizationId,
          dossierId: field.dossierId,
          taxDocumentId: field.taxDocumentSnapshotId,
          formVintage: field.formVintage,
          fieldCode: field.fieldCode,
          dataType: field.dataType,
          amountCents: field.amountCents,
          percentageBasisPoints: field.percentageBasisPoints,
          documentHash: field.documentHash,
          confidenceBasisPoints: Math.round(field.confidence * 10_000),
          processingStatus: field.processingStatus,
          usableForAutomatedCalculation: field.usableForAutomatedCalculation,
          fieldHash: field.fieldHash,
          payload: field,
        })));
      }
    });
  }

  async getDocument(scope: TaxRepositoryScope, id: string): Promise<TaxDocumentSnapshot | null> {
    const rows = await getDatabase().select({ payload: taxDocuments.payload })
      .from(taxDocuments)
      .where(and(
        eq(taxDocuments.organizationId, scope.organizationId),
        eq(taxDocuments.dossierId, scope.dossierId),
        eq(taxDocuments.id, id),
      )).limit(1);
    return rows[0]?.payload ?? null;
  }

  async saveExecution(scope: TaxRepositoryScope, execution: TaxControlExecution): Promise<void> {
    assertScope(scope, execution);
    await getDatabase().insert(taxControlExecutions).values({
      id: execution.id,
      organizationId: execution.organizationId,
      dossierId: execution.dossierId,
      entityId: execution.entityId,
      taxPeriodId: execution.taxPeriodId,
      fiscalYear: execution.fiscalYear,
      formVintage: execution.formVintage,
      executionVersion: execution.executionVersion,
      controlId: execution.controlId,
      controlVersion: execution.controlVersion,
      definitionHash: execution.definitionHash,
      taxProfileId: execution.taxProfileId,
      taxProfileVersion: execution.taxProfileVersion,
      status: execution.status,
      proposedOutcome: execution.proposedOutcome,
      evidenceStrength: execution.evidenceStrength,
      engineVersion: execution.engineVersion,
      canonicalJson: execution.canonicalJson,
      executionHash: execution.executionHash,
      payload: execution,
      executedAt: execution.executedAt,
    });
  }

  async getExecution(scope: TaxRepositoryScope, id: string): Promise<TaxControlExecution | null> {
    const rows = await getDatabase().select({ payload: taxControlExecutions.payload })
      .from(taxControlExecutions)
      .where(and(
        eq(taxControlExecutions.organizationId, scope.organizationId),
        eq(taxControlExecutions.dossierId, scope.dossierId),
        eq(taxControlExecutions.id, id),
      )).limit(1);
    return rows[0]?.payload ?? null;
  }

  async saveReconciliationLine(scope: TaxRepositoryScope, line: TaxReconciliationLine): Promise<void> {
    assertScope(scope, line);
    await getDatabase().insert(taxReconciliationLines).values({
      id: line.id,
      organizationId: line.organizationId,
      dossierId: line.dossierId,
      executionId: line.executionId,
      lineKey: line.lineKey,
      differenceAmountCents: line.differenceAmountCents,
      toleranceAmountCents: line.toleranceAmountCents,
      status: line.status,
      canonicalJson: line.canonicalJson,
      lineHash: line.lineHash,
      payload: line,
    });
  }

  async saveAdjustment(scope: TaxRepositoryScope, adjustment: TaxAdjustment): Promise<void> {
    assertScope(scope, adjustment);
    await getDatabase().insert(taxAdjustments).values({
      id: adjustment.id,
      organizationId: adjustment.organizationId,
      dossierId: adjustment.dossierId,
      executionId: adjustment.executionId,
      taxPeriodId: adjustment.taxPeriodId,
      taxType: adjustment.taxType,
      version: adjustment.version,
      adjustmentCode: adjustment.adjustmentCode,
      direction: adjustment.direction,
      baseAmountCents: adjustment.baseAmountCents,
      taxAmountCents: adjustment.taxAmountCents,
      proposalStatus: adjustment.proposalStatus,
      reviewStatus: adjustment.reviewStatus,
      reviewEventId: adjustment.reviewEventId,
      canonicalJson: adjustment.canonicalJson,
      adjustmentHash: adjustment.adjustmentHash,
      payload: adjustment,
    });
  }

  async saveComputation(scope: TaxRepositoryScope, snapshot: TaxComputationSnapshot): Promise<void> {
    assertScope(scope, snapshot);
    await getDatabase().insert(taxComputationSnapshots).values({
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      dossierId: snapshot.dossierId,
      entityId: snapshot.entityId,
      taxPeriodId: snapshot.taxPeriodId,
      fiscalYear: snapshot.fiscalYear,
      formVintage: snapshot.formVintage,
      taxType: snapshot.taxType,
      calculationType: snapshot.calculationType,
      calculationVersion: snapshot.calculationVersion,
      evidenceStrength: snapshot.evidenceStrength,
      canonicalJson: snapshot.canonicalJson,
      snapshotHash: snapshot.snapshotHash,
      payload: snapshot,
      createdAt: snapshot.createdAt,
    });
  }

  async saveFiscalSynthesis(scope: TaxRepositoryScope, snapshot: FiscalSynthesisSnapshot): Promise<void> {
    assertScope(scope, snapshot);
    await getDatabase().insert(synthesisSnapshots).values({
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      dossierId: snapshot.dossierId,
      snapshotVersion: snapshot.snapshotVersion,
      snapshotKind: "fiscal_tax",
      fiscalYear: snapshot.fiscalYear,
      formVintage: snapshot.formVintage,
      snapshotHash: snapshot.snapshotHash,
      payload: snapshot,
      createdAt: snapshot.generatedAt,
    });
  }

  async getFiscalSynthesis(scope: TaxRepositoryScope, id: string): Promise<FiscalSynthesisSnapshot | null> {
    const rows = await getDatabase().select({ payload: synthesisSnapshots.payload })
      .from(synthesisSnapshots)
      .where(and(
        eq(synthesisSnapshots.organizationId, scope.organizationId),
        eq(synthesisSnapshots.dossierId, scope.dossierId),
        eq(synthesisSnapshots.snapshotKind, "fiscal_tax"),
        eq(synthesisSnapshots.id, id),
      )).limit(1);
    return (rows[0]?.payload as FiscalSynthesisSnapshot | undefined) ?? null;
  }

  async saveTaxFinding(scope: TaxRepositoryScope, finding: Finding): Promise<void> {
    if (finding.domain !== "tax" || !finding.taxDetails) {
      throw new Error("A persisted tax finding must carry domain=tax and TaxFindingDetails.");
    }
    await getDatabase().insert(findings).values({
      id: finding.id,
      dossierId: scope.dossierId,
      taxControlExecutionId: finding.taxDetails.executionId,
      severity: finding.severity,
      family: finding.family,
      domain: "tax",
      payload: finding,
    });
  }
}


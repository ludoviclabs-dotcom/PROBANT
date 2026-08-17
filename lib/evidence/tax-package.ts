import type {
  EvidenceStrength,
  ReviewEvent,
  TaxControlOutcome,
  TaxReconciliationLine,
  TaxSourceRef,
  TaxTraceStep,
  TaxType,
} from "@/lib/canonical-model";
import { reviewEventsDigest, verifyReviewEventChain } from "@/lib/dossier/review";
import { taxKnowledgeRegistry } from "@/lib/knowledge/tax-registry";
import type { TaxRuleStatus } from "@/lib/knowledge/tax-types";
import { canonicalJson, sha256Hex, stableHash } from "@/lib/synthesis/canonical";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import { buildCsv } from "./csv";
import { buildFiscalNoteHtml } from "./fiscal-note";
import { buildTaxReviewProjection, projectFiscalSynthesisWithTaxReview } from "./tax-review";
import {
  TAX_EVIDENCE_ARTIFACT_FORMATS,
  type BuildTaxEvidencePackageInput,
  type BuildTaxEvidencePackageOptions,
  type TaxComputationEvidenceExport,
  type TaxEvidenceArtifact,
  type TaxEvidenceArtifactFormat,
  type TaxEvidenceCalculationStep,
  type TaxEvidenceControlRow,
  type TaxEvidenceDatum,
  type TaxEvidenceExportPackage,
  type TaxEvidenceFinding,
  type TaxEvidenceManifest,
  type TaxEvidenceSource,
  type TaxEvidenceSourceDocument,
} from "./tax-types";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function scopeKey(value: { organizationId: string; dossierId: string }): string {
  return `${value.organizationId}\u0000${value.dossierId}`;
}

function assertTaxExportScope(
  input: BuildTaxEvidencePackageInput,
  options: BuildTaxEvidencePackageOptions,
): void {
  const expected = scopeKey(options.activeContext);
  const source = input.source;
  const scoped: Array<{ organizationId: string; dossierId: string; label: string }> = [
    { ...source, label: "cockpit" },
    { ...(input.profile ?? source.profile), label: "profile" },
    { ...source.synthesis, label: "synthesis" },
    ...source.documentSnapshots.map((item) => ({ ...item, label: `document:${item.id}` })),
    ...source.periods.map((item) => ({ ...item, label: `period:${item.id}` })),
    ...source.capabilityMatrices.map((item) => ({ ...item, label: `matrix:${item.taxPeriodId}` })),
    ...(source.corporateTax ? [{ ...source.corporateTax.snapshot, label: "corporate-tax" }] : []),
    ...(source.vat ? [{ ...source.vat.snapshot, label: "vat" }] : []),
    ...(source.cfe ? [{ ...source.cfe.snapshot, label: "cfe" }] : []),
    ...(input.supplementalEvidence ?? []).map((item) => ({ ...item, label: `evidence:${item.id}` })),
  ];
  const mismatch = scoped.find((item) => scopeKey(item) !== expected);
  if (mismatch) throw new Error(`TAX_EXPORT_SCOPE_MISMATCH:${mismatch.label}`);
  if (source.dossierId !== options.activeContext.dossierId) {
    throw new Error("TAX_EXPORT_ACTIVE_DOSSIER_MISMATCH");
  }
}

function sourceRefKey(ref: TaxSourceRef): string {
  return `${ref.sourceVersionId}\u0000${ref.locator}`;
}

function collectNormativeRefs(source: TaxCockpitSource): TaxSourceRef[] {
  const refs: TaxSourceRef[] = [];
  const add = (values: readonly TaxSourceRef[] | undefined) => refs.push(...(values ?? []));
  for (const matrix of source.capabilityMatrices) {
    for (const control of matrix.controls) add(control.sourceRefs);
  }
  for (const period of source.periods) {
    for (const sourceVersionId of period.sourceRefs) {
      const version = taxKnowledgeRegistry.sourceVersions.find((item) => item.id === sourceVersionId);
      refs.push({
        sourceId: version?.sourceId ?? sourceVersionId,
        sourceVersionId,
        locator: version?.versionLabel ?? "Référence portée par la période fiscale",
      });
    }
  }
  if (source.corporateTax) {
    const snapshot = source.corporateTax.snapshot;
    add(snapshot.sourceRefs);
    add(snapshot.deficits.sourceRefs);
    snapshot.adjustmentLines.forEach((line) => add(line.sourceRefs));
    snapshot.brackets.forEach((bracket) => add(bracket.sourceRefs));
    snapshot.waterfall.steps.forEach((step) => add(step.sourceRefs));
    snapshot.notes.forEach((note) => add(note.sourceRefs));
    snapshot.trace.forEach((step) => add(step.sourceRefs));
  }
  if (source.vat) {
    const snapshot = source.vat.snapshot;
    add(snapshot.sourceRefs);
    add(snapshot.period.normativeCoverage.sourceRefs);
    snapshot.controls.forEach((control) => add(control.sourceRefs));
    snapshot.notes.forEach((note) => add(note.sourceRefs));
    snapshot.trace.forEach((step) => add(step.sourceRefs));
  }
  if (source.cfe) {
    const snapshot = source.cfe.snapshot;
    add(snapshot.sourceRefs);
    add(snapshot.applicability.sourceCoverage.sourceRefs);
    snapshot.controls.forEach((control) => add(control.sourceRefs));
    snapshot.notes.forEach((note) => add(note.sourceRefs));
    snapshot.trace.forEach((step) => add(step.sourceRefs));
  }
  return [...new Map(refs.map((ref) => [sourceRefKey(ref), ref])).values()]
    .sort((left, right) => sourceRefKey(left).localeCompare(sourceRefKey(right)));
}

function resolveSource(ref: TaxSourceRef): TaxEvidenceSource {
  const version = taxKnowledgeRegistry.sourceVersions.find((item) => item.id === ref.sourceVersionId);
  const source = taxKnowledgeRegistry.sources.find((item) => item.id === ref.sourceId);
  return {
    sourceId: ref.sourceId,
    sourceVersionId: ref.sourceVersionId,
    title: source?.title ?? null,
    publisher: source?.publisher ?? null,
    canonicalUrl: source?.canonicalUrl ?? null,
    documentUrl: version?.documentUrl ?? null,
    versionLabel: version?.versionLabel ?? null,
    locator: ref.locator,
    publishedAt: version?.publishedAt ?? null,
    effectiveFrom: version?.effectiveFrom ?? null,
    effectiveTo: version?.effectiveTo ?? null,
    status: version?.status ?? "unresolved",
    lastVerifiedAt: version?.lastVerifiedAt ?? source?.lastVerifiedAt ?? null,
  };
}

function normativeSources(input: BuildTaxEvidencePackageInput): TaxEvidenceSource[] {
  const overrides = new Map(
    (input.normativeSourceOverrides ?? []).map((source) => [
      `${source.sourceVersionId}\u0000${source.locator}`,
      source,
    ]),
  );
  return collectNormativeRefs(input.source).map((ref) =>
    overrides.get(`${ref.sourceVersionId}\u0000${ref.locator}`) ?? resolveSource(ref));
}

interface DocumentCollection {
  readonly documents: TaxEvidenceSourceDocument[];
  readonly idsByTaxType: Readonly<Partial<Record<TaxType, readonly string[]>>>;
}

function collectSourceDocuments(input: BuildTaxEvidencePackageInput): DocumentCollection {
  const source = input.source;
  const documents = new Map<string, TaxEvidenceSourceDocument>();
  const idsByTaxType = new Map<TaxType, Set<string>>();
  const registerTax = (taxType: TaxType, id: string) => {
    const ids = idsByTaxType.get(taxType) ?? new Set<string>();
    ids.add(id);
    idsByTaxType.set(taxType, ids);
  };
  for (const snapshot of source.documentSnapshots) {
    documents.set(snapshot.sourceDocumentId, {
      id: snapshot.sourceDocumentId,
      organizationId: snapshot.organizationId,
      dossierId: snapshot.dossierId,
      snapshotId: snapshot.id,
      fileName: `${snapshot.formNumber}-${snapshot.formVintage}`,
      documentType: snapshot.documentType,
      sha256: snapshot.sourceHash,
      parserName: snapshot.parserName,
      parserVersion: snapshot.parserVersion,
      location: null,
    });
    registerTax(snapshot.taxType, snapshot.sourceDocumentId);
  }
  if (source.corporateTax) {
    for (const line of source.corporateTax.snapshot.adjustmentLines) {
      if (line.origin.kind !== "ledger") continue;
      if (!documents.has(line.origin.snapshotId)) {
        documents.set(line.origin.snapshotId, {
          id: line.origin.snapshotId,
          organizationId: source.organizationId,
          dossierId: source.dossierId,
          snapshotId: line.origin.snapshotId,
          fileName: line.origin.snapshotId,
          documentType: "ledger_snapshot",
          sha256: line.origin.contentHash,
          parserName: null,
          parserVersion: null,
          location: null,
        });
      }
      registerTax("corporate_income_tax", line.origin.snapshotId);
    }
  }
  if (source.vat && source.vat.snapshot.transactionCandidates.length > 0) {
    const id = `ledger:${source.vat.snapshot.taxPeriodId}`;
    documents.set(id, {
      id,
      organizationId: source.organizationId,
      dossierId: source.dossierId,
      snapshotId: id,
      fileName: id,
      documentType: "ledger_snapshot",
      sha256: stableHash(source.vat.snapshot.transactionCandidates.map((candidate) => candidate.candidateHash)),
      parserName: null,
      parserVersion: null,
      location: null,
    });
    registerTax("vat", id);
  }
  if (source.cfe) {
    for (const notice of source.cfe.snapshot.notices) {
      if (notice.sourceDocumentId) {
        documents.set(notice.sourceDocumentId, {
          id: notice.sourceDocumentId,
          organizationId: source.organizationId,
          dossierId: source.dossierId,
          snapshotId: notice.id,
          fileName: `avis-cfe-${notice.taxYear}`,
          documentType: "tax_notice",
          sha256: notice.noticeHash,
          parserName: null,
          parserVersion: null,
          location: null,
        });
        registerTax("cfe", notice.sourceDocumentId);
      }
    }
    if (source.cfe.snapshot.ledger.candidates.length > 0) {
      const id = `ledger:${source.cfe.snapshot.taxPeriodId}`;
      documents.set(id, {
        id,
        organizationId: source.organizationId,
        dossierId: source.dossierId,
        snapshotId: id,
        fileName: id,
        documentType: "ledger_snapshot",
        sha256: stableHash(source.cfe.snapshot.ledger.candidates.map((candidate) => candidate.candidateHash)),
        parserName: null,
        parserVersion: null,
        location: null,
      });
      registerTax("cfe", id);
    }
  }
  for (const evidence of input.supplementalEvidence ?? []) documents.set(evidence.id, evidence);
  return {
    documents: [...documents.values()].sort((left, right) => left.id.localeCompare(right.id)),
    idsByTaxType: Object.fromEntries(
      [...idsByTaxType.entries()].map(([taxType, ids]) => [taxType, [...ids].sort()]),
    ) as Readonly<Partial<Record<TaxType, readonly string[]>>>,
  };
}

function datum(input: Omit<TaxEvidenceDatum, "datumHash">): TaxEvidenceDatum {
  return { ...input, datumHash: stableHash(input) };
}

function collectData(source: TaxCockpitSource, taxType: TaxType): TaxEvidenceDatum[] {
  const data: TaxEvidenceDatum[] = source.documentSnapshots
    .filter((snapshot) => snapshot.taxType === taxType)
    .flatMap((snapshot) => snapshot.fields.map((field) => datum({
      sourceDocumentId: snapshot.sourceDocumentId,
      documentSnapshotId: snapshot.id,
      fieldId: field.id,
      fieldCode: field.fieldCode,
      rawValue: field.rawValue,
      normalizedValue: field.amountCents ?? field.percentageBasisPoints ?? field.normalizedValue,
      unit: field.unit,
      sourceLocation: { ...field.sourceLocation },
    })));
  if (taxType === "corporate_income_tax" && source.corporateTax) {
    for (const line of source.corporateTax.snapshot.adjustmentLines.filter((item) => item.origin.kind === "ledger")) {
      data.push(datum({
        sourceDocumentId: line.origin.snapshotId,
        documentSnapshotId: line.origin.snapshotId,
        fieldId: line.id,
        fieldCode: line.origin.accountCode,
        rawValue: null,
        normalizedValue: line.amountCents,
        unit: "cent",
        sourceLocation: { page: null, sheet: null, cell: null, box: null, zone: null, structuredPath: null },
      }));
    }
  }
  if (taxType === "vat" && source.vat) {
    const documentId = `ledger:${source.vat.snapshot.taxPeriodId}`;
    for (const candidate of source.vat.snapshot.transactionCandidates) {
      data.push(datum({
        sourceDocumentId: documentId,
        documentSnapshotId: documentId,
        fieldId: candidate.id,
        fieldCode: candidate.vatAccounts.join("; ") || null,
        rawValue: null,
        normalizedValue: candidate.vatAmountCents,
        unit: "cent",
        sourceLocation: {
          page: null, sheet: null, cell: null, box: null, zone: null,
          structuredPath: candidate.sourceLineNumbers.length > 0
            ? `fec.lines[${candidate.sourceLineNumbers.join(",")}]`
            : null,
        },
      }));
    }
  }
  if (taxType === "cfe" && source.cfe) {
    for (const notice of source.cfe.snapshot.notices) {
      if (!notice.sourceDocumentId) continue;
      data.push(datum({
        sourceDocumentId: notice.sourceDocumentId,
        documentSnapshotId: notice.id,
        fieldId: notice.id,
        fieldCode: "total_due",
        rawValue: notice.totalDueCents === null ? null : String(notice.totalDueCents),
        normalizedValue: notice.totalDueCents,
        unit: "cent",
        sourceLocation: { page: null, sheet: null, cell: null, box: null, zone: null, structuredPath: null },
      }));
    }
  }
  return data.sort((left, right) =>
    `${left.sourceDocumentId}:${left.fieldId}`.localeCompare(`${right.sourceDocumentId}:${right.fieldId}`));
}

function sourceStatusForRule(
  refs: readonly TaxEvidenceSource[],
  override: TaxRuleStatus | undefined,
): TaxRuleStatus {
  if (override) return override;
  if (refs.some((ref) => ref.status === "superseded")) return "superseded";
  if (refs.some((ref) => ref.status === "future")) return "future";
  if (refs.some((ref) => ref.status === "review_required" || ref.status === "unresolved")) {
    return "review_required";
  }
  return "effective";
}

function calculations(trace: readonly TaxTraceStep[]): TaxEvidenceCalculationStep[] {
  return trace.map((step) => ({
    id: step.id,
    operation: step.operation,
    inputRefs: [...step.inputRefs].sort(),
    outputRef: step.outputRef,
    canonicalInputHash: step.canonicalInputHash,
    sourceVersionIds: [...new Set(step.sourceRefs.map((ref) => ref.sourceVersionId))].sort(),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function latestReview(events: readonly ReviewEvent[], findingId: string): ReviewEvent | undefined {
  return [...events].reverse().find((event) => event.findingId === findingId);
}

function evidenceFinding(input: Omit<TaxEvidenceFinding, "findingHash">): TaxEvidenceFinding {
  return Object.freeze({ ...input, findingHash: stableHash(input) });
}

interface FindingDraft {
  readonly id: string;
  readonly taxType: TaxType;
  readonly title: string;
  readonly controlId: string;
  readonly controlVersion: string;
  readonly sourceRefs: readonly TaxSourceRef[];
  readonly formula: string;
  readonly trace: readonly TaxTraceStep[];
  readonly outcome: TaxControlOutcome;
  readonly amountCents: number | null;
  readonly detail: string;
  readonly evidenceLevel: EvidenceStrength;
  readonly limitationIds: readonly string[];
}

function findingDrafts(source: TaxCockpitSource): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  if (source.corporateTax) {
    const snapshot = source.corporateTax.snapshot;
    drafts.push({
      id: `tax-finding:${snapshot.id}`,
      taxType: "corporate_income_tax",
      title: "Calcul du résultat fiscal et de l'impôt sur les sociétés",
      controlId: `IS.COMPUTATION.RESULT_AND_TAX.${snapshot.regime === "standard" ? "2058A" : "2033B"}`,
      controlVersion: snapshot.calculationVersion,
      sourceRefs: snapshot.sourceRefs,
      formula: "résultat fiscal = résultat comptable + réintégrations retenues - déductions retenues; IS brut = somme(base de tranche × taux)",
      trace: snapshot.trace,
      outcome: snapshot.outcome,
      amountCents: snapshot.grossTaxCents,
      detail: snapshot.grossTaxCents === null
        ? "Calcul IS bloque : aucun impot brut calcule."
        : `Base imposable ${snapshot.taxableBaseCents} centimes; IS brut ${snapshot.grossTaxCents} centimes.`,
      evidenceLevel: snapshot.evidenceStrength,
      limitationIds: snapshot.limitations.map((limitation) => limitation.id),
    });
  }
  if (source.vat) {
    const snapshot = source.vat.snapshot;
    for (const control of snapshot.controls) {
      drafts.push({
        id: `tax-finding:vat:${control.resultHash}`,
        taxType: "vat",
        title: control.title,
        controlId: control.controlId,
        controlVersion: snapshot.calculationVersion,
        sourceRefs: control.sourceRefs,
        formula: `Rapprochement déterministe ${control.controlId} selon les étapes de trace ${snapshot.calculationVersion}.`,
        trace: snapshot.trace,
        outcome: control.outcome,
        amountCents: control.differenceCents,
        detail: control.detail,
        evidenceLevel: control.evidenceStrength,
        limitationIds: control.limitationIds,
      });
    }
  }
  if (source.cfe) {
    const snapshot = source.cfe.snapshot;
    for (const control of snapshot.controls) {
      drafts.push({
        id: `tax-finding:cfe:${control.resultHash}`,
        taxType: "cfe",
        title: control.title,
        controlId: control.controlId,
        controlVersion: snapshot.calculationVersion,
        sourceRefs: control.sourceRefs,
        formula: "Rapprochement avis CFE ↔ charge, règlement et solde comptables; aucune cotisation CFE n'est recalculée.",
        trace: snapshot.trace,
        outcome: control.outcome,
        amountCents: control.differenceCents,
        detail: control.detail,
        evidenceLevel: control.evidenceStrength,
        limitationIds: control.limitationIds,
      });
    }
  }
  return drafts.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildTaxEvidenceFindings(
  input: BuildTaxEvidencePackageInput,
  sources = normativeSources(input),
  documents = collectSourceDocuments(input),
): TaxEvidenceFinding[] {
  const reviews = input.reviewEvents ?? [];
  return findingDrafts(input.source).map((draft) => {
    const exactSources = sources.filter((source) =>
      draft.sourceRefs.some((ref) => sourceRefKey(ref) === `${source.sourceVersionId}\u0000${source.locator}`));
    const review = latestReview(reviews, draft.id);
    const body: Omit<TaxEvidenceFinding, "findingHash"> = {
      id: draft.id,
      organizationId: input.source.organizationId,
      dossierId: input.source.dossierId,
      taxType: draft.taxType,
      title: draft.title,
      sourceDocumentIds: [...(documents.idsByTaxType[draft.taxType] ?? [])],
      data: collectData(input.source, draft.taxType),
      rule: {
        id: draft.controlId,
        version: draft.controlVersion,
        status: sourceStatusForRule(exactSources, input.ruleStatuses?.[draft.controlId]),
      },
      sources: exactSources,
      paragraphs: [...new Set(draft.sourceRefs.map((ref) => ref.locator))].sort(),
      formula: draft.formula,
      intermediateCalculations: calculations(draft.trace),
      result: { outcome: draft.outcome, amountCents: draft.amountCents, detail: draft.detail },
      evidenceLevel: draft.evidenceLevel,
      decision: review?.action ?? "pending",
      comment: review?.comment ?? "",
      supplementalEvidenceIds: [...new Set(
        reviews.filter((event) => event.findingId === draft.id).flatMap((event) => event.relatedEvidenceIds),
      )].sort(),
      limitationIds: [...draft.limitationIds].sort(),
    };
    return evidenceFinding(body);
  });
}

function reconciliationLines(source: TaxCockpitSource): TaxReconciliationLine[] {
  return [
    ...(source.corporateTax?.reconciliationLines ?? []),
    ...(source.vat?.reconciliationLines ?? []),
    ...(source.cfe?.reconciliationLines ?? []),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function controlRows(source: TaxCockpitSource, findings: readonly TaxEvidenceFinding[]): TaxEvidenceControlRow[] {
  const rows: TaxEvidenceControlRow[] = [];
  for (const matrix of source.capabilityMatrices) {
    for (const control of matrix.controls) {
      rows.push({
        controlId: control.controlId,
        controlVersion: control.controlVersion,
        taxType: control.taxType,
        status: control.status,
        outcome: control.outcome,
        evidenceLevel: control.evidenceStrength,
        findingIds: findings.filter((finding) => finding.rule.id === control.controlId).map((finding) => finding.id),
        sourceVersionIds: [...new Set(control.sourceRefs.map((ref) => ref.sourceVersionId))].sort(),
        resultHash: control.resultHash,
      });
    }
  }
  for (const finding of findings) {
    if (rows.some((row) => row.controlId === finding.rule.id && row.controlVersion === finding.rule.version)) continue;
    rows.push({
      controlId: finding.rule.id,
      controlVersion: finding.rule.version,
      taxType: finding.taxType,
      status: "executed",
      outcome: finding.result.outcome,
      evidenceLevel: finding.evidenceLevel,
      findingIds: [finding.id],
      sourceVersionIds: finding.sources.map((sourceRef) => sourceRef.sourceVersionId).sort(),
      resultHash: finding.findingHash,
    });
  }
  return rows.sort((left, right) =>
    `${left.controlId}:${left.controlVersion}`.localeCompare(`${right.controlId}:${right.controlVersion}`));
}

function buildCsvFiles(
  lines: readonly TaxReconciliationLine[],
  findings: readonly TaxEvidenceFinding[],
  controls: readonly TaxEvidenceControlRow[],
  sources: readonly TaxEvidenceSource[],
  reviewEvents: readonly ReviewEvent[],
): TaxEvidenceExportPackage["csv"] {
  return {
    reconciliationLines: buildCsv(
      [
        "id", "organizationId", "dossierId", "executionId", "lineKey", "label",
        "leftSnapshotId", "leftFieldCode", "leftAmountCents", "rightSnapshotId",
        "rightFieldCode", "rightAmountCents", "differenceAmountCents", "toleranceAmountCents",
        "status", "normalizationNotes", "evidenceRefs", "traceStepIds", "lineHash",
      ],
      lines.map((line) => ({
        id: line.id,
        organizationId: line.organizationId,
        dossierId: line.dossierId,
        executionId: line.executionId,
        lineKey: line.lineKey,
        label: line.label,
        leftSnapshotId: line.leftOperand?.snapshotId,
        leftFieldCode: line.leftOperand?.fieldCode,
        leftAmountCents: line.leftOperand?.amountCents,
        rightSnapshotId: line.rightOperand?.snapshotId,
        rightFieldCode: line.rightOperand?.fieldCode,
        rightAmountCents: line.rightOperand?.amountCents,
        differenceAmountCents: line.differenceAmountCents,
        toleranceAmountCents: line.toleranceAmountCents,
        status: line.status,
        normalizationNotes: line.normalizationNotes,
        evidenceRefs: line.evidenceRefs,
        traceStepIds: line.traceStepIds,
        lineHash: line.lineHash,
      })),
    ),
    findings: buildCsv(
      [
        "id", "organizationId", "dossierId", "taxType", "title", "sourceDocumentIds",
        "rawData", "normalizedData", "sourceLocations", "ruleId", "ruleVersion", "ruleStatus",
        "sources", "paragraphs", "formula", "intermediateCalculations", "outcome",
        "resultAmountCents", "resultDetail", "evidenceLevel", "decision", "comment",
        "supplementalEvidenceIds", "limitationIds", "findingHash",
      ],
      findings.map((finding) => ({
        id: finding.id,
        organizationId: finding.organizationId,
        dossierId: finding.dossierId,
        taxType: finding.taxType,
        title: finding.title,
        sourceDocumentIds: finding.sourceDocumentIds,
        rawData: finding.data.map((item) => `${item.fieldCode ?? item.fieldId}:${item.rawValue ?? "null"}`),
        normalizedData: finding.data.map((item) => `${item.fieldCode ?? item.fieldId}:${String(item.normalizedValue)}`),
        sourceLocations: finding.data.map((item) => canonicalJson(item.sourceLocation)),
        ruleId: finding.rule.id,
        ruleVersion: finding.rule.version,
        ruleStatus: finding.rule.status,
        sources: finding.sources.map((item) => item.sourceVersionId),
        paragraphs: finding.paragraphs,
        formula: finding.formula,
        intermediateCalculations: finding.intermediateCalculations.map((step) => `${step.id}:${step.operation}`),
        outcome: finding.result.outcome,
        resultAmountCents: finding.result.amountCents,
        resultDetail: finding.result.detail,
        evidenceLevel: finding.evidenceLevel,
        decision: finding.decision,
        comment: finding.comment,
        supplementalEvidenceIds: finding.supplementalEvidenceIds,
        limitationIds: finding.limitationIds,
        findingHash: finding.findingHash,
      })),
    ),
    controls: buildCsv(
      [
        "controlId", "controlVersion", "taxType", "status", "outcome", "evidenceLevel",
        "findingIds", "sourceVersionIds", "resultHash",
      ],
      controls.map((control) => ({ ...control })),
    ),
    sources: buildCsv(
      [
        "sourceId", "sourceVersionId", "title", "publisher", "versionLabel", "locator",
        "publishedAt", "effectiveFrom", "effectiveTo", "status", "lastVerifiedAt",
        "canonicalUrl", "documentUrl",
      ],
      sources.map((source) => ({ ...source })),
    ),
    reviewEvents: buildCsv(
      [
        "id", "organizationId", "dossierId", "findingId", "action", "actorId", "actorRole",
        "previousStatus", "newStatus", "comment", "relatedEvidenceIds", "createdAt",
        "previousEventHash", "eventHash",
      ],
      reviewEvents.map((event) => ({ ...event })),
    ),
  };
}

function artifact(
  format: TaxEvidenceArtifactFormat,
  fileName: string,
  mediaType: string,
  content: string | Uint8Array,
  extra: Partial<TaxEvidenceArtifact> = {},
): TaxEvidenceArtifact {
  const bytes = typeof content === "string" ? utf8(content) : content;
  return {
    id: fileName,
    format,
    fileName,
    mediaType,
    sha256: sha256Hex(bytes),
    byteLength: bytes.byteLength,
    ...extra,
  };
}

function packageLimitations(input: {
  source: TaxCockpitSource;
  findings: readonly TaxEvidenceFinding[];
  documents: readonly TaxEvidenceSourceDocument[];
  sources: readonly TaxEvidenceSource[];
  reviewEvents: readonly ReviewEvent[];
}): TaxEvidenceManifest["limitations"] {
  const limitations: Array<{ code: string; message: string; subjects: string[] }> =
    input.source.synthesis.limitations.map((item) => ({
      code: item.code,
      message: item.message,
      subjects: [...item.relatedIds],
    }));
  const add = (code: string, message: string, subjects: readonly string[]) => {
    const uniqueSubjects = [...new Set(subjects)].sort();
    if (uniqueSubjects.length > 0) limitations.push({ code, message, subjects: uniqueSubjects });
  };
  add(
    "missing_source_document",
    "Aucun document source n'est relié à certains constats; le résultat reste exporté avec cette limitation.",
    input.findings.filter((finding) => finding.sourceDocumentIds.length === 0).map((finding) => finding.id),
  );
  add(
    "missing_raw_data",
    "La donnée brute n'est pas disponible pour certains maillons issus d'un snapshot comptable dérivé.",
    input.findings.filter((finding) => finding.data.some((item) => item.rawValue === null)).map((finding) => finding.id),
  );
  add(
    "missing_normative_source",
    "Aucune source normative exacte n'est reliée à certains constats.",
    input.findings.filter((finding) => finding.sources.length === 0).map((finding) => finding.id),
  );
  add(
    "future_source",
    "Une source marquée future est conservée dans l'export mais ne peut étayer une conclusion pour la période.",
    input.sources.filter((source) =>
      source.status === "future" ||
      (source.effectiveFrom !== null &&
        input.source.periods.every((period) => source.effectiveFrom! > period.endDate)))
      .map((source) => source.sourceVersionId),
  );
  add(
    "review_required_source",
    "Une source officielle porte le statut review_required : son périmètre ou sa période d'application doit être validé avant toute conclusion élargie.",
    input.sources.filter((source) => source.status === "review_required")
      .map((source) => source.sourceVersionId),
  );
  add(
    "superseded_source",
    "Une version de source remplacée est conservée pour le rejeu historique.",
    input.sources.filter((source) => source.status === "superseded").map((source) => source.sourceVersionId),
  );
  add(
    "unresolved_source",
    "Les métadonnées de certaines références de source ne sont pas résolues dans le registre épinglé.",
    input.sources.filter((source) => source.status === "unresolved").map((source) => source.sourceVersionId),
  );
  add(
    "superseded_rule",
    "Une règle remplacée reste identifiée par sa version afin de préserver l'historique; elle n'est pas présentée comme actuelle.",
    input.findings.filter((finding) => finding.rule.status === "superseded").map((finding) => finding.id),
  );
  add(
    "invalid_source_hash",
    "Un document source ne porte pas une empreinte SHA-256 hexadécimale complète.",
    input.documents.filter((document) => !SHA256_PATTERN.test(document.sha256)).map((document) => document.id),
  );
  const knownEvidence = new Set(input.documents.map((document) => document.id));
  add(
    "missing_supplemental_evidence",
    "Un justificatif référencé par une décision n'est pas présent dans le paquet.",
    [...new Set(input.reviewEvents.flatMap((event) => event.relatedEvidenceIds)
      .filter((id) => !knownEvidence.has(id)))],
  );
  return limitations.sort((left, right) =>
    left.code.localeCompare(right.code) || left.subjects.join("|").localeCompare(right.subjects.join("|")));
}

export async function buildTaxEvidenceExportPackage(
  input: BuildTaxEvidencePackageInput,
  options: BuildTaxEvidencePackageOptions,
): Promise<TaxEvidenceExportPackage> {
  assertTaxExportScope(input, options);
  const reviewEvents = [...(input.reviewEvents ?? [])];
  const verification = verifyReviewEventChain(reviewEvents);
  if (!verification.valid) {
    throw new Error(`TAX_EXPORT_REVIEW_CHAIN_INVALID:${verification.errors.join(",")}`);
  }
  const projection = buildTaxReviewProjection(
    reviewEvents,
    input.source.organizationId,
    input.source.dossierId,
  );
  const sources = normativeSources(input);
  const documentCollection = collectSourceDocuments(input);
  const findings = buildTaxEvidenceFindings(input, sources, documentCollection);
  const reviewedSynthesis = projectFiscalSynthesisWithTaxReview(
    input.source.synthesis,
    findings.map((finding) => finding.id),
    reviewEvents,
  );
  const reviewedSource: TaxCockpitSource = { ...input.source, synthesis: reviewedSynthesis };
  const lines = reconciliationLines(input.source);
  const controls = controlRows(input.source, findings);
  const profile = input.profile ?? input.source.profile;
  const taxProfileJson = canonicalJson(profile);
  const computation: TaxComputationEvidenceExport = {
    exportSchemaVersion: "1.0.0",
    organizationId: input.source.organizationId,
    dossierId: input.source.dossierId,
    entityId: input.source.entityId,
    fiscalSynthesis: reviewedSynthesis,
    corporateIncomeTax: input.source.corporateTax?.snapshot ?? null,
    vat: input.source.vat?.snapshot ?? null,
    otherTaxes: { cfe: input.source.cfe?.snapshot ?? null },
    findings,
    reviewEvents: projection.events,
    reviewEventsDigest: projection.digest,
  };
  const taxComputationJson = canonicalJson(computation);
  const csv = buildCsvFiles(lines, findings, controls, sources, projection.events);
  const limitations = packageLimitations({
    source: input.source,
    findings,
    documents: documentCollection.documents,
    sources,
    reviewEvents: projection.events,
  });
  const manifestSummary = {
    manifestVersion: "1.0.0-tax" as const,
    fiscalSnapshotSha256: reviewedSynthesis.snapshotHash,
    reviewEventsDigest: projection.digest,
    limitations,
  };
  const html = buildFiscalNoteHtml({
    source: reviewedSource,
    profile,
    documents: documentCollection.documents,
    findings,
    reviewEvents: projection.events,
    sources,
    manifestSummary,
  });
  const { buildPdfFromAccessibleHtml } = await import("./pdf");
  const pdf = await buildPdfFromAccessibleHtml(html, {
    title: `Note fiscale PROBANT - ${input.source.entityName}`,
    createdAt: input.source.generatedAt,
  });
  const artifacts: TaxEvidenceArtifact[] = [
    artifact("tax_profile_json", "tax-profile.json", "application/json", taxProfileJson),
    artifact("tax_computation_json", "tax-computation.json", "application/json", taxComputationJson),
    artifact("tax_reconciliation_lines_csv", "tax-reconciliation-lines.csv", "text/csv;charset=utf-8", csv.reconciliationLines),
    artifact("tax_findings_csv", "tax-findings.csv", "text/csv;charset=utf-8", csv.findings),
    artifact("tax_controls_csv", "tax-controls.csv", "text/csv;charset=utf-8", csv.controls),
    artifact("tax_sources_csv", "tax-sources.csv", "text/csv;charset=utf-8", csv.sources),
    artifact("tax_review_events_csv", "tax-review-events.csv", "text/csv;charset=utf-8", csv.reviewEvents),
    artifact("fiscal_note_html", "fiscal-note.html", "text/html;charset=utf-8", html),
    artifact("fiscal_note_pdf", "fiscal-note.pdf", "application/pdf", pdf, {
      derivedFrom: "fiscal-note.html",
      validation: {
        pdfA: {
          status: "not_validated",
          profile: null,
          validator: null,
          validatedAt: null,
        },
      },
    }),
  ];
  const manifest: TaxEvidenceManifest = {
    ...manifestSummary,
    applicationVersion: options.applicationVersion,
    organizationId: input.source.organizationId,
    dossierId: input.source.dossierId,
    entityId: input.source.entityId,
    fiscalYear: input.source.fiscalYear,
    createdAt: input.source.generatedAt,
    sourceDocuments: documentCollection.documents,
    normativeSources: sources,
    artifacts,
  };
  return {
    manifest,
    manifestJson: canonicalJson(manifest),
    taxProfileJson,
    taxComputationJson,
    csv,
    html,
    pdf,
  };
}

export function verifyTaxEvidenceExportPackage(pack: TaxEvidenceExportPackage): string[] {
  const errors: string[] = [];
  if (canonicalJson(pack.manifest) !== pack.manifestJson) errors.push("TAX_MANIFEST_NOT_CANONICAL");
  const contents = new Map<TaxEvidenceArtifactFormat, string | Uint8Array>([
    ["tax_profile_json", pack.taxProfileJson],
    ["tax_computation_json", pack.taxComputationJson],
    ["tax_reconciliation_lines_csv", pack.csv.reconciliationLines],
    ["tax_findings_csv", pack.csv.findings],
    ["tax_controls_csv", pack.csv.controls],
    ["tax_sources_csv", pack.csv.sources],
    ["tax_review_events_csv", pack.csv.reviewEvents],
    ["fiscal_note_html", pack.html],
    ["fiscal_note_pdf", pack.pdf],
  ]);
  for (const artifactEntry of pack.manifest.artifacts) {
    const content = contents.get(artifactEntry.format);
    if (content === undefined) {
      errors.push(`TAX_ARTIFACT_MISSING:${artifactEntry.id}`);
      continue;
    }
    const bytes = typeof content === "string" ? utf8(content) : content;
    if (sha256Hex(bytes) !== artifactEntry.sha256) {
      errors.push(`TAX_ARTIFACT_HASH_INVALID:${artifactEntry.id}`);
    }
    if (bytes.byteLength !== artifactEntry.byteLength) {
      errors.push(`TAX_ARTIFACT_LENGTH_INVALID:${artifactEntry.id}`);
    }
  }
  if (
    pack.manifest.artifacts.length !== TAX_EVIDENCE_ARTIFACT_FORMATS.length ||
    TAX_EVIDENCE_ARTIFACT_FORMATS.some((format) => !pack.manifest.artifacts.some((item) => item.format === format))
  ) {
    errors.push("TAX_ARTIFACT_REFERENCES_INCOMPLETE");
  }
  const htmlArtifact = pack.manifest.artifacts.find((item) => item.format === "fiscal_note_html");
  const pdfArtifact = pack.manifest.artifacts.find((item) => item.format === "fiscal_note_pdf");
  if (!htmlArtifact || pdfArtifact?.derivedFrom !== htmlArtifact.fileName) {
    errors.push("TAX_PDF_HTML_DERIVATION_INVALID");
  }
  if (pdfArtifact?.validation?.pdfA.status === "valid" &&
    (!pdfArtifact.validation.pdfA.validator || !pdfArtifact.validation.pdfA.profile)) {
    errors.push("TAX_PDF_ARCHIVE_VALIDATION_INCOMPLETE");
  }
  if (pack.manifest.sourceDocuments.some((document) => !SHA256_PATTERN.test(document.sha256))) {
    errors.push("TAX_SOURCE_HASH_INVALID");
  }
  const computation = JSON.parse(pack.taxComputationJson) as TaxComputationEvidenceExport;
  if (computation.fiscalSynthesis.snapshotHash !== pack.manifest.fiscalSnapshotSha256) {
    errors.push("TAX_SNAPSHOT_HASH_MISMATCH");
  }
  if (computation.reviewEventsDigest !== pack.manifest.reviewEventsDigest) {
    errors.push("TAX_REVIEW_DIGEST_MISMATCH");
  }
  const manifestSources = new Set(pack.manifest.normativeSources.map((source) =>
    `${source.sourceVersionId}\u0000${source.locator}`));
  const manifestDocuments = new Set(pack.manifest.sourceDocuments.map((document) => document.id));
  for (const finding of computation.findings) {
    for (const documentId of finding.sourceDocumentIds) {
      if (!manifestDocuments.has(documentId)) {
        errors.push(`TAX_FINDING_DOCUMENT_OMITTED:${finding.id}:${documentId}`);
      }
    }
    for (const source of finding.sources) {
      if (!manifestSources.has(`${source.sourceVersionId}\u0000${source.locator}`)) {
        errors.push(`TAX_FINDING_SOURCE_OMITTED:${finding.id}:${source.sourceVersionId}`);
      }
    }
    const { findingHash, ...body } = finding;
    if (stableHash(body) !== findingHash) errors.push(`TAX_FINDING_HASH_INVALID:${finding.id}`);
  }
  const verification = verifyReviewEventChain([...computation.reviewEvents]);
  if (!verification.valid || reviewEventsDigest([...computation.reviewEvents]) !== pack.manifest.reviewEventsDigest) {
    errors.push("TAX_REVIEW_CHAIN_INVALID");
  }
  return [...new Set(errors)];
}

import type {
  EvidenceStrength,
  TaxCapabilityMatrix,
  TaxControlContext,
  TaxControlDataRef,
  TaxControlDefinition,
  TaxControlExecutionState,
  TaxControlInputDocument,
  TaxControlOutcome,
  TaxControlPlanningStatus,
  TaxControlResult,
  TaxLimitation,
  TaxProfile,
  TaxRecommendation,
} from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";
import { TAX_CONTROL_DEFINITIONS } from "./control-catalog";
import { recommendationsForMissingInputs } from "./recommendations";

const BLOCKED_CONCLUSIONS: readonly TaxControlOutcome[] = [
  "passed",
  "confirmed_non_compliance",
  "reconciliation_difference",
  "potential_tax_risk",
];

const EVIDENCE_ORDER: Readonly<Record<EvidenceStrength, number>> = {
  insufficient: 0,
  derived: 1,
  direct: 2,
  corroborated: 3,
};

const POSSIBLE_STATUSES = new Set<TaxControlPlanningStatus>([
  "ready",
  "running",
  "concluded",
  "inconclusive",
]);

function byCode(left: string, right: string): number {
  return left.localeCompare(right);
}

function capEvidence(actual: EvidenceStrength, maximum: EvidenceStrength): EvidenceStrength {
  return EVIDENCE_ORDER[actual] <= EVIDENCE_ORDER[maximum] ? actual : maximum;
}

function documentCoversPeriod(document: TaxControlInputDocument, context: TaxControlContext): boolean {
  if (document.documentType === "fec" || document.documentType === "balance") {
    return document.periodStart <= context.period.startDate && document.periodEnd >= context.period.endDate;
  }
  return document.periodStart === context.period.startDate && document.periodEnd === context.period.endDate;
}

function usableDocuments(context: TaxControlContext, definition: TaxControlDefinition): readonly TaxControlInputDocument[] {
  const relevantTypes = new Set([
    ...definition.requiredDocumentTypes,
    ...definition.conclusiveDocumentTypes,
  ]);
  return context.documents
    .filter((document) =>
      relevantTypes.has(document.documentType) &&
      document.status === "active" &&
      documentCoversPeriod(document, context) &&
      (document.formVintage === null || document.formVintage === context.period.formVintage))
    .sort((left, right) => `${left.documentType}:${left.snapshotId}`.localeCompare(`${right.documentType}:${right.snapshotId}`));
}

function hasDocument(documents: readonly TaxControlInputDocument[], documentType: string): boolean {
  return documents.some((document) => document.documentType === documentType);
}

function documentForField(documents: readonly TaxControlInputDocument[], fieldCode: string): TaxControlInputDocument | undefined {
  return documents.find((document) => document.usableFieldCodes.includes(fieldCode));
}

function profileInputAvailable(profile: TaxProfile, code: string, conclusive: boolean): boolean {
  if (code === "profile:capitalPaidStatus") return profile.capitalPaidStatus !== "unknown";
  if (code === "profile:ownershipStatus") {
    return profile.ownershipStatus === "known" && profile.qualifyingIndividualOwnershipBasisPoints !== null;
  }
  if (code === "profile:turnoverAmountCents") return profile.turnoverAmountCents !== null;
  if (code === "profile:corporateIncomeTaxRegime") return profile.corporateIncomeTaxRegime !== "unknown";
  if (code === "profile:vatRegime") return profile.vatRegime !== "unknown";
  const key = code.startsWith("parameter:") ? code.slice("parameter:".length) : code;
  const parameter = profile.parameters.find((candidate) => candidate.key === key);
  if (!parameter || parameter.value === null) return false;
  return !conclusive || parameter.verificationStatus === "verified";
}

function limitation(controlId: string, inputCode: string, status: TaxControlPlanningStatus): TaxLimitation {
  const [kind] = inputCode.split(":", 1);
  const reason = kind === "document"
    ? "missing_document"
    : kind === "field"
      ? "missing_field"
      : kind === "period"
        ? "period_mismatch"
        : "missing_or_unverified_parameter";
  const message = status === "inconclusive"
    ? `Le contrôle ${controlId} peut être préparé mais ne peut pas conclure sans ${inputCode}.`
    : `Le contrôle ${controlId} ne peut pas être exécuté sans ${inputCode}.`;
  return {
    id: `tax-limitation:${controlId}:${inputCode}`,
    code: `TAX_INPUT_REQUIRED:${inputCode}`,
    scope: kind === "field" ? "field" : kind === "document" ? "document" : kind === "period" ? "period" : "control",
    capabilityStatus: "available",
    reason,
    message,
    blockedOutcomes: BLOCKED_CONCLUSIONS,
    requiredInputs: [inputCode],
    relatedIds: [controlId],
    resolvability: kind === "parameter" || kind === "profile" || kind === "period" ? "human_review" : "user_can_supply",
  };
}

function capabilityLimitation(definition: TaxControlDefinition): TaxLimitation {
  return {
    id: `tax-limitation:${definition.controlId}:capability`,
    code: `TAX_CAPABILITY_${definition.capabilityStatus.toUpperCase()}`,
    scope: "control",
    capabilityStatus: definition.capabilityStatus,
    reason: "engine_capability_unavailable",
    message: `Le contrôle ${definition.controlId} est applicable mais sa capacité d'exécution est ${definition.capabilityStatus}.`,
    blockedOutcomes: BLOCKED_CONCLUSIONS,
    requiredInputs: [],
    relatedIds: [definition.controlId],
    resolvability: definition.capabilityStatus === "future" ? "future_engine" : "not_resolvable",
  };
}

function applicableRegime(definition: TaxControlDefinition, context: TaxControlContext): {
  readonly applicable: boolean;
  readonly unknownInput: string | null;
} {
  if (definition.taxType === "corporate_income_tax") {
    if (context.profile.corporateIncomeTaxRegime === "unknown") {
      return { applicable: true, unknownInput: "profile:corporateIncomeTaxRegime" };
    }
    return {
      applicable: definition.applicability.corporateIncomeTaxRegimes.includes(context.profile.corporateIncomeTaxRegime),
      unknownInput: null,
    };
  }
  if (definition.taxType === "vat") {
    if (context.profile.vatRegime === "unknown") {
      return { applicable: true, unknownInput: "profile:vatRegime" };
    }
    return {
      applicable: definition.applicability.vatRegimes.includes(context.profile.vatRegime),
      unknownInput: null,
    };
  }
  return { applicable: true, unknownInput: null };
}

function executionFor(context: TaxControlContext, definition: TaxControlDefinition): TaxControlExecutionState | undefined {
  return context.executionStates.find((execution) =>
    execution.controlId === definition.controlId &&
    execution.controlVersion === definition.controlVersion &&
    execution.definitionHash === definition.definitionHash);
}

function evidenceFromDocuments(
  documents: readonly TaxControlInputDocument[],
  conclusive: boolean,
  maximum: EvidenceStrength,
): EvidenceStrength {
  if (documents.length === 0) return "insufficient";
  if (conclusive && new Set(documents.map((document) => document.documentType)).size >= 2) {
    return capEvidence("corroborated", maximum);
  }
  const strongest = documents.reduce<EvidenceStrength>((current, document) =>
    EVIDENCE_ORDER[document.evidenceStrength] > EVIDENCE_ORDER[current]
      ? document.evidenceStrength
      : current, "insufficient");
  return capEvidence(strongest, maximum);
}

function dataRefs(
  context: TaxControlContext,
  definition: TaxControlDefinition,
  documents: readonly TaxControlInputDocument[],
  execution: TaxControlExecutionState | undefined,
): readonly TaxControlDataRef[] {
  const result: TaxControlDataRef[] = [{
    kind: "period",
    code: "taxPeriod",
    sourceId: context.period.id,
    contentHash: context.period.contentHash,
  }];
  if (definition.taxType === "corporate_income_tax") {
    result.push({ kind: "profile", code: "corporateIncomeTaxRegime", sourceId: context.profile.id, contentHash: context.profile.contentHash });
  }
  if (definition.taxType === "vat") {
    result.push({ kind: "profile", code: "vatRegime", sourceId: context.profile.id, contentHash: context.profile.contentHash });
  }
  for (const document of documents) {
    result.push({ kind: "document", code: document.documentType, sourceId: document.snapshotId, contentHash: document.contentHash });
    for (const fieldCode of document.usableFieldCodes) {
      if ([...definition.requiredFieldCodes, ...definition.conclusiveFieldCodes].includes(fieldCode)) {
        result.push({ kind: "field", code: fieldCode, sourceId: document.snapshotId, contentHash: document.contentHash });
      }
    }
  }
  for (const code of [...definition.requiredParameterKeys, ...definition.conclusiveParameterKeys]) {
    if (profileInputAvailable(context.profile, code, true)) {
      result.push({ kind: code.startsWith("profile:") ? "profile" : "parameter", code, sourceId: context.profile.id, contentHash: context.profile.contentHash });
    }
  }
  if (execution) {
    result.push({ kind: "execution", code: execution.status, sourceId: `${execution.controlId}:${execution.controlVersion}`, contentHash: execution.executionHash });
  }
  return result.sort((left, right) => `${left.kind}:${left.code}:${left.sourceId}`.localeCompare(`${right.kind}:${right.code}:${right.sourceId}`));
}

function mergeRecommendations(recommendations: readonly TaxRecommendation[]): readonly TaxRecommendation[] {
  const grouped = new Map<string, TaxRecommendation[]>();
  for (const recommendation of recommendations) {
    const key = `${recommendation.ruleId}:${recommendation.ruleVersion}`;
    grouped.set(key, [...(grouped.get(key) ?? []), recommendation]);
  }
  return [...grouped.values()]
    .map((items) => {
      const first = items[0];
      const merged = {
        recommendationId: first.ruleId,
        ruleId: first.ruleId,
        ruleVersion: first.ruleVersion,
        kind: first.kind,
        title: first.title,
        action: first.action,
        requestedInputCodes: [...new Set(items.flatMap((item) => item.requestedInputCodes))].sort(byCode),
        controlIds: [...new Set(items.flatMap((item) => item.controlIds))].sort(byCode),
        priority: items.some((item) => item.priority === "required") ? "required" as const : "recommended" as const,
      };
      return { ...merged, recommendationHash: stableHash(merged) };
    })
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

export class TaxControlPlanner {
  constructor(
    private readonly definitions: readonly TaxControlDefinition[] = TAX_CONTROL_DEFINITIONS,
  ) {}

  plan(context: TaxControlContext): TaxCapabilityMatrix {
    this.assertContext(context);
    const controls = [...this.definitions]
      .sort((left, right) => `${left.controlId}:${left.controlVersion}`.localeCompare(`${right.controlId}:${right.controlVersion}`))
      .map((definition) => this.planControl(context, definition));
    const recommendations = mergeRecommendations(controls.flatMap((control) => control.recommendations));
    const matrix = {
      organizationId: context.organizationId,
      dossierId: context.dossierId,
      entityId: context.entityId,
      taxPeriodId: context.period.id,
      plannerVersion: context.plannerVersion,
      controls,
      verifiedControlIds: controls.filter((control) => control.status === "concluded").map((control) => control.controlId).sort(byCode),
      calculatedControlIds: controls.filter((control) => control.status === "concluded" && control.calculationPerformed).map((control) => control.controlId).sort(byCode),
      inconclusiveControlIds: controls.filter((control) => ["missing_inputs", "inconclusive", "eligible", "failed"].includes(control.status)).map((control) => control.controlId).sort(byCode),
      possibleControlIds: controls.filter((control) => POSSIBLE_STATUSES.has(control.status)).map((control) => control.controlId).sort(byCode),
      impossibleControlIds: controls.filter((control) => ["missing_inputs", "eligible", "failed"].includes(control.status)).map((control) => control.controlId).sort(byCode),
      notApplicableControlIds: controls.filter((control) => control.status === "not_applicable").map((control) => control.controlId).sort(byCode),
      recommendations,
    } satisfies Omit<TaxCapabilityMatrix, "matrixHash">;
    return Object.freeze({ ...matrix, matrixHash: stableHash(matrix) });
  }

  private planControl(context: TaxControlContext, definition: TaxControlDefinition): TaxControlResult {
    const regime = applicableRegime(definition, context);
    const periodApplicable = definition.taxType === context.period.taxType &&
      definition.fiscalYears.includes(context.period.fiscalYear) &&
      definition.formVintages.includes(context.period.formVintage) &&
      context.period.endDate >= definition.effectiveFrom &&
      (definition.effectiveTo === null || context.period.startDate <= definition.effectiveTo);
    if (!periodApplicable || !regime.applicable) {
      return this.result(context, definition, {
        status: "not_applicable",
        missingData: [],
        documents: [],
        limitations: [],
        recommendations: [],
        execution: undefined,
        outcome: null,
        evidenceStrength: "insufficient",
        calculationPerformed: false,
      });
    }

    const documents = usableDocuments(context, definition);
    const requiredMissing = [
      ...(regime.unknownInput ? [regime.unknownInput] : []),
      ...definition.requiredDocumentTypes.filter((type) => !hasDocument(documents, type)).map((type) => `document:${type}`),
      ...definition.requiredFieldCodes.filter((code) => !documentForField(documents, code)).map((code) => `field:${code}`),
      ...definition.requiredParameterKeys.filter((code) => !profileInputAvailable(context.profile, code, false)),
    ];
    if (definition.taxType === "corporate_income_tax" &&
      (context.profile.accountingPeriod.startDate !== context.period.startDate ||
        context.profile.accountingPeriod.endDate !== context.period.endDate)) {
      requiredMissing.push("period:accountingPeriodAlignment");
    }
    const conclusiveMissing = [
      ...definition.conclusiveDocumentTypes.filter((type) => !hasDocument(documents, type)).map((type) => `document:${type}`),
      ...definition.conclusiveFieldCodes.filter((code) => !documentForField(documents, code)).map((code) => `field:${code}`),
      ...definition.conclusiveParameterKeys.filter((code) => !profileInputAvailable(context.profile, code, true)),
    ].filter((code) => !requiredMissing.includes(code));
    const execution = executionFor(context, definition);
    const allMissing = [...new Set([...requiredMissing, ...conclusiveMissing])].sort(byCode);
    const recommendations = recommendationsForMissingInputs({
      controlId: definition.controlId,
      missingInputCodes: allMissing,
      allowedRuleIds: definition.recommendationRuleIds,
    });

    if (execution) {
      const status = execution.status;
      return this.result(context, definition, {
        status,
        missingData: [],
        documents,
        limitations: status === "failed" ? [{
          id: `tax-limitation:${definition.controlId}:execution-failed`,
          code: "TAX_CONTROL_EXECUTION_FAILED",
          scope: "control",
          capabilityStatus: "available",
          reason: "execution_failed",
          message: `L'exécution du contrôle ${definition.controlId} a échoué sans produire de conclusion.`,
          blockedOutcomes: BLOCKED_CONCLUSIONS,
          requiredInputs: [],
          relatedIds: [definition.controlId],
          resolvability: "human_review",
        }] : [],
        recommendations: [],
        execution,
        outcome: status === "concluded" ? execution.outcome : null,
        evidenceStrength: capEvidence(execution.evidenceStrength, definition.maximumEvidenceStrength),
        calculationPerformed: status === "concluded" && execution.calculationPerformed,
      });
    }

    if (requiredMissing.length > 0) {
      return this.result(context, definition, {
        status: "missing_inputs",
        missingData: allMissing,
        documents,
        limitations: allMissing.map((code) => limitation(definition.controlId, code, "missing_inputs")),
        recommendations,
        execution: undefined,
        outcome: null,
        evidenceStrength: "insufficient",
        calculationPerformed: false,
      });
    }

    if (definition.capabilityStatus !== "available" || definition.automation === "unavailable") {
      return this.result(context, definition, {
        status: "eligible",
        missingData: conclusiveMissing,
        documents,
        limitations: [capabilityLimitation(definition)],
        recommendations,
        execution: undefined,
        outcome: null,
        evidenceStrength: evidenceFromDocuments(documents, false, definition.maximumEvidenceStrength),
        calculationPerformed: false,
      });
    }

    if (conclusiveMissing.length > 0) {
      return this.result(context, definition, {
        status: "inconclusive",
        missingData: conclusiveMissing.sort(byCode),
        documents,
        limitations: conclusiveMissing.map((code) => limitation(definition.controlId, code, "inconclusive")),
        recommendations,
        execution: undefined,
        outcome: null,
        evidenceStrength: evidenceFromDocuments(documents, false, definition.maximumEvidenceStrength),
        calculationPerformed: false,
      });
    }

    return this.result(context, definition, {
      status: "ready",
      missingData: [],
      documents,
      limitations: [],
      recommendations: [],
      execution: undefined,
      outcome: null,
      evidenceStrength: evidenceFromDocuments(documents, true, definition.maximumEvidenceStrength),
      calculationPerformed: false,
    });
  }

  private result(
    context: TaxControlContext,
    definition: TaxControlDefinition,
    plan: {
      readonly status: TaxControlPlanningStatus;
      readonly missingData: readonly string[];
      readonly documents: readonly TaxControlInputDocument[];
      readonly limitations: readonly TaxLimitation[];
      readonly recommendations: readonly TaxRecommendation[];
      readonly execution: TaxControlExecutionState | undefined;
      readonly outcome: TaxControlOutcome | null;
      readonly evidenceStrength: EvidenceStrength;
      readonly calculationPerformed: boolean;
    },
  ): TaxControlResult {
    const result = {
      controlId: definition.controlId,
      controlVersion: definition.controlVersion,
      definitionHash: definition.definitionHash,
      title: definition.title,
      taxType: definition.taxType,
      stage: "tax_review" as const,
      status: plan.status,
      outcome: plan.outcome,
      severity: null,
      evidenceStrength: plan.evidenceStrength,
      maximumEvidenceStrength: definition.maximumEvidenceStrength,
      usedData: dataRefs(context, definition, plan.documents, plan.execution),
      missingData: [...plan.missingData].sort(byCode),
      sourceRefs: definition.sourceRefs,
      limitations: [...plan.limitations].sort((left, right) => left.id.localeCompare(right.id)),
      recommendations: [...plan.recommendations].sort((left, right) => left.ruleId.localeCompare(right.ruleId)),
      calculationPerformed: plan.calculationPerformed,
    } satisfies Omit<TaxControlResult, "resultHash">;
    return Object.freeze({ ...result, resultHash: stableHash(result) });
  }

  private assertContext(context: TaxControlContext): void {
    const owned = [context.profile, context.period];
    if (owned.some((item) => item.organizationId !== context.organizationId || item.dossierId !== context.dossierId || item.entityId !== context.entityId)) {
      throw new Error("TAX_CONTROL_CONTEXT_SCOPE_MISMATCH");
    }
    if (context.documents.some((document) => !document.contentHash || document.periodEnd < document.periodStart)) {
      throw new Error("TAX_CONTROL_CONTEXT_DOCUMENT_INVALID");
    }
    if (context.documents.some((document) =>
      document.organizationId !== context.organizationId ||
      document.dossierId !== context.dossierId ||
      document.entityId !== context.entityId)) {
      throw new Error("TAX_CONTROL_CONTEXT_DOCUMENT_SCOPE_MISMATCH");
    }
    if (context.executionStates.some((execution) =>
      execution.organizationId !== context.organizationId ||
      execution.dossierId !== context.dossierId ||
      execution.entityId !== context.entityId ||
      execution.taxPeriodId !== context.period.id)) {
      throw new Error("TAX_CONTROL_CONTEXT_EXECUTION_SCOPE_MISMATCH");
    }
  }
}

export function buildTaxCapabilityMatrix(
  context: TaxControlContext,
  definitions: readonly TaxControlDefinition[] = TAX_CONTROL_DEFINITIONS,
): TaxCapabilityMatrix {
  return new TaxControlPlanner(definitions).plan(context);
}


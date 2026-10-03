import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { cents, money } from "@/lib/canonical-model/money";
import type { CalculationRun, ResultAssessment } from "@/lib/canonical-model/calculation";
import { assessmentSchema, assessmentOutcome } from "./result-contract";
import { periodIssues, type AccountingPeriod } from "@/lib/canonical-model/period";
import { assertScope, frozen, moneySchema, periodId, type Population, type RuleReference, type SelectionSet, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { validateSelectionSources } from "./selection";

class InvalidCalculationInput extends Error {}

interface RegisteredCalculation {
  reference: RuleReference;
  evaluate(input: unknown, parameters: unknown): unknown;
  outcome(result: unknown): CalculationRun["outcome"];
  validateContext(request: CalculationRequest): void;
  assess?(result: unknown): ResultAssessment;
}
export interface CalculationRequest {
  scope: WorkpaperScope; period: AccountingPeriod; rule: { id: string; version: string };
  imports: ImportBatch[]; population: Population; selection: SelectionSet; parameters: unknown;
}
/** Version-addressed registry. Functions receive only frozen, validated inputs. */
export class CalculationRegistry {
  private readonly definitions = new Map<string, RegisteredCalculation>();
  register<I, P, O>(reference: RuleReference, input: z.ZodType<I>, parameters: z.ZodType<P>, output: z.ZodType<O>, compute: (input: I, parameters: P) => O, classify: (output: O) => CalculationRun["outcome"] = () => "no_exception_detected", validateContext: (request: CalculationRequest) => void = () => {}, assess?: (output: O) => ResultAssessment) {
    const key = `${reference.id}@${reference.version}`;
    if (this.definitions.has(key)) throw new Error("CALCULATION_VERSION_ALREADY_REGISTERED");
    this.definitions.set(key, { reference: frozen(reference), evaluate: (i, p) => {
      const validatedInput = input.safeParse(i), validatedParameters = parameters.safeParse(p);
      if (!validatedInput.success || !validatedParameters.success) throw new InvalidCalculationInput("CALCULATION_INPUT_INVALID");
      return output.parse(compute(frozen(validatedInput.data), frozen(validatedParameters.data)));
    }, outcome: (result) => classify(output.parse(result)), validateContext, assess: assess ? (result) => assessmentSchema.parse(assess(output.parse(result))) : undefined });
  }
  execute(request: CalculationRequest): CalculationRun {
    const definition = this.definitions.get(`${request.rule.id}@${request.rule.version}`);
    assertScope(request.scope, request.population.scope); assertScope(request.scope, request.selection.scope);
    request.imports.forEach((b) => assertScope(request.scope, b.scope));
    const warnings: string[] = [], blockedControls: string[] = [];
    try { validateSelectionSources(request.population, request.selection, request.imports); } catch { blockedControls.push("population_or_selection_not_reproducible"); }
    if (periodIssues(request.period).length || periodId(request.period) !== request.scope.periodId) blockedControls.push("period");
    if (!definition) blockedControls.push("rule_version_unavailable");
    if (definition && (definition.reference.effectiveFrom > request.period.closingDate || (definition.reference.effectiveTo && definition.reference.effectiveTo < request.period.closingDate) || (request.scope.mode === "real" && definition.reference.validation !== "validated"))) blockedControls.push("rule_not_applicable");
    if (!request.imports.length || request.imports.some((b) => !b.approval || !b.report.calculationAllowed || b.report.blocking.length)) blockedControls.push("unapproved_import");
    if (request.population.importIds.some((id) => !request.imports.some((b) => b.id === id))) blockedControls.push("population_import_missing");
    if (request.population.hash !== request.selection.populationHash) blockedControls.push("stale_selection");
    const selected = request.selection.selectedIds.map((id) => request.population.items.find((i) => i.id === id));
    if (!selected.length || selected.some((i) => !i) || new Set(request.selection.selectedIds).size !== selected.length) blockedControls.push("invalid_selection");
    const rows = request.imports.flatMap((b) => b.rows);
    if (selected.some((i) => i?.rowIds.some((id) => !rows.some((r) => r.id === id && r.normalized && !r.errors.length)))) blockedControls.push("source_row_missing");
    const sourceRefs = request.imports.map((b) => ({ documentId: b.document.logicalId, documentVersionId: b.document.id, normalizedHash: stableSha256(b.rows), fingerprint: b.document.byteHash, parserVersion: b.document.parserVersion, mappingVersion: b.mapping.version }));
    const input = frozen({ scope: request.scope, period: request.period, rule: request.rule, sourceRefs, imports: request.imports.map((b) => ({ id: b.id, mappingHash: b.mappingHash, rows: b.rows })), population: request.population, selection: request.selection, parameters: request.parameters });
    const inputHash = stableSha256(input), id = `calculation-${inputHash}`;
    const common = { id, calculationKey: request.rule.id, ruleVersion: request.rule.version, inputHash, scope: request.scope, period: request.period, sourceRefs, input, findings: [], warnings, blockedControls };
    if (blockedControls.length) return frozen({ ...common, execution: "blocked", outcome: "inconclusive", result: null });
    try {
      definition!.validateContext(frozen(request));
      const values = selected.map((i) => ({ id: i!.id, amount: i!.amount }));
      const first = definition!.evaluate(values, request.parameters), second = definition!.evaluate(values, request.parameters);
      if (stableSha256(first) !== stableSha256(second)) throw new Error("NONDETERMINISTIC_CALCULATION");
      const assessment = definition!.assess?.(first);
      const outcome = assessment ? assessmentOutcome(assessment) : definition!.outcome(first);
      if (!["no_exception_detected", "exceptions_detected", "inconclusive"].includes(outcome)) throw new Error("CALCULATION_OUTCOME_INVALID");
      if (assessment ? stableSha256(definition!.assess!(first)) !== stableSha256(assessment) : definition!.outcome(first) !== outcome) throw new Error("NONDETERMINISTIC_CLASSIFICATION");
      const execution = assessment?.execution ?? "completed";
      return frozen({ ...common, execution, outcome, result: first, ...(assessment ? { assessment, blockedControls: assessment.subControls.filter((c) => c.execution === "blocked").map((c) => `${c.label} : ${c.reason}`) } : {}) });
    } catch (error) {
      if (error instanceof InvalidCalculationInput) return frozen({ ...common, execution: "blocked", outcome: "inconclusive", result: { status: "invalid_input", reason: "Entrées ou paramètres invalides : calcul non exécuté." }, blockedControls: [...blockedControls, "CALCULATION_INPUT_INVALID"] });
      return frozen({ ...common, execution: "failed", outcome: "inconclusive", result: null, warnings: ["CALCULATION_VALIDATION_OR_EXECUTION_FAILED"] });
    }
  }
}

export const SYNTHETIC_SUM_RULE: RuleReference = { id: "synthetic.sum", version: "1.0.0", authority: "internal", source: "Fixture technique synthétique, aucun test d’audit", effectiveFrom: "2000-01-01", validation: "provisional" };
export function syntheticRegistry(): CalculationRegistry {
  const registry = new CalculationRegistry();
  registry.register(SYNTHETIC_SUM_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), z.object({}).strict(), moneySchema,
    (rows) => money(rows.reduce((total, row) => total + cents(row.amount), 0n)));
  return registry;
}

import { z } from "zod";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { cents } from "@/lib/canonical-model/money";
import { evaluatePayables, payablesWorkSchema, PAYABLE_PROCEDURES, type PayableProcedure, type PayablesResult } from "./payables-investigation";
import type { framePayables } from "./payables";
import { PAYABLE_REQUIRED, PAYABLE_OBJECTIVES } from "./payables-program";
export { PAYABLE_REQUIRED, PAYABLE_OBJECTIVES } from "./payables-program";
export function payableTemplate(id: PayableProcedure): ProcedureTemplate { const rule: RuleReference = { id, version: "1.0.0", authority: "internal", source: "docs/mission08/INVESTIGATION_CONTRACT.md", effectiveFrom: "2000-01-01", validation: "validated" }; return { id, version: rule.version, objective: PAYABLE_OBJECTIVES[id], kind: "calculated", assertions: [], requiredDocumentTypes: PAYABLE_REQUIRED[id], rule }; }
export function payableOutcome(result: PayablesResult) { if (result.procedure === "payables.frame") {
    const frame = result.technical as ReturnType<typeof framePayables>;
    if ([frame.generalToAuxiliary, frame.auxiliaryToAged].some(c => c.metrics.grossUnexplained.amount !== "0.00"))
        return "exceptions_detected" as const;
    if ([frame.generalToAuxiliary, frame.auxiliaryToAged].some(c => c.blockedControls.length))
        return "inconclusive" as const;
    return "no_exception_detected" as const;
} return result.rows.some(r => r.status === "omission_candidate" || r.differenceHT.kind === "known" && cents(r.differenceHT.value) !== 0n) ? "exceptions_detected" as const : result.rows.some(r => r.status === "inconclusive") || result.coverage.numerator < result.coverage.selected ? "inconclusive" as const : "no_exception_detected" as const; }
/** Each runtime registers one named procedure only. */
export class PayablesRegistry extends CalculationRegistry {
    constructor(private readonly procedure: PayableProcedure) { super(); }
    override execute(request: CalculationRequest) {
        const registry = new CalculationRegistry(), template = payableTemplate(this.procedure);
        const parameters = z.object({ work: payablesWorkSchema, runId: z.string().min(1) }).strict();
        const output = z.custom<PayablesResult>(value => !!value && typeof value === "object" && (value as PayablesResult).schemaVersion === "payables-result-1" && Array.isArray((value as PayablesResult).rows));
        registry.register(template.rule!, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parameters, output, (_input, p) => evaluatePayables(request.scope, request.period, request.imports, p.runId, this.procedure, request.population, request.selection, p.work), payableOutcome, r => {
            if (r.scope.mode !== "real" || !PAYABLE_PROCEDURES.includes(this.procedure) || r.rule.id !== this.procedure)
                throw new Error("PAYABLE_REAL_CONTEXT_REQUIRED");
            if(this.procedure==="payables.frame"&&(r.imports.length!==3||r.selection.exclusions.length||r.selection.selectedIds.length!==r.population.items.length))throw new Error("PAYABLE_FRAME_FULL_POPULATION_REQUIRED");
            const expected = this.procedure === "payables.purchases" ? "purchase_entry" : this.procedure === "payables.rpne" ? "subsequent_payment" : "row";
            if (r.population.unit !== expected || PAYABLE_REQUIRED[this.procedure].some(type => !r.imports.some(b => b.document.documentType === type)))
                throw new Error("PAYABLE_POPULATION_OR_SOURCES_INVALID");
        });
        return registry.execute(request);
    }
}

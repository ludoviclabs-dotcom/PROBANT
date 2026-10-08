import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { buildCashFacts } from "./cash-sources";
import { cashOutcome, cashResultSchema, cashWorkSchema, evaluateCashReconciliation } from "./cash-reconciliation";

/** Internal method validated as a calculation contract only: no accounting rule, threshold or audit opinion is encoded. */
export const CASH_RECONCILIATION_RULE: RuleReference = { id: "cash.reconciliation", version: "1.0.0", authority: "internal", source: "docs/mission09/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const CASH_RECONCILIATION_TEMPLATE: ProcedureTemplate = { id: "cash.reconciliation", version: "1.0.0", objective: "Trésorerie — pont bancaire et apurement des suspens", kind: "calculated",
  assertions: [{ label: "Existence et exhaustivité des soldes bancaires à la clôture (visées, non validées)", validation: "proposed" }, { label: "Séparation des exercices des suspens (visée, non validée)", validation: "proposed" }],
  requiredDocumentTypes: ["cash_ledger", "cash_statement", "cash_erb"], rule: CASH_RECONCILIATION_RULE };
const parametersSchema = z.object({ work: cashWorkSchema, runId: z.string().min(1) }).strict();
/** A fresh closed registry per call: no synthetic cash fixture can enter the durable runtime. */
export class CashReconciliationRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(CASH_RECONCILIATION_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parametersSchema, cashResultSchema,
      (_input, parameters) => evaluateCashReconciliation(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => cashOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "account") throw new Error("CASH_REAL_ACCOUNT_POPULATION_REQUIRED");
        const parameters = parametersSchema.parse(r.parameters);
        const facts = buildCashFacts(r.scope, r.period, r.imports, parameters.runId);
        // The selection is rebuilt by the server: every in-scope account is selected, every exclusion is motivated by the sources.
        const expectedExcluded = facts.accounts.filter(a => !a.inScope).map(a => a.ledger.rowId).sort();
        const expectedSelected = facts.accounts.filter(a => a.inScope).map(a => a.ledger.rowId).sort();
        if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256(expectedExcluded) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(expectedSelected)) throw new Error("CASH_SELECTION_NOT_REPRODUCIBLE");
      });
    return registry.execute(request);
  }
}

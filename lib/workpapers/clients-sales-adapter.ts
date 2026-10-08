import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { buildClientsSalesFacts, clientsSalesWorkSchema, clientsSalesResultSchema, evaluateClientsSales } from "./clients-sales";
export const CLIENT_SALES_RULE: RuleReference = { id: "clients.sales", version: "1.0.0", authority: "internal", source: "docs/mission07/CLIENTS_SALES_CONTRACT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const CLIENT_SALES_TEMPLATE: ProcedureTemplate = { id: "clients.sales", version: "1.0.0", objective: "Clients et ventes — encaissements, avoirs et jugement", kind: "calculated", assertions: [], requiredDocumentTypes: ["clients_invoices", "clients_payments"], rule: CLIENT_SALES_RULE };
/** Only the Clients sales contract is registered; no synthetic cycle can enter this durable runtime. */
export class ClientsSalesRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(CLIENT_SALES_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), z.object({ work: clientsSalesWorkSchema, runId: z.string().min(1) }).strict(), clientsSalesResultSchema,
      (_input, parameters) => evaluateClientsSales(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => result.controls.some(c => c.outcome === "exceptions_detected") ? "exceptions_detected" : result.controls.some(c => c.outcome === "inconclusive") ? "inconclusive" : "no_exception_detected",
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "invoice") throw new Error("CLIENT_SALES_REAL_INVOICE_POPULATION_REQUIRED");
        const parameters = z.object({ work: clientsSalesWorkSchema, runId: z.string().min(1) }).strict().parse(r.parameters);
        buildClientsSalesFacts(r.scope, r.period, r.imports, parameters.runId);
        if (r.selection.exclusions.length || r.selection.selectedIds.length !== r.population.items.length || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(r.population.items.map(i => i.id).sort())) throw new Error("CLIENT_SALES_FULL_POPULATION_REQUIRED");
      });
    return registry.execute(request);
  }
}

import { z } from "zod";
import { CalculationRegistry } from "./calculations";
import { moneySchema, type ProcedureTemplate } from "./model";
import { evaluateLoans, loanWorkSchema, type LoanResult } from "./loan-review";
import { LOAN_RULE_VERSION } from "./loan-rules";

export const LOAN_TEMPLATE: ProcedureTemplate = {
  id: "loans.review", version: LOAN_RULE_VERSION, objective: "Emprunts : principal, échéances, intérêts et présentation sur paramètres contractuels sourcés", kind: "calculated",
  assertions: [
    { label: "Principal, échéances, paiements et GL rapprochés par contrat ; périmètre cadré sur la balance", validation: "proposed" },
    { label: "Intérêts et intérêts courus recalculés sur paramètres contractuels sourcés (aucun taux ni convention par défaut)", validation: "proposed" },
    { label: "Comptes et poste de bilan selon le texte applicable ; autres fonds propres classés par le moteur C09", validation: "proposed" },
  ],
  requiredDocumentTypes: ["loan_ledger"],
  rule: { id: "loans.review", version: LOAN_RULE_VERSION, authority: "internal", source: "docs/mission-c13/CONTRAT.md", effectiveFrom: "1900-01-01", validation: "validated" },
};

export class LoanRegistry extends CalculationRegistry {
  override execute(request: Parameters<CalculationRegistry["execute"]>[0]) {
    const registry = new CalculationRegistry();
    registry.register(LOAN_TEMPLATE.rule!, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), z.object({ runId: z.string().min(1), work: loanWorkSchema }).strict(),
      z.custom<LoanResult>(v => !!v && typeof v === "object" && (v as LoanResult).schemaVersion === "loans-result-1"),
      (_input, p) => evaluateLoans(request.scope, request.period, request.imports, p.runId, request.population, request.selection, p.work), r => r.outcome,
      () => { if (request.rule.id !== "loans.review" || request.population.unit !== "loan_contract_due") throw new Error("LOAN_ADAPTER_INVALID"); });
    return registry.execute(request);
  }
}

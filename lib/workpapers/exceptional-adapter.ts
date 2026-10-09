import { z } from 'zod';
import { CalculationRegistry } from './calculations';
import { moneySchema, type ProcedureTemplate } from './model';
import { exceptionalWorkSchema, evaluateExceptional, type ExceptionalResult } from './exceptional-dossier';
export const EXCEPTIONAL_TEMPLATE: ProcedureTemplate = { id: 'exceptional.review', version: '1.0.0', objective: 'Résultat exceptionnel : qualification documentée par événement', kind: 'calculated', assertions: [{ label: 'Classement des événements et écritures associées', validation: 'proposed' }, { label: 'Référentiel applicable et présentation comparée', validation: 'proposed' }], requiredDocumentTypes: ['exceptional_ledger'], rule: { id: 'exceptional.review', version: '1.0.0', authority: 'internal', source: 'docs/probant-lots/MISSION17_CONTRACT.md', effectiveFrom: '1900-01-01', validation: 'validated' } };
export class ExceptionalRegistry extends CalculationRegistry {
    override execute(request: Parameters<CalculationRegistry['execute']>[0]) {
        const registry = new CalculationRegistry();
        registry.register(EXCEPTIONAL_TEMPLATE.rule!, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), z.object({ runId: z.string().min(1), work: exceptionalWorkSchema }).strict(), z.custom<ExceptionalResult>(v => !!v && typeof v === 'object' && (v as ExceptionalResult).schemaVersion === 'exceptional-result-1'), (_i, p) => evaluateExceptional(request.scope, request.period, request.imports, p.runId, request.population, request.selection, p.work), r => r.outcome, () => {
            if (request.rule.id !== 'exceptional.review' || request.population.unit !== 'event')
                throw Error('EXCEPTIONAL_ADAPTER_INVALID');
        });
        return registry.execute(request);
    }
}

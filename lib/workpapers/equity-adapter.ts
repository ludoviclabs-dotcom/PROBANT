import { z } from 'zod';
import { CalculationRegistry } from './calculations';
import { moneySchema, type ProcedureTemplate } from './model';
import { equityWorkSchema, evaluateEquity, type EquityResult } from './equity-dossier';
export const EQUITY_TEMPLATE:ProcedureTemplate={id:'equity.review',version:'1.0.0',objective:'Capitaux propres — décisions, mouvements et preuves',kind:'calculated',assertions:[{label:'Ouverture + mouvements = clôture, sur le périmètre déclaré',validation:'proposed'},{label:'Décisions et écritures documentées séparément des règlements',validation:'proposed'}],requiredDocumentTypes:['equity_balances','equity_ledger'],rule:{id:'equity.review',version:'1.0.0',authority:'internal',source:'docs/probant-lots/MISSION11_CONTRACT.md',effectiveFrom:'1900-01-01',validation:'validated'}};
export class EquityRegistry extends CalculationRegistry {
 override execute(request:Parameters<CalculationRegistry['execute']>[0]){
  const registry=new CalculationRegistry();
  registry.register(EQUITY_TEMPLATE.rule!,z.array(z.object({id:z.string(),amount:moneySchema}).strict()),z.object({runId:z.string().min(1),work:equityWorkSchema}).strict(),z.custom<EquityResult>(v=>!!v&&typeof v==='object'&&(v as EquityResult).schemaVersion==='equity-result-1'),(_input,p)=>evaluateEquity(request.scope,request.period,request.imports,p.runId,request.population,request.selection,p.work),r=>r.exceptions.some(e=>['divergent','decision_unbooked','entry_undecided'].includes(e.status))?'exceptions_detected':r.exceptions.length?'inconclusive':'no_exception_detected',r=>{if(r.scope.mode!=='real'||r.rule.id!=='equity.review'||r.population.unit!=='equity_decision_movement')throw Error('EQUITY_ADAPTER_SCOPE_INVALID');});return registry.execute(request);
 }
}

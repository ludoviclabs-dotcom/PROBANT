import { ApiError } from '@/lib/api/errors';
import { investmentDiagnostic } from "./investment-package";
import { sql } from 'drizzle-orm';
import { ClientsRuntime } from './clients-runtime';
import { ClientsImports,ClientsWorkpaperRepository,rows } from './clients-persistence';
import { INVESTMENT_TYPES,assertInvestmentBatch,investmentFacts,stampInvestmentWork,type InvestmentResult } from './investment-dossier';
import { InvestmentRegistry,INVESTMENT_TEMPLATE } from './investment-adapter';
import { WorkpaperService } from './service';
import { freezePopulation,selectPopulation } from './selection';
import { contentHash,periodId,type WorkpaperRun } from './model';
import type { ImportBatch,ImportMapping } from './imports';
import type { AccountingPeriod } from '@/lib/canonical-model/period';
import type { InvestmentCommand } from './investment-commands';
export class InvestmentRuntime extends ClientsRuntime {
 protected override readonly procedureIds=['investments.review'];protected override readonly sourceTypes=INVESTMENT_TYPES;
 protected override importAdapter():'investments.review'{return 'investments.review';}
 protected override validateSource(b:ImportBatch,p:AccountingPeriod){assertInvestmentBatch(b,p);}
 protected override async assertCurrent(tx:import('./clients-persistence').ClientsSql,scope:import('./model').WorkpaperScope,run:WorkpaperRun){await super.assertCurrent(tx,scope,run);const heads=await this.heads(tx,scope);if(run.population&&heads.some(h=>this.sourceTypes.includes(h.document_type as typeof INVESTMENT_TYPES[number])&&!run.importIds.includes(h.import_id)))throw Error('INVESTMENT_SOURCE_REPLACED_REVISION_REQUIRED');}
 async previewInvestment(request:Request,dossierId:string,period:AccountingPeriod,file:File,mapping:ImportMapping,type:typeof INVESTMENT_TYPES[number],key:string){return this.previewSource(request,dossierId,period,file,mapping,type,key);}
 async investmentRead(request:Request,dossierId:string,pid:string,id?:string,history=false,version?:number){const view=await super.read(request,dossierId,pid,id,history,version);const facts=await this.transaction(request,dossierId,pid,'read',async(tx,scope)=>{const imports=await ClientsImports.load(tx,scope);return Object.fromEntries(view.runs.map(run=>[run.id,investmentFacts(scope,run.period,imports.batches.filter(b=>(run.importIds.length?run.importIds:view.sourceHeads.map(h=>h.import_id)).includes(b.id)&&b.approval&&this.sourceTypes.includes(b.document.documentType as typeof INVESTMENT_TYPES[number])),run.id)]));});const response={...view,facts};if(Buffer.byteLength(JSON.stringify(response))>8*1024*1024)throw new ApiError('INVESTMENT_STATE_LIMIT','État trop volumineux.',413);return response;}
 async investmentExport(request:Request,dossierId:string,pid:string,id:string,version:number,expectedHash:string){return this.transaction(request,dossierId,pid,'download',async(tx,scope)=>{const run=await new ClientsWorkpaperRepository(tx).get(scope,id);if(!run||run.template.id!=='investments.review')throw Error('WORKPAPER_NOT_FOUND');if(run.version!==version||contentHash(run)!==expectedHash)throw Error('EXPORT_SNAPSHOT_CONFLICT');await this.assertCurrent(tx,scope,run);return investmentDiagnostic(run);});}
 async investmentCommand(request:Request,dossierId:string,pid:string,command:InvestmentCommand,key:string){return this.transaction(request,dossierId,pid,['review','lock'].includes(command.command)?'review':'prepare',async(tx,scope,actor)=>this.receipt(tx,scope,actor,key,{operation:'investment_command',...command},async()=>{
  const repository=new ClientsWorkpaperRepository(tx),imports=await ClientsImports.load(tx,scope),at=new Date(this.now()*1000).toISOString(),service=new WorkpaperService(repository,imports,new InvestmentRegistry(),async()=>actor,()=>at,'investments.review');
  if(command.command==='create_investment'){if(periodId(command.period)!==pid)throw Error('WORKPAPER_PERIOD_INVALID');return {run:await service.create(scope,command.period,INVESTMENT_TEMPLATE,command.instanceKey)};}
  const current=await repository.get(scope,command.id);if(!current||current.template.id!=='investments.review')throw Error('WORKPAPER_NOT_FOUND');
  const [latest]=await rows<{id:string}>(tx,sql`SELECT h.id FROM clients_workpaper_heads h JOIN clients_workpaper_versions v USING (organization_id,dossier_id,period_id,id,version) WHERE h.organization_id=${scope.organizationId} AND h.dossier_id=${scope.dossierId} AND h.period_id=${scope.periodId} AND v.run->>'rootId'=${current.rootId} ORDER BY (v.run->>'revision')::int DESC LIMIT 1`);if(latest?.id!==current.id)throw Error('INVESTMENT_REVISION_REPLACED');if(command.command!=='revise')await this.assertCurrent(tx,scope,current);
  const id=current.id,v=command.expectedVersion;let run:WorkpaperRun;
  const cite=(c:{documentVersionId:string;rowId:string},text:string)=>{const b=imports.batches.find(b=>current.importIds.includes(b.id)&&b.approval&&b.document.id===c.documentVersionId),r=b?.rows.find(r=>r.id===c.rowId);if(!b||!r||r.errors.length)throw Error('INVESTMENT_CITATION_INVALID');return text+'\nPièce : '+b.document.fileName+' ; pack '+b.document.logicalId+' ; version '+b.document.byteHash+' ; ligne '+r.locator.row+' ; date '+r.normalized?.date;};
  switch(command.command){
   case 'freeze_investment':{if(current.state!=='draft'||current.population)throw Error('INPUTS_ALREADY_FROZEN');const heads=await this.heads(tx,scope),batches=command.importIds.map(i=>imports.get(scope,i,actor));if(batches.some(b=>!this.sourceTypes.includes(b.document.documentType as typeof INVESTMENT_TYPES[number])||!heads.some(h=>h.import_id===b.id)))throw Error('INVESTMENT_CURRENT_SOURCES_REQUIRED');run=await service.configureInvestment(scope,id,v,stampInvestmentWork(command.draft,batches,scope,current.period,id,actor.id,at));const population=freezePopulation(scope,batches,'security_distribution',actor),selected=population.items.filter(i=>!command.excluded.some(e=>e.id===i.id)).map(i=>i.id),selection=selectPopulation(population,{method:'targeted',criteria:command.criteria,exclusions:command.excluded,requestedSize:selected.length,selectedIds:selected},actor);run=await service.attachInputs(scope,id,run.version,population,selection);run=await service.transition(scope,id,run.version,'ready');break;}
   case 'configure_investment':{if(!current.population)throw Error('INVESTMENT_FROZEN_INPUTS_REQUIRED');run=await service.configureInvestment(scope,id,v,stampInvestmentWork(command.draft,current.importIds.map(i=>imports.get(scope,i,actor)),scope,current.period,id,actor.id,at));break;}
   case 'execute':{if(!current.investmentWork)throw Error('INVESTMENT_WORK_REQUIRED');run=await service.execute(scope,id,v,{work:current.investmentWork,runId:id});if(run.state==='executed')for(const e of (run.result!.result as InvestmentResult).exceptions)run=await service.addNote(scope,id,run.version,{id:'investment:'+e.id,kind:'observation',text:e.text,amount:e.amount,blocking:true});break;}
   case 'resolve':run=await service.resolveNote(scope,id,v,command.noteId,cite(command.citation,command.text));break;
   case 'conclude':run=await service.conclude(scope,id,v,cite(command.citation,command.text));break;
   case 'review':run=await service.transition(scope,id,v,command.decision,cite(command.citation,command.text),command.submittedHash);break;
   case 'submit':run=await service.transition(scope,id,v,'awaiting_review');break;
   case 'lock':run=await service.lock(scope,id,v);break;
   case 'revise':run=await service.revise(scope,id,v);break;
  }return {run};
 }));}
}

import { cents, money, type KnownAmount } from '@/lib/canonical-model/money';
import { stableSha256 } from '@/lib/synthesis/canonical';
import { assertInvestmentContext, assertDate, type CycleContext } from './cycle-context';
import { frozen, type EvidenceLink } from './model';
import { evidence, known, supportedAmountSchema, unknown, type DocumentedMethod, type SupportedAmount } from './cycle-review';
export type Comparability = 'comparable' | 'non_comparable' | 'source_required';
export interface InvestmentModel {
 id:string;version:string;nature:'enterprise_value'|'equity_value'|'holding_value';originNature?:'enterprise_value'|'equity_value'|'holding_value';
 securityId:string;perimeter?:string;units:'EUR';value:SupportedAmount;assumptions:string[];scenarios:{label:string;value:SupportedAmount}[];
}
export interface InvestmentDecision {id:string;version:string;reason:string;date:string;evidence:EvidenceLink[];category:string;proposedAmount?:SupportedAmount}
export interface InvestmentInput {
 context:CycleContext;securityId:string;categoryProposed:string;intention:string;classificationMethod:DocumentedMethod|null;
 distribution:SupportedAmount|null;distributionId?:string;entitlementDate?:string;
 rights:{classId:string;from:string;to:string;entitlementDate:string;numerator:string;denominator:string;homogeneous:boolean;evidence:EvidenceLink[];securityId?:string;distributionId?:string;preferentialAllocation?:SupportedAmount|null;allocationReason?:string}|null;
 bookedDividend:SupportedAmount|null;receivedDividend:SupportedAmount|null;bookedEntries?:SupportedAmount[];receivedEntries?:SupportedAmount[];cost:SupportedAmount|null;bookedImpairment:SupportedAmount|null;
 accountingBase?:{kind:'cost'|'net_carrying';label:string;perimeter:string};externalModel:InvestmentModel|null;previousModel?:InvestmentModel|null;decision?:InvestmentDecision|null;
}
function compare(context:CycleContext,a:SupportedAmount|null,b:SupportedAmount|null):KnownAmount {
 if(!a||!b)return unknown('SOURCE REQUISE : deux montants documentés');
 if(!evidence(context,a.evidence)||!evidence(context,b.evidence)||a.date!==b.date||a.basis!==b.basis)return unknown('Dates, bases ou preuves non comparables');
 return known(money(cents(a.amount)-cents(b.amount)));
}
function validateModel(context:CycleContext,m:InvestmentModel){
 if(!m.id.trim()||!m.version.trim()||!['enterprise_value','equity_value','holding_value'].includes(m.nature)||m.units!=='EUR')throw Error('INVESTMENT_MODEL_INVALID');
 if(new Set(m.scenarios.map(s=>s.label)).size!==m.scenarios.length||m.scenarios.some(s=>!s.label.trim()))throw Error('INVESTMENT_SCENARIO_INVALID');
 [m.value,...m.scenarios.map(s=>s.value)].forEach(v=>{supportedAmountSchema.parse(v);evidence(context,v.evidence);});
}
export function compareInvestmentVersions(previous:InvestmentModel|null,current:InvestmentModel|null){
 const changes:{field:string;before:string;after:string}[]=[];
 if(!previous||!current)return {status:'source_required' as const,changes,reason:'Deux versions fournies requises'};
 const pairs:[string,string,string][]=[['Modèle',previous.id,current.id],['Version',previous.version,current.version],['Nature',previous.nature,current.nature],['Nature d’origine',previous.originNature??previous.nature,current.originNature??current.nature],['Date',previous.value.date,current.value.date],['Titre',previous.securityId,current.securityId],['Périmètre',previous.perimeter??'',current.perimeter??''],['Base',previous.value.basis,current.value.basis],['Valeur fournie',previous.value.amount.amount+' EUR',current.value.amount.amount+' EUR'],['Hypothèses',previous.assumptions.join(' ; '),current.assumptions.join(' ; ')],['Sources',previous.value.evidence.map(p=>p.documentVersionId).join(', '),current.value.evidence.map(p=>p.documentVersionId).join(', ')]];
 for(const label of new Set([...previous.scenarios,...current.scenarios].map(s=>s.label))){const describe=(m:InvestmentModel)=>{const v=m.scenarios.find(s=>s.label===label)?.value;return v?v.amount.amount+' EUR · '+v.date+' · '+v.basis+' · '+v.evidence.map(p=>p.documentVersionId).join(', '):'Absent';};pairs.push(['Scénario : '+label,describe(previous),describe(current)]);}
 for(const[field,before,after]of pairs)if(before!==after)changes.push({field,before,after});
 return {status:'provided' as const,changes,reason:'Comparaison descriptive ; aucune sélection favorable automatique'};
}
export function reviewInvestment(input:InvestmentInput){
 assertInvestmentContext(input.context);
 if(!input.securityId.trim()||!input.intention.trim())throw Error('INVESTMENT_IDENTITY_REQUIRED');
 [input.cost,input.distribution,input.bookedDividend,input.receivedDividend,input.bookedImpairment].forEach(v=>{if(v){supportedAmountSchema.parse(v);evidence(input.context,v.evidence);}});
 if(input.cost&&cents(input.cost.amount)<0n||(input.bookedImpairment&&cents(input.bookedImpairment.amount)<0n))throw Error('INVESTMENT_BOOK_BASE_INVALID');
 const r=input.rights;let expectedDividend:KnownAmount=unknown('SOURCE REQUISE : distribution et droits applicables documentés');let rightsStatus:Comparability='source_required',rightsReason='Registre, catégorie de droits, dates et décision requis';
 if(input.entitlementDate)assertDate(input.entitlementDate);
 if(r){
  [r.from,r.to,r.entitlementDate].forEach(assertDate);evidence(input.context,r.evidence);
  if(!r.classId.trim()||!/^\d+$/.test(r.numerator)||!/^[1-9]\d*$/.test(r.denominator)||BigInt(r.numerator)>BigInt(r.denominator)||r.from>r.to)throw Error('INVESTMENT_RIGHTS_INVALID');
  if(r.preferentialAllocation){supportedAmountSchema.parse(r.preferentialAllocation);evidence(input.context,r.preferentialAllocation.evidence);}
  const applicable=r.from<=r.entitlementDate&&r.entitlementDate<=r.to&&r.entitlementDate<=input.context.period.asOfDate&&(!input.entitlementDate||input.entitlementDate===r.entitlementDate)&&(!r.securityId||r.securityId===input.securityId)&&(!r.distributionId||r.distributionId===input.distributionId);
  if(!applicable){rightsStatus='non_comparable';rightsReason='Droits hors date ou attribués à un autre titre / une autre distribution';}
  else if(input.distribution&&evidence(input.context,r.evidence)&&evidence(input.context,input.distribution.evidence)){
   if(cents(input.distribution.amount)<0n)throw Error('NEGATIVE_DISTRIBUTION');
   if(r.homogeneous){const n=cents(input.distribution.amount)*BigInt(r.numerator),d=BigInt(r.denominator);expectedDividend=known(money((2n*n+d)/(2n*d)));rightsStatus='comparable';rightsReason='Distribution × droits homogènes à la date d’attribution ; arrondi au centime';}
   else if(r.preferentialAllocation&&r.allocationReason?.trim()&&evidence(input.context,r.preferentialAllocation.evidence)&&r.preferentialAllocation.date===input.distribution.date&&r.preferentialAllocation.basis===input.distribution.basis&&cents(r.preferentialAllocation.amount)>=0n&&cents(r.preferentialAllocation.amount)<=cents(input.distribution.amount)){expectedDividend=known(r.preferentialAllocation.amount);rightsStatus='comparable';rightsReason='Allocation préférentielle fournie : '+r.allocationReason;}
   else rightsReason='Droits préférentiels : allocation motivée et sourcée requise ; pourcentage simple inapplicable';
  }
 }
 const expected=expectedDividend.kind==='known'&&input.distribution?{...input.distribution,amount:expectedDividend.value,evidence:[...input.distribution.evidence,...r!.evidence,...(r?.preferentialAllocation?.evidence??[])]}:null;
 let bookedDifference=compare(input.context,input.bookedDividend,expected);
 for(const v of [...(input.bookedEntries??[]),...(input.receivedEntries??[])]){supportedAmountSchema.parse(v);evidence(input.context,v.evidence);}
 if(input.bookedEntries){
  const entries=input.bookedEntries;
  bookedDifference=expected&&entries.length&&input.distribution&&input.distribution.date>=input.context.period.startDate&&input.distribution.date<=input.context.period.closingDate&&entries.every(v=>evidence(input.context,v.evidence)&&v.basis===expected.basis&&v.date>=input.context.period.startDate&&v.date<=input.context.period.closingDate)?known(money(entries.reduce((s,v)=>s+cents(v.amount),0n)-cents(expected.amount))):unknown('SOURCE REQUISE : écritures attribuées à cette distribution, base et période comparables');
 }
 const base=input.accountingBase;
 let carryingAmount:KnownAmount=unknown('SOURCE REQUISE : base comptable explicite (coût ou valeur nette)');
 if(base&&base.label.trim()&&base.perimeter.trim()&&input.cost&&evidence(input.context,input.cost.evidence)&&input.cost.date===input.context.period.closingDate){
  if(base.kind==='cost')carryingAmount=known(input.cost.amount);
  else if(base.kind==='net_carrying'&&input.bookedImpairment&&evidence(input.context,input.bookedImpairment.evidence)&&input.bookedImpairment.date===input.cost.date&&input.bookedImpairment.basis===input.cost.basis&&cents(input.bookedImpairment.amount)<=cents(input.cost.amount))carryingAmount=known(money(cents(input.cost.amount)-cents(input.bookedImpairment.amount)));
 }
 if(input.externalModel)validateModel(input.context,input.externalModel);if(input.previousModel)validateModel(input.context,input.previousModel);
 const assessValue=(model:InvestmentModel|null,value:SupportedAmount|null)=>{
  let status:Comparability='source_required',reason='Modèle externe versionné et base comptable documentée requis';let difference:KnownAmount=unknown(reason);
  if(model&&value&&carryingAmount.kind==='known'&&base){
   if(!model.assumptions.length||model.assumptions.some(a=>!a.trim())||!evidence(input.context,value.evidence))reason='SOURCE REQUISE : hypothèses et preuve de la valeur';
   else if(model.nature!=='holding_value'||(model.originNature??model.nature)!=='holding_value'||model.securityId!==input.securityId||model.perimeter!==base.perimeter||value.date!==input.context.period.closingDate||value.basis!==input.cost?.basis){status='non_comparable';reason='Nature, titre, périmètre, date ou base non comparables à la détention';}
   else{status='comparable';reason='Valeur de détention et base comptable au même périmètre et à la même date';difference=known(money(cents(value.amount)-cents(carryingAmount.value)));}
  }
  if(difference.kind!=='known')difference=unknown(reason);return {status,reason,difference,conclusion:status==='comparable'?'arithmetic_only' as const:'inconclusive' as const};
 };
 const valuation=assessValue(input.externalModel,input.externalModel?.value??null),scenarios=input.externalModel?.scenarios.map(s=>({label:s.label,value:s.value,...assessValue(input.externalModel,s.value)}))??[];
 let decisionEligible=false;
 if(input.decision){const d=input.decision;assertDate(d.date);evidence(input.context,d.evidence);if(d.proposedAmount){supportedAmountSchema.parse(d.proposedAmount);evidence(input.context,d.proposedAmount.evidence);}decisionEligible=!!d.id.trim()&&!!d.version.trim()&&!!d.reason.trim()&&!!d.category.trim()&&d.date>=input.context.period.closingDate&&d.date<=input.context.period.asOfDate&&evidence(input.context,d.evidence);}
 const accountingProposal=decisionEligible&&valuation.status==='comparable'&&input.decision?.proposedAmount&&evidence(input.context,input.decision.proposedAmount.evidence)&&input.decision.proposedAmount.date===input.context.period.closingDate&&input.decision.proposedAmount.basis===input.cost?.basis?{amount:input.decision.proposedAmount,decision:input.decision,status:'documented_pending_review' as const}:null;
 return frozen({securityId:input.securityId,categoryProposed:input.categoryProposed,classificationStatus:decisionEligible?'documented_pending_review':'à qualifier — SOURCE REQUISE',expectedDividend,rightsStatus,rightsReason,bookedDifference,receivedDividend:input.receivedDividend,carryingAmount,accountingBase:base??null,valuation,valueDifference:valuation.difference,scenarios,bookedImpairment:input.bookedImpairment,externalModel:input.externalModel,versionComparison:compareInvestmentVersions(input.previousModel??null,input.externalModel),accountingProposal,inputHash:stableSha256(input),ruleVersion:'investment-review-2',mode:input.context.scope.mode,limitations:['Calcul interne sur les sources fournies ; aucun nouveau DCF.','Aucun classement sur un seuil de détention ; décision motivée requise.','Aucun choix automatique du scénario favorable.','Un écart arithmétique ne constitue ni anomalie validée ni écriture automatique.','Encaissement, produit enregistré et droit à distribution sont distincts.','Valeur et base comptable ne sont pas des expositions à additionner.']});
}
export type InvestmentReview=ReturnType<typeof reviewInvestment>;

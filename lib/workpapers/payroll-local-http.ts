import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { payrollKinds, mappingSchema, commandSchema } from "./payroll-contract";
import { lineSchema, eventSchema, leaveSchema } from "./payroll-import";
import { payrollHeaders, payrollFailure } from "./payroll-http";
import { requireLocalPayroll, type LocalPayrollRuntime } from "./payroll-local-runtime";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
const query=z.object({dossierId:z.string().uuid(),periodId:z.string().min(1).max(100),operation:z.enum(["read","download","export","template"]).default("read"),kind:z.enum(payrollKinds).optional(),id:z.string().max(200).optional(),version:z.coerce.number().int().positive().optional()}).strict();
const init=z.object({action:z.literal("init"),period:z.object({startDate:z.string(),closingDate:z.string(),asOfDate:z.string(),currency:z.literal("EUR"),validation:z.enum(["confirmed","provisional"])}).passthrough()}).strict();
const review=z.object({action:z.literal("review"),id:z.string().min(1),version:z.number().int().positive(),hash:z.string().regex(/^[a-f0-9]{64}$/),note:z.string().trim().min(1).max(4000)}).strict();
async function bounded(request:Request,limit:number){
 const reader=request.body?.getReader();if(!reader)throw Error("HR_BODY_REQUIRED");
 const parts:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new ApiError("HR_BODY_LIMIT","Corps trop volumineux.",413)}parts.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return new Request(request.url,{method:request.method,headers:request.headers,body:bytes});
}
function fail(error:unknown){
 if(error instanceof ApiError)return Response.json({error:error.code},{status:error.status,headers:payrollHeaders});
 const code=error instanceof Error?error.message:"";
 if(["HR_NOT_INITIALIZED","HR_PERIOD_CONFLICT","IDEMPOTENCY_KEY_REQUIRED","IDEMPOTENCY_KEY_REUSED","SESSION_INVALID"].includes(code))return Response.json({error:code},{status:code==="HR_NOT_INITIALIZED"?404:code==="SESSION_INVALID"?401:409,headers:payrollHeaders});
 return payrollFailure(error);
}
function scope(request:Request){const params=new URL(request.url).searchParams;if([...params.keys()].some(k=>params.getAll(k).length!==1))throw Error("HR_QUERY_INVALID");return query.parse(Object.fromEntries(params));}
export function localPayrollHandlers(create:()=>LocalPayrollRuntime){return {
 GET:async(request:Request)=>{try{requireLocalPayroll();const q=scope(request),runtime=create();
  if(q.operation==="template"){await runtime.check(request,q.dossierId,q.periodId);if(!q.kind)throw Error("HR_QUERY_INVALID");const schema=q.kind==="leave"?leaveSchema:q.kind==="events"?eventSchema:lineSchema;return new Response(Object.keys(schema.shape).join(";")+"\n",{headers:{...payrollHeaders,"Content-Type":"text/csv;charset=utf-8","Content-Disposition":'attachment; filename="colonnes-paie.csv"'}})}
  if(q.operation==="download"){if(!q.id)throw Error("HR_QUERY_INVALID");const bytes=await runtime.download(request,q.dossierId,q.periodId,q.id);if(!bytes)throw Error("HR_IMPORT_INVALID");return new Response(Uint8Array.from(bytes).buffer,{headers:{...payrollHeaders,"Content-Type":"application/octet-stream","Content-Disposition":'attachment; filename="source-paie.csv"'}})}
  if(q.operation==="export"){if(!q.version)throw Error("HR_QUERY_INVALID");return new Response(await runtime.export(request,q.dossierId,q.periodId,q.version),{headers:{...payrollHeaders,"Content-Type":"application/json","Content-Disposition":'attachment; filename="paie-conges-local.json"'}})}
  return Response.json(await runtime.read(request,q.dossierId,q.periodId),{headers:payrollHeaders});
 }catch(e){return fail(e)}},
 POST:async(request:Request)=>{try{requireLocalPayroll();const q=scope(request),runtime=create();await runtime.check(request,q.dossierId,q.periodId,true);
 const payload=await(await bounded(request,16000)).json(),key=request.headers.get("Idempotency-Key")??"";
 const value=payload.action==="init"?await runtime.initialize(request,q.dossierId,init.parse(payload).period as AccountingPeriod,key):payload.action==="review"?await runtime.review(request,q.dossierId,q.periodId,review.parse(payload),key):await runtime.command(request,q.dossierId,q.periodId,commandSchema.parse(payload),key);
 return Response.json(value,{headers:payrollHeaders});}catch(e){return fail(e)}},
 importsPOST:async(request:Request)=>{try{requireLocalPayroll();const q=scope(request),runtime=create();await runtime.check(request,q.dossierId,q.periodId,true);
 const form=await(await bounded(request,1100000)).formData();if([...form.keys()].some(k=>!["file","mapping"].includes(k))||form.getAll("file").length!==1||form.getAll("mapping").length!==1)throw Error("HR_FORM_INVALID");const file=form.get("file");if(!(file instanceof File))throw Error("HR_FORM_INVALID");
 return Response.json(await runtime.preview(request,q.dossierId,q.periodId,file,mappingSchema.parse(JSON.parse(String(form.get("mapping")))),request.headers.get("Idempotency-Key")??""),{headers:payrollHeaders});}catch(e){return fail(e)}}
}}

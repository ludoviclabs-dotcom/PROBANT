// C12: HTTP acceptance against a fresh C07 profile, then actual Next/PostgreSQL restart.
// Expected amounts are fixed here before running: 48 - 50 = -2; max(1000,1100)=1100.
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { payrollFixture, payrollPeriod } from "@/lib/workpapers/payroll-fixture";
import { periodId, contentHash, type WorkpaperRun } from "@/lib/workpapers/model";
import type { PayrollView } from "@/lib/workpapers/payroll-runtime";
import type { PayrollKind } from "@/lib/workpapers/payroll-contract";
const root=resolve(__dirname,"../.."), home=resolve(process.argv[2]??".c12-runtime/profile"), out=join(root,"docs/recette/c12");
mkdirSync(out,{recursive:true});
const config=JSON.parse(readFileSync(join(home,"probant.local.json"),"utf8")),origin="http://127.0.0.1:"+config.app.port;
assert.equal(new URL(origin).hostname,"127.0.0.1");
const rawFetch=globalThis.fetch;
globalThis.fetch=async(...args:Parameters<typeof fetch>)=>{try{return await rawFetch(...args)}catch{return rawFetch(...args)}};
let cookie="",csrf="";const checks:{label:string;status:string}[]=[];
function ok(label:string,condition:unknown){assert.ok(condition,label);checks.push({label,status:"PASS"});process.stdout.write("PASS "+label+"\n")}
function launch(command:string){const r=spawnSync(process.execPath,[join(root,"scripts/local/probant-local.mjs"),command,"--home",home,"--sans-navigateur"],{encoding:"utf8",cwd:root,windowsHide:true,timeout:15*60_000});if(r.status!==0)throw Error("Lanceur "+command+" refusé");return r.stdout;}
async function login(){const link=launch("login").match(/http:\/\/127\.0\.0\.1:\d+\/api\/auth\/local\?code=[^\s]+/)?.[0];assert.ok(link);const r=await fetch(link,{redirect:"manual"});assert.equal(r.status,303);cookie=r.headers.get("set-cookie")!.split(";")[0];csrf=(await(await fetch(origin+"/api/auth/session",{headers:{cookie}})).json()).csrfToken;}
function headers(extra:Record<string,string>={}){return{cookie,origin,"x-probant-csrf":csrf,...extra}}
async function post(path:string,payload:unknown,key=randomUUID()){return fetch(origin+path,{method:"POST",headers:headers({"Content-Type":"application/json","Idempotency-Key":key}),body:JSON.stringify(payload)})}
async function json<T>(r:Response):Promise<T>{const b=await r.json();assert.ok(r.ok,JSON.stringify({status:r.status,body:b}));return b as T}
const fixture=payrollFixture(),pid=periodId(payrollPeriod);
const amount=(x:import("@/lib/canonical-model/money").KnownAmount)=>x.kind==="known"?x.value.amount:null;
type View=PayrollView&{runs:WorkpaperRun[]};
function csv(text:string,fn:(r:Record<string,string>)=>Record<string,string>,extra:string[]=[]){const [header,...lines]=text.split("\n"),columns=header.split(";"),all=[...columns,...extra];return [all.join(";"),...lines.filter(Boolean).map(l=>{const row=fn(Object.fromEntries(columns.map((k,i)=>[k,l.split(";")[i]??""])));return all.map(k=>row[k]??"").join(";")})].join("\n")}
function processes(){return {next:JSON.parse(readFileSync(join(home,"run/etat.json"),"utf8")).nextPid,postgres:Number(readFileSync(join(home,"pgdata/postmaster.pid"),"utf8").split(/\r?\n/)[0])}}
async function main(){await login();
 const created=await json<{dossier:{id:string}}>(await post("/api/local/dossiers",{legalName:"C12 Paie synthétique "+randomUUID().slice(0,8),financialYear:"2026"}));
 const dossier=created.dossier.id,path="/api/workpapers/paie?dossierId="+dossier+"&periodId="+pid;
 let view=await json<View>(await post(path,{action:"init",period:payrollPeriod}));
 async function upload(kind:PayrollKind,text:string,key=randomUUID()){const form=new FormData();form.set("file",new File([text],"source.csv",{type:"text/csv"}));form.set("mapping",JSON.stringify({...fixture.mapping(kind),synthetic:false}));const p=await json<{version:number;previewId:string;previewHash:string}>(await fetch(origin+path.replace("?","/imports?"),{method:"POST",headers:headers({"Idempotency-Key":key}),body:form}));view=await json<View>(await post(path,{action:"approve_import",version:p.version,previewId:p.previewId,previewHash:p.previewHash}));}
 const paymentText=(await fixture.files.payments.text()).split("\n").filter(l=>!l.startsWith("P3;")).join("\n");
 for(const kind of ["journal","ledger","declaration","events"] as PayrollKind[])await upload(kind,await fixture.files[kind].text());
 await upload("payments",paymentText);
 const leaveText=csv(await fixture.files.leave.text(),r=>({...r,firstBase:"10000.00",secondBase:"11000.00",firstInclusions:"Salaire de base et éléments retenus documentés",firstExclusions:"Frais professionnels et primes annuelles couvrant les congés",secondInclusions:"Rémunération de la période de congé",secondExclusions:"Frais professionnels",ruleRef:"L3141-24",ruleVersion:"2024-04-24"}),["firstInclusions","firstExclusions","secondInclusions","secondExclusions"]);
 await upload("leave",leaveText);
 const september=()=>view.settlements.groups.find(g=>g.month==="2026-09"&&g.rubric==="SOC")!;
 ok("Déclaration 50, GL 48, écart -2",amount(september().glDelta)==="-2.00");
 ok("Rappel août après sortie conservé",view.framing.groups.some(g=>g.details.some(r=>r.regularization==="2026-08"&&r.exitDate==="2026-08-31")));
 ok("Méthodes 1000 et 1100, retenu 1100",view.leave.rows[0].result?.indemnityForSpecifiedRights.kind==="known"&&view.leave.rows[0].result.indemnityForSpecifiedRights.value.amount==="1100.00");
 ok("Droits restants inconnus sans méthode",view.leave.rows[0].result?.remainingRightsEstimate.kind==="unknown");
 ok("Jours et heures incompatibles",view.leave.rows[1].result?.comparable===false);
 ok("Charges non inventées",view.leave.rows[0].result?.associatedCharges===null);
 for(const month of ["2026-09","2026-10"]){const g=view.settlements.groups.find(g=>g.month===month&&g.rubric==="SOC")!;view=await json<View>(await post(path,{action:"document",version:view.version,module:"settlements",targetId:g.id,inputHash:g.inputHash,reason:g.evidence[0].reason,evidenceId:g.evidence[0].id}));}
 ok("Écart -2 documenté et conservé",september().status==="documented"&&amount(september().glDelta)==="-2.00");
 const leaveBefore=stableSha256(view.leave);
 await upload("declaration",csv(await fixture.files.declaration.text(),r=>({...r,amount:r.month==="2026-09"&&r.rubric==="SOC"?"51.00":r.amount})));
 ok("Source amendée : septembre périmé, octobre documenté",september().status==="stale"&&view.settlements.groups.find(g=>g.month==="2026-10"&&g.rubric==="SOC")?.status==="documented");
 ok("Congés indépendants d'une déclaration amendée",stableSha256(view.leave)===leaveBefore);
 await upload("payments",csv(paymentText,r=>({...r,amount:r.id==="P2"?"20.00":r.amount})));
 ok("Paiement partiel préservé",amount(september().paid)==="20.00");
 await upload("payments",await fixture.files.payments.text());
 ok("Référence répétée : deux paiements conservés, total inconnu",september().duplicates.length===2&&september().paid.kind==="unknown"&&september().payments.length===2);
 const reDocument=view.settlements.groups.find(g=>g.month==="2026-10"&&g.rubric==="SOC")!,previousVersion=view.version,repeatKey=randomUUID();
 const repeatedPayload={action:"document",version:previousVersion,module:"settlements",targetId:reDocument.id,inputHash:reDocument.inputHash,reason:reDocument.evidence[0].reason,evidenceId:reDocument.evidence[0].id};
 const repeated=await Promise.all([post(path,repeatedPayload,repeatKey),post(path,repeatedPayload,repeatKey)]);const repeatedViews=await Promise.all(repeated.map(r=>json<View>(r)));view=repeatedViews[0];
 ok("Même commande simultanée : une seule version",view.version===previousVersion+1&&stableSha256(repeatedViews[0])===stableSha256(repeatedViews[1]));
 const run=view.runs.find(r=>r.template.id==="payroll.review")!;
 view=await json<View>(await post(path,{action:"review",id:run.id,version:run.version,hash:contentHash(run),note:"Relecture personnelle : écart et référence répétée restent à qualifier ; aucune conclusion de conformité."}));
 ok("Relecture personnelle nommée et verrouillée",view.runs.some(r=>r.approval?.kind==="personal"&&r.approval.reviewerName==="Recette C12 solo"&&r.state==="locked"));
 const projectionText=JSON.stringify(view.runs);ok("Projection commune sans détail pseudonymisé",!projectionText.includes("SYN-A01"));
 const conflict=await post(path,{action:"document",version:1,module:"settlements",targetId:september().id,inputHash:september().inputHash,reason:"recall",evidenceId:september().evidence[0].id});ok("Ancienne version refusée",conflict.status===409);
 const exported=await(await fetch(origin+path+"&operation=export&version="+view.version,{headers:headers()})).text();
 const piece=view.sources.find(s=>s.kind==="journal")!,bytes=await(await fetch(origin+path+"&operation=download&id="+piece.documentVersion,{headers:headers()})).arrayBuffer();
 ok("Pièce originale identique",Buffer.from(bytes).equals(Buffer.from(await fixture.files.journal.arrayBuffer())));
 const beforePids=processes(),before=stableSha256(view);launch("stop");launch("start");const afterPids=processes();await login();
 const recovered=await json<View>(await fetch(origin+path,{headers:headers()}));const recoveredExport=await(await fetch(origin+path+"&operation=export&version="+view.version,{headers:headers()})).text();
 ok("Nouveaux processus Next et PostgreSQL",beforePids.next!==afterPids.next&&beforePids.postgres!==afterPids.postgres);
 ok("Même données, versions, contexte et synthèse",stableSha256(recovered)===before);
 ok("Export identique octet pour octet",recoveredExport===exported);
 const recoveredBytes=await(await fetch(origin+path+"&operation=download&id="+piece.documentVersion,{headers:headers()})).arrayBuffer();ok("Pièce identique après reprise",Buffer.from(recoveredBytes).equals(Buffer.from(bytes)));
 writeFileSync(join(out,"REPRISE.json"),JSON.stringify({base:"172ddd7",checks,processes:{before:beforePids,after:afterPids},dossierId:dossier,periodId:pid,version:view.version,exportSha256:createHash("sha256").update(exported).digest("hex"),journalSha256:piece.hash},null,2));
 writeFileSync(join(out,"CONTEXTE-RECETTE.json"),JSON.stringify({dossierId:dossier,periodId:pid,origin,version:view.version},null,2));
 process.stdout.write(checks.length+" contrôles réussis\n");
}
main().catch(e=>{writeFileSync(join(out,"ECHEC.json"),JSON.stringify({checks,error:e.message},null,2));process.stderr.write(e.stack+"\n");process.exitCode=1});

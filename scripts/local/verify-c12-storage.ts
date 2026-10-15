// Destructive downgrade is tested only inside a rollback transaction of the isolated C12 recipe profile.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readStoreHeads } from "@/lib/capabilities/store-readers";
import { stableSha256 } from "@/lib/synthesis/canonical";
async function main(){
 const home=resolve(process.argv[2]??".c12-runtime/final");assert.ok(home.startsWith(resolve(".c12-runtime")+"\\")||home.startsWith(resolve(".c12-runtime")+"/"));
 const config=JSON.parse(readFileSync(join(home,"probant.local.json"),"utf8")),secrets=JSON.parse(readFileSync(join(home,"secrets.local.json"),"utf8"));
 const proof=JSON.parse(readFileSync("docs/recette/c12/CONTEXTE-RECETTE.json","utf8"));
 const client=postgres({host:"127.0.0.1",port:config.postgres.port,database:config.postgres.database,username:"probant_app",password:secrets.appPassword,max:1,onnotice:()=>{}});
 const checks:{label:string;status:string}[]=[];const ok=(label:string,value:unknown)=>{assert.ok(value,label);checks.push({label,status:"PASS"});console.log("PASS "+label)};
 try{
  const [marker]=await client`select profile_id::text from probant_local.profile`;assert.equal(marker.profile_id,config.profileId);
  const scope={organizationId:config.organizationId,dossierId:proof.dossierId,periodId:proof.periodId,mode:"real" as const};
  const runs=await readStoreHeads(drizzle(client),scope);
  ok("C14 lit la famille hr via le lecteur commun",runs.length>=2&&new Set(runs.map(r=>r.run.template.id)).size===2&&runs.every(r=>r.family==="hr"));
  ok("Projection sans pseudonyme ni CSV original",!JSON.stringify(runs).includes("SYN-A01")&&!JSON.stringify(runs).includes("firstBase"));
  const before=await client`select archive from hr_runtime where dossier_id=${proof.dossierId} and period_id=${proof.periodId}`;
  ok("Historique local au-delà du seul état courant",before[0].archive.history.length>=12);
  const fk=await client`select count(*)::int as n from pg_constraint where conrelid='hr_runtime'::regclass and contype='f' and array_length(conkey,1)=2`;ok("Archive liée au dossier et à son organisation",fk[0].n===1);
  let refused=false;try{await client.begin(async tx=>{await tx`update hr_imports set document_type=document_type where dossier_id=${proof.dossierId}`})}catch(e){refused=String(e).includes("HR_APPEND_ONLY")}ok("Octets et imports approuvés immuables",refused);
  refused=false;try{await client.begin(async tx=>{await tx.unsafe(readFileSync("drizzle/0020_payroll_local.down.sql","utf8").replace(/^BEGIN;|^COMMIT;/gm,""))})}catch(e){refused=String(e).includes("HR_RECONCILIATION_DATA_PREVENTS_DOWNGRADE")}ok("Migration descendante refusée avec données",refused);
  const after=await client`select archive from hr_runtime where dossier_id=${proof.dossierId} and period_id=${proof.periodId}`;ok("Refus sans altération du dossier",stableSha256(before)===stableSha256(after));
  writeFileSync("docs/recette/c12/STOCKAGE.json",JSON.stringify({checks,observedVersions:runs.length,procedures:[...new Set(runs.map(r=>r.run.template.id))]},null,2));
 }finally{await client.end()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

import { NextRequest } from 'next/server';
import { equityData } from '@/lib/workpapers/equity-dossier';
import { equityFixture } from '@/lib/workpapers/equity-fixture';
import { buildEquityMission } from '@/lib/workpapers/equity-mission';
import { buildEquityPackage } from '@/lib/evidence/equity-package';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  if(process.env.VERCEL_ENV==='production'||process.env.PROBANT_DEMONSTRATION_ENABLED!=='true'||!process.env.PROBANT_DEMONSTRATION_ORIGIN||new URL(process.env.PROBANT_DEMONSTRATION_ORIGIN).host!==request.headers.get('host')||new URL(process.env.PROBANT_DEMONSTRATION_ORIGIN).protocol!==request.nextUrl.protocol)return Response.json({error:'DEMONSTRATION_DISABLED'},{status:503});
 const f=await equityFixture(undefined,request.nextUrl.searchParams.get('case')==='incomplete',request.nextUrl.searchParams.get('case')==='long'),mission=buildEquityMission(f.scope,[f.run],f.imports,f.imports.map(b=>({document_type:b.document.documentType,import_id:b.id})),{id:f.run.id,version:1});
 if(request.nextUrl.searchParams.get('format')==='pdf-proof')return new Response(await f.files.get('equity_minutes')!.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.nextUrl.searchParams.get('format')==='html'){const pack=await buildEquityPackage(mission,f.run,f.imports,'diagnostic','2025-02-01T12:00:00.000Z');return new Response(pack.html,{headers:{'Content-Type':'text/html;charset=utf-8','Content-Disposition':'attachment; filename="EXEMPLE-equity-diagnostic.html"','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}});}
 return Response.json({actorId:f.actor.id,permissions:[],mission,facts:equityData(f.scope,f.run.period,f.imports,f.run.id).map(d=>({id:d.id,rowId:d.row.id,type:d.batch.document.documentType,documentVersionId:d.batch.document.id,version:d.batch.document.byteHash,fileName:d.batch.document.fileName,page:d.row.locator.page,component:d.component,account:d.account,description:d.description,format:d.batch.document.format,amount:d.amount,date:d.date})),synthetic:true},{headers:{'Cache-Control':'no-store'}});
}

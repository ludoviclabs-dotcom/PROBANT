import { investmentDiagnostic } from '@/lib/workpapers/investment-package';
import { NextRequest } from 'next/server';
import { investmentFixture } from '@/lib/workpapers/investment-fixture';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 if(process.env.VERCEL_ENV==='production'||process.env.PROBANT_DEMONSTRATION_ENABLED!=='true'||!process.env.PROBANT_DEMONSTRATION_ORIGIN||new URL(process.env.PROBANT_DEMONSTRATION_ORIGIN).host!==request.headers.get('host')||new URL(process.env.PROBANT_DEMONSTRATION_ORIGIN).protocol!==request.nextUrl.protocol)return Response.json({error:'DEMONSTRATION_DISABLED'},{status:503});
 const f=await investmentFixture(undefined,request.nextUrl.searchParams.get('case')==='long');if(request.nextUrl.searchParams.get('format')==='html')return new Response(investmentDiagnostic(f.run).html,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="EXEMPLE-participations-diagnostic.html"','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}});
 if(request.nextUrl.searchParams.get('case')==='empty')return Response.json({actorId:f.actor.id,permissions:[],runs:[],facts:{},imports:[],sourceHeads:[],synthetic:true},{headers:{'Cache-Control':'no-store'}});
 const type=request.nextUrl.searchParams.get('source');if(type){const file=f.files[type];if(!file)return Response.json({error:'SOURCE_NOT_FOUND'},{status:404});return new Response(await file.arrayBuffer(),{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="'+file.name+'"','Cache-Control':'no-store'}});}
 return Response.json({actorId:f.actor.id,permissions:[],runs:[f.run],facts:{[f.run.id]:f.facts},imports:f.imports,sourceHeads:f.imports.map(b=>({document_type:b.document.documentType,import_id:b.id})),synthetic:true},{headers:{'Cache-Control':'no-store'}});
}

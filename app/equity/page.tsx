import { EquityWorkspace } from '@/components/probant/EquityWorkspace';
export default async function EquityPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const q=await searchParams, value=(key:string)=>typeof q[key]==='string'?q[key] as string:'';
 return <EquityWorkspace initial={{dossierId:value('dossierId'),periodId:value('periodId'),id:value('id')||undefined,version:Number(value('version'))||undefined,event:value('event'),filter:value('filter'),tab:value('tab'),demo:value('demo')==='1',incomplete:value('case')==='incomplete',longText:value('case')==='long'}} />;
}

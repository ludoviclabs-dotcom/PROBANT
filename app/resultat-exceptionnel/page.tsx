import { ExceptionalWorkspace } from '@/components/probant/ExceptionalWorkspace';
export default async function ExceptionalPage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) { const q = await searchParams, v = (key: string) => typeof q[key] === 'string' ? q[key] as string : ''; return <ExceptionalWorkspace initial={{ demo: v('demo') === '1', case: v('case'), dossierId: v('dossierId'), periodId: v('periodId'), id: v('id') }}/>; }

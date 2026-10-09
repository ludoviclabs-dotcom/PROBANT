import { NextRequest } from 'next/server';
import { ExceptionalDemo } from '@/lib/workpapers/exceptional-demo';
import { exceptionalDiagnostic } from '@/lib/workpapers/exceptional-package';
export const runtime = 'nodejs';
const sessions = new Map<string, {
    created: number;
    demo: Promise<ExceptionalDemo>;
}>();
const headers = { 'Cache-Control': 'private, no-store' };
function allowed(request: NextRequest) {
    const origin = process.env.PROBANT_DEMONSTRATION_ORIGIN;
    if (process.env.VERCEL_ENV === 'production' || process.env.PROBANT_DEMONSTRATION_ENABLED !== 'true' || !origin || new URL(origin).host !== request.headers.get('host') || new URL(origin).protocol !== request.nextUrl.protocol || request.method === 'POST' && request.headers.get('origin') !== new URL(origin).origin)
        throw Error('DEMONSTRATION_DISABLED');
}
async function session(request: NextRequest) {
    allowed(request);
    const scenario = request.nextUrl.searchParams.get('case') ?? '', id = request.nextUrl.searchParams.get('session') ?? 'static';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !['', 'old', 'unknown', 'complete', 'empty', 'long'].includes(scenario))
        throw Error('DEMONSTRATION_QUERY_INVALID');
    const key = id + ':' + scenario;
    for (const [k, v] of sessions)
        if (Date.now() - v.created > 60 * 60 * 1000)
            sessions.delete(k);
    if (!sessions.has(key)) {
        if (sessions.size >= 24)
            throw Error('DEMONSTRATION_SESSION_LIMIT');
        sessions.set(key, { created: Date.now(), demo: ExceptionalDemo.create(scenario) });
    }
    return sessions.get(key)!.demo;
}
function failure(e: unknown) { const error = e instanceof Error && /^[A-Z0-9_]+$/.test(e.message) ? e.message : 'DEMONSTRATION_REQUEST_INVALID'; return Response.json({ error }, { status: error === 'DEMONSTRATION_DISABLED' ? 503 : error === 'STALE_WORKPAPER_VERSION' ? 409 : 422, headers }); }
export async function GET(request: NextRequest) {
    try {
        const demo = await session(request);
        const type = request.nextUrl.searchParams.get('source');
        if (type) {
            const file = demo.fixture.files[type];
            if (!file)
                throw Error('SOURCE_NOT_FOUND');
            return new Response(await file.arrayBuffer(), { headers: { ...headers, 'Content-Type': 'text/csv;charset=utf-8', 'Content-Disposition': 'attachment; filename="' + file.name + '"' } });
        }
        const view = await demo.read(), format = request.nextUrl.searchParams.get('format');
        if (format === 'html' || format === 'json') {
            const pack = exceptionalDiagnostic(view.runs[0]);
            return new Response(pack[format], { headers: { ...headers, 'Content-Type': format === 'html' ? 'text/html;charset=utf-8' : 'application/json', 'Content-Disposition': 'attachment; filename="EXEMPLE-resultat-exceptionnel.' + format + '"', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
        }
        return Response.json(request.nextUrl.searchParams.get('case') === 'empty' ? { ...view, runs: [], facts: {} } : view, { headers });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: NextRequest) {
    try {
        const demo = await session(request), reader = request.body?.getReader();
        if (!reader)
            throw Error('DEMONSTRATION_BODY_REQUIRED');
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > 500000) {
                await reader.cancel();
                throw Error('DEMONSTRATION_BODY_LIMIT');
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const c of chunks) {
            bytes.set(c, offset);
            offset += c.length;
        }
        return Response.json(await demo.command(JSON.parse(new TextDecoder().decode(bytes))), { headers });
    }
    catch (e) {
        return failure(e);
    }
}

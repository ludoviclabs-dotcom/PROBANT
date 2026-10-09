import { z } from 'zod';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { ApiError } from '@/lib/api/errors';
import { ClientsConflict } from './clients-persistence';
import { exceptionalCommandSchema, clientsApprovalSchema, clientsPeriodSchema } from './exceptional-commands';
import { EXCEPTIONAL_TYPES, exceptionalMappingSchema } from './exceptional-dossier';
import { periodId } from './model';
import type { ExceptionalRuntime } from './exceptional-runtime';
const headers = { 'Cache-Control': 'private, no-store' };
const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), operation: z.enum(['list', 'history', 'version', 'download']).optional(), id: z.string().min(1).max(200).optional(), version: z.coerce.number().int().positive().optional() }).strict();
export function requireDisposableExceptional(env: Record<string, string | undefined> = process.env) {
    if (env.VERCEL_ENV === 'production' || env.PROBANT_EXCEPTIONAL_DURABLE !== 'disposable')
        throw new ApiError('EXCEPTIONAL_DURABLE_DISABLED', 'Cycle réservé à la recette jetable.', 503);
}
function failure(e: unknown) {
    if (e instanceof ClientsConflict)
        return Response.json({ error: e.message, current: e.current, expectedVersion: e.expectedVersion }, { status: 409, headers });
    if (e instanceof SyntaxError || e instanceof z.ZodError)
        return Response.json({ error: 'EXCEPTIONAL_REQUEST_INVALID' }, { status: 400, headers });
    if (e instanceof ApiError)
        return Response.json({ error: e.code }, { status: e.status, headers });
    if (e instanceof DrizzleQueryError)
        return Response.json({ error: 'EXCEPTIONAL_DURABLE_UNAVAILABLE' }, { status: 503, headers });
    const code = e instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(e.message) ? e.message : 'EXCEPTIONAL_DURABLE_UNAVAILABLE', status = /SESSION_INVALID/.test(code) ? 401 : /FORBIDDEN|SELF_APPROVAL/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404 : /CONFLICT|STALE|REPLACED|IDEMPOTENCY/.test(code) ? 409 : /LIMIT/.test(code) ? 413 : /INVALID|REQUIRED|UNAPPROVED|MISMATCH|DISABLED|UNRESOLVED|FORBIDDEN|NOT_READY|FROZEN|IMMUTABLE/.test(code) ? 422 : 503;
    return Response.json({ error: status === 503 ? 'EXCEPTIONAL_DURABLE_UNAVAILABLE' : code }, { status, headers });
}
async function bounded(request: Request, max: number) {
    const reader = request.body?.getReader();
    if (!reader)
        throw Error('EXCEPTIONAL_BODY_REQUIRED');
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.length;
        if (size > max) {
            await reader.cancel();
            throw new ApiError('EXCEPTIONAL_BODY_LIMIT', 'Requête trop volumineuse.', 413);
        }
        parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
    }
    return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
function scope(request: Request) {
    const p = new URL(request.url).searchParams;
    if (new Set(p.keys()).size !== [...p.keys()].length)
        throw Error('EXCEPTIONAL_QUERY_INVALID');
    const q = query.parse(Object.fromEntries(p));
    if (q.version !== undefined && (!q.id || q.operation !== 'version'))
        throw Error('EXCEPTIONAL_QUERY_INVALID');
    return q;
}
export function exceptionalHandlers(create: () => ExceptionalRuntime, enabled: () => void = requireDisposableExceptional, report: (error: unknown) => void = () => { }) {
    return {
        exportPOST: async (request: Request) => {
            try {
                enabled();
                const b = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1), id: z.string().min(1), version: z.number().int().positive(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/), format: z.enum(['json', 'html']) }).strict().parse(await (await bounded(request, 4096)).json()), pack = await create().exceptionalExport(request, b.dossierId, b.periodId, b.id, b.version, b.expectedHash);
                return new Response(pack[b.format], { headers: { ...headers, 'Content-Type': b.format === 'html' ? 'text/html;charset=utf-8' : 'application/json', 'Content-Disposition': 'attachment; filename="resultat-exceptionnel-diagnostic.' + b.format + '"', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
            }
            catch (e) {
                report(e);
                return failure(e);
            }
        },
        GET: async (request: Request) => {
            try {
                enabled();
                const q = scope(request), runtime = create();
                if (q.operation === 'download') {
                    if (!q.id)
                        throw Error('DOCUMENT_ID_REQUIRED');
                    const bytes = await runtime.download(request, q.dossierId, q.periodId, q.id);
                    if (!bytes)
                        return Response.json({ error: 'SOURCE_NOT_FOUND' }, { status: 404, headers });
                    return new Response(Uint8Array.from(bytes).buffer, { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="source-resultat-exceptionnel"', 'X-Content-Type-Options': 'nosniff' } });
                }
                return Response.json(await runtime.exceptionalRead(request, q.dossierId, q.periodId, q.id, q.operation === 'history', q.version), { headers });
            }
            catch (e) {
                report(e);
                return failure(e);
            }
        },
        POST: async (request: Request) => {
            try {
                enabled();
                const q = scope(request), runtime = create();
                await runtime.check(request, q.dossierId, 'read');
                const command = exceptionalCommandSchema.parse(await (await bounded(request, 500000)).json());
                return Response.json(await runtime.exceptionalCommand(request, q.dossierId, q.periodId, command, request.headers.get('Idempotency-Key') ?? ''), { headers });
            }
            catch (e) {
                report(e);
                return failure(e);
            }
        },
        importsPOST: async (request: Request) => {
            try {
                enabled();
                const q = scope(request), runtime = create();
                await runtime.check(request, q.dossierId, 'prepare');
                const body = await bounded(request, 3.25 * 1024 * 1024), key = request.headers.get('Idempotency-Key') ?? '';
                if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
                    const form = await body.formData();
                    if ([...form.keys()].some(k => !['file', 'mapping', 'period', 'documentType'].includes(k)) || [...form.keys()].length !== 4)
                        throw Error('EXCEPTIONAL_IMPORT_FIELDS_INVALID');
                    const file = form.get('file');
                    if (!(file instanceof File))
                        throw Error('EXCEPTIONAL_FILE_REQUIRED');
                    const period = clientsPeriodSchema.parse(JSON.parse(String(form.get('period'))));
                    if (periodId(period) !== q.periodId)
                        throw Error('WORKPAPER_PERIOD_INVALID');
                    const type = z.enum(EXCEPTIONAL_TYPES).parse(form.get('documentType')), mapping = exceptionalMappingSchema.parse(JSON.parse(String(form.get('mapping'))));
                    return Response.json(await runtime.previewExceptional(request, q.dossierId, period, file, mapping, type, key), { headers });
                }
                return Response.json(await runtime.approveImport(request, q.dossierId, q.periodId, clientsApprovalSchema.parse(await body.json()), key), { headers });
            }
            catch (e) {
                report(e);
                return failure(e);
            }
        }
    };
}

import { afterEach, it, expect, vi } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { NextRequest } from 'next/server';
import { exceptionalHandlers, requireDisposableExceptional } from '../exceptional-http';
import { ExceptionalRuntime } from '../exceptional-runtime';
import { assertContext, assertExceptionalContext } from '../cycle-context';
import { exceptionalPeriod } from '../exceptional-fixture';
import { periodId } from '../model';
import { GET as demoGET, POST as demoPOST } from '@/app/api/workpapers/resultat-exceptionnel/demo/route';
const dossier = '11111111-1111-4111-8111-111111111111', period = exceptionalPeriod(), pid = periodId(period);
const url = 'https://local.test/api/workpapers/resultat-exceptionnel?dossierId=' + dossier + '&periodId=' + pid;
const request = (body?: unknown) => new Request(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
afterEach(() => vi.unstubAllEnvs());
it('gate fermé par défaut et en production, opt-in jetable distinct', () => {
    for (const env of [{}, { PROBANT_EXCEPTIONAL_DURABLE: 'true' }, { PROBANT_EXCEPTIONAL_DURABLE: 'disposable', VERCEL_ENV: 'production' }])
        expect(() => requireDisposableExceptional(env)).toThrow();
    expect(() => requireDisposableExceptional({ PROBANT_EXCEPTIONAL_DURABLE: 'disposable' })).not.toThrow();
});
it('la revue exceptionnelle ne débloque pas les autres moteurs réels', () => {
    const context = { scope: { organizationId: 'org', dossierId: dossier, periodId: pid, mode: 'real' as const }, period, purpose: 'real' as const, procedure: 'exceptional.review' as const };
    expect(() => assertExceptionalContext(context)).not.toThrow();
    expect(() => assertContext(context)).toThrow();
});
it('erreur SQL publique ne divulgue pas le contenu du dossier', async () => {
    const h = exceptionalHandlers(() => { throw new DrizzleQueryError('PRIVATE SQL', ['SECRET'], Error('driver')); }, () => { });
    const r = await h.GET(request());
    expect(r.status).toBe(503);
    expect(await r.text()).toBe('{"error":"EXCEPTIONAL_DURABLE_UNAVAILABLE"}');
});
it('session expirée : lecture, commande et téléchargement refusés avant transaction', async () => {
    let calls = 0;
    const runtime = new ExceptionalRuntime({ execute: async () => [], transaction: async () => { calls++; throw Error('UNEXPECTED'); } }, { authorize: async () => ({ subject: 'expired', organizationId: 'org', dossierIds: [dossier], roles: ['preparer'], authenticationMethod: 'oidc-session', amr: [], acr: null, mfaSatisfied: true, expiresAtEpochSeconds: 99 }) }, () => 100);
    const h = exceptionalHandlers(() => runtime, () => { });
    expect((await h.GET(request())).status).toBe(401);
    expect((await h.GET(new Request(url + '&operation=download&id=doc'))).status).toBe(401);
    expect((await h.POST(request({ command: 'execute', id: 'run', expectedVersion: 1 }))).status).toBe(401);
    expect(calls).toBe(0);
});
it('rôle, auteur, approbation forgés et montant de GL transmis par le navigateur refusés', async () => {
    let calls = 0;
    const h = exceptionalHandlers(() => ({ check: async () => { }, exceptionalCommand: async () => { calls++; } }) as unknown as ExceptionalRuntime, () => { });
    for (const extra of [{ role: 'reviewer' }, { authorId: 'forged' }, { approved: true }, { ledgerAmount: '0.00' }])
        expect((await h.POST(request({ command: 'execute', id: 'run', expectedVersion: 1, ...extra }))).status).toBe(400);
    expect(calls).toBe(0);
});
it('requête trop volumineuse et paramètres dupliqués refusés', async () => {
    const h = exceptionalHandlers(() => ({ check: async () => { } }) as unknown as ExceptionalRuntime, () => { });
    expect((await h.POST(request({ text: 'x'.repeat(500001) }))).status).toBe(413);
    expect((await h.GET(new Request(url + '&periodId=' + pid))).status).toBe(422);
});
it('export périmé refusé et export valide servi sans cache avec CSP restrictive', async () => {
    const base = { dossierId: dossier, periodId: pid, id: 'run', version: 1, expectedHash: 'a'.repeat(64), format: 'html' };
    const req = () => new Request('https://local.test/export', { method: 'POST', body: JSON.stringify(base) });
    const h = exceptionalHandlers(() => ({ exceptionalExport: async () => { throw Error('EXPORT_SNAPSHOT_CONFLICT'); } }) as unknown as ExceptionalRuntime, () => { });
    expect((await h.exportPOST(req())).status).toBe(409);
    const valid = exceptionalHandlers(() => ({ exceptionalExport: async () => ({ html: '<!doctype html><p>Diagnostic</p>' }) }) as unknown as ExceptionalRuntime, () => { });
    const r = await valid.exportPOST(req());
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
});
it('démonstration locale fermée hors origine et sur Vercel production', async () => {
    vi.stubEnv('PROBANT_DEMONSTRATION_ENABLED', 'true');
    vi.stubEnv('PROBANT_DEMONSTRATION_ORIGIN', 'http://127.0.0.1:3017');
    const request = () => new NextRequest('http://127.0.0.1:3017/api/workpapers/resultat-exceptionnel/demo', { headers: { host: '127.0.0.1:3017' } });
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await demoGET(request())).status).toBe(503);
    vi.stubEnv('VERCEL_ENV', '');
    expect((await demoGET(new NextRequest('http://other.test/demo', { headers: { host: 'other.test' } }))).status).toBe(503);
    const body = new NextRequest(request().url, { method: 'POST', headers: { host: '127.0.0.1:3017', origin: 'http://other.test' }, body: '{}' });
    expect((await demoPOST(body)).status).toBe(503);
});

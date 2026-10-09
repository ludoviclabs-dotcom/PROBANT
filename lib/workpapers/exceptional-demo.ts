import { z } from 'zod';
import { exceptionalFixture } from './exceptional-fixture';
import { exceptionalDraftSchema, stampExceptionalWork } from './exceptional-dossier';
import { MemoryWorkpaperRepository } from './repository';
import { WorkpaperService } from './service';
import { ExceptionalRegistry } from './exceptional-adapter';
import type { Principal } from './policy';
export class ExceptionalDemo {
    private constructor(readonly fixture: Awaited<ReturnType<typeof exceptionalFixture>>, readonly repository: MemoryWorkpaperRepository, public id: string) { }
    static async create(scenario: string) { const f = await exceptionalFixture(scenario), repo = new MemoryWorkpaperRepository(); await repo.create(f.run); return new ExceptionalDemo(f, repo, f.run.id); }
    async read() { const run = (await this.repository.get(this.fixture.scope, this.id))!; return { actorId: this.fixture.actor.id, permissions: [], runs: [run], facts: { [run.id]: this.fixture.facts }, imports: this.fixture.imports, sourceHeads: this.fixture.imports.map(b => ({ document_type: b.document.documentType, import_id: b.id })), synthetic: true, history: await this.repository.history(this.fixture.scope, this.id) }; }
    async command(input: unknown) {
        const b = z.object({ action: z.enum(['save', 'submit', 'approve', 'request_changes', 'revise']), expectedVersion: z.number().int().positive(), draft: exceptionalDraftSchema.optional(), note: z.string().trim().min(1).max(10000).optional(), submittedHash: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().parse(input);
        const f = this.fixture, review = ['approve', 'request_changes'].includes(b.action), actor: Principal = review ? { id: 'Relecteur synthétique distinct', grants: [{ scope: f.scope, permissions: ['read', 'review', 'download'] }] } : f.actor;
        const imports = { download: () => null, get: (scope: typeof f.scope, id: string) => {
                if (JSON.stringify(scope) !== JSON.stringify(f.scope))
                    throw Error('WORKPAPER_SCOPE_MISMATCH');
                const found = f.imports.find(x => x.id === id);
                if (!found)
                    throw Error('IMPORT_NOT_FOUND');
                return found;
            } };
        const service = new WorkpaperService(this.repository, imports, new ExceptionalRegistry(), async () => actor, () => new Date().toISOString(), 'exceptional.review'), current = (await this.repository.get(f.scope, this.id))!;
        if (current.version !== b.expectedVersion)
            throw Error('STALE_WORKPAPER_VERSION');
        if (b.action === 'save') {
            if (!b.draft)
                throw Error('EXCEPTIONAL_DRAFT_REQUIRED');
            const work = stampExceptionalWork(b.draft, f.imports, f.scope, current.period, current.id, actor.id, new Date().toISOString()), run = await service.configureExceptional(f.scope, this.id, current.version, work);
            await service.execute(f.scope, this.id, run.version, { runId: this.id, work });
        }
        else if (b.action === 'submit') {
            if (!b.note)
                throw Error('CONCLUSION_REQUIRED');
            const run = await service.conclude(f.scope, this.id, current.version, b.note + ' ; pièces synthétiques et pack officiel cités dans la qualification');
            await service.transition(f.scope, this.id, run.version, 'awaiting_review');
        }
        else if (b.action === 'revise') {
            const run = await service.revise(f.scope, this.id, current.version);
            this.id = run.id;
        }
        else {
            if (!b.note)
                throw Error('REVIEW_NOTE_REQUIRED');
            await service.transition(f.scope, this.id, current.version, b.action === 'approve' ? 'approved' : 'changes_requested', b.note, b.submittedHash);
        }
        return this.read();
    }
}

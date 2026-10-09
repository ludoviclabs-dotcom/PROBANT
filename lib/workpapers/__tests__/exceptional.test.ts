import { describe, it, expect } from 'vitest';
import { exceptionalFixture } from '../exceptional-fixture';
import { evaluateExceptional, initialExceptionalDraft, stampExceptionalWork, exceptionalRuleGate, exceptionalFacts } from '../exceptional-dossier';
import { exceptionalDiagnostic } from '../exceptional-package';
import { ExceptionalDemo } from '../exceptional-demo';
import { freezePopulation, selectPopulation } from '../selection';
import { contentHash } from '../model';
const fixture = () => exceptionalFixture('complete');
type Fixture = Awaited<ReturnType<typeof fixture>>;
function evaluate(f: Fixture, work = f.run.exceptionalWork!) {
    return evaluateExceptional(f.scope, f.run.period, f.imports, f.run.id, f.run.population!, f.run.selection!, work);
}
function change(f: Fixture, type: string, key: string, details: Record<string, unknown>) {
    f.imports = structuredClone(f.imports);
    const row = f.imports.find(b => b.document.documentType === type)!.rows.find(r => r.normalized!.key === key)!;
    row.original.Details = JSON.stringify({ ...JSON.parse(row.original.Details), ...details });
}
function decisions(f: Fixture) {
    const work = structuredClone(f.run.exceptionalWork!);
    for (const e of work.entries) {
        const row = f.result.rows.find(r => r.id === e.eventId)!;
        e.decision = { reason: 'Analyse humaine documentée sur la pièce et le référentiel de cet exercice', citationRowId: e.supportIds[0], date: f.run.period.asOfDate, lines: row.lines.map(l => ({ ledgerRowId: l.id, destination: l.proposed! })) };
    }
    return work;
}
describe('Mission 17 — qualification par événement', () => {
    it('importe cinq CSV par le moteur partagé ; GL complet, huit événements et aucune décision automatique', async () => {
        const f = await fixture();
        expect(f.run.result?.execution).toBe('completed');
        expect(f.imports).toHaveLength(5);
        expect(f.result.coverage).toMatchObject({ denominator: 8, ledgerRows: 18, outside6777: 2 });
        expect(f.result.rows.every(r => r.entry.decision === null)).toBe(true);
        expect(f.result.bridge.complete).toBe(false);
        expect(initialExceptionalDraft(f.facts).ruleRowId).toBeNull();
    });
    it('maintenance courante en 678 : proposition exploitation, présentation inchangée avant décision', async () => {
        const f = await fixture(), row = f.result.rows.find(r => r.id === 'MAINT')!;
        expect(row.lines[0]).toMatchObject({ before: 'exceptionnel', proposed: 'exploitation' });
        expect(f.result.bridge.before).toEqual(f.result.bridge.after);
    });
    it('événement majeur allégué sans pièce : bloqué, montant du diagnostic inconnu et GL intact', async () => {
        const f = await exceptionalFixture(), row = f.result.rows.find(r => r.id === 'MAJOR')!;
        expect(row.lines[0].proposed).toBeNull();
        expect(row.status).toBe('evidence_required');
        expect(f.result.exceptions.find(e => e.rowId === 'MAJOR')!.amount.kind).toBe('unknown');
        expect(f.result.bridge.before).toEqual(f.result.bridge.after);
    });
    it('un événement documenté hors 67/77 est examiné', async () => {
        const f = await fixture(), row = f.result.rows.find(r => r.id === 'OUTSIDE')!;
        expect(row.lines[0]).toMatchObject({ account: '622600', before: 'exploitation', proposed: 'exceptionnel' });
    });
    it('traite fiscalité pure, méthode fiscale, erreur et capitaux propres séparément', async () => {
        const f = await fixture(), proposal = (id: string) => f.result.rows.find(r => r.id === id)!.lines[0].proposed;
        expect(proposal('TAX')).toBe('exceptionnel');
        expect(proposal('METHOD')).toBe('exceptionnel');
        expect(proposal('ERROR')).toBe('exceptionnel');
        expect(proposal('EQUITY')).toBe('capitaux_propres');
        change(f, 'exceptional_events', 'TAX', { fiscalBasis: null });
        expect(evaluate(f).rows.find(r => r.id === 'TAX')!.lines[0].proposed).toBeNull();
    });
    it('une fiscalité générique ou un impôt sur les résultats n’est pas qualifié automatiquement', async () => {
        const f = await fixture();
        change(f, 'exceptional_events', 'TAX', { fiscalTreatment: 'other_pending' });
        expect(evaluate(f).rows.find(r => r.id === 'TAX')!.lines[0].proposed).toBeNull();
        change(f, 'exceptional_events', 'TAX', { category: 'income_tax' });
        expect(evaluate(f).rows.find(r => r.id === 'TAX')!.lines[0].proposed).toBeNull();
    });
    it('compensation de charges d’exploitation et coût indépendant restent courants', async () => {
        const f = await fixture();
        expect(f.result.rows.find(r => r.id === 'COMP')!.lines[0].proposed).toBe('exploitation');
        change(f, 'exceptional_ledger', 'GL-OUTSIDE', { direct: 'no' });
        expect(evaluate(f).rows.find(r => r.id === 'OUTSIDE')!.lines[0].proposed).toBe('exploitation');
    });
    it.each(['major', 'unusual'] as const)('%s inconnu : ne qualifie pas', async (field) => {
        const f = await fixture();
        change(f, 'exceptional_events', 'OUTSIDE', { [field]: 'unknown' });
        expect(evaluate(f).rows.find(r => r.id === 'OUTSIDE')!.lines[0].proposed).toBeNull();
    });
    it('les suites d’un événement exigent une qualification initiale compatible sous la nouvelle règle', async () => {
        const f = await fixture();
        change(f, 'exceptional_events', 'OUTSIDE', { priorEventId: 'PAST', priorInitialQualification: 'incompatible' });
        expect(evaluate(f).rows.find(r => r.id === 'OUTSIDE')!.lines[0].proposed).toBeNull();
    });
    it('libellé et montant ne changent jamais les faits de qualification', async () => {
        const f = await fixture();
        change(f, 'exceptional_ledger', 'GL-MAINT', { label: 'Majeur et inhabituel EXCEPTIONNEL' });
        change(f, 'exceptional_events', 'MAINT', { label: 'Sinistre exceptionnel' });
        expect(evaluate(f).rows.find(r => r.id === 'MAINT')!.lines[0].proposed).toBe('exploitation');
    });
    it('PCG 2024 conserve une qualification historique sans appliquer rétroactivement 513-5', async () => {
        const f = await exceptionalFixture('old');
        expect(f.result.gate.established).toBe(true);
        expect(f.result.gate.article).toContain('946-67');
        expect(f.result.rows.find(r => r.id === 'OUTSIDE')!.lines[0]).toMatchObject({ account: '675000', proposed: 'exceptionnel' });
        expect(f.result.rows.find(r => r.id === 'MAINT')!.lines[0].proposed).toBe('exploitation');
        expect(f.result.rows[0].comparison!.start).toBe('2023-01-01');
    });
    it('comparatif 2024 conservé après décision 2025 ; changement de format visible', async () => {
        const f = await fixture(), r = evaluate(f, decisions(f));
        expect(r.rows.find(r => r.id === 'MAINT')!.comparison).toMatchObject({ destination: 'exceptionnel', qualificationPreserved: true, formatChanged: true });
    });
    it('référentiel inconnu : documentation enregistrable, toutes les qualifications bloquées', async () => {
        const demo = await ExceptionalDemo.create('unknown'), view = await demo.read(), draft = { ...demo.fixture.draft, documentation: 'Demande de référentiel et pièces en cours' };
        const saved = await demo.command({ action: 'save', expectedVersion: view.runs[0].version, draft });
        expect(saved.runs[0].exceptionalWork!.documentation).toContain('Demande');
        expect((saved.runs[0].result!.result as typeof demo.fixture.result).rows.every(r => r.status === 'rule_blocked')).toBe(true);
    });
    it('décisions documentées : pont équilibré, totaux exacts et sources immuables', async () => {
        const f = await fixture(), original = JSON.stringify(f.imports), r = evaluate(f, decisions(f));
        expect(r.bridge.complete).toBe(true);
        expect(r.bridge.totalPreserved).toBe(true);
        expect(r.bridge.before.exceptionnel.amount).toBe('417.00');
        expect(r.bridge.after.exceptionnel.amount).toBe('455.00');
        expect(r.bridge.after.exploitation.amount).toBe('75.00');
        expect(r.bridge.after.capitaux_propres.amount).toBe('12.00');
        expect(JSON.stringify(f.imports)).toBe(original);
    });
    it('décision incompatible, sans citation ou citation d’un autre événement refusée', async () => {
        const f = await fixture(), work = decisions(f);
        work.entries.find(e => e.eventId === 'MAINT')!.decision!.lines[0].destination = 'exceptionnel';
        expect(evaluate(f, work).bridge.complete).toBe(false);
        work.entries[0].decision!.citationRowId = work.entries[1].supportIds[0];
        expect(() => stampExceptionalWork({ schemaVersion: work.schemaVersion, ruleRowId: work.ruleRowId, documentation: work.documentation, entries: work.entries }, f.imports, f.scope, f.run.period, f.run.id, f.actor.id, '2026-10-09T12:00:00.000Z')).toThrow('CITATION_INVALID');
    });
    it('toutes les écritures associées sont incluses même sans registre ou hors 67/77', async () => {
        const f = await fixture();
        change(f, 'exceptional_ledger', 'GL-ORDINARY', { eventId: 'MAINT' });
        const pop = freezePopulation(f.scope, f.imports, 'event', f.actor);
        expect(pop.items.find(i => i.id === 'MAINT')!.rowIds).toHaveLength(3);
        const draft = initialExceptionalDraft(exceptionalFacts(f.scope, f.run.period, f.imports, f.run.id));
        expect(draft.entries.find(e => e.eventId === 'MAINT')!.ledgerIds).toHaveLength(3);
        const selection = selectPopulation(pop, { method: 'targeted', criteria: 'Tous', exclusions: [], selectedIds: pop.items.map(i => i.id), requestedSize: pop.items.length }, f.actor);
        const r = evaluateExceptional(f.scope, f.run.period, f.imports, f.run.id, pop, selection, decisions(f));
        expect(r.rows.find(r => r.id === 'MAINT')!.issues.join(' ')).toContain('Toutes les écritures');
        expect(r.bridge.complete).toBe(false);
    });
    it('omission d’un événement et sélection partielle ne permettent pas de conclure', async () => {
        const f = await fixture(), work = decisions(f);
        work.entries = work.entries.slice(1);
        expect(evaluate(f, work).uncovered).toHaveLength(1);
        expect(evaluate(f, work).bridge.complete).toBe(false);
        const pop = f.run.population!, selection = selectPopulation(pop, { method: 'targeted', criteria: 'Partiel', exclusions: [], selectedIds: [pop.items[0].id], requestedSize: 1 }, f.actor);
        expect(evaluateExceptional(f.scope, f.run.period, f.imports, f.run.id, pop, selection, decisions(f)).bridge.complete).toBe(false);
    });
    it('source non approuvée, périmètre transversal et date client future refusés', async () => {
        const f = await fixture(), batches = structuredClone(f.imports);
        batches[0].approval = undefined;
        expect(() => exceptionalFacts(f.scope, f.run.period, batches, f.run.id)).toThrow('UNAPPROVED');
        batches[0].scope.dossierId = 'OTHER';
        expect(() => exceptionalFacts(f.scope, f.run.period, batches, f.run.id)).toThrow('SCOPE');
        change(f, 'exceptional_support', 'SUP-MAINT', { documentDate: '2027-01-01' });
        expect(() => evaluate(f)).toThrow('DATE_INVALID');
    });
    it('GL avec lignes rejetées et écriture hors exercice empêchent une conclusion complète', async () => {
        const f = await fixture();
        f.imports = structuredClone(f.imports);
        f.imports[0].report.rejectedRows = 1;
        expect(() => evaluate(f)).toThrow('GL_INCOMPLETE');
        f.imports[0].report.rejectedRows = 0;
        f.imports[0].rows[0].normalized!.date = '2024-12-31';
        expect(evaluate(f, decisions(f)).bridge.complete).toBe(false);
    });
    it('export sépare sources officielles et pièces client et échappe les contenus', async () => {
        const f = await fixture(), run = structuredClone(f.run);
        run.exceptionalWork!.documentation = '<script>unsafe</script>';
        const pack = exceptionalDiagnostic(run);
        expect(pack.html).toContain('&lt;script&gt;');
        expect(pack.html).not.toContain('<script>');
        expect(pack.html).toContain('Sources officielles');
        expect(pack.html).toContain('Pièces client');
        expect(JSON.parse(pack.json).hash).toBe(contentHash(run));
    });
});
describe('Mission 17 — version et anticipation', () => {
    it('PCG 2024 / ANC 2022-06 anticipation sans adoption ou modifications non revues bloqués', async () => {
        const f = await exceptionalFixture('old'), rule = structuredClone(f.facts.find(f => f.type === 'exceptional_rules')!);
        rule.details.version = 'ANC-2022-06';
        expect(exceptionalRuleGate(rule, f.facts, f.run.period).established).toBe(false);
        rule.details.anticipation = true;
        const support = f.facts.find(f => f.type === 'exceptional_support')!;
        support.details.purpose = 'anticipation_adoption';
        rule.details.adoptionRowId = support.rowId;
        expect(exceptionalRuleGate(rule, f.facts, f.run.period).established).toBe(true);
        rule.details.modificationsReviewed = false;
        expect(exceptionalRuleGate(rule, f.facts, f.run.period).established).toBe(false);
    });
    it('numérotation 531-5 seulement avec version 2026-03 applicable et adoption démontrée en 2026', async () => {
        const f = await fixture(), rule = structuredClone(f.facts.find(f => f.type === 'exceptional_rules')!), support = structuredClone(f.facts.find(f => f.type === 'exceptional_support')!);
        const p = { ...f.run.period, startDate: '2026-01-01', closingDate: '2026-12-31' };
        rule.details = { ...rule.details, from: p.startDate, to: p.closingDate, version: 'ANC-2026-03', documentDate: '2026-03-06', anticipation: true, adoptionRowId: support.rowId };
        support.details.purpose = 'anticipation_adoption';
        support.date = '2026-09-10';
        const gate = exceptionalRuleGate(rule, [support], p);
        expect(gate.established).toBe(true);
        expect(gate.article).toContain('531-5');
        support.date = '2026-09-01';
        expect(exceptionalRuleGate(rule, [support], p).established).toBe(false);
        const p27 = { ...p, startDate: '2027-01-01', closingDate: '2027-12-31', asOfDate: '2028-01-01' };
        rule.details.from = p27.startDate;
        rule.details.to = p27.closingDate;
        rule.details.reviewedThrough = p27.asOfDate;
        rule.details.anticipation = false;
        expect(exceptionalRuleGate(rule, [], p27).established).toBe(true);
        rule.details.version = 'ANC-2022-06';
        expect(exceptionalRuleGate(rule, [], p27).established).toBe(false);
    });
    it('source web non officielle et référentiel sectoriel bloquent', async () => {
        const f = await fixture(), rule = structuredClone(f.facts.find(f => f.type === 'exceptional_rules')!);
        rule.details.url = 'https://example.org/pcg';
        expect(exceptionalRuleGate(rule, f.facts, f.run.period).established).toBe(false);
        rule.details.url = 'https://www.anc.gouv.fr';
        rule.details.profile = 'sector_specific';
        expect(exceptionalRuleGate(rule, f.facts, f.run.period).established).toBe(false);
    });
});
describe('Mission 17 — workflow partagé', () => {
    it('refuse une revue incomplète et une version concurrente', async () => {
        const demo = await ExceptionalDemo.create('complete');
        await expect(demo.command({ action: 'submit', expectedVersion: 1, note: 'Une note seule ne suffit pas' })).rejects.toThrow('QUALIFICATION_INCOMPLETE');
        await expect(demo.command({ action: 'save', expectedVersion: 1, draft: demo.fixture.draft })).rejects.toThrow('STALE');
    });
    it('décisions puis soumission, relecteur distinct, hash exact et modification bloquée après revue', async () => {
        const demo = await ExceptionalDemo.create('complete'), f = demo.fixture, work = decisions(f);
        let view = await demo.command({ action: 'save', expectedVersion: 1, draft: { schemaVersion: work.schemaVersion, entries: work.entries, ruleRowId: work.ruleRowId, documentation: 'Toutes les pièces examinées' } });
        view = await demo.command({ action: 'submit', expectedVersion: view.runs[0].version, note: 'Conclusion motivée' });
        await expect(demo.command({ action: 'approve', expectedVersion: view.runs[0].version, submittedHash: 'a'.repeat(64), note: 'Revue' })).rejects.toThrow();
        view = await demo.command({ action: 'approve', expectedVersion: view.runs[0].version, submittedHash: view.runs[0].submittedHash, note: 'Décisions et pièces revues' });
        expect(view.runs[0].approval!.actorId).not.toBe(view.runs[0].preparedBy);
        await expect(demo.command({ action: 'save', expectedVersion: view.runs[0].version, draft: f.draft })).rejects.toThrow('FORBIDDEN');
        expect(view.history.length).toBeGreaterThan(3);
    });
});

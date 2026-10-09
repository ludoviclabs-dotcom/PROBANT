import { previewImport, MemoryImportRepository, type ImportBatch } from './imports';
import { EXCEPTIONAL_MAPPING, exceptionalFacts, initialExceptionalDraft, stampExceptionalWork, evaluateExceptional } from './exceptional-dossier';
import { ExceptionalRegistry, EXCEPTIONAL_TEMPLATE } from './exceptional-adapter';
import { freezePopulation, selectPopulation } from './selection';
import { periodId, type WorkpaperScope, type WorkpaperRun } from './model';
import type { Principal } from './policy';
export function exceptionalPeriod(old = false) { return { startDate: old ? '2024-01-01' : '2025-01-01', closingDate: old ? '2024-12-31' : '2025-12-31', asOfDate: '2026-10-09', currency: 'EUR' as const, validation: 'provisional' as const }; }
const csv = (rows: {
    key: string;
    amount: string;
    date: string;
    details: unknown;
}[]) => 'Key;Amount;Date;Details\n' + rows.map(r => [r.key, r.amount, r.date, JSON.stringify(r.details)].map(v => '"' + v.replaceAll('"', '""') + '"').join(';')).join('\n');
export function exceptionalSyntheticFiles(scenario = '', long = false) {
    const old = scenario === 'old', p = exceptionalPeriod(old), ids = ['MAINT', 'MAJOR', 'OUTSIDE', 'TAX', 'METHOD', 'ERROR', 'EQUITY', 'COMP'], amounts = ['120.00', '300.00', '80.00', '25.00', '35.00', '15.00', '12.00', '-90.00'];
    const labels = ['Maintenance annuelle en 678', scenario === 'complete' ? 'Sinistre majeur documenté' : 'Sinistre majeur allégué sans pièces', old ? 'Sortie d’immobilisation — classement historique' : 'Remise en état candidate hors 67/77', 'Amortissement dérogatoire', 'Changement de méthode pour motif fiscal', 'Correction d’erreur en résultat', 'Correction directement en capitaux propres', 'Indemnité compensant des charges d’exploitation'];
    const rows: Record<string, {
        key: string;
        amount: string;
        date: string;
        details: unknown;
    }[]> = {}, row = (key: string, amount: string, details: unknown, date = p.closingDate) => ({ key, amount, details, date });
    rows.exceptional_ledger = ids.map((id, i) => row('GL-' + id, amounts[i], { account: i === 2 ? old ? '675000' : '622600' : i === 3 ? '687250' : i === 7 ? '778000' : '678000', eventId: id, piece: 'P-' + id, label: labels[i], compensatesOperating: id === 'COMP', direct: 'yes', nature: 'exploitation', completeLedger: true }));
    rows.exceptional_ledger.push(row('GL-ORDINARY', '45.00', { account: '606000', eventId: null, piece: 'P-ORDINARY', label: 'Achats courants sans événement candidat', compensatesOperating: false, direct: 'no', nature: 'exploitation', completeLedger: true }));
    const contra = rows.exceptional_ledger.map(r => {
        const d = r.details as {
            eventId: string | null;
        };
        return row(r.key + '-CONTRA', (-Number(r.amount)).toFixed(2), { account: old && d.eventId === 'OUTSIDE' ? '218300' : d.eventId === 'TAX' ? '145000' : d.eventId === 'COMP' ? '467000' : '401000', eventId: d.eventId, piece: 'P-' + (d.eventId ?? 'ORDINARY'), label: 'Contrepartie de l’écriture du GL complet', compensatesOperating: false, direct: 'no', nature: 'hors_resultat', completeLedger: true });
    });
    rows.exceptional_ledger.push(...contra);
    rows.exceptional_events = ids.map((id, i) => row(id, '0.00', { eventId: id, label: labels[i] + (long ? ' — ' + 'Contexte et pièces à examiner dans le dossier. '.repeat(12) : ''), category: old && i === 2 ? 'legacy_capital' : i === 0 ? 'ordinary' : i === 3 ? 'pure_tax' : i === 4 ? 'tax_method_change' : i === 5 || i === 6 ? 'error' : 'major_unusual', major: 'yes', unusual: i === 0 ? 'no' : 'yes', reason: id === 'MAJOR' ? 'Qualification alléguée, à corroborer' : 'Lecture humaine synthétique, sans déduction du libellé ou de la fréquence', priorInitialQualification: 'none', priorEventId: null, originalInEquity: id === 'EQUITY', fiscalTreatment: i === 3 ? 'derogatory_depreciation' : i === 4 ? 'tax_driven_method' : 'other_pending', fiscalBasis: i === 3 ? 'Provision réglementée et amortissement dérogatoire : traitement documenté' : i === 4 ? 'Changement de méthode imputé au résultat en raison des règles fiscales' : null }));
    rows.exceptional_support = ids.filter(id => id !== 'MAJOR' || scenario === 'complete').map(id => row('SUP-' + id, '0.00', { eventId: id, title: 'EXEMPLE — pièce client ' + id, pack: 'EXEMPLE-CLIENT-' + p.startDate.slice(0, 4), documentDate: p.closingDate, page: 2, extract: old && id === 'OUTSIDE' ? 'Pièce synthétique de sortie de l’immobilisation et valeur comptable associée au GL' : id === 'MAINT' ? 'Contrat annuel de maintenance : activité normale et courante' : 'Pièce transcrite synthétique établissant le contexte et la nature de l’événement' }));
    rows.exceptional_rules = [row('RULE', '0.00', { title: old ? 'Recueil PCG au 1er janvier 2024' : 'Règlement ANC 2022-06 homologué', pack: 'EXEMPLE-OFFICIEL-' + (old ? '2024' : '2025'), documentDate: old ? '2024-01-01' : '2022-11-04', page: old ? 563 : 2, organization: 'Autorité des normes comptables', url: old ? 'https://www.anc.gouv.fr/entreprises-industrielles-et-commerciales-2024' : 'https://www.anc.gouv.fr/reglement-ndeg-2022-06-du-4-novembre-2022', section: old ? '946-67 / 947-77, version 2024' : '513-5 et article 27, ANC 2022-06', version: old ? 'PCG-2024' : 'ANC-2022-06', profile: 'pcg_general', from: p.startDate, to: p.closingDate, consultedOn: p.asOfDate, reviewedThrough: p.asOfDate, modificationsReviewed: true, anticipation: false, adoptionRowId: null }, p.startDate)];
    rows.exceptional_annex = ids.map(id => row('ANN-' + id, '0.00', { eventId: id, title: 'EXEMPLE — annexe et comptes antérieurs', pack: 'EXEMPLE-ANNEXE', documentDate: p.closingDate, page: 8, extract: 'Contexte, détail charges et produits, rapprochement aux pièces et qualification à documenter ; présentation comparée distincte', previousVersion: old ? 'PCG historique 2023 à documenter' : 'PCG au 01/01/2024 sans anticipation', previousStart: old ? '2023-01-01' : '2024-01-01', previousClose: old ? '2023-12-31' : '2024-12-31', previousDestination: 'exceptionnel', previousPublishedAmount: { amount: '50.00', currency: 'EUR' }, formatChanged: !old, publishedAccountsCited: true }));
    return Object.fromEntries(Object.entries(rows).map(([type, rs]) => [type, new File([csv(rs)], 'EXEMPLE-' + type + '.csv', { type: 'text/csv' })]));
}
export async function exceptionalFixture(scenario = '', scope?: WorkpaperScope) {
    const period = exceptionalPeriod(scenario === 'old'), actual = scope ?? { organizationId: 'SYN-EXCEPTIONAL', dossierId: 'SYN-EXCEPTIONAL', periodId: periodId(period), mode: 'demo' as const }, actor: Principal = { id: 'Préparateur synthétique', grants: [{ scope: actual, permissions: ['read', 'prepare', 'download'] }] }, files = exceptionalSyntheticFiles(scenario, scenario === 'long'), imports: ImportBatch[] = [];
    for (const [type, file] of Object.entries(files)) {
        const b = await previewImport(file, actual, EXCEPTIONAL_MAPPING, actor, type, actual.mode === 'real' ? 'exceptional.review' : undefined);
        if (b.report.blocking.length)
            throw Error('SYNTHETIC_IMPORT_INVALID');
        imports.push(actual.mode === 'demo' ? await new MemoryImportRepository().approveAndSave(b, file, actor, b.previewHash, '2026-10-09T12:00:00.000Z') : { ...b, report: { ...b.report, calculationAllowed: true }, approval: { actorId: actor.id, at: '2026-10-09T12:00:00.000Z', previewHash: b.previewHash } });
    }
    const runId = 'SYN-EXCEPTIONAL-' + (scenario || 'default'), facts = exceptionalFacts(actual, period, imports, runId), draft = initialExceptionalDraft(facts);
    draft.ruleRowId = scenario === 'unknown' ? null : facts.find(f => f.type === 'exceptional_rules')!.rowId;
    const population = freezePopulation(actual, imports, 'event', actor), selection = selectPopulation(population, { method: 'targeted', criteria: 'Tous les événements candidats du GL complet synthétique, sans extrapolation', exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor), work = stampExceptionalWork(draft, imports, actual, period, runId, actor.id, '2026-10-09T12:00:00.000Z');
    const calculation = new ExceptionalRegistry().execute({ scope: actual, period, rule: EXCEPTIONAL_TEMPLATE.rule!, imports, population, selection, parameters: { runId, work } }), result = evaluateExceptional(actual, period, imports, runId, population, selection, work);
    const run: WorkpaperRun = { id: runId, rootId: runId, revision: 1, version: 1, schemaVersion: '1.0.0', scope: actual, period, template: EXCEPTIONAL_TEMPLATE, state: 'executed', preparedBy: actor.id, importIds: imports.map(b => b.id), population, selection, exceptionalWork: work, result: calculation, evidence: result.evidence, findings: [], notes: [], events: [{ id: 'synthetic:1', action: 'synthetic_execution', actorId: actor.id, at: '2026-10-09T12:00:00.000Z', version: 1 }] };
    return { scope: actual, actor, files, imports, draft, facts, run, result };
}

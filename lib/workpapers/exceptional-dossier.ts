import { z } from 'zod';
import { cents, money } from '@/lib/canonical-model/money';
import type { AccountingPeriod } from '@/lib/canonical-model/period';
import { stableSha256 } from '@/lib/synthesis/canonical';
import { assertScope, frozen, moneySchema, type EvidenceLink, type WorkpaperScope, type Population, type SelectionSet } from './model';
import type { ImportBatch, ImportMapping } from './imports';
import { assertExceptionalContext } from './cycle-context';
import { dateSchema } from './cycle-review';
export const EXCEPTIONAL_TYPES = ['exceptional_ledger', 'exceptional_events', 'exceptional_support', 'exceptional_rules', 'exceptional_annex'] as const;
export const EXCEPTIONAL_LABELS: Record<string, string> = { exceptional_ledger: 'GL complet', exceptional_events: 'Registre des événements', exceptional_support: 'Pièces client', exceptional_rules: 'Pack officiel versionné', exceptional_annex: 'Annexe et comparatif' };
const text = z.string().trim().min(1).max(4000), ref = z.string().min(1).max(200);
export const destinations = ['exploitation', 'financier', 'exceptionnel', 'capitaux_propres', 'impots_sur_resultat', 'hors_resultat'] as const;
export const categories = ['ordinary', 'major_unusual', 'pure_tax', 'tax_method_change', 'error', 'legacy_management', 'legacy_capital', 'income_tax', 'undocumented'] as const;
export const exceptionalMappingSchema = z.object({ version: z.literal('exceptional-review-1'), sheet: z.string().optional(), headerRow: z.number().int().positive(), columns: z.object({ key: text, amount: text, date: text }).strict(), delimiter: z.enum([';', ',', '\t']), decimal: z.enum([',', '.']), dateFormat: z.enum(['ISO', 'DD/MM/YYYY']), sign: z.literal(1), currency: z.literal('EUR') }).strict();
export const EXCEPTIONAL_MAPPING: ImportMapping = { version: 'exceptional-review-1', headerRow: 1, columns: { key: 'Key', amount: 'Amount', date: 'Date' }, delimiter: ';', decimal: '.', dateFormat: 'ISO', sign: 1, currency: 'EUR' };
const citation = { title: text, pack: text, documentDate: dateSchema, page: z.number().int().positive().optional() };
const metadata = {
    exceptional_ledger: z.object({ account: z.string().regex(/^\d{2,10}$/), eventId: text.nullable(), piece: text, label: text, compensatesOperating: z.boolean(), direct: z.enum(['yes', 'no', 'unknown']), nature: z.enum(['exploitation', 'financier', 'capitaux_propres', 'impots_sur_resultat', 'hors_resultat']), completeLedger: z.literal(true) }).strict(),
    exceptional_events: z.object({ eventId: text, label: text, category: z.enum(categories), major: z.enum(['yes', 'no', 'unknown']), unusual: z.enum(['yes', 'no', 'unknown']), reason: text, priorInitialQualification: z.enum(['compatible', 'incompatible', 'none']), priorEventId: text.nullable(), originalInEquity: z.boolean(), fiscalBasis: text.nullable(), fiscalTreatment: z.enum(['regulated_provision', 'derogatory_depreciation', 'tax_driven_method', 'other_pending']).optional() }).strict(),
    exceptional_support: z.object({ ...citation, eventId: text, purpose: z.enum(['event_piece', 'anticipation_adoption']).default('event_piece'), extract: text }).strict(),
    exceptional_rules: z.object({ ...citation, organization: text, url: z.string().url(), section: text, version: z.enum(['PCG-2024', 'ANC-2022-06', 'ANC-2026-03']), profile: z.enum(['pcg_general', 'sector_specific']), from: dateSchema, to: dateSchema, consultedOn: dateSchema, reviewedThrough: dateSchema, modificationsReviewed: z.boolean(), anticipation: z.boolean(), adoptionRowId: text.nullable() }).strict(),
    exceptional_annex: z.object({ ...citation, eventId: text, purpose: z.enum(['event_piece', 'anticipation_adoption']).default('event_piece'), extract: text, previousVersion: text, previousStart: dateSchema, previousClose: dateSchema, previousDestination: z.enum(destinations), previousPublishedAmount: moneySchema, formatChanged: z.boolean(), publishedAccountsCited: z.boolean() }).strict()
};
export type ExceptionalFact = {
    rowId: string;
    documentVersionId: string;
    fileName: string;
    pack: string;
    version: string;
    sourceDate: string;
    line?: number;
    sheet?: string;
    type: typeof EXCEPTIONAL_TYPES[number];
    id: string;
    date: string;
    amount: import('@/lib/canonical-model/money').Money;
    details: Record<string, unknown>;
    proof: EvidenceLink;
};
export function assertExceptionalBatch(b: ImportBatch, period: AccountingPeriod) {
    exceptionalMappingSchema.parse(b.mapping);
    if (!EXCEPTIONAL_TYPES.includes(b.document.documentType as typeof EXCEPTIONAL_TYPES[number]))
        throw Error('EXCEPTIONAL_SOURCE_TYPE_INVALID');
    const seen = new Set<string>();
    for (const r of b.rows) {
        assertScope(b.scope, r.scope);
        if (!r.normalized || r.errors.length || seen.has(r.normalized.key) || r.normalized.date > period.asOfDate)
            throw Error('EXCEPTIONAL_SOURCE_ROW_INVALID');
        seen.add(r.normalized.key);
        const detail = metadata[b.document.documentType as keyof typeof metadata].parse(JSON.parse(r.original.Details ?? ''));
        if ('documentDate' in detail && detail.documentDate > period.asOfDate)
            throw Error('EXCEPTIONAL_SOURCE_DATE_INVALID');
    }
}
export function exceptionalFacts(scope: WorkpaperScope, period: AccountingPeriod, batches: ImportBatch[], runId: string): ExceptionalFact[] {
    return batches.flatMap(b => {
        assertScope(scope, b.scope);
        assertExceptionalBatch(b, period);
        if (!b.approval || !b.report.calculationAllowed)
            throw Error('EXCEPTIONAL_IMPORT_UNAPPROVED');
        return b.rows.map(r => ({ rowId: r.id, documentVersionId: b.document.id, fileName: b.document.fileName, pack: b.document.logicalId, version: b.document.byteHash, sourceDate: r.normalized!.date, line: r.locator.row, sheet: r.locator.sheet, type: b.document.documentType as ExceptionalFact['type'], id: r.normalized!.key, date: r.normalized!.date, amount: r.normalized!.amount, details: metadata[b.document.documentType as keyof typeof metadata].parse(JSON.parse(r.original.Details)) as Record<string, unknown>, proof: { id: 'proof-' + stableSha256({ runId, document: b.document.id, row: r.id }), scope, procedureId: runId, documentVersionId: b.document.id, rowId: r.id, locator: r.locator, precision: 'row' as const, status: 'verified' as const, purpose: EXCEPTIONAL_LABELS[b.document.documentType] } }));
    });
}
const decisionSchema = z.object({ reason: text, citationRowId: ref, date: dateSchema, lines: z.array(z.object({ ledgerRowId: ref, destination: z.enum(destinations) }).strict()).min(1).max(500) }).strict();
const entrySchema = z.object({ eventId: ref, eventRowId: ref.nullable(), ledgerIds: z.array(ref).min(1).max(500), supportIds: z.array(ref).max(100), annexRowId: ref.nullable(), decision: decisionSchema.nullable() }).strict();
export const exceptionalDraftSchema = z.object({ schemaVersion: z.literal('exceptional-review-1'), ruleRowId: ref.nullable(), documentation: z.string().max(10000), entries: z.array(entrySchema).min(1).max(2000) }).strict();
export type ExceptionalDraft = z.infer<typeof exceptionalDraftSchema>;
export const exceptionalWorkSchema = exceptionalDraftSchema.extend({ authorId: text, authoredAt: z.string().datetime() }).strict();
export type ExceptionalWork = z.infer<typeof exceptionalWorkSchema>;
export function exceptionalUnits(batches: ImportBatch[]) {
    const ledger = batches.filter(b => b.document.documentType === 'exceptional_ledger').flatMap(b => b.rows), events = new Set(batches.filter(b => b.document.documentType === 'exceptional_events').flatMap(b => b.rows.map(r => JSON.parse(r.original.Details).eventId as string)));
    const seed = ledger.filter(r => { const d = metadata.exceptional_ledger.parse(JSON.parse(r.original.Details)); return /^(67|77|687|787)/.test(d.account) || d.eventId !== null && events.has(d.eventId); });
    const candidates = new Set(seed.map(r => { const d = JSON.parse(r.original.Details); return d.eventId ?? 'unassigned:' + r.normalized!.key; }));
    const groups = new Map<string, typeof ledger>();
    for (const r of ledger) {
        if (!r.normalized || r.errors.length)
            throw Error('EXCEPTIONAL_GL_INVALID');
        const d = JSON.parse(r.original.Details), id = d.eventId ?? 'unassigned:' + r.normalized.key;
        if (!candidates.has(id))
            continue;
        groups.set(id, [...(groups.get(id) ?? []), r]);
    }
    return [...groups].map(([id, rows]) => ({ id, rowIds: rows.map(r => r.id), amount: money(rows.reduce((s, r) => s + (/^[67]/.test(String(JSON.parse(r.original.Details).account)) ? cents(r.normalized!.amount) : 0n), 0n)) })).sort((a, b) => a.id.localeCompare(b.id));
}
export function initialExceptionalDraft(facts: ExceptionalFact[]): ExceptionalDraft {
    const groups = new Map<string, ExceptionalFact[]>(), eventIds = new Set(facts.filter(f => f.type === 'exceptional_events').map(f => f.details.eventId));
    const candidates = new Set(facts.filter(f => f.type === 'exceptional_ledger' && (/^(67|77|687|787)/.test(String(f.details.account)) || eventIds.has(f.details.eventId))).map(f => String(f.details.eventId ?? 'unassigned:' + f.id)));
    for (const f of facts.filter(f => f.type === 'exceptional_ledger' && candidates.has(String(f.details.eventId ?? 'unassigned:' + f.id)))) {
        const id = String(f.details.eventId ?? 'unassigned:' + f.id);
        groups.set(id, [...(groups.get(id) ?? []), f]);
    }
    return { schemaVersion: 'exceptional-review-1', ruleRowId: null, documentation: '', entries: [...groups].map(([eventId, gl]) => ({ eventId, eventRowId: facts.find(f => f.type === 'exceptional_events' && f.details.eventId === eventId)?.rowId ?? null, ledgerIds: gl.map(f => f.rowId), supportIds: facts.filter(f => f.type === 'exceptional_support' && f.details.eventId === eventId).map(f => f.rowId), annexRowId: facts.find(f => f.type === 'exceptional_annex' && f.details.eventId === eventId)?.rowId ?? null, decision: null })) };
}
export function exceptionalRuleGate(rule: ExceptionalFact | null, facts: ExceptionalFact[], period: AccountingPeriod) {
    const issues: string[] = [];
    if (!rule)
        return { established: false, issues: ['Pack officiel applicable requis'], version: null, article: null };
    const d = metadata.exceptional_rules.parse(rule.details);
    const official = new URL(d.url);
    if (official.protocol !== 'https:' || !['anc.gouv.fr', 'www.anc.gouv.fr', 'legifrance.gouv.fr', 'www.legifrance.gouv.fr'].includes(official.hostname))
        issues.push('Source officielle ANC ou Journal officiel requise');
    if (d.profile !== 'pcg_general')
        issues.push('Référentiel sectoriel à établir');
    if (!d.modificationsReviewed || d.reviewedThrough < period.asOfDate)
        issues.push('Modifications applicables non vérifiées à la date de revue');
    if (d.from > period.startDate || d.to < period.startDate || d.from > d.to)
        issues.push('Version hors période d’ouverture');
    if (d.consultedOn > period.asOfDate || d.documentDate > period.asOfDate)
        issues.push('Source ou consultation postérieure à la revue');
    if (d.version === 'PCG-2024' && (period.startDate < '2024-01-01' || period.startDate >= '2025-01-01' || d.anticipation))
        issues.push('Pack historique 2024 incompatible');
    const publication = d.version === 'ANC-2026-03' ? '2026-09-03' : '2023-12-30', mandatory = d.version === 'ANC-2026-03' ? '2027-01-01' : '2025-01-01';
    if (d.version !== 'PCG-2024' && period.startDate < mandatory) {
        const adoption = facts.find(f => f.type === 'exceptional_support' && f.rowId === d.adoptionRowId && f.details.purpose === 'anticipation_adoption');
        if (!d.anticipation || !adoption || adoption.date < publication || adoption.date > period.asOfDate || period.closingDate < publication || d.version === 'ANC-2026-03' && period.startDate > publication)
            issues.push('Option d’anticipation et pièce d’adoption requises');
    }
    if (d.version === 'ANC-2022-06' && period.startDate >= '2027-01-01')
        issues.push('Modifications 2027 à établir');
    return { established: issues.length === 0, issues, version: d.version, article: d.version === 'PCG-2024' ? '946-67 / 947-77 (PCG au 01/01/2024)' : d.version === 'ANC-2022-06' ? '513-5 (ANC 2022-06)' : '531-5 (ANC 2026-03)' };
}
function bindings(draft: ExceptionalDraft, facts: ExceptionalFact[]) {
    const get = (id: string | null, type: ExceptionalFact['type']) => {
        if (!id)
            return null;
        const f = facts.find(f => f.rowId === id && f.type === type);
        if (!f)
            throw Error('EXCEPTIONAL_BINDING_INVALID');
        return f;
    };
    get(draft.ruleRowId, 'exceptional_rules');
    const used = new Set<string>();
    for (const e of draft.entries) {
        const event = get(e.eventRowId, 'exceptional_events');
        if (event && event.details.eventId !== e.eventId)
            throw Error('EXCEPTIONAL_EVENT_MISMATCH');
        for (const id of e.ledgerIds) {
            const f = get(id, 'exceptional_ledger')!;
            if (used.has(id))
                throw Error('EXCEPTIONAL_DUPLICATE_BINDING');
            used.add(id);
            if (String(f.details.eventId ?? 'unassigned:' + f.id) !== e.eventId)
                throw Error('EXCEPTIONAL_EVENT_MISMATCH');
        }
        for (const id of e.supportIds) {
            const f = get(id, 'exceptional_support')!;
            if (f.details.eventId !== e.eventId)
                throw Error('EXCEPTIONAL_CITATION_MISMATCH');
        }
        const annex = get(e.annexRowId, 'exceptional_annex');
        if (annex && annex.details.eventId !== e.eventId)
            throw Error('EXCEPTIONAL_CITATION_MISMATCH');
        if (e.decision) {
            if (!e.supportIds.includes(e.decision.citationRowId) || e.decision.lines.length !== e.ledgerIds.length || new Set(e.decision.lines.map(l => l.ledgerRowId)).size !== e.ledgerIds.length || e.decision.lines.some(l => !e.ledgerIds.includes(l.ledgerRowId)))
                throw Error('EXCEPTIONAL_DECISION_CITATION_INVALID');
        }
    }
    if (new Set(draft.entries.map(e => e.eventId)).size !== draft.entries.length)
        throw Error('EXCEPTIONAL_DUPLICATE_UNIT');
}
export function stampExceptionalWork(draft: ExceptionalDraft, batches: ImportBatch[], scope: WorkpaperScope, period: AccountingPeriod, runId: string, authorId: string, authoredAt: string) {
    const d = exceptionalDraftSchema.parse(draft), facts = exceptionalFacts(scope, period, batches, runId);
    bindings(d, facts);
    for (const e of d.entries)
        if (e.decision && (e.decision.date < period.startDate || e.decision.date > period.asOfDate))
            throw Error('EXCEPTIONAL_DECISION_DATE_INVALID');
    return exceptionalWorkSchema.parse({ ...d, authorId, authoredAt });
}
export function evaluateExceptional(scope: WorkpaperScope, period: AccountingPeriod, batches: ImportBatch[], runId: string, population: Population, selection: SelectionSet, work: ExceptionalWork) {
    assertExceptionalContext({ scope, period, purpose: scope.mode === 'real' ? 'real' : 'synthetic_technical', procedure: 'exceptional.review' });
    exceptionalWorkSchema.parse(work);
    for (const b of batches)
        if (b.document.documentType === 'exceptional_ledger' && b.report.rejectedRows)
            throw Error('EXCEPTIONAL_GL_INCOMPLETE');
    assertScope(scope, population.scope);
    assertScope(scope, selection.scope);
    const facts = exceptionalFacts(scope, period, batches, runId);
    bindings(work, facts);
    const get = (id: string | null) => facts.find(f => f.rowId === id) ?? null, rule = get(work.ruleRowId), gate = exceptionalRuleGate(rule, facts, period), selected = new Set(selection.selectedIds);
    const rows = work.entries.filter(e => selected.has(e.eventId)).map(e => {
        const event = get(e.eventRowId), support = e.supportIds.map(id => get(id)!), annex = get(e.annexRowId), d = event?.details, issues = [...gate.issues];
        if (!event)
            issues.push('Événement à documenter');
        if (!support.length)
            issues.push('Pièce client requise');
        if (!annex)
            issues.push('Annexe à documenter');
        const category = d?.category as typeof categories[number] | undefined;
        if (category === 'undocumented')
            issues.push('Catégorie non établie');
        const lines = e.ledgerIds.map(id => {
            const f = get(id)!, l = f.details;
            let proposed: typeof destinations[number] | null = null;
            let reason = 'Qualification bloquée';
            if (gate.established && event && support.length) {
                if (!/^[67]/.test(String(l.account))) {
                    proposed = 'hors_resultat';
                    reason = 'Écriture associée hors compte de résultat, conservée sans reclassification';
                }
                else if (category === 'income_tax' || l.nature === 'impots_sur_resultat') {
                    reason = 'Analyse spécifique des impôts et des modifications applicables requise';
                }
                else if (gate.version === 'PCG-2024') {
                    if (category === 'legacy_capital' || category === 'legacy_management') {
                        proposed = 'exceptionnel';
                        reason = 'Qualification historique documentée selon la nature (PCG 2024)';
                    }
                    else if (category === 'ordinary') {
                        proposed = l.nature as typeof destinations[number];
                        reason = 'Nature courante documentée';
                    }
                    else
                        reason = 'Analyse historique spécifique requise';
                }
                else if (category === 'error') {
                    proposed = d!.originalInEquity ? 'capitaux_propres' : 'exceptionnel';
                    reason = d!.originalInEquity ? 'Correction d’une écriture directement imputée aux capitaux propres' : 'Correction d’erreur documentée';
                }
                else if (category === 'pure_tax' || category === 'tax_method_change') {
                    if (d!.fiscalBasis && (category === 'pure_tax' && ['regulated_provision', 'derogatory_depreciation'].includes(String(d!.fiscalTreatment)) || category === 'tax_method_change' && d!.fiscalTreatment === 'tax_driven_method')) {
                        proposed = 'exceptionnel';
                        reason = 'Traitement fiscal prévu par le référentiel et documenté : ' + d!.fiscalBasis;
                    }
                    else
                        reason = 'Base et catégorie fiscales spécifiques prévues par le référentiel requises';
                }
                else if (category === 'ordinary') {
                    proposed = l.nature as typeof destinations[number];
                    reason = 'Activité normale et courante documentée';
                }
                else if (category === 'major_unusual') {
                    if (d!.major === 'unknown' || d!.unusual === 'unknown' || l.direct === 'unknown')
                        reason = 'Caractère majeur, inhabituel ou lien direct non établi';
                    else if (d!.major === 'no' || d!.unusual === 'no' || l.direct === 'no' || l.compensatesOperating) {
                        proposed = l.compensatesOperating ? 'exploitation' : l.nature as typeof destinations[number];
                        reason = l.compensatesOperating ? 'Compensation de charges d’exploitation' : l.direct === 'no' ? 'Charge supportée indépendamment de l’événement' : 'Caractère majeur et inhabituel non réuni';
                    }
                    else if (d!.priorEventId && d!.priorInitialQualification !== 'compatible')
                        reason = 'Qualification initiale incompatible ou non documentée sous ce référentiel';
                    else {
                        proposed = 'exceptionnel';
                        reason = 'Majeur et inhabituel, lien direct documenté';
                    }
                }
            }
            if (!proposed)
                issues.push(f.id + ' : ' + reason);
            const before = !/^[67]/.test(String(l.account)) ? 'hors_resultat' : /^(67|77|687|787)/.test(String(l.account)) ? 'exceptionnel' : l.nature as typeof destinations[number];
            return { id: f.rowId, account: String(l.account), piece: String(l.piece), date: f.date, label: String(l.label), amount: f.amount, before, proposed, reason };
        });
        if (e.decision && (!gate.established || lines.some(l => !l.proposed || e.decision!.lines.find(x => x.ledgerRowId === l.id)?.destination !== l.proposed)))
            issues.push('Décision incompatible avec la qualification documentée');
        if (annex && annex.details.formatChanged && !annex.details.publishedAccountsCited)
            issues.push('Comptes N−1 publiés et changement de présentation à citer');
        const unit = population.items.find(i => i.id === e.eventId);
        if (!unit || unit.rowIds.length !== e.ledgerIds.length || unit.rowIds.some(id => !e.ledgerIds.includes(id)))
            issues.push('Toutes les écritures associées à l’événement doivent être examinées');
        if (annex && String(annex.details.previousClose) >= period.startDate)
            issues.push('La période comparative doit précéder l’exercice');
        const decisionEligible = !!e.decision && issues.length === 0;
        return { id: e.eventId, label: String(d?.label ?? 'Écritures sans événement documenté'), category: category ?? 'undocumented', entry: e, event, support, annex, lines, issues: [...new Set(issues)], status: !gate.established ? 'rule_blocked' : issues.length ? 'evidence_required' : decisionEligible ? 'decided' : 'proposed', decisionEligible, comparison: annex ? { version: String(annex.details.previousVersion), start: String(annex.details.previousStart), close: String(annex.details.previousClose), destination: String(annex.details.previousDestination), amount: annex.details.previousPublishedAmount as import('@/lib/canonical-model/money').Money, formatChanged: annex.details.formatChanged, qualificationPreserved: true } : null };
    });
    const ledger = facts.filter(f => f.type === 'exceptional_ledger' && f.date >= period.startDate && f.date <= period.closingDate), sums = (after: boolean) => Object.fromEntries(destinations.map(dest => [dest, money(ledger.reduce((s, f) => { const line = rows.flatMap(r => r.lines).find(l => l.id === f.rowId), row = rows.find(r => r.lines.some(l => l.id === f.rowId)), before = line?.before ?? (!/^[67]/.test(String(f.details.account)) ? 'hors_resultat' : /^(67|77|687|787)/.test(String(f.details.account)) ? 'exceptionnel' : f.details.nature); const actual = after && row?.decisionEligible ? row.entry.decision!.lines.find(l => l.ledgerRowId === f.rowId)!.destination : before; return s + (actual === dest ? cents(f.amount) : 0n); }, 0n))]));
    const before = sums(false), after = sums(true), total = (v: typeof before) => Object.values(v).reduce((s, m) => s + cents(m), 0n), uncovered = population.items.filter(i => selected.has(i.id) && !rows.some(r => r.id === i.id)).map(i => i.id), outOfPeriod = rows.flatMap(r => r.lines.filter(l => l.date < period.startDate || l.date > period.closingDate)).map(l => l.id), issues = [...uncovered.map(i => 'Événement sélectionné non documenté : ' + i), ...outOfPeriod.map(i => 'Écriture hors exercice : ' + i)];
    const exceptions = rows.flatMap(r => r.issues.map((text, i) => ({ id: r.id + ':' + i, rowId: r.id, text, amount: { kind: 'unknown' as const, reason: text } })));
    return frozen({ schemaVersion: 'exceptional-result-1' as const, scope, period, runId, work, gate, rows, uncovered, issues, exceptions, evidence: facts.map(f => f.proof), facts, bridge: { before, after, deltas: Object.fromEntries(destinations.map(d => [d, money(cents(after[d]) - cents(before[d]))])), totalPreserved: total(before) === total(after), complete: gate.established && rows.every(r => r.decisionEligible) && !issues.length && selection.exclusions.length === 0 && selected.size === population.items.length && rows.length > 0, label: 'Présentation après décisions éligibles ; débits positifs, crédits négatifs ; GL inchangé' }, coverage: { unit: 'événement et écritures associées', selected: selected.size, denominator: population.items.length, ledgerRows: ledger.length, exclusions: selection.exclusions, outside6777: rows.filter(r => r.lines.every(l => !/^(67|77)/.test(l.account))).length }, inputHash: stableSha256({ scope, period, batches, work, population, selection }), outcome: !gate.established || rows.some(r => r.issues.length) || issues.length ? 'inconclusive' as const : rows.some(r => r.lines.some(l => l.before !== l.proposed)) ? 'exceptions_detected' as const : 'no_exception_detected' as const });
}
export type ExceptionalResult = ReturnType<typeof evaluateExceptional>;

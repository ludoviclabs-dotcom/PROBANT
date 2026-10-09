'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, FileText, BookOpen, X, Search, Check, Upload, RotateCcw } from 'lucide-react';
import { contentHash, periodId, type WorkpaperRun } from '@/lib/workpapers/model';
import type { ImportBatch } from '@/lib/workpapers/imports';
import { EXCEPTIONAL_MAPPING, EXCEPTIONAL_TYPES, EXCEPTIONAL_LABELS, destinations, initialExceptionalDraft, type ExceptionalDraft, type ExceptionalFact, type ExceptionalResult } from '@/lib/workpapers/exceptional-dossier';
import s from './ExceptionalWorkspace.module.css';
type View = {
    actorId: string;
    permissions: string[];
    runs: WorkpaperRun[];
    facts: Record<string, ExceptionalFact[]>;
    imports: ImportBatch[];
    sourceHeads: {
        document_type: string;
        import_id: string;
    }[];
    synthetic?: boolean;
};
type Initial = {
    demo: boolean;
    case: string;
    dossierId: string;
    periodId: string;
    id: string;
};
const categoryLabels: Record<string, string> = { ordinary: 'Activité courante', major_unusual: 'Événement majeur et inhabituel', pure_tax: 'Écriture purement fiscale', tax_method_change: 'Méthode et règles fiscales', error: 'Correction d’erreur', legacy_management: 'Gestion selon le PCG historique', legacy_capital: 'Capital selon le PCG historique', income_tax: 'Impôts sur le résultat — analyse spécifique', undocumented: 'Catégorie à documenter' };
const destinationLabels: Record<string, string> = { exploitation: 'Exploitation', financier: 'Financier', exceptionnel: 'Exceptionnel', capitaux_propres: 'Capitaux propres', impots_sur_resultat: 'Impôts sur le résultat', hors_resultat: 'Hors compte de résultat' };
const states: Record<string, string> = { rule_blocked: 'Référentiel bloqué', evidence_required: 'Pièce ou analyse requise', proposed: 'Proposition à décider', decided: 'Décision documentée', draft: 'Documentation', ready: 'Prêt à exécuter', executed: 'Exécuté', awaiting_review: 'En revue', approved: 'Approuvé', changes_requested: 'Modifications demandées', locked: 'Verrouillé', blocked: 'Bloqué', failed: 'Échec', superseded: 'Périmé' };
const errors: Record<string, string> = { EXCEPTIONAL_DURABLE_DISABLED: 'La connexion de mission est désactivée. La documentation synthétique locale reste accessible.', DEMONSTRATION_DISABLED: 'La démonstration locale doit être ouverte depuis son origine autorisée.', EXCEPTIONAL_QUALIFICATION_INCOMPLETE: 'La revue exige une décision documentée pour chaque événement, le référentiel et toutes les pièces nécessaires.', STALE_WORKPAPER_VERSION: 'Une autre version a été enregistrée. Votre brouillon est conservé ; comparez avec la version serveur.', EXCEPTIONAL_DECISION_CITATION_INVALID: 'Reliez la décision à une pièce client de cet événement et à chaque écriture.', PREPARATION_EDIT_FORBIDDEN: 'Cette version est en revue ou approuvée. Demandez une révision avant de modifier la qualification.' };
export function ExceptionalWorkspace({ initial }: {
    initial: Initial;
}) {
    const [view, setView] = useState<View | null>(null), [draft, setDraft] = useState<ExceptionalDraft | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState(''), [tab, setTab] = useState('events'), [selected, setSelected] = useState<string | null>(null), [query, setQuery] = useState(''), [showImports, setShowImports] = useState(false), [dossier, setDossier] = useState(initial.dossierId), [start, setStart] = useState('2025-01-01'), [close, setClose] = useState('2025-12-31'), [asOf, setAsOf] = useState('2026-10-09'), [type, setType] = useState<typeof EXCEPTIONAL_TYPES[number]>('exceptional_ledger'), [preview, setPreview] = useState<ImportBatch | null>(null), [note, setNote] = useState(''), [conflict, setConflict] = useState<WorkpaperRun | null>(null);
    const [target, setTarget] = useState(initial.id);
    const session = useRef(''), trigger = useRef<HTMLButtonElement | null>(null), panel = useRef<HTMLDivElement | null>(null), file = useRef<HTMLInputElement | null>(null);
    const run = view?.runs.find(r => r.id === target) ?? (view?.runs.length === 1 ? view.runs[0] : undefined), result = run?.result?.result as ExceptionalResult | undefined, facts = run ? view?.facts[run.id] ?? [] : [], current = result?.schemaVersion === 'exceptional-result-1' ? result : null, active = current?.rows.find(r => r.id === selected), period = { startDate: start, closingDate: close, asOfDate: asOf, currency: 'EUR' as const, validation: 'provisional' as const };
    const pid = initial.periodId || run?.scope.periodId || periodId(period), endpoint = (suffix = '') => initial.demo ? '/api/workpapers/resultat-exceptionnel/demo?case=' + encodeURIComponent(initial.case) + '&session=' + session.current : '/api/workpapers/resultat-exceptionnel' + suffix + '?dossierId=' + encodeURIComponent(dossier) + '&periodId=' + encodeURIComponent(pid);
    const content = useRef<HTMLDivElement | null>(null);
    async function csrfHeaders(): Promise<Record<string, string>> {
        if (initial.demo)
            return {};
        const response = await fetch('/api/auth/session', { cache: 'no-store' }), identity = await response.json();
        if (!response.ok || !identity.csrfToken)
            throw Error('Session requise : connectez-vous au dossier');
        return { 'x-probant-csrf': String(identity.csrfToken) };
    }
    async function call(url: string, init?: RequestInit) {
        const csrf = init?.method === 'POST' ? await csrfHeaders() : {};
        const headers = new Headers(init?.headers);
        for (const [key, value] of Object.entries(csrf))
            headers.set(key, value);
        const response = await fetch(url, { cache: 'no-store', ...init, headers }), data = await response.json();
        if (!response.ok) {
            if (data.current)
                setConflict(data.current);
            throw Error(errors[data.error] ?? data.error ?? 'Connexion indisponible');
        }
        return data;
    }
    function accept(data: View, keepDraft = false, nextTarget = target) {
        setView(data);
        const r = initial.demo ? data.runs[0] : data.runs.find(r => r.id === nextTarget) ?? (data.runs.length === 1 ? data.runs[0] : null);
        if (r)
            setTarget(r.id);
        if (!keepDraft)
            setDraft(r?.exceptionalWork ? { schemaVersion: 'exceptional-review-1', ruleRowId: r.exceptionalWork.ruleRowId, documentation: r.exceptionalWork.documentation, entries: r.exceptionalWork.entries } : r && data.facts[r.id]?.length ? initialExceptionalDraft(data.facts[r.id]) : null);
    }
    async function load(keepDraft = false, nextTarget = target) {
        setBusy(true);
        setError('');
        try {
            accept(await call(endpoint()), keepDraft, nextTarget);
            setStatus('Version serveur chargée');
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    useEffect(() => {
        session.current = crypto.randomUUID();
        if (initial.demo || initial.dossierId)
            void load(); /* Initial URL defines this workspace. */ // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!selected)
            return;
        panel.current?.focus();
        const background = content.current;
        background?.setAttribute('inert', '');
        const scroll = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelected(null);
                trigger.current?.focus();
            }
            if (e.key === 'Tab') {
                const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled)');
                if (!nodes?.length)
                    return;
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
                    e.preventDefault();
                    last.focus();
                }
                else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        window.addEventListener('keydown', key);
        return () => { window.removeEventListener('keydown', key); background?.removeAttribute('inert'); document.body.style.overflow = scroll; trigger.current?.focus(); };
    }, [selected]);
    async function mutate(action: string, extra: Record<string, unknown> = {}) {
        if (!run)
            return;
        setBusy(true);
        setError('');
        try {
            if (initial.demo) {
                accept(await call(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedVersion: run.version, ...extra }) }));
            }
            else {
                const command = action === 'save' ? 'configure_exceptional' : action === 'approve' || action === 'request_changes' ? 'review' : action;
                const payload = { command, id: run.id, expectedVersion: run.version, ...(command === 'review' ? { decision: action === 'approve' ? 'approved' : 'changes_requested', text: note, submittedHash: run.submittedHash, citation: extra.citation } : extra) };
                const saved = await call(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(payload) });
                await load(false, saved.run.id);
            }
            setStatus(action === 'save' ? 'Documentation et décisions enregistrées ; résultat recalculé' : action === 'approve' ? 'Revue enregistrée par un relecteur distinct' : 'Action enregistrée');
            setConflict(null);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function save() {
        if (!draft || !run)
            return;
        if (initial.demo)
            return mutate('save', { draft });
        setBusy(true);
        setError('');
        try {
            const response = await call(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ command: run.population ? 'configure_exceptional' : 'freeze_exceptional', id: run.id, expectedVersion: run.version, draft, ...(!run.population ? { importIds: view!.sourceHeads.map(h => h.import_id), criteria: 'Tous les événements candidats documentés du GL complet', excluded: [] } : {}) }) });
            await call(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ command: 'execute', id: run.id, expectedVersion: response.run.version }) });
            await load();
            setStatus('Version enregistrée et revue de classement exécutée');
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function create() {
        setBusy(true);
        setError('');
        try {
            const saved = await call(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ command: 'create_exceptional', period, instanceKey: crypto.randomUUID() }) });
            await load(false, saved.run.id);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function importFile() {
        if (!file.current?.files?.[0])
            return;
        setBusy(true);
        setError('');
        try {
            const form = new FormData();
            form.set('file', file.current.files[0]);
            form.set('mapping', JSON.stringify(EXCEPTIONAL_MAPPING));
            form.set('period', JSON.stringify(run?.period ?? period));
            form.set('documentType', type);
            const value = await call(endpoint('/imports'), { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: form });
            setPreview(value.batch ?? value.preview ?? value);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function approveImport() {
        if (!preview)
            return;
        setBusy(true);
        setError('');
        try {
            await call(endpoint('/imports'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ command: 'approve_import', importId: preview.id, previewHash: preview.previewHash, expectedSourceId: view?.sourceHeads.find(h => h.document_type === preview.document.documentType)?.import_id ?? null }) });
            setPreview(null);
            await load();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    function editEntry(id: string, fn: (e: ExceptionalDraft['entries'][number]) => ExceptionalDraft['entries'][number]) { setDraft(d => d ? { ...d, entries: d.entries.map(e => e.eventId === id ? fn(e) : e) } : d); setStatus('Brouillon modifié ; enregistrement et nouvelle exécution requis'); }
    function decision(row: NonNullable<typeof active>, dest: typeof destinations[number], lineId: string) { editEntry(row.id, e => { const d = e.decision ?? { reason: '', citationRowId: e.supportIds[0] ?? '', date: run!.period.asOfDate, lines: row.lines.map(l => ({ ledgerRowId: l.id, destination: l.proposed ?? l.before })) }; return { ...e, decision: { ...d, lines: d.lines.map(l => l.ledgerRowId === lineId ? { ...l, destination: dest } : l) } }; }); }
    const entry = draft?.entries.find(e => e.eventId === selected), editable = !!run && ['draft', 'ready', 'executed'].includes(run.state) && (initial.demo || view?.permissions.includes('prepare') && view.actorId === run.preparedBy && !view.sourceHeads.some(h => run.population && !run.importIds.includes(h.import_id))), all = current?.rows.filter(r => [r.label, r.id, ...r.lines.map(l => l.account)].join(' ').toLowerCase().includes(query.toLowerCase())) ?? [];
    const citation = facts.find(f => f.type === 'exceptional_support');
    async function submit() {
        if (!run || !note.trim())
            return;
        if (initial.demo)
            return mutate('submit', { note });
        if (!citation) {
            setError('Pièce client requise pour la conclusion');
            return;
        }
        setBusy(true);
        try {
            const c = await call(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ command: 'conclude', id: run.id, expectedVersion: run.version, text: note, citation: { documentVersionId: citation.documentVersionId, rowId: citation.rowId } }) });
            await call(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ command: 'submit', id: run.id, expectedVersion: c.run.version }) });
            await load();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    async function exportPack(format: 'html' | 'json') {
        if (!run)
            return;
        if (initial.demo) {
            window.open(endpoint() + '&format=' + format, '_blank', 'noopener');
            return;
        }
        setBusy(true);
        try {
            const response = await fetch(endpoint('/export'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...await csrfHeaders() }, body: JSON.stringify({ dossierId: dossier, periodId: pid, id: run.id, version: run.version, expectedHash: contentHash(run), format }) });
            if (!response.ok)
                throw Error('Export refusé : vérifiez la version et les sources');
            const url = URL.createObjectURL(await response.blob()), a = document.createElement('a');
            a.href = url;
            a.download = 'resultat-exceptionnel.' + format;
            a.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    return <main className={s.workspace}>
  <div ref={content}><header className={s.header}><a href="/dashboard/synthese" className={s.back}>PROBANT / Synthèse</a><div className={s.titleLine}><div><h1>Résultat exceptionnel</h1><p>Qualifier l’événement. Relier ses écritures. Décider sa présentation.</p></div><button onClick={() => setShowImports(v => !v)}><Upload size={18}/> Documenter les sources</button></div>
   <div className={s.context}><span>{run ? run.period.startDate + ' au ' + run.period.closingDate : 'Exercice à établir'}</span><span>{run ? 'Version ' + run.version + ' · ' + states[run.state] : 'Nouvelle revue'}</span><span>{initial.demo ? 'Exemple synthétique · sauvegarde locale volatile' : 'Dossier de mission · accès serveur'}</span></div>
  </header>
  <nav className={s.tabs} aria-label="Vues de la revue">{[['events', 'Événements'], ['bridge', 'Présentation'], ['sources', 'Sources et référentiel'], ['review', 'Revue']].map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setSelected(null); }}>{label}</button>)}</nav>
  <div aria-live="polite" className={s.status}>{busy ? 'Chargement de la version serveur…' : status}</div>{error && <p role="alert" className={s.error}>{error}<button onClick={() => void load(true)}>Recharger en conservant le brouillon</button></p>}
  {conflict && <div className={s.conflict}><h2>Comparer les versions</h2><p>Votre brouillon : {draft?.documentation || 'sans note'}.</p><p>Serveur, version {conflict.version} : {conflict.exceptionalWork?.documentation || 'sans note'}.</p><button onClick={() => void load(true)}>Garder mon brouillon et recharger</button><button onClick={() => void load()}>Adopter la version serveur</button></div>}
  {view && view.runs.length > 1 && <div className={s.choice} aria-label="Choisir une revue">{view.runs.map(r => <button key={r.id} aria-pressed={r.id === run?.id} onClick={() => accept(view, false, r.id)}>{r.id} · version {r.version}</button>)}</div>}
  {!run && <section className={s.empty}><h2>{view ? 'Aucun événement dans ce dossier' : 'Ouvrir une revue de classement'}</h2><p>Importez le GL complet et les packs documentaires pour une mission, ou explorez les événements synthétiques.</p><div className={s.actions}>{[['', 'Maintenance et événements'], ['unknown', 'Référentiel inconnu'], ['old', 'Exercice 2024'], ['complete', 'Dossier entièrement documenté']].map(([id, label]) => <a key={id} href={'/resultat-exceptionnel?demo=1&case=' + id}>{label}<ArrowUpRight size={16}/></a>)}</div>{!initial.demo && <div className={s.form}><label>Dossier<input value={dossier} onChange={e => setDossier(e.target.value)}/></label><label>Ouverture<input type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label>Clôture<input type="date" value={close} onChange={e => setClose(e.target.value)}/></label><label>Revue au<input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}/></label><button disabled={busy || !dossier} onClick={() => void create()}>Créer la revue</button><button disabled={busy || !dossier} onClick={() => void load()}>Ouvrir le dossier</button><a href={'/api/auth/login?returnTo=' + encodeURIComponent('/resultat-exceptionnel?dossierId=' + dossier + '&periodId=' + pid)}>Se connecter</a></div>}</section>}
  {showImports && <section className={s.imports}><div className={s.sectionHead}><h2>Sources importées manuellement</h2><button onClick={() => setShowImports(false)} aria-label="Fermer les imports"><X size={20}/></button></div><p>CSV / XLSX : Key, Amount, Date, Details. Débits positifs, crédits négatifs ; Details contient les faits transcrits et leurs références. Le GL complet est conservé.</p><div className={s.choice}>{EXCEPTIONAL_TYPES.map(t => <button key={t} aria-pressed={type === t} onClick={() => setType(t)}>{EXCEPTIONAL_LABELS[t]}</button>)}</div>{initial.demo ? <div className={s.actions}>{EXCEPTIONAL_TYPES.map(t => <a key={t} href={endpoint() + '&source=' + t}>Pack synthétique : {EXCEPTIONAL_LABELS[t]}</a>)}</div> : <div className={s.form}><label>Fichier local<input ref={file} type="file" accept=".csv,.xlsx"/></label><button disabled={busy} onClick={() => void importFile()}>Prévisualiser l’import</button>{preview && <><p>{preview.report.acceptedRows} lignes acceptées ; {preview.report.rejectedRows} rejetées ; {preview.report.blocking.join(' ; ')}</p><button disabled={busy || !preview.report.calculationAllowed} onClick={() => void approveImport()}>Approuver ce pack et sa version</button></>}</div>}</section>}
  {run && draft && tab === 'events' && <section className={s.content}>
   <div className={s.sectionHead}><div><h2>{current?.rows.length ?? 0} événements à examiner</h2><p>{current?.coverage.outside6777 ?? 0} candidats hors 67/77 · {current?.coverage.ledgerRows ?? 0} lignes du GL de l’exercice · {current?.gate.article ?? 'Référentiel non établi'}</p></div><label className={s.search}><Search size={16}/><span className={s.sr}>Rechercher un événement ou compte</span><input placeholder="Événement, compte…" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
   {current && !current.gate.established && <p className={s.warning}>Qualification bloquée : {current.gate.issues.join(' ; ')}. Vous pouvez continuer à documenter les événements.</p>}
   {current?.issues.map((issue, i) => <p className={s.warning} key={i}>{issue}</p>)}
   <div className={s.scroll}><table className={s.table}><caption>Classement par événement et écritures associées</caption><thead><tr><th>Événement</th><th>Compte actuel</th><th>Qualification proposée</th><th>Motif</th><th>Revue</th></tr></thead><tbody>{all.map(row => <tr key={row.id} data-selected={selected === row.id}><td><button className={s.eventButton} onClick={e => { trigger.current = e.currentTarget; setSelected(row.id); }}>{row.label}<ArrowUpRight size={16}/></button><span className={s.sub}>{row.id} · {row.lines.length} écriture(s)</span></td><td>{row.lines.map(l => <span key={l.id} className={s.sub}>{l.account} · {l.amount.amount} EUR</span>)}</td><td>{[...new Set(row.lines.map(l => l.proposed ? destinationLabels[l.proposed] : 'Bloquée'))].join(' / ')}</td><td>{row.lines[0]?.reason}</td><td><span className={row.issues.length ? s.issue : s.neutral}>{states[row.status]}</span></td></tr>)}</tbody></table></div>{!all.length && <p className={s.empty}>Aucun événement ne correspond à votre recherche.</p>}
   <label className={s.documentation}>Note de documentation<textarea disabled={!editable} value={draft.documentation} onChange={e => setDraft({ ...draft, documentation: e.target.value })} placeholder="Contexte, demandes de pièces, limites et prochaines actions…"/></label><button className={s.primary} disabled={busy || !editable} onClick={() => void save()}>Enregistrer et recalculer la revue<ArrowRight size={18}/></button>
  </section>}
  {tab === 'bridge' && current && <section className={s.content}><h2>Du GL à la présentation</h2><p>{current.bridge.label}. {current.bridge.complete ? 'Décisions documentées sur toute la population.' : 'Aperçu partiel : les événements sans décision éligible gardent leur classement actuel.'}</p><p className={s.sub}>{current.rows.filter(r => r.decisionEligible).length} événements décidés sur {current.coverage.denominator} · {current.coverage.exclusions.length} exclus · {current.issues.length} contrôle(s) de cohérence à résoudre</p><div className={s.bridgeHead}><span>Classement actuel</span><span>Après décisions</span></div>{destinations.map(d => <div className={s.bridgeRow} key={d}><div><span>{destinationLabels[d]}</span><strong>{current.bridge.before[d].amount} EUR</strong></div><div className={s.flow} key={current.inputHash + d}><ArrowRight size={22}/><span>{current.bridge.deltas[d].amount} EUR</span></div><div><span>{destinationLabels[d]}</span><strong>{current.bridge.after[d].amount} EUR</strong></div></div>)}<p className={s.warning}>Total signé {current.bridge.totalPreserved ? 'préservé' : 'incohérent'} ; aucune écriture du GL modifiée. Revue : {states[run?.state ?? 'draft']}.</p><h2>Comparer les exercices</h2>{current.rows.map(r => <div className={s.timeline} key={r.id}><span>{r.label}</span><div><b>{r.comparison?.start?.slice(0, 4) ?? 'N−1'}</b><span>{r.comparison?.version ?? 'Source requise'}</span><strong>{r.comparison?.amount?.amount ?? 'Inconnu'} EUR</strong></div><ArrowRight size={20}/><div><b>{run?.period.startDate.slice(0, 4)}</b><span>{current.gate.version ?? 'Référentiel inconnu'}</span><span>{r.comparison?.formatChanged ? 'Changement de présentation visible · qualification N−1 conservée' : 'Présentation historique conservée'}</span></div></div>)}</section>}
  {tab === 'sources' && draft && <section className={s.content}><h2>Établir le référentiel applicable</h2><p>L’ouverture de l’exercice, les modifications et les options d’anticipation déterminent le pack. Une numérotation sans version ne suffit pas.</p><div className={s.choice}><button aria-pressed={!draft.ruleRowId} disabled={!editable} onClick={() => setDraft({ ...draft, ruleRowId: null })}>À établir</button>{facts.filter(f => f.type === 'exceptional_rules').map(f => <button key={f.rowId} disabled={!editable} aria-pressed={draft.ruleRowId === f.rowId} onClick={() => setDraft({ ...draft, ruleRowId: f.rowId })}>{String(f.details.version)} · {String(f.details.from)} au {String(f.details.to)}</button>)}</div>{facts.filter(f => f.type === 'exceptional_rules').map(f => <article className={s.sourceOfficial} key={f.rowId}><BookOpen size={24}/><div><h3>{String(f.details.title)}</h3><p>{String(f.details.organization)} · {String(f.details.section)} · {String(f.details.version)}</p><p>Pack {String(f.details.pack)} · document {String(f.details.documentDate)} · page {String(f.details.page ?? 'non disponible')} · consultation {String(f.details.consultedOn)}</p><p>Anticipation : {f.details.anticipation ? 'déclarée, pièce d’adoption à contrôler' : 'non adoptée'}. Modifications : {f.details.modificationsReviewed ? 'revues jusqu’au ' + f.details.reviewedThrough : 'à vérifier'}.</p><a href={String(f.details.url)} target="_blank" rel="noreferrer">Consulter la source officielle<ArrowUpRight size={14}/></a><p className={s.sub}>{f.fileName} · ligne {f.line} · version locale {f.version.slice(0, 12)}</p></div></article>)}<button className={s.primary} disabled={busy || !editable} onClick={() => void save()}>Enregistrer le référentiel et recalculer</button><h2>Pièces client et annexe</h2>{facts.filter(f => f.type === 'exceptional_support' || f.type === 'exceptional_annex').map(f => <article className={s.sourceClient} key={f.rowId}><FileText size={20}/><div><h3>{String(f.details.title)}</h3><p>{String(f.details.extract)}</p><p className={s.sub}>Événement {String(f.details.eventId)} · pack {String(f.details.pack)} · {String(f.details.documentDate)} · page {String(f.details.page ?? 'non disponible')} · ligne {f.line}</p></div></article>)}</section>}
  {tab === 'review' && run && <section className={s.content}><h2>Revue de la version {run.version}</h2><p>{states[run.state]} · préparateur {run.preparedBy} · {run.approval ? 'relecteur ' + run.approval.actorId : 'relecteur distinct requis'}</p><p>{current?.bridge.complete ? 'Les décisions sont documentées ; la revue distincte reste nécessaire.' : 'Qualification incomplète : une note ne remplace pas le référentiel ni les pièces.'}</p><label>Conclusion ou note de revue<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Justifiez la conclusion et citez les éléments du dossier…"/></label><div className={s.actions}><button disabled={busy || !editable || run.state !== 'executed' || !note.trim()} onClick={() => void submit()}>Soumettre à la revue</button><button disabled={busy || run.state !== 'awaiting_review' || !note.trim() || !initial.demo && (!view?.permissions.includes('review') || view.actorId === run.preparedBy)} onClick={() => void mutate('approve', { note, submittedHash: run.submittedHash, ...(!initial.demo && citation ? { citation: { documentVersionId: citation.documentVersionId, rowId: citation.rowId } } : {}) })}><Check size={18}/> {initial.demo ? 'Simuler une revue distincte' : 'Approuver la revue'}</button><button disabled={busy || run.state !== 'awaiting_review' || !note.trim() || !initial.demo && (!view?.permissions.includes('review') || view.actorId === run.preparedBy)} onClick={() => void mutate('request_changes', { note, submittedHash: run.submittedHash, ...(!initial.demo && citation ? { citation: { documentVersionId: citation.documentVersionId, rowId: citation.rowId } } : {}) })}>Demander des modifications</button><button disabled={busy || (initial.demo ? !['changes_requested', 'locked', 'blocked', 'failed'].includes(run.state) : run.state === 'superseded' || !view?.permissions.includes('prepare'))} onClick={() => void mutate('revise')}><RotateCcw size={16}/> Nouvelle révision</button>{!initial.demo && <button disabled={busy || run.state !== 'approved' || !view?.permissions.includes('review')} onClick={() => void mutate('lock')}>Verrouiller cette version</button>}</div><div className={s.actions}><button disabled={busy || !current} onClick={() => void exportPack('html')}>Dossier imprimable</button><button disabled={busy || !current} onClick={() => void exportPack('json')}>Diagnostic JSON</button></div><ol className={s.history}>{run.events.map(e => <li key={e.id}><time>{e.at}</time><span>{e.action} · {e.actorId} · version {e.version}</span></li>)}</ol></section>}
  </div>{active && entry && <div className={s.scrim} onClick={() => { setSelected(null); trigger.current?.focus(); }}><div className={s.panel} ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="event-title" onClick={e => e.stopPropagation()}><div className={s.sectionHead}><h2 id="event-title">{active.label}</h2><button aria-label="Fermer l’événement" onClick={() => { setSelected(null); trigger.current?.focus(); }}><X size={22}/></button></div><p className={s.sub}>{states[active.status]} · {categoryLabels[active.category]}</p>{active.issues.map((x, i) => <p className={s.warning} key={i}>{x}</p>)}
    <h3>Écritures et qualification</h3>{active.lines.map(l => <div className={s.lineReview} key={l.id}><p>{l.piece} · {l.account} · {l.amount.amount} EUR · {l.date}</p><p>{l.reason}</p>{l.before === 'hors_resultat' ? <p className={s.sub}>Contrepartie conservée hors résultat dans la décision de l’événement.</p> : <div className={s.choice}>{destinations.filter(d => d !== 'hors_resultat').map(d => <button key={d} disabled={!editable || busy} aria-pressed={entry.decision?.lines.find(x => x.ledgerRowId === l.id)?.destination === d} onClick={() => decision(active, d, l.id)}>{destinationLabels[d]}</button>)}</div>}</div>)}
    <h3>Source officielle</h3><div className={s.sourceOfficial}><BookOpen size={22}/><div>{current?.gate.article ?? 'Référentiel à établir'}<p>{facts.find(f => f.rowId === draft?.ruleRowId)?.details.title as string ?? 'Pack officiel requis'}</p></div></div><h3>Pièce client</h3>{active.support.length ? active.support.map(f => <button className={s.sourceClient} key={f.rowId} disabled={!editable} aria-pressed={entry.decision?.citationRowId === f.rowId} onClick={() => editEntry(active.id, e => ({ ...e, decision: { ...(e.decision ?? { reason: '', date: run!.period.asOfDate, lines: active.lines.map(l => ({ ledgerRowId: l.id, destination: l.proposed ?? l.before })) }), citationRowId: f.rowId } }))}><FileText size={22}/><span><b>{String(f.details.title)}</b><span className={s.sub}>{String(f.details.extract)}</span><span className={s.sub}>Pack {String(f.details.pack)} · {String(f.details.documentDate)} · page {String(f.details.page ?? 'non disponible')} · ligne {f.line}</span></span></button>) : <p>Pièce requise avant toute décision finale.</p>}
    <label>Motif de la décision<textarea disabled={!editable} value={entry.decision?.reason ?? ''} onChange={e => { const value = e.currentTarget.value; editEntry(active.id, v => ({ ...v, decision: { ...(v.decision ?? { citationRowId: v.supportIds[0] ?? '', date: run!.period.asOfDate, lines: active.lines.map(l => ({ ledgerRowId: l.id, destination: l.proposed ?? l.before })) }), reason: value } })); }}/></label><div className={s.actions}><button className={s.primary} disabled={busy || !editable || !entry.decision?.reason.trim() || !entry.decision.citationRowId} onClick={() => void save()}>Enregistrer la décision<ArrowRight size={18}/></button>{entry.decision && <button disabled={!editable} onClick={() => editEntry(active.id, e => ({ ...e, decision: null }))}>Retirer la décision du brouillon</button>}</div><p className={s.sub}>La proposition vient des faits documentés. Une décision incompatible reste bloquée ; le GL ne change pas.</p>
   </div></div>}
 </main>;
}

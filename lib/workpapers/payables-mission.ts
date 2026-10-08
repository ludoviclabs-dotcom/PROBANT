import { stableSha256 } from "@/lib/synthesis/canonical";
import { validateRun, assertScope, frozen, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { ImportBatch } from "./imports";
import { PAYABLE_PROCEDURES, PAYABLE_LABELS, type PayablesResult, STATUS_LABELS } from "./payables-investigation";
import { PAYABLE_OBJECTIVES, PAYABLE_REQUIRED } from "./payables-adapter";
import { uniqueEconomicExposures } from "./cutoff";
import type { MissionSelection } from "./client-mission";
export const PAYABLE_PROGRAM = { id: "payables.investigation", version: "1.0.0", procedures: PAYABLE_PROCEDURES.map(id => ({ id, label: PAYABLE_OBJECTIVES[id], controls: id === "payables.frame" ? ["GL / auxiliaire", "Auxiliaire / balance âgée"] : id === "payables.purchases" ? ["Écriture / facture / prestation", "Rattachement à la clôture"] : ["Paiement / allocation / facture", "Rattachement et FNP existante"] })) };
export function payableHref(scope: WorkpaperScope, run: Pick<WorkpaperRun, "id" | "version">, filter = "all", eventId?: string) { const q = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, id: run.id, version: String(run.version), filter }); if (eventId)
    q.set("event", eventId); return "/payables?" + q; }
export function buildPayablesMission(scope: WorkpaperScope, versions: WorkpaperRun[], imports: ImportBatch[], heads: {
    document_type: string;
    import_id: string;
}[], selection: MissionSelection = {}) {
    const accepted = versions.filter(v => PAYABLE_PROCEDURES.includes(v.template.id as typeof PAYABLE_PROCEDURES[number]));
    accepted.forEach(v => { validateRun(v); assertScope(scope, v.scope); });
    imports.forEach(b => assertScope(scope, b.scope));
    const latest = new Map<string, WorkpaperRun>();
    accepted.forEach(v => { const old = latest.get(v.rootId); if (!old || v.revision > old.revision || v.revision === old.revision && v.version > old.version)
        latest.set(v.rootId, v); });
    const selected = selection.id ? accepted.filter(v=>v.id===selection.id&&(selection.version===undefined||v.version===selection.version)).sort((a,b)=>b.version-a.version)[0] : selection.rootId ? latest.get(selection.rootId) : [...latest.values()].find(v => v.template.id === "payables.purchases") ?? [...latest.values()][0];
    if ((selection.id || selection.rootId) && !selected)
        throw new Error("WORKPAPER_VERSION_NOT_FOUND");
    const procedures = PAYABLE_PROGRAM.procedures.map(def => {
        const candidates = [...latest.values()].filter(v => v.template.id === def.id);
        const run = selected?.template.id === def.id ? selected : candidates.length === 1 ? candidates[0] : null;
        const current = run ? latest.get(run.rootId) : null, staleReasons: string[] = [];
        if (run && current && (run.id !== current.id || run.version !== current.version))
            staleReasons.push("Une révision/version plus récente existe.");
        if (run?.importIds.some(id => !heads.some(h => h.import_id === id)))
            staleReasons.push("Une source approuvée a été remplacée.");
        const result = run?.result?.execution === "completed" ? run.result.result as PayablesResult : null;
        if (result?.schemaVersion !== undefined && result.schemaVersion !== "payables-result-1")
            throw new Error("PAYABLE_RESULT_VERSION_INVALID");
        return { id: def.id, label: def.label, plannedControls: def.controls, run: run ?? null, result, stale: staleReasons.length > 0, staleReasons, ambiguous: candidates.length > 1 && !run, href: run ? payableHref(scope, run) : "/payables?"+new URLSearchParams({dossierId:scope.dossierId,periodId:scope.periodId,procedure:def.id}), controls: result?.controls ?? def.controls.map(label => ({ label, numerator: 0, denominator: null, unit: "population à définir", exclusions: [] })), coverage: result?.coverage ?? { numerator: 0, denominator: run?.population?.items.length ?? null, selected: run?.selection?.selectedIds.length ?? 0, exclusions: run?.selection?.exclusions ?? [], unit: run?.population?.unit ?? "row" }, beforeReview: run ? accepted.filter(v => v.id === run.id && v.state === "awaiting_review" && v.submittedHash === run.submittedHash).sort((a, b) => b.version - a.version)[0] ?? null : null, reviewLabel: run?.approval ? "Travail revu — sans opinion sur les comptes" : run?.state === "awaiting_review" ? "Revue attendue" : "Non revu" };
    });
    const queue = procedures.flatMap(p => {
        if (!p.run)
            return [{ id: p.id + ":missing", priority: 0, category: "blocked", label: p.ambiguous ? "Choisir une feuille de la procédure" : p.label + " à préparer", detail: "Procédure prévue par le programme", href: p.href }];
        const common = { href: payableHref(scope, p.run, p.stale ? "stale" : "exceptions") };
        return [...(p.stale ? [{ ...common, id: p.run.id + ":stale", priority: 0, category: "stale", label: "Travail périmé", detail: p.staleReasons.join(" ") }] : []), ...p.run.notes.filter(n => !n.resolution).map(n => ({ ...common, id: n.id, priority: n.blocking ? 1 : 2, category: n.kind === "missing_evidence" ? "evidence" : "exceptions", label: n.text, detail: "Version " + p.run!.version + " ; auteur " + n.authorId })), ...(!p.result ? [{ ...common, id: p.run.id + ":execute", priority: 1, category: "blocked", label: "Population/calcul à compléter", detail: p.label }] : []), ...(p.run.state === "awaiting_review" ? [{ ...common, id: p.run.id + ":review", priority: 3, category: "review", label: "Revue par une autre identité attendue", detail: p.label }] : [])];
    }).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const events = new Map<string, {
        eventId: string;
        flow: "sale" | "purchase";
        invoiceId: string;
        party: string;
        observations: {
            procedureId: string;
            runId: string;
            version: number;
            stale: boolean;
            cutoff: PayablesResult["events"][number]["cutoff"];
            status: string;
            href: string;
        }[];
    }>();
    for (const p of procedures) {
        if (!p.result || !p.run)
            continue;
        for (const e of p.result.events) {
            const id = e.cutoff.economicEventId;
            let group = events.get(id);
            if (!group) {
                group = { eventId: id, flow: e.flow, invoiceId: e.invoiceId, party: e.party, observations: [] };
                events.set(id, group);
            }
            group.observations.push({ procedureId: p.id, runId: p.run.id, version: p.run.version, stale: p.stale, cutoff: e.cutoff, status: STATUS_LABELS[p.result.rows.find(r => r.eventId === id)?.status ?? "inconclusive"], href: payableHref(scope, p.run, "all", id) });
        }
    }
    const candidates = procedures.filter(p => !p.stale && p.result && p.run).flatMap(p => p.result!.rows.filter(r => r.status === "omission_candidate" && r.cutoff).map(r => ({ procedureId: p.id, result: r.cutoff! })));
    const grouped = uniqueEconomicExposures(candidates).map(e => { const conventions = procedures.filter(p => e.procedureIds.includes(p.id) && p.result).map(p => stableSha256({ id: p.result!.work.method.id, version: p.result!.work.method.version, source: p.result!.work.method.source })); return new Set(conventions).size > 1 ? { ...e, amount: { kind: "unknown" as const, reason: "Conventions de méthode divergentes : aucun regroupement monétaire avant revue" } } : e; });
    const sourceIds = new Set(procedures.flatMap(p => p.run?.importIds ?? []));
    const sources = imports.filter(b => sourceIds.has(b.id)).map(b => ({ id: b.document.id, importId: b.id, type: b.document.documentType, label: PAYABLE_LABELS[b.document.documentType], fileName: b.document.fileName, sha256: b.document.byteHash, parserVersion: b.document.parserVersion, mappingHash: b.mappingHash, mappingVersion: b.mapping.version, approvedBy: b.approval?.actorId ?? null, approvedAt: b.approval?.at ?? null, current: heads.some(h => h.import_id === b.id), binaryInPackage: false, locators: b.rows.map(r => ({ rowId: r.id, locator: r.locator })) }));
    const expected = [...new Set(procedures.flatMap(p => PAYABLE_REQUIRED[p.id]))].filter(t => !sources.some(s => s.type === t));
    const body = { schemaVersion: "payables-mission-1", scope, program: PAYABLE_PROGRAM, procedures, selectedRunId: selected?.id ?? null, selectedVersion: selected?.version ?? null, queue, versionIndex: accepted.map(v => ({ id: v.id, rootId: v.rootId, version: v.version, revision: v.revision, state: v.state, procedureId: v.template.id, actorId: v.events.at(-1)?.actorId ?? v.preparedBy })), events: [...events.values()], exposures: grouped, amountConvention: "Un seul montant résiduel HT par événement économique ; EUR ; aucune addition HT/TVA/TTC ni multiplication par les procédures.", sources, missingSources: expected.map(type => ({ type, label: PAYABLE_LABELS[type], binaryInPackage: false })), counters: { planned: PAYABLE_PROGRAM.procedures.length, plannedControls: PAYABLE_PROGRAM.procedures.reduce((n, p) => n + p.controls.length, 0), executed: procedures.filter(p => p.result && !p.stale).length, approved: procedures.filter(p => p.run?.state === "locked" && !p.stale).length }, limitations: ["Procédures de mission distinctes des constats historiques DEMO SA et de l’atelier synthétique.", "Paiements ultérieurs testés ≠ exhaustivité des passifs.", "Résiduel TTC du paiement ≠ passif HT potentiellement omis.", "Les pièces binaires sont absentes du paquet ; téléchargements soumis aux permissions du dossier.", "La revue n’efface pas les exceptions et ne produit aucune opinion automatique."] };
    return frozen({ ...body, hash: stableSha256(body) });
}
export type PayablesMission = ReturnType<typeof buildPayablesMission>;

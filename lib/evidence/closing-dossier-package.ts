import { canonicalJson, stableSha256 } from "@/lib/synthesis/canonical";
import { effectStageLabel, eventSourceText, type DossierProjection } from "@/lib/workpapers/closing-projection";
import { eventDenominatorText } from "@/lib/workpapers/closing-events";
import { formatCents } from "@/lib/workpapers/stock-contract";
import type { JournalLine } from "@/lib/workpapers/closing-evaluate";
import { artifact } from "./package";
import { buildCsv } from "./csv";
import { buildPdfFromAccessibleHtml } from "./pdf";
import type { EvidenceManifest } from "./types";

/**
 * C14 — export of the professional file: the single projection, rendered as canonical JSON, accessible HTML, a PDF derived from it and CSV tables.
 * Every count comes from `projection.denominators`, the same object the matrix and the cockpit read. No opinion, no score, no comparison to a threshold.
 */
export const CLOSING_EXPORT_FORMATS = ["json", "html", "pdf", "procedures_csv", "sheets_csv", "findings_csv", "journal_csv", "manifest"] as const;
export type ClosingExportFormat = typeof CLOSING_EXPORT_FORMATS[number];
const esc = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function table(title: string, headings: string[], rows: unknown[][]) {
  return `<table><caption>${esc(title)}</caption><thead><tr>${headings.map(h => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headings.length}">Aucun élément.</td></tr>`}</tbody></table>`;
}
const centsText = (value: number | null) => formatCents(value === null ? null : String(value));
const SENS = { increase: "hausse", decrease: "baisse" } as const;
const sheetText = (s: { label: string; rootId: string; runId: string; revision: number; version: number; state: string; contentHash: string; period: { startDate: string; closingDate: string }; populationSize: number | null }) =>
  s.label + " · racine " + s.rootId + " · " + s.runId + " r" + s.revision + " v" + s.version + " · " + s.state + " · période " + s.period.startDate + " → " + s.period.closingDate + " · population " + (s.populationSize ?? "non figée") + " · empreinte " + s.contentHash.slice(0, 16);

export function closingDossierHtml(p: DossierProjection) {
  const d = p.denominators;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PROBANT — Dossier et clôture</title><style>
body{font:15px/1.55 system-ui,sans-serif;color:#18283c;background:white;margin:2rem auto;max-width:1120px;padding:0 1rem}h1{font-size:26px}h2{font-size:20px;margin-top:2rem}h3{font-size:16px}p,td,th,li{overflow-wrap:anywhere;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:1rem 0;table-layout:fixed}caption{text-align:left;font-weight:700;margin:.5rem 0}th,td{text-align:left;vertical-align:top;border:1px solid #b5bfcb;padding:7px;font-size:12px}th{background:#edf1f6}thead{display:table-header-group}tr{break-inside:avoid}header{border-bottom:2px solid #344b67}.notice{border-left:4px solid #ab7015;padding:1rem;background:#fff7e4}@page{size:A4 landscape;margin:16mm}@media print{body{max-width:none;margin:0;padding:0;font-size:11px}h2{break-after:avoid}th{background:#eee}table{font-size:10px}.notice{background:none}}
</style></head><body><header><p>Dossier professionnel · projection unique du journal et des feuilles observées</p><h1>${esc(p.entity ?? "Dossier non ouvert")} — synthèse des travaux et clôture</h1>
<p>Exercice ${esc(p.period ? p.period.startDate + " → " + p.period.closingDate + " · date de revue " + p.period.asOfDate : "non déclaré")} · Dossier ${esc(p.dossierId)} · Période ${esc(p.periodId)}</p>
<p>Journal #${p.journal.seq} · tête ${esc(p.journal.headHash)} · projection ${esc(p.hash)} · état établi au ${esc(p.stateAsOf)}</p><p class="notice">${esc(p.noOpinion)}</p></header>
<section><h2>Dénominateurs</h2><p>Procédures : ${d.procedures.applicable} applicables sur ${d.procedures.declared} déclarées (${d.procedures.notApplicable} non applicable(s) motivée(s) exclue(s)) ; ${d.procedures.done} revue(s) par une autre personne ; ${d.procedures.donePersonal} relue(s), relecture personnelle incluse. Couples risque × assertion : ${d.pairs.reviewed} / ${d.pairs.counted} (${d.pairs.excludedNotApplicable} exclu(s)). Feuilles : ${d.sheets.retained} retenue(s), ${d.sheets.toAssign} à rattacher, ${d.sheets.excluded} écartée(s), ${d.sheets.outsideProgram} hors programme, ${d.sheets.previousRevisions} révision(s) antérieure(s).</p><p>${esc(eventDenominatorText(d.events, p.findings.events.reason))}.</p>
${table("Indicateurs (numérateur / dénominateur)", ["Indicateur", "Valeur", "Unité", "Exclusions et note"], p.indicators.map(i => [i.label, i.numerator + " / " + i.denominator, i.unit, [i.excluded ? "Exclu : " + i.excluded : "", i.note ?? ""].filter(Boolean).join(" ")]))}</section>
<section><h2>Parcours par cycle</h2>${p.cycles.map(c => `<h3>${esc(c.label)}</h3>${table("Risques et couples — " + c.label, ["Risque", "Évaluation", "Couples"], c.risks.map(r => [r.riskId + " · " + r.label, r.level ?? "Non évalué", r.pairs.map(x => x.assertion + " : " + x.status).join(" ; ")]))}
${table("Procédures — " + c.label, ["Procédure", "État et revue", "Feuille rattachée ou travaux", "Résultats et pièces", "Constats", "Reste à faire et limites"], c.rows.map(r => [
    r.procedureId + " · " + r.label + " (" + r.natureLabel + ", " + r.owner + ")", r.statusLabel + (r.reviewBasis ? " · " + r.reviewBasis : "") + (r.notApplicable ? " · motif : " + r.notApplicable.reason : ""),
    r.sheet ? sheetText(r.sheet) + " · périmètre : " + (r.sheet.perimeter ?? (r.sheet.binding === "implicite" ? "rattachement implicite (feuille unique)" : "—")) + (r.sheet.drift ? " · rattachement à confirmer (" + r.sheet.drift + ")" : "") : r.manual ? r.manual.records + " travail(aux) · population " + (r.manual.population ?? "non définie") + (r.manual.conclusion ? " · conclusion " + (r.manual.conclusion.stale ? "périmée" : "du " + r.manual.conclusion.at) : "") + (r.manual.review ? " · " + r.manual.review.basis + " (" + r.manual.review.by + ")" : "") : "Aucune feuille rattachée",
    r.sheet ? (r.sheet.result ?? "non exécutée") + (r.sheet.inconclusive ? " — non concluant" : "") + (r.sheet.sourcesCurrent === false ? " · source remplacée" : "") : r.manual ? "sans exception " + r.manual.results.sans_exception + " · exceptions " + r.manual.results.exceptions + " · non concluant " + r.manual.results.non_concluant + " · " + r.evidence.pieces + " pièce(s)" + (r.evidence.representationOnly ? " · déclaration seule" : "") : "—",
    [...r.misstatements, ...r.contradictions, ...r.openPoints].join(", ") || "—", [...r.remaining, ...r.limits].join(" ; ") || "—"]))}
${table("Autres feuilles listées — " + c.label, ["Feuille", "Affectation", "Motif", "Révisions antérieures"], c.otherSheets.map(s => [sheetText(s), s.assignmentLabel, s.exclusion?.reason ?? "—", s.previousRevisions.map(x => x.runId + " r" + x.revision + " " + x.state).join(" ; ") || "—"]))}`).join("")}</section>
<section><h2>Constats : corrections, preuves nouvelles et anomalies résiduelles</h2><p>Corrigé (connu) ${esc(p.findings.totals.knownCorrected.amount)} EUR ; non corrigé (connu) ${esc(p.findings.totals.knownUncorrected.amount)} EUR ; résiduel connu ${esc(p.findings.totals.knownResidual.amount)} EUR ; ${p.findings.totals.unknownUncorrected} montant(s) inconnu(s) non corrigé(s), jamais comptés pour zéro.</p>
${table("Anomalies", ["Anomalie", "Montant relevé", "Étape", "Corrigé", "Résiduel", "Preuve nouvelle / pièces d’origine"], p.findings.misstatements.map(m => [m.id + " · " + m.description + (m.procedureId ? " (" + m.procedureId + ")" : ""), m.amount, m.stageLabel + (m.assessedBy ? " · " + m.assessedBy : ""), m.corrected ?? "—", m.residual ?? "—", (m.freshEvidence.join(", ") || "—") + " / " + m.originalEvidence.join(", ")]))}
${table("Contradictions", ["Contradiction", "État", "Procédures", "Déclaration de la direction"], p.findings.contradictions.map(c => [c.id + " · " + c.description, c.status, c.procedureIds.join(", ") || "—", (c.representationSide ? "Une pièce opposée est une déclaration de la direction ; " : "") + (c.laterRepresentations.length ? "déclaration(s) reçue(s) depuis : " + c.laterRepresentations.join(", ") + " — elle(s) ne clôt(urent) pas la contradiction" : "aucune déclaration postérieure")]))}
${table("Limites d’étendue", ["Limite", "Cycle", "Appréciation"], p.findings.limitations.map(l => [l.id + " · " + l.description, l.cycle, l.assessed ? l.assessedBy : "À apprécier"]))}</section>
<section><h2>Effets des événements transversaux (carte C11, projection C05)</h2><p>${esc(eventDenominatorText(d.events, p.findings.events.reason))}${p.findings.events.map ? " · carte " + esc(p.findings.events.map.version) + ", empreinte " + esc(p.findings.events.map.hash) : ""}.</p><p class="notice">${esc(p.findings.events.notice)}</p>
${table("Pont C05 par poste et sens (jamais additionnés entre eux ni aux anomalies)", ["Poste · sens", "En attente", "Proposé", "Corrigé", "Résiduel", "Écarté", "Indéterminé (hors agrégat)"], p.findings.events.stages.map(st => ["Résultat · " + SENS[st.direction], centsText(st.pendingCents), centsText(st.proposedCents), centsText(st.correctedCents), centsText(st.residualCents), centsText(st.dismissedCents), centsText(st.undeterminedCents)]))}
${table("Effets comptés une fois", ["Événement", "Compté une fois", "Étape C05", "En attente / corrigé / résiduel", "Feuilles sources (version exacte, lignée du dossier)"], p.findings.events.effects.map(x => [x.invoiceId + " · " + (x.flow === "sale" ? "vente" : "achat") + " · " + x.party + " · " + (x.candidate ?? "—") + (x.account ? " · " + x.account : "") + (x.inProgramme ? "" : " · observé hors programme du dossier"),
    (x.countedCents !== null ? centsText(x.countedCents) : "Inconnu") + " · " + SENS[x.direction] + " du résultat · " + x.contributors + " observation(s)", effectStageLabel(x), x.bridge ? centsText(x.bridge.pendingCents) + " / " + centsText(x.bridge.correctedCents) + " / " + centsText(x.bridge.residualCents) : "—", x.sources.map(eventSourceText).join(" ; ")]))}
${table("Candidats sans effet compté", ["Événement", "État", "Motif", "Feuilles sources"], p.findings.events.withoutEffect.map(x => [x.invoiceId + " · " + (x.flow === "sale" ? "vente" : "achat") + " · " + x.party + " · " + (x.candidates.join(", ") || "—"), x.accounting, x.reason, x.sources.map(eventSourceText).join(" ; ")]))}</section>
<section><h2>Dates utiles et seuils documentés</h2>${table("Dates", ["Date", "Libellé", "Origine", "Auteur / détail"], p.dates.map(x => [x.date, x.label, x.source, [x.by, x.detail].filter(Boolean).join(" · ") || "—"]))}
<p class="notice">${esc(p.thresholdNotice)}</p>${table("Seuils documentés", ["Seuil", "Source", "Montant", "Base / pourcentage déclaré", "Motif", "Auteur"], p.thresholds.map(t => [t.label, t.source, t.amount, (t.basis ?? "—") + (t.rate ? " · " + t.rate + " % (méthode interne)" : ""), t.rationale, t.by + " · " + t.at]))}</section>
<section><h2>Achèvement</h2><p>Validation professionnelle : ${esc(p.completion.professional.status)}${p.completion.professional.by ? " par " + esc(p.completion.professional.by) + " le " + esc(p.completion.professional.at) : ""}${p.completion.professional.changed.length ? " — changé depuis : " + esc(p.completion.professional.changed.join(", ")) : ""}.</p>
<p>Dossier personnel : ${esc(p.completion.personal.status)}${p.completion.personal.reviewerName ? " — relecture personnelle nommée : " + esc(p.completion.personal.reviewerName) + " le " + esc(p.completion.personal.at) : ""}${p.completion.personal.changed.length ? " — périmé : " + esc(p.completion.personal.changed.join(", ")) : ""}. ${esc(p.completion.personal.notice)}</p>
${table("Limites enregistrées au marquage personnel", ["Code", "Limite"], p.completion.personal.limits.map(l => [l.code, l.label]))}
${table("Travaux restants (communs)", ["Élément"], p.completion.blockers.map(b => [b]))}${table("Conditions d’une revue professionnelle non remplies", ["Élément"], p.completion.professionalGaps.map(b => [b]))}</section>
<section><h2>Exclusions encore pertinentes</h2>${table("Exclusions motivées et limites de capacité", ["Nature", "Élément", "Motif"], p.exclusions.map(x => [x.kind, x.label, x.reason]))}</section>
<section><h2>Limites de cette restitution</h2><ul>${[...p.limitations, "PDF standard dérivé du HTML, non validé PDF/A ; caractères hors Latin-1 remplacés dans le PDF. HTML et JSON conservent le texte Unicode."].map(l => `<li>${esc(l)}</li>`).join("")}</ul></section></body></html>`;
}

export async function buildClosingDossierPackage(projection: DossierProjection, journal: JournalLine[], format: ClosingExportFormat) {
  const { hash, ...body } = projection;
  if (stableSha256(body) !== hash) throw new Error("EXPORT_SNAPSHOT_HASH_INVALID");
  if (journal.length !== projection.journal.seq) throw new Error("EXPORT_JOURNAL_MISMATCH");
  const createdAt = projection.stateAsOf ?? "1970-01-01T00:00:00.000Z";
  const report = { exportSchemaVersion: "closing-dossier-export-1.0.0", createdAt, projection, journal, binaryFilesIncluded: false };
  const json = canonicalJson(report), html = closingDossierHtml(projection);
  const rows = projection.cycles.flatMap(c => c.rows);
  const csv = {
    procedures: buildCsv(["procedureId", "cycle", "label", "nature", "applicable", "status", "done", "donePersonal", "reviewBasis", "rootId", "runId", "revision", "version", "contentHash", "perimeter", "result", "records", "pieces", "misstatements", "contradictions", "remaining"],
      rows.map(r => ({ procedureId: r.procedureId, cycle: r.cycle, label: r.label, nature: r.nature, applicable: r.applicable, status: r.status, done: r.done, donePersonal: r.donePersonal, reviewBasis: r.reviewBasis ?? "", rootId: r.sheet?.rootId ?? "", runId: r.sheet?.runId ?? "",
        revision: r.sheet?.revision ?? "", version: r.sheet?.version ?? "", contentHash: r.sheet?.contentHash ?? "", perimeter: r.sheet?.perimeter ?? "", result: r.sheet?.result ?? "", records: r.manual?.records ?? "", pieces: r.evidence.pieces, misstatements: r.misstatements, contradictions: r.contradictions, remaining: r.remaining }))),
    sheets: buildCsv(["procedure", "rootId", "runId", "revision", "version", "state", "contentHash", "assignment", "procedureId", "binding", "result", "sourcesCurrent", "populationSize", "exclusion"],
      [...rows.flatMap(r => r.sheet ? [{ ...r.sheet }] : []), ...projection.cycles.flatMap(c => c.otherSheets)].map(s => ({ ...s, procedureId: s.procedureId ?? "", binding: s.binding ?? "", result: s.result ?? "", sourcesCurrent: s.sourcesCurrent === null ? "non lu" : s.sourcesCurrent, populationSize: s.populationSize ?? "", exclusion: s.exclusion?.reason ?? "" }))),
    findings: buildCsv(["kind", "id", "description", "status", "amount", "corrected", "residual", "freshEvidence", "procedures"], [
      ...projection.findings.misstatements.map(m => ({ kind: "anomalie", id: m.id, description: m.description, status: m.stage, amount: m.amount, corrected: m.corrected ?? "", residual: m.residual ?? "", freshEvidence: m.freshEvidence, procedures: m.procedureId ?? "" })),
      ...projection.findings.contradictions.map(c => ({ kind: "contradiction", id: c.id, description: c.description, status: c.status, amount: "", corrected: "", residual: "", freshEvidence: c.laterRepresentations, procedures: c.procedureIds })),
      // Event effects: a separate kind, never summed with the misstatements; the amount is the C05 one, counted once, with its sense.
      ...projection.findings.events.effects.map(x => ({ kind: "effet_evenement", id: x.invoiceId, description: (x.candidate ?? "") + " · " + x.party + " · " + SENS[x.direction] + " du résultat", status: x.status === "determined" ? x.stage ?? "" : x.status,
        amount: x.countedCents !== null ? centsText(x.countedCents) : "Inconnu", corrected: x.bridge ? centsText(x.bridge.correctedCents) : "", residual: x.bridge ? centsText(x.bridge.residualCents) : "", freshEvidence: "", procedures: x.sources.map(s => s.procedure + " " + s.runId + " v" + s.version) })),
      ...projection.findings.events.withoutEffect.map(x => ({ kind: "candidat_sans_effet", id: x.invoiceId, description: x.candidates.join(", ") + " · " + x.party + " · " + x.reason, status: x.accounting, amount: "Inconnu", corrected: "", residual: "", freshEvidence: "", procedures: x.sources.map(s => s.procedure + " " + s.runId + " v" + s.version) }))]),
    journal: buildCsv(["seq", "at", "actorId", "type", "label", "procedureId", "hash"], journal.map(l => ({ ...l, procedureId: l.procedureId ?? "" }))),
  };
  const base = "probant-dossier-" + projection.hash.slice(0, 12);
  const pdf = format === "pdf" || format === "manifest" ? await buildPdfFromAccessibleHtml(html, { title: "PROBANT - Dossier et cloture", createdAt }) : null;
  const artifacts = [artifact("canonical_json", base + ".json", "application/json", json), artifact("controls_csv", base + "-procedures.csv", "text/csv;charset=utf-8", csv.procedures),
    artifact("sources_csv", base + "-feuilles.csv", "text/csv;charset=utf-8", csv.sheets), artifact("findings_csv", base + "-constats.csv", "text/csv;charset=utf-8", csv.findings),
    artifact("review_events_csv", base + "-journal.csv", "text/csv;charset=utf-8", csv.journal), artifact("accessible_html", base + ".html", "text/html;charset=utf-8", html),
    ...(pdf ? [artifact("pdf", base + ".pdf", "application/pdf", pdf, { derivedFrom: base + ".html", validation: { pdfA: { status: "not_validated" as const, profile: null, validator: null, validatedAt: null } } })] : [])];
  const manifest: EvidenceManifest = { manifestVersion: "1.0.0", applicationVersion: "0.1.0", dossierId: projection.dossierId, snapshotId: projection.hash, createdAt, sourceDocuments: [], parserVersions: {},
    ruleSetVersion: projection.schemaVersion, referenceSetVersion: "closing-1", policyVersion: "server-dossier-permissions-1.0.0", snapshotSha256: projection.hash, reviewEventsDigest: stableSha256(journal), artifacts,
    limitations: [...projection.limitations.map((message, i) => ({ code: "closing_limit_" + i, message, subjects: [] as string[] })),
      { code: "binary_pieces_absent", message: "Pièces du dossier non incluses : leur téléchargement séparé exige la permission d’export du même dossier.", subjects: [projection.hash] }] };
  const pick: Record<ClosingExportFormat, { content: string | Uint8Array; mediaType: string; fileName: string }> = {
    json: { content: json, mediaType: "application/json", fileName: base + ".json" }, html: { content: html, mediaType: "text/html;charset=utf-8", fileName: base + ".html" },
    pdf: { content: pdf ?? new Uint8Array(), mediaType: "application/pdf", fileName: base + ".pdf" }, procedures_csv: { content: csv.procedures, mediaType: "text/csv;charset=utf-8", fileName: base + "-procedures.csv" },
    sheets_csv: { content: csv.sheets, mediaType: "text/csv;charset=utf-8", fileName: base + "-feuilles.csv" }, findings_csv: { content: csv.findings, mediaType: "text/csv;charset=utf-8", fileName: base + "-constats.csv" },
    journal_csv: { content: csv.journal, mediaType: "text/csv;charset=utf-8", fileName: base + "-journal.csv" }, manifest: { content: canonicalJson(manifest), mediaType: "application/json", fileName: base + "-manifeste.json" },
  };
  return { ...pick[format], snapshot: projection.hash, manifest };
}

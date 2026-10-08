import { canonicalCompare, canonicalJson, stableSha256 } from "@/lib/synthesis/canonical";
import { amountLabel, locatorLabel, type ClientMissionSnapshot } from "@/lib/workpapers/client-mission";
import { assertScope, contentHash, validateRun, type WorkpaperRun } from "@/lib/workpapers/model";
import type { ImportBatch } from "@/lib/workpapers/imports";
import { artifact } from "./package";
import { buildCsv } from "./csv";
import { buildPdfFromAccessibleHtml } from "./pdf";
import type { EvidenceExportPackage, EvidenceManifest } from "./types";
export type ClientExportKind = "diagnostic" | "approved";
export function assertClientPackage(mission: ClientMissionSnapshot, run: WorkpaperRun | null, kind: ClientExportKind) {
  const { hash, ...body } = mission;
  if (stableSha256(body) !== hash) throw new Error("EXPORT_SNAPSHOT_HASH_INVALID");
  if (run) {
    validateRun(run); assertScope(mission.scope, run.scope);
    if (run.id !== mission.procedure.runId || run.version !== mission.procedure.version || contentHash(run) !== mission.procedure.contentHash) throw new Error("EXPORT_VERSION_INVALID");
  } else if (mission.procedure.runId) throw new Error("EXPORT_RUN_REQUIRED");
  if (kind === "approved" && (!run || run.state !== "locked" || mission.procedure.stale || run.result?.execution !== "completed" || !mission.procedure.comparisons.every(c => c.conventionValidated) || !run.approval || run.approval.snapshotHash !== contentHash(run))) throw new Error("EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED");
}
const escapeHtml = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function table(title: string, headings: string[], rows: unknown[][]) {
  return `<table><caption>${escapeHtml(title)}</caption><thead><tr>${headings.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headings.length}">Aucun élément.</td></tr>`}</tbody></table>`;
}
export function clientMissionHtml(m: ClientMissionSnapshot, run: WorkpaperRun | null, kind: ClientExportKind, createdAt: string) {
  const p = m.procedure;
  const status = kind === "approved" ? (p.id === "clients.frame" ? "Paquet du cadrage approuvé et verrouillé" : "Paquet Clients et ventes approuvé et verrouillé") + " — portée : procédure sélectionnée uniquement" : "Export diagnostic — ne constitue pas un paquet approuvé";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PROBANT — Synthèse Clients</title><style>
body{font:15px/1.55 system-ui,sans-serif;color:#18283c;background:white;margin:2rem auto;max-width:1120px;padding:0 1rem}h1{font-size:26px}h2{font-size:20px;margin-top:2rem}p,td,th{overflow-wrap:anywhere;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:1rem 0;table-layout:fixed}caption{text-align:left;font-weight:700;margin:.5rem 0}th,td{text-align:left;vertical-align:top;border:1px solid #b5bfcb;padding:7px;font-size:12px}th{background:#edf1f6}thead{display:table-header-group}tr{break-inside:avoid}header{border-bottom:2px solid #344b67}a{color:#17497b}.notice{border-left:4px solid #ab7015;padding:1rem;background:#fff7e4}@page{size:A4 landscape;margin:16mm}@media print{body{max-width:none;margin:0;padding:0;font-size:11px}h2{break-after:avoid}th{background:#eee}table{font-size:10px}.notice{background:none}}
</style></head><body><header><p>Procédures de mission · infrastructure de recette jetable</p><h1>Synthèse Clients — ${escapeHtml(p.label)}</h1><p>${escapeHtml(status)}</p><p>Dossier ${escapeHtml(m.scope.dossierId)} · Organisation ${escapeHtml(m.scope.organizationId)} · Période ${escapeHtml(m.scope.periodId)}</p><p>Feuille ${escapeHtml(p.runId)} · révision ${escapeHtml(p.revision)} · version ${escapeHtml(p.version)} · préparation ${escapeHtml(p.preparedBy)}</p><p>État serveur ${escapeHtml(m.hash)} · état établi au ${escapeHtml(createdAt)}</p></header>
<section><h2>Résumé humain</h2><p>${escapeHtml(p.resultLabel)}. ${escapeHtml(p.reviewLabel)}.</p><p>${escapeHtml(p.conclusion)}</p><p class="notice">${escapeHtml(p.stale ? "Travail périmé : " + p.staleReasons.join(" ") : "Sources courantes à la génération de cet état.")} Une revue documentée ne vaut pas conformité des comptes ; aucune opinion automatique.</p><p>Programme ${escapeHtml(m.program.id)} @ ${escapeHtml(m.program.version)} : ${m.counters.executed}/${m.counters.planned} procédure exécutée ; ${m.counters.testedParts}/${m.counters.plannedParts} contrôles complets ; ${m.counters.exceptions} exceptions. Les exceptions ne constituent pas le dénominateur du programme. La revue d’une procédure ne vaut pas approbation de tout le programme.</p></section>
<section><h2>File de travail priorisée</h2>${table("Actions liées à cette version", ["Priorité", "Catégorie", "Action", "Détail / identité"], m.queue.map(q => [q.priority, q.category, q.label, q.detail + " · " + q.id + " · " + q.href]))}</section>
<section><h2>Procédures, population et sélection</h2>${table("Programme fermé", ["Procédure", "Tests prévus", "Exclusions du programme"], m.program.procedures.map(d => [d.label + " @ " + d.version, d.tests.map(t => t.label).join(" ; "), m.program.exclusions.length ? m.program.exclusions.map(e => e.id + ": " + e.reason).join(" ; ") : "Aucune"]))}<p>Couverture ${p.coverage.numerator}/${p.coverage.denominator ?? "inconnu"} ${escapeHtml(p.coverage.unit)}. Critères : ${escapeHtml(p.coverage.criteria)}.</p>${table("Exclusions explicites de la sélection", ["Unité", "Raison"], p.coverage.exclusions.map(e => [e.id, e.reason]))}${table("Population figée", ["Unité", "Montant", "Sources / lignes", "Sélection"], run?.population?.items.map(item => [item.id, amountLabel(item.amount), item.rowIds.join(" ; "), run.selection?.selectedIds.includes(item.id) ? "Sélectionnée" : "Exclue ou non sélectionnée"]) ?? [])}</section>
<section><h2>Calculs et exceptions</h2><p>${escapeHtml(m.amountGrouping.reason)}</p>${p.comparisons.map(c => `<h3>${escapeHtml(c.label)}</h3><p>Couverture ${c.coverage.numerator}/${c.coverage.denominator ?? "inconnu"} ${escapeHtml(c.coverage.unit)}. Exclusions : ${escapeHtml(c.coverage.exclusions.length ? c.coverage.exclusions.map(e => e.id + ": " + e.reason).join(" ; ") : "Aucune")}.</p><p>Convention ${c.conventionValidated ? "validée par le contrat de calcul" : "non validée"} : ${escapeHtml(c.convention)}. Règle ${escapeHtml(c.ruleVersion)} · entrées ${escapeHtml(c.inputHash)}.</p>${c.net || c.gross ? "<p>Net du rapprochement " + escapeHtml(amountLabel(c.net ?? undefined)) + " ; brut " + escapeHtml(amountLabel(c.gross ?? undefined)) + ". Ces valeurs restent propres à ce rapprochement.</p>" : "<p>Montants détaillés par facture et événement ; aucune agrégation du reste dû ni estimation automatique.</p>"}${table(c.label + " — détail des clés", ["Clé / identité", "Gauche", "Droite", "Différence / statut", "Preuves versionnées"], c.rows.map(row => [row.key + " · " + row.id, amountLabel(row.left), amountLabel(row.right), amountLabel(row.difference) + " · " + (row.exception ? "Exception maintenue" : row.difference.kind !== "known" ? "Incertitude" : "Aucun écart sur cette clé"), row.proofs.map(e => e.documentVersionId + "/" + e.rowId + " · " + locatorLabel(e.locator)).join(" ; ")]))}`).join("")}</section>
${contextProcedures(m)}${salesDetails(p.sales)}<section><h2>Décisions et comparaison avant / après revue</h2><p>Résultat ${escapeHtml(p.resultId)} · entrées ${escapeHtml(p.resultInputHash)} · contenu ${escapeHtml(p.contentHash)}.</p>${table("Décision sur la version", ["Auteur réel", "Version approuvée / date", "Décision motivée", "Résultat après revue"], p.review ? [[p.review.actorId, p.review.approvedVersion + " · " + p.review.at, p.review.note, p.resultLabel]] : [])}${table("Avant / après revue", ["Moment", "Version / résultat", "Conclusion", "Traitements documentés"], [p.beforeReview && ["Soumission", p.beforeReview.version + " / " + p.beforeReview.resultId, p.beforeReview.conclusion, p.beforeReview.notes.map(n => n.text + " : " + (n.resolution?.text ?? "Ouvert")).join(" ; ")], p.afterReview && ["Après revue", p.afterReview.version + " / " + p.afterReview.resultId, p.afterReview.conclusion, p.afterReview.notes.map(n => n.text + " : " + (n.resolution?.text ?? "Ouvert")).join(" ; ")]].filter((r): r is string[] => !!r))}${table("Commentaires / exceptions et leur traitement", ["Identité", "Auteur / date", "Texte", "Traitement"], p.notes.map(n => [n.id, n.authorId + " · date de création non disponible", n.text, n.resolution ? n.resolution.text + " · " + n.resolution.authorId + " · " + n.resolution.at : n.blocking ? "Bloquant ouvert" : "Ouvert"]))}${table("Versions et anciennes décisions", ["Identité / version", "État / empreinte", "Auteur", "Décision conservée"], m.versionIndex.map(v => [v.id + " · r" + v.revision + " v" + v.version, v.state + " · " + v.contentHash, v.actorId, v.approval ? v.approval.actorId + " : " + v.approval.note : v.reviewNotes.map(n => n.authorId + " : " + n.text).join(" ; ") || v.events.at(-1)?.action || "Aucune approbation"]))}</section>
<section><h2>Sources et index des pièces</h2><p class="notice">Les originaux binaires ne sont pas inclus dans ce paquet. Leur téléchargement séparé exige la permission d’export du même dossier. Une pièce absente ne devient pas une preuve fournie.</p>${table("Index des pièces versionnées", ["Pièce / identité", "Version / SHA-256", "Provenance / approbation", "Présence et actualité"], m.sources.map(s => [s.label + " · " + (s.fileName ?? "Attendue") + " · " + s.id, s.importId + " · " + (s.sha256 ?? "Absent"), "Parseur " + s.parserVersion + " ; mapping " + s.mappingVersion + "/" + s.mappingHash + " ; " + s.approvedBy + " · " + s.approvedAt, !s.available ? "Pièce attendue et absente" : (s.current ? "Source courante" : "Source remplacée / périmée") + " · binaire absent du paquet"]))}${table("Localisateurs des lignes sources", ["Document versionné", "Ligne", "Localisateur"], m.sources.flatMap(s => s.locators.map(l => [s.id, l.rowId, locatorLabel(l.locator)])))}${table("Preuves rattachées à la procédure", ["Preuve / procédure / version", "Document / ligne", "Localisateur / usage"], proofIndex(m))}</section>
<section><h2>Incertitudes et limites</h2><ul>${[...m.limitations, ...p.coverage.limitations, ...(run?.result?.warnings ?? []), ...(run?.result?.blockedControls ?? []), "PDF standard dérivé du HTML, sans certification PDF/A ; caractères hors alphabet Latin-1 remplacés dans ce PDF. HTML et JSON conservent le texte Unicode."].map(l => `<li>${escapeHtml(l)}</li>`).join("")}</ul><p>Famille de ce rapport : procédures de mission. Les constats historiques DEMO SA et l’atelier synthétique ne sont pas inclus.</p></section></body></html>`;
}
export async function buildClientMissionPackage(mission: ClientMissionSnapshot, run: WorkpaperRun | null, imports: ImportBatch[], kind: ClientExportKind, createdAt: string): Promise<EvidenceExportPackage> {
  assertClientPackage(mission, run, kind);
  const sourceIds = new Set(mission.sources.filter(s => s.available).map(s => s.importId));
  const batches = imports.filter(b => sourceIds.has(b.id)).sort((a, b) => canonicalCompare(a.id, b.id)); batches.forEach(b => assertScope(mission.scope, b.scope));
  if (batches.length !== sourceIds.size) throw new Error("EXPORT_SOURCE_REQUIRED");
  const report = { exportSchemaVersion: "clients-mission-2.0.0", kind, createdAt, mission, run, imports: batches, binaryFilesIncluded: false };
  const canonical = canonicalJson(report), html = clientMissionHtml(mission, run, kind, createdAt);
  const csv = {
    findings: buildCsv(["procedureId", "runId", "version", "resultId", "controlId", "id", "target", "difference", "exception", "message", "proofs"], mission.procedures.flatMap(p => [
      ...p.comparisons.flatMap(c => c.rows.map(r => ({ procedureId: p.id, runId: p.runId, version: p.version, resultId: p.resultId, controlId: c.id, id: r.id, target: r.key, difference: amountLabel(r.difference), exception: r.exception, message: r.exception ? "Exception maintenue" : r.difference.kind !== "known" ? "Incertitude" : "Aucun écart sur cette clé", proofs: r.proofs.map(link => link.id) }))),
      ...(p.sales?.exceptions.map(e => ({ procedureId: p.id, runId: p.runId, version: p.version, resultId: p.resultId, controlId: e.controlId, id: e.id, target: e.targetId, difference: amountLabel(e.amount), exception: true, message: e.message, proofs: e.proofIds })) ?? []),
    ])),
    reviewEvents: buildCsv(["procedureId", "runId", "version", "actorId", "at", "action", "note", "scope"], [
      ...mission.versionIndex.flatMap(v => v.events.slice(-1).map(e => ({ ...e, procedureId: mission.procedure.id, runId: v.id, version: v.version, note: v.approval?.note ?? "", scope: "selected_procedure" }))),
      ...mission.procedures.filter(p => p.id !== mission.procedure.id && p.review).map(p => ({ procedureId: p.id, runId: p.runId, version: p.version, actorId: p.review!.actorId, at: p.review!.at, action: "contextual_review", note: p.review!.note, scope: "context_only" })),
    ]),
    controls: buildCsv(["procedureId", "runId", "version", "ruleVersion", "controlId", "label", "plannedTests", "complete", "numerator", "denominator", "exclusions"], mission.program.procedures.flatMap(def => def.tests.map(test => {
      const p = mission.procedures.find(p => p.id === def.id)!, c = p.comparisons.find(c => c.id === test.id)!;
      return { procedureId: def.id, runId: p.runId, version: p.version, ruleVersion: def.version, controlId: test.id, label: test.label, plannedTests: def.tests.length, complete: c.complete, numerator: c.coverage.numerator, denominator: c.coverage.denominator, exclusions: c.coverage.exclusions.map(e => e.id + ":" + e.reason) };
    }))),
    sources: buildCsv(["id", "importId", "fileName", "sha256", "approvedBy", "approvedAt", "available", "current", "binaryInPackage", "locators"], mission.sources.map(s => ({ ...s, locators: s.locators.map(l => l.rowId + ":" + locatorLabel(l.locator)) }))),
  };
  const pdf = await buildPdfFromAccessibleHtml(html, { title: "PROBANT - " + mission.procedure.label + " - " + kind, createdAt });
  const base = "probant-clients-" + kind + "-" + mission.hash.slice(0, 12);
  const manifest: EvidenceManifest = { manifestVersion: "1.0.0", applicationVersion: "0.1.0", dossierId: mission.scope.dossierId, snapshotId: mission.hash,
    createdAt, sourceDocuments: batches.map(b => ({ id: b.document.id, fileName: b.document.fileName, documentType: b.document.documentType, sha256: b.document.byteHash, parserVersion: b.document.parserVersion, location: { provider: "postgres-clients", key: b.id, versionId: b.document.id } })),
    parserVersions: Object.fromEntries(batches.map(b => [b.document.id, b.document.parserVersion])), ruleSetVersion: mission.program.version,
    referenceSetVersion: "clients-closed-contracts-2.0.0", policyVersion: "server-dossier-permissions-1.0.0", snapshotSha256: mission.hash,
    reviewEventsDigest: stableSha256(mission.versionIndex),
    artifacts: [artifact("canonical_json", base + ".json", "application/json", canonical), artifact("findings_csv", base + "-exceptions.csv", "text/csv;charset=utf-8", csv.findings),
      artifact("review_events_csv", base + "-decisions.csv", "text/csv;charset=utf-8", csv.reviewEvents), artifact("controls_csv", base + "-procedures.csv", "text/csv;charset=utf-8", csv.controls),
      artifact("sources_csv", base + "-sources.csv", "text/csv;charset=utf-8", csv.sources), artifact("accessible_html", base + ".html", "text/html;charset=utf-8", html),
      artifact("pdf", base + ".pdf", "application/pdf", pdf, { derivedFrom: base + ".html", validation: { pdfA: { status: "not_validated", profile: null, validator: null, validatedAt: null } } })],
    limitations: [...mission.limitations.map((message, i) => ({ code: "clients_limit_" + i, message, subjects: [] as string[] })),
      { code: "package_kind_" + kind, message: kind === "approved" ? "Procédure sélectionnée approuvée et verrouillée ; les procédures contextuelles conservent leur propre état. Aucune opinion sur les comptes." : "Diagnostic, y compris des versions historiques ou périmées ; aucune approbation du paquet.", subjects: [mission.hash] },
      { code: "pdf_standard_unicode", message: "PDF standard sans PDF/A ; caractères hors Latin-1 remplacés. HTML et JSON préservent Unicode.", subjects: [base + ".pdf"] }],
  };
  return { manifest, manifestJson: canonicalJson(manifest), canonicalJson: canonical, csv, html, pdf };
}
function sourceLinks(links: { id: string; documentVersionId: string; rowId?: string; locator?: Parameters<typeof locatorLabel>[0] }[]) {
  return links.map(p => p.id + " · " + p.documentVersionId + "/" + (p.rowId ?? "document entier") + " · " + locatorLabel(p.locator)).join(" ; ") || "Pièce attendue ou absente";
}
function contextProcedures(m: ClientMissionSnapshot) {
  return "<section><h2>État des procédures du programme</h2>" + table("Portée de chaque décision", ["Procédure", "Identité / version", "Résultat et revue", "Actualité"], m.procedures.map(p => [
    p.label + (p.id === m.procedure.id ? " · sélectionnée pour cet export" : " · contexte, aucune approbation du paquet implicite"),
    (p.runId ?? "À préparer") + " · v" + (p.version ?? "—") + " · " + (p.contentHash ?? "non figé"),
    p.resultLabel + " · " + p.reviewLabel + (p.review ? " · " + p.review.actorId + " : " + p.review.note : ""),
    p.stale ? p.staleReasons.join(" ") : p.runId ? "Version référencée courante" : "Procédure prévue, non préparée",
  ])) + m.procedures.filter(p => p.id !== m.procedure.id).map(p => "<h3>" + escapeHtml(p.label) + "</h3><p>" + escapeHtml(p.conclusion) + "</p>" + p.comparisons.map(c => table(c.label + " — faits contextuels versionnés", ["Clé / résultat", "Gauche", "Droite", "Différence", "Sources"], c.rows.map(row => [
    row.key + " · " + row.id, amountLabel(row.left), amountLabel(row.right), amountLabel(row.difference), sourceLinks(row.proofs),
  ]))).join("") + salesDetails(p.sales)).join("") + "</section>";
}
function salesDetails(s: ClientMissionSnapshot["procedure"]["sales"]) {
  if (!s) return "";
  const method = (e: typeof s.estimates[number]) => e.method ? e.method.id + " @ " + e.method.version + " ; " + e.method.source + " ; base " + e.method.basis + " ; " + e.method.from + " → " + e.method.to : "Méthode absente — estimation non conclue";
  return "<section><h2>Clients et ventes — clôture et revue séparées</h2><p>Clôture " + escapeHtml(s.closingDate) + " ; revue " + escapeHtml(s.reviewDate) + ". Fenêtre documentée : " + escapeHtml(s.window.startDate) + " → " + escapeHtml(s.window.endDate) + " ; couverture " + escapeHtml(s.window.coverage) + " ; " + escapeHtml(s.window.note) + ".</p><p>Cadrage lié : " + escapeHtml(s.framing.runId) + " v" + s.framing.version + " ; " + escapeHtml(s.framing.contentHash) + ".</p><p class='notice'>Le solde de clôture reste figé. Le reste dû ne constitue ni une perte estimée ni une créance entièrement sûre. L’absence d’échéance ne produit aucun retard inventé.</p>"
    + table("Fenêtre documentée et absence d’avoirs", ["Objet / incertitude", "Pièces versionnées"], [
      ["Fenêtre " + s.window.coverage + " ; " + s.window.note, sourceLinks(s.window.evidence)],
      [s.creditsAbsence ? "Absence d’avoirs déclarée : " + s.creditsAbsence.note : "Avoirs : source importée ou absence restant à documenter", sourceLinks(s.creditsAbsence?.evidence ?? [])],
    ])
    + table("Factures ouvertes à la clôture", ["Client / facture / dates", "Solde clôture", "Encaissements affectés", "Avoirs ultérieurs", "Reste à la revue", "Âge et incertitude"], s.rows.map(r => [
      r.customerId + " / " + r.invoiceId + " ; facture " + r.issuedOn + " ; échéance " + (r.dueOn ?? "inconnue"),
      amountLabel(r.dueAtClosing), amountLabel(r.subsequentPayments), amountLabel(r.subsequentCredits), amountLabel(r.dueAtReview),
      r.aging.days + " " + r.aging.label + " ; retard " + (r.overdueDays === null ? "non déterminé — échéance absente" : r.overdueDays + " jours") + " ; " + r.uncertainties.join(" "),
    ]))
    + table("Frise des événements clôture → revue", ["Facture", "Événement / date", "Montant et effet", "Pièces"], s.rows.flatMap(r => r.timeline.map(t => [
      r.invoiceId, t.id + " · " + t.date + " · " + t.label, amountLabel(t.amount) + " · " + (t.effect === "closing" ? "Clôture figée" : t.effect === "review" ? "Revue uniquement" : "Aucun effet automatique sur les soldes"), t.proofIds.join(" ; ") || "Pièce absente ou montant calculé à partir des faits liés",
    ])))
    + table("Avoirs postérieurs et rattachement", ["Avoir / facture / tiers", "Date / montant", "Traitement et pièces"], s.credits.map(c => [
      c.id + " / " + c.invoiceId + " / " + c.customerId, c.issuedOn + " ; " + amountLabel(c.amount),
      (c.status === "applied" ? "Avoir affecté au solde de revue ; clôture inchangée" : "À rattacher — aucun effet sur les soldes") + " ; " + sourceLinks(c.evidence),
    ]))
    + table("Paiements et soldes résiduels", ["Paiement / tiers / nature", "Montant / date / état", "Affecté validé", "Appariement proposé", "Résiduel / disponible"], s.payments.map(p => [
      p.id + " / " + p.customerId + " / " + p.kind, amountLabel(p.amount) + " · " + p.paidOn + " · " + p.status + (p.cancelledOn ? " ; annulation " + p.cancelledOn : ""),
      amountLabel(p.validatedAllocated), amountLabel(p.proposedAmount), amountLabel(p.residualUnallocated) + " ; disponible " + amountLabel(p.availableToAllocate),
    ]))
    + table("Allocations et propositions distinctes", ["Allocation / paiement / facture", "Montant / statut", "Auteur réel / date", "Pièces"], s.allocations.map(a => [
      a.id + " / " + a.paymentId + " / " + a.invoiceId, amountLabel(a.amount) + " ; " + (a.status === "validated" ? "Allocation validée" : "Appariement proposé — aucun effet sur les soldes"),
      a.authorId + " · " + a.authoredAt, sourceLinks(a.evidence),
    ]))
    + table("Litiges et estimations documentées", ["Estimation / facture", "Méthode / base", "Montant déclaré / écart comptabilisé", "Auteur réel / date", "Litige / jugement / pièces"], s.estimates.map(e => [
      e.id + " / " + e.invoiceId, method(e) + " ; base " + amountLabel(e.base), amountLabel(e.amount) + " ; " + amountLabel(e.difference) + " ; " + e.status,
      e.authorId + " · " + e.authoredAt, e.dispute + " ; " + e.rationale + " ; " + sourceLinks(e.evidence),
    ]))
    + table("Confirmations suivies — aucun envoi automatique", ["Confirmation / factures / état", "Demande / réponse", "Origine / rapprochement", "Auteur réel / pièces"], s.confirmations.map(c => [
      c.id + " v" + c.record.version + " / " + c.invoiceIds.join(", ") + " ; " + c.status,
      c.record.request ? c.record.request.date + " · " + c.record.request.channel + " ; réponse " + (c.record.response?.date ?? "absente") : "Demande non documentée ; réponse absente",
      "Origine déclarée " + (c.declaredOrigin ?? "non renseignée") + " ; origine établie " + (c.record.response?.origin ?? "non applicable") + " ; " + c.record.reconciliation.status + " ; " + c.record.reconciliation.note + (c.record.alternative ? " ; alternative " + c.record.alternative.performedOn + " : " + c.record.alternative.note : ""),
      c.authorId + " · " + c.authoredAt + " ; " + sourceLinks(c.evidence),
    ]))
    + table("Exceptions Clients conservées après revue", ["Identité / contrôle / cible", "Constat / incertitude", "Montant", "Preuves"], s.exceptions.map(e => [
      e.id + " / " + e.controlId + " / " + e.targetId, e.label + " ; " + e.message, amountLabel(e.amount), e.proofIds.join(" ; ") || "Pièce attendue",
    ])) + "</section>";
}
function proofIndex(m: ClientMissionSnapshot): unknown[][] {
  return m.procedures.flatMap(p => {
    const links = [
      ...p.evidence,
      ...p.comparisons.flatMap(c => c.rows.flatMap(r => r.proofs)),
      ...(p.sales ? [...p.sales.window.evidence, ...(p.sales.creditsAbsence?.evidence ?? [])] : []),
      ...(p.sales ? [...p.sales.rows, ...p.sales.credits, ...p.sales.payments, ...p.sales.allocations, ...p.sales.estimates, ...p.sales.confirmations].flatMap(r => r.evidence) : []),
    ];
    return links.filter((link, index, all) => all.findIndex(other => other.id === link.id) === index).map(link => [
      link.id + " · " + p.id + " · " + p.runId + " v" + p.version,
      link.documentVersionId + " / " + (link.rowId ?? "document entier"),
      locatorLabel(link.locator) + " · " + ("purpose" in link ? link.purpose : "Fait du résultat versionné") + " · original binaire absent du paquet",
    ]);
  });
}

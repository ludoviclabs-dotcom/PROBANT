import type { KnownAmount } from "@/lib/canonical-model/money";
import { approvalLabel } from "@/lib/auth/review-kind";
import { LOAN_LABELS, type LoanFact, type LoanResult } from "./loan-review";
import { DAY_COUNT_DEFINITIONS, INTERVAL_CONVENTION_LABEL, LOAN_NATURE_LABELS } from "./loan-rules";
import { contentHash, type WorkpaperRun } from "./model";

const esc = (v: unknown) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
const amount = (a: KnownAmount) => a.kind === "known" ? a.value.amount + " EUR" : a.kind === "unknown" ? "Inconnu : " + a.reason : "Sans objet : " + a.reason;
const STATUS = { documented: "Documenté sur les sources fournies", explain: "À expliquer", inconclusive: "Non concluant", excluded: "Exclu et nommé" } as const;
const OUTCOME = { no_exception_detected: "Aucune différence relevée sur la population testée", exceptions_detected: "Des différences demandent une explication", inconclusive: "Non concluant sur une partie de la population" } as const;
const STATES: Record<string, string> = { draft: "brouillon", ready: "prête à calculer", executed: "calculée", awaiting_review: "en attente de relecture", changes_requested: "reprise demandée", approved: "approuvée", locked: "verrouillée", superseded: "remplacée", blocked: "bloquée", failed: "en échec" };
const source = (f: LoanFact) => { const s = f.details.source as { title: string; pack: string; date: string; page: number | null; clause: string; excerpt: string }; return s.clause + " · " + s.excerpt + " — " + s.title + " ; pack " + s.pack + " ; page " + (s.page ?? "non applicable") + " ; date " + s.date; };
function table(headers: string[], rows: unknown[][]) {
  return "<table><thead><tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map(c => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
}

/** Where the exported version stands against the dossier today; absent for the read-only synthetic example (current by construction). */
export interface LoanExportStanding { headVersion: number; latestRevision: boolean; sourcesCurrent: boolean }
function standingNotice(run: WorkpaperRun, standing: LoanExportStanding | undefined) {
  if (!standing) return "";
  const lines = [
    !standing.latestRevision ? "Révision remplacée : une révision plus récente de cette feuille existe ; ce diagnostic décrit la version " + run.version + " telle qu’elle a été conservée."
      : standing.headVersion !== run.version ? "Version antérieure : la version courante de cette feuille est la " + standing.headVersion + " ; ce diagnostic décrit la version " + run.version + " telle qu’elle a été conservée." : "",
    !standing.sourcesCurrent ? "Feuille périmée : une source Emprunts a été remplacée ou ajoutée depuis le gel ; résultats et décisions portent sur les sources figées de cette version, non sur les sources courantes." : "",
  ].filter(Boolean);
  return lines.map(l => "<p><strong>" + esc(l) + "</strong></p>").join("");
}

/** Diagnostic of one sheet version: index of its frozen sources (no originals), method, results, decisions and limits. */
export function loanDiagnostic(run: WorkpaperRun, facts: LoanFact[], standing?: LoanExportStanding) {
  const result = run.result?.result as LoanResult | undefined;
  if (!result || result.schemaVersion !== "loans-result-1") throw new Error("LOAN_RESULT_REQUIRED");
  const byRow = new Map(facts.map(f => [f.rowId, f]));
  const body = result.rows.map(r => {
    const p = r.presentation;
    const presentation = table(["Nature déclarée", "Poste de bilan (intitulé art. 821-1)", "Comptes attendus (principal / intérêts courus)", "Comptes déclarés", "Signaux"],
      [[p.nature ? LOAN_NATURE_LABELS[p.nature] : "Contrat non identifié", p.rubric ?? "Non déterminé", (p.expectedPrincipal.join(", ") || "—") + " / " + (p.expectedAccrued.join(", ") || "—"),
        (p.declaredPrincipalAccount ?? "—") + " / " + (p.declaredAccruedAccount ?? "—"), p.signals.join(" ; ") || "Aucun"]]);
    const otherEquity = p.otherEquity ? "<p>Classement dettes / autres fonds propres (moteur C09) : " + esc(p.otherEquity.category) + " — " + esc(p.otherEquity.reasons.join(" ")) + (p.otherEquity.missing.length ? " Manquant : " + esc(p.otherEquity.missing.join(" ; ")) : "") + " Articles : " + esc(p.otherEquity.articles.join(", ")) + "</p>" : "";
    const exclusion = p.exclusion ? "<p><strong>Exclu et nommé :</strong> " + esc(p.exclusion.reason) + "</p>" : "";
    const bridge = r.status === "excluded" ? "" : table(["Ouverture", "Tirages", "Remboursements", "Attendu", "GL clôture", "Résidu (GL − attendu)", "Confirmation − GL"],
      [[amount(r.opening), amount(r.draws), amount(r.repaid), amount(r.expectedClosing), amount(r.closing), amount(r.residual), amount(r.confirmationDifference)]]);
    const dues = r.dues.length ? table(["Échéance", "Intervalle", "Version", "Principal", "Intérêt échéancier", "Intérêt recalculé", "Intérêt GL", "Frais échéancier / GL / payés", "Points"],
      r.dues.map(d => [d.dueDate + " · " + d.id + (d.kind === "early" ? " · anticipé" : ""), d.start + " → " + d.end, d.contractVersion + (d.versionInForce && d.versionInForce !== d.contractVersion ? " (en vigueur : " + d.versionInForce + ")" : ""),
        d.principal.amount, amount(d.providedInterest), amount(d.calculatedInterest.amount), amount(d.glInterest), amount(d.fees) + " / " + amount(d.glFees) + " / " + amount(d.paidFees), d.issues.map(i => i.text).join(" ; ") || "Concordant"])) : "";
    const segments = [...r.dues.flatMap(d => d.calculatedInterest.segments.map(s => [d.id, s])), ...r.accrued.segments.map(s => ["Intérêts courus", s])] as [string, LoanResult["rows"][number]["accrued"]["segments"][number]][];
    const segmentTable = segments.length ? table(["Calcul", "Segment", "Principal", "Taux", "Jours / convention", "Version", "Source du taux"],
      segments.map(([label, s]) => [label, s.start + " → " + s.end, s.principal?.amount ?? (s.amount ? s.amount.amount + " (GL)" : "—"), s.rateLabel, s.days === null ? "—" : s.days + " · " + s.dayCount, s.version ?? "—",
        s.fixingRowId ? (byRow.get(s.fixingRowId) ? source(byRow.get(s.fixingRowId)!) : s.fixingRowId) : s.contractRowId ? "Contrat (version citée)" : "—"])) : "";
    const accrued = r.status === "excluded" ? "" : table(["Intérêts courus recalculés", "GL", "GL − recalculé", "Base"], [[amount(r.accrued.amount), amount(r.bookedAccrued), amount(r.accruedDifference), r.accrued.reason]]);
    const clauses = r.clauseRowIds.length ? table(["Clause", "Nature", "Lecture", "Définition contractuelle", "Seuil (texte du contrat)", "Date de test", "Source"],
      r.clauseRowIds.map(id => { const f = byRow.get(id)!, d = f.details as Record<string, unknown>; return [String((d.source as { clause: string }).clause), d.kind === "guarantee" ? "Garantie" : "Covenant",
        d.reading === "unread" ? "Non lu" : d.reading === "read" ? "Lu" : "Qualifié" + (d.reader ? " par " + d.reader : ""), d.definition ?? "Non transcrite", d.threshold ?? "Non transcrit", d.testDate ?? "Non transcrite", source(f)]; })) + "<p>Aucun ratio calculé ; aucune conformité de financement déduite.</p>" : "";
    return "<section><h2>" + esc(r.name) + "</h2><p>" + esc(r.id) + " · " + esc(r.lender) + " · " + STATUS[r.status] + "</p>" + presentation + otherEquity + exclusion + bridge + dues + segmentTable + accrued + clauses
      + (r.issues.length ? "<ul>" + r.issues.map(i => "<li>" + esc(i.text) + "</li>").join("") + "</ul>" : "") + "</section>";
  }).join("");
  const framing = result.framing.status === "not_provided" ? "<p>Balance non fournie : périmètre non cadré.</p>"
    : table(["Compte", "Libellé", "Balance", "GL des contrats du pack", "Écart (balance − GL)", "Contrats"], result.framing.rows.map(f => [f.account, f.label ?? "—", amount(f.balance), amount(f.ledger), amount(f.difference), f.contractIds.join(", ") || "Aucun"]));
  const rules = "<p>" + esc(result.rules.label) + " — " + esc(result.rules.reason) + "</p>" + table(["Article", "Localisation", "Contenu lu"], result.rules.articles.map(a => [a.ref, a.locator, a.note]))
    + table(["Édition lue", "SHA-256"], result.rules.editions.map(e => [e.url, e.sha256 ?? "non lue"])) + "<p>Autres fonds propres : " + esc(result.presentationRegime.meaning) + "</p>";
  const conventions = "<p>Conventions de jours reconnues (paramètres de contrat, formules de la méthode) : " + Object.entries(DAY_COUNT_DEFINITIONS).map(([k, v]) => esc(k + " — " + v)).join(" ; ") + ". " + esc(INTERVAL_CONVENTION_LABEL) + "</p>";
  const review = run.approval ? approvalLabel(run.approval) : "Aucune relecture enregistrée sur cette version";
  const html = "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>PROBANT · Emprunts</title><style>body{font:14px/1.5 system-ui;margin:30px;color:#17243b}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #aab5c4;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}thead{display:table-header-group}section{break-inside:avoid;margin:24px 0}@media print{body{margin:0}}</style>"
    + "<h1>Emprunts · diagnostic de la version " + run.version + "</h1><p>Dossier " + esc(run.scope.dossierId) + " · exercice " + esc(run.period.startDate) + " → " + esc(run.period.closingDate) + " · revue au " + esc(run.period.asOfDate) + " · EUR · état " + esc(STATES[run.state] ?? run.state) + " · règle loans.review " + esc(result.ruleVersion) + "</p>" + standingNotice(run, standing)
    + "<p><strong>" + OUTCOME[result.outcome] + "</strong> · " + result.coverage.selected + " / " + result.coverage.denominator + " unités (" + result.coverage.contracts + " contrats, " + result.coverage.dues + " échéances de l’exercice).</p>"
    + "<p>Relecture : " + esc(review) + ". Diagnostic de revue : ni opinion sur les comptes, ni dette omise affirmée, ni conformité de financement déduite. Originaux non inclus ; un hash local n’est pas une signature.</p>"
    + "<h2>Texte applicable</h2>" + rules + conventions + body + "<h2>Cadrage du périmètre</h2>" + framing + "<p>" + esc(result.framing.convention) + "</p>"
    + (result.framingIssues.length ? "<ul>" + result.framingIssues.map(i => "<li>" + esc(i.text) + "</li>").join("") + "</ul>" : "")
    + "<h2>Points et décisions</h2>" + table(["Point", "Montant du point", "Décision citée"], run.notes.map(n => [n.text, amount(n.amount), n.resolution?.text ?? "À traiter"]))
    + "<h2>Conclusion</h2><p>" + esc(run.conclusion ?? "Conclusion absente") + "</p>"
    + "<h2>Sources figées</h2>" + table(["Source", "Document / clause / pack / date", "Fichier", "Version (SHA-256)", "Ligne"], facts.map(f => [LOAN_LABELS[f.type], source(f), f.fileName, f.hash, f.line ?? "—"]))
    + "<h2>Limites</h2><ul>" + result.limitations.map(l => "<li>" + esc(l) + "</li>").join("") + "</ul><p>Empreinte locale de la version : " + contentHash(run) + "</p></html>";
  return { html, json: JSON.stringify({ schemaVersion: "loans-diagnostic-1", snapshotHash: contentHash(run), ...(standing ? { standing } : {}), run, originalsIncluded: false }, null, 2) };
}

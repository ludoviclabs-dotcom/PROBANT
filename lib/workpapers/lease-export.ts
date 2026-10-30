import type { Money } from "@/lib/canonical-model/money";
import { buildCsv } from "@/lib/evidence/csv";
import { bundleJournalCsv } from "@/lib/ifrs/leases/journal-export";
import { LOGICAL_ACCOUNT_CATALOG } from "@/lib/ifrs/leases/adjustment";
import { leaseCharts } from "@/lib/ifrs/leases/portfolio";
import type { LeaseQualification, SourceFact } from "@/lib/ifrs/leases/qualification";
import { ANNEX_LIMITS, leaseReviewSummary, type LeaseReviewSummary } from "@/lib/ifrs/leases/review-summary";
import type { AdjustmentBundle } from "@/lib/ifrs/shared/bundle";
import { canonicalJson, stableSha256 } from "@/lib/synthesis/canonical";
import type { LeaseResult } from "./lease-review";
import { contentHash, type WorkpaperRun } from "./model";

/**
 * Exports de la feuille « Locations IFRS 16 » (L16-05, `ifrs16-export-1`) : JSON canonique, CSV des contrats, échéanciers, ponts et journal,
 * rapport HTML imprimable, chacun avec le même manifeste. Le contenu métier (contexte, sources, population, hypothèses, règle, calcul, journal,
 * décisions, limites) est séparé des métadonnées d'émission (date, auteur, format) : une même version donne la même empreinte métier.
 * - `diagnostic` : toute version, même bloquée ou non revue ; montants partiels et inconnus montrés sans total complet.
 * - `reviewed` : version approuvée ou verrouillée, dernière révision, sources et règle à jour ; « revu sur ce périmètre », jamais « conforme IFRS ».
 * Aucune pièce binaire embarquée : les sources sont citées par version et empreinte. Pas de PDF : le HTML est imprimable par l'utilisateur.
 */
export const LEASE_EXPORT_VERSION = "ifrs16-export-1";
export const LEASE_EXPORT_FORMATS = ["json", "html", "contracts_csv", "schedules_csv", "bridges_csv", "journal_csv"] as const;
export type LeaseExportFormat = typeof LEASE_EXPORT_FORMATS[number];
export type LeaseExportKind = "diagnostic" | "reviewed";
export interface LeaseExportSource { importId: string; documentVersionId: string; documentType: string; fileName: string; sha256: string; rows: number; approvedAt: string | null }
export interface LeaseExportInput {
  run: WorkpaperRun; result: LeaseResult | null; qualification: LeaseQualification | null; facts: readonly SourceFact[]; bundle: AdjustmentBundle | null;
  sources: LeaseExportSource[]; standing: { latestRevision: boolean; sourcesCurrent: boolean; ruleCurrent: boolean };
  kind: LeaseExportKind; format: LeaseExportFormat; emission: { exportedAt: string; exportedBy: string };
}

/** Un export « revu » n'existe que pour une version revue, à jour, de la dernière révision ; sinon le motif dit quoi faire. */
export function assertReviewedExport(run: WorkpaperRun, standing: LeaseExportInput["standing"]) {
  if (!["approved", "locked"].includes(run.state) || !run.approval) throw new Error("L16_EXPORT_NOT_REVIEWED");
  if (!standing.latestRevision) throw new Error("L16_REVISION_REPLACED");
  if (!standing.sourcesCurrent) throw new Error("L16_SOURCE_REPLACED_REVISION_REQUIRED");
  if (!standing.ruleCurrent) throw new Error("L16_RULE_REPLACED_REVISION_REQUIRED");
}

const STATEMENT = {
  diagnostic: "Export diagnostic — version non revue ou non à jour : montants partiels et inconnus montrés tels quels, aucun total présenté comme complet",
  reviewed: "Revu sur ce périmètre — relecture personnelle nommée de la version exportée ; ce n'est ni une conformité IFRS ni une annexe exhaustive",
} as const;

function business(i: LeaseExportInput) {
  const { run, result, bundle } = i, review: LeaseReviewSummary = leaseReviewSummary(run, result, i.qualification, i.facts, bundle), charts = result ? leaseCharts(result) : null;
  const schedules = (result?.contracts ?? []).filter(c => c.schedule).flatMap(c => c.schedule!.map(r => ({ contractId: c.contractId, result: c.result, t: r.t, dueDate: r.dueDate,
    undiscountedPayment: r.payment, openingDebt: r.openingDebt, interest: r.interest, principal: r.principal, closingDebt: r.closingDebt })));
  return {
    exportVersion: LEASE_EXPORT_VERSION, kind: i.kind, statement: STATEMENT[i.kind],
    context: { scope: run.scope, period: run.period, sheet: { runId: run.id, rootId: run.rootId, revision: run.revision, version: run.version, state: run.state, contentHash: contentHash(run) },
      template: { id: run.template.id, version: run.template.version }, rule: result?.rule ?? (run.template.rule ? { id: run.template.rule.id, version: run.template.rule.version } : null),
      engineVersion: result?.engineVersion ?? null, standing: i.standing },
    sources: [...i.sources].sort((a, b) => (a.importId < b.importId ? -1 : 1)),
    population: run.population ? { hash: run.population.hash, unit: run.population.unit, size: run.population.items.length } : null,
    selection: run.selection ? { method: run.selection.method, criteria: run.selection.criteria, size: run.selection.selectedIds.length, exclusions: run.selection.exclusions } : null,
    hypotheses: run.leaseWork ?? null,
    calculation: result ? { outcome: result.outcome, arithmetic: result.arithmetic, portfolio: result.portfolio, coverage: result.coverage,
      contracts: result.contracts.map(c => ({ contractId: c.contractId, version: c.version, status: c.status, result: c.result, resultReasons: c.resultReasons, exact: c.exact ?? null, closing: c.closing ?? null,
        framing: c.framing.status, adjustment: c.adjustment })) } : null,
    blocked: result ? null : { execution: run.result?.execution ?? "not_run", blockedControls: run.result?.blockedControls ?? [] },
    schedules,
    bridges: { debt: charts?.debtBridge ?? null, rou: charts?.rouBridge ?? null, byPoste: result?.bridge ?? null },
    journal: bundle ? { status: bundle.status, bundleHash: bundle.bundleHash, logicalId: bundle.logicalId, taxStatus: bundle.taxStatus, lines: bundle.lines, totals: result?.bundleTotals ?? null } : null,
    decisions: { notes: run.notes.map(n => ({ id: n.id, text: n.text, blocking: n.blocking, amount: n.amount, resolution: n.resolution ?? null })), conclusion: run.conclusion ?? null, submittedHash: run.submittedHash ?? null,
      approval: run.approval ? { actorId: run.approval.actorId, at: run.approval.at, kind: run.approval.kind ?? null, reviewerName: run.approval.reviewerName ?? null, note: run.approval.note, snapshotHash: run.approval.snapshotHash } : null,
      locked: run.state === "locked", posting: "Comptabilisation non documentée par la feuille : seule une pièce citée au dossier de clôture la documente ; le verrouillage ne vaut pas comptabilisé" },
    review,
    limits: [...ANNEX_LIMITS, ...(result?.limitations ?? []), "Export de la population figée entière : aucune vue filtrée", "Pièces sources non embarquées : citées par version de fichier et empreinte"],
  };
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);
const eur = (m: Money | null | undefined) => {
  if (!m) return "—";
  const neg = m.amount.startsWith("-"), [w, c] = m.amount.replace("-", "").split(".");
  return (neg ? "−" : "") + w.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + c + " €";
};
const day = (iso: string | null | undefined) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : esc(iso ?? "—");
function table(caption: string, head: string[], rows: unknown[][], numeric: number[] = []) {
  return `<table><caption>${esc(caption)}</caption><thead><tr>${head.map((h, i) => `<th scope="col"${numeric.includes(i) ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${head.length}">Aucune ligne.</td></tr>`}</tbody></table>`;
}

function html(b: ReturnType<typeof business>, hash: string, emission: LeaseExportInput["emission"]) {
  const ctx = b.context, sheet = ctx.sheet, period = ctx.period, p = b.review.portfolio, head = `Dossier ${ctx.scope.dossierId} · exercice ${day(period.startDate)} → ${day(period.closingDate)} · feuille r${sheet.revision} · v${sheet.version}`;
  const calc = b.calculation;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PROBANT — Locations IFRS 16 — ${esc(b.kind === "reviewed" ? "export revu" : "export diagnostic")}</title><style>
body{font:13px/1.45 system-ui,sans-serif;color:#111;margin:24px;max-width:1100px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 6px;border-bottom:1px solid #999;break-after:avoid}
.ctx{color:#333;font-size:12px}.statement{border:1px solid #333;padding:8px 10px;margin:10px 0;font-weight:600}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table{border-collapse:collapse;width:100%;margin:6px 0 12px;font-size:12px}caption{text-align:left;color:#444;padding:2px 0 4px}th,td{border:1px solid #bbb;padding:3px 6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}thead{display:table-header-group}
tr{break-inside:avoid}code{font-size:11px;word-break:break-all}.emission{margin-top:28px;border-top:1px dashed #999;color:#555;font-size:11px}
@media print{body{margin:0}section{break-inside:auto}.ctx{position:static}}
</style></head><body>
<h1>Locations IFRS 16 — ${esc(b.kind === "reviewed" ? "revu sur ce périmètre" : "export diagnostic")}</h1><p class="ctx">${esc(head)} · mode ${esc(ctx.scope.mode === "demo" ? "scénario synthétique — simulation non revue" : "réel")}</p>
<p class="statement">${esc(b.statement)}</p>
<section><h2>Manifeste</h2>${table(head, ["Élément", "Valeur"], [["Version d'export", b.exportVersion], ["Empreinte métier", hash], ["Feuille", sheet.runId + " · lignée " + sheet.rootId + " · état " + sheet.state],
    ["Gabarit et règle", ctx.template.id + " " + ctx.template.version + (ctx.rule ? " · règle " + ctx.rule.id + " " + ctx.rule.version + ("basisStatus" in ctx.rule ? " (" + (ctx.rule.basisStatus === "validated" ? "validée" : "à revoir") + ")" : "") : "")],
    ["Moteur", ctx.engineVersion ?? "non exécuté"], ["Population figée", b.population ? b.population.size + " contrat(s) · " + b.population.hash : "non figée"],
    ["Sélection", b.selection ? b.selection.method + " · " + b.selection.criteria + " · " + b.selection.size + " contrat(s)" : "—"],
    ["Fraîcheur", (ctx.standing.latestRevision ? "dernière révision" : "révision remplacée") + " · sources " + (ctx.standing.sourcesCurrent ? "à jour" : "remplacées") + " · règle " + (ctx.standing.ruleCurrent ? "à jour" : "remplacée")],
    ["Retraitement", b.journal ? b.journal.status + " · " + b.journal.bundleHash : "aucun"]])}
${table("Sources figées (pièces non embarquées)", ["Type", "Fichier", "Version", "Empreinte", "Lignes", "Approuvée le"], b.sources.map(s => [s.documentType, s.fileName, s.documentVersionId, s.sha256, s.rows, s.approvedAt ?? "—"]), [4])}</section>
<section><h2>Synthèse de revue</h2>${table(head, ["Mesure", "Valeur"], [["Résultat de contrôle", p.outcome ?? "non calculé"], ["Contrats", p.population.contracts + " dont " + p.population.determined + " déterminé(s), " + p.population.undetermined + " sans montant déterminé"],
    ["Sous-total des contrats calculés", p.population.computedSubtotal ? "dette " + eur(p.population.computedSubtotal.debtClosing) + " · droit d'utilisation net " + eur(p.population.computedSubtotal.rouNetClosing) + " sur " + p.population.computedSubtotal.contracts + " contrat(s)" + (p.population.computedSubtotal.partial ? " — montants partiels" : "") : "aucun montant"],
    ["Points de revue", p.points.total + " · " + p.points.blockingOpen + " bloquant(s) ouvert(s) · " + p.points.resolved + " résolu(s)"], ["Conclusion", p.conclusion ?? "aucune"],
    ["Relecture", p.approval ? (p.approval.kind === "personal" ? "relecture personnelle nommée de " + (p.approval.reviewerName ?? "—") : "revue de " + p.approval.by) + " le " + p.approval.at : "aucune"], ["Impôt", "non calculé"]])}
${table("Par contrat", ["Contrat", "Statut", "Exceptions", "Durée (jugement)", "Taux (justification)", "Cadrage", "Résultat", "Retraitement", "Points ouverts"], b.review.contracts.map(c => [c.contractId + (c.version ? " " + c.version : ""), c.status,
    c.exceptions.map(e => e.code + " " + e.message).join(" ; ") || "—", (c.judgements.term.value ?? "—") + " mois · " + (c.judgements.term.text ?? "jugement absent"), (c.judgements.rate.value ?? "—") + (c.judgements.rate.basis ? " (" + c.judgements.rate.basis + ")" : "") + " · " + (c.judgements.rate.text ?? "justification absente"),
    c.framing ?? "—", c.result ? c.result + (c.determined ? "" : " — " + c.resultReasons.join(" ; ")) : "non calculé", c.adjustment.status ? c.adjustment.status + (c.adjustment.reason ? " — " + c.adjustment.reason : "") : "—", c.points.blockingOpen + " bloquant(s), " + c.points.open + " ouvert(s)"]))}</section>
<section><h2>Chiffres de clôture par contrat (moteur)</h2>${calc ? table(head + " · contrats sans montant : « — », jamais zéro", ["Contrat", "Résultat", "Dette d'ouverture", "Entrées", "Intérêts", "Loyers payés", "Dette de clôture", "Dotation", "Droit d'utilisation net"],
    calc.contracts.map(c => [c.contractId, c.result, eur(c.closing?.debtOpening), eur(c.closing?.additions), eur(c.closing?.interest), eur(c.closing?.payments), eur(c.closing?.debtClosing), eur(c.closing?.depreciation), eur(c.closing?.rouNetClosing)]), [2, 3, 4, 5, 6, 7, 8])
    : `<p>Calcul non disponible (${esc(b.blocked?.execution)}) : ${esc(b.blocked?.blockedControls.join(" ; ") || "aucun contrôle bloquant enregistré")}. Aucun montant.</p>`}</section>
<section><h2>Flux de trésorerie non actualisés, dette actualisée et principal par échéance</h2>${table(head + " · trois mesures distinctes : le loyer (flux non actualisé) n'est ni la dette ni le principal", ["Contrat", "Échéance", "Loyer — flux non actualisé", "Dette actualisée d'ouverture", "Intérêts", "Principal", "Dette actualisée de clôture"],
    b.schedules.map(r => [r.contractId + (r.result === "computed" ? "" : " (" + r.result + ")"), day(r.dueDate), eur(r.undiscountedPayment), eur(r.openingDebt), eur(r.interest), eur(r.principal), eur(r.closingDebt)]), [2, 3, 4, 5, 6])}</section>
<section><h2>Ponts</h2>${b.bridges.debt ? table(head + " · dette locative (contrats calculés)", ["Mouvement", "Montant"], [["Dette d'ouverture", eur(b.bridges.debt.opening)], ["Entrées", "+ " + eur(b.bridges.debt.additions)], ["Intérêts", "+ " + eur(b.bridges.debt.interest)], ["Loyers payés", "− " + eur(b.bridges.debt.payments)], ["Dette de clôture", eur(b.bridges.debt.closing)]], [1])
    + table(head + " · droit d'utilisation net, montré à part", ["Mouvement", "Montant"], [["Ouverture nette", eur(b.bridges.rou!.opening)], ["Entrées", "+ " + eur(b.bridges.rou!.additions)], ["Dotation", "− " + eur(b.bridges.rou!.depreciation)], ["Clôture nette", eur(b.bridges.rou!.closing)]], [1]) : "<p>Aucun contrat calculé : aucun pont.</p>"}
${b.bridges.byPoste ? table(head + " · pont PCG–IFRS par poste, jamais totalisé", ["Poste", "Base PCG", "Ajustements retenus", "Cible retraitée"], b.bridges.byPoste.rows.map(r => [r.label, eur(r.base), eur(r.adjustment), eur(r.target)]), [1, 2, 3]) : ""}</section>
<section><h2>Journal du retraitement</h2>${b.journal ? table(head + " · " + b.journal.status + " · impôt non calculé · sélection au dossier de clôture", ["Contrat", "Compte logique", "Nature", "Débit", "Crédit"],
    b.journal.lines.map(l => [l.contractId, LOGICAL_ACCOUNT_CATALOG[l.account].label, l.nature, l.side === "debit" ? eur(l.amount) : "", l.side === "credit" ? eur(l.amount) : ""]), [3, 4])
    + (b.journal.totals ? `<p>Total équilibré : débit ${esc(eur(b.journal.totals.debit))}, crédit ${esc(eur(b.journal.totals.credit))}.</p>` : "") : "<p>Aucun retraitement proposé.</p>"}</section>
<section><h2>Décisions</h2>${table(head, ["Point", "Bloquant", "Résolution"], b.decisions.notes.map(n => [n.text, n.blocking ? "oui" : "non", n.resolution ? n.resolution.text + " — " + n.resolution.at : "ouvert"]))}
<p>Conclusion : ${esc(b.decisions.conclusion ?? "aucune")}.</p><p>${esc(b.decisions.posting)}.</p></section>
<section><h2>Informations non couvertes et limites</h2><ul>${b.limits.map(l => `<li>${esc(l)}</li>`).join("")}</ul></section>
<p class="emission">Métadonnées d'émission, hors empreinte métier : exporté le ${esc(emission.exportedAt)} par ${esc(emission.exportedBy)}. Empreinte métier <code>${esc(hash)}</code>.</p>
</body></html>`;
}

const CSV = {
  contracts: ["export_version", "business_hash", "contract_id", "version", "status", "result", "amounts", "framing", "adjustment", "debt_opening", "additions", "interest", "payments", "debt_closing", "depreciation", "rou_net_closing"],
  schedules: ["export_version", "business_hash", "contract_id", "result", "t", "due_date", "undiscounted_payment", "discounted_debt_opening", "interest", "principal", "discounted_debt_closing"],
  bridges: ["export_version", "business_hash", "bridge", "line", "amount", "base", "adjustments", "target"],
};

/** Paquet d'un format : nom, type, contenu, empreinte métier et manifeste (identiques pour tous les formats de la même version). */
export function buildLeaseExport(i: LeaseExportInput) {
  if (i.kind === "reviewed") assertReviewedExport(i.run, i.standing);
  const b = business(i), businessHash = stableSha256(b), demo = i.run.scope.mode === "demo";
  const base = (demo ? "simulation-non-revue-" : "") + "locations-ifrs16-" + i.run.scope.dossierId.slice(0, 8) + "-r" + i.run.revision + "v" + i.run.version + "-" + (i.kind === "reviewed" ? "revu" : "diagnostic");
  const manifest = { exportVersion: LEASE_EXPORT_VERSION, businessHash, kind: i.kind, context: b.context, sources: b.sources, population: b.population, journal: b.journal ? { status: b.journal.status, bundleHash: b.journal.bundleHash } : null,
    decisions: { approval: b.decisions.approval, locked: b.decisions.locked }, limits: b.limits };
  const tag = { export_version: LEASE_EXPORT_VERSION, business_hash: businessHash }, a = (m: Money | null | undefined) => m?.amount ?? "";
  const calc = b.calculation;
  const out: Record<LeaseExportFormat, () => { fileName: string; mediaType: string; content: string }> = {
    json: () => ({ fileName: base + ".json", mediaType: "application/json", content: canonicalJson({ emission: { ...i.emission, format: "json" }, businessHash, manifest, business: b }) }),
    html: () => ({ fileName: base + ".html", mediaType: "text/html;charset=utf-8", content: html(b, businessHash, i.emission) }),
    contracts_csv: () => ({ fileName: base + "-contrats.csv", mediaType: "text/csv;charset=utf-8", content: buildCsv(CSV.contracts, (calc?.contracts ?? b.review.contracts.map(c => ({ contractId: c.contractId, version: c.version, status: c.status, result: "non calculé", closing: null, framing: c.framing, adjustment: c.adjustment }))).map(c => ({ ...tag,
      contract_id: c.contractId, version: c.version, status: c.status, result: c.result, amounts: c.closing ? "déterminés" : "aucun montant déterminé", framing: c.framing ?? "", adjustment: c.adjustment?.status ?? "",
      debt_opening: a(c.closing?.debtOpening), additions: a(c.closing?.additions), interest: a(c.closing?.interest), payments: a(c.closing?.payments), debt_closing: a(c.closing?.debtClosing), depreciation: a(c.closing?.depreciation), rou_net_closing: a(c.closing?.rouNetClosing) }))) }),
    schedules_csv: () => ({ fileName: base + "-echeanciers.csv", mediaType: "text/csv;charset=utf-8", content: buildCsv(CSV.schedules, b.schedules.map(r => ({ ...tag, contract_id: r.contractId, result: r.result, t: r.t, due_date: r.dueDate,
      undiscounted_payment: r.undiscountedPayment.amount, discounted_debt_opening: r.openingDebt.amount, interest: r.interest.amount, principal: r.principal.amount, discounted_debt_closing: r.closingDebt.amount }))) }),
    bridges_csv: () => ({ fileName: base + "-ponts.csv", mediaType: "text/csv;charset=utf-8", content: buildCsv(CSV.bridges, [
      ...(b.bridges.debt ? Object.entries(b.bridges.debt).map(([line, m]) => ({ ...tag, bridge: "dette", line, amount: m.amount })) : []),
      ...(b.bridges.rou ? Object.entries(b.bridges.rou).map(([line, m]) => ({ ...tag, bridge: "droit_utilisation_net", line, amount: m.amount })) : []),
      ...(b.bridges.byPoste ? b.bridges.byPoste.rows.map(r => ({ ...tag, bridge: "poste_pcg_ifrs", line: r.poste, base: a(r.base), adjustments: a(r.adjustment), target: a(r.target) })) : [])]) }),
    journal_csv: () => { if (!i.bundle) throw new Error("L16_EXPORT_NO_ADJUSTMENT"); return { fileName: base + "-journal.csv", mediaType: "text/csv;charset=utf-8", content: bundleJournalCsv(i.bundle) }; },
  };
  return { ...out[i.format](), businessHash, manifest };
}

import { money } from "@/lib/canonical-model/money";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { ImportBatch } from "./imports";
import type { KnownAmount } from "@/lib/canonical-model/money";
import type { NoteCitation, WorkpaperScope } from "./model";
import type { Principal } from "./policy";
import { formatCents, PV_FINDING_LABELS, PV_LIMITATIONS, PV_METHOD_TEXT, PV_MOVEMENT_LABELS, PV_PIECE_LABELS, PV_RUBRIC_FOR, PV_RUBRIC_LABELS, PV_TREATMENT_LABELS, provisionResultSchema, provisionWorkSchema,
  type ProvisionAccount, type ProvisionCitation, type ProvisionCitationInput, type ProvisionDraft, type ProvisionEventResult, type ProvisionExceptionCode, type ProvisionResult, type ProvisionWork } from "./provision-contract";
import { buildProvisionFacts, type PvFact } from "./provision-sources";

export * from "./provision-contract";
/** A citation names a frozen document version and, optionally, one of its rows; file name, hash and locator are resolved here. */
export function resolveProvisionCitation(batches: ImportBatch[], input: ProvisionCitationInput): ProvisionCitation {
  const batch = batches.find(b => b.document.id === input.documentId);
  if (!batch) throw new Error("PV_CITATION_SOURCE_REQUIRED");
  const row = input.rowId ? batch.rows.find(r => r.id === input.rowId) : undefined;
  if (input.rowId && !row) throw new Error("PV_CITATION_ROW_INVALID");
  return { documentVersionId: batch.document.id, importId: batch.id, fileName: batch.document.fileName, sha256: batch.document.byteHash,
    ...(row ? { rowId: row.id, ...(row.locator.row ? { row: row.locator.row } : {}), ...(row.locator.cell ? { cell: row.locator.cell } : {}), ...(row.locator.page ? { page: row.locator.page } : {}), ...(row.locator.zone ? { zone: row.locator.zone } : {}) } : {}) };
}
export const provisionNoteCitation = (c: ProvisionCitation): NoteCitation => ({ documentVersionId: c.documentVersionId, importId: c.importId, fileName: c.fileName, sha256: c.sha256,
  ...(c.rowId ? { rowId: c.rowId } : {}), ...(c.row ? { row: c.row } : {}), ...(c.page ? { page: c.page } : {}), ...(c.zone ? { zone: c.zone } : {}) });
/** The server stamps the preparer's statement on the lawyers' information against the frozen sources; the browser never types a file name or a hash. */
export function stampProvisionWork(input: { imports: ImportBatch[]; draft: ProvisionDraft; actor: Principal; at: string }): ProvisionWork {
  const l = input.draft.lawyers;
  return provisionWorkSchema.parse({ schemaVersion: "provisions-1", lawyers: l.status === "obtained" ? { status: "obtained", citation: resolveProvisionCitation(input.imports, l.citation) } : l,
    configuredBy: input.actor.id, configuredAt: input.at });
}

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const known = (n: bigint): KnownAmount => ({ kind: "known", value: money(n) });
const unknown = (reason: string): KnownAmount => ({ kind: "unknown", reason });
const line = (f: PvFact) => ({ importId: f.importId, rowId: f.rowId, documentVersionId: f.documentVersionId, fileName: f.fileName, row: f.locator.row ?? null, key: f.key, amountCents: f.amountCents, date: f.date });
const where = (f: PvFact) => f.fileName + (f.locator.row ? " ligne " + f.locator.row : "");
const dateFr = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
const fmt = (n: bigint | string, signed = false) => formatCents(String(n), { signed });
const CHRONO_ORDER = ["naissance", "piece", "estimation", "decision", "mouvement", "annexe", "cloture"];

/**
 * Provisions and commitments register: documented bridges and comparisons only. Every amount is in euro cents; an
 * unknown amount stays null, never zero; a difference is a difference to examine, never a validated anomaly.
 */
export function evaluateProvisions(scope: WorkpaperScope, period: AccountingPeriod, imports: ImportBatch[], runId: string, work: ProvisionWork): ProvisionResult {
  const w = provisionWorkSchema.parse(work), facts = buildProvisionFacts(scope, period, imports, runId), start = period.startDate, closing = period.closingDate;
  const supports = facts.supports ?? [], citable = (ref: string) => !!ref && supports.some(s => s.piece === ref);
  type Exception = ProvisionResult["exceptions"][number];
  const exceptions: Exception[] = [];
  const events: ProvisionEventResult[] = facts.events.map(e => {
    const findings: ProvisionExceptionCode[] = [];
    const raise = (code: ProvisionExceptionCode, idSuffix: string, message: string, amount: KnownAmount, sensitive = false) => {
      findings.push(code);
      exceptions.push({ id: code + ":" + e.eventId + idSuffix, code, label: PV_FINDING_LABELS[code] + " — " + e.eventId + " " + e.label, message, eventId: e.eventId, amount, sensitive });
    };
    let state: ProvisionEventResult["state"], inScope = true, reason = "";
    if (e.date > closing) { state = "exclu"; inScope = false; reason = "Événement né après la clôture (le " + dateFr(e.date) + ") : hors population de l’exercice. Son incidence éventuelle relève de la revue des événements postérieurs, hors de ce test."; }
    else if (e.closedDate && e.closedDate < start) { state = "exclu"; inScope = false; reason = "Événement clos avant l’ouverture de l’exercice (le " + dateFr(e.closedDate) + ") : hors population."; }
    else if (e.closedDate && e.closedDate <= closing) state = "clos";
    else state = e.date >= start ? "nouveau" : "ouvert";
    const moves = (facts.movements ?? []).filter(m => m.eventId === e.eventId), estimates = (facts.estimates ?? []).filter(x => x.eventId === e.eventId);
    const retained = estimates.find(x => x.retained) ?? null, opening = BigInt(e.amountCents), declared = e.declaredClosingCents === null ? null : BigInt(e.declaredClosingCents);
    const hasProvision = e.treatment === "provision" || opening !== 0n || moves.length > 0 || (declared !== null && declared !== 0n);
    const total = (kind: string) => facts.movements ? sum(moves.filter(m => m.kind === kind).map(m => BigInt(m.amountCents))) : null;
    const dot = total("dotation"), util = total("utilisation"), rep = total("reprise");
    const computed = hasProvision && dot !== null && util !== null && rep !== null ? opening + dot - util - rep : null;
    const bridgeDiff = computed !== null && declared !== null ? declared - computed : null;
    let estimateDiff: bigint | null = null;
    const annexLines = (facts.annex ?? []).filter(a => a.eventId === e.eventId);
    const expected = ["passif_eventuel", "engagement_hors_bilan", "passif_non_comptabilise"].includes(e.treatment) && state !== "clos";
    const annex: ProvisionEventResult["annex"] = { status: !facts.annex ? "not_provided" : annexLines.length ? "present" : expected ? "missing" : "not_expected", expected, lines: [] };
    if (inScope) {
      if (hasProvision && computed === null) raise("BRIDGE_UNKNOWN", "", "Journal des mouvements de provisions non approuvé : la provision de clôture calculée reste inconnue (jamais réputée égale à l’ouverture ni à la clôture déclarée).", unknown("Provision de clôture inconnue"));
      if (bridgeDiff !== null && bridgeDiff !== 0n) raise("BRIDGE_DIFFERENCE", "", "Ouverture " + fmt(opening) + " + dotations " + fmt(dot!) + " − utilisations " + fmt(util!) + " − reprises " + fmt(rep!) + " = " + fmt(computed!) + " ; clôture déclarée au registre " + fmt(declared!) + " ; différence " + fmt(bridgeDiff, true) + " à expliquer.", known(bridgeDiff));
      if (state === "clos" && computed !== null && computed !== 0n) raise("CLOSED_WITH_BALANCE", "", "Événement clos le " + dateFr(e.closedDate!) + " ; provision calculée à la clôture " + fmt(computed) + ". Une provision est rapportée au résultat quand les raisons qui l’ont motivée ont cessé d’exister (PCG art. 323-12) : à examiner, sans conclusion automatique.", known(computed));
      if (e.treatment !== "provision" && computed !== null && computed !== 0n) raise("TREATMENT_BALANCE_MISMATCH", "", "Traitement retenu « " + PV_TREATMENT_LABELS[e.treatment] + " » alors qu’une provision calculée de " + fmt(computed) + " subsiste à la clôture : à examiner.", known(computed));
      // Estimate / booking: only for events the entity treats as a provision, and never for a closed event whose provision is fully released.
      if (e.treatment === "provision" && !(state === "clos" && computed === 0n)) {
        if (!retained) raise("ESTIMATE_MISSING", "", facts.estimates ? "Aucune estimation retenue documentée pour cet événement : la comparaison estimation / écriture n’est pas réalisée (non concluant ; la provision n’est jamais réputée égale à l’estimation)." : "Estimations documentées non fournies : la comparaison estimation / écriture n’est pas réalisée.", unknown("Estimation documentée absente"));
        else if (computed !== null) {
          estimateDiff = BigInt(retained.amountCents) - computed;
          if (estimateDiff !== 0n) raise("ESTIMATE_DIFFERENCE", "", "Estimation retenue " + fmt(retained.amountCents) + " (scénario « " + retained.scenario + " », pièce " + retained.pieceRef + ", " + where(retained) + ") ; provision de clôture calculée " + fmt(computed) + " ; différence " + fmt(estimateDiff, true) + " à examiner. Ni anomalie validée ni correction proposée : la probabilité et le traitement comptable restent des décisions humaines.", known(estimateDiff), e.confidential);
        }
      }
      for (const m of moves) if (!citable(m.pieceRef)) {
        const what = m.kind === "reprise" ? "Reprise sans justificatif" : m.kind === "utilisation" ? "Utilisation sans justificatif" : "Dotation sans justificatif";
        findings.push("MOVEMENT_UNSUPPORTED");
        exceptions.push({ id: "MOVEMENT_UNSUPPORTED:" + e.eventId + ":" + m.key, code: "MOVEMENT_UNSUPPORTED", label: what + " — " + e.eventId + " " + e.label, eventId: e.eventId, sensitive: false, amount: known(BigInt(m.amountCents)),
          message: PV_MOVEMENT_LABELS[m.kind] + " de " + fmt(m.amountCents) + " du " + dateFr(m.date) + " (" + where(m) + ") : " + (m.pieceRef ? "pièce « " + m.pieceRef + " » absente des pièces citables approuvées" : "aucune pièce référencée") + "." + (m.kind === "reprise" ? " Le fondement de la reprise (raisons ayant cessé d’exister, PCG art. 323-12) reste à documenter." : "") });
      }
      if (!e.decisionPiece || !citable(e.decisionPiece)) raise("DECISION_UNSUPPORTED", "", "Traitement « " + PV_TREATMENT_LABELS[e.treatment] + " » retenu par l’entité " + (e.decisionPiece ? "en citant la pièce « " + e.decisionPiece + " », absente des pièces citables approuvées." : "sans pièce de décision citée.") + " La décision reste à documenter.", unknown("Décision non étayée"));
      if (facts.annex && expected && !annexLines.length) raise("ANNEX_MISSING", "", e.treatment === "passif_eventuel" ? "Passif éventuel au registre, absent de l’annexe : mention prévue (PCG art. 322-5 et 832-13), sauf probabilité faible de sortie de ressources — appréciation humaine à documenter."
        : e.treatment === "engagement_hors_bilan" ? "Engagement hors bilan au registre (" + (e.commitmentCents === null ? "non chiffré" : fmt(e.commitmentCents)) + "), sans écriture et absent de l’annexe (PCG art. 836-1) : à examiner."
          : "Passif non comptabilisé faute d’évaluation fiable (PCG art. 322-4), absent de l’annexe (art. 832-14) : à examiner.", unknown("Information non publiée"));
      for (const a of annexLines) {
        const published = a.amountStatus === "publie" ? BigInt(a.amountCents) : null;
        const ref = e.treatment === "provision" ? { kind: "provision" as const, value: computed } : e.treatment === "engagement_hors_bilan" ? { kind: "commitment" as const, value: e.commitmentCents === null ? null : BigInt(e.commitmentCents) }
          : e.treatment === "passif_eventuel" ? { kind: "estimate" as const, value: retained ? BigInt(retained.amountCents) : null } : { kind: null, value: null };
        const diff = published !== null && ref.value !== null ? published - ref.value : null;
        annex.lines.push({ ...line(a), rubric: a.rubric, amountStatus: a.amountStatus, publishedCents: published === null ? null : String(published), referenceCents: ref.value === null ? null : String(ref.value), referenceKind: ref.value === null ? null : ref.kind, differenceCents: diff === null ? null : String(diff) });
        // A given commitment is published as given, a received one as received; other types accept either direction.
        const rubrics = e.treatment === "engagement_hors_bilan" && (e.type === "engagement_donne" || e.type === "engagement_recu") ? [e.type] : PV_RUBRIC_FOR[e.treatment];
        if (!rubrics.includes(a.rubric)) raise("ANNEX_RUBRIC_MISMATCH", ":" + a.key, "Annexe : rubrique « " + PV_RUBRIC_LABELS[a.rubric] + " » (" + where(a) + ") pour un événement traité en « " + PV_TREATMENT_LABELS[e.treatment] + " » : à examiner.", unknown("Rubrique à examiner"));
        if (diff !== null && diff !== 0n) raise("ANNEX_AMOUNT_DIFFERENCE", ":" + a.key, "Montant publié " + fmt(published!) + " (" + where(a) + ") ; " + (ref.kind === "provision" ? "provision de clôture calculée " : ref.kind === "commitment" ? "engagement au registre " : "estimation retenue ") + fmt(ref.value!) + " ; différence " + fmt(diff, true) + " à examiner.", known(diff), e.confidential && ref.kind === "estimate");
        if (a.amountStatus === "non_fourni_prejudice") raise("ANNEX_NOT_PROVIDED", ":" + a.key, "L’entité invoque le préjudice sérieux pour ne pas fournir l’information (PCG art. 832-13) : la nature générale du litige, le fait que l’information n’est pas fournie et sa raison doivent être indiqués — appréciation humaine.", unknown("Information non fournie"));
      }
    }
    const kindOf = (code: ProvisionExceptionCode[]) => findings.some(f => code.includes(f));
    const status: ProvisionEventResult["status"] = !inScope ? "excluded" : kindOf(["ESTIMATE_DIFFERENCE", "BRIDGE_DIFFERENCE", "CLOSED_WITH_BALANCE", "TREATMENT_BALANCE_MISMATCH"]) ? "difference"
      : kindOf(["ANNEX_MISSING", "ANNEX_AMOUNT_DIFFERENCE", "ANNEX_RUBRIC_MISMATCH"]) ? "annex_gap" : kindOf(["MOVEMENT_UNSUPPORTED", "DECISION_UNSUPPORTED"]) ? "unsupported"
        : kindOf(["ESTIMATE_MISSING", "BRIDGE_UNKNOWN", "ANNEX_NOT_PROVIDED"]) ? "inconclusive" : state === "clos" ? "closed" : hasProvision ? "consistent" : "no_entry";
    // The card gathers every piece of the event: those attached to it, and those its movements, estimates and decision cite.
    const refs = new Set([...supports.filter(s => s.eventId === e.eventId).map(s => s.piece), ...moves.map(m => m.pieceRef), ...estimates.map(x => x.pieceRef), e.decisionPiece].filter(Boolean));
    const pieces = supports.filter(s => refs.has(s.piece)).map(s => ({ ...line(s), kind: s.kind, label: s.label || null, confidential: s.confidential }));
    const chronology: ProvisionEventResult["chronology"] = [
      { date: e.date, kind: "naissance" as const, label: "Naissance de l’événement — " + e.label, ref: e.importId + ":" + e.rowId },
      ...supports.filter(s => refs.has(s.piece)).map(s => ({ date: s.date, kind: "piece" as const, label: PV_PIECE_LABELS[s.kind] + " " + s.piece + (s.label ? " — " + s.label : ""), ref: s.importId + ":" + s.rowId })),
      ...estimates.map(x => ({ date: x.date, kind: "estimation" as const, label: "Estimation « " + x.scenario + " » " + fmt(x.amountCents) + (x.retained ? " — retenue" : ""), ref: x.importId + ":" + x.rowId })),
      ...(e.decisionDate ? [{ date: e.decisionDate, kind: "decision" as const, label: "Décision : " + PV_TREATMENT_LABELS[e.treatment] + (e.decisionPiece ? " (pièce " + e.decisionPiece + ")" : ""), ref: null }] : []),
      ...moves.map(m => ({ date: m.date, kind: "mouvement" as const, label: PV_MOVEMENT_LABELS[m.kind] + " " + fmt(m.amountCents) + (m.pieceRef ? " — pièce " + m.pieceRef : " — sans pièce"), ref: m.importId + ":" + m.rowId })),
      ...annexLines.map(a => ({ date: a.date, kind: "annexe" as const, label: "Annexe — " + PV_RUBRIC_LABELS[a.rubric] + " : " + (a.amountStatus === "publie" ? fmt(a.amountCents) : a.amountStatus === "non_chiffre" ? "non chiffré" : "non fourni (préjudice invoqué)"), ref: a.importId + ":" + a.rowId })),
      ...(e.closedDate ? [{ date: e.closedDate, kind: "cloture" as const, label: "Clôture du dossier", ref: null }] : []),
    ].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : CHRONO_ORDER.indexOf(a.kind) - CHRONO_ORDER.indexOf(b.kind));
    return {
      eventId: e.eventId, label: e.label, type: e.type, treatment: e.treatment, state, inScope, reason, confidential: e.confidential, masked: false,
      birthDate: e.date, closedDate: e.closedDate, decisionDate: e.decisionDate, account: e.account,
      obligation: e.obligation, counterparty: e.counterparty || null, method: e.method || null, author: e.author, decision: e.decision || null,
      decisionPiece: e.decisionPiece ? { ref: e.decisionPiece, supported: citable(e.decisionPiece) } : null, register: line(e),
      bridge: hasProvision ? { opening: String(opening), dotations: dot === null ? null : String(dot), utilisations: util === null ? null : String(util), reprises: rep === null ? null : String(rep),
        computedClosing: computed === null ? null : String(computed), declaredClosing: declared === null ? null : String(declared), difference: bridgeDiff === null ? null : String(bridgeDiff), journal: !!facts.movements } : null,
      movements: moves.map(m => ({ ...line(m), kind: m.kind, account: m.account, pieceRef: m.pieceRef, supported: citable(m.pieceRef), justification: m.justification || null })),
      estimates: estimates.map(x => ({ ...line(x), scenario: x.scenario, retained: x.retained, method: x.method, author: x.author, pieceRef: x.pieceRef, supported: citable(x.pieceRef), appreciation: x.appreciation })),
      estimateCount: estimates.length, retainedEstimateCents: retained ? retained.amountCents : null, estimateDifferenceCents: estimateDiff === null ? null : String(estimateDiff), commitmentCents: e.commitmentCents,
      annex, chronology, pieces, status, findings: [...new Set(findings)].map(code => ({ code, label: PV_FINDING_LABELS[code] })),
    };
  });
  const inScope = events.filter(e => e.inScope);
  // Annex lines naming an event absent from the register: the register's completeness is to be examined.
  const annexOrphans = (facts.annex ?? []).filter(a => !facts.events.some(e => e.eventId === a.eventId)).map(a => ({ ...line(a), eventId: a.eventId, rubric: a.rubric, amountStatus: a.amountStatus, publishedCents: a.amountStatus === "publie" ? a.amountCents : null }));
  for (const a of annexOrphans) exceptions.push({ id: "ANNEX_EVENT_UNKNOWN:" + a.key, code: "ANNEX_EVENT_UNKNOWN", label: PV_FINDING_LABELS.ANNEX_EVENT_UNKNOWN + " — " + a.eventId, eventId: null, sensitive: false, amount: unknown("Rattachement à établir"),
    message: "Ligne d’annexe « " + PV_RUBRIC_LABELS[a.rubric] + " » (" + a.fileName + (a.row ? " ligne " + a.row : "") + ") rattachée à « " + a.eventId + " », absent du registre : l’exhaustivité du registre est à examiner." });
  if (!facts.annex && inScope.some(e => e.annex.expected)) exceptions.push({ id: "ANNEX_SOURCE_MISSING", code: "ANNEX_SOURCE_MISSING", label: PV_FINDING_LABELS.ANNEX_SOURCE_MISSING, eventId: null, sensitive: false, amount: unknown("Annexe non fournie"),
    message: "Annexe non approuvée : la comparaison événement / annexe n’est pas réalisée pour " + inScope.filter(e => e.annex.expected).length + " événement(s) sans écriture (passifs éventuels, engagements, passifs non comptabilisés)." });
  const litigation = inScope.filter(e => e.type === "litige").length;
  if (w.lawyers.status === "not_obtained" && litigation) exceptions.push({ id: "LAWYERS_INFO_MISSING", code: "LAWYERS_INFO_MISSING", label: PV_FINDING_LABELS.LAWYERS_INFO_MISSING, eventId: null, sensitive: false, amount: unknown("Informations des avocats non obtenues"),
    message: "Le registre comporte " + litigation + " litige(s) ; informations des avocats non obtenues (motif déclaré : " + w.lawyers.reason + "). Conséquences à tirer par le professionnel (NEP 501 §§ 07-08) ; aucune issue n’est déduite." });
  // Framing per provision account: register and movements against the ledger opening and closing balances.
  const accountIds = [...new Set([...facts.ledger.map(l => l.account), ...inScope.map(e => e.account).filter((a): a is string => !!a)])].sort();
  const movesOn = (account: string, kind: string) => facts.movements ? sum(facts.movements.filter(m => m.account === account && m.kind === kind).map(m => BigInt(m.amountCents))) : null;
  const accounts: ProvisionAccount[] = accountIds.map(account => {
    const evs = inScope.filter(e => e.account === account && e.bridge), gl = facts.ledger.find(l => l.account === account) ?? null;
    const regOpen = sum(evs.map(e => BigInt(e.bridge!.opening))), regClose = evs.some(e => e.bridge!.computedClosing === null) ? null : sum(evs.map(e => BigInt(e.bridge!.computedClosing!)));
    const dot = movesOn(account, "dotation"), util = movesOn(account, "utilisation"), rep = movesOn(account, "reprise");
    const raise = (code: ProvisionExceptionCode, message: string, amount: KnownAmount) => exceptions.push({ id: code + ":" + account, code, label: PV_FINDING_LABELS[code] + " — compte " + account, message, eventId: null, amount, sensitive: false });
    if (!gl) {
      raise("FRAMING_INCOMPLETE", "Compte " + account + " porté au registre, absent du grand livre approuvé : solde inconnu, jamais réputé nul.", unknown("Solde du grand livre inconnu"));
      return { account, label: "", events: evs.map(e => e.eventId), registerOpeningCents: String(regOpen), registerClosingCents: regClose === null ? null : String(regClose), dotations: dot === null ? null : String(dot), utilisations: util === null ? null : String(util), reprises: rep === null ? null : String(rep),
        ledgerOpeningCents: null, ledgerClosingCents: null, openingDifference: null, closingDifference: null, ledgerBridgeDifference: null, status: "ledger_missing" as const, ledger: null };
    }
    const glOpen = BigInt(gl.openingCents), glClose = BigInt(gl.amountCents), openingDiff = glOpen - regOpen, closingDiff = regClose === null ? null : glClose - regClose;
    const ledgerBridge = dot === null || util === null || rep === null ? null : glOpen + dot - util - rep - glClose;
    if (openingDiff !== 0n) raise("OPENING_FRAMING_DIFFERENCE", "Grand livre à l’ouverture " + fmt(glOpen) + " ; provisions d’ouverture au registre " + fmt(regOpen) + " ; écart " + fmt(openingDiff, true) + " à expliquer" + (evs.length ? "." : " : aucun événement du registre sur ce compte."), known(openingDiff));
    if (closingDiff !== null && closingDiff !== 0n) raise("FRAMING_DIFFERENCE", "Grand livre à la clôture " + fmt(glClose) + " ; provisions de clôture calculées au registre " + fmt(regClose!) + " ; écart " + fmt(closingDiff, true) + " à expliquer" + (evs.length ? "." : " : aucun événement du registre sur ce compte — exhaustivité du registre à examiner."), known(closingDiff));
    if (ledgerBridge !== null && ledgerBridge !== 0n) raise("LEDGER_BRIDGE_DIFFERENCE", "Grand livre : ouverture " + fmt(glOpen) + " + dotations " + fmt(dot!) + " − utilisations " + fmt(util!) + " − reprises " + fmt(rep!) + " = " + fmt(glOpen + dot! - util! - rep!) + " ; clôture " + fmt(glClose) + " ; différence " + fmt(-ledgerBridge, true) + " à expliquer.", known(-ledgerBridge));
    return { account, label: gl.label, events: evs.map(e => e.eventId), registerOpeningCents: String(regOpen), registerClosingCents: regClose === null ? null : String(regClose), dotations: dot === null ? null : String(dot), utilisations: util === null ? null : String(util), reprises: rep === null ? null : String(rep),
      ledgerOpeningCents: String(glOpen), ledgerClosingCents: String(glClose), openingDifference: String(openingDiff), closingDifference: closingDiff === null ? null : String(closingDiff), ledgerBridgeDifference: ledgerBridge === null ? null : String(-ledgerBridge),
      status: openingDiff !== 0n || (closingDiff !== null && closingDiff !== 0n) || (ledgerBridge !== null && ledgerBridge !== 0n) ? "difference" as const : closingDiff === null || ledgerBridge === null ? "incomplete" as const : "framed" as const, ledger: line(gl) };
  });
  // Provisions table by category (PCG art. 832-13): opening, increases, used and unused reversals, closing.
  const bridges = inScope.filter(e => e.bridge && e.account);
  const categories = ([["risques", "Provisions pour risques (151)", (a: string) => a.startsWith("151")], ["charges", "Provisions pour charges (152)", (a: string) => a.startsWith("152")], ["autres", "Autres comptes de provisions (15)", (a: string) => !a.startsWith("151") && !a.startsWith("152")]] as const).map(([category, label, test]) => {
    const evs = bridges.filter(e => test(e.account!)), moveSum = (kind: string) => facts.movements ? sum(facts.movements.filter(m => test(m.account) && m.kind === kind).map(m => BigInt(m.amountCents))) : null;
    const d = moveSum("dotation"), u = moveSum("utilisation"), r = moveSum("reprise");
    return { category, label, opening: String(sum(evs.map(e => BigInt(e.bridge!.opening)))), dotations: d === null ? null : String(d), utilisations: u === null ? null : String(u), reprises: r === null ? null : String(r),
      closing: evs.some(e => e.bridge!.computedClosing === null) ? null : String(sum(evs.map(e => BigInt(e.bridge!.computedClosing!)))) };
  }).filter(c => c.opening !== "0" || (c.closing !== null && c.closing !== "0") || [c.dotations, c.utilisations, c.reprises].some(x => x !== null && x !== "0"));
  const withBridge = inScope.filter(e => e.bridge), allMoves = (kind: string) => facts.movements ? String(sum(facts.movements.filter(m => m.kind === kind).map(m => BigInt(m.amountCents)))) : null;
  const declaredList = withBridge.filter(e => e.bridge!.declaredClosing !== null);
  const evidence = [...new Map([...facts.events, ...facts.ledger, ...(facts.movements ?? []), ...(facts.estimates ?? []), ...(facts.annex ?? []), ...supports].map(f => [f.proof.id, f.proof])).values()];
  return provisionResultSchema.parse({
    schemaVersion: "provisions-result-1", scope, runId, startDate: start, closingDate: closing, lawyers: w.lawyers,
    sources: { movements: !!facts.movements, estimates: !!facts.estimates, annex: !!facts.annex, support: !!facts.supports },
    events, accounts, categories, annexOrphans,
    totals: { opening: String(sum(withBridge.map(e => BigInt(e.bridge!.opening)))), dotations: allMoves("dotation"), utilisations: allMoves("utilisation"), reprises: allMoves("reprise"),
      computedClosing: withBridge.some(e => e.bridge!.computedClosing === null) ? null : String(sum(withBridge.map(e => BigInt(e.bridge!.computedClosing!)))),
      declaredClosing: declaredList.length ? String(sum(declaredList.map(e => BigInt(e.bridge!.declaredClosing!)))) : null,
      ledgerOpening: String(sum(facts.ledger.map(l => BigInt(l.openingCents)))), ledgerClosing: String(sum(facts.ledger.map(l => BigInt(l.amountCents)))),
      events: events.length, inScope: inScope.length, excluded: events.length - inScope.length, noEntry: inScope.filter(e => !e.bridge).length },
    exceptions, evidence, method: PV_METHOD_TEXT, limitations: PV_LIMITATIONS,
  });
}

import type { Money } from "@/lib/canonical-model/money";
import type { AdjustmentBundle } from "@/lib/ifrs/shared/bundle";
import type { LeaseResult, LeaseResultKind } from "@/lib/workpapers/lease-review";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import type { FramingStatus } from "./framing";
import type { ContractStatus, LeaseQualification, SourceFact, SourceProof } from "./qualification";

/**
 * Synthèse de revue de la feuille « Locations IFRS 16 » (L16-05), établie par le serveur pour la relecture personnelle nommée et pour l'export :
 * par contrat, données et périmètre, exceptions de qualification, jugements de durée et de taux avec leur source, cadrage, résultat
 * déterminé ou non, retraitement proposé ; pour le portefeuille, points de revue, retraitement, limites de l'annexe et fiscal non calculé.
 * Un point bloquant reste compté tant qu'il n'est pas résolu par une décision citée : une note seule ne le fait pas disparaître.
 */
export const LEASE_REVIEW_SUMMARY_VERSION = "ifrs16-review-1";
/** Informations que ni l'écran ni l'export ne couvrent : dites à chaque restitution, jamais déduites d'une absence. */
export const ANNEX_LIMITS = [
  "L'annexe IFRS 16 n'est pas générée : les tableaux fournis sont des aides de préparation sur le périmètre V1, pas une annexe exhaustive",
  "Aucun classement de la dette en courant et non courant n'est affirmé ; aucune présentation au bilan n'est décidée",
  "Flux non actualisés (loyers par échéance), dette actualisée et principal par échéance sont présentés séparément ; aucun ne remplace l'autre",
  "Impôt non calculé : effets avant impôt seulement, aucune incidence fiscale déduite",
  "Contrats hors périmètre V1, à compléter ou en diagnostic : sans montant, jamais comptés pour zéro",
] as const;

export interface Judgement { value: string | null; basis: string | null; text: string | null; proof: SourceProof | null }
export interface ContractReview {
  contractId: string; version: string | null; status: ContractStatus;
  exceptions: { code: string; effect: string; message: string }[];
  judgements: { term: Judgement; rate: Judgement };
  framing: FramingStatus | null; result: LeaseResultKind | null; determined: boolean; resultReasons: string[];
  adjustment: { status: "included" | "excluded" | "not_applicable" | null; reason: string | null; lines: number };
  points: { open: number; blockingOpen: number; resolved: number };
}
export interface PortfolioReview {
  sheet: { runId: string; revision: number; version: number; state: string };
  outcome: LeaseResult["outcome"] | null;
  population: { contracts: number; determined: number; undetermined: number; computedSubtotal: null | { contracts: number; debtClosing: Money; rouNetClosing: Money; partial: boolean } };
  points: { total: number; open: number; blockingOpen: number; resolved: number };
  adjustment: null | { status: AdjustmentBundle["status"]; bundleHash: string; contracts: number; lines: number; debit: Money; credit: Money; selection: string };
  conclusion: string | null; approval: null | { by: string; at: string; kind: string | null; reviewerName: string | null };
  tax: "not_computed"; annexLimits: readonly string[]; limitations: string[];
}
export interface LeaseReviewSummary { version: typeof LEASE_REVIEW_SUMMARY_VERSION; portfolio: PortfolioReview; contracts: ContractReview[] }

const notesOf = (run: WorkpaperRun, contractId: string) => run.notes.filter(n => n.id === "lease:" + contractId || n.id === "lease:cadrage:" + contractId);
/** Champ cité d'une source du contrat : la valeur, sa ligne et sa version de fichier ; absent reste absent. */
function field(facts: readonly SourceFact[], contractId: string, key: string) {
  const fact = facts.find(f => f.contractId === contractId && f.fields[key] !== undefined && f.fields[key] !== "");
  return fact ? { value: fact.fields[key], proof: fact.proof } : null;
}

export function leaseReviewSummary(run: WorkpaperRun, result: LeaseResult | null, qualification: LeaseQualification | null, facts: readonly SourceFact[], bundle: AdjustmentBundle | null): LeaseReviewSummary {
  const computed = new Map((result?.contracts ?? []).map(c => [c.contractId, c]));
  const ids = result ? result.contracts.map(c => c.contractId) : (qualification?.contracts ?? []).map(c => c.contractId);
  const qualified = new Map((qualification?.contracts ?? []).map(c => [c.contractId, c]));
  const contracts: ContractReview[] = ids.map(id => {
    const q = qualified.get(id), r = computed.get(id), notes = notesOf(run, id);
    const term = field(facts, id, "termMonths"), termText = field(facts, id, "termJudgement");
    const rate = field(facts, id, "annualEffectiveRate"), basis = field(facts, id, "rateBasis"), rateText = field(facts, id, "rateJustification");
    return { contractId: id, version: r?.version ?? q?.version ?? null, status: (r?.status ?? q?.status)!,
      exceptions: (r?.reasons ?? q?.reasons ?? []).filter(x => x.effect === "a_qualifier" || x.effect === "hors_scope_v1").map(x => ({ code: x.code, effect: x.effect, message: x.message })),
      judgements: { term: { value: term?.value ?? null, basis: null, text: termText?.value ?? null, proof: termText?.proof ?? term?.proof ?? null },
        rate: { value: rate?.value ?? null, basis: basis?.value ?? null, text: rateText?.value ?? null, proof: rateText?.proof ?? rate?.proof ?? null } },
      framing: r?.framing.status ?? null, result: r?.result ?? null, determined: r?.result === "computed", resultReasons: r?.resultReasons ?? [],
      adjustment: { status: r?.adjustment.status ?? null, reason: r?.adjustment.reason ?? null, lines: bundle?.lines.filter(l => l.contractId === id).length ?? 0 },
      points: { open: notes.filter(n => !n.resolution).length, blockingOpen: notes.filter(n => n.blocking && !n.resolution).length, resolved: notes.filter(n => n.resolution).length } };
  });
  const subtotal = result?.portfolio.computedSubtotal ?? null, determined = contracts.filter(c => c.determined).length;
  const lease = run.notes.filter(n => n.id.startsWith("lease:"));
  return { version: LEASE_REVIEW_SUMMARY_VERSION, contracts, portfolio: {
    sheet: { runId: run.id, revision: run.revision, version: run.version, state: run.state }, outcome: result?.outcome ?? null,
    population: { contracts: contracts.length, determined, undetermined: contracts.length - determined,
      computedSubtotal: subtotal ? { contracts: subtotal.contracts, debtClosing: subtotal.debtClosing, rouNetClosing: subtotal.rouNetClosing, partial: result!.contracts.some(c => c.result === "diagnostic" || c.status === "a_qualifier" || c.status === "hors_scope_v1") } : null },
    points: { total: lease.length, open: lease.filter(n => !n.resolution).length, blockingOpen: run.notes.filter(n => n.blocking && !n.resolution).length, resolved: lease.filter(n => n.resolution).length },
    adjustment: bundle && result?.bundleTotals ? { status: bundle.status, bundleHash: bundle.bundleHash, contracts: new Set(bundle.lines.map(l => l.contractId)).size, lines: bundle.lines.length, debit: result.bundleTotals.debit, credit: result.bundleTotals.credit,
      selection: "Sélection pour une base décidée au dossier de clôture, jamais par la feuille ; sélectionner ne prouve pas la comptabilisation" } : null,
    conclusion: run.conclusion ?? null,
    approval: run.approval ? { by: run.approval.actorId, at: run.approval.at, kind: run.approval.kind ?? null, reviewerName: run.approval.reviewerName ?? null } : null,
    tax: "not_computed", annexLimits: ANNEX_LIMITS, limitations: result?.limitations ?? [] } };
}

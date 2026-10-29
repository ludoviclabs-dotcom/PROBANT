import type { CycleFamily } from "./closing-contract";
import type { WorkpaperRun } from "./model";
import { equitySourcesCurrent } from "./capitaux-sources";
import { fiscalRelevance, fiscalSourcesCurrent } from "./fiscal-sources";
import { fixedAssetSourcesCurrent } from "./fixed-asset-sources";
import { LOAN_TYPES } from "./loan-review";
import { LEASE_TYPES } from "./lease-sources";
import { provisionSourcesCurrent } from "./provision-sources";
import { stockSourcesCurrent } from "./stock-sources";

/**
 * Observation adapters of the professional file (C14): each family says, with its own rule, whether the sources a sheet froze are still the current heads.
 * The rule is the one the sheet's own runtime applies (sourcesCurrent of its read view), per family or per procedure; nothing is recalculated and no engine runs here.
 */
export type SourceHead = { document_type: string; import_id: string };
type Rule = (run: WorkpaperRun, heads: SourceHead[]) => boolean;
/** Families whose runtime only checks that every frozen import is still a head (Clients, Achats, Equity, Participations, Exceptionnel, Trésorerie, Paie). */
const everyFrozenIsHead: Rule = (run, heads) => run.importIds.every(id => heads.some(h => h.import_id === id));
const RULES: Record<CycleFamily, Rule> = {
  clients: everyFrozenIsHead, cash: everyFrozenIsHead, hr: everyFrozenIsHead,
  fa: (run, heads) => fixedAssetSourcesCurrent(run.importIds, heads),
  eq: (run, heads) => equitySourcesCurrent(run.importIds, heads),
  fx: (run, heads) => fiscalSourcesCurrent(run.importIds, heads, fiscalRelevance(run, heads)),
  st: (run, heads) => stockSourcesCurrent(run.importIds, heads),
  pv: (run, heads) => provisionSourcesCurrent(run.importIds, heads),
};
/** Frozen sources are still the heads of their own types, and no source of these types was added after the freeze. */
const ownTypesCurrent = (types: readonly string[]): Rule => (run, heads) => { const own = heads.filter(h => types.includes(h.document_type));
  return run.importIds.every(i => own.some(h => h.import_id === i)) && (!run.population || own.every(h => run.importIds.includes(h.import_id))); };
/** Procedures sharing a family table but carrying their own rule: Emprunts (C13) and Locations IFRS 16 (IFRS C01) also flag a source of their types added after the freeze. */
const PROCEDURE_RULES: Record<string, Rule> = {
  "loans.review": ownTypesCurrent(LOAN_TYPES),
  "ifrs16.leases": ownTypesCurrent(LEASE_TYPES),
};
/** Adapter passed to observeRuns: null when the heads of the family were not read (the file then states it does not know). */
export function sourcesCurrentAdapter(headsByFamily: Partial<Record<CycleFamily, SourceHead[]>>) {
  return ({ family, run }: { family: CycleFamily; run: WorkpaperRun }) => { const heads = headsByFamily[family]; return heads ? (PROCEDURE_RULES[run.template.id] ?? RULES[family])(run, heads) : null; };
}

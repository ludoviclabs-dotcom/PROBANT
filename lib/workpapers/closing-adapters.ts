import type { CycleFamily } from "./closing-contract";
import type { WorkpaperRun } from "./model";
import { equitySourcesCurrent } from "./capitaux-sources";
import { fiscalRelevance, fiscalSourcesCurrent } from "./fiscal-sources";
import { fixedAssetSourcesCurrent } from "./fixed-asset-sources";
import { provisionSourcesCurrent } from "./provision-sources";
import { stockSourcesCurrent } from "./stock-sources";

/**
 * Observation adapters of the professional file (C14): each family says, with its own rule, whether the sources a sheet froze are still the current heads.
 * The rule is the one the sheet's own runtime applies (sourcesCurrent of its read view); nothing is recalculated and no engine runs here.
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
/** Adapter passed to observeRuns: null when the heads of the family were not read (the file then states it does not know). */
export function sourcesCurrentAdapter(headsByFamily: Partial<Record<CycleFamily, SourceHead[]>>) {
  return ({ family, run }: { family: CycleFamily; run: WorkpaperRun }) => { const heads = headsByFamily[family]; return heads ? RULES[family](run, heads) : null; };
}

import { z } from "zod";
import { cents } from "@/lib/canonical-model/money";
import { isCivilDate } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { contentHash, moneySchema, scopeSchema, type WorkpaperRun } from "@/lib/workpapers/model";
import { LEASE_IDENTITY_PATTERN, manifestSourceRefSchema } from "./manifest";

/**
 * Retraitement de clôture proposé par un atelier IFRS (C00 § 4.7). Écriture équilibrée hors FEC : aucune ligne de trésorerie
 * (le décaissement est déjà dans la base PCG), aucune écriture dans la source. L'équilibre ne prouve pas la pertinence.
 */
export const LOGICAL_ACCOUNTS = ["rou_gross", "rou_accumulated_depreciation", "lease_liability", "lease_interest_expense", "rou_depreciation_expense", "pcg_rent_neutralized", "opening_equity_effect"] as const;
export type LogicalAccount = typeof LOGICAL_ACCOUNTS[number];
export const BUNDLE_NATURES = ["recognition", "interest", "depreciation", "rent_neutralization", "opening_effect"] as const;
/** Comptes de résultat : chacun porte une contribution signée (produit positif, charge négative) et sa nature reste explicite. */
export const RESULT_ACCOUNTS = ["lease_interest_expense", "rou_depreciation_expense", "pcg_rent_neutralized"] as const;
const RESULT_NATURE: Record<typeof RESULT_ACCOUNTS[number], typeof BUNDLE_NATURES[number]> = { lease_interest_expense: "interest", rou_depreciation_expense: "depreciation", pcg_rent_neutralized: "rent_neutralization" };

const id = z.string().trim().min(1).max(250), sha256 = z.string().regex(/^[a-f0-9]{64}$/), civil = z.string().refine(isCivilDate);
const contractId = z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/);
const lineSchema = z.object({ account: z.enum(LOGICAL_ACCOUNTS), side: z.enum(["debit", "credit"]), amount: moneySchema, contractId, contractVersion: id,
  nature: z.enum(BUNDLE_NATURES), evidence: z.array(id).max(200) }).strict();
const contributionSchema = z.object({ contractId, nature: z.enum(RESULT_ACCOUNTS), amount: moneySchema }).strict();
/** Contenu économique, produit par le moteur : son empreinte `bundleHash` ne change ni à l'approbation ni au verrouillage. */
export const bundleCoreSchema = z.object({
  schemaVersion: z.literal("ifrs-bundle-1"), kind: z.literal("closing_adjustment"),
  logicalId: z.string().regex(/^ifrs16\.leases:.{1,250}$/), revision: z.number().int().positive(), runId: id,
  scope: scopeSchema, period: z.object({ startDate: civil, closingDate: civil }).strict(),
  expectedBase: z.object({ baseKind: z.literal("PCG"), sourceRefs: z.array(manifestSourceRefSchema).min(1).max(20) }).strict(),
  identities: z.array(z.string().regex(LEASE_IDENTITY_PATTERN)).min(1).max(10_000),
  lines: z.array(lineSchema).min(2).max(100_000), resultContributions: z.array(contributionSchema).max(30_000),
  taxStatus: z.literal("not_computed"),
}).strict();
/** Retraitement matérialisé à partir d'une version exacte de la feuille : version et empreinte de la feuille, statut proposé ou revu. */
export const adjustmentBundleSchema = bundleCoreSchema.extend({ runVersion: z.number().int().positive(), contentHash: sha256, bundleHash: sha256, status: z.enum(["proposed", "reviewed"]) }).strict();
export type AdjustmentBundleCore = z.infer<typeof bundleCoreSchema>;
export type AdjustmentBundle = z.infer<typeof adjustmentBundleSchema>;

export const bundleHashOf = (core: AdjustmentBundleCore) => stableSha256(bundleCoreSchema.parse(core));
const coreOf = (bundle: AdjustmentBundle): AdjustmentBundleCore => {
  const { runVersion: _v, contentHash: _c, bundleHash: _b, status: _s, ...core } = bundle;
  void _v; void _c; void _b; void _s;
  return core;
};

/**
 * Invariants d'un contenu de retraitement :
 * - `L16_BUNDLE_UNBALANCED` : débit ≠ crédit au centime, par contrat ou au total ;
 * - `L16_BUNDLE_INVALID` : montant nul ou négatif, identités non triées, en double ou sans lignes, contribution absente ou différente des lignes de résultat,
 *   nature incohérente avec un compte de résultat ou d'effet d'ouverture.
 */
export function assertBundleCore(value: unknown): AdjustmentBundleCore {
  const parsed = bundleCoreSchema.safeParse(value);
  if (!parsed.success) throw new Error("L16_BUNDLE_INVALID");
  const core = parsed.data;
  if (core.period.startDate > core.period.closingDate) throw new Error("L16_BUNDLE_INVALID");
  const identities = [...new Set(core.lines.map(l => "ifrs16:lease:" + l.contractId))].sort();
  if (core.identities.length !== identities.length || core.identities.some((x, i) => x !== identities[i])) throw new Error("L16_BUNDLE_INVALID");
  const balance = new Map<string, bigint>(), result = new Map<string, bigint>();
  for (const line of core.lines) {
    const amount = cents(line.amount);
    if (amount <= 0n) throw new Error("L16_BUNDLE_INVALID");
    if ((RESULT_ACCOUNTS as readonly string[]).includes(line.account) && line.nature !== RESULT_NATURE[line.account as typeof RESULT_ACCOUNTS[number]]) throw new Error("L16_BUNDLE_INVALID");
    if (line.account === "opening_equity_effect" && line.nature !== "opening_effect") throw new Error("L16_BUNDLE_INVALID");
    const signed = line.side === "debit" ? amount : -amount;
    balance.set(line.contractId, (balance.get(line.contractId) ?? 0n) + signed);
    if ((RESULT_ACCOUNTS as readonly string[]).includes(line.account)) result.set(line.contractId + "|" + line.account, (result.get(line.contractId + "|" + line.account) ?? 0n) - signed);
  }
  if ([...balance.values()].some(v => v !== 0n)) throw new Error("L16_BUNDLE_UNBALANCED");
  const keys = core.resultContributions.map(c => c.contractId + "|" + c.nature);
  if (new Set(keys).size !== keys.length) throw new Error("L16_BUNDLE_INVALID");
  for (const c of core.resultContributions) if (cents(c.amount) !== (result.get(c.contractId + "|" + c.nature) ?? 0n)) throw new Error("L16_BUNDLE_INVALID");
  for (const key of result.keys()) if (!keys.includes(key)) throw new Error("L16_BUNDLE_INVALID");
  return core;
}
/** Retraitement complet : contenu valide, empreinte recalculée égale à celle annoncée. */
export function assertAdjustmentBundle(value: unknown): AdjustmentBundle {
  const parsed = adjustmentBundleSchema.safeParse(value);
  if (!parsed.success) throw new Error("L16_BUNDLE_INVALID");
  const core = assertBundleCore(coreOf(parsed.data));
  if (bundleHashOf(core) !== parsed.data.bundleHash) throw new Error("L16_BUNDLE_INVALID");
  return parsed.data;
}
/** Matérialise le retraitement d'une version exacte de la feuille : revu seulement si la feuille est approuvée ou verrouillée. */
export function materializeBundle(core: AdjustmentBundleCore, run: WorkpaperRun): AdjustmentBundle {
  const valid = assertBundleCore(core);
  if (valid.runId !== run.id || valid.revision !== run.revision || valid.logicalId !== "ifrs16.leases:" + run.rootId || run.template.id !== "ifrs16.leases") throw new Error("L16_BUNDLE_INVALID");
  return { ...valid, runVersion: run.version, contentHash: contentHash(run), bundleHash: bundleHashOf(valid), status: ["approved", "locked"].includes(run.state) ? "reviewed" : "proposed" };
}

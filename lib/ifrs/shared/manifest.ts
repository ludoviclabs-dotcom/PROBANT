import { z } from "zod";
import { isCivilDate } from "@/lib/canonical-model/period";
import type { NoteCitation } from "@/lib/workpapers/model";

const id = z.string().trim().min(1).max(250), sha256 = z.string().regex(/^[a-f0-9]{64}$/), civil = z.string().refine(isCivilDate);
/** Identité économique d'un contrat (C00 § 3) : clé de déduplication d'un retraitement, jamais un identifiant de ligne. */
export const LEASE_IDENTITY_PATTERN = /^ifrs16:lease:[A-Za-z0-9._:-]{1,200}$/;
export const leaseIdentity = (contractId: string) => {
  const identity = "ifrs16:lease:" + contractId;
  if (!LEASE_IDENTITY_PATTERN.test(identity)) throw new Error("L16_CONTRACT_INVALID");
  return identity;
};
export const noteCitationSchema = z.object({
  documentVersionId: id, importId: id, fileName: z.string().trim().min(1).max(500), sha256,
  pieceRef: z.string().max(500).optional(), page: z.number().int().positive().optional(), rowId: id.optional(), row: z.number().int().positive().optional(), zone: z.string().max(500).optional(),
}).strict();
export const manifestSourceRefSchema = z.object({ importId: id, documentVersionId: id, sha256 }).strict();

/**
 * Base cible d'une sélection de retraitement (C00 § 4.3). Le manifeste décrit l'usage d'une base pour cette sélection :
 * il ne certifie pas l'ensemble des traitements IFRS de l'entité. Une base PCG plus le seul retraitement IFRS 16 reste un pont partiel.
 */
export const preparationManifestSchema = z.object({
  baseKind: z.enum(["PCG", "IFRS_prepared", "partial_bridge"]),
  sourceRefs: z.array(manifestSourceRefSchema).min(1).max(20),
  period: z.object({ startDate: civil, closingDate: civil }).strict(),
  includedAdjustments: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("declared"), identities: z.array(z.string().regex(LEASE_IDENTITY_PATTERN)).max(10_000) }).strict(),
    z.object({ kind: z.literal("unknown"), reason: z.string().trim().min(1).max(2000) }).strict(),
  ]),
  declaredBy: id, declaredAt: z.string().datetime(),
  limits: z.string().trim().min(1).max(4000), citation: noteCitationSchema,
}).strict();
export type ManifestSourceRef = z.infer<typeof manifestSourceRefSchema>;
export type PreparationManifest = Omit<z.infer<typeof preparationManifestSchema>, "citation"> & { citation: NoteCitation };

const refKey = (r: ManifestSourceRef) => r.importId + "|" + r.documentVersionId + "|" + r.sha256;
/**
 * Manifeste admis pour la base qu'attend un retraitement. Refus motivés :
 * - `L16_BASE_UNKNOWN` : retraitements déjà inclus inconnus (X29) ;
 * - `L16_BASE_MISMATCH` : autre nature de base ou autres sources que celles attendues ;
 * - `L16_PERIOD_MISMATCH` : autre exercice.
 */
export function assertManifestFor(value: unknown, expected: { baseKind: PreparationManifest["baseKind"]; sourceRefs: ManifestSourceRef[]; period: { startDate: string; closingDate: string } }): PreparationManifest {
  const parsed = preparationManifestSchema.safeParse(value);
  if (!parsed.success) throw new Error("L16_REQUEST_INVALID");
  const manifest = parsed.data as PreparationManifest;
  const keys = manifest.sourceRefs.map(refKey);
  if (new Set(keys).size !== keys.length || new Set(manifest.sourceRefs.map(r => r.importId)).size !== keys.length) throw new Error("L16_REQUEST_INVALID");
  if (manifest.includedAdjustments.kind === "declared" && new Set(manifest.includedAdjustments.identities).size !== manifest.includedAdjustments.identities.length) throw new Error("L16_REQUEST_INVALID");
  if (manifest.period.startDate > manifest.period.closingDate || manifest.period.startDate !== expected.period.startDate || manifest.period.closingDate !== expected.period.closingDate) throw new Error("L16_PERIOD_MISMATCH");
  if (manifest.includedAdjustments.kind === "unknown") throw new Error("L16_BASE_UNKNOWN");
  const want = expected.sourceRefs.map(refKey).sort();
  if (manifest.baseKind !== expected.baseKind || keys.length !== want.length || [...keys].sort().some((k, i) => k !== want[i])) throw new Error("L16_BASE_MISMATCH");
  return manifest;
}

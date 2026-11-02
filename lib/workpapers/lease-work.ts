import { z } from "zod";
import { firstApplicationSchema, ifrsFrameworkSchema } from "@/lib/ifrs/shared/context";
import { noteCitationSchema } from "@/lib/ifrs/shared/manifest";
import { fieldValueValid, LEASE_DICTIONARY, type FieldSpec } from "@/lib/ifrs/leases/dictionary";
import type { NoteCitation } from "./model";

/**
 * Travail de la feuille « Locations IFRS 16 » (C00 § 4.5), horodaté par le serveur comme `loanWork` : aucun auteur, rôle ni date n'est accepté du navigateur.
 * Référentiel, politiques par catégorie d'actif et confirmations humaines citées. Une confirmation ne vise qu'un champ du dictionnaire des contrats
 * ou des hypothèses (L16-01), avec une valeur de la forme du champ ; elle complète ou corrige la source, elle n'invente rien.
 * Invariant : vide ≠ zéro ≠ non applicable. Une chaîne vide n'est jamais une valeur, et l'absence de réponse n'est jamais une réponse.
 */
export const LEASE_WORK_SCHEMA = "ifrs16-leases-1";
const id = z.string().trim().min(1).max(250), reason = z.string().trim().min(1).max(2000);
export const LEASE_CONTRACT_ID = /^[A-Za-z0-9._:-]{1,200}$/;
export const leaseAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), value: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ kind: z.literal("unknown"), reason }).strict(),
  z.object({ kind: z.literal("not_applicable"), reason }).strict(),
]);
/** Politiques déclarées par catégorie d'actif : exemption court terme (§ 5-8), élection des composantes non locatives (§ 15), traitement de la TVA. */
export const LEASE_POLICY_KINDS = ["short_term_exemption", "non_lease_components_election", "vat_treatment"] as const;
/** Une élection se déclare `elected` ou `not_elected`, jamais en texte libre : un libellé ambigu ne vaut ni élection ni refus. */
const policySchema = z.object({ kind: z.enum(LEASE_POLICY_KINDS), assetCategory: z.string().trim().min(1).max(200), answer: leaseAnswerSchema }).strict()
  .refine(p => p.kind === "vat_treatment" || p.answer.kind !== "value" || ["elected", "not_elected"].includes(p.answer.value), "L16_POLICY_VALUE_INVALID");
const CONFIRMABLE: readonly FieldSpec[] = [...LEASE_DICTIONARY.lease_contracts, ...LEASE_DICTIONARY.lease_assumptions];
const field = z.string().refine(key => CONFIRMABLE.some(s => s.key === key)), contractId = z.string().regex(LEASE_CONTRACT_ID);
/** Une valeur confirmée a la forme du champ ; « inconnu » et « non applicable » passent par leur propre type de réponse. */
const answerFits = (c: { field: string; answer: z.infer<typeof leaseAnswerSchema> }) => {
  if (!c.answer || c.answer.kind !== "value") return true;
  const spec = CONFIRMABLE.find(s => s.key === c.field);
  // An unknown field already fails its own check; here only the shape of an admitted field is verified.
  return !spec || (fieldValueValid(spec, c.answer.value) && !["inconnu", "non_applicable"].includes(c.answer.value));
};
/** Référence de citation envoyée par le navigateur : une ligne approuvée d'une source ; la citation complète est résolue par le serveur. */
export const leaseCitationRefSchema = z.object({ documentVersionId: id, rowId: id }).strict();
const unique = <T,>(items: T[], key: (item: T) => string) => new Set(items.map(key)).size === items.length;
export const leaseWorkDraftSchema = z.object({
  framework: ifrsFrameworkSchema, firstApplication: firstApplicationSchema,
  policies: z.array(policySchema).max(100).refine(p => unique(p, x => x.kind + "|" + x.assetCategory), "L16_POLICY_DUPLICATE"),
  confirmations: z.array(z.object({ contractId, field, answer: leaseAnswerSchema, citation: leaseCitationRefSchema }).strict().refine(answerFits, "L16_CONFIRMATION_VALUE_INVALID")).max(20_000).refine(c => unique(c, x => x.contractId + "|" + x.field), "L16_CONFIRMATION_DUPLICATE"),
}).strict();
export const leaseWorkSchema = z.object({
  schemaVersion: z.literal(LEASE_WORK_SCHEMA), authorId: id, authoredAt: z.string().datetime(),
  framework: ifrsFrameworkSchema, firstApplication: firstApplicationSchema,
  policies: leaseWorkDraftSchema.shape.policies,
  confirmations: z.array(z.object({ contractId, field, answer: leaseAnswerSchema, citation: noteCitationSchema }).strict().refine(answerFits, "L16_CONFIRMATION_VALUE_INVALID")).max(20_000).refine(c => unique(c, x => x.contractId + "|" + x.field), "L16_CONFIRMATION_DUPLICATE"),
}).strict();
export type LeaseWorkDraft = z.infer<typeof leaseWorkDraftSchema>;
export type LeaseWork = Omit<z.infer<typeof leaseWorkSchema>, "confirmations"> & { confirmations: (Omit<z.infer<typeof leaseWorkSchema>["confirmations"][number], "citation"> & { citation: NoteCitation })[] };

/** Brouillon équivalent d'un travail enregistré : sert à re-résoudre ses citations sur les sources figées au gel. */
export function leaseDraftOf(work: LeaseWork): LeaseWorkDraft {
  return { framework: work.framework, firstApplication: work.firstApplication, policies: work.policies,
    confirmations: work.confirmations.map(c => { if (!c.citation.rowId) throw new Error("L16_CITATION_INVALID"); return { contractId: c.contractId, field: c.field, answer: c.answer, citation: { documentVersionId: c.citation.documentVersionId, rowId: c.citation.rowId } }; }) };
}
/** Travail horodaté par le serveur ; chaque citation est résolue par `cite` à partir des sources admises (refus : `L16_CITATION_INVALID`). */
export function stampLeaseWork(draft: LeaseWorkDraft, cite: (ref: z.infer<typeof leaseCitationRefSchema>) => NoteCitation, authorId: string, at: string): LeaseWork {
  const valid = leaseWorkDraftSchema.parse(draft);
  return leaseWorkSchema.parse({ schemaVersion: LEASE_WORK_SCHEMA, authorId, authoredAt: at, framework: valid.framework, firstApplication: valid.firstApplication, policies: valid.policies,
    confirmations: valid.confirmations.map(c => ({ ...c, citation: cite(c.citation) })) }) as LeaseWork;
}

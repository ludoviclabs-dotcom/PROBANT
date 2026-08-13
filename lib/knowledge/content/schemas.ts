/**
 * Plan de connaissance PROBANT — schémas Zod et types dérivés.
 *
 * Ce module est la FRONTIÈRE DE VALIDATION du plan de connaissance : aucun
 * YAML de `data/fec`, `data/nep`, `data/ifrs`, `data/pcg`, `data/crosswalks`
 * ou `data/statistics` n'entre dans l'application sans passer par ces schémas.
 * Conformément à `CLAUDE.md` : « Add types and validation boundaries », « No
 * untyped JSON ». Les types TypeScript sont DÉRIVÉS des schémas (`z.infer`) —
 * il n'existe donc jamais deux définitions à resynchroniser.
 *
 * Règle fondatrice, non négociable : **aucune règle comptable n'est inventée**.
 * Toute information dont la vérification à une source officielle n'a pas
 * abouti porte `status: "review_required"` et attend une revue métier. Un
 * `status: "verified"` engage l'existence d'au moins une source PRIMAIRE
 * (texte officiel, régulateur, normalisateur) horodatée par `retrievedAt`.
 *
 * Ce module est indépendant de `lib/audit-cycles` (les 35 cycles existants) :
 * il ne le modifie pas et ne le remplace pas. Le lien se fait par
 * identifiants, via `data/crosswalks/`.
 */

import { z } from "zod";

/* ────────────────────────────── Socle commun ────────────────────────────── */

/**
 * Statut de fiabilité d'un enregistrement de connaissance.
 *
 * - `verified`         : vérifié à une source primaire citée et horodatée.
 * - `review_required`  : information présente mais NON vérifiée — n'engage rien
 *                        tant qu'un réviseur métier ne l'a pas confirmée.
 * - `out_of_scope`     : sujet volontairement exclu du périmètre produit.
 */
export const KnowledgeStatusSchema = z.enum([
  "verified",
  "review_required",
  "out_of_scope",
]);
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;

/**
 * Nature d'une source.
 *
 * `primary`   : texte officiel ou normalisateur (Légifrance, ANC, IFRS
 *               Foundation, EFRAG, CNCC/H2A, Commission européenne).
 * `secondary` : doctrine, cabinet, presse professionnelle (EY, PwC, Deloitte,
 *               revues). Utilisable pour corroborer, JAMAIS pour fonder une
 *               obligation — cf. `sourceIsSecondary` et le contrôle K-002.
 */
export const SourceKindSchema = z.enum(["primary", "secondary"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

/** Référence de source attachée à un enregistrement. */
export const SourceRefSchema = z.object({
  /** Identifiant dans le registre central `data/sources/*.yml` quand il existe. */
  sourceId: z.string().min(1),
  kind: SourceKindSchema,
  url: z.string().url().optional(),
  /** Référence de paragraphe/article — jamais le texte lui-même. */
  paragraphReference: z.string().optional(),
  /** Date de consultation (AAAA-MM-JJ). Obligatoire pour fonder `verified`. */
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  note: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * Éditeurs de doctrine dont une publication ne peut JAMAIS fonder une
 * obligation normative. Le contrôle K-002 échoue si l'un d'eux apparaît comme
 * source `primary` ou porte une exigence obligatoire.
 */
export const SECONDARY_PUBLISHERS = [
  "ey",
  "ernst",
  "pwc",
  "pricewaterhouse",
  "deloitte",
  "iasplus",
  "kpmg",
  "mazars",
  "grant-thornton",
  "bdo",
] as const;

/** Vrai si l'identifiant ou l'URL désigne un éditeur de doctrine. */
export function sourceIsSecondary(ref: SourceRef): boolean {
  const haystack = `${ref.sourceId} ${ref.url ?? ""}`.toLowerCase();
  return SECONDARY_PUBLISHERS.some((p) => haystack.includes(p));
}

/**
 * Longueur maximale d'un extrait cité, en caractères.
 *
 * Les normes IFRS sont protégées par le droit d'auteur de l'IFRS Foundation ;
 * PROBANT stocke des RÉFÉRENCES et des résumés, jamais le texte. Ce plafond
 * rend la règle mécaniquement vérifiable (contrôle K-007) plutôt que
 * déclarative.
 */
export const MAX_QUOTE_CHARS = 200;

/* ─────────────────────────────── FEC — champs ────────────────────────────── */

/** Variante de colonnes 12/13 tolérée par l'article A47 A-1. */
export const FecVariantSchema = z.enum(["debit_credit", "montant_sens", "both"]);
export type FecVariant = z.infer<typeof FecVariantSchema>;

export const FecDataTypeSchema = z.enum([
  "string",
  "date",
  "amount",
  "sign",
  "currency_code",
]);
export type FecDataType = z.infer<typeof FecDataTypeSchema>;

/**
 * Un des 18 champs du fichier des écritures comptables.
 *
 * `position` suit l'ordre prescrit par l'article A47 A-1 du LPF (1 à 18).
 */
export const FecFieldSchema = z.object({
  position: z.number().int().min(1).max(18),
  /** Nom exact attendu en ligne d'en-tête du fichier. */
  fieldName: z.string().min(1),
  businessLabel: z.string().min(1),
  dataType: FecDataTypeSchema,
  /** Le champ doit être présent dans l'en-tête. */
  required: z.boolean(),
  /** La valeur peut être vide sur une ligne donnée. */
  allowedBlank: z.boolean(),
  /**
   * Niveau de preuve de `allowedBlank`, DISTINCT de celui du champ lui-même.
   *
   * L'article A47 A-1 énumère et ordonne les 18 zones — cette partie est
   * vérifiable directement. Il ne précise pas, zone par zone, laquelle peut
   * rester à blanc sur une écriture donnée : cette tolérance relève de la
   * doctrine administrative et de la pratique. On refuse donc de présenter
   * comme vérifié ce qui ne l'est pas, sans pour autant dégrader l'identité
   * du champ, elle bien établie.
   */
  allowedBlankStatus: KnowledgeStatusSchema,
  /** Format attendu (ex. `AAAAMMJJ`), ou `libre`. */
  format: z.string().min(1),
  sourceId: z.string().min(1),
  paragraphReference: z.string().min(1),
  variant: FecVariantSchema,
  status: KnowledgeStatusSchema,
  note: z.string().optional(),
});
export type FecField = z.infer<typeof FecFieldSchema>;

export const FecFieldSetSchema = z.object({
  referentialId: z.string().min(1),
  label: z.string().min(1),
  sources: z.array(SourceRefSchema).min(1),
  fields: z.array(FecFieldSchema).length(18),
});
export type FecFieldSet = z.infer<typeof FecFieldSetSchema>;

/* ────────────────────────────── FEC — contrôles ──────────────────────────── */

/** Les douze familles de contrôles atomiques demandées. */
export const FecControlFamilySchema = z.enum([
  "presence",
  "ordre",
  "type",
  "date",
  "montant",
  "sequence",
  "equilibre",
  "compte",
  "piece",
  "periode",
  "devise",
  "lettrage",
]);
export type FecControlFamily = z.infer<typeof FecControlFamilySchema>;

/**
 * Fondement d'un contrôle.
 *
 * `hard_law` : le contrôle vérifie une exigence d'un texte opposable. Il DOIT
 *              citer au moins une source primaire (contrôle K-001).
 * `internal` : heuristique PROBANT d'aide à la revue. Non opposable — ne peut
 *              jamais être présentée comme une obligation.
 */
export const ControlBasisSchema = z.enum(["hard_law", "internal"]);
export type ControlBasis = z.infer<typeof ControlBasisSchema>;

/** Contrôle atomique : une seule attente vérifiable, sur un périmètre défini. */
export const FecControlSchema = z.object({
  id: z.string().regex(/^FEC-[A-Z]+-\d{3}$/u),
  family: FecControlFamilySchema,
  label: z.string().min(1),
  /** Ce que le contrôle vérifie, en une phrase testable. */
  expectation: z.string().min(1),
  /** Champs FEC concernés (noms de `FecField.fieldName`), vide = ligne entière. */
  appliesTo: z.array(z.string()),
  basis: ControlBasisSchema,
  sources: z.array(SourceRefSchema),
  /** Variante de fichier à laquelle le contrôle s'applique. */
  variant: FecVariantSchema,
  status: KnowledgeStatusSchema,
  note: z.string().optional(),
});
export type FecControl = z.infer<typeof FecControlSchema>;

export const FecControlSetSchema = z.object({
  referentialId: z.string().min(1),
  label: z.string().min(1),
  controls: z.array(FecControlSchema).min(1),
});
export type FecControlSet = z.infer<typeof FecControlSetSchema>;

/* ────────────────────────────────── NEP ──────────────────────────────────── */

/** Thèmes de structuration demandés pour les NEP. */
export const NepThemeSchema = z.enum([
  "documentation",
  "planification",
  "risques",
  "materialite",
  "reponses_aux_risques",
  "anomalies",
  "elements_probants",
  "selection",
  "rapport",
]);
export type NepTheme = z.infer<typeof NepThemeSchema>;

/**
 * Métadonnées d'une NEP.
 *
 * On stocke des MÉTADONNÉES et un objectif résumé — jamais le texte de la
 * norme. `paragraphReferences` pointe vers les paragraphes sans les citer.
 */
export const NepEntrySchema = z.object({
  id: z.string().regex(/^nep-\d+$/u),
  number: z.string().min(1),
  title: z.string().min(1),
  themes: z.array(NepThemeSchema).min(1),
  /** Résumé d'objectif rédigé par PROBANT, non extrait du texte normatif. */
  objectiveSummary: z.string().min(1).max(400),
  concepts: z.array(z.string()),
  paragraphReferences: z.array(z.string()),
  /** Slugs de `data/cycles/*.yml`. */
  relatedCycles: z.array(z.string()),
  /** Identifiants ISA correspondants — correspondance, jamais équivalence. */
  isaCrosswalk: z.array(z.string()),
  status: KnowledgeStatusSchema,
  sources: z.array(SourceRefSchema).min(1),
  note: z.string().optional(),
});
export type NepEntry = z.infer<typeof NepEntrySchema>;

export const NepSetSchema = z.object({
  referentialId: z.string().min(1),
  label: z.string().min(1),
  entries: z.array(NepEntrySchema).min(1),
});
export type NepSet = z.infer<typeof NepSetSchema>;

/* ────────────────────────────────── IFRS ─────────────────────────────────── */

/** Statut d'adoption par l'Union européenne. */
export const EuEndorsementStatusSchema = z.enum([
  "endorsed",
  "not_endorsed",
  "pending",
  "unknown",
]);
export type EuEndorsementStatus = z.infer<typeof EuEndorsementStatusSchema>;

/**
 * Adoption UE — statut ET base qui le fonde.
 *
 * `basis` est obligatoire dès que le statut n'est pas `unknown` : il rend
 * explicite POURQUOI on affirme ce statut (lecture directe d'un règlement,
 * ou déduction de l'absence dans la liste EFRAG des documents non adoptés).
 * Le contrôle K-004 refuse un statut positif sans base.
 */
export const EuEndorsementSchema = z.object({
  status: EuEndorsementStatusSchema,
  basis: z.string().optional(),
  /** AAAA-MM-JJ — date du document qui fonde le statut. */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  sources: z.array(SourceRefSchema),
});
export type EuEndorsement = z.infer<typeof EuEndorsementSchema>;

/** Différence de traitement PCG / IFRS — doit toujours être sourcée (K-005). */
export const PcgDifferenceSchema = z.object({
  topic: z.string().min(1),
  ifrsTreatment: z.string().min(1),
  pcgTreatment: z.string().min(1),
  auditImpact: z.string().optional(),
  status: KnowledgeStatusSchema,
  sources: z.array(SourceRefSchema),
});
export type PcgDifference = z.infer<typeof PcgDifferenceSchema>;

export const IfrsStandardSchema = z.object({
  id: z.string().regex(/^(ias|ifrs)-\d+$/u),
  number: z.string().min(1),
  title: z.string().min(1),
  /** Statut côté IASB (normalisateur), distinct de l'adoption UE. */
  iasbStatus: z.enum(["issued", "superseded", "withdrawn", "unknown"]),
  /** Date d'entrée en vigueur IASB (AAAA-MM-JJ), `null` si non vérifiée. */
  iasbEffectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .nullable(),
  /**
   * La fiche présente-t-elle la norme comme APPLICABLE aujourd'hui ?
   *
   * Champ explicite plutôt qu'implicite : une norme publiée n'est pas une
   * norme applicable. IFRS 18 est adoptée par l'UE et entre en vigueur au
   * 01/01/2027 — la présenter comme applicable en 2026 induirait l'auditeur
   * en erreur. Le contrôle K-003 refuse `true` tant que la date d'effet n'est
   * pas atteinte, ou n'est pas connue.
   */
  presentedAsEffective: z.boolean().default(false),
  euEndorsement: EuEndorsementSchema,
  scope: z.string().min(1),
  topics: z.array(z.string()),
  /** Slugs de cycles d'audit affectés. */
  affectedCycles: z.array(z.string()),
  pcgDifferences: z.array(PcgDifferenceSchema),
  dataRequirements: z.array(z.string()),
  disclosureRequirements: z.array(z.string()),
  status: KnowledgeStatusSchema,
  sources: z.array(SourceRefSchema).min(1),
  note: z.string().optional(),
});
export type IfrsStandard = z.infer<typeof IfrsStandardSchema>;

export const IfrsSetSchema = z.object({
  referentialId: z.string().min(1),
  label: z.string().min(1),
  entries: z.array(IfrsStandardSchema).min(1),
});
export type IfrsSet = z.infer<typeof IfrsSetSchema>;

/* ─────────────────────────────────── PCG ─────────────────────────────────── */

/**
 * Exigence PCG datée.
 *
 * `effectiveFrom` / `effectiveTo` portent la période d'application ; `null`
 * sur `effectiveTo` signifie « toujours en vigueur à la date du référentiel ».
 */
export const PcgRequirementSchema = z.object({
  id: z.string().min(1),
  /** Référence d'article ou de règlement (ex. `PCG art. 121-5`). */
  reference: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  /** Règlement ANC porteur (ex. `ANC 2014-03`, `ANC 2026-04`). */
  regulation: z.string().min(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(),
  affectedCycles: z.array(z.string()),
  status: KnowledgeStatusSchema,
  sources: z.array(SourceRefSchema).min(1),
  note: z.string().optional(),
});
export type PcgRequirement = z.infer<typeof PcgRequirementSchema>;

export const PcgSetSchema = z.object({
  referentialId: z.string().min(1),
  label: z.string().min(1),
  /** Version consolidée indexée (ex. `2026-01-01`). */
  consolidatedVersion: z.string().min(1),
  sources: z.array(SourceRefSchema).min(1),
  requirements: z.array(PcgRequirementSchema),
});
export type PcgSet = z.infer<typeof PcgSetSchema>;

/* ──────────────────────────────── Crosswalks ─────────────────────────────── */

export const CrosswalkKindSchema = z.enum([
  "pcg_ifrs",
  "nep_isa",
  "cycle_assertions",
  "cycle_accounts",
  "control_source",
  "finding_control",
]);
export type CrosswalkKind = z.infer<typeof CrosswalkKindSchema>;

/**
 * Lien de correspondance.
 *
 * `relation` qualifie la force du lien : une NEP et une ISA peuvent être
 * proches sans être équivalentes — les confondre est précisément l'erreur que
 * ce référentiel doit rendre impossible.
 */
export const CrosswalkLinkSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relation: z.enum(["equivalent", "partial", "related", "no_equivalent"]),
  note: z.string().optional(),
  status: KnowledgeStatusSchema,
  sources: z.array(SourceRefSchema),
});
export type CrosswalkLink = z.infer<typeof CrosswalkLinkSchema>;

export const CrosswalkSchema = z.object({
  kind: CrosswalkKindSchema,
  label: z.string().min(1),
  links: z.array(CrosswalkLinkSchema),
});
export type Crosswalk = z.infer<typeof CrosswalkSchema>;

/* ─────────────────────────────── Statistiques ────────────────────────────── */

/**
 * Statistique externe.
 *
 * Cloisonnée par construction : elle vit dans `data/statistics/`, ne porte
 * aucun identifiant de contrôle ou de cycle, et le contrôle K-008 vérifie
 * qu'aucun crosswalk ne la référence. Une statistique **ne contribue jamais**
 * au score d'un dossier — elle sert au cadrage et à la pédagogie.
 */
export const ExternalStatisticSchema = z.object({
  id: z.string().regex(/^stat-[a-z0-9-]+$/u),
  label: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  /** Unité explicite — obligatoire (contrôle K-006). */
  unit: z.string().min(1),
  /** Date de la mesure (AAAA-MM-JJ) — obligatoire (K-006). */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  /** Périmètre de la mesure — obligatoire (K-006). */
  scope: z.string().min(1),
  methodology: z.string().optional(),
  status: KnowledgeStatusSchema,
  sources: z.array(SourceRefSchema).min(1),
  /** Invariant matérialisé dans la donnée : jamais utilisée pour scorer. */
  contributesToScore: z.literal(false),
});
export type ExternalStatistic = z.infer<typeof ExternalStatisticSchema>;

export const StatisticSetSchema = z.object({
  referentialId: z.string().min(1),
  label: z.string().min(1),
  /** Peut être vide : aucune statistique vérifiée n'est un état légitime. */
  statistics: z.array(ExternalStatisticSchema),
});
export type StatisticSet = z.infer<typeof StatisticSetSchema>;

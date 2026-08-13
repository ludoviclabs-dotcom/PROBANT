/**
 * Contrôles qualité du plan de connaissance — les garde-fous d'intégrité.
 *
 * Chaque contrôle matérialise une règle que la base ne doit JAMAIS enfreindre.
 * Ils sont exécutés par les tests (`lib/knowledge/__tests__/`), donc par la CI :
 * une régression d'intégrité fait échouer le build, elle ne se découvre pas en
 * production.
 *
 * Ces contrôles complètent, sans les remplacer, ceux de
 * `lib/audit-cycles/validation.ts` qui portent sur les 35 fiches de cycles.
 *
 *   K-001  une règle opposable sans source primaire
 *   K-002  une source de doctrine (EY, PwC, …) présentée comme primaire
 *   K-003  une norme IFRS future présentée comme applicable
 *   K-004  une adoption UE affirmée positive sans base
 *   K-005  une différence PCG/IFRS sans source
 *   K-006  une statistique sans date, unité ou périmètre
 *   K-007  une citation IFRS excessive
 *   K-008  une statistique atteignable depuis un crosswalk
 *   K-009  un enregistrement « verified » sans source primaire datée
 *
 * Fonctions PURES : aucun accès disque, aucune horloge implicite. La date de
 * référence est TOUJOURS injectée — sans quoi le contrôle K-003 changerait de
 * résultat au fil du temps et la CI deviendrait non déterministe.
 */

import {
  MAX_QUOTE_CHARS,
  sourceIsSecondary,
  type Crosswalk,
  type FecControlSet,
  type FecFieldSet,
  type IfrsSet,
  type IfrsStandard,
  type NepSet,
  type PcgSet,
  type SourceRef,
  type StatisticSet,
} from "./schemas";

export interface KnowledgeIssue {
  /** Identifiant du contrôle (K-001 …). */
  control: string;
  /** Enregistrement concerné. */
  subject: string;
  message: string;
}

export interface KnowledgeReport {
  valid: boolean;
  errors: KnowledgeIssue[];
  warnings: KnowledgeIssue[];
}

function hasPrimarySource(sources: SourceRef[]): boolean {
  return sources.some((s) => s.kind === "primary" && !sourceIsSecondary(s));
}

function hasDatedPrimarySource(sources: SourceRef[]): boolean {
  return sources.some(
    (s) => s.kind === "primary" && !sourceIsSecondary(s) && !!s.retrievedAt,
  );
}

/**
 * Tous les porteurs de sources du plan de connaissance, aplatis en une liste
 * `(sujet, sources)` — le socle commun de K-002 et K-009. Un référentiel
 * ajouté au plan doit être ajouté ICI, sinon ses sources échappent aux deux
 * contrôles : les tests de couverture le rappellent.
 */
function collectSourceBearers(
  input: KnowledgeInput,
): { subject: string; sources: SourceRef[]; status?: string }[] {
  const bearers: { subject: string; sources: SourceRef[]; status?: string }[] = [];

  // FEC — les zones ne portent pas de SourceRef individuel (elles pointent le
  // registre par `sourceId`) : le jeu porte les références datées au niveau du
  // référentiel. Une zone `verified` s'appuie donc sur les sources du jeu.
  bearers.push({
    subject: input.fecFields.referentialId,
    sources: input.fecFields.sources,
  });
  for (const f of input.fecFields.fields) {
    bearers.push({
      subject: `${input.fecFields.referentialId}:${f.fieldName}`,
      sources: input.fecFields.sources,
      status: f.status,
    });
  }

  for (const c of input.fecControls.controls) {
    bearers.push({ subject: c.id, sources: c.sources, status: c.status });
  }
  for (const e of input.nep.entries) {
    bearers.push({ subject: e.id, sources: e.sources, status: e.status });
  }
  for (const s of input.ifrs.entries) {
    bearers.push({ subject: s.id, sources: s.sources, status: s.status });
    bearers.push({ subject: `${s.id}.euEndorsement`, sources: s.euEndorsement.sources });
    s.pcgDifferences.forEach((d, i) => {
      bearers.push({
        subject: `${s.id}.pcgDifferences[${i}]`,
        sources: d.sources,
        status: d.status,
      });
    });
  }

  bearers.push({ subject: input.pcg.referentialId, sources: input.pcg.sources });
  for (const r of input.pcg.requirements) {
    bearers.push({ subject: r.id, sources: r.sources, status: r.status });
  }

  for (const cw of input.crosswalks) {
    for (const link of cw.links) {
      bearers.push({
        subject: `${cw.kind}:${link.from}→${link.to}`,
        sources: link.sources,
        status: link.status,
      });
    }
  }

  for (const s of input.statistics.statistics) {
    bearers.push({ subject: s.id, sources: s.sources, status: s.status });
  }

  return bearers;
}

/* ─────────────────────────────────── K-001 ───────────────────────────────── */

/**
 * K-001 — un contrôle `hard_law` affirme une obligation opposable : il doit
 * citer au moins une source primaire. Un contrôle `internal` peut légitimement
 * n'en citer aucune, c'est ce qui le distingue.
 */
export function checkMandatoryControlsHaveSource(
  controls: FecControlSet,
): KnowledgeIssue[] {
  return controls.controls
    .filter((c) => c.basis === "hard_law" && !hasPrimarySource(c.sources))
    .map((c) => ({
      control: "K-001",
      subject: c.id,
      message: `contrôle opposable « ${c.label} » sans source primaire`,
    }));
}

/* ─────────────────────────────────── K-002 ───────────────────────────────── */

/**
 * K-002 — une publication de cabinet ou de doctrine ne fonde jamais une
 * obligation. Deux infractions possibles : la déclarer `primary` — où que ce
 * soit dans le plan de connaissance, pas seulement sur les contrôles FEC et
 * les fiches IFRS — ou l'employer comme unique appui d'un contrôle opposable.
 */
export function checkNoSecondarySourceAsMandatory(
  input: KnowledgeInput,
): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];
  const seen = new Set<string>();

  for (const bearer of collectSourceBearers(input)) {
    for (const s of bearer.sources) {
      if (sourceIsSecondary(s) && s.kind === "primary") {
        // Les zones FEC partagent les sources de leur jeu : une même référence
        // fautive ne doit produire qu'un signalement, pas dix-huit.
        const key = `${bearer.subject}|${s.sourceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({
          control: "K-002",
          subject: bearer.subject,
          message: `source de doctrine « ${s.sourceId} » déclarée primaire`,
        });
      }
    }
  }

  for (const c of input.fecControls.controls) {
    if (c.basis === "hard_law" && c.sources.length > 0 && !hasPrimarySource(c.sources)) {
      issues.push({
        control: "K-002",
        subject: c.id,
        message: "contrôle opposable appuyé uniquement sur de la doctrine",
      });
    }
  }

  return issues;
}

/* ─────────────────────────────────── K-003 ───────────────────────────────── */

/** Une norme est-elle applicable à `referenceDate` (AAAA-MM-JJ) ? */
export function isEffectiveAt(
  standard: IfrsStandard,
  referenceDate: string,
): boolean {
  if (!standard.iasbEffectiveDate) return false;
  return standard.iasbEffectiveDate <= referenceDate;
}

/**
 * K-003 — une norme publiée n'est pas une norme applicable. IFRS 18 est
 * adoptée et entre en vigueur le 01/01/2027 : la présenter comme applicable en
 * 2026 induirait l'auditeur en erreur. Le champ `presentedAsEffective` rend
 * l'affirmation explicite, donc vérifiable.
 */
export function checkNoFutureStandardPresentedAsEffective(
  ifrs: IfrsSet,
  referenceDate: string,
): KnowledgeIssue[] {
  return ifrs.entries
    .filter((s) => s.presentedAsEffective && !isEffectiveAt(s, referenceDate))
    .map((s) => ({
      control: "K-003",
      subject: s.id,
      message: s.iasbEffectiveDate
        ? `présentée comme applicable alors que sa date d'effet est le ${s.iasbEffectiveDate}`
        : "présentée comme applicable alors que sa date d'effet est inconnue",
    }));
}

/* ─────────────────────────────────── K-004 ───────────────────────────────── */

/**
 * K-004 — « adopté par l'UE » est une affirmation forte. Elle exige une base
 * explicitée ET une source. Le statut `unknown` est toujours acceptable : ne
 * pas savoir est un état légitime, affirmer sans base ne l'est pas.
 */
export function checkEndorsementNotAssumedPositive(
  ifrs: IfrsSet,
): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];

  for (const s of ifrs.entries) {
    const e = s.euEndorsement;
    if (e.status === "unknown") continue;

    if (!e.basis || e.basis.trim().length === 0) {
      issues.push({
        control: "K-004",
        subject: s.id,
        message: `statut d'adoption UE « ${e.status} » affirmé sans base explicitée`,
      });
    }
    if (e.sources.length === 0) {
      issues.push({
        control: "K-004",
        subject: s.id,
        message: `statut d'adoption UE « ${e.status} » affirmé sans source`,
      });
    }
    if (e.status === "endorsed" && !e.asOf) {
      issues.push({
        control: "K-004",
        subject: s.id,
        message: "adoption UE affirmée sans date de constatation (asOf)",
      });
    }
  }

  return issues;
}

/* ─────────────────────────────────── K-005 ───────────────────────────────── */

/**
 * K-005 — affirmer qu'un traitement PCG diverge d'un traitement IFRS engage la
 * lecture des deux référentiels. Sans source, c'est une opinion présentée
 * comme un fait.
 */
export function checkPcgDifferencesAreSourced(ifrs: IfrsSet): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];

  for (const s of ifrs.entries) {
    s.pcgDifferences.forEach((d, i) => {
      if (d.sources.length === 0) {
        issues.push({
          control: "K-005",
          subject: `${s.id}.pcgDifferences[${i}]`,
          message: `différence PCG/IFRS « ${d.topic} » sans source`,
        });
      }
    });
  }

  return issues;
}

/* ─────────────────────────────────── K-006 ───────────────────────────────── */

/**
 * K-006 — une statistique sans date, sans unité ou sans périmètre n'est pas
 * une information : c'est un nombre. Le schéma Zod impose déjà la présence des
 * champs ; ce contrôle refuse en plus les valeurs vides ou d'attente.
 */
export function checkStatisticsAreQualified(
  statistics: StatisticSet,
): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];
  const blank = (v: string) => v.trim().length === 0 || v.trim() === "-";

  for (const s of statistics.statistics) {
    if (blank(s.unit)) {
      issues.push({ control: "K-006", subject: s.id, message: "unité vide" });
    }
    if (blank(s.scope)) {
      issues.push({ control: "K-006", subject: s.id, message: "périmètre vide" });
    }
    if (blank(s.asOf)) {
      issues.push({ control: "K-006", subject: s.id, message: "date de mesure vide" });
    }
    if (s.sources.length === 0) {
      issues.push({ control: "K-006", subject: s.id, message: "aucune source" });
    }
  }

  return issues;
}

/* ─────────────────────────────────── K-007 ───────────────────────────────── */

/** Extrait les passages entre guillemets (français ou droits) d'un texte. */
function extractQuotes(text: string): string[] {
  const quotes: string[] = [];
  for (const m of text.matchAll(/«\s*([^»]*)\s*»/gu)) quotes.push(m[1]);
  for (const m of text.matchAll(/"([^"]*)"/gu)) quotes.push(m[1]);
  return quotes;
}

/**
 * K-007 — les normes IFRS sont protégées par le droit d'auteur de l'IFRS
 * Foundation. PROBANT stocke des références et des résumés ; un extrait long
 * signale une reproduction qui n'a pas lieu d'être dans un référentiel.
 */
export function checkNoExcessiveIfrsQuotation(ifrs: IfrsSet): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];

  for (const s of ifrs.entries) {
    const texts = [
      s.scope,
      s.note ?? "",
      s.euEndorsement.basis ?? "",
      ...s.dataRequirements,
      ...s.disclosureRequirements,
      ...s.pcgDifferences.flatMap((d) => [d.ifrsTreatment, d.pcgTreatment]),
    ];

    for (const t of texts) {
      for (const q of extractQuotes(t)) {
        if (q.length > MAX_QUOTE_CHARS) {
          issues.push({
            control: "K-007",
            subject: s.id,
            message: `citation de ${q.length} caractères — plafond ${MAX_QUOTE_CHARS}`,
          });
        }
      }
    }
  }

  return issues;
}

/* ─────────────────────────────────── K-008 ───────────────────────────────── */

/**
 * K-008 — cloisonnement des statistiques.
 *
 * Rend l'invariant « une statistique ne contribue jamais à un score dossier »
 * mécaniquement vérifiable : si aucun crosswalk ne référence un identifiant
 * `stat-*`, aucune statistique ne peut atteindre un contrôle, un constat ou un
 * cycle par le graphe de connaissance.
 */
export function checkStatisticsAreIsolated(
  crosswalks: Crosswalk[],
): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];

  for (const cw of crosswalks) {
    for (const link of cw.links) {
      for (const endpoint of [link.from, link.to]) {
        if (/(^|:)stat-/u.test(endpoint)) {
          issues.push({
            control: "K-008",
            subject: `${cw.kind}:${link.from}→${link.to}`,
            message: `un crosswalk référence la statistique « ${endpoint} »`,
          });
        }
      }
    }
  }

  return issues;
}

/* ─────────────────────────────────── K-009 ───────────────────────────────── */

/**
 * K-009 — le contrat de `verified` est mécanique, pas déclaratif.
 *
 * Un enregistrement marqué `verified` engage l'existence d'au moins une source
 * PRIMAIRE (hors doctrine) portant `retrievedAt`. Sans ce couplage, un statut
 * `verified` pourrait entrer dans le jeu de données de confiance sans que
 * personne ne puisse dire QUAND la vérification a eu lieu — c'est-à-dire sans
 * qu'elle soit contestable, donc sans qu'elle vaille vérification.
 *
 * Les statuts `review_required` et `out_of_scope` sont hors du champ : ils
 * n'affirment rien.
 */
export function checkVerifiedRecordsHaveDatedSource(
  input: KnowledgeInput,
): KnowledgeIssue[] {
  return collectSourceBearers(input)
    .filter((b) => b.status === "verified" && !hasDatedPrimarySource(b.sources))
    .map((b) => ({
      control: "K-009",
      subject: b.subject,
      message:
        "marqué « verified » sans source primaire datée (retrievedAt manquant ou source de doctrine)",
    }));
}

/* ────────────────────────────── Rapport complet ──────────────────────────── */

export interface KnowledgeInput {
  fecFields: FecFieldSet;
  fecControls: FecControlSet;
  nep: NepSet;
  ifrs: IfrsSet;
  pcg: PcgSet;
  crosswalks: Crosswalk[];
  statistics: StatisticSet;
}

/**
 * Exécute les neuf contrôles.
 *
 * `referenceDate` (AAAA-MM-JJ) est injectée pour que le résultat soit
 * reproductible : un test qui dépendrait de l'horloge deviendrait rouge tout
 * seul le jour où une norme entre en vigueur.
 */
export function validateKnowledgeBase(
  input: KnowledgeInput,
  referenceDate: string,
): KnowledgeReport {
  const errors: KnowledgeIssue[] = [
    ...checkMandatoryControlsHaveSource(input.fecControls),
    ...checkNoSecondarySourceAsMandatory(input),
    ...checkNoFutureStandardPresentedAsEffective(input.ifrs, referenceDate),
    ...checkEndorsementNotAssumedPositive(input.ifrs),
    ...checkPcgDifferencesAreSourced(input.ifrs),
    ...checkStatisticsAreQualified(input.statistics),
    ...checkNoExcessiveIfrsQuotation(input.ifrs),
    ...checkStatisticsAreIsolated(input.crosswalks),
    ...checkVerifiedRecordsHaveDatedSource(input),
  ];

  return { valid: errors.length === 0, errors, warnings: [] };
}

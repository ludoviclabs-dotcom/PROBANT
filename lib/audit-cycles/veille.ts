/**
 * Veille normative « Audit Normatif 360 » — fraîcheur des sources, de la méthodologie et des fiches cycles.
 *
 * Module PUR (aucun accès disque, aucune date système) : il reçoit le registre des sources, les cycles, la
 * méthodologie, la veille arrêtée (`data/veille/veille.yml`), le relevé des liens (`data/veille/link-check.json`)
 * et les dates de vérification du registre de connaissances (`lib/knowledge/registry.ts`), puis dit, source par
 * source et cycle par cycle, ce qui est à reprendre. Toutes les dates sont jugées à la date d'arrêté de la veille,
 * jamais à la date du jour : la même veille donne toujours le même résultat.
 *
 * Trois contrôles distincts, jamais fondus en un score :
 *  - la VÉRIFICATION datée de la source (lue sur une page officielle, et quand) ;
 *  - le LIEN officiel (relevé HTTP : joignable, redirigé, introuvable, non contrôlable par un robot) ;
 *  - les ÉVOLUTIONS normatives connues qui la touchent (remplacement, révision, renommage…), avec leur date
 *    d'effet et leur intégration dans le contenu PROBANT.
 * La « file de revue » ne fait qu'ordonner ces constats ; chaque ligne garde ses motifs explicites.
 */

import type { AuditCycle, MethodologyDocument, NormativeSource, SourceType } from "./types";

// ── Données de veille ─────────────────────────────────────────────────────────────────────────────

export type EvolutionKind =
  | "remplacement"
  | "revision"
  | "amendement"
  | "nouvelle_norme"
  | "renommage"
  | "adresse_officielle"
  | "absence_registre";

export const EVOLUTION_KIND_LABEL: Record<EvolutionKind, string> = {
  remplacement: "Remplacement",
  revision: "Révision",
  amendement: "Amendement",
  nouvelle_norme: "Nouvelle norme",
  renommage: "Renommage",
  adresse_officielle: "Adresse officielle",
  absence_registre: "Absente du registre",
};

/** Couloir de la frise : autorité émettrice. */
export type EvolutionGroup = "audit" | "ifrs" | "france" | "ue";

export const EVOLUTION_GROUPS: { id: EvolutionGroup; label: string }[] = [
  { id: "audit", label: "Audit — IAASB, H2A" },
  { id: "ifrs", label: "IFRS — IASB, adoption UE" },
  { id: "france", label: "France — ANC, Légifrance" },
  { id: "ue", label: "Union européenne" },
];

/** Comment le fait a été établi. `repris_du_depot` : lecture officielle déjà tracée dans le dépôt. */
export type EvolutionAccess = "read_official_page" | "read_official_pdf" | "repris_du_depot" | "inaccessible";

export const EVOLUTION_ACCESS_LABEL: Record<EvolutionAccess, string> = {
  read_official_page: "Page officielle lue",
  read_official_pdf: "PDF officiel lu",
  repris_du_depot: "Lecture officielle déjà tracée dans le dépôt",
  inaccessible: "Source officielle non lisible",
};

/**
 * Intégration de l'évolution dans le contenu PROBANT (registre, fiches, méthodologie). `a_surveiller` : projet ou
 * texte sans effet normatif (exposé-sondage, programme de travail, exemples non normatifs) — rien à intégrer,
 * seulement à suivre ; il n'expose aucune source ni aucun cycle.
 */
export type IntegrationStatus = "a_integrer" | "partiel" | "integre" | "a_surveiller";

export const INTEGRATION_LABEL: Record<IntegrationStatus, string> = {
  a_integrer: "À intégrer",
  partiel: "Intégrée en partie",
  integre: "Intégrée",
  a_surveiller: "À surveiller",
};

/** Une évolution « ouverte » laisse un écart entre le texte officiel et le contenu PROBANT. */
export function isOpen(integration: IntegrationStatus): boolean {
  return integration === "a_integrer" || integration === "partiel";
}

export interface EuEndorsement {
  status: string;
  regulation: string | null;
  ojDate: string | null;
}

export interface VeilleEvolution {
  id: string;
  title: string;
  /** Repère court affiché sur la frise (« ISA 570 », « IFRS 18 »). */
  short: string;
  kind: EvolutionKind;
  group: EvolutionGroup;
  issuer: string;
  officialUrl: string | null;
  /** Date de lecture de la source officielle (AAAA-MM-JJ). */
  readAt: string | null;
  access: EvolutionAccess;
  publishedOn: string | null;
  /** Règle d'effet, telle que lue. */
  effectiveRule: string;
  /** Première date d'effet ; null = sans date d'effet (adresse, absence) ou date non établie. */
  effectiveFrom: string | null;
  euEndorsement?: EuEndorsement | null;
  /** Citation courte exacte de la source officielle, ou null. */
  quote: string | null;
  normatifSourceIds: string[];
  /** Documents méthodologiques touchés (slugs de data/methodology). */
  methodologySlugs?: string[];
  /** Cycles touchés au-delà de ceux qui citent les sources (slugs). */
  cycleSlugs?: string[];
  /**
   * `false` : l'évolution complète une source sans rendre périmées les fiches qui la citent (amendement ciblé) ;
   * seuls les cycles de `cycleSlugs` sont alors exposés. Par défaut, tout cycle qui cite une source touchée l'est.
   */
  exposeCycles?: boolean;
  /** Ce qui est périmé ou ambigu dans PROBANT aujourd'hui. */
  outdatedInProbant: string;
  applicability?: string;
  integration: IntegrationStatus;
  integrationNote?: string;
  /** Provenance d'un fait repris du dépôt (fichier, date de lecture). */
  provenance?: string;
  limits: string[];
}

export interface VeilleData {
  /** Date d'arrêté de la veille : toutes les comparaisons de dates se font à cette date. */
  arreteAu: string;
  perimetre: string;
  methode: string;
  /** Au-delà de ce délai depuis la dernière vérification, une source est « à revérifier ». */
  reverificationDays: number;
  evolutions: VeilleEvolution[];
}

// ── Relevé des liens ─────────────────────────────────────────────────────────────────────────────

export type LinkOutcome = "ok" | "redirige" | "introuvable" | "injoignable" | "non_controlable";

export const LINK_OUTCOME_LABEL: Record<LinkOutcome | "sans_url" | "non_releve", string> = {
  ok: "Joignable",
  redirige: "Redirigé vers une autre page",
  introuvable: "Introuvable (404)",
  injoignable: "Domaine injoignable",
  non_controlable: "Refus des robots — à ouvrir à la main",
  sans_url: "Aucune adresse",
  non_releve: "Non relevé",
};

export interface LinkCheckEntry {
  url: string;
  httpStatus: number | null;
  finalUrl: string | null;
  outcome: LinkOutcome;
}

export interface LinkCheckFile {
  checkedAt: string;
  tool: string;
  entries: LinkCheckEntry[];
}

/** Date de vérification connue d'une source du registre de connaissances (lib/knowledge). */
export interface KnowledgeVerification {
  knowledgeSourceId: string;
  lastVerifiedAt: string;
  canonicalUrl?: string;
}

// ── Résultats ────────────────────────────────────────────────────────────────────────────────────

/** Situation d'une évolution à la date d'arrêté. */
export type EvolutionTiming = "en_vigueur" | "a_venir" | "sans_date";

export const TIMING_LABEL: Record<EvolutionTiming, string> = {
  en_vigueur: "En vigueur",
  a_venir: "À venir",
  sans_date: "Sans date d'effet",
};

export type VerificationState = "verifiee" | "a_reverifier" | "jamais";

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  verifiee: "Vérifiée",
  a_reverifier: "À revérifier",
  jamais: "Jamais vérifiée",
};

export interface EvolutionView extends VeilleEvolution {
  timing: EvolutionTiming;
  /** Sources du registre réellement trouvées (les autres sont signalées par la validation). */
  sources: { id: string; label: string }[];
  /** Cycles touchés : ceux qui citent une source concernée, plus `cycleSlugs`. */
  cycles: { slug: string; title: string }[];
  methodology: { slug: string; title: string }[];
}

export interface SourceVeille {
  id: string;
  label: string;
  type: SourceType;
  url: string | null;
  verification: {
    state: VerificationState;
    date: string | null;
    /** D'où vient la date : registre Normatif ou registre de connaissances. */
    provenance: string | null;
    ageDays: number | null;
  };
  link: { state: LinkOutcome | "sans_url" | "non_releve"; entry: LinkCheckEntry | null };
  evolutions: { id: string; short: string; title: string; timing: EvolutionTiming; integration: IntegrationStatus }[];
  cycles: string[];
  methodology: string[];
  /** Rang dans la file de revue (1 = le plus urgent) et motifs lisibles. */
  queue: { rank: number; reasons: string[] };
}

export interface CycleExposure {
  slug: string;
  title: string;
  family: AuditCycle["family"];
  enVigueur: { id: string; short: string }[];
  aVenir: { id: string; short: string }[];
  /** Sources citées dont le lien est introuvable ou injoignable. */
  deadLinks: string[];
  /** Sources citées jamais vérifiées ou à revérifier. */
  unverified: number;
  /** Nombre de sources distinctes citées. */
  sourceCount: number;
}

export interface VeilleIssue {
  field: string;
  message: string;
}

export interface VeilleReport {
  arreteAu: string;
  perimetre: string;
  methode: string;
  linksCheckedAt: string | null;
  reverificationDays: number;
  evolutions: EvolutionView[];
  sources: SourceVeille[];
  cycles: CycleExposure[];
  counts: {
    evolutions: number;
    enVigueurAIntegrer: number;
    aVenirAIntegrer: number;
    sansDateAIntegrer: number;
    integrees: number;
    aSurveiller: number;
    sources: number;
    verifiees: number;
    aReverifier: number;
    jamaisVerifiees: number;
    liens: Record<LinkOutcome | "sans_url" | "non_releve", number>;
    cyclesExposes: number;
  };
  issues: VeilleIssue[];
}

// ── Outils de date (chaînes AAAA-MM-JJ, sans fuseau) ─────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Nombre de jours de `from` à `to` (positif si `to` est postérieure). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function evolutionTiming(evolution: Pick<VeilleEvolution, "effectiveFrom">, arreteAu: string): EvolutionTiming {
  if (!evolution.effectiveFrom) return "sans_date";
  return evolution.effectiveFrom <= arreteAu ? "en_vigueur" : "a_venir";
}

// ── Références d'un cycle ────────────────────────────────────────────────────────────────────────

/** Identifiants distincts des sources citées par un cycle (normes applicables, sources, seuils, ratios…). */
export function cycleSourceIds(cycle: AuditCycle): Set<string> {
  const ids = new Set<string>();
  for (const ref of cycle.applicableStandards ?? []) ids.add(ref.id);
  for (const ref of cycle.officialSources ?? []) ids.add(ref.id);
  const lists: { sourceIds?: string[] }[] = [
    ...(cycle.thresholds ?? []),
    ...(cycle.ratios ?? []),
    ...(cycle.analyticalProcedures ?? []),
    ...(cycle.detailTests ?? []),
    ...(cycle.risks ?? []),
    ...(cycle.ifrsVsPcg ?? []),
  ];
  if (cycle.materiality) {
    lists.push(
      cycle.materiality.globalMateriality,
      cycle.materiality.performanceMateriality,
      cycle.materiality.clearlyTrivialThreshold,
    );
  }
  for (const item of lists) for (const id of item?.sourceIds ?? []) ids.add(id);
  return ids;
}

/** Identifiants cités par un document méthodologique (en-tête et contenu, à toute profondeur). */
export function methodologySourceIds(doc: MethodologyDocument): Set<string> {
  const ids = new Set<string>(doc.sourceIds ?? []);
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        if (key === "sourceIds" && Array.isArray(inner)) {
          for (const id of inner) if (typeof id === "string") ids.add(id);
        } else {
          walk(inner);
        }
      }
    }
  };
  walk(doc.content);
  return ids;
}

// ── Normalisation des adresses (relevé des liens) ────────────────────────────────────────────────

/** Deux adresses désignent la même page si elles ne diffèrent que par `.html`, la barre finale ou la casse de l'hôte. */
export function samePage(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const url = new URL(u);
      const pathname = url.pathname.replace(/\.html?$/i, "").replace(/\/+$/, "");
      return `${url.host.toLowerCase().replace(/^www\./, "")}${pathname}${url.search}`;
    } catch {
      return u;
    }
  };
  return norm(a) === norm(b);
}

/** Qualification d'un relevé HTTP : utilisée par scripts/normatif-link-check.mjs et par les tests. */
export function classifyLink(url: string, httpStatus: number | null, finalUrl: string | null): LinkOutcome {
  if (httpStatus === null || httpStatus === 0) return "injoignable";
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return "non_controlable";
  if (httpStatus === 404 || httpStatus === 410) return "introuvable";
  if (httpStatus >= 200 && httpStatus < 400) {
    return finalUrl && !samePage(url, finalUrl) ? "redirige" : "ok";
  }
  // 5xx et autres : la page n'a pas pu être servie au moment du relevé.
  return "injoignable";
}

// ── Construction du rapport ──────────────────────────────────────────────────────────────────────

export interface VeilleInput {
  veille: VeilleData;
  sources: NormativeSource[];
  cycles: AuditCycle[];
  methodology: MethodologyDocument[];
  linkCheck: LinkCheckFile | null;
  knowledge: KnowledgeVerification[];
}

const EMPTY_LINK_COUNTS = (): Record<LinkOutcome | "sans_url" | "non_releve", number> => ({
  ok: 0,
  redirige: 0,
  introuvable: 0,
  injoignable: 0,
  non_controlable: 0,
  sans_url: 0,
  non_releve: 0,
});

/** Contrôles de cohérence de la veille elle-même (identifiants, dates, provenance). */
export function validateVeille(input: Pick<VeilleInput, "veille" | "sources" | "cycles" | "methodology">): VeilleIssue[] {
  const issues: VeilleIssue[] = [];
  const { veille } = input;
  const sourceIds = new Set(input.sources.map((s) => s.id));
  const cycleSlugs = new Set(input.cycles.map((c) => c.slug));
  const methodologySlugs = new Set(input.methodology.map((m) => m.slug));
  if (!isIsoDate(veille.arreteAu)) issues.push({ field: "arreteAu", message: `Date d'arrêté invalide : ${String(veille.arreteAu)}` });
  const seen = new Set<string>();
  for (const e of veille.evolutions) {
    const at = `evolutions.${e.id}`;
    if (seen.has(e.id)) issues.push({ field: at, message: "Identifiant en double." });
    seen.add(e.id);
    for (const id of e.normatifSourceIds ?? []) {
      if (!sourceIds.has(id)) issues.push({ field: `${at}.normatifSourceIds`, message: `Source inconnue du registre : ${id}` });
    }
    for (const slug of e.cycleSlugs ?? []) {
      if (!cycleSlugs.has(slug)) issues.push({ field: `${at}.cycleSlugs`, message: `Cycle inconnu : ${slug}` });
    }
    for (const slug of e.methodologySlugs ?? []) {
      if (!methodologySlugs.has(slug)) issues.push({ field: `${at}.methodologySlugs`, message: `Document méthodologique inconnu : ${slug}` });
    }
    for (const key of ["effectiveFrom", "publishedOn", "readAt"] as const) {
      const value = e[key];
      if (value !== null && value !== undefined && !isIsoDate(value)) issues.push({ field: `${at}.${key}`, message: `Date invalide : ${String(value)}` });
    }
    if (e.access !== "inaccessible" && (!e.officialUrl || !e.readAt)) {
      issues.push({ field: at, message: "Une évolution établie doit porter l'adresse officielle lue et la date de lecture." });
    }
    if (e.access === "repris_du_depot" && !e.provenance) {
      issues.push({ field: at, message: "Un fait repris du dépôt doit citer sa provenance." });
    }
    if (e.readAt && isIsoDate(e.readAt) && isIsoDate(veille.arreteAu) && e.readAt > veille.arreteAu) {
      issues.push({ field: `${at}.readAt`, message: "Lecture postérieure à la date d'arrêté de la veille." });
    }
    const unattached = (e.normatifSourceIds ?? []).length === 0 && (e.cycleSlugs ?? []).length === 0 && (e.methodologySlugs ?? []).length === 0;
    // Une norme absente du registre, ou un projet à surveiller, peut ne toucher encore aucune source ni aucune fiche.
    if (unattached && e.kind !== "absence_registre" && e.integration !== "a_surveiller") {
      issues.push({ field: at, message: "Évolution rattachée à aucune source, aucun cycle ni aucun document." });
    }
  }
  return issues;
}

export function buildVeilleReport(input: VeilleInput): VeilleReport {
  const { veille, sources, cycles, methodology, linkCheck, knowledge } = input;
  const arreteAu = veille.arreteAu;
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  // Qui cite quoi.
  const cyclesBySource = new Map<string, string[]>();
  const sourcesByCycle = new Map<string, Set<string>>();
  for (const cycle of cycles) {
    const ids = cycleSourceIds(cycle);
    sourcesByCycle.set(cycle.slug, ids);
    for (const id of ids) cyclesBySource.set(id, [...(cyclesBySource.get(id) ?? []), cycle.slug]);
  }
  const methodologyBySource = new Map<string, string[]>();
  for (const doc of methodology) {
    for (const id of methodologySourceIds(doc)) methodologyBySource.set(id, [...(methodologyBySource.get(id) ?? []), doc.slug]);
  }

  // Évolutions situées à la date d'arrêté.
  const evolutions: EvolutionView[] = veille.evolutions.map((e) => {
    const cycleSet = new Set<string>(e.cycleSlugs ?? []);
    if (e.exposeCycles !== false) {
      for (const id of e.normatifSourceIds ?? []) for (const slug of cyclesBySource.get(id) ?? []) cycleSet.add(slug);
    }
    const methodologySet = new Set<string>(e.methodologySlugs ?? []);
    for (const id of e.normatifSourceIds ?? []) for (const slug of methodologyBySource.get(id) ?? []) methodologySet.add(slug);
    return {
      ...e,
      timing: evolutionTiming(e, arreteAu),
      sources: (e.normatifSourceIds ?? []).flatMap((id) => {
        const s = sourceById.get(id);
        return s ? [{ id, label: s.label }] : [];
      }),
      cycles: cycles.filter((c) => cycleSet.has(c.slug)).map((c) => ({ slug: c.slug, title: c.title })),
      methodology: methodology.filter((m) => methodologySet.has(m.slug)).map((m) => ({ slug: m.slug, title: m.title })),
    };
  });
  const open = (e: EvolutionView) => isOpen(e.integration);

  // Vérification la plus récente connue par source : registre Normatif ou registre de connaissances.
  const knowledgeById = new Map<string, KnowledgeVerification>();
  for (const k of knowledge) {
    const prev = knowledgeById.get(k.knowledgeSourceId);
    if (!prev || k.lastVerifiedAt > prev.lastVerifiedAt) knowledgeById.set(k.knowledgeSourceId, k);
  }
  const linkByUrl = new Map((linkCheck?.entries ?? []).map((entry) => [entry.url, entry]));
  const linkCounts = EMPTY_LINK_COUNTS();

  const sourceViews: SourceVeille[] = sources.map((s) => {
    // Vérification.
    const candidates: { date: string; provenance: string }[] = [];
    if (s.verifiedAt && isIsoDate(s.verifiedAt) && s.verifiedAt <= arreteAu) {
      candidates.push({ date: s.verifiedAt, provenance: s.verifiedNote ?? "Registre Audit Normatif 360" });
    }
    const k = s.knowledgeSourceId ? knowledgeById.get(s.knowledgeSourceId) : undefined;
    if (k && isIsoDate(k.lastVerifiedAt) && k.lastVerifiedAt <= arreteAu) {
      candidates.push({ date: k.lastVerifiedAt, provenance: `Registre de connaissances PROBANT (${k.knowledgeSourceId})` });
    }
    candidates.sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = candidates[0] ?? null;
    const ageDays = latest ? daysBetween(latest.date, arreteAu) : null;
    const vState: VerificationState = !latest ? "jamais" : ageDays! > veille.reverificationDays ? "a_reverifier" : "verifiee";

    // Lien.
    const entry = s.url ? (linkByUrl.get(s.url) ?? null) : null;
    const lState: SourceVeille["link"]["state"] = !s.url ? "sans_url" : entry ? entry.outcome : "non_releve";
    linkCounts[lState] += 1;

    // Évolutions.
    const evs = evolutions
      .filter((e) => (e.normatifSourceIds ?? []).includes(s.id))
      .map((e) => ({ id: e.id, short: e.short, title: e.title, timing: e.timing, integration: e.integration }));

    // File de revue : ordre des constats, motifs explicites, sans pondération.
    const reasons: string[] = [];
    let rank = 6;
    const take = (r: number, why: string) => {
      reasons.push(why);
      rank = Math.min(rank, r);
    };
    for (const e of evs.filter((x) => isOpen(x.integration))) {
      if (e.timing === "en_vigueur") take(1, `${e.short} : ${TIMING_LABEL.en_vigueur.toLowerCase()}, ${INTEGRATION_LABEL[e.integration].toLowerCase()}`);
      else if (e.timing === "a_venir") take(3, `${e.short} : ${TIMING_LABEL.a_venir.toLowerCase()}, ${INTEGRATION_LABEL[e.integration].toLowerCase()}`);
      else take(2, `${e.short} : ${INTEGRATION_LABEL[e.integration].toLowerCase()}`);
    }
    if (lState === "introuvable" || lState === "injoignable") take(2, `Lien ${LINK_OUTCOME_LABEL[lState].toLowerCase()}`);
    if (lState === "redirige") take(4, "Lien redirigé : vérifier le titre de la page d'arrivée");
    if (lState === "sans_url") take(4, "Aucune adresse officielle");
    if (vState !== "verifiee") take(5, vState === "jamais" ? "Jamais vérifiée sur une page officielle" : `Dernière vérification il y a ${ageDays} jours`);

    return {
      id: s.id,
      label: s.label,
      type: s.type,
      url: s.url ?? null,
      verification: { state: vState, date: latest?.date ?? null, provenance: latest?.provenance ?? null, ageDays },
      link: { state: lState, entry },
      evolutions: evs,
      cycles: cyclesBySource.get(s.id) ?? [],
      methodology: methodologyBySource.get(s.id) ?? [],
      queue: { rank, reasons },
    };
  });
  sourceViews.sort((a, b) => a.queue.rank - b.queue.rank || a.label.localeCompare(b.label, "fr"));
  const sourceViewById = new Map(sourceViews.map((s) => [s.id, s]));

  // Exposition des cycles.
  const exposures: CycleExposure[] = cycles.map((cycle) => {
    const ids = sourcesByCycle.get(cycle.slug) ?? new Set<string>();
    const touching = evolutions.filter((e) => open(e) && e.cycles.some((c) => c.slug === cycle.slug));
    const pick = (t: EvolutionTiming) => touching.filter((e) => e.timing === t).map((e) => ({ id: e.id, short: e.short }));
    const known = [...ids].map((id) => sourceViewById.get(id)).filter((s): s is SourceVeille => Boolean(s));
    return {
      slug: cycle.slug,
      title: cycle.title,
      family: cycle.family,
      enVigueur: [...pick("en_vigueur"), ...pick("sans_date")],
      aVenir: pick("a_venir"),
      deadLinks: known.filter((s) => s.link.state === "introuvable" || s.link.state === "injoignable").map((s) => s.id),
      unverified: known.filter((s) => s.verification.state !== "verifiee").length,
      sourceCount: ids.size,
    };
  });
  exposures.sort(
    (a, b) =>
      b.enVigueur.length - a.enVigueur.length ||
      b.aVenir.length - a.aVenir.length ||
      b.deadLinks.length - a.deadLinks.length ||
      a.title.localeCompare(b.title, "fr"),
  );

  const openEvs = evolutions.filter(open);
  return {
    arreteAu,
    perimetre: veille.perimetre,
    methode: veille.methode,
    linksCheckedAt: linkCheck?.checkedAt ?? null,
    reverificationDays: veille.reverificationDays,
    evolutions: [...evolutions].sort(
      (a, b) => (a.effectiveFrom ?? "9999").localeCompare(b.effectiveFrom ?? "9999") || a.short.localeCompare(b.short, "fr"),
    ),
    sources: sourceViews,
    cycles: exposures,
    counts: {
      evolutions: evolutions.length,
      enVigueurAIntegrer: openEvs.filter((e) => e.timing === "en_vigueur").length,
      aVenirAIntegrer: openEvs.filter((e) => e.timing === "a_venir").length,
      sansDateAIntegrer: openEvs.filter((e) => e.timing === "sans_date").length,
      integrees: evolutions.filter((e) => e.integration === "integre").length,
      aSurveiller: evolutions.filter((e) => e.integration === "a_surveiller").length,
      sources: sourceViews.length,
      verifiees: sourceViews.filter((s) => s.verification.state === "verifiee").length,
      aReverifier: sourceViews.filter((s) => s.verification.state === "a_reverifier").length,
      jamaisVerifiees: sourceViews.filter((s) => s.verification.state === "jamais").length,
      liens: linkCounts,
      cyclesExposes: exposures.filter((c) => c.enVigueur.length > 0).length,
    },
    issues: validateVeille(input),
  };
}

/** Exposition d'un seul cycle (fiche cycle). */
export function cycleVeille(report: VeilleReport, slug: string): { exposure: CycleExposure | null; evolutions: EvolutionView[] } {
  return {
    exposure: report.cycles.find((c) => c.slug === slug) ?? null,
    evolutions: report.evolutions.filter((e) => isOpen(e.integration) && e.cycles.some((c) => c.slug === slug)),
  };
}

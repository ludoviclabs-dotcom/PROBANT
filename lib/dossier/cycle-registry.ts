import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import type { Finding, Severity } from "@/lib/canonical-model/finding";
import type { WorkpaperState } from "@/lib/workpapers/model";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { summarizeWorkpapers } from "@/lib/workpapers/mission-summary";
import { statusAfterReviewEvents } from "@/lib/dossier/review";
import { CLOSED_REVIEW } from "@/lib/synthesis/engine";

/**
 * Lignes de cycle de la Synthèse — projection C02 du registre unique de capacités (C01,
 * `lib/capabilities/registry.ts`). Le registre fournit cycles, libellés, procédures outillées,
 * scénarios de l'atelier, routes, sources requises, exclusions et capacité par mode. Ce module
 * n'y ajoute que la présentation (étendue en une phrase, silos des constats historiques, libellés
 * d'accès, limites héritées des anciens paragraphes de la Synthèse) et la projection d'un dossier :
 * état, écarts et prochaine action, lus dans les résultats existants. Aucune seconde source de vérité.
 */

/** Capacité par mode (vocabulaire C01) : implémentée dans le code, configurée (activation locale requise), absente. */
export type CapabilityLevel = "implemented" | "configured" | "absent";
export interface CycleCapability { historique: CapabilityLevel; scenario: CapabilityLevel; persistant: CapabilityLevel }

export interface CycleLink { label: string; href: string }

type RegistryCycle = (typeof CAPABILITY_REGISTRY)[number];
export type CycleId = RegistryCycle["id"];

export interface CycleRegistryEntry {
  id: CycleId;
  label: string;
  /** Étendue réellement couverte par les feuilles livrées (présentation C02). */
  scope: string;
  /** Exclusions du registre C01, puis limites héritées des anciens paragraphes de la Synthèse. */
  exclusions: readonly string[];
  /** Sources à fournir pour un travail réel (registre C01). */
  sources: readonly string[];
  sheet: CycleLink | null;
  synthesis: CycleLink | null;
  secondary: readonly CycleLink[];
  procedures: readonly string[];
  /** Scénarios exécutables dans le laboratoire (`demo.cycle.<id>`), d'après le registre. */
  workshop: readonly string[];
  /** Silos des constats historiques rattachés à ce cycle. */
  silos: readonly string[];
  capability: CycleCapability;
}

interface Presentation { scope: string; silos: readonly string[]; sheet?: CycleLink; synthesisLabel?: string; secondary?: readonly CycleLink[]; legacyLimits?: readonly string[] }

/** Présentation par cycle ; les textes de limite reprennent mot pour mot les anciens paragraphes de la Synthèse. */
const PRESENTATION: Record<CycleId, Presentation> = {
  clients: { scope: "Cadrage GL / auxiliaire / balance âgée, encaissements ultérieurs, avoirs et jugement documenté.", silos: ["creances-clients", "rapprochement-clients", "chiffre-affaires", "pca"],
    sheet: { label: "Cadrage Clients", href: "/clients-framing" }, synthesisLabel: "Synthèse des procédures — cadrage Clients", legacyLimits: ["Sources distinctes des constats historiques DEMO SA et de l’atelier synthétique."] },
  achats: { scope: "Cadrage Fournisseurs, achats enregistrés et rattachement, recherche de passifs non enregistrés.", silos: ["dettes-fournisseurs", "rapprochement-fournisseurs", "achats-charges-externes", "cca"],
    sheet: { label: "Feuille Achats et fournisseurs", href: "/payables" }, synthesisLabel: "Synthèse Achats et fournisseurs", secondary: [{ label: "Cut-off transversal ventes / achats", href: "/cutoff" }] },
  tresorerie: { scope: "Pont bancaire et apurement des éléments en transit.", silos: ["rapprochement-tresorerie", "autres-creances-tresorerie", "resultat-financier"],
    sheet: { label: "Feuille Trésorerie", href: "/tresorerie" }, synthesisLabel: "Synthèse des procédures — Trésorerie (pont bancaire et apurement)", legacyLimits: ["Caisse et VMP non couvertes."] },
  immobilisations: { scope: "Mouvements, cadrage et recalcul documenté des amortissements.", silos: ["immobilisations-incorporelles", "immobilisations-corporelles", "immobilisations-financieres", "rapprochement-immobilisations", "dap"],
    sheet: { label: "Feuille Immobilisations", href: "/immobilisations" }, synthesisLabel: "Synthèse des procédures — Immobilisations (mouvements, cadrage et recalcul documenté)", legacyLimits: ["Existence physique et valeur non couvertes."] },
  stocks: { scope: "Quantités comptées, mouvements intercalaires, passage inventaire → clôture.", silos: ["stocks", "rapprochement-stocks"],
    sheet: { label: "Feuille Stocks", href: "/stocks" }, legacyLimits: ["Stock propre distingué des stocks de tiers ; aucune présence physique certifiée, aucune dépréciation automatique."] },
  provisions: { scope: "Registre des risques et engagements : ponts, estimation / écriture, événement / annexe.", silos: ["provisions", "rapprochement-provisions", "engagements-hors-bilan"],
    sheet: { label: "Registre Provisions et engagements", href: "/provisions" }, synthesisLabel: "Synthèse des procédures — Provisions et engagements (version exacte, export)", legacyLimits: ["Événements avec ou sans écriture ; contenu confidentiel masqué par le serveur ; aucune issue juridique déduite."] },
  capitaux_propres: { scope: "Parcours unique : décisions, effet par composante, comptabilisation, paiement et PV cités, lus dans les deux feuilles d’origine sans double compte.", silos: ["capitaux-propres", "rapprochement-capitaux"],
    sheet: { label: "Parcours Capitaux propres", href: "/capitaux-propres/parcours" }, synthesisLabel: "Synthèse — Capitaux propres, feuille décisions et PV versionnés",
    legacyLimits: ["Dossier /equity : parcours historique lisible et poursuivable depuis le parcours unique, sans migration ; aucune conclusion juridique."] },
  participations: { scope: "Droits, distributions et valeur de détention.", silos: [], sheet: { label: "Participations · droits, distributions et valeur", href: "/participations" } },
  fiscal: { scope: "TVA par période déclarative, IS par exercice.", silos: ["dettes-fiscales-sociales", "rapprochement-fiscal"],
    sheet: { label: "Feuille fiscale", href: "/fiscal" }, synthesisLabel: "Synthèse fiscale — TVA par période déclarative, IS par exercice",
    secondary: [{ label: "Cockpit Fiscalité — contrôles et réconciliations", href: "/dashboard/fiscalite" }], legacyLimits: ["Moteurs fiscaux existants, aucune liquidation ni conformité déclarée."] },
  paie: { scope: "Journal, déclarations et paiements ; congés en revue indépendante.", silos: ["charges-personnel", "rapprochement-paie"],
    sheet: { label: "Paie · journal, déclarations et paiements", href: "/paie-personnel" }, secondary: [{ label: "Congés · revue indépendante", href: "/paie-personnel/conges" }], legacyLimits: ["Profil personnel local ; accès RH dédié, sans logiciel de paie ni DSN native."] },
  exceptionnel: { scope: "Revue de classement par événement du résultat exceptionnel.", silos: ["resultat-exceptionnel", "rapprochement-resultat-exceptionnel"],
    sheet: { label: "Résultat exceptionnel · revue par événement", href: "/resultat-exceptionnel" } },
  transversal: { scope: "Programme de travail, contrôle interne et clôture : synthèse des travaux par cycle, feuilles rattachées, travaux restants, pièces manquantes et contradictions ; cut-off transversal.", silos: [],
    sheet: { label: "Dossier professionnel — programme de travail, contrôle interne et clôture", href: "/dossier-cloture" }, secondary: [{ label: "Cut-off transversal ventes / achats", href: "/cutoff" }],
    legacyLimits: ["Les feuilles de cycle ne forment pas un audit complet ; aucune opinion générée."] },
  informatique: { scope: "Contrôles généraux informatiques déclarés dans le dossier de clôture, avec leur propre périmètre.", silos: [],
    secondary: [{ label: "Déclarer le périmètre ITGC dans le dossier de clôture", href: "/dossier-cloture" }], legacyLimits: ["Aucun travail ni conclusion avant définition du périmètre ITGC : une checklist ne vaut pas couverture."] },
  dettes_financieres: { scope: "Échéancier des emprunts rapproché du grand livre 16 dans le rapprochement historique.", silos: ["dettes-financieres", "rapprochement-dettes-financieres"] },
};

export const CYCLE_REGISTRY: readonly CycleRegistryEntry[] = CAPABILITY_REGISTRY.map((c: RegistryCycle): CycleRegistryEntry => {
  const p = PRESENTATION[c.id];
  const firstProcedure = c.procedures[0] as { label: string; route: string } | undefined;
  return {
    id: c.id, label: c.label, scope: p.scope,
    exclusions: [...c.exclusions, ...(p.legacyLimits ?? [])],
    sources: c.requiredSources,
    sheet: p.sheet ?? (firstProcedure ? { label: firstProcedure.label, href: firstProcedure.route } : null),
    synthesis: c.synthesisRoute ? { label: p.synthesisLabel ?? `Synthèse — ${c.label}`, href: c.synthesisRoute } : null,
    secondary: p.secondary ?? [],
    procedures: c.procedures.map(x => x.id),
    workshop: c.workshops.map(w => w.id),
    silos: p.silos,
    capability: {
      historique: c.modes.historical.implemented ? "implemented" : "absent",
      scenario: c.modes.scenario.implemented ? "implemented" : "absent",
      // Le registre décrit l'implémentation ; l'activation locale est lue à part (`/api/dossier-capabilities`, panneau de capacités).
      persistant: c.modes.local_persistent.implemented ? "configured" : "absent",
    },
  };
});

export const CYCLE_REGISTRY_VERSION = "c02-projection-2";

/* ── Projection d'un dossier ─────────────────────────────────────────────── */

export type CycleRowStatus = "locked" | "review" | "executed" | "blocked" | "stale" | "findings" | "available" | "source_required" | "absent";

export const CYCLE_STATUS_LABELS: Record<CycleRowStatus, string> = {
  locked: "Verrouillé", review: "En revue", executed: "Exécuté", blocked: "Bloqué", stale: "Périmé",
  findings: "Constats historiques", available: "Feuille disponible", source_required: "Source requise", absent: "Hors périmètre",
};

export interface CycleRowGaps {
  /** Exceptions démontrées par les contrôles du laboratoire (compteur de résultat, jamais une somme de montants). */
  exceptions: number | null;
  /** Constats historiques par gravité ; null lorsque le dossier ne porte aucun constat historique. */
  findings: Record<Severity, number> | null;
  openBlocking: number;
}

export interface CycleRow {
  entry: CycleRegistryEntry;
  status: CycleRowStatus;
  /** Détail d'état (révision, nombre de feuilles, raison du blocage). */
  statusDetail: string | null;
  gaps: CycleRowGaps;
  nextAction: { label: string; href: string | null; kind: "proof" | "work" | "review" | "source" | "open" | "declare" };
  /** Feuilles courantes rattachées (identifiants `wp-<id>` pour la preuve). */
  runs: { id: string; state: WorkpaperState; revision: number; stale: boolean; exceptions: number; blocked: boolean }[];
}

const SEVERITIES: Severity[] = ["bloquant", "majeur", "mineur", "informatif"];
const STATE_RANK: Record<WorkpaperState, number> = { blocked: 9, failed: 9, changes_requested: 8, awaiting_review: 7, executed: 6, approved: 5, ready: 4, draft: 3, locked: 2, superseded: 0 };

function findingsOf(findings: Finding[], silos: readonly string[]): Record<Severity, number> | null {
  const matched = findings.filter(f => silos.includes(f.siloId));
  if (!matched.length) return null;
  const counts: Record<Severity, number> = { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 };
  for (const f of matched) counts[f.severity] += 1;
  return counts;
}

/**
 * Lignes de cycle d'un dossier : état, écarts et prochaine action, à partir des résultats déjà
 * calculés (constats du snapshot, résumé des feuilles). Aucun recalcul de cycle, aucune somme
 * de montants entre catégories.
 */
export function projectCycleRows(snapshot: DossierSnapshot, options: { synthetic?: boolean } = {}): CycleRow[] {
  const summary = summarizeWorkpapers(snapshot);
  const templateById = new Map([...(snapshot.workpapers?.runs ?? []), ...(snapshot.workpaperProjection?.lockedRuns ?? [])].map(r => [r.id, r.template.id] as const));
  const synthetic = options.synthetic ?? (snapshot.dossier.organizationId === "SYNTHETIC-DEMO");
  const historical = synthetic ? [] : snapshot.findings;
  const hasHistorical = historical.length > 0;
  return CYCLE_REGISTRY.map(entry => {
    // Feuilles du laboratoire (`demo.cycle.*`) et feuilles durables des procédures outillées du cycle.
    const templates = new Set<string>([...entry.workshop.map(w => `demo.cycle.${w}`), ...entry.procedures]);
    const runs = summary.rows
      .filter(r => templates.has(templateById.get(r.id) ?? ""))
      .map(r => ({ id: r.id, state: r.state, revision: r.revision, stale: r.stale, exceptions: r.presentation.exceptions, blocked: r.blocked }));
    const findings = findingsOf(historical, entry.silos);
    // Même règle que le moteur de Synthèse : statut effectif après la chaîne d'événements de revue, jamais le seul statut d'origine.
    const openBlocking = historical.filter(f => entry.silos.includes(f.siloId) && f.severity === "bloquant" && !CLOSED_REVIEW.has(statusAfterReviewEvents(f, snapshot.reviewEvents))).length;
    const gaps: CycleRowGaps = { exceptions: runs.length ? runs.reduce((n, r) => n + r.exceptions, 0) : null, findings, openBlocking };

    const lead = [...runs].sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state] || b.revision - a.revision)[0];
    let status: CycleRowStatus; let statusDetail: string | null = null;
    let nextAction: CycleRow["nextAction"];
    if (lead) {
      status = lead.blocked || lead.state === "blocked" || lead.state === "failed" ? "blocked"
        : lead.stale ? "stale"
        : lead.state === "locked" ? "locked"
        : ["awaiting_review", "changes_requested", "approved"].includes(lead.state) ? "review"
        : "executed";
      statusDetail = `${runs.length} feuille${runs.length > 1 ? "s" : ""} · révision ${lead.revision}`;
      nextAction = status === "blocked" ? { label: "Fournir la source requise", href: entry.id === "fiscal" ? "/dashboard/fiscalite" : "/dashboard/depot", kind: "source" }
        : status === "stale" ? { label: "Réexécuter puis soumettre une nouvelle revue", href: "/dashboard/tests", kind: "work" }
        : status === "locked" ? { label: "Consulter la preuve verrouillée", href: `#wp-${encodeURIComponent(lead.id)}`, kind: "proof" }
        : status === "review" ? { label: lead.state === "approved" ? "Verrouiller la version revue" : lead.state === "changes_requested" ? "Corriger puis soumettre" : "Revoir la feuille", href: "/dashboard/tests", kind: "review" }
        : { label: "Soumettre à la revue", href: "/dashboard/tests", kind: "work" };
    } else if (findings) {
      status = "findings";
      statusDetail = `${findings.bloquant + findings.majeur + findings.mineur + findings.informatif} constat(s) DEMO SA · revue par cloison`;
      nextAction = openBlocking > 0
        ? { label: `Arbitrer ${openBlocking} constat${openBlocking > 1 ? "s" : ""} bloquant${openBlocking > 1 ? "s" : ""}`, href: "/dashboard/cloisons", kind: "review" }
        : entry.sheet ? { label: `Ouvrir ${entry.sheet.label}`, href: entry.sheet.href, kind: "open" } : { label: "Poursuivre la revue par cloison", href: "/dashboard/cloisons", kind: "review" };
    } else if (entry.sheet && (entry.capability.persistant !== "absent" || entry.capability.scenario !== "absent")) {
      const historicalMode = hasHistorical && entry.capability.historique === "absent";
      status = historicalMode ? "source_required" : "available";
      statusDetail = historicalMode ? "Aucun constat historique : feuille de travail à alimenter" : entry.capability.persistant === "configured" ? "Chaîne durable à activer localement ; scénario possible dans le laboratoire" : null;
      nextAction = entry.workshop.length && synthetic
        ? { label: "Exécuter un scénario", href: "/dashboard/tests", kind: "work" }
        : { label: `Ouvrir ${entry.sheet.label}`, href: entry.sheet.href, kind: "open" };
    } else {
      status = "absent";
      statusDetail = entry.exclusions[0] ?? null;
      const declare = entry.secondary[0] ?? null;
      nextAction = declare ? { label: declare.label, href: declare.href, kind: "declare" } : { label: `Fournir : ${entry.sources.join(", ")}`, href: null, kind: "declare" };
    }
    return { entry, status, statusDetail, gaps, nextAction, runs };
  });
}

/** Ordre de lecture : ce qui demande une action d'abord, puis ce qui est disponible, puis le hors périmètre. */
const ROW_PRIORITY: Record<CycleRowStatus, number> = { blocked: 0, stale: 1, review: 2, executed: 3, findings: 4, locked: 5, available: 6, source_required: 7, absent: 8 };
export function sortCycleRows(rows: CycleRow[]): CycleRow[] {
  return [...rows].sort((a, b) => ROW_PRIORITY[a.status] - ROW_PRIORITY[b.status] || b.gaps.openBlocking - a.gaps.openBlocking);
}

/** Cycle dont l'action est prioritaire : la première ligne après tri, lorsqu'une action est possible. */
export function priorityCycle(rows: CycleRow[]): CycleRow | null {
  const sorted = sortCycleRows(rows);
  return sorted.find(r => r.status !== "absent") ?? null;
}

/* ── État des sources ────────────────────────────────────────────────────── */

export interface SourceState {
  kind: "demo" | "session" | "persistent";
  kindLabel: string;
  synthetic: boolean;
  fecFingerprint: string | null;
  documents: number;
  blockingAdmissibility: number;
  workpapers: { planned: number; executed: number; locked: number; blocked: number };
}

const KIND_LABELS = { demo: "Démonstration historique", session: "Session navigateur", persistent: "Dossier persistant" } as const;

/** Lecture seule de l'origine des données : jamais une conclusion sur leur qualité. */
export function projectSourceState(snapshot: DossierSnapshot): SourceState {
  const summary = summarizeWorkpapers(snapshot);
  const synthetic = snapshot.dossier.organizationId === "SYNTHETIC-DEMO";
  return {
    kind: snapshot.sourceKind, kindLabel: synthetic ? "Scénario synthétique (ce navigateur)" : KIND_LABELS[snapshot.sourceKind], synthetic,
    fecFingerprint: synthetic ? null : snapshot.dossier.fecFingerprint || null,
    documents: snapshot.sourceDocuments.length,
    blockingAdmissibility: snapshot.admissibilityFindings.filter(f => f.severity === "bloquant").length,
    workpapers: { planned: summary.planned, executed: summary.executed, locked: summary.approved, blocked: summary.blocked },
  };
}

export const SEVERITY_ORDER = SEVERITIES;

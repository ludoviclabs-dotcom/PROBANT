import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import type { Finding, Severity } from "@/lib/canonical-model/finding";
import type { WorkpaperState } from "@/lib/workpapers/model";
import { CL_CYCLE_LABELS, CL_ENGINE_PROCEDURES, type ClosingCycle, type EngineProcedureId } from "@/lib/workpapers/closing-contract";
import { MODULE_MANIFEST } from "@/lib/workpapers/availability";
import { summarizeWorkpapers } from "@/lib/workpapers/mission-summary";

/**
 * Registre des cycles — projection C02.
 *
 * Dépendance déclarée : la Mission C01 (registre de capacités unique, contexte canonique de
 * dossier) n'est pas livrée sur cette base. Ce module ne la simule pas : il projette, en lecture
 * seule, les manifestes qui existent déjà dans le dépôt et cite leur origine champ par champ :
 *  - procédures outillées et routes : `CL_ENGINE_PROCEDURES` (lib/workpapers/closing-contract) ;
 *  - cycles et libellés : `CL_CYCLES` / `CL_CYCLE_LABELS` (même fichier) ;
 *  - scénarios du laboratoire : identifiants de `demoCycleSchema` (lib/workpapers/demo-cycles) ;
 *  - limites par module : `MODULE_MANIFEST` (lib/workpapers/availability) ;
 *  - constats historiques : silos de `lib/canonical-model/taxonomy`.
 * Les textes de limite reprennent mot pour mot ceux que la Synthèse affichait en paragraphes.
 * C01 doit absorber ce registre ; aucun autre composant ne doit redéclarer ces entrées.
 */

/** Capacité par mode d'usage (vocabulaire C01) : implémentée dans le code, configurée (activation ou infrastructure requise), absente. */
export type CapabilityLevel = "implemented" | "configured" | "absent";
export interface CycleCapability { historique: CapabilityLevel; scenario: CapabilityLevel; persistant: CapabilityLevel }

export interface CycleLink { label: string; href: string }

export interface CycleRegistryEntry {
  id: ClosingCycle;
  label: string;
  /** Étendue réellement couverte par les feuilles livrées. */
  scope: string;
  /** Exclusions et limites explicites, jamais déduites. */
  exclusions: readonly string[];
  /** Sources à fournir pour un travail réel. */
  sources: readonly string[];
  /** Feuille de travail principale et synthèse de procédure, lorsqu'elles existent. */
  sheet: CycleLink | null;
  synthesis: CycleLink | null;
  /** Accès secondaires (procédure parallèle, cockpit, revue indépendante). */
  secondary: readonly CycleLink[];
  procedures: readonly EngineProcedureId[];
  /** Scénarios exécutables dans le laboratoire (`demo.cycle.<id>`). */
  workshop: readonly string[];
  /** Silos des constats historiques rattachés à ce cycle. */
  silos: readonly string[];
  capability: CycleCapability;
}

const proceduresOf = (cycle: ClosingCycle) => CL_ENGINE_PROCEDURES.filter(p => p.cycle === cycle).map(p => p.id);
const manifestLimit = (id: string) => MODULE_MANIFEST.find(m => m.id === `cycle-${id}`)?.limitation ?? null;
const withManifest = (ids: string[], ...own: string[]) => [...own, ...ids.map(manifestLimit).filter((l): l is string => !!l)];

export const CYCLE_REGISTRY: readonly CycleRegistryEntry[] = [
  {
    id: "clients", label: CL_CYCLE_LABELS.clients,
    scope: "Cadrage GL / auxiliaire / balance âgée, encaissements ultérieurs, avoirs et jugement documenté.",
    exclusions: withManifest(["clients"], "Sources distinctes des constats historiques DEMO SA et de l’atelier synthétique."),
    sources: ["Grand livre Clients", "Auxiliaire Clients", "Balance âgée", "Factures ouvertes à clôture", "Encaissements ultérieurs", "Avoirs ultérieurs"],
    sheet: { label: "Cadrage Clients", href: "/clients-framing" },
    synthesis: { label: "Synthèse des procédures — cadrage Clients", href: "/clients-framing/synthesis" },
    secondary: [],
    procedures: proceduresOf("clients"), workshop: ["clients"], silos: ["creances-clients", "rapprochement-clients", "chiffre-affaires", "pca"],
    capability: { historique: "implemented", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "achats", label: CL_CYCLE_LABELS.achats,
    scope: "Cadrage Fournisseurs, achats enregistrés et rattachement, recherche de passifs non enregistrés, cut-off transversal ventes / achats.",
    exclusions: withManifest(["achats", "fournisseurs", "cutoff"]),
    sources: ["Grand livre Fournisseurs", "Balance âgée fournisseurs", "Factures et paiements ultérieurs", "Bons de livraison / réception"],
    sheet: { label: "Feuille Achats et fournisseurs", href: "/payables" },
    synthesis: { label: "Synthèse Achats et fournisseurs", href: "/payables/synthesis" },
    secondary: [{ label: "Cut-off transversal ventes / achats", href: "/cutoff" }],
    procedures: proceduresOf("achats"), workshop: ["achats", "fournisseurs", "cutoff"], silos: ["dettes-fournisseurs", "rapprochement-fournisseurs", "achats-charges-externes", "cca"],
    capability: { historique: "implemented", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "tresorerie", label: CL_CYCLE_LABELS.tresorerie,
    scope: "Pont bancaire et apurement des éléments en transit.",
    exclusions: withManifest(["cash"], "Caisse et VMP non couvertes."),
    sources: ["Relevés bancaires", "Grand livre 512", "Rapprochement précédent"],
    sheet: { label: "Feuille Trésorerie", href: "/tresorerie" },
    synthesis: { label: "Synthèse des procédures — Trésorerie (pont bancaire et apurement)", href: "/tresorerie/synthese" },
    secondary: [],
    procedures: proceduresOf("tresorerie"), workshop: ["cash"], silos: ["rapprochement-tresorerie", "autres-creances-tresorerie", "resultat-financier"],
    capability: { historique: "implemented", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "immobilisations", label: CL_CYCLE_LABELS.immobilisations,
    scope: "Mouvements, cadrage et recalcul documenté des amortissements.",
    exclusions: withManifest(["immobilisations"], "Existence physique et valeur non couvertes."),
    sources: ["Registre des immobilisations", "GL / balance 2x-28x", "Acquisitions, cessions et mises en service", "Durées, résiduels et méthode"],
    sheet: { label: "Feuille Immobilisations", href: "/immobilisations" },
    synthesis: { label: "Synthèse des procédures — Immobilisations (mouvements, cadrage et recalcul documenté)", href: "/immobilisations/synthese" },
    secondary: [],
    procedures: proceduresOf("immobilisations"), workshop: ["immobilisations"], silos: ["immobilisations-incorporelles", "immobilisations-corporelles", "immobilisations-financieres", "rapprochement-immobilisations", "dap"],
    capability: { historique: "implemented", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "stocks", label: CL_CYCLE_LABELS.stocks,
    scope: "Quantités comptées, mouvements intercalaires, passage inventaire → clôture.",
    exclusions: ["Stock propre distingué des stocks de tiers ; aucune présence physique certifiée, aucune dépréciation automatique."],
    sources: ["Feuilles de comptage", "Mouvements intercalaires", "Coûts unitaires et méthode", "GL / balance 3x"],
    sheet: { label: "Feuille Stocks", href: "/stocks" },
    synthesis: null,
    secondary: [],
    procedures: proceduresOf("stocks"), workshop: [], silos: ["stocks", "rapprochement-stocks"],
    capability: { historique: "implemented", scenario: "absent", persistant: "configured" },
  },
  {
    id: "provisions", label: CL_CYCLE_LABELS.provisions,
    scope: "Registre des risques et engagements : ponts, estimation / écriture, événement / annexe.",
    exclusions: ["Événements avec ou sans écriture ; contenu confidentiel masqué par le serveur ; aucune issue juridique déduite."],
    sources: ["Registre des litiges et engagements", "GL 15x", "Annexe", "Pièces d'événement"],
    sheet: { label: "Registre Provisions et engagements", href: "/provisions" },
    synthesis: null,
    secondary: [],
    procedures: proceduresOf("provisions"), workshop: [], silos: ["provisions", "rapprochement-provisions", "engagements-hors-bilan"],
    capability: { historique: "implemented", scenario: "absent", persistant: "configured" },
  },
  {
    id: "capitaux_propres", label: CL_CYCLE_LABELS.capitaux_propres,
    scope: "Feuille décisions et PV versionnés ; procédure parallèle décisions et mouvements.",
    exclusions: withManifest(["capitaux"], "Procédure parallèle à /equity ; aucune conclusion juridique."),
    sources: ["PV d'assemblée et de conseil", "GL classe 10", "Tableau de variation des capitaux propres"],
    sheet: { label: "Feuille Capitaux propres", href: "/capitaux-propres" },
    synthesis: { label: "Synthèse — Capitaux propres, feuille décisions et PV versionnés", href: "/capitaux-propres/synthese" },
    secondary: [{ label: "Capitaux propres · décisions et mouvements (procédure parallèle)", href: "/equity/synthesis" }],
    procedures: proceduresOf("capitaux_propres"), workshop: ["capitaux"], silos: ["capitaux-propres", "rapprochement-capitaux"],
    capability: { historique: "implemented", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "participations", label: CL_CYCLE_LABELS.participations,
    scope: "Droits, distributions et valeur de détention.",
    exclusions: withManifest(["participations"]),
    sources: ["Registre de titres", "Décisions de distribution", "GL 26x / 27x", "Coût, dépréciation et modèle externe versionné"],
    sheet: { label: "Participations · droits, distributions et valeur", href: "/participations" },
    synthesis: null,
    secondary: [],
    procedures: proceduresOf("participations"), workshop: ["participations"], silos: [],
    capability: { historique: "absent", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "fiscal", label: CL_CYCLE_LABELS.fiscal,
    scope: "TVA par période déclarative, IS par exercice.",
    exclusions: withManifest(["is"], "Moteurs fiscaux existants, aucune liquidation ni conformité déclarée."),
    sources: ["Déclarations CA3 / CA12", "GL 445x", "Liasse et retraitements", "Profil fiscal"],
    sheet: { label: "Feuille fiscale", href: "/fiscal" },
    synthesis: { label: "Synthèse fiscale — TVA par période déclarative, IS par exercice", href: "/fiscal/synthese" },
    secondary: [{ label: "Cockpit Fiscalité — contrôles et réconciliations", href: "/dashboard/fiscalite" }],
    procedures: proceduresOf("fiscal"), workshop: ["is"], silos: ["dettes-fiscales-sociales", "rapprochement-fiscal"],
    capability: { historique: "implemented", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "paie", label: CL_CYCLE_LABELS.paie,
    scope: "Journal, déclarations et paiements ; congés en revue indépendante.",
    exclusions: withManifest(["conges"], "Usage réel bloqué, accès RH à valider."),
    sources: ["Journal de paie", "Déclarations sociales", "Paiements", "Soldes de congés par salarié"],
    sheet: { label: "Paie · journal, déclarations et paiements", href: "/paie-personnel" },
    synthesis: null,
    secondary: [{ label: "Congés · revue indépendante", href: "/paie-personnel/conges" }],
    procedures: proceduresOf("paie"), workshop: ["conges"], silos: ["charges-personnel", "rapprochement-paie"],
    capability: { historique: "implemented", scenario: "implemented", persistant: "configured" },
  },
  {
    id: "exceptionnel", label: CL_CYCLE_LABELS.exceptionnel,
    scope: "Revue de classement par événement du résultat exceptionnel.",
    exclusions: ["Classement par événement ; aucun reclassement automatique."],
    sources: ["GL 67x / 77x", "Pièces d'événement"],
    sheet: { label: "Résultat exceptionnel · revue par événement", href: "/resultat-exceptionnel" },
    synthesis: null,
    secondary: [],
    procedures: proceduresOf("exceptionnel"), workshop: [], silos: ["resultat-exceptionnel", "rapprochement-resultat-exceptionnel"],
    capability: { historique: "implemented", scenario: "absent", persistant: "configured" },
  },
  {
    id: "transversal", label: CL_CYCLE_LABELS.transversal,
    scope: "Programme de travail, contrôle interne et clôture : travaux restants, pièces manquantes et contradictions.",
    exclusions: ["Les feuilles de cycle ne forment pas un audit complet ; aucune opinion générée."],
    sources: ["Programme de travail", "Pièces versionnées", "Déclarations de la direction (une pièce parmi d'autres)"],
    sheet: { label: "Dossier professionnel — programme de travail, contrôle interne et clôture", href: "/dossier-cloture" },
    synthesis: null,
    secondary: [{ label: "Cut-off transversal ventes / achats", href: "/cutoff" }],
    procedures: [], workshop: [], silos: ["dettes-financieres", "rapprochement-dettes-financieres"],
    capability: { historique: "implemented", scenario: "absent", persistant: "configured" },
  },
  {
    id: "informatique", label: CL_CYCLE_LABELS.informatique,
    scope: "Contrôles généraux informatiques déclarés dans le dossier de clôture, avec leur propre périmètre.",
    exclusions: ["Aucun travail ni conclusion avant définition du périmètre ITGC : une checklist ne vaut pas couverture."],
    sources: ["Périmètre ITGC (systèmes, processus, période)", "Méthode de test"],
    sheet: null, synthesis: null,
    secondary: [{ label: "Déclarer le périmètre ITGC dans le dossier de clôture", href: "/dossier-cloture" }],
    procedures: [], workshop: [], silos: [],
    capability: { historique: "absent", scenario: "absent", persistant: "configured" },
  },
];

export const CYCLE_REGISTRY_VERSION = "c02-projection-1";

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
  /** Feuilles de laboratoire courantes rattachées (identifiants `wp-<id>` pour la preuve). */
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
    const templates = new Set(entry.workshop.map(w => `demo.cycle.${w}`));
    const runs = summary.rows
      .filter(r => templates.has(templateById.get(r.id) ?? ""))
      .map(r => ({ id: r.id, state: r.state, revision: r.revision, stale: r.stale, exceptions: r.presentation.exceptions, blocked: r.blocked }));
    const findings = findingsOf(historical, entry.silos);
    const openBlocking = historical.filter(f => entry.silos.includes(f.siloId) && f.severity === "bloquant" && f.statutRevue === "en_attente").length;
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
      statusDetail = historicalMode ? "Aucun constat historique : feuille de travail à alimenter" : entry.capability.persistant === "configured" ? "Chaîne durable à activer en recette ; scénario possible dans le laboratoire" : null;
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

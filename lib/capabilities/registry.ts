import { durableChainEnabled } from "@/lib/runtime/profile";
import { LEASE_JURISDICTIONS, LEASE_RULE_REVIEWED } from "@/lib/ifrs/leases/rule";
import { RECONCILIATION_DEFINITIONS, DOCUMENT_DEFINITIONS } from "./reconciliation-definitions";
import { WORKSHOP_DEFINITIONS } from "./workshop-definitions";
import { CAPABILITY_CYCLE_IDS, CAPABILITY_CYCLE_LABELS, ENGINE_PROCEDURES, FRAMEWORK_PROCEDURES, type CapabilityCycleId } from "./procedures";
export * from "./procedures";
/**
 * 1.1.0 (C08): Stocks capacity stated precisely — declared costs, bounded value review, no certified physical inventory.
 * 1.2.0 (C09): Capitaux propres — single journey over the two sheets, other equity funds by declared contractual terms, dated legal markers.
 * 1.3.0 (C12): local payroll and leave procedures, hr persistence family, separate RH access.
 * 1.2.1: Capitaux propres sheet rule 1.1.1 (SCA through the renvoi of C. com. L226-1); a 1.1.0 sheet stays current unless declared SCA.
 * 1.4.0 (C13): Dettes financières — journal cycle and versioned loans sheet /emprunts (loans.review) over the historical reconciliation.
 * 1.4.1 (C14): Provisions mission restitution and export at exact version; the closing file binds one sheet lineage per programme procedure and reads sources through family adapters.
 * 1.5.0 (IFRS C01): framework axis outside the journal cycles — ifrs16.leases (Clients store) stated as a storage and review base without engine nor screen.
 * 1.5.1 (IFRS L16-01, L16-02): closed source dictionary, portfolio qualification and the pure engine; real execution still blocked until the named rule review; no screen.
 * 1.5.2 (IFRS C02): /ifrs/locations page (matrix, inspector, steps, read-only synthetic scenario); local profile link.
 * 1.5.3 (IFRS L16-03): rent framing on the PCG base and proposed closing adjustment (journal, bridge by line item), tax not computed; selection still by the closing journal (L16-05).
 * 1.5.4 (IFRS L16-04): visual workstation on /ifrs/locations — five-step rail, portfolio line and table, debt / right-of-use and principal / interest charts with equivalent tables, bridges, version comparison.
 * 1.5.5 (IFRS L16-05): review summary, cited resolutions and named personal review on the sheet; JSON / CSV / printable HTML exports with manifest (diagnostic or reviewed); selection for a declared base in the closing file (« Travaux IFRS »), never added to misstatements nor C05.
 * 1.5.6 (IFRS, relecture nommée de la règle consignée) : la chaîne locale Locations est annoncée, exécution réelle ouverte pour la juridiction IASB seulement.
 * 1.5.7 (IFRS C03) : les limites disent le pont partiel d'une base PCG et l'absence de présentation IFRS 18 (atelier non engagé).
 * 1.5.8 (IFRS, texte UE lu) : la juridiction EU_adopted dépend de la relecture nommée du texte UE, distincte de celle de l'IASB.
 * 1.5.9 (IFRS, relecture nommée du texte UE consignée) : exécution réelle ouverte aussi pour la juridiction EU_adopted, sur le seul texte relu.
 */
export const CAPABILITY_REGISTRY_VERSION = "1.5.9";
export type CapabilityMode = "historical" | "scenario" | "local_persistent";
export const MODE_LABELS: Record<CapabilityMode, string> = { historical: "Constats historiques", scenario: "Atelier · simulation", local_persistent: "Dossier local · persistance" };
const reconciliationIds: Partial<Record<CapabilityCycleId, string>> = { clients: "clients", achats: "fournisseurs", tresorerie: "tresorerie", immobilisations: "immobilisations", stocks: "stocks", provisions: "provisions", capitaux_propres: "capitaux-propres", dettes_financieres: "dettes-financieres", fiscal: "impots-taxes", paie: "paie", exceptionnel: "resultat-exceptionnel" };
const synthesisRoutes: Partial<Record<CapabilityCycleId, string>> = { clients: "/clients-framing/synthesis", achats: "/payables/synthesis", tresorerie: "/tresorerie/synthese", immobilisations: "/immobilisations/synthese", provisions: "/provisions/synthese", capitaux_propres: "/capitaux-propres/synthese", fiscal: "/fiscal/synthese" };
const workshopCycles: Record<string, CapabilityCycleId> = { cash: "tresorerie", cutoff: "transversal", fournisseurs: "achats", clients: "clients", immobilisations: "immobilisations", capitaux: "capitaux_propres", achats: "achats", conges: "paie", participations: "participations", is: "fiscal" };
export const WORKSHOPS = WORKSHOP_DEFINITIONS.map(([id, label, maturity, limitation]) => ({ id, cycle: workshopCycles[id], label, maturity, limitation, route: "/dashboard/tests#cycle-demo-title" }));
const sources: Record<CapabilityCycleId, string[]> = {
  clients: ["Grand livre Clients", "Auxiliaire Clients", "Balance âgée", "Factures, encaissements et avoirs ou absence documentée"],
  achats: ["Grand livre Fournisseurs", "Auxiliaire et balance âgée", "Factures, prestations et paiements ultérieurs"],
  tresorerie: ["Grand livre bancaire", "Relevés bancaires", "Éléments en transit et apurement"],
  immobilisations: ["Registre des immobilisations", "Grand livre", "Mouvements, mise en service et méthode documentée"],
  stocks: ["Feuilles de comptage transcrites et état théorique à la clôture", "Mouvements intercalaires (quantités)", "Coûts unitaires déclarés par pièce (méthode indiquée)", "Hypothèses de valeur citées, dépréciations comptabilisées et comptes 39"],
  provisions: ["Registre des risques", "Grand livre", "Pièces d’estimation, événements et annexe"],
  capitaux_propres: ["Grand livre", "Décisions et PV", "Mouvements et règlements", "Forme sociale et contrats des instruments proches du capital (pièces citées)"],
  dettes_financieres: ["Contrats et avenants transcrits (taux fixe ou index, marge, dates de révision, convention de jours)", "Échéanciers", "Grand livre des emprunts et balance des comptes de dettes financières",
    "Paiements, confirmations des prêteurs et avis de révision de taux", "Garanties et covenants (définition contractuelle et date)"],
  participations: ["Droits et titres", "Distributions", "Dossier de valeur et méthode approuvée"],
  fiscal: ["Grand livre TVA", "CA3 de la période déclarative", "Résultat fiscal et retraitements documentés", "Règles fiscales applicables validées"],
  paie: ["Journal de paie", "Exports déclaratifs", "Paiements", "Droits à congés, unités et bases comparables"],
  exceptionnel: ["Écritures candidates", "Pièces de l’événement", "Référentiel applicable à l’exercice"],
  transversal: ["Programme de travail", "Risques", "Pièces et travaux manuels documentés"],
  informatique: ["Description du système", "Contrôles généraux informatiques", "Preuves de conception, mise en œuvre et fonctionnement"],
};
const exclusions: Record<CapabilityCycleId, string[]> = {
  clients: ["Aucune perte ou dépréciation déduite de l’âge seul"], achats: ["La sélection ne prouve pas l’exhaustivité des dettes absentes"],
  tresorerie: ["Caisse et VMP hors feuille bancaire"], immobilisations: ["Existence physique et valeur non certifiées"],
  stocks: ["Comptage transcrit : présence physique et exhaustivité de l’inventaire non certifiées", "Stocks de tiers et consignations présentés à part", "Coûts CUMP / PEPS déclarés, non reconstitués depuis les transactions",
    "Aucune dépréciation ni provision automatique (complément au-delà de la valeur comptable : à qualifier)"],
  provisions: ["Aucune issue juridique déduite", "Pièces confidentielles selon droits serveur"],
  capitaux_propres: ["Deux feuilles d’origine lues dans un parcours unique, sans double compte ni migration", "Aucune conclusion juridique : repères légaux datés, sans alerte de dissolution", "Autres fonds propres classés par termes contractuels déclarés, jamais par numéro de compte"], participations: ["DCF complet et classement automatique absents"],
  dettes_financieres: ["Emprunts simples en euros : obligataires, convertibles, participatifs, devises, frais capitalisés, planchers / plafonds d’index et dérivés exclus et nommés",
    "Aucun taux ni convention par défaut ; aucun ratio de covenant calculé ni conformité de financement déduite", "Instruments proches des fonds propres classés par termes contractuels déclarés (moteur Capitaux propres)", "Ni DCF ni LBO"],
  fiscal: ["Aucune liquidation ou conformité déclarée", "TVA mensuelle distincte de l’exercice IS"],
  paie: ["Paie complète et lecture native DSN absentes", "Profil personnel local et habilitation RH dédiée requis"], exceptionnel: ["Qualification humaine par événement"],
  transversal: ["Aucune opinion générée", "Cut-off : fait générateur documenté requis"], informatique: ["Pas de moteur ITGC", "Travaux manuels possibles dans le programme de clôture"],
};
/** Local scope stated per cycle when the generic wording would overstate or blur what the sheet establishes. */
const localScopes: Partial<Record<CapabilityCycleId, string>> = {
  transversal: "Programme de clôture et synthèse des travaux : une feuille rattachée par procédure (racine, version, empreinte, périmètre), autres feuilles listées, mêmes dénominateurs dans la carte, le bandeau et l’export ; relecture personnelle nommée et dossier personnel terminé distincts de la validation professionnelle.",
  provisions: "Registre versionné : ponts, estimation / écriture, événement / annexe ; synthèse de mission et export à version exacte, contenu confidentiel masqué par le serveur ; activation locale et accès autorisé requis.",
  dettes_financieres: "Feuille versionnée /emprunts : contrats et échéances de l’exercice, pont de principal, intérêts et intérêts courus sur paramètres contractuels sourcés, cadrage sur la balance, présentation selon le texte applicable ; activation locale et accès autorisé requis.",
  paie: "Paie et congés séparés, CSV qualifiés et versions conservés sur le PC ; comparaison sur les mêmes droits, sans estimation automatique des droits restants ni DSN native.",
  capitaux_propres: "Parcours unique /capitaux-propres/parcours : feuille décisions et PV versionnés (règle 1.1.1, travaux nouveaux ; une feuille 1.1.0 reste à jour sauf déclarée en SCA) et dossier /equity (règle 1.0.0, historique) lus à leur version exacte ; activation locale et accès autorisé requis.",
  stocks: "Feuille versionnée : quantités comptées transcrites et passage à la clôture, coûts déclarés (non reconstitués), revue de valeur bornée à la valeur comptable avec estimation partielle si la quantité n’est pas rapprochée ; activation locale et accès autorisé requis. Aucun inventaire physique certifié.",
};
const journalCycles = CAPABILITY_CYCLE_IDS.map(id => {
  const reconciliation = RECONCILIATION_DEFINITIONS.find(c => c.id === reconciliationIds[id]);
  const procedures = ENGINE_PROCEDURES.filter(p => p.cycle === id);
  const workshops = WORKSHOPS.filter(w => w.cycle === id);
  return { id, label: CAPABILITY_CYCLE_LABELS[id], procedures, reconciliation, synthesisRoute: synthesisRoutes[id], requiredSources: sources[id], exclusions: exclusions[id],
    routes: [...new Set([...procedures.map(p => p.route), ...(id === "paie" ? ["/paie-personnel", "/paie-personnel/conges"] : []), ...(id === "transversal" ? ["/dossier-cloture", "/cutoff"] : id === "informatique" ? ["/dossier-cloture"] : [])])],
    modes: {
      historical: { implemented: !!reconciliation, scope: "Rapprochement générique / constats historiques ; pas une feuille de mission exécutée", route: "/dashboard/cloisons" },
      scenario: { implemented: workshops.length > 0, scope: workshops.length ? workshops.map(w => w.maturity).join(" ; ") : "Absent de l’atelier pédagogique", route: "/dashboard/tests#cycle-demo-title" },
      local_persistent: { implemented: procedures.length > 0 || id === "transversal", scope: localScopes[id] ?? (procedures.length ? "Feuilles versionnées existantes ; activation locale et accès autorisé requis" : id === "transversal" || id === "informatique" ? "Programme manuel de clôture ; aucun moteur ITGC" : "Pas de store durable pour cette feuille") },
    }, workshops };
});
/** One entry per journal cycle (C13: Dettes financières has its sheet /emprunts and keeps its historical reconciliation). */
export const CAPABILITY_REGISTRY = journalCycles;
/**
 * Framework axis (IFRS C01, C00 D04), kept apart from the journal cycles: no cycle row counts an IFRS restatement, and no IFRS sheet enters a cycle section.
 * The route is announced only once its page exists (C02); until then nothing is presented as executed.
 */
export const CAPABILITY_FRAMEWORKS = FRAMEWORK_PROCEDURES.map(p => ({ ...p,
  requiredSources: ["Contrats et versions transcrits (lease_contracts)", "Hypothèses de taux, durée, exemptions et réponses de périmètre citées (lease_assumptions)", "Échéances et règlements (lease_schedule)",
    "Grand livre 612 / 613 / 614 et pièces pour un retraitement déterminé (lease_ledger)", "Ouverture historique validée pour une reprise (lease_opening)"],
  exclusions: ["Preneur seulement, euros, loyers fixes mensuels à terme échu, 1 à 120 mois (docs/ifrs/SCOPE_V1.md)", "Ni IFRS complet, ni annexe exhaustive, ni effet fiscal ; aucune méthode de transition choisie par l'outil",
    "Une base PCG plus ce seul retraitement reste un pont partiel : les autres retraitements d'une base IFRS restent indéterminés", "Aucune présentation IFRS 18 : atelier non engagé (classement, sous-totaux, MPM et comparatifs de transition absents)",
    LEASE_JURISDICTIONS.length > 1 ? "Juridiction EU_adopted ouverte en réel pour le seul texte relu, règlement (UE) 2023/1803 dans sa version d'origine (X33 levé par la relecture nommée du texte UE)"
      : "Juridiction EU_adopted non activable en réel tant que le texte de l'Union européenne n'a pas sa relecture personnelle nommée (X33)",
    !LEASE_RULE_REVIEWED ? "Règle à revoir : aucune exécution réelle tant que la fiche de règle n'est pas validée"
      : LEASE_JURISDICTIONS.length > 1 ? "Règle relue pour les juridictions IASB et EU_adopted (relectures personnelles nommées consignées)" : "Règle relue pour la seule juridiction IASB (relecture personnelle nommée consignée) ; aucune autre juridiction n'est exécutable en réel"],
  modes: {
    historical: { implemented: false, scope: "Absent des constats historiques" },
    scenario: { implemented: true, scope: "Scénario synthétique en lecture seule (/ifrs/locations?demo=1) : « simulation non revue », calculé par le même moteur, jamais enregistré" },
    local_persistent: { implemented: LEASE_RULE_REVIEWED, scope: "Locations IFRS 16, preneur, périmètre V1 ; retraitement de clôture proposé, sans annexe exhaustive ni effet fiscal. Sources au dictionnaire fermé, qualification du portefeuille et moteur de calcul ; " + (LEASE_RULE_REVIEWED ? "exécution réelle ouverte pour la juridiction IASB depuis la relecture personnelle nommée de la fiche de règle" + (LEASE_JURISDICTIONS.length > 1 ? ", et pour la juridiction EU_adopted (règlement (UE) 2023/1803, version d'origine) depuis la relecture nommée de ce texte" : "") : "exécution réelle bloquée tant que la fiche de règle n'a pas reçu sa relecture personnelle nommée") + " ; page /ifrs/locations (matrice de complétude, table du portefeuille, graphiques dette et droit d'utilisation avec leurs tableaux, ponts, comparaison de deux versions exécutées, inspecteur, scénario synthétique en lecture seule) ; cadrage des loyers sur la base PCG et retraitement de clôture proposé (écritures, pont par poste), impôt non calculé ; synthèse de revue, résolution citée des points et relecture personnelle nommée ; exports JSON, CSV et HTML imprimable avec manifeste, diagnostic ou revu ; sélection pour une base déclarée au dossier de clôture (section « Travaux IFRS »), jamais ajoutée aux anomalies ; la sélection ne prouve pas la comptabilisation." },
  },
  pageAvailable: true }));
export function reconciliationCycles() {
  return CAPABILITY_REGISTRY.flatMap(c => c.reconciliation ? [c.reconciliation] : []).sort((a, b) => RECONCILIATION_DEFINITIONS.indexOf(a) - RECONCILIATION_DEFINITIONS.indexOf(b));
}
export function reconciliationDocuments() { const cycles = reconciliationCycles(); return DOCUMENT_DEFINITIONS.filter(d => cycles.some(c => c.id === d.cycleId)); }
export function capabilitiesForRoute(path: string) { return CAPABILITY_REGISTRY.filter(c => c.routes.some(r => path === r || path.startsWith(r + "/"))); }
export const PROCEDURE_ACTIVATION: Record<string, string> = {
  "payroll.review": "PROBANT_PAYROLL_DURABLE", "payroll.leave": "PROBANT_PAYROLL_DURABLE",
  "clients.frame": "PROBANT_CLIENTS_DURABLE", "clients.sales": "PROBANT_CLIENTS_DURABLE",
  "payables.frame": "PROBANT_PAYABLES_DURABLE", "payables.purchases": "PROBANT_PAYABLES_DURABLE", "payables.rpne": "PROBANT_PAYABLES_DURABLE",
  "cash.reconciliation": "PROBANT_CASH_DURABLE", "fixed_assets.review": "PROBANT_FIXED_ASSETS_DURABLE", "stocks.count": "PROBANT_STOCKS_DURABLE",
  "provisions.register": "PROBANT_PROVISIONS_DURABLE", "capitaux_propres.review": "PROBANT_CAPITAUX_DURABLE", "equity.review": "PROBANT_EQUITY_DURABLE",
  "investments.review": "PROBANT_INVESTMENT_DURABLE", "loans.review": "PROBANT_LOANS_DURABLE", "tva.reconciliation": "PROBANT_FISCAL_DURABLE", "is.computation": "PROBANT_FISCAL_DURABLE", "exceptional.review": "PROBANT_EXCEPTIONAL_DURABLE",
  "ifrs16.leases": "PROBANT_IFRS16_DURABLE",
};
/** Configuration is never evidence of execution, authorization or successful connectivity. */
export function configuredProcedures(env: Record<string, string | undefined>) {
  return Object.fromEntries([...ENGINE_PROCEDURES, ...FRAMEWORK_PROCEDURES].map(p => [p.id, { activated: durableChainEnabled(env, PROCEDURE_ACTIVATION[p.id]), databaseConfigured: !!env.DATABASE_URL?.trim() }]));
}
/** Workflow navigation is separate from cycle capability; these routes consume the same dossier context. */
export const WORKFLOW_ROUTES = [
  { href: "/dashboard/depot", label: "Dépôt & ingestion", icon: "upload" },
  { href: "/dashboard/synthese", label: "Synthèse", icon: "dashboard" },
  { href: "/dashboard/risques", label: "Cartographie des risques", icon: "risks" },
  { href: "/dashboard/cloisons", label: "Revue par cloison", icon: "columns" },
  { href: "/dashboard/fiscalite", label: "Fiscalité", icon: "landmark", description: "Démo globale · cas synthétiques · données locales à importer" },
  { href: "/dashboard/dossier", label: "Dossier & preuve", icon: "file" },
  { href: "/dashboard/tests", label: "Tests complémentaires", icon: "tests" },
  { href: "/dashboard/referentiel", label: "Seuils & référentiel", icon: "scale" },
] as const;

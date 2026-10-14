import { durableChainEnabled } from "@/lib/runtime/profile";
import { RECONCILIATION_DEFINITIONS, DOCUMENT_DEFINITIONS } from "./reconciliation-definitions";
import { WORKSHOP_DEFINITIONS } from "./workshop-definitions";
import { CAPABILITY_CYCLE_IDS, CAPABILITY_CYCLE_LABELS, ENGINE_PROCEDURES, type CapabilityCycleId } from "./procedures";
export * from "./procedures";
/**
 * 1.1.0 (C08): Stocks capacity stated precisely — declared costs, bounded value review, no certified physical inventory.
 * 1.2.0 (C09): Capitaux propres — single journey over the two sheets, other equity funds by declared contractual terms, dated legal markers.
 */
export const CAPABILITY_REGISTRY_VERSION = "1.2.0";
export type CapabilityMode = "historical" | "scenario" | "local_persistent";
export const MODE_LABELS: Record<CapabilityMode, string> = { historical: "Constats historiques", scenario: "Atelier · simulation", local_persistent: "Dossier local · persistance" };
const reconciliationIds: Partial<Record<CapabilityCycleId, string>> = { clients: "clients", achats: "fournisseurs", tresorerie: "tresorerie", immobilisations: "immobilisations", stocks: "stocks", provisions: "provisions", capitaux_propres: "capitaux-propres", fiscal: "impots-taxes", paie: "paie", exceptionnel: "resultat-exceptionnel" };
const synthesisRoutes: Partial<Record<CapabilityCycleId, string>> = { clients: "/clients-framing/synthesis", achats: "/payables/synthesis", tresorerie: "/tresorerie/synthese", immobilisations: "/immobilisations/synthese", capitaux_propres: "/capitaux-propres/synthese", fiscal: "/fiscal/synthese" };
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
  fiscal: ["Aucune liquidation ou conformité déclarée", "TVA mensuelle distincte de l’exercice IS"],
  paie: ["Paie complète et lecture native DSN absentes", "Accès RH réel bloqué"], exceptionnel: ["Qualification humaine par événement"],
  transversal: ["Aucune opinion générée", "Cut-off : fait générateur documenté requis"], informatique: ["Pas de moteur ITGC", "Travaux manuels possibles dans le programme de clôture"],
};
/** Local scope stated per cycle when the generic wording would overstate or blur what the sheet establishes. */
const localScopes: Partial<Record<CapabilityCycleId, string>> = {
  capitaux_propres: "Parcours unique /capitaux-propres/parcours : feuille décisions et PV versionnés (règle 1.1.0, travaux nouveaux) et dossier /equity (règle 1.0.0, historique) lus à leur version exacte ; activation locale et accès autorisé requis.",
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
/** Historical financial debts have a generic reconciliation, but no durable cycle engine. No new journal enum is introduced. */
export const CAPABILITY_REGISTRY = [...journalCycles, {
  id: "dettes_financieres", label: "Dettes financières", procedures: [], routes: [], synthesisRoute: undefined, workshops: [],
  reconciliation: RECONCILIATION_DEFINITIONS.find(c => c.id === "dettes-financieres"),
  requiredSources: ["Échéancier des emprunts", "Grand livre 16", "Contrats et confirmations"], exclusions: ["Pas de feuille persistante dédiée", "Le rapprochement ne qualifie pas les contrats"],
  modes: { historical: { implemented: true, scope: "Échéancier / grand livre dans le rapprochement générique", route: "/dashboard/cloisons" },
    scenario: { implemented: false, scope: "Absent de l’atelier pédagogique", route: "/dashboard/tests#cycle-demo-title" },
    local_persistent: { implemented: false, scope: "Pas de moteur durable dédié ; fournir contrats et échéanciers pour une procédure manuelle" } },
}];
export function reconciliationCycles() {
  return CAPABILITY_REGISTRY.flatMap(c => c.reconciliation ? [c.reconciliation] : []).sort((a, b) => RECONCILIATION_DEFINITIONS.indexOf(a) - RECONCILIATION_DEFINITIONS.indexOf(b));
}
export function reconciliationDocuments() { const cycles = reconciliationCycles(); return DOCUMENT_DEFINITIONS.filter(d => cycles.some(c => c.id === d.cycleId)); }
export function capabilitiesForRoute(path: string) { return CAPABILITY_REGISTRY.filter(c => c.routes.some(r => path === r || path.startsWith(r + "/"))); }
export const PROCEDURE_ACTIVATION: Record<string, string> = {
  "clients.frame": "PROBANT_CLIENTS_DURABLE", "clients.sales": "PROBANT_CLIENTS_DURABLE",
  "payables.frame": "PROBANT_PAYABLES_DURABLE", "payables.purchases": "PROBANT_PAYABLES_DURABLE", "payables.rpne": "PROBANT_PAYABLES_DURABLE",
  "cash.reconciliation": "PROBANT_CASH_DURABLE", "fixed_assets.review": "PROBANT_FIXED_ASSETS_DURABLE", "stocks.count": "PROBANT_STOCKS_DURABLE",
  "provisions.register": "PROBANT_PROVISIONS_DURABLE", "capitaux_propres.review": "PROBANT_CAPITAUX_DURABLE", "equity.review": "PROBANT_EQUITY_DURABLE",
  "investments.review": "PROBANT_INVESTMENT_DURABLE", "tva.reconciliation": "PROBANT_FISCAL_DURABLE", "is.computation": "PROBANT_FISCAL_DURABLE", "exceptional.review": "PROBANT_EXCEPTIONAL_DURABLE",
};
/** Configuration is never evidence of execution, authorization or successful connectivity. */
export function configuredProcedures(env: Record<string, string | undefined>) {
  return Object.fromEntries(ENGINE_PROCEDURES.map(p => [p.id, { activated: durableChainEnabled(env, PROCEDURE_ACTIVATION[p.id]), databaseConfigured: !!env.DATABASE_URL?.trim() }]));
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

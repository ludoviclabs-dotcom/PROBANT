export const CAPABILITY_CYCLE_IDS = ["clients", "achats", "tresorerie", "immobilisations", "stocks", "provisions", "capitaux_propres", "participations", "fiscal", "paie", "exceptionnel", "transversal", "informatique"] as const;
export type CapabilityCycleId = typeof CAPABILITY_CYCLE_IDS[number];
export const CAPABILITY_CYCLE_LABELS: Record<CapabilityCycleId, string> = {
  clients: "Clients et ventes", achats: "Achats et fournisseurs", tresorerie: "Trésorerie", immobilisations: "Immobilisations", stocks: "Stocks", provisions: "Provisions et engagements",
  capitaux_propres: "Capitaux propres", participations: "Participations", fiscal: "TVA et IS", paie: "Paie et personnel", exceptionnel: "Résultat exceptionnel", transversal: "Transversal et clôture", informatique: "Systèmes d’information",
};

/** Tooled procedures: the existing cycle sheets. The file only observes them (state, version, review); it never recalculates a cycle. */
export const STORE_FAMILIES = ["clients", "cash", "fa", "eq", "fx", "st", "pv"] as const;
export type StoreFamily = typeof STORE_FAMILIES[number];
export const ENGINE_PROCEDURES = [
  { id: "clients.frame", cycle: "clients", family: "clients", label: "Cadrage Clients", route: "/clients-framing" },
  { id: "clients.sales", cycle: "clients", family: "clients", label: "Ventes, encaissements et avoirs", route: "/clients-framing" },
  { id: "payables.frame", cycle: "achats", family: "clients", label: "Cadrage Fournisseurs", route: "/payables" },
  { id: "payables.purchases", cycle: "achats", family: "clients", label: "Achats et rattachement", route: "/payables" },
  { id: "payables.rpne", cycle: "achats", family: "clients", label: "Recherche de passifs non enregistrés", route: "/payables" },
  { id: "cash.reconciliation", cycle: "tresorerie", family: "cash", label: "Pont bancaire et apurement", route: "/tresorerie" },
  { id: "fixed_assets.review", cycle: "immobilisations", family: "fa", label: "Mouvements et recalcul documenté", route: "/immobilisations" },
  { id: "stocks.count", cycle: "stocks", family: "st", label: "Quantités, coûts et revue de valeur", route: "/stocks" },
  { id: "provisions.register", cycle: "provisions", family: "pv", label: "Registre des risques et engagements", route: "/provisions" },
  { id: "capitaux_propres.review", cycle: "capitaux_propres", family: "eq", label: "Décisions et PV versionnés (parcours cible)", route: "/capitaux-propres" },
  { id: "equity.review", cycle: "capitaux_propres", family: "clients", label: "Décisions et mouvements (parcours historique)", route: "/equity" },
  { id: "investments.review", cycle: "participations", family: "clients", label: "Droits, distributions et valeur", route: "/participations" },
  { id: "tva.reconciliation", cycle: "fiscal", family: "fx", label: "TVA par période déclarative", route: "/fiscal" },
  { id: "is.computation", cycle: "fiscal", family: "fx", label: "IS par exercice", route: "/fiscal" },
  { id: "exceptional.review", cycle: "exceptionnel", family: "clients", label: "Revue par événement", route: "/resultat-exceptionnel" },
] as const satisfies readonly { id: string; cycle: CapabilityCycleId; family: StoreFamily; label: string; route: string }[];
export type CapabilityProcedureId = typeof ENGINE_PROCEDURES[number]["id"];
export const CAPABILITY_PROCEDURE_IDS = ENGINE_PROCEDURES.map(p => p.id) as unknown as readonly [CapabilityProcedureId, ...CapabilityProcedureId[]];
export const engineProcedure = (id: string) => ENGINE_PROCEDURES.find(p => p.id === id) ?? null;


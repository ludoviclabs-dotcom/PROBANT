import type { RuleReference } from "@/lib/workpapers/model";
import { leaseRuleBasisSchema, type LeaseRuleBasis } from "@/lib/ifrs/shared/rule-basis";

/**
 * Règle du socle C01 de l'atelier « Locations IFRS 16 ». Aucun moteur n'existe encore : la version 0.1.0 porte la feuille,
 * ses sources et sa revue, et son exécution renvoie une incapacité explicite (`L16_ENGINE_NOT_AVAILABLE`).
 * La version 1.0.0 arrive avec le moteur (L16-02) : une feuille 0.1.0 devient alors « règle remplacée » et se révise sur le gabarit courant.
 * `authority: "internal"` comme toutes les feuilles (C00, D03) : c'est l'implémentation par PROBANT d'un contrat écrit, pas le texte de la norme.
 */
export const LEASE_RULE_VERSION = "0.1.0";
export const IFRS16_RULE: RuleReference = { id: "ifrs16.leases", version: LEASE_RULE_VERSION, authority: "internal", source: "docs/ifrs/CONTRAT_COMMUN.md", effectiveFrom: "2019-01-01", validation: "provisional" };

/** Fiche de la règle du socle : à revoir (C00, `SOURCES.md` § 4). Les paragraphes cités sont ceux effectivement lus par extraction en C00. */
export const LEASE_RULE_BASIS: LeaseRuleBasis = leaseRuleBasisSchema.parse({
  ruleId: "ifrs16.leases", ruleVersion: LEASE_RULE_VERSION, engineVersion: "none",
  jurisdiction: "IASB", standardEdition: "IFRS 16, édition IASB 2026 « issued »",
  paragraphs: ["§ 5-8", "§ 26-27", "§ 29-33", "§ 36-38", "annexe A", "B34-B41", "C1"],
  sourceIds: ["ifrs-16"],
  consultedAt: "2026-10-29", effectiveDate: "2019-01-01", entityProfile: "Preneur, euros, loyers fixes mensuels à terme échu, 1 à 120 mois (docs/ifrs/SCOPE_V1.md)",
  assumptions: ["Texte IASB lu par extraction outillée, pas mot à mot ; B9-B33 non lus", "Texte de l'Union européenne (règlement 2023/1803) non lu",
    "Décisions IFRIC 09/2019 et 11/2019 lues en C00, à verser dans la base de connaissance en L16-02"],
  internalPolicies: ["Virgule fixe à 40 décimales ; publication par soldes arrondis au centime, moitié à l'opposé de zéro", "Taux mensuel (1 + r)^(1/12) − 1 ; r / 12 interdit pour un taux effectif"],
  status: "review_required", referenceCases: [], exclusions: ["X33"],
});

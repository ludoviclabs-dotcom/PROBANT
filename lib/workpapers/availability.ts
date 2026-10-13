import { CAPABILITY_REGISTRY, WORKSHOPS } from "@/lib/capabilities/registry";
export type Availability = "disponible" | "démonstration" | "source requise" | "désactivé" | "non implémenté";
export const AVAILABILITY_LABELS: Availability[] = ["disponible", "démonstration", "source requise", "désactivé", "non implémenté"];
export const MODULE_MANIFEST_VERSION = "3.0.0";
/** Workshop-only compatibility view. Persistent capabilities are described independently in the same registry. */
export const MODULE_MANIFEST: { id: string; label: string; status: Availability; maturity: string; mode: "synthetic" | "none"; limitation: string; production: false }[] = [
  { id: "documentation", label: "Documentation pédagogique locale", status: "disponible", maturity: "Référence non normative", mode: "none", limitation: "Guide référencé ; fichier source non vérifié", production: false },
  ...WORKSHOPS.map(w => ({ id: `cycle-${w.id}`, label: w.label, status: "démonstration" as const, maturity: w.maturity, mode: "synthetic" as const, limitation: w.limitation, production: false as const })),
  ...CAPABILITY_REGISTRY.filter(c => !c.modes.scenario.implemented).map(c => ({ id: `outside-${c.id}`, label: c.label + " · atelier", status: "non implémenté" as const, maturity: "Absent de cet atelier", mode: "none" as const, limitation: c.modes.local_persistent.scope + " ; " + c.exclusions.join(" ; "), production: false as const })),
  { id: "methods", label: "Méthodes et sources de mission", status: "source requise", maturity: "À documenter", mode: "none", limitation: "Dates, périmètre, méthodes et pièces propres au dossier requis", production: false },
];
export const GUIDE_REFERENCE = { document: "Guide de formation Audit.pdf", version: "V1.1", pages: 138, date: "2026-09-21", pack: "PROBANT v1.1 — 2026-09-22", sha256: "3948f9e633d05fbb5a44ddc039a3d8fa9409b2de9071d0bc99e137ebaeba5e1f", authority: "pédagogique, non normative" };
export const CYCLE_LEARNING: Record<string, { pages: string; objective: string; risk: string; notProven: string }> = {
  cash: { pages: "non disponibles", objective: "Reconstituer le pont bancaire et isoler les éléments en transit", risk: "Écart de rapprochement ou source bancaire non probante", notProven: "Accord arithmétique ≠ authenticité du relevé" },
  cutoff: { pages: "non disponibles", objective: "Comparer fait générateur et comptabilisation à la clôture", risk: "Produit ou charge rattaché à une mauvaise période", notProven: "Date de facture seule insuffisante" },
  fournisseurs: { pages: "non disponibles", objective: "Relier paiements ultérieurs et passifs éventuels", risk: "Charge ou dette non enregistrée", notProven: "Paiements testés ≠ exhaustivité des dettes" },
  clients: { pages: "65–69", objective: "Distinguer solde à clôture, encaissements et appréciation documentée", risk: "Réalité, valorisation et période des créances", notProven: "L’âge ne prouve pas une dépréciation ; aucun délai automatique 45/60 jours" },
  immobilisations: { pages: "85–88", objective: "Expliquer les trois tableaux et la VNC", risk: "Mouvements ou valorisation non justifiés", notProven: "Ni seuil universel de 500 €, ni durée inventée, ni correction de l’ambiguïté 30 000/20 000" },
  capitaux: { pages: "61–64", objective: "Rapprocher mouvements, PV et événements sans écriture", risk: "Affectation non documentée", notProven: "Un ratio ne démontre aucune conformité juridique" },
  achats: { pages: "76–79", objective: "Relier sélection, écriture, facture et fait générateur", risk: "Montants ou périodes non comparables", notProven: "Une sélection GL ne prouve pas l’exhaustivité des charges absentes" },
  conges: { pages: "89–94", objective: "Comparer uniquement les mêmes droits, unités et périodes", risk: "Comparaison de bases ou reliquats différents", notProven: "Aucune assertion locale attribuée par le guide ; ni paie complète ni taux social par défaut" },
  participations: { pages: "95–99", objective: "Documenter distribution votée, droits et dossier de valeur", risk: "Droits non homogènes ou valeur de nature différente", notProven: "Pas de classement automatique à 10 %, ni choix de DCF favorable" },
  is: { pages: "100–106", objective: "Cadrer le résultat et documenter les retraitements", risk: "Retraitement sans règle ou double prise en compte de l’IS", notProven: "Pont descriptif et planification ne calculent pas l’impôt dû" },
};

export type Availability = "disponible" | "démonstration" | "source requise" | "désactivé" | "non implémenté";
export const AVAILABILITY_LABELS: Availability[] = ["disponible", "démonstration", "source requise", "désactivé", "non implémenté"];
export const MODULE_MANIFEST_VERSION = "2.0.0";
export const MODULE_MANIFEST: { id: string; label: string; status: Availability; maturity: string; mode: "synthetic" | "none"; limitation: string; production: false }[] = [
  { id: "documentation", label: "Documentation pédagogique locale", status: "disponible", maturity: "Référence non normative", mode: "none", limitation: "Guide V1.1 référencé dans le code ; fichier source non vérifié pendant ce lot", production: false },
  ...([
    ["cash", "Cash", "Pont bancaire technique", "Identité bancaire et apurement nécessitent des sources de mission"],
    ["cutoff", "Cut-off", "Analyse de fait générateur", "Date de facture seule insuffisante ; jugement humain sur le fait générateur"],
    ["fournisseurs", "Fournisseurs/RPNE", "Recherche de passifs non enregistrés", "Paiements ultérieurs non exhaustifs ; population et allocations à documenter"],
    ["clients", "Clients", "Cadrage et encaissements", "L’ancienneté seule ne prouve pas une dépréciation"],
    ["immobilisations", "Immobilisations", "Mouvements et recalcul", "Durées, valeur résiduelle et mises en service exigent une méthode validée"],
    ["capitaux", "Capitaux propres", "Mouvements et décisions", "PV et événements sans écriture requièrent une lecture humaine"],
    ["achats", "Achats", "Sélection et rapprochement", "Une sélection d’écritures ne prouve pas l’exhaustivité des charges absentes"],
    ["conges", "Congés payés", "Comparaison de droits", "Unités, périodes et bases de charges doivent être comparables"],
    ["participations", "Participations", "Droits et valeur", "Classement et modèle de valeur exigent des sources approuvées"],
    ["is", "IS", "Pont et gates fiscaux", "Millésime 2024 non couvert par le moteur : impôt dû bloqué ; sources 2026 à revoir"],
  ] as const).map(([id, label, maturity, limitation]) => ({ id: `cycle-${id}`, label, status: "démonstration" as const, maturity, mode: "synthetic" as const, limitation, production: false as const })),
  { id: "methods", label: "Méthodes applicables et PBC", status: "source requise", maturity: "À obtenir", mode: "none", limitation: "Validation métier, périmètre, dates et pièces de la mission à obtenir", production: false },
  { id: "real", label: "Nouveaux parcours réels des feuilles de travail", status: "désactivé", maturity: "Non livré", mode: "none", limitation: "Adaptateur durable et autorisation OIDC non raccordés à cet atelier", production: false },
  { id: "outside", label: "Stocks, ITGC, paie complète, DCF complet", status: "non implémenté", maturity: "Hors périmètre", mode: "none", limitation: "Les fiches historiques ne prouvent pas une implémentation", production: false },
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

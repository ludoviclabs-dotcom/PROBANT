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
/**
 * Éditions connues du guide pédagogique (C04, relevées le 13/10/2026). Les références de pages de `CYCLE_LEARNING`
 * sont rattachées à l'édition `V1.1` déclarée, dont le fichier complet n'est pas disponible localement : elles
 * restent non vérifiées. Le fichier V1.0 disponible n'a pas la même pagination (ex. p. 65 = cycle Fournisseurs).
 */
export type GuideEditionStatus = "declared_file_missing" | "local_full" | "local_partial_extract" | "reported_not_found";
export interface GuideEdition { id: string; version: "V1.0" | "V1.1"; pages: number | null; sha256: string | null; generatedOn: string | null; status: GuideEditionStatus; note: string }
export const GUIDE_EDITIONS: readonly GuideEdition[] = [
  { id: "v1.1-138", version: "V1.1", pages: 138, sha256: "3948f9e633d05fbb5a44ddc039a3d8fa9409b2de9071d0bc99e137ebaeba5e1f", generatedOn: "2026-09-21", status: "declared_file_missing", note: "Édition de référence déclarée par le pack PROBANT v1.1 ; fichier complet absent du poste : pagination non vérifiable." },
  { id: "v1.1-extrait-partie-iii", version: "V1.1", pages: 49, sha256: "fcaab0f3b0d6ec37e645d0738d46699f75061f7585b7fc571b39b0210da2652b", generatedOn: "2026-09-21", status: "local_partial_extract", note: "Extrait local (Partie III, chapitres 10 à 18) au pied de page « V1.1 — 2026 » ; sans numéros de page d'origine, il ne permet pas de vérifier les pages citées." },
  { id: "v1.1-extrait-chapitres-9-18", version: "V1.1", pages: 51, sha256: "3da5d65c3054abda672ec1ee272d29cfe8f98c1e83f6eccd97471ed5874496c1", generatedOn: "2026-09-21", status: "local_partial_extract", note: "Second extrait local V1.1 (chapitres 9 à 18), même limite." },
  { id: "v1.0-117", version: "V1.0", pages: 117, sha256: "1c792980f4bd981469bdaa9e61e9475f9611a43fbd05bcefa7eae78a80323f08", generatedOn: "2026-09-15", status: "local_full", note: "Fichier complet V1.0 « généré le 15 septembre 2026 » ; pagination différente de la V1.1 (p. 65 = Fournisseurs, p. 76 = Immobilisations) : ses pages ne sont pas substituées à celles citées." },
  { id: "v1.0-120", version: "V1.0", pages: 120, sha256: null, generatedOn: null, status: "reported_not_found", note: "Fichier joint au diagnostic du 12/10/2026 (120 pages, pied de page V1.0) ; introuvable sur le poste, empreinte non établie." },
];
export const GUIDE_REFERENCE = { document: "Guide de formation Audit.pdf", version: "V1.1", pages: 138, date: "2026-09-21", pack: "PROBANT v1.1 — 2026-09-22", sha256: "3948f9e633d05fbb5a44ddc039a3d8fa9409b2de9071d0bc99e137ebaeba5e1f", authority: "pédagogique, non normative", editionId: "v1.1-138", pagesVerified: false as const, editions: GUIDE_EDITIONS };
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

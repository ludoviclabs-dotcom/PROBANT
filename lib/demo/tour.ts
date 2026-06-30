/**
 * Script de la « Visite guidée » (mode démo auto-joué).
 *
 * Chaque étape pointe vers une route réelle et, optionnellement, vers un
 * élément du DOM marqué `data-tour="<target>"` que le moteur met en lumière
 * (spotlight). Sans `target`, la carte est centrée (intro / conclusion).
 *
 * La narration s'adresse à un NON-EXPERT : une phrase par idée, le « pourquoi »
 * avant le « comment ». Aucune citation normative n'est inventée ici — les bases
 * légales réelles restent affichées par l'application elle-même.
 */

export type TourPlacement = "center" | "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** Identifiant stable de l'étape. */
  id: string;
  /** Route sur laquelle l'étape se joue. */
  route: string;
  /** Clé `data-tour` de l'élément à mettre en lumière. Absent → carte centrée. */
  target?: string;
  /** Pastille de section (au-dessus du titre). */
  kicker: string;
  /** Titre court de la carte. */
  title: string;
  /** Narration (1–2 phrases, vocabulaire accessible). */
  body: string;
  /** Micro-définition « en clair » d'un terme métier, optionnelle. */
  enClair?: string;
  /** Durée d'affichage avant passage auto à l'étape suivante (ms). */
  duration: number;
  /** Position de la carte par rapport à la cible. */
  placement?: TourPlacement;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "intro",
    route: "/dashboard/depot",
    kicker: "Visite guidée · ~90 s",
    title: "PROBANT relit vos états financiers comme un auditeur",
    body: "À partir d'un simple fichier comptable, il reconstitue les comptes, repère les anomalies et les relie à leur base légale. Laissez-vous guider — tout se joue tout seul.",
    duration: 7000,
    placement: "center",
  },
  {
    id: "depot",
    route: "/dashboard/depot",
    target: "depot-dropzone",
    kicker: "1 · Le point de départ",
    title: "Tout part d'un fichier comptable",
    body: "On dépose un FEC ou une balance. Ici, la société fictive DEMO SA est déjà chargée — aucune donnée réelle, juste de quoi voir le produit en action.",
    enClair: "FEC = Fichier des Écritures Comptables, le journal officiel exigé par l'administration fiscale.",
    duration: 12000,
    placement: "right",
  },
  {
    id: "synthese-jauge",
    route: "/dashboard/synthese",
    target: "synthese-gauge",
    kicker: "2 · La lecture d'ensemble",
    title: "Un niveau d'exposition au risque, en un coup d'œil",
    body: "L'app pondère chaque anomalie selon sa gravité et en tire un score. Plus l'aiguille monte, plus le dossier mérite l'attention de l'auditeur.",
    duration: 12000,
    placement: "left",
  },
  {
    id: "synthese-sankey",
    route: "/dashboard/synthese",
    target: "synthese-sankey",
    kicker: "3 · La cartographie",
    title: "Chaque anomalie reliée à sa cloison comptable",
    body: "Ce diagramme relie les constats à leur poste (clients, stocks, trésorerie…) et à leur gravité. On voit d'où vient le risque, pas seulement combien il y en a.",
    enClair: "Une « cloison » = un cycle d'audit, un regroupement de comptes qui se contrôlent ensemble.",
    duration: 12000,
    placement: "top",
  },
  {
    id: "cloison-ecart",
    route: "/dashboard/cloisons",
    target: "cloison-rappro",
    kicker: "4 · Le cœur du réacteur",
    title: "Croiser deux documents pour révéler un écart",
    body: "La balance âgée ne colle pas au grand-livre des créances clients. PROBANT le détecte, le chiffre et le qualifie — un rapprochement qu'un humain mettrait des heures à faire ligne à ligne.",
    duration: 14000,
    placement: "right",
  },
  {
    id: "flag",
    route: "/dashboard/cloisons",
    target: "cloison-rappro",
    kicker: "5 · La preuve, pas le verdict",
    title: "Chaque constat porte sa base légale et un conseil",
    body: "Un écart n'est jamais affirmé sans source : texte applicable, seuil de signification, présomption à confirmer. L'auditeur garde la main — l'outil documente.",
    enClair: "Seuil de signification = le montant au-delà duquel une erreur pourrait changer la lecture des comptes (jugement, pas un % réglementaire).",
    duration: 14000,
    placement: "left",
  },
  {
    id: "conclusion",
    route: "/dashboard/synthese",
    kicker: "Fin de la visite",
    title: "Le risque, les écarts, les preuves — réunis",
    body: "Voilà PROBANT en 90 secondes. À vous d'explorer librement : tout ce que vous venez de voir est navigable, avec les vraies données de démonstration.",
    duration: 9000,
    placement: "center",
  },
];

export const TOUR_TOTAL_STEPS = TOUR_STEPS.length;

/** Étape de lancement (route + index 0). */
export const TOUR_ENTRY_ROUTE = TOUR_STEPS[0].route;

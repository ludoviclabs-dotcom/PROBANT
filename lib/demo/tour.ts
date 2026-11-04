/**
 * Script de la « Visite guidée » (mode démo auto-joué) — cinq chapitres encadrés par une ouverture et une
 * conclusion, ≈ 2 min. Le moteur de mise en scène est `components/demo/TourStage.tsx`.
 *
 * Chaque étape pointe vers une route réelle et, optionnellement, vers un élément du DOM marqué
 * `data-tour="<target>"` que le moteur met en lumière. Une étape peut en plus déclarer :
 *  - `tab`         : onglet à activer (`[data-tour-tab="<tab>"]`) avant de chercher la cible ;
 *  - `with`        : autres ancres `data-tour` réunies dans le même cadre (ex. Sankey + barre de filtre) ;
 *  - `prepare`     : remise en état DOM jouée AVANT la recherche de la cible (panneau à ouvrir ou fermer) ;
 *  - `simulatedAction` : action jouée ~300 ms après l'ouverture du cadre, nettoyée en sortie d'étape ;
 *  - `interaction` : moment « À vous » — la cible reste cliquable ; sans geste du visiteur, le curseur
 *                    fantôme fait le geste lui-même après `autoAfterMs` ;
 *  - `callout`     : fiche « artefact connecté » reliée au cadre, lue dans le DOM réellement rendu ;
 *  - `token`       : maillon du « fil de preuve » qui s'allume dans la frise quand l'étape est atteinte.
 *
 * La narration s'adresse à un NON-EXPERT : le « pourquoi » avant le « comment ». Aucun chiffre n'est écrit en
 * dur : ils viennent du dossier démo (`computeCounts`), du calcul de matérialité, du registre normatif ou d'une
 * lecture du DOM au moment de l'affichage. Un paramètre interne n'est jamais attribué à une norme.
 */

import { DEMO_DOSSIER, DEMO_MATERIALITY_BASIS } from "@/lib/demo/dataset";
import { computeCounts } from "@/lib/canonical-model";
import { computeMateriality } from "@/lib/audit/materiality";
import { decrireReferentiel } from "@/lib/referentiel/edition";
import { TOUR_CYCLE_COUNT } from "@/lib/demo/tour-entry";

export { TOUR_CYCLE_COUNT };

export type TourPlacement = "center" | "top" | "bottom" | "left" | "right";

export type TourChapterId = "deposer" | "decider" | "mesurer" | "prouver" | "fonder";

export interface TourChapter {
  id: TourChapterId;
  numeral: string;
  title: string;
  /** Une phrase : ce que le chapitre montre, affichée sur l'intertitre. */
  lede: string;
}

/** Fiche « artefact connecté » affichée près de la cible. */
export interface TourCallout {
  title: string;
  value: string;
  note?: string;
  /** Anime les nombres contenus dans `value` (0 → n). */
  countUp?: boolean;
  /** Résout la valeur au moment de l'affichage (lecture du DOM réellement rendu). */
  resolveValue?: () => string | null;
}

/** Moment interactif : le visiteur peut faire le geste ; sinon la visite le fait pour lui. */
export interface TourInteraction {
  /** Ce que la visite propose de faire (phrase à l'impératif). */
  prompt: string;
  /** Éléments dont le clic compte comme le geste attendu (sélecteur CSS). */
  accept: string;
  /** Élément que le curseur fantôme clique si le visiteur ne le fait pas. */
  autoTarget: () => Element | null;
  /** Délai après l'ouverture du cadre avant le geste automatique (ms). */
  autoAfterMs: number;
  /** Phrase de confirmation une fois le geste fait. */
  done: string;
  /** Temps laissé pour lire l'effet du geste avant l'étape suivante (ms). */
  holdAfterMs: number;
}

/** Effets visuels ponctuels d'une étape. */
export interface TourEffects {
  /** Journal du moteur dans la cible (étape dépôt). */
  parsingProgress?: boolean;
  /** Particules de données cible → rail de navigation (après le journal). */
  particles?: boolean;
  /** Clé `data-tour` d'un élément à faire pulser pendant ~2 s. */
  pulseTarget?: string;
}

export interface TourToken {
  /** Clé courte (mono, majuscules). */
  key: string;
  /** Valeur exacte, issue du dossier ou du moteur. */
  value: string;
}

export interface TourStep {
  id: string;
  /** Scène plein écran (ouverture, conclusion) ou étape ancrée dans un chapitre. */
  scene?: "opening" | "finale";
  chapter?: TourChapterId;
  route: string;
  target?: string;
  with?: string[];
  tab?: string;
  /** Libellé court du cadre (pastille au-dessus de la cible). */
  label?: string;
  kicker: string;
  title: string;
  body: string;
  enClair?: string;
  /** Durée de lecture une fois le cadre ouvert (ms). */
  duration: number;
  placement?: TourPlacement;
  /** Alignement du défilement : `start` pour une cible plus haute que l'écran. */
  scroll?: "start" | "center";
  prepare?: () => void;
  simulatedAction?: () => (() => void) | void;
  interaction?: TourInteraction;
  callout?: TourCallout;
  effects?: TourEffects;
  token?: TourToken;
}

/* ── Faits du dossier démo (jamais un chiffre inventé) ─────────────────────── */

const COUNTS = computeCounts(DEMO_DOSSIER);

/** Seuil de signification calculé sur le CA démo — taux = paramètre interne du registre, pas une norme. */
const MATERIALITY = computeMateriality(DEMO_MATERIALITY_BASIS);
const SEUIL_EUR = MATERIALITY?.significativite ?? null;
const SEUIL_TAUX = MATERIALITY ? (MATERIALITY.taux * 100).toLocaleString("fr-FR") : null;

const RAPPRO_SILO_COUNT = DEMO_DOSSIER.silos.filter((s) => s.siloId.startsWith("rapprochement-")).length;

/** Ligne « écart de rapprochement » du silo vitrine Clients (balance âgée ↔ grand-livre 411). */
const CLIENTS_ECART = DEMO_DOSSIER.silos
  .find((s) => s.siloId === "rapprochement-clients")
  ?.statement.rows.find((r) => r.id === "rappro-ecart")?.valeur;

const EDITION = decrireReferentiel(DEMO_DOSSIER.referentielVersion);

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

const BLOCKING_ADMISSIBILITY = COUNTS.bloquantesAdmissibilite;

/** Faits réutilisés par la mise en scène (journal du moteur, ouverture, conclusion). */
export const TOUR_FACTS = {
  societe: DEMO_DOSSIER.societe.raisonSociale,
  exercice: DEMO_DOSSIER.societe.exercice,
  fingerprint: DEMO_DOSSIER.fecFingerprint.slice(0, 12),
  silos: DEMO_DOSSIER.silos.length,
  findings: COUNTS.totalFindings,
  blocking: COUNTS.parSeverite.bloquant,
  major: COUNTS.parSeverite.majeur,
  blockingAdmissibility: BLOCKING_ADMISSIBILITY,
  seuil: SEUIL_EUR === null ? "inconnu" : eur(SEUIL_EUR),
  seuilTaux: SEUIL_TAUX,
  cycles: TOUR_CYCLE_COUNT,
  rapprochements: RAPPRO_SILO_COUNT,
  edition: EDITION.libelle,
  families: {
    hardLaw: COUNTS.parFamille.hardLaw,
    methodology: COUNTS.parFamille.methodology,
    internal: COUNTS.parFamille.internal,
  },
} as const;

/** Les trois registres présentés à l'ouverture, avec leur nombre réel de constats. */
export const TOUR_REGISTERS: { family: "hardLaw" | "methodology" | "internal"; label: string; detail: string; count: number }[] = [
  { family: "hardLaw", label: "Droit dur", detail: "LPF, PCG — opposable", count: TOUR_FACTS.families.hardLaw },
  { family: "methodology", label: "Présomption d’audit", detail: "NEP, ISA — méthode", count: TOUR_FACTS.families.methodology },
  { family: "internal", label: "Paramètre interne", detail: "seuils PROBANT — non opposables", count: TOUR_FACTS.families.internal },
];

/** Mesures de la conclusion (compteurs animés). */
export const TOUR_VERDICT_METRICS: { id: string; target: number; label: string; durationMs: number }[] = [
  { id: "cycles", target: TOUR_CYCLE_COUNT, label: "fiches cycles", durationMs: 900 },
  { id: "constats", target: COUNTS.totalFindings, label: "constats sourcés", durationMs: 1100 },
  { id: "rappros", target: RAPPRO_SILO_COUNT, label: "rapprochements croisés", durationMs: 700 },
];

/** Données injectées dans le journal du moteur (étape dépôt). */
export const TOUR_PARSING_FACTS = {
  fingerprint: TOUR_FACTS.fingerprint,
  silos: TOUR_FACTS.silos,
  findings: TOUR_FACTS.findings,
  blockingAdmissibility: TOUR_FACTS.blockingAdmissibility,
  seuil: TOUR_FACTS.seuil,
  societe: TOUR_FACTS.societe,
};

/* ── Chapitres ─────────────────────────────────────────────────────────────── */

export const TOUR_CHAPTERS: TourChapter[] = [
  { id: "deposer", numeral: "I", title: "Déposer", lede: "Le fichier entre ; son admissibilité est jugée avant toute analyse." },
  { id: "decider", numeral: "II", title: "Décider", lede: "La Synthèse s’ouvre sur ce qui suffit pour agir." },
  { id: "mesurer", numeral: "III", title: "Mesurer", lede: "Le risque se lit, se simule, se relie — sans jamais devenir un verdict." },
  { id: "prouver", numeral: "IV", title: "Prouver", lede: "Chaque écart est relié à son constat, chaque constat à sa source." },
  { id: "fonder", numeral: "V", title: "Fonder", lede: "Des règles datées, citées, versionnées — séparées des paramètres internes." },
];

/* ── Lectures du DOM rendu (valeurs affichées par l'application elle-même) ─── */

function text(el: Element | null | undefined): string | null {
  const t = el?.textContent?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** Signal heuristique tel qu'affiché par la Synthèse (« 82/100 · élevé »). */
function resolveSignal(): string | null {
  const root = document.querySelector('[data-tour="synthese-signal"]');
  const value = text(root?.querySelector('[data-tour-read="value"]'));
  const band = text(root?.querySelector('[data-tour-read="band"]'));
  return value ? `${value}/100${band ? ` · ${band}` : ""}` : null;
}

/** Libellé de la barre du filtre croisé (« Bilan — Actif → Majeur · 9 constats »), « aucun » sans filtre. */
function resolveFilter(): string | null {
  const bar = document.querySelector('[data-tour="synthese-filtre"]');
  if (!bar) return null;
  // Le bouton « Effacer le filtre » n'existe que si un filtre est posé.
  if (!bar.querySelector('[data-tour-action="filter-clear"]')) return "aucun";
  return text(bar.querySelector('[data-tour-read="filter"]'));
}

/** Constats exclus de l'exposition faute de montant, lus dans la marge du pont (« 40 constats sans effet… »). */
function resolveExcluded(): string | null {
  const note = text(document.querySelector('[data-tour="synthese-exposition"] [data-tour-read="excluded"]'));
  const n = note?.match(/\d+/)?.[0];
  return n ? `${n} ${Number(n) > 1 ? "constats exclus" : "constat exclu"}` : null;
}

/** Compteur « Cycles évalués » de la cartographie (« 30 · 5 non évalués »). */
function resolveEvaluatedCycles(): string | null {
  return text(document.querySelector('[data-tour="risk-readouts"] dd'));
}

/** Ligne en écart du silo vitrine, telle que la reconstruction l'affiche. */
function resolveFlaggedRow(): string | null {
  const row = document.querySelector('[data-tour="bezier-link"] tr[data-flagged]');
  if (!row) return null;
  const cells = Array.from(row.querySelectorAll("td")).map((td) => text(td)).filter(Boolean);
  return cells.length ? cells.join(" · ") : null;
}

/** Ligne « Décision » de la complétude des chaînes (« 0/43 · tous en attente »). */
function resolveDecisions(): string | null {
  const row = document.querySelector('[data-tour="dossier-chaines"] [data-key="decision"]');
  return text(row?.lastElementChild);
}

/* ── Actions simulées (DOM uniquement, jouées côté client par TourStage) ──── */

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Pose la valeur d'un input contrôlé par React (setter natif + event `input`). */
function setNativeInputValue(el: HTMLInputElement, value: number) {
  const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  desc?.set?.call(el, String(Math.round(value)));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Simulateur ISA 320 : déplie le panneau puis balaye le curseur du seuil calculé vers la borne basse (–30 %)
 * puis la borne haute (+30 %), en appliquant le scoring pendant le glissement (clics « Simuler » répétés) :
 * la matrice se re-trie avec le vrai moteur. Le seuil calculé est REMIS en quittant l'étape (« Réinitialiser »).
 */
function simulateThresholdSweep(): (() => void) | void {
  const root = document.querySelector<HTMLElement>('[data-tour="seuil-simulator"]');
  if (!root) return;

  const toggle = root.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();

  let raf = 0;
  const timer = window.setTimeout(() => {
    const slider = root.querySelector<HTMLInputElement>('input[type="range"]');
    if (!slider) return;
    const start = Number(slider.value);
    const lo = Number(slider.min) || Math.round(start * 0.7);
    const hi = Number(slider.max) || Math.round(start * 1.3);
    const apply = () => root.querySelector<HTMLButtonElement>('[data-tour-action="simulate"]')?.click();

    if (prefersReducedMotion()) {
      setNativeInputValue(slider, hi);
      apply();
      return;
    }
    const SEGMENTS: { from: number; to: number; dur: number }[] = [
      { from: start, to: lo, dur: 1100 },
      { from: lo, to: hi, dur: 1700 },
    ];
    let seg = 0;
    let t0 = performance.now();
    let sinceApply = 0;
    const ease = (p: number) => 1 - Math.pow(1 - p, 3);
    const tick = (now: number) => {
      const s = SEGMENTS[seg];
      const p = Math.min(1, (now - t0) / s.dur);
      setNativeInputValue(slider, s.from + (s.to - s.from) * ease(p));
      if (++sinceApply >= 5) {
        sinceApply = 0;
        apply();
      }
      if (p >= 1) {
        if (seg < SEGMENTS.length - 1) {
          seg += 1;
          t0 = now;
        } else {
          apply();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }, 380);

  return () => {
    window.clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    document.querySelector<HTMLButtonElement>('[data-tour="seuil-simulator"] [data-tour-action="reset"]')?.click();
  };
}

/** Flux « majeur » qui porte le plus de constats (nombre posé par le Sankey sur chaque bande). */
function widestMajorFlow(): Element | null {
  const paths = Array.from(
    document.querySelectorAll<SVGPathElement>('[data-tour="synthese-sankey"] path[data-tour-flow$="-majeur"]'),
  );
  if (paths.length === 0) return null;
  const count = (el: Element) => Number(el.getAttribute("data-tour-count")) || 0;
  return paths.reduce((a, b) => (count(b) > count(a) ? b : a));
}

/** Efface le filtre croisé posé pendant l'étape (bouton réel de la barre de filtre). */
function clearCrossFilter() {
  document.querySelector<HTMLButtonElement>('[data-tour-action="filter-clear"]')?.click();
}

const REVIEW_TRIGGER = '[data-tour="cloison-rappro"] [data-finding-trigger]';

/** Bouton « Analyser » du premier constat du silo vitrine. */
function firstFindingTrigger(): Element | null {
  return document.querySelector(REVIEW_TRIGGER);
}

/** Ferme le panneau de revue s'il est ouvert (le silo vitrine doit rester lisible). */
function closeReviewPanel() {
  const drawerClose = document.querySelector<HTMLButtonElement>('[aria-label="Fermer le panneau de revue"]');
  if (drawerClose) {
    drawerClose.click();
    return;
  }
  const selected = document.querySelector<HTMLButtonElement>('[data-tour="bezier-link"] li[data-selected] [data-finding-trigger]');
  selected?.click();
}

/** Ouvre le panneau de revue du premier constat s'il ne l'est pas déjà (arrivée directe sur l'étape). */
function openReviewPanel() {
  if (document.querySelector('[data-tour="review-panel"]')) return;
  document.querySelector<HTMLButtonElement>(REVIEW_TRIGGER)?.click();
}

/*
 * ── Le parcours ───────────────────────────────────────────────────────────
 * Budget : ≈ 104 s de lecture avant la conclusion, plus ≈ 1 s de transition par étape et 1,6 s par
 * intertitre de chapitre. La conclusion reste affichée : c'est au visiteur de choisir la suite.
 */

export const TOUR_STEPS: TourStep[] = [
  {
    id: "ouverture",
    scene: "opening",
    route: "/dashboard/depot",
    kicker: "Visite guidée · PROBANT",
    title: "Du grand livre au constat opposable.",
    body: `Deux minutes sur ${TOUR_FACTS.societe}, société fictive. Chaque chiffre affiché sort du moteur ; chaque constat dit de quel registre il relève.`,
    duration: 6500,
    placement: "center",
  },
  {
    id: "depot",
    chapter: "deposer",
    route: "/dashboard/depot",
    target: "depot-dropzone",
    label: "Zone de dépôt",
    kicker: "Le point de départ",
    title: "Un dépôt, une empreinte, un contrôle",
    body: `Le FEC est lu, empreinté puis contrôlé au regard de l’article A.47 A-1 du LPF avant le moindre constat. Ici, ${TOUR_FACTS.societe} est déjà chargée.`,
    enClair: "FEC = fichier des écritures comptables, le journal exigé par l’administration fiscale.",
    duration: 8500,
    placement: "right",
    effects: { parsingProgress: true, particles: true },
    token: { key: "FEC", value: TOUR_FACTS.fingerprint },
  },
  {
    id: "contexte",
    chapter: "deposer",
    route: "/dashboard/depot",
    target: "dossier-context",
    label: "Ruban de contexte",
    kicker: "Un dossier, pas une session",
    title: "Le dossier vous suit d’écran en écran",
    body: "Le ruban reste en tête de chaque écran : exercice, identifiant, empreinte du FEC, sources. Les liens portent ce contexte, si bien que deux dossiers ne se mélangent jamais.",
    duration: 6500,
    placement: "bottom",
    token: { key: "Dossier", value: `${TOUR_FACTS.societe} · ${TOUR_FACTS.exercice}` },
  },
  {
    id: "verdict",
    chapter: "decider",
    route: "/dashboard/synthese",
    target: "synthese-verdict",
    label: "Verdict du moteur",
    kicker: "Décision",
    title: "D’abord le verdict, en une phrase",
    body: `Le moteur commence par ce qui bloque : ${TOUR_FACTS.blockingAdmissibility} ${plural(TOUR_FACTS.blockingAdmissibility, "alerte rend", "alertes rendent")} le FEC non admissible. Tant qu’elle n’est pas levée, aucune analyse financière n’est présentée comme fiable.`,
    duration: 9000,
    placement: "right",
    scroll: "start",
    callout: {
      title: "Signal heuristique",
      value: "paramètre interne",
      note: "subordonné au verdict — pas un score de conformité",
      resolveValue: resolveSignal,
    },
    token: { key: "Admissibilité", value: `${TOUR_FACTS.blockingAdmissibility} ${plural(TOUR_FACTS.blockingAdmissibility, "alerte")}` },
  },
  {
    id: "sankey",
    chapter: "decider",
    route: "/dashboard/synthese",
    target: "synthese-sankey",
    with: ["synthese-filtre"],
    label: "Sankey cloison → gravité",
    kicker: "Analyse croisée",
    title: "Un clic, et toute l’analyse se filtre",
    body: "Le Sankey relie chaque cloison à la gravité de ses constats. Cliquer un flux filtre en même temps le pont d’exposition, la mosaïque des assertions et la concentration par cycle.",
    duration: 11000,
    placement: "left",
    interaction: {
      prompt: "Cliquez un flux du Sankey.",
      accept: '[data-tour="synthese-sankey"] svg',
      autoTarget: widestMajorFlow,
      autoAfterMs: 4200,
      done: "Filtre croisé appliqué : la section Analyse suit.",
      holdAfterMs: 3400,
    },
    simulatedAction: () => clearCrossFilter,
    callout: {
      title: "Filtre croisé",
      value: "aucun",
      note: "lu dans la barre de filtre de la page",
      resolveValue: resolveFilter,
    },
    token: { key: "Constats", value: `${TOUR_FACTS.findings} sourcés` },
  },
  {
    id: "exposition",
    chapter: "decider",
    route: "/dashboard/synthese",
    target: "synthese-exposition",
    label: "Marge du pont d’exposition",
    kicker: "Un inconnu reste inconnu",
    title: "Aucun montant n’est inventé",
    body: "Tant qu’aucun effet n’est arbitré, l’ajustement proposé reste « aucun » : les montants détectés ne sont que des propositions à corroborer. Les constats sans montant sont exclus de l’exposition — un inconnu n’est jamais compté comme zéro.",
    duration: 8500,
    placement: "left",
    callout: {
      title: "Hors exposition",
      value: "lu dans la marge",
      note: "constats sans effet chiffré, jamais comptés comme zéro",
      resolveValue: resolveExcluded,
    },
  },
  {
    id: "matrice",
    chapter: "mesurer",
    route: "/dashboard/risques",
    target: "risk-matrix",
    tab: "matrix",
    label: "Matrice des cycles",
    kicker: "Cartographie des risques",
    title: `${TOUR_CYCLE_COUNT} fiches cycles, quatre axes de lecture`,
    body: "Gravité, probabilité, détectabilité, exposition : chaque cycle reçoit un composite, heuristique interne d’aide à la décision. Un cycle sans donnée reste « non évalué » — jamais rangé parmi les sûrs.",
    duration: 8500,
    placement: "right",
    scroll: "start",
    callout: {
      title: "Cycles évalués",
      value: "lus sur la page",
      note: "composite interne · jamais opposable",
      resolveValue: resolveEvaluatedCycles,
    },
  },
  {
    id: "simulateur",
    chapter: "mesurer",
    route: "/dashboard/risques",
    target: "seuil-simulator",
    tab: "matrix",
    label: "Simulateur de seuil",
    kicker: "Simuler, sans engager",
    title: "Et si le seuil de signification changeait ?",
    body: "Le curseur balaye ±30 % autour du seuil calculé : le scoring est rejoué en direct et la matrice se re-trie. Rien n’est enregistré ; le seuil calculé revient en sortie d’étape.",
    enClair: "Seuil de signification (ISA 320) : montant au-delà duquel une erreur pourrait changer la lecture des comptes.",
    duration: 10000,
    placement: "bottom",
    simulatedAction: simulateThresholdSweep,
    callout: {
      title: "Seuil calculé",
      value: TOUR_FACTS.seuil,
      note: SEUIL_TAUX ? `CA × ${SEUIL_TAUX} % · paramètre interne du registre ${EDITION.libelle}` : "base de calcul absente",
    },
    token: { key: "Seuil", value: TOUR_FACTS.seuil },
  },
  {
    id: "propagation",
    chapter: "mesurer",
    route: "/dashboard/risques",
    target: "risk-flow-graph",
    tab: "flow",
    label: "Graphe des cycles",
    kicker: "Des cycles liés",
    title: "Des cycles qui se tiennent entre eux",
    body: "Le graphe montre les liens entre cycles : relations déclarées en trait plein, comptes PCG partagés en pointillé. C’est un fait de relation, pas une propagation chiffrée.",
    duration: 8000,
    placement: "left",
    effects: { pulseTarget: "risk-node-immo" },
  },
  {
    id: "cloison",
    chapter: "prouver",
    route: "/dashboard/cloisons",
    target: "bezier-link",
    label: "Silo · rapprochement Clients",
    kicker: "Revue par cloison",
    title: "De l’écart au constat, sans saut implicite",
    body: "La balance âgée ne colle pas au grand-livre 411 : la ligne en écart est reliée par un trait à chaque constat qu’elle porte, avec sa gravité et son registre.",
    duration: 10000,
    placement: "right",
    prepare: closeReviewPanel,
    interaction: {
      prompt: "Ouvrez le premier constat avec « Analyser ».",
      accept: REVIEW_TRIGGER,
      autoTarget: firstFindingTrigger,
      autoAfterMs: 4600,
      done: "Panneau de revue ouvert.",
      holdAfterMs: 1800,
    },
    callout: {
      title: "Ligne en écart",
      value: CLIENTS_ECART === undefined ? "inconnue" : `Écart de rapprochement · ${eur(CLIENTS_ECART)}`,
      note: "balance âgée ↔ grand-livre 411",
      resolveValue: resolveFlaggedRow,
    },
    token: CLIENTS_ECART === undefined ? undefined : { key: "Écart 411", value: eur(CLIENTS_ECART) },
  },
  {
    id: "revue",
    chapter: "prouver",
    route: "/dashboard/cloisons",
    target: "review-panel",
    label: "Panneau de revue",
    kicker: "Jugement professionnel",
    title: "La décision reste humaine",
    body: "Source citée et datée, montant constaté, attendu, écart, explication : tout est sous les yeux. Valider ou écarter appartient à l’auditeur — la visite, elle, ne décide rien.",
    duration: 8500,
    placement: "left",
    scroll: "start",
    prepare: openReviewPanel,
  },
  {
    id: "chaines",
    chapter: "prouver",
    route: "/dashboard/dossier",
    target: "dossier-chaines",
    label: "Complétude des chaînes",
    kicker: "Dossier & preuve",
    title: "Une chaîne de preuve par constat",
    body: "Source, transformation, règle, résultat, décision : pour chaque constat, chaque maillon présent est montré — et chaque maillon absent aussi. Aucune décision n’est prise à la place de l’auditeur.",
    duration: 8500,
    placement: "top",
    callout: {
      title: "Décisions",
      value: "lues sur la page",
      note: "maillon « décision » de la complétude",
      resolveValue: resolveDecisions,
    },
    token: { key: "Chaînes de preuve", value: String(TOUR_FACTS.findings) },
  },
  {
    id: "referentiel",
    chapter: "fonder",
    route: "/dashboard/referentiel",
    target: "referentiel-socle",
    label: "Registre normatif",
    kicker: "Seuils & référentiel",
    title: "Un socle normatif daté et cité",
    body: "Chaque contrôle s’appuie sur une source versionnée : droit dur opposable (LPF, PCG) ou méthode d’audit (NEP, ISA). Les seuils internes sont rangés à part : ils hiérarchisent la vigilance, ils ne fondent aucun constat.",
    duration: 8500,
    placement: "bottom",
    callout: {
      title: "Édition du registre",
      value: EDITION.libelle,
      note: "une édition n’atteste pas la relecture des entrées",
    },
    token: { key: "Référentiel", value: EDITION.libelle },
  },
  {
    id: "conclusion",
    scene: "finale",
    route: "/dashboard/referentiel",
    kicker: "Le fil de preuve",
    title: "Du FEC à la décision, un fil que l’on peut relire.",
    body: `PROBANT a lu un FEC, jugé son admissibilité, sourcé ${TOUR_FACTS.findings} constats et reconstitué leurs chaînes. Il ne conclut pas à votre place : la décision reste à l’auditeur.`,
    duration: 12000,
    placement: "center",
  },
];

export const TOUR_TOTAL_STEPS = TOUR_STEPS.length;

/** Étape de lancement. */
export const TOUR_ENTRY_ROUTE = TOUR_STEPS[0].route;

/** Estimation de la transition par étape (navigation, recherche de cible, voyage du curseur), en ms. */
export const TOUR_TRANSITION_MS = 1000;
/** Durée d'un intertitre de chapitre (ms). */
export const TOUR_CHAPTER_CARD_MS = 1600;

/** Temps estimé jusqu'à l'ouverture de la conclusion (la conclusion reste affichée ensuite). */
export function estimatedTourMs(steps: readonly TourStep[] = TOUR_STEPS): number {
  const beforeFinale = steps.filter((s) => s.scene !== "finale");
  const reading = beforeFinale.reduce((sum, s) => sum + s.duration, 0);
  const chapters = new Set(steps.map((s) => s.chapter).filter(Boolean)).size;
  return reading + beforeFinale.length * TOUR_TRANSITION_MS + chapters * TOUR_CHAPTER_CARD_MS;
}

/** Index du chapitre d'une étape, -1 pour l'ouverture, `TOUR_CHAPTERS.length` pour la conclusion. */
export function chapterIndexOf(step: TourStep): number {
  if (step.scene === "opening") return -1;
  if (step.scene === "finale") return TOUR_CHAPTERS.length;
  return TOUR_CHAPTERS.findIndex((c) => c.id === step.chapter);
}

/** Première étape d'un chapitre. */
export function firstStepOfChapter(chapter: TourChapterId): number {
  return TOUR_STEPS.findIndex((s) => s.chapter === chapter);
}

/** Maillons du fil de preuve, dans l'ordre du parcours. */
export const TOUR_THREAD: (TourToken & { stepIndex: number; chapter: TourChapterId })[] = TOUR_STEPS.flatMap((s, i) =>
  s.token && s.chapter ? [{ ...s.token, stepIndex: i, chapter: s.chapter }] : [],
);

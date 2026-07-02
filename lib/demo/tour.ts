/**
 * Script de la « Visite guidée » (mode démo auto-joué) — parcours 8 temps, ~95 s.
 *
 * Chaque étape pointe vers une route réelle et, optionnellement, vers un
 * élément du DOM marqué `data-tour="<target>"` que le moteur met en lumière
 * (spotlight). Sans `target`, la carte est centrée (verdict final).
 *
 * Une étape peut en plus déclarer :
 *  - `tab`             : onglet à activer sur la page (clic simulé sur
 *                        `[data-tour-tab="<tab>"]`) avant de chercher la cible ;
 *  - `simulatedAction` : action jouée ~300 ms après l'ouverture du spotlight
 *                        (slider du simulateur, hover Sankey…) ; elle retourne
 *                        un nettoyage exécuté en quittant l'étape ;
 *  - `callout`         : mini-carte « artefact connecté » reliée à la cible ;
 *  - `effects`         : effets ponctuels (progress de parsing, particules,
 *                        pulse d'un nœud précis).
 *
 * La narration s'adresse à un NON-EXPERT : une phrase par idée, le « pourquoi »
 * avant le « comment ». Aucune citation ni aucun chiffre n'est inventé ici :
 * tous les nombres affichés viennent du dossier démo (`computeCounts`), du
 * calcul ISA 320 réel (`computeMateriality`) ou d'une lecture du DOM rendu.
 */

import { DEMO_DOSSIER, DEMO_MATERIALITY_BASIS } from "@/lib/demo/dataset";
import { computeCounts } from "@/lib/canonical-model";
import { computeMateriality } from "@/lib/audit/materiality";

export type TourPlacement = "center" | "top" | "bottom" | "left" | "right";

/** Mini-carte « artefact connecté » affichée près de la cible (Partie 2). */
export interface TourCallout {
  title: string;
  value: string;
  note?: string;
  /** Anime les nombres contenus dans `value` (0 → n, chiffre par chiffre). */
  countUp?: boolean;
  /** Résout la valeur au moment de l'affichage (lecture du DOM réellement rendu). */
  resolveValue?: () => string | null;
}

/** Effets visuels ponctuels d'une étape. */
export interface TourEffects {
  /** Barre de progression de parsing FEC sous la cible (étape dépôt). */
  parsingProgress?: boolean;
  /** Particules de données dropzone → navigation (après le parsing). */
  particles?: boolean;
  /** Clé `data-tour` d'un élément à faire pulser en orange pendant ~2 s. */
  pulseTarget?: string;
}

export interface TourStep {
  /** Identifiant stable de l'étape. */
  id: string;
  /** Route sur laquelle l'étape se joue. */
  route: string;
  /** Clé `data-tour` de l'élément à mettre en lumière. Absent → carte centrée. */
  target?: string;
  /** Onglet `[data-tour-tab="<tab>"]` à activer avant de chercher la cible. */
  tab?: string;
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
  /** Action simulée (retourne un nettoyage optionnel, exécuté en sortie d'étape). */
  simulatedAction?: () => (() => void) | void;
  callout?: TourCallout;
  effects?: TourEffects;
}

/* ── Métriques réelles du dossier démo (jamais un chiffre inventé) ────────── */

const COUNTS = computeCounts(DEMO_DOSSIER);

/** Seuil ISA 320 réellement calculé sur le CA démo (0,5 % — même base que la page Risques). */
const MATERIALITY = computeMateriality(DEMO_MATERIALITY_BASIS);
const SEUIL_EUR = MATERIALITY?.significativite ?? 0;
const SEUIL_TAUX_PCT = MATERIALITY ? (MATERIALITY.taux * 100).toLocaleString("fr-FR") : "—";

/** Silos issus du moteur de rapprochement multi-documents (8 cycles croisés). */
const RAPPRO_SILO_COUNT = DEMO_DOSSIER.silos.filter((s) =>
  s.siloId.startsWith("rapprochement-"),
).length;

/**
 * Nombre de fiches cycles de la base normative (35 YAML dans
 * `lib/audit-cycles/data`). Le chargeur (`loadAllCycles`) est serveur-only
 * (fs + yaml) : cette constante est le miroir client, VERROUILLÉE par un test
 * (`lib/audit-cycles/__tests__/loader.test.ts`) qui échoue si la base évolue.
 */
export const TOUR_CYCLE_COUNT = 35;

/** Constat « écart DUPONT » réel du rapprochement Clients (balance âgée ↔ GL 411). */
const DUPONT_FINDING = DEMO_DOSSIER.silos
  .find((s) => s.siloId === "rapprochement-clients")
  ?.findings.find((f) => f.titre.toUpperCase().includes("DUPONT"));

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Résumé sévérités réel, réutilisé par le dossier et le Sankey. */
const COUNTS_LINE = `${COUNTS.totalFindings} constats · ${COUNTS.parSeverite.bloquant} bloquants · ${COUNTS.parSeverite.majeur} majeurs`;

/** Métriques (réelles) des 3 mini-cards du verdict final + durée du compteur animé. */
export const TOUR_VERDICT_METRICS: {
  id: string;
  target: number;
  label: string;
  icon: "network" | "file" | "scale";
  durationMs: number;
}[] = [
  { id: "cycles", target: TOUR_CYCLE_COUNT, label: "cycles analysés", icon: "network", durationMs: 1000 },
  { id: "constats", target: COUNTS.totalFindings, label: "constats sourcés", icon: "file", durationMs: 1200 },
  { id: "rappros", target: RAPPRO_SILO_COUNT, label: "rapprochements croisés", icon: "scale", durationMs: 800 },
];

/** Données réelles injectées dans la progress de parsing (étape dépôt). */
export const TOUR_PARSING_FACTS = {
  fingerprint: DEMO_DOSSIER.fecFingerprint.slice(0, 12),
  silos: DEMO_DOSSIER.silos.length,
  findings: COUNTS.totalFindings,
  seuil: eur(SEUIL_EUR),
};

/* ── Actions simulées (DOM uniquement, jouées côté client par GuidedTour) ── */

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
 * TEMPS 3 — déplie le simulateur ISA 320 puis balaye le curseur : seuil réel →
 * borne basse (–30 %) → borne haute (+30 %), en APPLIQUANT le scoring en direct
 * pendant le glissement (clics « Simuler » répétés) : la matrice re-trie ses
 * lignes en temps réel et le basculement de bande — réel sur ce dossier autour
 * de la borne haute — déclenche le flash de cellule. Le seuil réel est REMIS en
 * quittant l'étape (clic « Réinitialiser »). Tout passe par les vrais contrôles
 * du composant : rien n'est calculé ici.
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
    const apply = () =>
      root.querySelector<HTMLButtonElement>('[data-tour-action="simulate"]')?.click();

    if (prefersReducedMotion()) {
      setNativeInputValue(slider, hi);
      apply();
      return;
    }
    // Deux segments : descente (1,1 s) puis remontée traversante (1,7 s).
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
      // Application « live » du scoring ~1 frame sur 5 (recalcul réel, pas un effet).
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
  }, 380); // laisse le panneau se déplier avant de saisir le curseur

  return () => {
    window.clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    document
      .querySelector<HTMLButtonElement>('[data-tour="seuil-simulator"] [data-tour-action="reset"]')
      ?.click();
  };
}

/**
 * TEMPS 6 — survol simulé du flux « majeur » le plus épais du Sankey : déclenche
 * le highlight existant (les autres flux s'estompent). Nettoyé en sortie d'étape.
 */
function simulateSankeyHover(): (() => void) | void {
  const paths = Array.from(
    document.querySelectorAll<SVGPathElement>(
      '[data-tour="synthese-sankey"] path[data-tour-flow$="-majeur"]',
    ),
  );
  if (paths.length === 0) return;
  const widest = paths.reduce((a, b) =>
    Number(a.getAttribute("stroke-width") ?? 0) >= Number(b.getAttribute("stroke-width") ?? 0) ? a : b,
  );
  const r = widest.getBoundingClientRect();
  const at = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  widest.dispatchEvent(new MouseEvent("mouseover", at));
  return () => widest.dispatchEvent(new MouseEvent("mouseout", at));
}

/** Lecture du DOM rendu : composite max réellement affiché dans la matrice. */
function resolveTopComposite(): string | null {
  const cells = document.querySelectorAll<HTMLElement>(
    '[data-tour="risk-matrix"] [aria-label^="Score composite"]',
  );
  let max: number | null = null;
  let scored = 0;
  for (const c of cells) {
    const m = c.getAttribute("aria-label")?.match(/Score composite : (\d+) sur 100/);
    if (!m) continue;
    scored += 1;
    const v = Number(m[1]);
    if (max === null || v > max) max = v;
  }
  return max === null ? null : `COMP max ${max}/100 · ${scored} cycles scorés`;
}

/*
 * ── Le parcours — 8 temps ─────────────────────────────────────────────────
 * Budget : ~81,5 s de durées d'étapes + ~1,5 s de transition par étape
 * (navigation, bascule d'onglet, recherche de cible, voyage du curseur),
 * mesuré ≈ 93 s au total. Rester SOUS 95 s, transitions comprises.
 */

export const TOUR_STEPS: TourStep[] = [
  {
    // TEMPS 0 · t=0 s
    id: "depot",
    route: "/dashboard/depot",
    target: "depot-dropzone",
    kicker: "Visite guidée · 1 · Le point de départ",
    title: "Tout démarre par un dépôt",
    body: "Un FEC, une balance, une liasse — le moteur lit, valide et structure vos données en quelques secondes. Ici, la société fictive DEMO SA est déjà chargée.",
    enClair: "FEC = Fichier des Écritures Comptables, le journal officiel exigé par l'administration fiscale.",
    duration: 9000,
    placement: "right",
    effects: { parsingProgress: true, particles: true },
  },
  {
    // TEMPS 1 · t≈10 s
    id: "risques-matrice",
    route: "/dashboard/risques",
    target: "risk-matrix",
    tab: "matrix",
    kicker: "2 · Les risques, en un coup d'œil",
    title: `${TOUR_CYCLE_COUNT} cycles d'audit, scorés sur 4 axes ISA`,
    body: "Gravité, Probabilité, Détectabilité, Exposition : chaque cycle reçoit un score composite. Les plus chauds remontent automatiquement en tête de matrice.",
    enClair: "Le composite est une heuristique interne d'aide à la décision — jamais un verdict opposable.",
    duration: 12000,
    placement: "top",
    callout: {
      title: "Composite ISA · 4 axes",
      value: "Heuristique interne",
      note: "jamais opposable — seuls les constats sourcés font foi",
      resolveValue: resolveTopComposite,
    },
  },
  {
    // TEMPS 2 · t≈24 s
    id: "risques-flux",
    route: "/dashboard/risques",
    target: "risk-flow-graph",
    tab: "flow",
    kicker: "3 · La propagation des risques",
    title: "Certains risques se propagent d'un cycle à l'autre",
    body: "Ce graphe montre les dépendances inter-cycles détectées par le moteur — relations déclarées et comptes PCG partagés. En un regard, les nœuds critiques apparaissent.",
    duration: 10500,
    placement: "left",
    effects: { pulseTarget: "risk-node-immo" },
  },
  {
    // TEMPS 3 · t≈36 s
    id: "risques-simulateur",
    route: "/dashboard/risques",
    target: "seuil-simulator",
    tab: "matrix",
    kicker: "4 · Simuler, sans engager",
    title: "Et si votre seuil de signification changeait ?",
    body: "Le curseur balaye ±30 % autour du seuil réel : le moteur rejoue le scoring en direct — composites recalculés, matrice re-triée, bandes de criticité mises à jour. Rien n'est sauvegardé.",
    enClair: "Seuil de signification (ISA 320) = le montant au-delà duquel une erreur pourrait changer la lecture des comptes.",
    duration: 11500,
    placement: "bottom",
    simulatedAction: simulateThresholdSweep,
    callout: {
      title: "Seuil actuel",
      value: eur(SEUIL_EUR),
      note: `CA × ${SEUIL_TAUX_PCT} % — ISA 320`,
    },
  },
  {
    // TEMPS 4 · t≈49 s
    id: "cloison-bezier",
    route: "/dashboard/cloisons",
    target: "bezier-link",
    kicker: "5 · De l'écart au constat",
    title: "Chaque écart est relié à son constat d'audit",
    body: "La balance âgée ne colle pas au grand-livre 411 : PROBANT trace la chaîne causale, de la ligne en anomalie jusqu'au constat d'audit. Aucune déduction implicite.",
    duration: 10500,
    placement: "top",
    callout: DUPONT_FINDING
      ? {
          title: "Écart DUPONT SA",
          value: DUPONT_FINDING.annotation ?? eur(Math.abs(DUPONT_FINDING.mesure.constate)),
          note: "balance âgée ↔ grand-livre 411",
        }
      : undefined,
  },
  {
    // TEMPS 5 · t≈61 s
    id: "dossier",
    route: "/dashboard/dossier",
    target: "dossier-panel",
    kicker: "6 · Le dossier se construit",
    title: "Chaque constat alimente le dossier de preuve",
    body: "Sourcé, horodaté, rattaché à sa norme : la chaîne source → règle → résultat est reconstituable pour chaque constat — prêt pour la revue qualité.",
    duration: 8500,
    placement: "left",
    callout: {
      title: "Dossier de preuve",
      value: COUNTS_LINE,
      note: "compteurs réels du dossier DEMO SA",
      countUp: true,
    },
  },
  {
    // TEMPS 6 · t≈71 s
    id: "synthese-sankey",
    route: "/dashboard/synthese",
    target: "synthese-sankey",
    kicker: "7 · La synthèse en un Sankey",
    title: "Tous les flux d'anomalies, par cloison et par gravité",
    body: "Le Sankey regroupe les constats de chaque cloison vers leur niveau de gravité. Ce qui mérite attention saute aux yeux immédiatement.",
    duration: 8500,
    placement: "top",
    simulatedAction: simulateSankeyHover,
    callout: {
      title: "Constats du dossier",
      value: COUNTS_LINE,
      note: "cliquer un flux filtre le journal",
      countUp: true,
    },
  },
  {
    // TEMPS 7 · t≈81 s — verdict plein écran
    id: "verdict",
    route: "/dashboard/synthese",
    kicker: "8 · Le verdict",
    title: "Moins de 2 minutes, et le dossier est structuré",
    body: `PROBANT a ingéré un FEC, croisé ${RAPPRO_SILO_COUNT} cycles de rapprochement, scoré ${TOUR_CYCLE_COUNT} cycles de risque et sourcé ${COUNTS.totalFindings} constats. L'auditeur garde la main sur chaque jugement.`,
    duration: 11000,
    placement: "center",
  },
];

export const TOUR_TOTAL_STEPS = TOUR_STEPS.length;

/** Étape de lancement (route + index 0). */
export const TOUR_ENTRY_ROUTE = TOUR_STEPS[0].route;

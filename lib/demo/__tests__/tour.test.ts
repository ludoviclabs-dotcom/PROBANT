import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { DEMO_DOSSIER_CONTEXT } from "@/lib/dossier/repositories";
import {
  TOUR_CHAPTERS,
  TOUR_FACTS,
  TOUR_REGISTERS,
  TOUR_STEPS,
  TOUR_THREAD,
  TOUR_VERDICT_METRICS,
  chapterIndexOf,
  estimatedTourMs,
  firstStepOfChapter,
} from "@/lib/demo/tour";
import { TOUR_DOSSIER_PARAMS, TOUR_DURATION_LABEL, TOUR_ENTRY_ROUTE, tourExitHref, tourHref } from "@/lib/demo/tour-entry";

/**
 * Script de la visite guidée. Les attendus chiffrés sont établis indépendamment du script : valeurs lues à
 * l'écran sur DEMO SA (ruban de contexte, Synthèse, cloisons), arithmétique refaite à la main, et non par un
 * second appel aux fonctions que le script utilise. Les espaces insécables de fr-FR sont normalisés.
 */

const norm = (s: string) => s.replace(/[  ]/g, " ");

/** Texte de tous les composants : chaque ancre citée par le script doit y exister. */
function sources(dir: string): string[] {
  const out: string[] = [];
  // Dirent : le type vient de la lecture du dossier, sans second appel sur le fichier entre la vérification et la lecture.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...sources(p));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) out.push(readFileSync(p, "utf8"));
  }
  return out;
}
const ROOT = process.cwd();
const COMPONENT_SOURCES = [...sources(path.join(ROOT, "components")), ...sources(path.join(ROOT, "app"))].join("\n");

function anchorExists(key: string): boolean {
  const k = key.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp(`(data-tour|tourId)=\\{?[^\\n]*["']${k}["']`).test(COMPONENT_SOURCES);
}

describe("visite guidée — entrée", () => {
  it("la route d'entrée et l'identité du dossier démo sont des miroirs exacts", () => {
    expect(TOUR_ENTRY_ROUTE).toBe(TOUR_STEPS[0].route);
    expect(TOUR_DOSSIER_PARAMS.dossier).toBe(DEMO_DOSSIER.id);
    expect(TOUR_DOSSIER_PARAMS.organization).toBe(DEMO_DOSSIER_CONTEXT.organizationId);
    expect(DEMO_DOSSIER_CONTEXT.dossierId).toBe(DEMO_DOSSIER.id);
  });

  it("chaque lien de visite épingle le dossier démo ; la sortie le garde sans paramètres de visite", () => {
    expect(tourHref("/dashboard/synthese", 3)).toBe("/dashboard/synthese?guide=1&etape=3&dossier=demo-sa-2024&organization=demo");
    expect(tourExitHref("/dashboard/depot")).toBe("/dashboard/depot?dossier=demo-sa-2024&organization=demo");
  });

  it("la durée annoncée arrondit l'estimation du script et reste sous 2 min 30", () => {
    const ms = estimatedTourMs();
    expect(`${Math.round(ms / 60000)} min`).toBe(TOUR_DURATION_LABEL);
    expect(ms).toBeLessThan(150_000);
  });
});

describe("visite guidée — séquençage", () => {
  it("ouverture d'abord, conclusion en dernier, cinq chapitres dans l'ordre, chacun non vide", () => {
    expect(TOUR_STEPS[0].scene).toBe("opening");
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].scene).toBe("finale");
    expect(TOUR_CHAPTERS.map((c) => c.numeral)).toEqual(["I", "II", "III", "IV", "V"]);
    const order = TOUR_STEPS.map(chapterIndexOf);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const c of TOUR_CHAPTERS) {
      const first = firstStepOfChapter(c.id);
      expect(first, c.id).toBeGreaterThan(0);
      expect(TOUR_STEPS[first].chapter).toBe(c.id);
    }
  });

  it("toute étape de chapitre vise une ancre qui existe dans le code, avec un libellé de cadre", () => {
    for (const step of TOUR_STEPS.filter((s) => !s.scene)) {
      expect(step.chapter, step.id).toBeTruthy();
      expect(step.label, step.id).toBeTruthy();
      expect(step.target, step.id).toBeTruthy();
      expect(anchorExists(step.target!), `ancre « ${step.target} » (${step.id})`).toBe(true);
      for (const extra of step.with ?? []) expect(anchorExists(extra), `ancre « ${extra} » (${step.id})`).toBe(true);
      if (step.effects?.pulseTarget) expect(anchorExists(step.effects.pulseTarget), step.effects.pulseTarget).toBe(true);
    }
    // Ancres lues ou cliquées par les actions du script.
    for (const key of ["synthese-signal", "synthese-filtre", "synthese-exposition", "risk-readouts", "cloison-rappro", "review-panel", "seuil-simulator", "risk-node-immo"]) {
      expect(anchorExists(key), key).toBe(true);
    }
    for (const marker of ['data-tour-action="filter-clear"', 'data-tour-read="excluded"', 'data-tour-read="value"', 'data-tour-read="filter"', "data-tour-count=", 'data-tour-action="simulate"', 'data-tour-action="reset"']) {
      expect(COMPONENT_SOURCES.includes(marker), marker).toBe(true);
    }
  });

  it("les onglets demandés existent dans la cartographie", () => {
    const risk = readFileSync(path.join(ROOT, "components/probant/risk/RiskMappingView.tsx"), "utf8");
    expect(risk).toContain("data-tour-tab=");
    for (const tab of new Set(TOUR_STEPS.map((s) => s.tab).filter(Boolean))) expect(risk).toContain(`"${tab}"`);
  });

  it("un moment « À vous » laisse le temps d'agir avant le geste automatique, puis de voir l'effet", () => {
    const interactive = TOUR_STEPS.filter((s) => s.interaction);
    expect(interactive.map((s) => s.id)).toEqual(["sankey", "cloison"]);
    for (const s of interactive) {
      expect(s.interaction!.autoAfterMs).toBeGreaterThanOrEqual(3000);
      expect(s.interaction!.autoAfterMs + 700 + s.interaction!.holdAfterMs).toBeLessThanOrEqual(s.duration);
    }
  });

  it("le fil de preuve a au moins un maillon par chapitre, dans l'ordre du parcours", () => {
    expect(new Set(TOUR_THREAD.map((t) => t.chapter))).toEqual(new Set(TOUR_CHAPTERS.map((c) => c.id)));
    const idx = TOUR_THREAD.map((t) => t.stepIndex);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

describe("visite guidée — chiffres du dossier démo", () => {
  it("reprend les valeurs affichées par l'application sur DEMO SA", () => {
    // Ruban de contexte et dépôt : empreinte et identité.
    expect(TOUR_FACTS.fingerprint).toBe("3863478135b7");
    expect(TOUR_FACTS.societe).toBe("DEMO SA");
    expect(TOUR_FACTS.exercice).toBe("2024");
    // Synthèse : 43 constats, 2 bloquants, 19 majeurs ; 1 alerte d'admissibilité.
    expect(TOUR_FACTS.findings).toBe(43);
    expect(TOUR_FACTS.blocking).toBe(2);
    expect(TOUR_FACTS.major).toBe(19);
    expect(TOUR_FACTS.blockingAdmissibility).toBe(1);
    expect(TOUR_FACTS.rapprochements).toBe(8);
    expect(TOUR_FACTS.edition).toBe("éd. 3");
  });

  it("le seuil est CA × 0,5 % : 6 340 000 € × 0,005 = 31 700 €", () => {
    expect(6_340_000 * 0.005).toBe(31_700);
    expect(norm(TOUR_FACTS.seuil)).toBe("31 700 €");
    expect(TOUR_FACTS.seuilTaux).toBe("0,5");
  });

  it("l'écart du silo vitrine est la différence des deux soldes affichés (103 850 − 94 350)", () => {
    const rows = DEMO_DOSSIER.silos.find((s) => s.siloId === "rapprochement-clients")!.statement.rows;
    const value = (id: string) => rows.find((r) => r.id === id)!.valeur;
    expect(value("rappro-source")).toBe(103_850);
    expect(value("rappro-cible")).toBe(94_350);
    expect(value("rappro-ecart")).toBe(103_850 - 94_350);
    const token = TOUR_STEPS.find((s) => s.id === "cloison")!.token!;
    expect(norm(token.value)).toBe("9 500 €");
  });

  it("les trois registres de l'ouverture partitionnent les constats", () => {
    expect(TOUR_REGISTERS.map((r) => [r.family, r.count])).toEqual([
      ["hardLaw", 11],
      ["methodology", 28],
      ["internal", 4],
    ]);
    expect(TOUR_REGISTERS.reduce((sum, r) => sum + r.count, 0)).toBe(TOUR_FACTS.findings);
  });

  it("les mesures de conclusion sont celles du dossier", () => {
    expect(TOUR_VERDICT_METRICS.map((m) => [m.id, m.target])).toEqual([
      ["cycles", 35],
      ["constats", 43],
      ["rappros", 8],
    ]);
  });
});

describe("visite guidée — exactitude du discours", () => {
  const texts = TOUR_STEPS.flatMap((s) => [s.title, s.body, s.enClair ?? "", s.callout?.title ?? "", s.callout?.value ?? "", s.callout?.note ?? "", s.interaction?.prompt ?? "", s.interaction?.done ?? ""]);

  it("le taux de matérialité est présenté comme un paramètre interne, jamais comme une exigence d'ISA 320", () => {
    for (const t of texts) expect(/0,5\s*%/.test(t) && /ISA\s*320/.test(t), t).toBe(false);
    const note = TOUR_STEPS.find((s) => s.id === "simulateur")!.callout!.note!;
    expect(note).toContain("paramètre interne");
  });

  it("aucune promesse de durée ni de conclusion automatique", () => {
    for (const t of texts) {
      expect(t).not.toMatch(/moins de \d+ minutes/i);
      expect(t).not.toMatch(/certifi|conforme/i);
    }
    expect(TOUR_STEPS.at(-1)!.body).toMatch(/décision reste à l’auditeur/);
  });

  it("le titre de la cartographie compte les fiches, pas des cycles « scorés »", () => {
    const step = TOUR_STEPS.find((s) => s.id === "matrice")!;
    expect(step.title).toBe("35 fiches cycles, quatre axes de lecture");
    expect(step.body).toMatch(/non évalué/);
  });
});

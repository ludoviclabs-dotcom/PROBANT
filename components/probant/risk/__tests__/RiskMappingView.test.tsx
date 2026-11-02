// @vitest-environment jsdom
/**
 * Cartographie des risques (charte « instruments ») rendue sur le VRAI dossier de démonstration DEMO SA et les VRAIES
 * fiches cycles : les attendus sont relus dans les scores du moteur (`buildCycleScores`) ou posés depuis la légende
 * (plages entières des bandes), jamais recopiés d'une capture.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboard/risques",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/analytics/track", () => ({ track: vi.fn() }));

import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import type { DossierSnapshot } from "@/lib/dossier/types";

const snapshot: DossierSnapshot = buildDemoDossierSnapshot();

vi.mock("@/lib/dossier/client", () => ({
  useActiveDossierSnapshot: () => snapshot,
  useOptionalActiveDossier: () => null,
}));

// Ajustements : état local (l'API simulée n'existe pas en test) ; la logique de fusion reste celle du moteur.
vi.mock("../useRiskAdjustments", async () => {
  const engine = await vi.importActual<typeof import("@/lib/risk-mapping")>("@/lib/risk-mapping");
  return {
    useRiskAdjustments: () => {
      const [adjustments, setAdjustments] = useState<import("@/lib/risk-mapping").RiskAdjustmentMap>({});
      return {
        adjustments,
        setAdjustment: (slug: string, patch: import("@/lib/risk-mapping").AdjustmentPatch) =>
          setAdjustments((m) => engine.mergeAdjustment(m, slug, patch, "2026-10-30T00:00:00.000Z")),
        resetCycle: (slug: string) =>
          setAdjustments((m) => Object.fromEntries(Object.entries(m).filter(([key]) => key !== slug))),
        resetAll: () => setAdjustments({}),
        saveStatus: "idle" as const,
      };
    },
  };
});

import { loadAllCycles } from "@/lib/audit-cycles/loader";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import { computeMateriality } from "@/lib/audit/materiality";
import { buildCycleScores, criticityBand } from "@/lib/risk-mapping";
import { BAND_LABEL, BAND_RANGE } from "@/lib/risk-mapping/view";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { RiskMappingView } from "../RiskMappingView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let cycles: AuditCycle[] = [];

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  cycles = await loadAllCycles();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function engineScores() {
  const exposure = projectSnapshotExposure(snapshot).exposure;
  const materiality = computeMateriality(snapshot.calculationContext.materialityBasis ?? { chiffreAffaires: 0 });
  return buildCycleScores(cycles, snapshot.findings, materiality, {}, exposure);
}

const COMPOSITE = /^Score composite : (\d+) sur 100, cycle (.+), niveau (.+)$/;

function compositeCells() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-tour="risk-matrix"] [aria-label^="Score composite"]'));
}

describe("Cartographie des risques — page", () => {
  it("porte le titre dans l'ambiance instruments et des relevés lus dans le moteur", () => {
    render(<RiskMappingView cycles={cycles} />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Cartographie des risques" });
    expect(h1.closest('[data-ambiance="instruments"]')).not.toBeNull();
    const scores = engineScores();
    const unevaluated = scores.filter((s) => s.criticityBand === "non_évalué").length;
    const evaluated = scores.filter((s) => s.findingCount > 0).length;
    const readouts = h1.closest("header")!;
    expect(readouts.textContent).toContain(`Cycles évalués${evaluated} · ${unevaluated} non évalué`);
    expect(readouts.textContent).toContain(`Constats${snapshot.findings.length}`);
    expect(readouts.textContent).toContain("comparés (dépôt limité)");
    expect(readouts.textContent).toMatch(/heuristique interne d'aide à la décision, jamais opposable/);
  });

  it("chaque composite affiché tombe dans la plage de son niveau (légende 0-24 / 25-54 / 55-74 / 75-100)", () => {
    render(<RiskMappingView cycles={cycles} />);
    const cells = compositeCells();
    const scored = cells.map((c) => COMPOSITE.exec(c.getAttribute("aria-label") ?? "")).filter((m): m is RegExpExecArray => m !== null);
    expect(scored.length).toBe(engineScores().filter((s) => s.composite !== null).length);
    for (const [, value, slug, level] of scored) {
      const band = (Object.keys(BAND_RANGE) as (keyof typeof BAND_RANGE)[]).find((b) => BAND_LABEL[b] === level)!;
      expect(band, slug).toBeDefined();
      const n = Number(value);
      expect(n, slug).toBeGreaterThanOrEqual(BAND_RANGE[band].min);
      expect(n, slug).toBeLessThanOrEqual(BAND_RANGE[band].max);
    }
  });

  it("affiche la partie entière du composite brut et le niveau du moteur (cas proche d'une borne)", () => {
    render(<RiskMappingView cycles={cycles} />);
    for (const score of engineScores().filter((s) => s.composite !== null)) {
      const cell = compositeCells().find((c) => c.getAttribute("aria-label")?.includes(`cycle ${score.cycleSlug},`))!;
      const expected = `Score composite : ${Math.floor(score.composite!)} sur 100, cycle ${score.cycleSlug}, niveau ${BAND_LABEL[criticityBand(score.composite)]}`;
      expect(cell.getAttribute("aria-label")).toBe(expected);
    }
  });

  it("une ligne sans composite est « non évalué », jamais présentée comme un risque faible ou maîtrisé", () => {
    render(<RiskMappingView cycles={cycles} />);
    const unevaluated = engineScores().filter((s) => s.composite === null);
    expect(unevaluated.length).toBeGreaterThan(0);
    for (const score of unevaluated) {
      const row = screen.getByTitle(score.cycleSlug, { exact: true }).closest("tr")!;
      expect(row.textContent).toMatch(/jamais assimilé à un risque maîtrisé/);
      expect(row.textContent).toContain("Non évalué");
      expect(row.textContent).not.toContain("Faible");
    }
  });

  it("le nom complet de chaque cycle est lisible dans le registre (jamais tronqué en une lettre)", () => {
    render(<RiskMappingView cycles={cycles} />);
    for (const cycle of cycles) {
      expect(screen.getByTitle(cycle.slug, { exact: true }).textContent).toBe(cycle.slug);
    }
  });

  it("un niveau de la répartition filtre le registre ; un second clic l'annule", () => {
    render(<RiskMappingView cycles={cycles} />);
    const expected = engineScores().filter((s) => s.criticityBand === "modéré").length;
    const total = cycles.length;
    const level = screen.getAllByRole("button", { pressed: false }).find((b) => /^Modéré\s*25-54/.test(b.textContent ?? ""))!;
    fireEvent.click(level);
    expect(level.getAttribute("aria-pressed")).toBe("true");
    expect(compositeCells()).toHaveLength(expected);
    expect(screen.getByText(`${expected} / ${total} affichés`)).toBeTruthy();
    fireEvent.click(level);
    expect(compositeCells()).toHaveLength(total);
  });

  it("le tri par en-tête expose aria-sort et suit décroissant → croissant → aucun", () => {
    render(<RiskMappingView cycles={cycles} />);
    const header = screen.getByRole("columnheader", { name: /Composite/ });
    expect(header.getAttribute("aria-sort")).toBe("descending");
    const button = within(header).getByRole("button");
    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(button);
    expect(header.getAttribute("aria-sort")).toBe("none");
  });

  it("le détail s'ouvre sur la ligne, prend le focus, et Échap le ferme en rendant le focus à la ligne", () => {
    render(<RiskMappingView cycles={cycles} />);
    const row = screen.getByTitle("provisions-risques-charges", { exact: true });
    fireEvent.click(row);
    const cycle = cycles.find((c) => c.slug === "provisions-risques-charges")!;
    const title = screen.getByRole("heading", { level: 2, name: cycle.title });
    expect(document.activeElement).toBe(title);
    const panel = title.closest("aside")!;
    expect(within(panel).getByText(/Constats rattachés \(\d+\)/)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Fiche normative du cycle" })).toBeTruthy();
    fireEvent.keyDown(title, { key: "Escape" });
    expect(screen.queryByRole("heading", { level: 2, name: cycle.title })).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("l'ajustement de jugement exige un commentaire avant d'être appliqué", () => {
    render(<RiskMappingView cycles={cycles} />);
    fireEvent.click(screen.getByTitle("provisions-risques-charges", { exact: true }));
    const panel = document.querySelector("aside")!;
    fireEvent.click(within(panel).getByRole("button", { name: "Augmenter l'ajustement de probabilité d'un cran" }));
    expect(within(panel).getByRole("alert").textContent).toMatch(/commentaire est requis/);
    const stepper = within(panel).getByRole("group", { name: /probabilité/ });
    expect(within(stepper).getByText("0")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("Commentaire de jugement"), { target: { value: "Historique de litiges." } });
    expect(within(stepper).getByText("+1")).toBeTruthy();
    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("un exercice simulé affiche l'avis et la colonne Δ avec un mot, jamais la seule couleur", () => {
    render(<RiskMappingView cycles={cycles} />);
    fireEvent.change(screen.getByLabelText("Exercice"), { target: { value: "2022" } });
    expect(screen.getByText("Données 2022 SIMULÉES")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Δ vs 2022" })).toBeTruthy();
    const words = Array.from(document.querySelectorAll("tbody td[title^='Vs exercice 2022']")).map((td) => td.textContent ?? "");
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(w).toMatch(/(hausse|baisse|stable|non comparable)$/);
  });

  it("vue Flux : chaque nœud est un bouton nommé ; Entrée ouvre le détail du cycle", () => {
    render(<RiskMappingView cycles={cycles} />);
    fireEvent.click(screen.getByRole("tab", { name: "flux" }));
    const graph = document.querySelector('[data-tour="risk-flow-graph"]')!;
    const nodes = within(graph as HTMLElement).getAllByRole("button");
    expect(nodes.length).toBe(cycles.length);
    const immo = nodes.find((n) => n.getAttribute("aria-label")?.startsWith("immobilisations-corporelles,"))!;
    expect(immo.getAttribute("tabindex")).toBe("0");
    expect(immo.getAttribute("data-tour")).toBe("risk-node-immo");
    act(() => {
      fireEvent.keyDown(immo, { key: "Enter" });
    });
    const cycle = cycles.find((c) => c.slug === "immobilisations-corporelles")!;
    expect(screen.getByRole("heading", { level: 2, name: cycle.title })).toBeTruthy();
  });

  it("vue Bulles : les cycles non évalués sont exclus et chaque bulle est un bouton nommé", () => {
    render(<RiskMappingView cycles={cycles} />);
    fireEvent.click(screen.getByRole("tab", { name: "bulles" }));
    const evaluated = engineScores().filter((s) => s.composite !== null).length;
    const region = screen.getByRole("region", { name: /Nuage probabilité/ });
    const bubbles = within(region).getAllByRole("button");
    expect(bubbles).toHaveLength(evaluated);
    expect(bubbles[0].getAttribute("aria-label")).toMatch(/niveau .+, composite \d+ sur 100/);
  });

  it("garde les ancres de la visite guidée", () => {
    render(<RiskMappingView cycles={cycles} />);
    for (const tab of ["matrix", "flow", "bubble", "temporal"]) expect(document.querySelector(`[data-tour-tab="${tab}"]`)).not.toBeNull();
    const sim = document.querySelector('[data-tour="seuil-simulator"]')!;
    const toggle = sim.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(sim.querySelector('input[type="range"]')).not.toBeNull();
    expect(sim.querySelector('[data-tour-action="simulate"]')).not.toBeNull();
    expect(sim.querySelector('[data-tour-action="reset"]')).not.toBeNull();
  });
});

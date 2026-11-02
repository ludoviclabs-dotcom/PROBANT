// @vitest-environment jsdom
/**
 * Revue par cloison, passage à la charte (30/10/2026) — comportements ajoutés ou corrigés :
 *  - « Plan des cloisons » : une case par silo dans l'ordre des états ; la case ouvre et désigne son silo ;
 *  - l'annotation d'une ligne signalée est une note rattachée au constat (plus d'étiquette posée sur les montants) ;
 *  - « Joindre un justificatif » n'a pas d'action : visible, désactivé, expliqué ;
 *  - l'explication métier n'est plus répétée sous « Recommandation » ;
 *  - mode FEC direct : l'échec de lecture du grand livre paginé est affiché.
 * Attendus tirés du dossier démo (lib/demo/dataset.ts) : silo Provisions bloquant, effet Résultat − 145 000 € ;
 * immobilisations incorporelles, ligne 203 annotée « 85 000 € activés — critères PCG non démontrés ».
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// `next/font/google` est résolu à la compilation par Next (police de la charte, InstrumentPage) : neutralisé en test.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboard/cloisons",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
const active = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/dossier/client", () => ({
  useActiveDossier: () => active.value,
  useActiveDossierSnapshot: () => (active.value as { snapshot: unknown }).snapshot,
  useOptionalActiveDossier: () => null,
}));

import type { DossierSnapshot } from "@/lib/dossier/types";
import { buildDemoDossierSnapshot, buildSnapshotFromFecDepot } from "@/lib/dossier/snapshot-builder";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { CloisonsWorkspace } from "../CloisonsWorkspace";
import { CloisonsViewLive } from "../CloisonsViewLive";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDemo(horsCloison = 1) {
  const snapshot = buildDemoDossierSnapshot();
  const d = snapshot.dossier;
  return render(
    <CloisonsWorkspace
      silos={d.silos}
      meta={{ label: d.societe.raisonSociale, exercice: d.societe.exercice, referentiel: d.referentielVersion, siren: d.societe.siren, sourceKind: snapshot.sourceKind }}
      exposure={projectSnapshotExposure(snapshot).exposure}
      horsCloison={horsCloison}
    />,
  );
}

describe("plan des cloisons", () => {
  it("une case par silo, gravité en mot, effet chiffré ou « non chiffré », jamais un zéro inventé", () => {
    renderDemo();
    const plan = screen.getByRole("region", { name: "Plan des cloisons" });
    expect(within(plan).getAllByRole("link")).toHaveLength(28);
    const provisions = within(plan).getByRole("link", { name: /Provisions pour risques et charges/ });
    expect(provisions.textContent).toMatch(/bloquant · 1 constat · Résultat − 145\s000 €/);
    expect(within(plan).getByRole("link", { name: /^Immobilisations incorporelles/ }).textContent).toMatch(/majeur · 1 constat · non chiffré$/);
    // Mesure en % (taux d'amortissement) : ni montant, ni « non chiffré », ni « 0 € ».
    const corporelles = within(plan).getByRole("link", { name: /^Immobilisations corporelles/ }).textContent ?? "";
    expect(corporelles).toMatch(/majeur · 1 constat$/);
    expect(corporelles).not.toMatch(/0 €/);
  });

  it("une case ouvre son silo replié et y place le focus", () => {
    renderDemo();
    const row = document.querySelector<HTMLButtonElement>('button[data-silo-row="provisions"]')!;
    expect(row.getAttribute("aria-expanded")).toBe("false");
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      fireEvent.click(within(screen.getByRole("region", { name: "Plan des cloisons" })).getByRole("link", { name: /Provisions pour risques et charges/ }));
      expect(row.getAttribute("aria-expanded")).toBe("true");
      act(() => { vi.advanceTimersToNextFrame(); });
      expect(document.activeElement).toBe(row);
    } finally {
      vi.useRealTimers();
    }
  });

  it("le constat d'admissibilité hors cloison n'est annoncé que s'il existe", () => {
    const { unmount } = renderDemo(1);
    expect(document.body.textContent).toContain("+ 1 constat d'admissibilité du FEC, hors cloison");
    unmount();
    renderDemo(0);
    expect(document.body.textContent).not.toContain("hors cloison");
  });
});

describe("silo ouvert et panneau de revue", () => {
  it("l'annotation de la ligne signalée est une note du constat ; aucune étiquette flottante", () => {
    renderDemo();
    const card = screen.getByText("Frais de développement activés sans conditions démontrées").closest("li")!;
    expect(card.textContent).toContain("Ligne 203 · 85 000 € activés — critères PCG non démontrés");
    expect(document.querySelector("[data-tour-anno]")).toBeNull();
    // Le montant de la ligne au-dessus reste une cellule de la reconstruction, non recouverte.
    const logiciels = [...document.querySelectorAll("tr")].find((tr) => tr.textContent?.includes("Logiciels"))!;
    expect(logiciels.textContent).toContain("40 000 €");
    // Ancres de la visite guidée toujours présentes.
    expect(document.querySelector('[data-tour="bezier-link"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="cloison-rappro"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="cloison-constat"]')).not.toBeNull();
  });

  it("« Joindre un justificatif » : visible, désactivé et expliqué ; l'explication métier n'est pas répétée", () => {
    renderDemo();
    fireEvent.click(screen.getAllByRole("button", { name: "Analyser" })[0]);
    const dialog = screen.getByRole("dialog");
    const joindre = within(dialog).getByRole("button", { name: "Joindre un justificatif" });
    expect(joindre.getAttribute("aria-disabled")).toBe("true");
    const note = document.getElementById(joindre.getAttribute("aria-describedby")!);
    expect(note?.textContent).toMatch(/Indisponible ici/);
    fireEvent.click(joindre);
    expect(within(dialog).getByText(/Statut actuel : en attente\./)).toBeTruthy();

    const explication = "L'activation des frais de développement est conditionnée à la démonstration de critères stricts.";
    expect(dialog.textContent!.split(explication)).toHaveLength(2);
    expect(dialog.textContent).not.toContain("Recommandation");
  });

  it("décisions locales inchangées : cliquer la décision active l'annule", () => {
    renderDemo();
    fireEvent.click(screen.getAllByRole("button", { name: "Analyser" })[0]);
    const dialog = screen.getByRole("dialog");
    const valider = within(dialog).getByRole("button", { name: "Valider" });
    fireEvent.click(valider);
    expect(valider.getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog).getByText(/Statut actuel : validé\./)).toBeTruthy();
    fireEvent.click(valider);
    expect(valider.getAttribute("aria-pressed")).toBe("false");
    expect(within(dialog).getByText(/Statut actuel : en attente\./)).toBeTruthy();
  });
});

describe("mode FEC direct", () => {
  it("l'échec de lecture du grand livre paginé est affiché, pas seulement mémorisé", async () => {
    const base = buildSnapshotFromFecDepot({
      dossierId: "legacy-2024",
      nomFichier: "grand-livre-2024.txt",
      fingerprint: "fixture-fingerprint",
      siren: "552100554",
      referentielVersion: "fec-2026.1",
      admissibilite: [],
      analyse: [],
      entries: [],
      entriesTruncated: false,
      totalEntryCount: 0,
      generatedAt: "2026-10-14T10:00:00.000Z",
    });
    const snapshot: DossierSnapshot = {
      ...base,
      sourceKind: "persistent",
      sourceDocuments: [{ id: "src-1", dossierId: "legacy-2024", fileName: "grand-livre-2024.txt", documentType: "fec", fingerprint: "f".repeat(64), lineCount: 12, createdAt: "2026-10-14T10:00:00.000Z" }],
    };
    active.value = { context: { dossierId: "legacy-2024" }, snapshot };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("indisponible", { status: 503 })));
    render(<CloisonsViewLive />);
    expect(await screen.findByText("Grand livre indisponible.")).toBeTruthy();
    expect(screen.getByText("Aucun constat analytique")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SCENARIO_MAP } from "@/lib/demo/scenarios";
import { SimulationPanel } from "../SimulationPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

// HOLDING-CP-1 garde la gravité « bloquant » : sa puce doit s'afficher comme la puce bloquante
// voisine (rouge #ef4444, icône d'alerte), pas comme une puce neutre grise.
it("HOLDING : la puce capitaux propres s'affiche bloquante, comme la dépréciation de participation", () => {
  render(<SimulationPanel scenarios={[SCENARIO_MAP["holding-invest"]]} />);
  for (const label of ["Capitaux propres sous la moitié du capital — à examiner (bloquant)", "Dépréciation participation (bloquant)"]) {
    const chip = screen.getByText(label);
    expect(chip.style.color).toBe("rgb(239, 68, 68)");
    expect(chip.querySelector("svg")).not.toBeNull();
  }
  const neutral = screen.getByText("Hors-bilan non déclaré");
  expect(neutral.querySelector("svg")).toBeNull();
});

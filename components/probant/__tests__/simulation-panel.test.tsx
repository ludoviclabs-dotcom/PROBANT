// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SEVERITY_GLYPH } from "@/components/charte/severity";
import { SCENARIO_MAP } from "@/lib/demo/scenarios";
import { SimulationPanel } from "../SimulationPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

// HOLDING-CP-1 garde la gravité « bloquant » : son risque dominant doit s'afficher comme le risque bloquant
// voisin. Charte « instruments » : la gravité est portée par le glyphe dessiné (carré plein = bloquant) et le mot
// du libellé, jamais par une teinte codée en dur.
it("HOLDING : le risque capitaux propres porte le glyphe bloquant, comme la dépréciation de participation", () => {
  render(<SimulationPanel scenarios={[SCENARIO_MAP["holding-invest"]]} />);
  for (const label of ["Capitaux propres sous la moitié du capital — à examiner (bloquant)", "Dépréciation participation (bloquant)"]) {
    const item = screen.getByText(label).closest("li")!;
    const glyph = item.querySelector("svg path");
    expect(glyph?.getAttribute("d")).toBe(SEVERITY_GLYPH.bloquant.path);
    expect(item.getAttribute("style")).toBeNull();
  }
  const neutral = screen.getByText("Hors-bilan non déclaré").closest("li")!;
  expect(neutral.querySelector("svg")).toBeNull();
});

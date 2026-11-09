// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadVeilleReport } from "@/lib/audit-cycles/loader";
import { VeilleExplorer } from "../VeilleExplorer";

afterEach(cleanup);
beforeEach(() => {
  // Le panneau empilé est amené à l'écran dans un requestAnimationFrame ; jsdom n'implémente pas scrollIntoView.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * Régression (revue Codex, PR #108) : un « : » non quoté dans `data/veille/veille.yml` faisait d'un texte un objet, et
 * choisir cette évolution plantait le panneau de détail (« Objects are not valid as a React child »). Ce test ouvre
 * chacune des évolutions RÉELLES de la veille et vérifie que son panneau s'affiche avec ses limites en texte.
 */
describe("VeilleExplorer — veille réelle du dépôt", () => {
  it("ouvre chaque évolution sans erreur et affiche son titre et ses limites", async () => {
    const report = (await loadVeilleReport())!;
    expect(report.evolutions.length).toBeGreaterThan(0);
    render(<VeilleExplorer evolutions={report.evolutions} arreteAu={report.arreteAu} />);
    const list = screen.getByRole("list", { name: "Évolutions normatives, par date d'effet" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(report.evolutions.length);

    for (const [index, evolution] of report.evolutions.entries()) {
      fireEvent.click(buttons[index]);
      const panel = screen.getByRole("complementary", { name: "Détail de l'évolution" });
      expect(within(panel).getByRole("heading", { level: 3 }).textContent, evolution.id).toBe(evolution.title);
      for (const limit of evolution.limits) {
        expect(typeof limit, `${evolution.id} : limite non textuelle`).toBe("string");
        expect(panel.textContent, evolution.id).toContain(limit);
      }
    }
  });
});

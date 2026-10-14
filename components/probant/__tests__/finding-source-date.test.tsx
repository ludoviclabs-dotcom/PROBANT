// @vitest-environment jsdom
/**
 * Un constat d'exécution (« Règle X non exécutée ») ne cite aucun texte : sa date
 * d'effet est vide et les panneaux n'affichent pas de « v. » orphelin ni
 * l'identifiant du registre à la place d'une date.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Finding } from "@/lib/canonical-model";
import { FindingDrawer } from "@/components/viewer/FindingDrawer";
import { FindingPanel } from "../FindingPanel";

afterEach(cleanup);

function finding(effectiveDate: string): Finding {
  return {
    id: "R-TEST#error",
    family: "internal",
    severity: "informatif",
    controlStage: "accounting_review",
    ruleId: "R-TEST",
    ruleVersion: "1.0.0",
    cloison: "journaux",
    siloId: "journaux",
    titre: "Règle R-TEST non exécutée",
    constat: "La règle a rencontré une erreur d'exécution.",
    explication: "panne simulée",
    mesure: { constate: 0, seuil: 0, unite: "ratio", libelle: "n/a" },
    source: { ref: "R-TEST", citation: "—", effectiveDate },
    comptesConcernes: [],
    lignesSource: [],
    faisceau: [],
    preuve: [],
    statutRevue: "en_attente",
  };
}

it.each([
  ["FindingPanel", (f: Finding) => <FindingPanel finding={f} />],
  ["FindingDrawer", (f: Finding) => <FindingDrawer finding={f} onClose={() => {}} />],
])("%s : date d'effet affichée seulement quand un texte est cité", (_name, view) => {
  const { container, unmount } = render(view(finding("")));
  expect(container.textContent).toContain("R-TEST");
  expect(container.textContent).not.toMatch(/v\./);
  unmount();

  const cited = render(view(finding("2026-01-01")));
  expect(cited.container.textContent).toContain("v.2026-01-01");
});

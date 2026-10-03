// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { buildRapprochementDepuisDepot } from "@/lib/rapprochement/build-from-upload";
import { addRapprochementToSnapshot, buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import type { DocumentSource } from "@/lib/rapprochement/types";
import type { UploadQualification } from "@/lib/rapprochement/upload-contract";
import { RapprochementResult } from "../CycleUploadPanel";

afterEach(cleanup);
const q: UploadQualification = { entity: "RECETTE", period: { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-01-31", currency: "EUR", validation: "confirmed" }, comparisonBasisConfirmed: true, technicalToleranceEur: 0, selection: "all_imported_rows", materialityAmount: null };
function run(qualification = q) {
  const source: DocumentSource = { id: "A", label: "A", type: "balance_auxiliaire", format: "csv", lignes: [{ tiers: "K", montant: 100, sourceLine: 2 }, { tiers: "K", montant: -100, sourceLine: 3 }] };
  const target: DocumentSource = { ...source, id: "B", lignes: [{ tiers: "K", montant: 0, sourceLine: 2 }] };
  return addRapprochementToSnapshot(buildDemoDossierSnapshot(), { cycleId: "clients", qualification, silo: buildRapprochementDepuisDepot("clients", source, target), documents: [{ id: "A", fileName: "source.csv", fingerprint: "a".repeat(64), lineCount: 2 }, { id: "B", fileName: "controle.csv", fingerprint: "b".repeat(64), lineCount: 1 }] }).uploadExecutions![0];
}
it("affiche l’écart brut et l’ambiguïté malgré l’égalité nette ; le bouton ouvre les sources exactes", () => {
  const view = render(<RapprochementResult run={run()} />);
  const values = view.container.querySelectorAll("dd");
  expect(values[2].textContent).toBe("0,00 €");
  expect(values[3].textContent).toBe("200,00 €");
  expect(view.container.textContent).toContain("Comparaison partiellement non concluante");
  expect(view.container.textContent).toContain("Signification : non évaluée (seuil absent)");
  expect(view.container.querySelector("details")?.open).toBe(false);
  fireEvent.click(view.getByRole("button", { name: "Détails K" }));
  const sources = view.getByRole("region", { name: "Sources du groupe K" });
  expect(sources.textContent).toContain("source.csv · ligne 2 · 100,00 €");
  expect(sources.textContent).toContain("source.csv · ligne 3 · -100,00 €");
  expect(sources.textContent).toContain("controle.csv · ligne 2 · 0,00 €");
  expect(sources.textContent).toContain("empreinte aaaaaaaaaaaa");
});
it("le double clic d’une ligne ouvre aussi le groupe", () => {
  const view = render(<RapprochementResult run={run()} />);
  fireEvent.doubleClick(view.getByRole("button", { name: "Détails K" }).closest("tr")!);
  expect(view.getByRole("region", { name: "Sources du groupe K" })).toBeTruthy();
});
it("le diagnostic de période absente affiche son blocage sans suggérer une conclusion", () => {
  const execution = run({ ...q, period: undefined });
  const view = render(<RapprochementResult run={execution} />);
  expect(view.container.textContent).toContain("Bloquée — diagnostic exportable, aucun contrôle concluant");
  expect(view.container.textContent).toContain("Période inconnue");
  expect(view.container.textContent).toContain("Période absente");
});

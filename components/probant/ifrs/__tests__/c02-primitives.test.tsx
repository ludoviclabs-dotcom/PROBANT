// @vitest-environment jsdom
/**
 * C02 — primitives du poste Locations IFRS 16 : sélection dans l'URL, cellules de la matrice, montants, barre d'action, cadre de graphique,
 * inspecteur en tiroir (jsdom n'implémente pas matchMedia : le composant reste en tiroir, ce qui permet d'en vérifier le clavier ;
 * la mise en page réelle est vérifiée aux trois largeurs par e2e/ifrs-c02-locations.spec.ts).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// `next/font/google` est résolu à la compilation par Next : on le neutralise en test.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});
import type { QualifiedContract } from "@/lib/ifrs/leases/qualification";
import { cellState, moneyFr } from "../format";
import { Inspector } from "../Inspector";
import { ActionBar, ChartFrame, StepRail } from "../Primitives";
import { parseSelection, selectionSearch } from "../selection-url";

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(cleanup);
const contract = (over: Partial<QualifiedContract> = {}): QualifiedContract => ({ contractId: "C1", version: "v1", assetCategory: "Locaux", lessor: "B", status: "eligible_v1", reasons: [], historical: false, notCommenced: false,
  dues: [], inputs: null, evidence: [], fingerprint: "f".repeat(64), ...over });

describe("C02 sélection dans l'URL", () => {
  it("lit et réécrit contrat, colonne et filtre ; refuse une valeur inconnue au lieu de la deviner", () => {
    expect(parseSelection("demo=1&contrat=F03&colonne=rate&filtre=a_qualifier")).toEqual({ contractId: "F03", column: "rate", filter: "a_qualifier" });
    expect(parseSelection("contrat=<script>&colonne=inconnue&filtre=tout")).toEqual({ contractId: null, column: null, filter: "all" });
    expect(parseSelection("filtre=code:X19").filter).toBe("code:X19");
    expect(selectionSearch("demo=1&contrat=OLD", { contractId: "F01", column: null, filter: "all" })).toBe("demo=1&contrat=F01");
    expect(selectionSearch("demo=1", { contractId: null, column: "rate", filter: "rate" })).toBe("demo=1&filtre=rate");
  });
});

describe("C02 cellules et montants", () => {
  it("une cellule n'est jamais une moyenne : un motif hors V1 ou à compléter la marque ; un contrat arrêté rend les colonnes suivantes non applicables", () => {
    expect(cellState(contract(), "rate")).toBe("confirmed");
    expect(cellState(contract({ status: "a_qualifier", reasons: [{ code: "X19", effect: "a_qualifier", field: "rateBasis", message: "m" }] }), "rate")).toBe("to_complete");
    expect(cellState(contract({ status: "hors_scope_v1", reasons: [{ code: "X01", effect: "hors_scope_v1", message: "m" }] }), "scope")).toBe("out_of_scope");
    expect(cellState(contract({ status: "non_location", reasons: [{ code: "R01", effect: "non_location", message: "m" }] }), "rate")).toBe("not_applicable");
    expect(cellState(contract({ status: "exemption_documentee", reasons: [{ code: "R03", effect: "exemption", message: "m" }] }), "exemption")).toBe("documented");
  });
  it("montants depuis la chaîne serveur, sans flottant : gros montants et négatifs exacts", () => {
    expect(moneyFr({ amount: "987654321987654321.99", currency: "EUR" })).toBe("987 654 321 987 654 321,99 €");
    expect(moneyFr({ amount: "-538.91", currency: "EUR" })).toBe("−538,91 €");
    expect(moneyFr(null)).toBe("—");
  });
});

describe("C02 primitives", () => {
  it("barre d'action : un refus reste visible avec son motif écrit, relié au bouton", () => {
    render(<ActionBar actions={{ freeze: { allowed: false, reason: "Enregistrer d'abord les politiques" }, execute: { allowed: true, reason: null } }} labels={{ freeze: "Figer", execute: "Calculer" }} busy={false} onAction={() => {}}/>);
    const freeze = screen.getByRole("button", { name: "Figer" });
    expect(freeze).toHaveProperty("disabled", true);
    expect(freeze.getAttribute("aria-describedby")).toBe("l16-action-freeze");
    expect(screen.getByText("Enregistrer d'abord les politiques").id).toBe("l16-action-freeze");
    expect(screen.getByRole("button", { name: "Calculer" })).toHaveProperty("disabled", false);
  });
  it("rail : l'étape courante est annoncée, un blocage dit son motif, sans pourcentage", () => {
    render(<StepRail anchors={{ adjustment: "l16-adjustment" }} steps={[{ id: "sources", label: "Sources", task: "Déposer", state: "done", reason: null, exceptions: null },
      { id: "calculation", label: "Calcul", task: "Calculer", state: "blocked", reason: "Règle à revoir", exceptions: null },
      { id: "adjustment", label: "Retraitements", task: "Cadrer", state: "current", reason: null, exceptions: 2 }]}/>);
    const link = screen.getByRole("link", { name: "Retraitements" });
    expect(link.getAttribute("href")).toBe("#l16-adjustment");
    expect(link.closest("li")!.getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("link", { name: "Calcul" })).toBeNull();
    expect(screen.getByText("Règle à revoir")).toBeTruthy();
    expect(screen.getByText("Cadrer")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%/);
  });
  it("cadre de graphique : un état vide dit pourquoi ; avec graphique et tableau, l'alternative tabulaire est accessible", () => {
    const { unmount } = render(<ChartFrame title="Dette" scope="Contrats calculés" empty="Moteur non disponible"/>);
    expect(screen.getByRole("status").textContent).toBe("Moteur non disponible");
    unmount();
    render(<ChartFrame title="Dette" scope="Contrats calculés" chart={<svg aria-label="courbe"/>} table={<table aria-label="tableau"/>}/>);
    fireEvent.click(screen.getByRole("button", { name: "Voir le tableau" }));
    expect(screen.getByRole("table", { name: "tableau" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voir le graphique" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("inspecteur en tiroir : focus sur Fermer, Tab confiné, Échap referme et rend le focus au déclencheur", () => {
    const trigger = document.createElement("button"); trigger.textContent = "F03"; document.body.appendChild(trigger); trigger.focus();
    let closed = false;
    const { unmount } = render(<Inspector title="Contrat F03" kicker="Inspecteur" docked={false} returnTo={trigger} onClose={() => { closed = true; }}><a href="#x">Pièce</a></Inspector>);
    const dialog = screen.getByRole("dialog", { name: "Inspecteur — Contrat F03" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const close = screen.getByRole("button", { name: "Fermer l'inspecteur" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Pièce" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(closed).toBe(true);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

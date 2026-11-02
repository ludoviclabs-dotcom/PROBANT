// @vitest-environment jsdom
/**
 * L16-04 — poste visuel : graphiques et tableaux équivalents, parcours clavier des mois, ligne de synthèse, table paginée.
 * Les données viennent de la vue serveur du scénario synthétique ; jsdom n'a pas ResizeObserver : les graphiques gardent leur largeur initiale.
 * La mise en page réelle est vérifiée aux trois largeurs par e2e/ifrs-c02-locations.spec.ts.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { LeasePortfolioView, PortfolioRow } from "@/lib/ifrs/leases/portfolio";
import { leaseDemoView } from "@/lib/workpapers/lease-demo";
import { dateFr, moneyFr } from "../format";
import { LeaseChartsPanel } from "../LeaseCharts";
import { PortfolioTable, SummaryLine } from "../Portfolio";

let portfolio: LeasePortfolioView;
beforeAll(async () => { const view = await leaseDemoView(); portfolio = (view.portfolio as Record<string, LeasePortfolioView | null>)[view.runs[0].id]!; });
afterEach(cleanup);

describe("L16-04 graphiques", () => {
  it("le clavier parcourt les fins de mois ; les deux graphiques et le tableau lisent le même mois et les mêmes montants", () => {
    const charts = portfolio.charts!;
    render(<LeaseChartsPanel charts={charts} empty=""/>);
    const months = screen.getAllByRole("button", { name: /^Fin janv\. 2026 :/ });
    expect(months).toHaveLength(1);
    months[0].focus();
    fireEvent.keyDown(months[0], { key: "ArrowRight" });
    const feb = charts.points[1];
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Fin févr. 2026 : dette " + moneyFr(feb.debt) + ", droit d'utilisation net " + moneyFr(feb.rouNet));
    expect(screen.getByText(/^Échéance févr\. 2026$/).closest("p")!.textContent).toContain("loyer " + moneyFr(feb.payments) + " = principal " + moneyFr(feb.principal) + " + intérêts " + moneyFr(feb.interest));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Fin déc\. 2026 :/);

    fireEvent.click(screen.getAllByRole("button", { name: "Voir le tableau" })[0]);
    const table = within(screen.getByRole("region", { name: "Soldes de fin de mois — défilement horizontal au clavier" }));
    const rows = table.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(13);
    charts.points.forEach((p, i) => expect(rows[i + 1].textContent).toBe(dateFr(p.date) + moneyFr(p.debt) + moneyFr(p.rouNet)));
    expect(rows[12].getAttribute("aria-selected")).toBe("true");
  });

  it("ponts : dette et droit d'utilisation séparés, mouvements signés, tableau égal au graphique", () => {
    const { debtBridge: d, rouBridge: r } = portfolio.charts!;
    render(<LeaseChartsPanel charts={portfolio.charts!} empty=""/>);
    expect(screen.getByRole("img", { name: /^Pont de la dette :/ }).getAttribute("aria-label")).toBe("Pont de la dette : Dette d'ouverture " + moneyFr(d.opening) + ", Entrées + " + moneyFr(d.additions)
      + ", Intérêts + " + moneyFr(d.interest) + ", Loyers payés − " + moneyFr(d.payments) + ", Dette de clôture " + moneyFr(d.closing));
    expect(screen.getByRole("img", { name: /^Pont du droit d'utilisation :/ }).getAttribute("aria-label")).toContain("Dotation − " + moneyFr(r.depreciation));
    fireEvent.click(screen.getAllByRole("button", { name: "Voir le tableau" })[3]);
    expect(within(screen.getByRole("region", { name: "Pont du droit d'utilisation — défilement horizontal au clavier" })).getByRole("row", { name: /DU net de clôture/ }).textContent).toContain(moneyFr(r.closing));
  });

  it("sans contrat calculé : le cadre dit pourquoi, sans courbe ni zéro", () => {
    render(<LeaseChartsPanel charts={null} empty="Calcul non enregistré : figer la population, puis calculer."/>);
    expect(screen.getByRole("status").textContent).toBe("Calcul non enregistré : figer la population, puis calculer.");
    expect(document.querySelector("svg")).toBeNull();
  });
});

describe("L16-04 synthèse et table", () => {
  it("ligne de synthèse : dénominateurs, exclusions motivées, montants étiquetés partiels", () => {
    render(<SummaryLine summary={portfolio.summary}/>);
    const line = screen.getByLabelText("Synthèse du portefeuille").textContent!;
    expect(line).toMatch(/^7 contrats au registre fourni · 3 calculable\(s\) sur ce périmètre · 3 exclu\(s\) avec motif/);
    expect(line).toContain("sur 3 contrats calculés — montants partiels : 2 contrats bloqués exclus (D04, D06)");
    expect(line).toContain(moneyFr(portfolio.summary.amounts!.debtClosing));
  });

  it("table paginée : une page montée, recherche et tri ; un montant inconnu reste en fin de tri dans les deux sens", () => {
    const base = portfolio.rows.find(r => r.contractId === "F03")!;
    const rows: PortfolioRow[] = Array.from({ length: 60 }, (_, i) => ({ ...base, contractId: "R" + String(i).padStart(2, "0"), lessor: i === 7 ? "Bailleur unique" : base.lessor,
      debtClosing: i % 10 === 0 ? null : { amount: (1000 + i) + ".00", currency: "EUR" as const } }));
    render(<PortfolioTable rows={rows} selected={null} onOpen={() => {}}/>);
    const body = () => within(screen.getByRole("region", { name: "Table du portefeuille — défilement horizontal au clavier" })).getAllByRole("rowheader").map(h => h.textContent!.slice(0, 3));
    expect(body()).toHaveLength(25);
    expect(screen.getByText("Lignes 1–25 sur 60 · page 1 / 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Page suivante" }));
    expect(body()[0]).toBe("R25");
    fireEvent.click(screen.getByRole("button", { name: "Dette à la clôture" }));
    expect(body()[0]).toBe("R01");
    expect(body().at(-1)).toBe("R27");
    fireEvent.click(screen.getByRole("button", { name: "Dette à la clôture" }));
    expect(body()[0]).toBe("R59");
    fireEvent.click(screen.getByRole("button", { name: "Page suivante" })); fireEvent.click(screen.getByRole("button", { name: "Page suivante" }));
    expect(body().slice(-6)).toEqual(["R00", "R10", "R20", "R30", "R40", "R50"]);
    fireEvent.change(screen.getByLabelText("Rechercher un contrat, un bailleur ou une catégorie"), { target: { value: "unique" } });
    expect(body()).toEqual(["R07"]);
    expect(screen.getByText("Recherche : 1 contrat sur 60 — la population figée ne change pas")).toBeTruthy();
  });
});

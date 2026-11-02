// @vitest-environment jsdom
/**
 * Page « Seuils & référentiel » (écran 08) rendue telle que la route la construit, sur le registre réel. Attendus posés
 * à la main dans lib/referentiel/sources.ts : 27 sources (19 de droit dur, 8 ISA / ISRE), six seuils internes,
 * millésimes 2009:5, 2013:4, 2021:2, 2023:1, 2024:13, 2026:2.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});

import ReferentielPage from "@/app/dashboard/referentiel/page";
import { REFERENTIEL_EDITIONS } from "@/lib/referentiel/edition";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(cleanup);

const plain = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const status = () => plain(within(screen.getByRole("region", { name: "Sources normatives" })).getByRole("status").textContent);
const sourceRows = () => within(screen.getByRole("list", { name: "Sources normatives" })).getAllByRole("listitem");
const rowOf = (ref: string) => sourceRows().find((li) => li.textContent?.startsWith(ref))!;
const dashOf = (el: Element) => el.querySelector("svg line")?.getAttribute("stroke-dasharray") ?? "none";

describe("Seuils & référentiel", () => {
  it("h1 du rail dans l'ambiance instruments, chapeau tiré du registre, édition visible avec son détail", () => {
    render(<ReferentielPage />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Seuils & référentiel" });
    expect(h1.closest('[data-ambiance="instruments"]')).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Référentiel normatif" })).toBeNull();
    expect(screen.getByText(/^08 · Seuils & référentiel/)).toBeTruthy();

    const lead = plain(h1.parentElement!.querySelector("p:last-of-type")!.textContent);
    expect(lead).toContain("27 sources versionnées fondent les contrôles PROBANT");
    expect(lead).toContain("dont 19 textes de droit dur opposables et 8 normes de méthode d’audit");

    const numero = REFERENTIEL_EDITIONS[REFERENTIEL_EDITIONS.length - 1].numero;
    const edition = screen.getByText("Édition du registre").closest("div")!;
    expect(within(edition).getByText(`éd. ${numero}`)).toBeTruthy();
    expect(edition.textContent).toContain("n'atteste pas la relecture des entrées");
    expect(document.querySelector("[title]")).toBeNull();

    const more = screen.getByRole("button", { name: "En savoir plus" });
    expect(screen.getByText(/ne se substituent pas au texte officiel/)).toBeTruthy();
    const panel = document.getElementById("rf-caveat-more")!;
    expect(panel.hidden).toBe(true);
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Code de commerce");
  });

  it("seuils internes en tête : registre paramètre / valeur, famille « Paramètre interne · non opposable »", () => {
    render(<ReferentielPage />);
    const seuils = screen.getByRole("region", { name: "Seuils internes" });
    const sourcesRegion = screen.getByRole("region", { name: "Sources normatives" });
    expect(seuils.compareDocumentPosition(sourcesRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(seuils.textContent).toContain("Paramètre interne · non opposable");
    expect(seuils.textContent).toContain("hiérarchisent la vigilance, ne fondent aucun constat");
    const head = within(seuils).getByRole("heading", { level: 2, name: "Seuils internes" }).parentElement!;
    expect(dashOf(head)).toBe("1 3");

    const rows = within(within(seuils).getByRole("table")).getAllByRole("row").slice(1);
    const values = rows.map((r) => [
      plain(within(r).getByRole("rowheader").querySelector("span")!.textContent),
      plain(within(r).getByRole("cell").textContent),
    ]);
    // Valeurs de SEUILS_INTERNES en notation française : 1.0 → « 1 % », 0.5 → « 0,5 % ».
    expect(values).toEqual([
      ["Matérialité (% bilan)", "1 %"],
      ["Matérialité (% CA)", "0,5 %"],
      ["Variation CA atypique", "25 %"],
      ["Écart taux amort.", "5 pts"],
      ["Fenêtre écriture tardive", "5 j"],
      ["Seuil faisceau", "3 signaux"],
    ]);
  });

  it("familles : droit dur en trait plein, ISA / ISRE en « Méthode d’audit » à tirets, jamais « méthode interne »", () => {
    render(<ReferentielPage />);
    expect(document.body.textContent).not.toMatch(/méthode interne/i);

    const isa = rowOf("ISA 240");
    expect(isa.textContent).toContain("Méthode d’audit");
    expect(dashOf(isa)).toBe("4 3");
    const isre = rowOf("ISRE 2400 (révisée)");
    expect(isre.textContent).toContain("Méthode d’audit");
    const lpf = rowOf("LPF art. A.47 A-1");
    expect(lpf.textContent).toContain("Droit dur");
    expect(dashOf(lpf)).toBe("none");

    // Aucune source citée ne porte le pointillé des paramètres internes.
    for (const row of sourceRows()) expect(dashOf(row)).not.toBe("1 3");

    const familles = screen.getByRole("group", { name: "Famille" });
    expect(within(familles).getByRole("button", { name: "Droit dur, 19 entrées" })).toBeTruthy();
    expect(within(familles).getByRole("button", { name: "Méthode d’audit, 8 entrées" })).toBeTruthy();
  });

  it("frise : un bouton par millésime avec son nombre de textes, filtre à bascule et réinitialisation", () => {
    render(<ReferentielPage />);
    const frise = screen.getByRole("group", { name: "Millésimes d’entrée en vigueur" });
    const years = within(frise).getAllByRole("button");
    const expected: [string, number][] = [
      ["2009", 5],
      ["2013", 4],
      ["2021", 2],
      ["2023", 1],
      ["2024", 13],
      ["2026", 2],
    ];
    expect(years.map((b) => [b.querySelector('[aria-hidden="true"]')!.textContent, Number(b.lastElementChild!.textContent)])).toEqual(expected);
    expect(years.map((b) => b.getAttribute("aria-label"))).toEqual(years.map(() => null));
    expect(years.every((b) => b.tagName === "BUTTON" && b.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(status()).toBe("27 entrées");

    const y2009 = within(frise).getByRole("button", { name: /^2009, 5 textes : 0 de droit dur, 5 de méthode d’audit$/ });
    fireEvent.click(y2009);
    expect(y2009.getAttribute("aria-pressed")).toBe("true");
    expect(status()).toBe("5 entrées sur 27");
    expect(sourceRows().map((li) => li.querySelector("span")!.textContent)).toEqual(["ISA 320", "ISA 330", "ISA 500", "ISA 520", "ISA 505"]);

    // L'index suit le millésime : aucune entrée de droit dur en 2009.
    const familles = screen.getByRole("group", { name: "Famille" });
    expect(within(familles).getByRole("button", { name: "Droit dur, 0 entrée" })).toBeTruthy();
    expect(within(familles).getByRole("button", { name: "Méthode d’audit, 5 entrées" })).toBeTruthy();

    fireEvent.click(y2009);
    expect(y2009.getAttribute("aria-pressed")).toBe("false");
    expect(status()).toBe("27 entrées");

    const y2013 = within(frise).getByRole("button", { name: /^2013, 4 textes/ });
    fireEvent.click(y2013);
    expect(sourceRows()).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Tous les millésimes" }));
    expect(y2013.getAttribute("aria-pressed")).toBe("false");
    expect(sourceRows()).toHaveLength(27);
  });

  it("frise : le survol ou le focus d'un millésime en montre les textes, sans filtrer", () => {
    render(<ReferentielPage />);
    const frise = screen.getByRole("group", { name: "Millésimes d’entrée en vigueur" });
    expect(screen.getByText("Lecture de la frise")).toBeTruthy();
    const y2021 = within(frise).getByRole("button", { name: /^2021, 2 textes/ });
    fireEvent.focus(y2021);
    expect(screen.getByText("Millésime 2021")).toBeTruthy();
    expect(screen.getByText("Millésime 2021").closest("div")!.parentElement!.textContent).toContain("ISA 315 (révisée)");
    expect(status()).toBe("27 entrées");
    fireEvent.blur(y2021);
    expect(screen.getByText("Lecture de la frise")).toBeTruthy();
  });

  it("recherche : Ctrl+K y place le curseur, compte annoncé, Échap l'efface ; Réinitialiser remet tout", () => {
    render(<ReferentielPage />);
    const search = screen.getByRole("searchbox");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: "A.47" } });
    expect(status()).toBe("3 résultats pour « A.47 »");
    fireEvent.keyDown(search, { key: "Escape" });
    expect((search as HTMLInputElement).value).toBe("");
    expect(status()).toBe("27 entrées");

    fireEvent.change(search, { target: { value: "zzz-introuvable" } });
    expect(screen.getByText(/Aucun texte ne correspond — 27 sources/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Réinitialiser" })[0]);
    expect((search as HTMLInputElement).value).toBe("");
    expect(sourceRows()).toHaveLength(27);
  });

  it("lectures « liste » (paraphrases repliées) et « par texte » (regroupées, entières)", () => {
    render(<ReferentielPage />);
    const lpf = rowOf("LPF art. A.47 A-1");
    const more = within(lpf).getByRole("button", { name: "Voir plus" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(within(lpf).getByRole("button", { name: "Réduire" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(lpf).getByRole("button", { name: "Copier la référence" })).toBeTruthy();
    expect(within(lpf).getByRole("link", { name: "Source, nouvel onglet" }).getAttribute("href")).toContain("legifrance");

    fireEvent.click(screen.getByRole("button", { name: "par texte" }));
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => plain(h.textContent));
    expect(groups).toEqual(
      expect.arrayContaining(["Livre des procédures fiscales3", "Normes d'exercice professionnel8", "Plan comptable général14"]),
    );
    expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull();
  });
});

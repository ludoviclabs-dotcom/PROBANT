// @vitest-environment jsdom
/**
 * L16-06 — défaut trouvé par la recette du parcours réel : sur une feuille neuve, aucune catégorie n'existe avant le premier enregistrement
 * du cadre (la qualification l'exige), et le bouton restait désactivé faute de modification. Le premier enregistrement est maintenant permis,
 * et le message dit l'étape réelle au lieu de renvoyer au registre déjà approuvé.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeaseWork } from "@/lib/workpapers/lease-work";
import { PolicyEditor } from "../PolicyEditor";

afterEach(cleanup);
const savedWork = { framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }, firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16" },
  policies: [], confirmations: [], authorId: "local-owner", authoredAt: "2027-02-01T10:00:00.000Z" } as unknown as LeaseWork;

describe("L16-06 politiques : premier enregistrement d'une feuille neuve", () => {
  it("sans travail enregistré : le cadre s'enregistre sans modification préalable, sans politique inventée ; le message dit l'étape réelle", () => {
    const onSave = vi.fn();
    render(<PolicyEditor categories={[]} work={undefined} editable busy={false} saveState="idle" onSave={onSave}/>);
    expect(screen.getByText(/Enregistrez d'abord le cadre de la feuille/)).toBeTruthy();
    expect(screen.queryByText(/approuvez d'abord le registre/)).toBeNull();
    const save = screen.getByRole("button", { name: "Enregistrer les politiques" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ policies: [], confirmations: [], firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16 ; aucune méthode de transition choisie par l'outil" } }));
  });

  it("travail déjà enregistré et inchangé : rien à enregistrer ; une catégorie manquante renvoie au registre", () => {
    render(<PolicyEditor categories={[]} work={savedWork} editable busy={false} saveState="saved" onSave={() => {}}/>);
    expect((screen.getByRole("button", { name: "Enregistrer les politiques" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/approuvez d'abord le registre des contrats/)).toBeTruthy();
  });
});

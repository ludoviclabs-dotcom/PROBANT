// @vitest-environment jsdom
/**
 * Choix de la juridiction d'une feuille : l'écran ne propose que ce que le serveur sert (`capability.jurisdictions`). Sans relecture nommée du
 * texte UE, il dit pourquoi l'UE manque ; avec elle, il envoie l'édition et l'empreinte du texte relu, jamais une valeur saisie.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeaseWork } from "@/lib/workpapers/lease-work";
import { ReviewRefusals } from "../ReviewRefusals";
import { PolicyEditor } from "../PolicyEditor";

afterEach(cleanup);
const IASB = { jurisdiction: "IASB" as const, label: "IFRS publiées par l'IASB (édition 2026)", edition: "IFRS 16, IASB 2026", editionFingerprint: null };
const EU = { jurisdiction: "EU_adopted" as const, label: "IFRS adoptées dans l'Union européenne (règlement 2023/1803)", edition: "IFRS 16, règlement (UE) 2023/1803 (JO L 237 du 26.9.2023)", editionFingerprint: "0".repeat(64) };
const savedWork = { framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }, firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16" },
  policies: [], confirmations: [], authorId: "local-owner", authoredAt: "2027-02-01T10:00:00.000Z" } as unknown as LeaseWork;

describe("Juridiction de la feuille", () => {
  it("texte UE non relu : référentiel IASB affiché, l'UE dite non proposée avec la fiche à suivre ; aucun choix inactif", () => {
    render(<PolicyEditor categories={[]} work={savedWork} jurisdictions={[IASB]} editable busy={false} saveState="saved" onSave={() => {}}/>);
    expect(screen.getByText(/Référentiel : IFRS publiées par l'IASB \(édition 2026\)\. IFRS adoptées dans l'UE : proposées après la relecture nommée du texte UE/)).toBeTruthy();
    expect(screen.queryByLabelText("Référentiel de la feuille")).toBeNull();
  });

  it("texte UE relu : le choix de l'UE rend la feuille modifiée et envoie l'édition et l'empreinte servies par le serveur", () => {
    const onSave = vi.fn();
    render(<PolicyEditor categories={[]} work={savedWork} jurisdictions={[IASB, EU]} editable busy={false} saveState="saved" onSave={onSave}/>);
    const save = screen.getByRole("button", { name: "Enregistrer les politiques" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Référentiel de la feuille"), { target: { value: "EU_adopted" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ framework: { standard: "IFRS 16", jurisdiction: "EU_adopted", edition: EU.edition, editionFingerprint: EU.editionFingerprint } }));
  });

  it("consignation refusée par le garde : l'écran dit le motif et comment corriger ; rien quand tout est retenu", () => {
    const { container } = render(<ReviewRefusals refusals={[]}/>);
    expect(container.textContent).toBe("");
    render(<ReviewRefusals refusals={["Relecture UE consignée refusée (docs/ifrs/FICHE_RELECTURE_UE.md) : nom d'exemple de la fiche (« Prénom Nom ») au lieu du nom de la personne qui relit"]}/>);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Consignation de relecture refusée");
    expect(alert.textContent).toContain("nom d'exemple de la fiche (« Prénom Nom »)");
    expect(alert.textContent).toContain("l'heure réelle de la relecture, en UTC");
  });
});

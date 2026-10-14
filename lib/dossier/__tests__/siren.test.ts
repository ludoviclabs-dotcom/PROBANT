import { describe, expect, it } from "vitest";
import { libelleSiren, SIREN_NON_DETECTE, sirenRenseigne } from "../siren";

describe("SIREN du dossier pour affichage", () => {
  it.each([null, undefined, "", "   ", SIREN_NON_DETECTE])("%j est un SIREN absent", (valeur) => {
    expect(sirenRenseigne(valeur)).toBeNull();
    expect(libelleSiren(sirenRenseigne(valeur))).toBe("SIREN non renseigné");
  });

  it("un SIREN renseigné est conservé, groupé par trois chiffres à l'affichage", () => {
    expect(sirenRenseigne(" 552100554 ")).toBe("552100554");
    expect(libelleSiren("552100554")).toBe("SIREN 552 100 554");
    // SIREN fictif du jeu de démonstration : une donnée, pas un remplissage.
    expect(libelleSiren("000000000")).toBe("SIREN 000 000 000");
  });

  it("une valeur hors format est rendue telle quelle, sans complément", () => {
    expect(libelleSiren("55210")).toBe("SIREN 55210");
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/lib/synthesis/canonical";
import { SEUILS_INTERNES, SOURCES } from "../sources";
import {
  IDENTIFIANT_ANTERIEUR,
  REFERENTIEL_EDITIONS,
  REFERENTIEL_EMPREINTE,
  REFERENTIEL_VERSION,
  contenuRegistre,
  decrireReferentiel,
  empreinteRegistre,
  identifiantEdition,
  identifiantPourEmpreinte,
  type ReferentielEdition,
} from "../edition";

/**
 * Éditions publiées, figées ici : une édition déjà inscrite dans des snapshots
 * ne se réécrit pas. Ajouter chaque nouvelle édition à la fin, ne jamais modifier.
 */
const EDITIONS_PUBLIEES = [
  { numero: 2, empreinte: "cf23de34ea7f5e42e2242180bf2d2ee6b1fd5b1bb544fbe3eeab0473b191075f" },
  { numero: 3, empreinte: "9f821c3212856b03a65e00d846300ac0ade4f6855ec1a82ea918f142c9f0d170" },
];

/** Empreinte attendue calculée indépendamment de l'implémentation pure (node:crypto). */
function empreinteAttendue(): string {
  return createHash("sha256")
    .update(canonicalJson({ sources: SOURCES, seuilsInternes: SEUILS_INTERNES }), "utf8")
    .digest("hex");
}

const derniere = REFERENTIEL_EDITIONS[REFERENTIEL_EDITIONS.length - 1];

describe("édition du registre normatif", () => {
  it("échoue si SOURCES ou SEUILS_INTERNES change sans nouvelle édition", () => {
    const empreinte = empreinteAttendue();
    expect(
      empreinte,
      `Le registre a changé : ajoutez à REFERENTIEL_EDITIONS (lib/referentiel/edition.ts) l'édition ${derniere.numero + 1} d'empreinte ${empreinte}, avec ses entrées modifiées, sans réécrire les éditions publiées.`,
    ).toBe(derniere.empreinte);
  });

  it("inscrit l'identifiant ed<N>-<empreinte> de la dernière édition, pas une date", () => {
    expect(REFERENTIEL_EMPREINTE).toBe(empreinteAttendue());
    expect(REFERENTIEL_VERSION).toBe(`ed${derniere.numero}-${derniere.empreinte.slice(0, 12)}`);
    expect(REFERENTIEL_VERSION).toMatch(/^ed\d+-[0-9a-f]{12}$/);
    expect(REFERENTIEL_VERSION).not.toBe(IDENTIFIANT_ANTERIEUR);
  });

  it("une citation ou un seuil modifié donne un brouillon, jamais l'édition courante", () => {
    const { sources, seuilsInternes } = contenuRegistre();
    const citation = {
      // Modification relative à la valeur courante : reste un changement quelle que soit l'édition chargée.
      sources: { ...sources, CCOM_CAPITAL: { ...sources.CCOM_CAPITAL, citation: `${sources.CCOM_CAPITAL.citation} (modifiée)` } },
      seuilsInternes,
    };
    const seuil = { sources, seuilsInternes: { ...seuilsInternes, materialitePctBilan: 2 } };

    for (const contenu of [citation, seuil]) {
      const empreinte = empreinteRegistre(contenu);
      expect(empreinte).not.toBe(derniere.empreinte);
      expect(identifiantPourEmpreinte(empreinte)).toBe(`brouillon-${empreinte.slice(0, 12)}`);
    }
  });

  it("l'ordre des entrées n'est pas un changement de contenu", () => {
    const inverse = {
      seuilsInternes: SEUILS_INTERNES,
      sources: Object.fromEntries(Object.entries(SOURCES).reverse()),
    };
    expect(empreinteRegistre(inverse)).toBe(derniere.empreinte);
  });

  it("journal append-only : éditions publiées inchangées, numéros consécutifs, chaque édition change le contenu", () => {
    expect(
      REFERENTIEL_EDITIONS.slice(0, EDITIONS_PUBLIEES.length).map(({ numero, empreinte }) => ({ numero, empreinte })),
    ).toEqual(EDITIONS_PUBLIEES);
    REFERENTIEL_EDITIONS.forEach((edition, i) => {
      expect(edition.numero).toBe(i + 2);
      expect(edition.empreinte).toMatch(/^[0-9a-f]{64}$/);
      expect(edition.registreModifieLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(edition.motif.trim()).not.toBe("");
      if (i > 0) {
        const precedente = REFERENTIEL_EDITIONS[i - 1];
        expect(edition.empreinte).not.toBe(precedente.empreinte);
        expect(edition.registreModifieLe >= precedente.registreModifieLe).toBe(true);
        expect(edition.entrees.length).toBeGreaterThan(0);
      }
    });
  });

  it("éd. 3 : CCOM_CAPITAL explique tout l'écart avec l'éd. 2", () => {
    // Valeur portée par l'éd. 2 (sources.ts en 8192e6b), avant la version du 11/03/2023 (PR #89).
    const ccomCapitalEd2 = {
      ...SOURCES.CCOM_CAPITAL,
      ref: "C. com. art. L.225-248",
      citation:
        "Lorsque, du fait de pertes, les capitaux propres deviennent inférieurs à la moitié du capital social, l'assemblée générale est consultée dans les quatre mois sur la dissolution éventuelle ; à défaut, la situation doit être régularisée au plus tard à la clôture du deuxième exercice suivant.",
      effectiveDate: "2024-01-01",
      url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006825098",
    };
    const ed3 = REFERENTIEL_EDITIONS.find((e) => e.numero === 3)!;
    expect(ed3.entrees).toEqual(["CCOM_CAPITAL"]);
    expect(empreinteRegistre({ sources: { ...SOURCES, CCOM_CAPITAL: ccomCapitalEd2 }, seuilsInternes: SEUILS_INTERNES }))
      .toBe(EDITIONS_PUBLIEES[0].empreinte);
  });

  it("décrit les identifiants lus dans les snapshots sans les réécrire", () => {
    expect(decrireReferentiel(REFERENTIEL_VERSION)).toMatchObject({
      kind: "edition",
      identifiant: REFERENTIEL_VERSION,
      numero: derniere.numero,
      courante: true,
      libelle: `éd. ${derniere.numero}`,
    });
    const anterieur = decrireReferentiel(IDENTIFIANT_ANTERIEUR);
    expect(anterieur).toMatchObject({ kind: "anterieur", identifiant: "2024-01-01", libelle: "2024-01-01 (antérieur)" });
    expect(anterieur.detail).toMatch(/pas déterminable/);
    expect(decrireReferentiel("brouillon-0123456789ab")).toMatchObject({ kind: "brouillon", libelle: "brouillon" });
    // Un numéro connu avec une autre empreinte n'est pas cette édition.
    expect(decrireReferentiel(`ed${derniere.numero}-000000000000`)).toMatchObject({ kind: "inconnu" });
    expect(decrireReferentiel("fec-2026.1")).toMatchObject({ kind: "inconnu", libelle: "fec-2026.1" });
  });

  it("une édition antérieure reste lisible et renvoie à l'édition chargée", () => {
    const journal: ReferentielEdition[] = [
      { numero: 2, empreinte: "a".repeat(64), registreModifieLe: "2026-08-16", motif: "a", entrees: [] },
      { numero: 3, empreinte: "b".repeat(64), registreModifieLe: "2026-10-20", motif: "b", entrees: ["CCOM_CAPITAL"] },
    ];
    const [ed2, ed3] = journal.map(identifiantEdition);
    const description = decrireReferentiel(ed2, journal, ed3);
    expect(description).toMatchObject({ kind: "edition", numero: 2, courante: false, libelle: "éd. 2" });
    expect(description.detail).toContain("l'édition chargée est éd. 3");
    expect(identifiantPourEmpreinte("b".repeat(64), journal)).toBe(ed3);
  });
});

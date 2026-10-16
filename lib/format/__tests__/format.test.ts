import { describe, expect, it } from "vitest";
import { MINUS, formatEuroCents, formatInt } from "../fr";
import { formatClosing, formatPeriod } from "../period";

/** Les espaces fine / insécables (séparateur de milliers, avant « € ») sont comparés comme des espaces simples. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("formats d'affichage fr-FR", () => {
  it("entiers : séparateur de milliers, aucun arrondi", () => {
    expect(plain(formatInt(2840))).toBe("2 840");
    expect(formatInt(43)).toBe("43");
    expect(plain(formatInt(1234567))).toBe("1 234 567");
  });

  it("montants en centimes : décimales seulement si les centimes ne sont pas nuls", () => {
    expect(plain(formatEuroCents(18_000_00))).toBe("18 000 €");
    expect(plain(formatEuroCents(12_345_67))).toBe("12 345,67 €");
    expect(plain(formatEuroCents(5))).toBe("0,05 €");
    expect(formatEuroCents(0)).toBe(`0 €`);
  });

  it("signe : moins typographique, plus seulement sur demande, zéro sans signe", () => {
    expect(plain(formatEuroCents(-145_000_00))).toBe(`${MINUS}145 000 €`);
    expect(plain(formatEuroCents(-312_000_00, { sign: true }))).toBe(`${MINUS}312 000 €`);
    expect(plain(formatEuroCents(18_000_00, { sign: true }))).toBe("+18 000 €");
    expect(plain(formatEuroCents(18_000_00))).toBe("18 000 €");
    expect(plain(formatEuroCents(0, { sign: true }))).toBe("0 €");
    expect(MINUS).toBe("−");
  });

  it("refuse un montant qui n'est pas un entier de centimes plutôt que de l'arrondir", () => {
    expect(() => formatEuroCents(12.5)).toThrow(/centimes entier/);
    expect(() => formatEuroCents(Number.NaN)).toThrow();
  });
});

describe("période d'exercice du ruban", () => {
  it("même année : l'année n'est écrite qu'une fois", () => {
    expect(formatPeriod("2024-01-01", "2024-12-31")).toBe("01/01 → 31/12/2024");
  });

  it("exercice à cheval sur deux années : les deux années sont écrites", () => {
    expect(formatPeriod("2023-07-01", "2024-06-30")).toBe("01/07/2023 → 30/06/2024");
  });

  it("dates compactes AAAAMMJJ acceptées", () => {
    expect(formatPeriod("20240101", "20241231")).toBe("01/01 → 31/12/2024");
  });

  it("une date illisible est restituée telle quelle, jamais corrigée", () => {
    expect(formatPeriod("2024-13", "2024-12-31")).toBe("2024-13 → 2024-12-31");
  });

  it("date de clôture seule : « clôture jj/mm/aaaa », sans début d'exercice reconstitué", () => {
    expect(formatClosing("2024-12-31")).toBe("clôture 31/12/2024");
    expect(formatClosing("20241231")).toBe("clôture 31/12/2024");
  });

  it("clôture inconnue ou illisible : rien n'est affiché", () => {
    expect(formatClosing(null)).toBeNull();
    expect(formatClosing(undefined)).toBeNull();
    expect(formatClosing("")).toBeNull();
    expect(formatClosing("31 décembre")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { loadVeilleReport } from "../loader";

/**
 * Veille arrêtée du dépôt (data/veille/veille.yml) : elle doit être cohérente avec le registre, les fiches et la
 * méthodologie. Une incohérence (identifiant inconnu, date invalide, preuve manquante) fait échouer ce test.
 */
describe("veille arrêtée du dépôt", () => {
  it("est cohérente et rattachée au registre réel", async () => {
    const report = await loadVeilleReport();
    expect(report).not.toBeNull();
    expect(report!.issues).toEqual([]);
    expect(report!.arreteAu).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(report!.evolutions.length).toBeGreaterThan(0);
    // Chaque évolution établie cite une adresse officielle et une date de lecture antérieure à l'arrêté.
    for (const e of report!.evolutions) {
      if (e.access === "inaccessible") continue;
      expect(e.officialUrl, e.id).toMatch(/^https:\/\//);
      expect(e.readAt! <= report!.arreteAu, e.id).toBe(true);
    }
  });

  it("ne laisse aucune source pointer vers une adresse relevée morte", async () => {
    const report = await loadVeilleReport();
    const dead = report!.sources.filter((s) => s.link.state === "introuvable" || s.link.state === "injoignable");
    expect(dead.map((s) => `${s.id} ${s.url}`)).toEqual([]);
  });
});

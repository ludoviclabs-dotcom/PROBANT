/**
 * Cohérence entre le référentiel FEC et le reste du dépôt — non-régression.
 *
 * `data/fec/fields.yml` (format légal, vérifié à l'article A47 A-1) et
 * `lib/canonical-model/fec.ts` (modèle d'exécution du moteur) décrivent le même
 * objet sous deux angles. Rien ne les tenait synchronisés : ce test le fait.
 * Si un jour l'un des deux dérive, la CI le dit.
 *
 * Le référentiel n'est pas là pour remplacer le modèle d'exécution — c'est
 * l'inverse d'une duplication : une seule vérité, deux représentations, un
 * test qui les relie.
 */

import { describe, expect, it } from "vitest";
import { FEC_COLUMNS } from "@/lib/canonical-model/fec";
import { loadFecControls, loadFecFields } from "@/lib/knowledge/loader";
import { loadAllCycles } from "@/lib/audit-cycles/loader";
import { validateAll } from "@/lib/audit-cycles/validation";

describe("référentiel FEC ↔ modèle canonique", () => {
  it("déclare les mêmes 18 zones, dans le même ordre", async () => {
    const set = await loadFecFields();
    const noms = [...set.fields]
      .sort((a, b) => a.position - b.position)
      .map((f) => f.fieldName);

    expect(noms).toEqual([...FEC_COLUMNS]);
  });

  it("numérote les positions de 1 à 18 sans trou ni doublon", async () => {
    const set = await loadFecFields();
    const positions = set.fields.map((f) => f.position).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it("place la variante Montant/Sens sur les zones 12 et 13", async () => {
    const set = await loadFecFields();
    const variantes = set.fields.filter((f) => f.variant === "debit_credit");
    expect(variantes.map((f) => f.position).sort()).toEqual([12, 13]);
    expect(variantes.map((f) => f.fieldName).sort()).toEqual(["Credit", "Debit"]);
  });

  it("impose le format AAAAMMJJ à toutes les zones de date", async () => {
    const set = await loadFecFields();
    for (const f of set.fields.filter((x) => x.dataType === "date")) {
      expect(f.format).toBe("AAAAMMJJ");
    }
  });

  it("ne cible que des zones FEC existantes dans les contrôles", async () => {
    const [fields, controls] = await Promise.all([
      loadFecFields(),
      loadFecControls(),
    ]);
    // Montant/Sens n'existent que dans la variante : on les admet en plus des
    // 18 noms de la variante Débit/Crédit.
    const connus = new Set([
      ...fields.fields.map((f) => f.fieldName),
      "Montant",
      "Sens",
    ]);

    for (const c of controls.controls) {
      for (const champ of c.appliesTo) {
        expect(connus, `contrôle ${c.id} cible « ${champ} »`).toContain(champ);
      }
    }
  });
});

describe("non-régression des 35 cycles existants", () => {
  it("charge toujours 35 cycles", async () => {
    const cycles = await loadAllCycles();
    expect(cycles).toHaveLength(35);
  });

  it("laisse la validation Audit Normatif 360 sans erreur", async () => {
    const report = await validateAll();
    expect(report.errors).toEqual([]);
    expect(report.stats.cycles).toBe(35);
  });

  it("ne référence que des cycles existants depuis le plan de connaissance", async () => {
    const cycles = await loadAllCycles();
    const slugs = new Set(cycles.map((c) => c.slug));

    const { loadIfrs, loadNep, loadPcg } = await import("@/lib/knowledge/loader");
    const [ifrs, nep, pcg] = await Promise.all([loadIfrs(), loadNep(), loadPcg()]);

    const references = [
      ...ifrs.entries.flatMap((e) => e.affectedCycles.map((c) => [e.id, c] as const)),
      ...nep.entries.flatMap((e) => e.relatedCycles.map((c) => [e.id, c] as const)),
      ...pcg.requirements.flatMap((r) => r.affectedCycles.map((c) => [r.id, c] as const)),
    ];

    for (const [source, slug] of references) {
      expect(slugs, `${source} référence le cycle « ${slug} »`).toContain(slug);
    }
  });
});

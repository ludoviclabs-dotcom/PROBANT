import { describe, expect, it, vi } from "vitest";
import { computeDossierSnapshotHash } from "@/lib/dossier/snapshot-state";
import { makeDossierSnapshot, makeFinding } from "@/lib/synthesis/__tests__/fixtures";

describe("empreinte du snapshot de dossier indépendante de la locale", () => {
  // « ch » est une lettre après « h » en tchèque ; « y » suit « i » en lituanien.
  const snapshot = makeDossierSnapshot({
    findings: [makeFinding("RAPPRO-DUPONT"), makeFinding("RAPPRO-CHARLES"), makeFinding("RAPPRO-IYZ"), makeFinding("RAPPRO-IK")],
  });
  const expected = computeDossierSnapshotHash(snapshot);

  it.each(["fr-FR", "cs-CZ", "lt-LT"])("reste identique en %s", (locale) => {
    const collator = new Intl.Collator(locale);
    const spy = vi.spyOn(String.prototype, "localeCompare")
      .mockImplementation(function (this: string, other: string) {
        return collator.compare(String(this), other);
      });
    try {
      expect(computeDossierSnapshotHash(snapshot)).toBe(expected);
    } finally {
      spy.mockRestore();
    }
  });
});

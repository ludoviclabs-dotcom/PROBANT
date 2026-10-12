import { describe, expect, it } from "vitest";
import { CLEAN_LABEL, DIRTY_LABEL, READ_ONLY_LABEL, sameDraft, saveStateLabel } from "../draft-state";

describe("état de sauvegarde d'une feuille (M20-UI-03)", () => {
  it("une feuille fraîchement chargée n'est pas « non sauvegardée »", () => {
    const base = { conclusion: "Résidu expliqué", period: { startDate: "2024-01-01", closingDate: "2024-12-31" } };
    const hydrated = { period: { closingDate: "2024-12-31", startDate: "2024-01-01" }, conclusion: "Résidu expliqué", comment: undefined };
    expect(sameDraft(hydrated, base)).toBe(true);
    expect(saveStateLabel({ status: "idle", dirty: !sameDraft(hydrated, base) })).toBe(CLEAN_LABEL);
  });
  it("une version verrouillée affichée sans saisie est en lecture seule", () => {
    expect(saveStateLabel({ status: "idle", dirty: false, readOnly: true })).toBe(READ_ONLY_LABEL);
  });
  it("une vraie saisie rend la feuille non sauvegardée, et son annulation la rend propre", () => {
    const base = { conclusion: "", allocations: [{ paymentId: "P1", amount: { amount: "300.00" } }] };
    const typed = { ...base, conclusion: "Nouvelle conclusion" };
    expect(saveStateLabel({ status: "idle", dirty: !sameDraft(typed, base) })).toBe(DIRTY_LABEL);
    const reverted = { ...typed, conclusion: "" };
    expect(saveStateLabel({ status: "idle", dirty: !sameDraft(reverted, base) })).toBe(CLEAN_LABEL);
  });
  it("un conflit serveur ou une sauvegarde en cours restent prioritaires sur la comparaison", () => {
    expect(saveStateLabel({ status: "conflict", dirty: false })).toBe("Conflit de modification");
    expect(saveStateLabel({ status: "saving", dirty: true })).toBe("Sauvegarde en cours…");
    expect(saveStateLabel({ status: "saved", dirty: false })).toBe("Sauvegardée — accusé serveur reçu");
    expect(saveStateLabel({ status: "failed", dirty: true })).toBe("Échec de sauvegarde");
  });
  it("compare les fichiers par nom et taille, pas par identité d'objet", () => {
    const a = new File(["abc"], "balance.csv"), b = new File(["xyz"], "balance.csv");
    expect(sameDraft({ file: a }, { file: b })).toBe(true);
    expect(sameDraft({ file: a }, { file: null })).toBe(false);
    expect(sameDraft([1, { x: [2, 3] }], [1, { x: [2, 3] }])).toBe(true);
    expect(sameDraft([1, { x: [2, 3] }], [1, { x: [3, 2] }])).toBe(false);
  });
});

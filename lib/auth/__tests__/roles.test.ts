import { describe, expect, it } from "vitest";
import {
  PROBANT_ROLES,
  actingRoleFor,
  hasPermission,
  normalizeRole,
  normalizeRoles,
  permissionsFor,
} from "../roles";

describe("normalisation des rôles", () => {
  it("reconnaît les quatre rôles du plan", () => {
    expect(PROBANT_ROLES).toEqual(["preparer", "reviewer", "signer", "admin"]);
  });

  it("traduit l'alias historique uploader", () => {
    expect(normalizeRole("uploader")).toBe("preparer");
  });

  it("rejette un rôle inconnu au lieu de le laisser passer", () => {
    expect(normalizeRole("superadmin")).toBeNull();
    expect(normalizeRole("")).toBeNull();
  });

  it("déduplique et ordonne de manière stable", () => {
    expect(normalizeRoles(["admin", "reviewer", "uploader", "preparer", "inconnu"])).toEqual([
      "preparer",
      "reviewer",
      "admin",
    ]);
  });
});

describe("matrice des permissions", () => {
  it("le préparateur dépose et lit mais ne décide pas", () => {
    expect(permissionsFor(["preparer"])).toEqual([
      "dossier:read",
      "dossier:upload",
      "dossier:export",
    ]);
    expect(hasPermission(["preparer"], "dossier:review")).toBe(false);
    expect(hasPermission(["preparer"], "dossier:sign")).toBe(false);
  });

  it("le réviseur décide mais ne dépose pas", () => {
    expect(hasPermission(["reviewer"], "dossier:review")).toBe(true);
    expect(hasPermission(["reviewer"], "dossier:upload")).toBe(false);
  });

  it("le signataire scelle mais ne décide pas", () => {
    expect(hasPermission(["signer"], "dossier:sign")).toBe(true);
    expect(hasPermission(["signer"], "dossier:review")).toBe(false);
  });

  it("seul l'administrateur porte organization:admin", () => {
    for (const role of PROBANT_ROLES) {
      expect(hasPermission([role], "organization:admin")).toBe(role === "admin");
    }
  });

  it("le cumul de rôles cumule les permissions", () => {
    expect(permissionsFor(["preparer", "reviewer"])).toContain("dossier:review");
    expect(permissionsFor(["preparer", "reviewer"])).toContain("dossier:upload");
  });

  it("aucun rôle n'accorde aucune permission", () => {
    expect(permissionsFor([])).toEqual([]);
  });
});

describe("rôle consigné dans l'historique de revue", () => {
  it("nomme le rôle métier réellement exercé", () => {
    expect(actingRoleFor(["reviewer", "admin"], "dossier:review")).toBe("reviewer");
  });

  it("retombe sur admin quand aucun rôle métier ne porte la permission", () => {
    expect(actingRoleFor(["admin"], "dossier:review")).toBe("admin");
  });
});

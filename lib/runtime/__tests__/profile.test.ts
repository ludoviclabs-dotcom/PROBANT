import { describe, expect, it } from "vitest";
import { configuredProcedures, PROCEDURE_ACTIVATION } from "@/lib/capabilities/registry";
import { requireDisposableCash } from "@/lib/workpapers/cash-http";
import { requireDisposableClosing } from "@/lib/workpapers/closing-http";
import { DURABLE_CHAIN_FLAGS, durableChainEnabled, durableChainRefusal, executionProfile, personalProfileIssues } from "../profile";
import { DURABLE_CHAIN_FLAGS as LAUNCHER_FLAGS } from "../../../scripts/local/local-lib.mjs";

/** URL de test assemblée : aucune chaîne `utilisateur:secret@hôte` littérale pour le scan de secrets. */
const pg = (credentials: string, hostAndDatabase: string) => "postgresql://" + credentials + "@" + hostAndDatabase;
const personal = {
  PROBANT_RUNTIME_PROFILE: "personal",
  PROBANT_LOCAL_PROFILE_ID: "6f1c2a4e-3b7d-4c9a-8e21-5d0f7a9b1c33",
  PROBANT_LOCAL_HOME: "C:\\Users\\moi\\AppData\\Local\\PROBANT\\personnel",
  DATABASE_URL: pg("probant_app:x", "127.0.0.1:54329/probant_personnel"),
  PROBANT_CASH_DURABLE: "personal",
};

describe("C07 — profils d'exécution distincts", () => {
  it("sans drapeau : démo navigateur ; avec disposable : recette jetable ; avec le profil : personnel local", () => {
    expect(executionProfile({})).toBe("browser_demo");
    expect(executionProfile({ PROBANT_CASH_DURABLE: "disposable" })).toBe("disposable_recipe");
    expect(executionProfile(personal)).toBe("personal_local");
  });

  it("la recette jetable garde exactement son comportement antérieur", () => {
    expect(durableChainEnabled({ PROBANT_CASH_DURABLE: "disposable" }, "PROBANT_CASH_DURABLE")).toBe(true);
    expect(durableChainEnabled({ PROBANT_CASH_DURABLE: "disposable", VERCEL_ENV: "production" }, "PROBANT_CASH_DURABLE")).toBe(false);
    expect(durableChainEnabled({ PROBANT_CASH_DURABLE: "true" }, "PROBANT_CASH_DURABLE")).toBe(false);
    // « personal » hors profil personnel n'ouvre rien.
    expect(durableChainEnabled({ PROBANT_CASH_DURABLE: "personal" }, "PROBANT_CASH_DURABLE")).toBe(false);
    expect(() => requireDisposableCash({ PROBANT_CASH_DURABLE: "disposable" })).not.toThrow();
  });

  it("le profil personnel n'ouvre que les chaînes marquées « personal », jamais « disposable »", () => {
    expect(() => requireDisposableCash(personal)).not.toThrow();
    expect(() => requireDisposableClosing(personal)).toThrow();
    expect(durableChainEnabled({ ...personal, PROBANT_CASH_DURABLE: "disposable" }, "PROBANT_CASH_DURABLE")).toBe(false);
    expect(durableChainRefusal({ ...personal, PROBANT_CASH_DURABLE: "disposable" }, "PROBANT_CASH_DURABLE")).toMatch(/refuse une chaîne marquée « disposable »/);
  });

  it("refuse une base de recette, un hôte distant, Vercel, un profil sans identifiant", () => {
    expect(personalProfileIssues(personal)).toEqual([]);
    expect(personalProfileIssues({ ...personal, DATABASE_URL: pg("probant:x", "localhost:5432/probant_ci") })).toContain("LOCAL_DATABASE_IS_DISPOSABLE");
    expect(personalProfileIssues({ ...personal, DATABASE_URL: pg("u:x", "db.example.com:5432/probant_personnel") })).toContain("LOCAL_DATABASE_NOT_LOOPBACK");
    expect(personalProfileIssues({ ...personal, VERCEL: "1" })).toContain("LOCAL_PROFILE_ON_VERCEL");
    expect(personalProfileIssues({ ...personal, PROBANT_LOCAL_PROFILE_ID: "" })).toContain("LOCAL_PROFILE_ID_MISSING");
    for (const issue of [{ VERCEL_ENV: "preview" }, { DATABASE_URL: pg("u:x", "127.0.0.1:5432/probant_test") }]) {
      expect(durableChainEnabled({ ...personal, ...issue }, "PROBANT_CASH_DURABLE")).toBe(false);
    }
  });

  it("le registre des capacités lit la même règle d'ouverture", () => {
    const env = Object.fromEntries([...Object.entries(personal), ...DURABLE_CHAIN_FLAGS.map(f => [f, "personal"])]);
    const configured = configuredProcedures(env);
    expect(Object.values(configured).every(c => c.activated && c.databaseConfigured)).toBe(true);
    expect(Object.values(configuredProcedures({ ...env, VERCEL: "1" })).some(c => c.activated)).toBe(false);
    // Chaque procédure du registre est gouvernée par un drapeau connu du profil.
    expect(new Set(Object.values(PROCEDURE_ACTIVATION)).size).toBeLessThanOrEqual(DURABLE_CHAIN_FLAGS.length);
    for (const flag of Object.values(PROCEDURE_ACTIVATION)) expect(DURABLE_CHAIN_FLAGS).toContain(flag);
  });

  it("le lanceur ouvre exactement les mêmes treize chaînes que le serveur", () => {
    expect([...LAUNCHER_FLAGS]).toEqual([...DURABLE_CHAIN_FLAGS]);
  });
});

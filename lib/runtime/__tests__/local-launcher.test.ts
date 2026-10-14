import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { atomicMigration } from "../../../scripts/db/migration-utils.mjs";
import {
  DURABLE_CHAIN_FLAGS, REMOTE_KEYS, childEnv, compareManifests, defaultHome, loopbackUrl, envExampleKeys, parseArgs, pieceFile, restoreTargetIssues, validateConfig, withinDirectory,
} from "../../../scripts/local/local-lib.mjs";
import { personalProfileIssues } from "../profile";
import { readLocalAuthConfig } from "@/lib/auth/local/config";

const config = {
  formatVersion: 1, profileId: "6f1c2a4e-3b7d-4c9a-8e21-5d0f7a9b1c33", organizationId: "0b4d6e8f-1a2c-4e3f-9a5b-7c8d9e0f1a2b", owner: { name: "Camille Martin" },
  review: "personal", simulation: false, postgres: { bin: "C:\\pg\\bin", port: 54329, database: "probant_personnel" }, app: { host: "127.0.0.1", port: 3210 }, restoredFrom: null,
};
const secrets = { appPassword: "app pass/é", superPassword: "s", sessionSecret: "x".repeat(64) };

describe("C07 — lanceur : configuration et environnement de Next", () => {
  it("dossier du profil : variable explicite, sinon LOCALAPPDATA sous Windows", () => {
    expect(defaultHome({ PROBANT_LOCAL_HOME: "D:\\Profils\\moi" }, "win32")).toBe(resolve("D:\\Profils\\moi"));
    expect(defaultHome({ LOCALAPPDATA: "C:\\Users\\moi\\AppData\\Local" }, "win32")).toMatch(/PROBANT[\\/]personnel$/);
  });

  it("refuse une configuration qui viserait une base de recette ou un hôte non local", () => {
    expect(validateConfig(config)).toEqual([]);
    expect(validateConfig({ ...config, postgres: { ...config.postgres, database: "probant_ci" } })).toEqual(expect.arrayContaining([expect.stringMatching(/recette jetable/)]));
    expect(validateConfig({ ...config, app: { host: "0.0.0.0", port: 3210 } })).toEqual(expect.arrayContaining([expect.stringMatching(/app.host/)]));
    expect(validateConfig({ ...config, owner: { name: "" } })).toEqual(expect.arrayContaining([expect.stringMatching(/owner.name/)]));
    expect(validateConfig({ ...config, app: { host: "127.0.0.1", port: 54329 } })).toEqual(expect.arrayContaining([expect.stringMatching(/app.port/)]));
  });

  it("l'environnement de Next ouvre les douze chaînes en « personal », neutralise tout distant et forme un profil valide", () => {
    const base = { PATH: "C:\\Windows", SystemRoot: "C:\\Windows", DATABASE_URL: ["postgresql://probant", "x@localhost:5432/probant_ci"].join(":"), BLOB_READ_WRITE_TOKEN: "jeton", PROBANT_CASH_DURABLE: "disposable", AWS_REGION: "eu-west-3", OIDC_ISSUER: "https://idp" };
    const env = childEnv({ config, secrets, home: "C:\\profil", baseEnv: base, documentedKeys: ["S3_PRIVATE_BUCKET", "CSP_MODE"] });
    expect(env.PATH).toBe("C:\\Windows");
    expect(env.DATABASE_URL).toBe(["postgresql://probant_app", "app%20pass%2F%C3%A9@127.0.0.1", "54329/probant_personnel"].join(":"));
    for (const key of [...REMOTE_KEYS, "S3_PRIVATE_BUCKET"]) expect(env[key]).toBe("");
    for (const flag of DURABLE_CHAIN_FLAGS) expect(env[flag]).toBe("personal");
    expect(env).toMatchObject({ PROBANT_RUNTIME_PROFILE: "personal", AUTH_APP_ORIGIN: "http://127.0.0.1:3210", PROBANT_LOCAL_OWNER_NAME: "Camille Martin", PROBANT_LOCAL_REVIEW: "personal", CSP_MODE: "report-only" });
    expect(personalProfileIssues(env)).toEqual([]);
    expect(readLocalAuthConfig(env)).toMatchObject({ profileId: config.profileId, organizationId: config.organizationId, ownerReview: "personal" });
  });

  it("chaque clé documentée de .env.example est fixée par le profil ou neutralisée", () => {
    const keys = envExampleKeys(readFileSync(resolve(__dirname, "../../../.env.example"), "utf8"));
    const env = childEnv({ config, secrets, home: "C:\\profil", baseEnv: {}, documentedKeys: keys });
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) expect(env[key]).toBeDefined();
  });
});

describe("C07 — sauvegarde et restauration : garde-fous", () => {
  it("la restauration va dans un dossier distinct, jamais sur ou dans le profil courant", () => {
    expect(restoreTargetIssues("C:\\P\\personnel", "C:\\P\\restauration", false)).toEqual([]);
    expect(restoreTargetIssues("C:\\P\\personnel", "c:\\p\\PERSONNEL", false)).toEqual(["la cible est le profil courant"]);
    expect(restoreTargetIssues("C:\\P\\personnel", "C:\\P\\personnel\\copie", false)).toEqual(["la cible est à l'intérieur du profil courant"]);
    expect(restoreTargetIssues("C:\\P\\personnel", "C:\\P", false)).toEqual(["la cible contient le profil courant"]);
    expect(restoreTargetIssues("C:\\P\\personnel", "C:\\Q", true)).toEqual(["la cible existe et n'est pas vide"]);
  });

  it("le manifeste relu doit être identique : lignes, empreintes et pièces", () => {
    const expected = { tables: { cash_imports: { rows: 5, digest: "a" }, dossiers: { rows: 1, digest: "b" } }, pieces: [{ key: "k", sha256: "s" }] };
    expect(compareManifests(expected, structuredClone(expected))).toEqual([]);
    expect(compareManifests(expected, { tables: { cash_imports: { rows: 4, digest: "a" }, dossiers: { rows: 1, digest: "c" } }, pieces: [] })).toEqual([
      "cash_imports : 5 lignes attendues, 4 lues", "dossiers : empreinte différente", "pièces locales : inventaire différent"]);
    expect(compareManifests(expected, { tables: { dossiers: { rows: 1, digest: "b" }, autre: { rows: 0, digest: "z" } }, pieces: expected.pieces })).toEqual(["autre : table inattendue", "cash_imports : table absente"]);
  });

  it("chemins et arguments", () => {
    expect(withinDirectory("C:\\P\\pieces", "C:\\P\\pieces\\a\\b.txt")).toBe(true);
    expect(withinDirectory("C:\\P\\pieces", "C:\\P\\pieces\\..\\secrets.json")).toBe(false);
    expect(pieceFile("C:\\P\\pieces", "organizations/o/dossiers/d/documents/x/source")).toBe(resolve("C:\\P\\pieces\\organizations\\o\\dossiers\\d\\documents\\x\\source"));
    for (const key of ["../../victim", "a/../../b", "a\\b", "", "/abs", "a//b", 42]) expect(pieceFile("C:\\P\\pieces", key)).toBeNull();
    expect(loopbackUrl(3210, "/api/auth/session")).toBe("http://127.0.0.1:3210/api/auth/session");
    for (const port of ["3210@evil.example", 80, "x", 70000]) expect(() => loopbackUrl(port, "/")).toThrow();
    expect(() => loopbackUrl(3210, "//evil.example/x")).toThrow();
    expect(parseArgs(["restore", "C:\\s", "--vers", "C:\\t", "--port-pg=54400", "--simulation"])).toEqual({ command: "restore", positional: ["C:\\s"], options: { vers: "C:\\t", "port-pg": "54400", simulation: true } });
  });
});

describe("C07 — migrations locales atomiques", () => {
  it("l'inscription au registre est dans la transaction de la migration", () => {
    expect(atomicMigration("0019_closing_dossier.up.sql", "BEGIN;\nCREATE TABLE x (a int);\nCOMMIT;\n")).toBe("BEGIN;\nCREATE TABLE x (a int);\nINSERT INTO _probant_migrations (name) VALUES ('0019_closing_dossier.up.sql');\nCOMMIT;\n");
    expect(atomicMigration("0003_user.sql", "CREATE TABLE y (b int)")).toBe("CREATE TABLE y (b int);\nINSERT INTO _probant_migrations (name) VALUES ('0003_user.sql');\n");
    expect(() => atomicMigration("x'); DROP TABLE dossiers; --.sql", "")).toThrow();
  });
});

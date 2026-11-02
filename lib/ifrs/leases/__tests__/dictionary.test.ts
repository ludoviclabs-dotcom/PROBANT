import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { previewImport } from "@/lib/workpapers/imports";
import { assertLeaseBatch, LEASE_MAPPING, LEASE_TYPES } from "@/lib/workpapers/lease-sources";
import { periodId, type WorkpaperScope } from "@/lib/workpapers/model";
import type { Principal } from "@/lib/workpapers/policy";
import { assertFields, LEASE_DICTIONARY } from "../dictionary";
import { renderDictionaryMarkdown, templateCsv } from "../dictionary-doc";

/** L16-01 — le dictionnaire versionné et ses modèles CSV restent identiques au contrôle réellement appliqué. */
const root = resolve(__dirname, "../../../..");
const period = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-02-15", currency: "EUR" as const, validation: "provisional" as const };
const scope: WorkpaperScope = { organizationId: "org-d", dossierId: "dossier-d", periodId: periodId(period), mode: "real" };
const actor: Principal = { id: "preparer-d", grants: [{ scope, permissions: ["read", "prepare"] }] };
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("L16-01 dictionnaire des sources", () => {
  it("docs/ifrs/DICTIONNAIRE_L16.md et les modèles sont la sortie exacte du code (npm run ifrs:l16-docs)", () => {
    expect(read("docs/ifrs/DICTIONNAIRE_L16.md")).toBe(renderDictionaryMarkdown());
    for (const type of LEASE_TYPES) expect(read("docs/ifrs/modeles/" + type + ".csv"), type).toBe(templateCsv(type));
  });
  it("chaque modèle CSV passe la porte d'import réelle et la validation de source", async () => {
    for (const type of LEASE_TYPES) {
      const batch = await previewImport(new File([templateCsv(type)], type + ".csv", { type: "text/csv" }), scope, LEASE_MAPPING, actor, type, "ifrs16.leases");
      expect(batch.report.blocking, type).toEqual([]);
      expect(() => assertLeaseBatch(batch, period), type).not.toThrow();
    }
  });
  it("chaque champ a un type, un libellé et une condition de blocage ; un champ inconnu ou une valeur mal formée est refusé", () => {
    for (const specs of Object.values(LEASE_DICTIONARY)) for (const s of specs) { expect(s.label.length).toBeGreaterThan(3); expect(s.blocking.length).toBeGreaterThan(3); if (s.kind === "enum") expect(s.values!.length).toBeGreaterThan(1); }
    expect(() => assertFields("lease_contracts", { inventé: "x" })).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(() => assertFields("lease_contracts", { termMonths: "36 mois" })).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(() => assertFields("lease_contracts", { signatureDate: "15/12/2025" })).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(() => assertFields("lease_assumptions", { annualEffectiveRate: "5%" })).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(() => assertFields("lease_assumptions", { prepaidPayments: "0" })).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(() => assertFields("lease_assumptions", { prepaidPayments: "inconnu", purchaseOption: "non_applicable" })).not.toThrow();
  });
});

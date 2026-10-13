import { describe, expect, it } from "vitest";
import { FRENCH_GAAP_TEXTS, applicableArticle, frenchGaapText, resolveFrenchGaap } from "@/lib/knowledge/french-gaap";

/**
 * C04 — résolveur partagé : applicabilité aux bornes, options absentes, secteur hors périmètre,
 * renumérotation 513-5 / 531-5 rattachée à la version. Attendus établis depuis les articles
 * d'application lus dans les PDF officiels de l'ANC (13/10/2026), indépendamment du code.
 */
const status = (r: ReturnType<typeof resolveFrenchGaap>, id: string) => r.texts.find((t) => t.textId === id)!.status;

describe("registre des textes : dates lues dans les textes officiels", () => {
  it("porte adoption, homologation, publication, première période et anticipation distinctes", () => {
    expect(frenchGaapText("anc-2026-03")).toMatchObject({ adoptionDate: "2026-03-06", homologationDate: "2026-08-12", publicationDate: "2026-09-03", firstMandatory: { kind: "periods_opened_from", date: "2027-01-01" }, anticipation: { allowed: true, from: "2026-09-03", scope: "period_in_progress_at_publication" } });
    expect(frenchGaapText("anc-2026-03").contractualScope).toMatch(/contrats de vente conclus ou renouvelés/);
    expect(frenchGaapText("anc-2026-04")).toMatchObject({ homologationDate: "2026-08-12", publicationDate: "2026-09-03", entryIntoForce: { date: "2026-09-04", basis: "official_page" }, firstMandatory: { kind: "periods_in_progress_at", date: "2026-09-04" }, anticipation: { allowed: false } });
    expect(frenchGaapText("anc-2024-07")).toMatchObject({ adoptionDate: "2024-12-06", homologationDate: "2025-12-26", publicationDate: "2025-12-27", firstMandatory: { kind: "periods_opened_from", date: "2026-01-01" } });
    expect(frenchGaapText("anc-2024-07").exceptions[0]).toMatchObject({ rule: { date: "2025-01-01" } });
    expect(frenchGaapText("anc-2022-06")).toMatchObject({ homologationDate: "2023-12-26", publicationDate: "2023-12-30", firstMandatory: { date: "2025-01-01" }, anticipation: { from: "2023-12-30", scope: "from_publication" } });
  });
  it("chaque édition lue porte une empreinte ; une source inaccessible reste inaccessible, jamais « validée »", () => {
    for (const t of FRENCH_GAAP_TEXTS) for (const e of t.editions) {
      if (e.access === "read_official_pdf") expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      else expect(e.sha256).toBeNull();
    }
    expect(frenchGaapText("pcg-2024").editions[0].access).toBe("inaccessible");
    expect(frenchGaapText("anc-2026-03").editions.some((e) => e.url.includes("legifrance") && e.access === "inaccessible")).toBe(true);
  });
  it("les deux fichiers du PCG consolidé au 01/01/2026 sont identifiés par des empreintes distinctes", () => {
    const shas = frenchGaapText("pcg-2026-01-01").editions.map((e) => e.sha256);
    expect(new Set(shas).size).toBe(2);
  });
});

describe("applicabilité aux bornes", () => {
  it("exercice 2024 : pack 2024 applicable, 513-5 non appliqué rétroactivement, anticipation 2022-06 seulement sur option", () => {
    const r = resolveFrenchGaap({ startDate: "2024-01-01", closingDate: "2024-12-31" });
    expect(status(r, "pcg-2024")).toBe("mandatory");
    expect(status(r, "anc-2022-06")).toBe("anticipation_available");
    expect(status(r, "anc-2024-07")).toBe("not_yet_applicable");
    expect(status(r, "anc-2026-03")).toBe("not_yet_applicable");
    expect(r.numbering.exceptional_result).toMatchObject({ article: "946-67 / 947-77 (PCG au 01/01/2024)", textId: "pcg-2024" });
    expect(r.limits.some((l) => l.startsWith("anc-2022-06 : option d'anticipation non déclarée"))).toBe(true);
  });
  it("exercice 2024 avec option 2022-06 : 513-5 par anticipation, pack 2024 remplacé", () => {
    const r = resolveFrenchGaap({ startDate: "2024-01-01", closingDate: "2024-12-31", anticipated: ["anc-2022-06"] });
    expect(status(r, "anc-2022-06")).toBe("anticipation_elected");
    expect(status(r, "pcg-2024")).toBe("superseded");
    expect(r.numbering.exceptional_result).toMatchObject({ article: "513-5 (ANC 2022-06)", basis: "anticipation_elected" });
  });
  it("borne 2025 : ouverture le 31/12/2024 reste sous le pack 2024 ; le 01/01/2025, 513-5 de plein droit", () => {
    expect(applicableArticle("exceptional_result", { startDate: "2024-12-31", closingDate: "2025-12-30" })?.textId).toBe("pcg-2024");
    expect(applicableArticle("exceptional_result", { startDate: "2025-01-01", closingDate: "2025-12-31" })).toMatchObject({ article: "513-5 (ANC 2022-06)", basis: "mandatory" });
  });
  it("borne 2026 : ANC 2024-07 obligatoire dès l'ouverture au 01/01/2026, pas au 31/12/2025 ; anticipation seulement si l'exercice est en cours au 27/12/2025", () => {
    expect(status(resolveFrenchGaap({ startDate: "2025-12-31", closingDate: "2026-12-30" }), "anc-2024-07")).toBe("not_yet_applicable");
    expect(status(resolveFrenchGaap({ startDate: "2025-01-01", closingDate: "2025-12-31" }), "anc-2024-07")).toBe("anticipation_available");
    expect(status(resolveFrenchGaap({ startDate: "2025-01-01", closingDate: "2025-12-26" }), "anc-2024-07")).toBe("not_yet_applicable");
    expect(status(resolveFrenchGaap({ startDate: "2025-01-01", closingDate: "2025-12-31", anticipated: ["anc-2024-07"] }), "anc-2024-07")).toBe("anticipation_elected");
    expect(resolveFrenchGaap({ startDate: "2026-01-01", closingDate: "2026-12-31" }).numbering.other_equity?.textId).toBe("pcg-2026-01-01");
  });
  it("exercice 2026 : 513-5 lu dans le PCG consolidé 2026, 515-1 rédaction 2026-04 (exercice en cours au 04/09/2026), 531-5 seulement sur option", () => {
    const r = resolveFrenchGaap({ startDate: "2026-01-01", closingDate: "2026-12-31" });
    expect(r.numbering.exceptional_result).toMatchObject({ article: "513-5 (PCG consolidé au 01/01/2026)" });
    expect(status(r, "anc-2026-04")).toBe("mandatory");
    expect(r.numbering.income_tax?.textId).toBe("anc-2026-04");
    expect(status(r, "anc-2026-03")).toBe("anticipation_available");
    expect(r.numbering.revenue).toBeUndefined();
    const elected = resolveFrenchGaap({ startDate: "2026-01-01", closingDate: "2026-12-31", anticipated: ["anc-2026-03"] });
    expect(elected.numbering.exceptional_result).toMatchObject({ article: "531-5 (ANC 2026-03)", basis: "anticipation_elected" });
    expect(elected.numbering.income_tax).toMatchObject({ article: "542-1 (ANC 2026-03)" });
    expect(status(elected, "anc-2026-04")).toBe("superseded");
  });
  it("ANC 2026-04 : un exercice clos le 31/08/2026 n'est pas en cours à l'entrée en vigueur ; un exercice ouvert le 01/09/2026 l'est", () => {
    expect(status(resolveFrenchGaap({ startDate: "2025-09-01", closingDate: "2026-08-31" }), "anc-2026-04")).toBe("not_yet_applicable");
    expect(status(resolveFrenchGaap({ startDate: "2026-09-01", closingDate: "2027-08-31" }), "anc-2026-04")).toBe("mandatory");
  });
  it("ANC 2026-03 : anticipation réservée à l'exercice en cours au 03/09/2026 ; un exercice ouvert le 01/10/2026 ne peut ni anticiper ni l'appliquer", () => {
    const late = resolveFrenchGaap({ startDate: "2026-10-01", closingDate: "2027-09-30", anticipated: ["anc-2026-03"] });
    expect(status(late, "anc-2026-03")).toBe("not_yet_applicable");
    expect(late.numbering.exceptional_result?.article).toBe("513-5 (PCG consolidé au 01/01/2026)");
  });
  it("borne 2027 : ouverture le 01/01/2027, 531-5 et 542-1 de plein droit ; 2022-06 et le PCG 2026 remplacés sur ces sujets", () => {
    const r = resolveFrenchGaap({ startDate: "2027-01-01", closingDate: "2027-12-31" });
    expect(r.numbering.exceptional_result).toMatchObject({ article: "531-5 (ANC 2026-03)", basis: "mandatory" });
    expect(r.numbering.income_tax).toMatchObject({ article: "542-1 (ANC 2026-03)" });
    expect(r.numbering.revenue).toMatchObject({ textId: "anc-2026-03" });
    expect(status(r, "anc-2022-06")).toBe("superseded");
    expect(r.numbering.other_equity?.textId).toBe("pcg-2026-01-01");
  });
});

describe("options absentes et secteur hors périmètre", () => {
  it("option déclarée pour un texte sans anticipation : refusée, texte non appliqué", () => {
    const r = resolveFrenchGaap({ startDate: "2025-01-01", closingDate: "2025-12-31", anticipated: ["anc-2026-04"] });
    expect(status(r, "anc-2026-04")).toBe("not_yet_applicable");
    expect(r.texts.find((t) => t.textId === "anc-2026-04")!.reasons.join(" ")).toMatch(/n'admet aucune anticipation/);
  });
  it("référentiel sectoriel : tout est hors périmètre, aucune numérotation résolue", () => {
    const r = resolveFrenchGaap({ startDate: "2026-01-01", closingDate: "2026-12-31", profile: "sector_specific" });
    expect(r.texts.every((t) => t.status === "out_of_scope_sector")).toBe(true);
    expect(r.numbering).toEqual({});
    expect(r.limits).toContain("Référentiel sectoriel : aucune numérotation résolue.");
  });
  it("période invalide : inconnu, jamais une version par défaut", () => {
    const r = resolveFrenchGaap({ startDate: "2026-12-31", closingDate: "2026-01-01" });
    expect(r.texts.every((t) => t.status === "unknown")).toBe(true);
    expect(r.numbering).toEqual({});
  });
});

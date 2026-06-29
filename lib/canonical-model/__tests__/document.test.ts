import { describe, it, expect } from "vitest";
import { buildFecDocument, buildStatementDocuments } from "../document";
import type { FecEntry, Finding, SiloView } from "../index";

function makeEntry(partial: Partial<FecEntry> & { ligne: number }): FecEntry {
  return {
    journalCode: "OD",
    journalLib: "Opérations diverses",
    ecritureNum: "1",
    ecritureDate: "20240115",
    compteNum: "606",
    compteLib: "Achats",
    compAuxNum: "",
    compAuxLib: "",
    pieceRef: "",
    pieceDate: "",
    ecritureLib: "Écriture",
    debit: 0,
    credit: 0,
    ecritureLet: "",
    dateLet: "",
    validDate: "",
    montant: 0,
    ...partial,
  };
}

function makeFinding(partial: Partial<Finding> & { id: string }): Finding {
  return {
    family: "hardLaw",
    severity: "majeur",
    ruleId: "R-TEST",
    ruleVersion: "1.0.0",
    cloison: "bilan-actif",
    siloId: "immobilisations-corporelles",
    titre: "Constat",
    constat: "…",
    explication: "…",
    mesure: { constate: 100000, seuil: 0, unite: "EUR", libelle: "x" },
    source: { ref: "PCG", citation: "…", effectiveDate: "2025-01-01" },
    comptesConcernes: [],
    lignesSource: [],
    faisceau: [],
    preuve: [],
    statutRevue: "en_attente",
    ...partial,
  };
}

describe("buildFecDocument", () => {
  const entries: FecEntry[] = [
    makeEntry({ ligne: 1, compteNum: "706", compteLib: "Ventes", credit: 1_000_000 }),
    makeEntry({ ligne: 2, compteNum: "215", compteLib: "Installations", debit: 480_000 }),
    makeEntry({ ligne: 3, compteNum: "401", compteLib: "Fournisseurs", credit: 480_000 }),
  ];

  it("relie les constats aux lignes via lignesSource", () => {
    const doc = buildFecDocument({
      societe: "DEMO",
      exercice: "2024",
      entries,
      findings: [makeFinding({ id: "F-L2", lignesSource: [2] })],
    });
    const row1 = doc.ledger!.find((r) => r.ligne === 1)!;
    const row2 = doc.ledger!.find((r) => r.ligne === 2)!;
    expect(row1.flagIds).toEqual([]);
    expect(row2.flagIds).toContain("F-L2");
  });

  it("calcule les totaux et l'équilibre", () => {
    const doc = buildFecDocument({
      societe: "DEMO",
      exercice: "2024",
      entries,
      findings: [],
    });
    expect(doc.metadata.totalDebit).toBe(480_000);
    expect(doc.metadata.totalCredit).toBe(1_480_000);
    expect(doc.metadata.nbLignes).toBe(3);
    expect(doc.metadata.admissibilite).toBe("conforme");
  });

  it("passe en rejeté si une alerte bloquante d'admissibilité existe", () => {
    const doc = buildFecDocument({
      societe: "DEMO",
      exercice: "2024",
      entries,
      findings: [],
      admissibilite: [makeFinding({ id: "ADM", severity: "bloquant" })],
    });
    expect(doc.metadata.admissibilite).toBe("rejete");
  });

  it("enrichit les constats (risque de faux positif renseigné)", () => {
    const doc = buildFecDocument({
      societe: "DEMO",
      exercice: "2024",
      entries,
      findings: [makeFinding({ id: "F", lignesSource: [2] })],
    });
    expect(doc.findings[0].fauxPositifRisk).toBeDefined();
  });
});

describe("buildStatementDocuments", () => {
  const silos: SiloView[] = [
    {
      siloId: "immobilisations-corporelles", // bilan-actif
      statement: {
        titre: "Immobilisations",
        unite: "EUR",
        rows: [
          {
            id: "r-immo",
            label: "VNC",
            valeur: 288000,
            kind: "total",
            flaggedBy: "FA",
            severity: "majeur",
          },
        ],
      },
      findings: [makeFinding({ id: "FA", siloId: "immobilisations-corporelles" })],
    },
    {
      siloId: "chiffre-affaires", // resultat
      statement: {
        titre: "Chiffre d'affaires",
        unite: "EUR",
        rows: [{ id: "r-ca", label: "CA", valeur: 1_000_000, kind: "total" }],
      },
      findings: [
        makeFinding({ id: "FB", cloison: "resultat", siloId: "chiffre-affaires" }),
      ],
    },
  ];

  it("construit un Bilan et un Compte de résultat", () => {
    const docs = buildStatementDocuments(silos, { label: "X", exercice: "2024" });
    const types = docs.map((d) => d.type);
    expect(types).toContain("Bilan");
    expect(types).toContain("Resultat");
  });

  it("classe les postes du bilan côté actif", () => {
    const docs = buildStatementDocuments(silos, { label: "X", exercice: "2024" });
    const bilan = docs.find((d) => d.type === "Bilan")!;
    expect(bilan.sections![0].cote).toBe("actif");
  });

  it("enrichit les constats des états", () => {
    const docs = buildStatementDocuments(silos, { label: "X", exercice: "2024" });
    const bilan = docs.find((d) => d.type === "Bilan")!;
    expect(bilan.findings[0].fauxPositifRisk).toBeDefined();
  });

  it("n'inclut aucun document pour une liste de silos vide", () => {
    expect(buildStatementDocuments([], { label: "X", exercice: "2024" })).toEqual([]);
  });
});

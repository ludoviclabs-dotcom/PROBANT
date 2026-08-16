import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createIngestionJob, processFecIngestion } from "../service";

describe("ingestion service", () => {
  it("runs the observable FEC pipeline and builds one active snapshot", async () => {
    const content = await readFile(
      path.join(
        process.cwd(),
        "lib",
        "ingestion",
        "__fixtures__",
        "fec-valid.txt",
      ),
    );
    const file = new File([content], "123456789FEC20261231.txt", {
      type: "text/plain",
    });
    const { job, validation } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
    });
    expect(validation.ok).toBe(true);
    expect(job.status).toBe("uploaded");

    const result = await processFecIngestion(job);
    expect(result.job.status).toBe("completed");
    expect(result.snapshot.dossier.id).toBe(job.dossierId);
    expect(result.snapshot.sourceDocuments[0].id).toBe(job.documentId);
    expect(result.depotResult.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.depotResult.mapping.nbEntries).toBe(3);
    expect(result.depotResult.mapping.colonnes).toHaveLength(18);
    expect(result.depotResult.parseErrors).toEqual([]);
    expect(result.snapshot.calculationContext.controlsEligible).toBe(15);
    expect(result.snapshot.calculationContext.controlsExecuted).toBe(15);
  });

  it("does not execute fiscal or accounting review after a technical FEC rejection", async () => {
    const content = await readFile(
      path.join(
        process.cwd(),
        "lib",
        "ingestion",
        "__fixtures__",
        "fec-rejected.txt",
      ),
    );
    const file = new File([content], "123456789FEC20261231.txt", {
      type: "text/plain",
    });
    const { job } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
    });
    const result = await processFecIngestion(job);
    expect(
      result.depotResult.admissibilite.some(
        (finding) => finding.severity === "bloquant",
      ),
    ).toBe(true);
    expect(result.depotResult.analyse).toEqual([]);
    expect(result.snapshot.calculationContext.controlsEligible).toBe(15);
    expect(result.snapshot.calculationContext.controlsExecuted).toBe(6);
  });

  it("keeps a fiscal chronology finding out of technical FEC rejection", async () => {
    const content = [
      "JournalCode;JournalLib;EcritureNum;EcritureDate;CompteNum;CompteLib;CompAuxNum;CompAuxLib;PieceRef;PieceDate;EcritureLib;Debit;Credit;EcritureLet;DateLet;ValidDate;Montantdevise;Idevise",
      "VE;Ventes;VE-1;20260201;411000;Clients;C001;CLIENT TEST;FAC-001;20260201;Facture 1;1200,00;0;;;20260201;;",
      "VE;Ventes;VE-1;20260201;706000;Prestations;;;FAC-001;20260201;Facture 1;0;1200,00;;;20260201;;",
      "VE;Ventes;VE-2;20260101;411000;Clients;C002;CLIENT TEST 2;FAC-002;20260101;Facture 2;800,00;0;;;20260101;;",
      "VE;Ventes;VE-2;20260101;706000;Prestations;;;FAC-002;20260101;Facture 2;0;800,00;;;20260101;;",
    ].join("\n");
    const file = new File([content], "123456789FEC20261231.txt", {
      type: "text/plain",
    });
    const { job } = await createIngestionJob({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      file,
    });

    const result = await processFecIngestion(job);
    const chronology = result.depotResult.analyse.find(
      (finding) => finding.ruleId === "R-HL-007",
    );

    expect(chronology).toMatchObject({
      controlStage: "tax_review",
      severity: "majeur",
    });
    expect(
      result.depotResult.admissibilite.some(
        (finding) => finding.ruleId === "R-HL-007",
      ),
    ).toBe(false);
    expect(result.snapshot.calculationContext.controlsExecuted).toBe(15);
  });
});


import { describe, expect, it } from "vitest";
import { cents, money } from "@/lib/canonical-model/money";
import { leaseReviewSummary } from "@/lib/ifrs/leases/review-summary";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEASE_EXAMPLE_EMISSION, leaseDemoExport, leaseDemoView } from "../lease-demo";
import { buildLeaseExport, LEASE_EXPORT_FORMATS, type LeaseExportInput } from "../lease-export";
import type { LeaseResult } from "../lease-review";
import type { WorkpaperRun } from "../model";

/**
 * L16-05 — exports de la feuille et synthèse de revue, sur le scénario synthétique (F01, F03 cadrés ; D08 calculé en écart ; D04, D06 bloqués).
 * Les totaux sont relus dans chaque format et comparés à la vue serveur : JSON = CSV = HTML = écran.
 */
const parseCsv = (text: string) => { const [head, ...rows] = text.trim().split("\r\n").map(l => l.split(",")); return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))); };
const sum = (xs: string[]) => money(xs.filter(Boolean).reduce((t, x) => t + cents({ amount: x, currency: "EUR" }), 0n)).amount;
async function scenario() {
  const view = await leaseDemoView(), run = view.runs[0], result = run.result!.result as LeaseResult;
  const base: Omit<LeaseExportInput, "format" | "kind"> = { run, result, qualification: (view.qualification as Record<string, never>)[run.id], facts: [], bundle: (view.adjustments as Record<string, never>)[run.id],
    sources: view.imports.map(b => ({ importId: b.id, documentVersionId: b.document.id, documentType: b.document.documentType, fileName: b.document.fileName, sha256: b.document.byteHash, rows: b.rowCount ?? b.rows.length, approvedAt: b.approval?.at ?? null })),
    standing: { latestRevision: true, sourcesCurrent: true, ruleCurrent: true }, emission: { exportedAt: "2027-02-20T10:00:00.000Z", exportedBy: "test" } };
  return { view, run, result, base };
}

describe("L16-05 exports de la feuille", () => {
  it("même version : même empreinte métier et mêmes données ; seules les métadonnées d'émission changent", async () => {
    const a = await leaseDemoExport("json"), b = await leaseDemoExport("json");
    expect(a.businessHash).toBe(b.businessHash);
    const ja = JSON.parse(a.content), jb = JSON.parse(b.content);
    expect(ja.business).toEqual(jb.business);
    expect(ja.manifest).toEqual(jb.manifest);
    expect(ja.emission).toMatchObject({ exportedBy: "scénario synthétique", format: "json" });
    for (const format of LEASE_EXPORT_FORMATS) expect((await leaseDemoExport(format)).businessHash).toBe(a.businessHash);
    expect(a.fileName).toMatch(/^simulation-non-revue-locations-ifrs16-SYN-LEAS-r1v5-diagnostic\.json$/);
  });

  it("totaux identiques à l'écran, dans le JSON, les CSV et le HTML ; montants inconnus jamais comptés pour zéro", async () => {
    const { view, run, result } = await scenario(), json = JSON.parse((await leaseDemoExport("json")).content), html = (await leaseDemoExport("html")).content;
    const contracts = parseCsv((await leaseDemoExport("contracts_csv")).content), schedules = parseCsv((await leaseDemoExport("schedules_csv")).content), journal = (await leaseDemoExport("journal_csv")).content;
    const subtotal = result.portfolio.computedSubtotal!, screen = (view.portfolio as Record<string, { summary: { amounts: { debtClosing: { amount: string } } } }>)[run.id].summary.amounts;
    expect(sum(contracts.map(c => c.debt_closing))).toBe(subtotal.debtClosing.amount);
    expect(screen.debtClosing.amount).toBe(subtotal.debtClosing.amount);
    expect(json.business.calculation.portfolio.computedSubtotal.debtClosing).toEqual(subtotal.debtClosing);
    expect(json.business.journal.totals).toEqual(result.bundleTotals);
    const lines = journal.trim().split("\n").slice(1).map(l => l.split(";"));
    expect(sum(lines.map(l => l[14]))).toBe(result.bundleTotals!.debit.amount);
    expect(sum(lines.map(l => l[15]))).toBe(result.bundleTotals!.credit.amount);
    expect(html).toContain("débit 51 901,17 €, crédit 51 901,17 €");
    // D04 (to complete) carries no amount: empty cells and the reason, never 0.00.
    expect(contracts.find(c => c.contract_id === "D04")).toMatchObject({ amounts: "aucun montant déterminé", debt_closing: "", rou_net_closing: "" });
    expect(schedules.filter(r => r.contract_id === "F03")).toHaveLength(36);
    expect(sum(schedules.filter(r => r.contract_id === "F03" && r.due_date <= "2026-12-31").map(r => r.undiscounted_payment))).toBe("12000.00");
  });

  it("rapport HTML imprimable : contexte répété, en-têtes de tableau répétés, mesures distinctes, informations non couvertes", async () => {
    const html = (await leaseDemoExport("html")).content;
    expect(html).toContain("thead{display:table-header-group}");
    expect(html).toContain("Flux de trésorerie non actualisés, dette actualisée et principal par échéance");
    expect(html).toContain("Informations non couvertes et limites");
    expect(html).toContain("Aucun classement de la dette en courant et non courant n&#39;est affirmé");
    expect(html).toContain("Export diagnostic — version non revue");
    expect(html).toContain("scénario synthétique — simulation non revue");
    expect(html).toContain("Métadonnées d'émission, hors empreinte métier");
    expect(html).not.toMatch(/conforme IFRS(?! ni)/);
    expect(html).not.toMatch(/<script/i);
  });

  it("export revu : version approuvée, à jour, dernière révision ; sinon un motif dit quoi faire", async () => {
    const { run, base } = await scenario();
    expect(() => buildLeaseExport({ ...base, kind: "reviewed", format: "json" })).toThrow("L16_EXPORT_NOT_REVIEWED");
    const approved: WorkpaperRun = { ...run, state: "approved", approval: { actorId: "Préparateur synthétique", snapshotHash: "0".repeat(64), note: "Relecture", at: "2027-02-12T10:00:00.000Z", version: 5, kind: "personal", reviewerName: "Camille Martin (exemple)" } };
    const reviewed = buildLeaseExport({ ...base, run: approved, kind: "reviewed", format: "html" });
    expect(reviewed.content).toContain("Revu sur ce périmètre — relecture personnelle nommée de la version exportée ; ce n&#39;est ni une conformité IFRS ni une annexe exhaustive");
    expect(reviewed.content).toContain("relecture personnelle nommée de Camille Martin (exemple)");
    expect(reviewed.businessHash).not.toBe(buildLeaseExport({ ...base, run: approved, kind: "diagnostic", format: "html" }).businessHash);
    expect(() => buildLeaseExport({ ...base, run: approved, kind: "reviewed", format: "json", standing: { ...base.standing, sourcesCurrent: false } })).toThrow("L16_SOURCE_REPLACED_REVISION_REQUIRED");
    expect(() => buildLeaseExport({ ...base, run: approved, kind: "reviewed", format: "json", standing: { ...base.standing, ruleCurrent: false } })).toThrow("L16_RULE_REPLACED_REVISION_REQUIRED");
    expect(() => buildLeaseExport({ ...base, run: approved, kind: "reviewed", format: "json", standing: { ...base.standing, latestRevision: false } })).toThrow("L16_REVISION_REPLACED");
  });

  it("feuille bloquée : export diagnostic sans montant ni journal ; le motif du blocage est écrit", async () => {
    const { run, base } = await scenario();
    const blocked: WorkpaperRun = { ...run, state: "blocked", result: { ...run.result!, execution: "blocked", result: undefined, blockedControls: ["rule_not_applicable"] } as never };
    const input = { ...base, run: blocked, result: null, bundle: null, kind: "diagnostic" as const };
    const html = buildLeaseExport({ ...input, format: "html" }).content, contracts = parseCsv(buildLeaseExport({ ...input, format: "contracts_csv" }).content);
    expect(html).toContain("Calcul non disponible (blocked) : rule_not_applicable. Aucun montant.");
    expect(contracts.every(c => c.debt_closing === "" && c.result === "non calculé")).toBe(true);
    expect(() => buildLeaseExport({ ...input, format: "journal_csv" })).toThrow("L16_EXPORT_NO_ADJUSTMENT");
  });
});

describe("L16-05 exemple synthétique publié", () => {
  it("docs/ifrs/exemples/l16-05 est exactement ce que le code produit (npm run ifrs:l16-docs) : aucune dérive silencieuse", async () => {
    for (const format of LEASE_EXPORT_FORMATS) {
      const file = await leaseDemoExport(format, LEASE_EXAMPLE_EMISSION);
      // Line endings are normalized on both sides: Git may check the example out with CRLF (core.autocrlf), as for the journal model.
      const lf = (text: string) => text.replace(/\r\n/g, "\n");
      expect(lf(readFileSync(join(__dirname, "../../../docs/ifrs/exemples/l16-05", file.fileName), "utf8")), file.fileName).toBe(lf(file.content));
    }
  });
});

describe("L16-05 synthèse de revue", () => {
  it("par contrat : exceptions, jugements de durée et de taux cités, cadrage, résultat, retraitement ; points bloquants comptés jusqu'à leur résolution", async () => {
    const { view, run, result } = await scenario(), summary = (view.review as Record<string, ReturnType<typeof leaseReviewSummary>>)[run.id];
    const f03 = summary.contracts.find(c => c.contractId === "F03")!, d04 = summary.contracts.find(c => c.contractId === "D04")!;
    expect(f03).toMatchObject({ determined: true, framing: "framed", adjustment: { status: "included", lines: 6 } });
    expect(f03.judgements.rate).toMatchObject({ value: "0.05", basis: "annual_effective", text: expect.any(String), proof: { fileName: expect.any(String), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(f03.judgements.term.value).toBe("36");
    expect(d04.exceptions.map(e => e.code)).toContain("X19");
    expect(d04).toMatchObject({ determined: false, result: "not_applicable" });
    expect(summary.portfolio).toMatchObject({ tax: "not_computed", population: { contracts: 7, determined: 3, undetermined: 4, computedSubtotal: { partial: true } }, adjustment: { status: "proposed", contracts: 2, lines: 11 } });
    expect(summary.portfolio.annexLimits.length).toBeGreaterThanOrEqual(4);
    // A blocking point stays open until a cited resolution; an unrelated note changes nothing.
    const withPoints: WorkpaperRun = { ...run, notes: [
      { id: "lease:cadrage:D08", kind: "observation", text: "écart", amount: { kind: "unknown", reason: "x" }, authorId: "a", blocking: true },
      { id: "note-libre", kind: "observation", text: "commentaire", amount: { kind: "unknown", reason: "x" }, authorId: "a", blocking: false }] };
    const again = leaseReviewSummary(withPoints, result, (view.qualification as Record<string, never>)[run.id], [], null);
    expect(again.contracts.find(c => c.contractId === "D08")!.points).toEqual({ open: 1, blockingOpen: 1, resolved: 0 });
    expect(again.portfolio.points.blockingOpen).toBe(1);
    const resolved: WorkpaperRun = { ...withPoints, notes: withPoints.notes.map(n => n.id === "lease:cadrage:D08" ? { ...n, resolution: { text: "Écart documenté", authorId: "a", at: "2027-02-11T10:00:00.000Z" } } : n) };
    expect(leaseReviewSummary(resolved, result, null, [], null).portfolio.points).toMatchObject({ blockingOpen: 0, resolved: 1 });
  });
});

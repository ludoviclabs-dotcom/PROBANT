import { describe, expect, it } from "vitest";
import { fixedAssetMovements, frameFixedAssets, recalculateDepreciation, type Movement } from "../fixed-assets";
import { period, scope } from "./fixtures";
import { proof, known } from "./cutoff-fixtures";
const context = { scope, period, purpose: "synthetic_technical" as const };
const value = (s: string, date = period.closingDate) => ({ amount: known(s).value, date, basis: "EUR", evidence: [proof] });
const movement = (o: string, a: string, d: string, c: string): Movement => ({ opening: value(o, period.startDate), additions: [value(a)], disposals: [value(d)], reversals: [], reclassifications: [], closing: value(c) });
describe("Immobilisations synthétiques", () => {
  it("cadre le registre et le module par actif, puis le module et le GL par compte", () => {
    const row = (id: string, party: string, amount: string) => ({ id, key: id, party, account: "21", value: value(amount) });
    const framed = frameFixedAssets(context,
      [row("R1", "A1", "400.00"), row("R2", "A2", "300.00")],
      [row("M1", "A1", "400.00"), row("M2", "A2", "300.00")],
      [row("GL", "TOTAL", "700.00")], []);
    expect(framed.registerToModule.net).toEqual(known("0.00"));
    expect(framed.moduleToLedger.net).toEqual(known("0.00"));
  });
  it("sépare les trois ponts et obtient VNC 720", () => { const r = fixedAssetMovements(context, [{ id: "SYN-A", family: "SYN-F", status: "in_service", gross: movement("1000.00", "200.00", "100.00", "1100.00"), amortization: movement("300.00", "100.00", "40.00", "360.00"), impairment: movement("20.00", "0.00", "0.00", "20.00") }]); expect(r.rows[0].vnc).toEqual(known("720.00").value); expect(r.rows[0].amortization.difference).toEqual(known("0.00")); });
  it("recalcul fermé sans méthode et prorata documenté", () => { expect(recalculateDepreciation(context, { method: null, kind: "linear", cost: value("1000.00"), residual: value("0.00"), inServiceDate: null, durationMonths: 60, prorata: { numerator: "1", denominator: "1", evidence: [] }, rounding: "half_up_cent" }).kind).toBe("unknown"); });
  it("linéaire exact avec paramètres synthétiques explicites", () => { expect(recalculateDepreciation(context, { method: { id: "SYN", version: "1", source: "fixture synthétique", from: period.startDate, to: period.closingDate, approvedBy: "SYN", synthetic: true }, kind: "linear", cost: value("1000.00"), residual: value("100.00"), inServiceDate: period.startDate, durationMonths: 60, prorata: { numerator: "1", denominator: "2", evidence: [proof] }, rounding: "half_up_cent" })).toEqual(known("90.00")); });
  it("refuse mouvement hors période et double identité", () => { const a = { id: "A", family: "F", status: "in_progress" as const, gross: movement("0.00", "0.00", "0.00", "0.00"), amortization: movement("0.00", "0.00", "0.00", "0.00"), impairment: movement("0.00", "0.00", "0.00", "0.00") }; expect(() => fixedAssetMovements(context, [a, a])).toThrow(); a.gross.additions[0].date = "2025-01-01"; expect(() => fixedAssetMovements(context, [a])).toThrow(); });
});

import { describe, expect, it } from "vitest";
import { reconcileBalances, type BalanceLine } from "../cycle-review";
import { period, scope } from "./fixtures";
import { known, proof } from "./cutoff-fixtures";

/**
 * C11 — « résidus par clé et compensations globales » sur le rapprochement de cadrage partagé (clients.frame) :
 * attendus posés à la main. Gauche 100 / 50, droite 50 / 100 : résidus +50 et −50, net 0, brut 100.
 */
const context = { scope, period, purpose: "synthetic_technical" as const };
const line = (id: string, party: string, amount: string): BalanceLine => ({ id, key: id, account: "411000", party, value: { amount: known(amount).value, date: period.closingDate, basis: "closing_balance", evidence: [proof] } });

describe("C11 — résidus par clé et compensation globale", () => {
  it("un net nul qui masque deux résidus opposés reste un écart brut de 100, jamais une concordance", () => {
    const r = reconcileBalances(context, [line("L-A", "A", "100.00"), line("L-B", "B", "50.00")], [line("R-A", "A", "50.00"), line("R-B", "B", "100.00")], "party");
    expect(r.rows.map((x) => [x.key, x.difference])).toEqual([["A", known("50.00")], ["B", known("-50.00")]]);
    expect(r.net).toEqual(known("0.00"));
    expect(r.gross).toEqual(known("100.00"));
    expect(r.convention).toContain("résidus non compensés");
  });
  it("une clé absente d'une source rend le rapprochement partiel, sans zéro documenté", () => {
    const r = reconcileBalances(context, [line("L-A", "A", "100.00"), line("L-C", "C", "30.00")], [line("R-A", "A", "100.00")], "party");
    expect(r.rows.find((x) => x.key === "A")?.difference).toEqual(known("0.00"));
    expect(r.rows.find((x) => x.key === "C")?.difference.kind).toBe("unknown");
    expect(r.net.kind).toBe("unknown"); expect(r.gross.kind).toBe("unknown");
  });
});

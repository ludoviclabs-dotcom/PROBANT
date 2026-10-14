import { describe, expect, it } from "vitest";
import { buildPayablesFacts, type PayableProcedure, type PayablesResult } from "../payables-investigation";
import { buildTransversalEventMap } from "../transversal-events";
import { eventMapInput, type PayablesObservation } from "../transversal-events-adapter";
import { fixture, presentationRun } from "./payables-fixture";

/**
 * C11 — raccord de la chaîne réelle Achats / RPNE (fixture déterministe de la Mission 08, moteur exécuté) à la carte :
 * l'événement D, observé par les deux procédures, garde un seul résiduel de 600 HT (attendu de la recette Mission 08) ;
 * le paiement groupé G garde ses 600 TTC non affectés hors de toute clé ; la vente de cut-off est projetée une fois.
 */
async function observation(procedure: PayableProcedure, id: string, stale = false): Promise<PayablesObservation> {
  const f = await fixture(procedure), run = presentationRun(f, id);
  return { run, result: run.result!.result as PayablesResult, facts: buildPayablesFacts(f.scope, f.period, f.imports, id, procedure), stale, staleReasons: stale ? ["Une source approuvée a été remplacée."] : [], href: "/payables?id=" + id };
}

describe("C11 — carte des événements sur la chaîne réelle Achats / RPNE", () => {
  it("D : un seul effet de 600 HT pour deux procédures ; G : reliquat de 600 TTC gardé en règlement global", async () => {
    const purchases = await observation("payables.purchases", "PURCHASES"), rpne = await observation("payables.rpne", "RPNE");
    const map = buildTransversalEventMap(eventMapInput({ scope: purchases.run.scope, period: purchases.run.period, payables: [purchases, rpne], clientsSales: [], vat: [], vatChain: "disabled" }));
    const d = map.events.find((e) => e.invoiceId === "I-D")!;
    expect(d.accounting).toMatchObject({ status: "candidate", candidate: "FNP", amountHt: { kind: "known", value: { amount: "600.00", currency: "EUR" } } });
    expect(d.observations.filter((o) => o.status === "candidate")).toHaveLength(2);
    expect(d.effect).toMatchObject({ amountCents: 60000, contributors: 2 });
    expect(d.rule).toMatchObject({ status: "resolved" });
    const g = map.globalSettlements.find((s) => s.id === "P-G")!;
    expect(g.unallocatedTtc).toEqual({ amount: "600.00", currency: "EUR" });
    // Comme la synthèse Achats (Mission 08) : la RPNE non concluante sur le paiement groupé suspend le candidat de G.
    const gEvent = map.events.find((e) => e.invoiceId === "I-G")!;
    expect(gEvent).toMatchObject({ accounting: { status: "inconclusive" }, effect: null });
    const sale = map.events.filter((e) => e.flow === "sale");
    expect(sale).toHaveLength(1);
    expect(sale[0].observations.map((o) => o.procedureId).sort()).toEqual(["payables.purchases", "payables.rpne"]);
    // Sans colonne de nature ni d'option dans les sources Mission 08 : la TVA reste « information requise », jamais supposée.
    expect(d.dates.vat.exigibility.status).toBe("information_required");
    expect(d.dates.vat.exigibility.missing[0]).toMatch(/Nature de l’opération/);
    expect(map.vatChain).toBe("disabled");
    expect(map.limitations.some((l) => l.includes("Feuilles TVA non lues"))).toBe(true);
    const stage = map.bridge.stages.find((s) => s.target === "resultat" && s.direction === "decrease")!;
    expect(stage.initialCents).toBe(stage.detectedCents - stage.exactRepeatsCents);
  });
  it("une feuille périmée reste visible et ne compte plus dans l'effet", async () => {
    const purchases = await observation("payables.purchases", "PURCHASES", true), rpne = await observation("payables.rpne", "RPNE");
    const map = buildTransversalEventMap(eventMapInput({ scope: rpne.run.scope, period: rpne.run.period, payables: [purchases, rpne], clientsSales: [], vat: [], vatChain: "disabled" }));
    const d = map.events.find((e) => e.invoiceId === "I-D")!;
    expect(d.observations.find((o) => o.procedureId === "payables.purchases")).toMatchObject({ stale: true });
    expect(d.effect).toMatchObject({ contributors: 1 });
    expect(d.dependencies.some((x) => x.stale && x.kind === "run")).toBe(true);
  });
});

// @vitest-environment jsdom
/**
 * Ergonomie relevée par le premier essai sur le profil personnel (jeu fictif « Atelier Ferrand ») : date de revue saisie « 20207 »,
 * contrat historique annoncé « calculable » sans dire qu'il finira en diagnostic, politique attendue noyée dans le tableau des catégories,
 * libellé « autre(s) » du cadrage PCG. Aucun calcul ici : l'écran lit les raisons et la qualification servies par le serveur.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { LeaseFraming } from "@/lib/ifrs/leases/framing";
import type { LeaseQualification } from "@/lib/ifrs/leases/qualification";
import { leaseDemoView } from "@/lib/workpapers/lease-demo";
import { CompletenessMatrix } from "../CompletenessMatrix";
import { awaitedPolicies, infoNotes, leaseFailureMessage, periodInputIssues } from "../format";
import { PolicyEditor } from "../PolicyEditor";

let qualification: LeaseQualification, framing: LeaseFraming | null;
beforeAll(async () => {
  const view = await leaseDemoView(), id = view.runs[0].id;
  qualification = (view.qualification as Record<string, LeaseQualification>)[id];
  framing = (view.framing as Record<string, LeaseFraming | null>)[id];
});
afterEach(cleanup);

describe("Saisie de l'exercice", () => {
  it("une année à 5 chiffres, une date vide ou impossible est nommée par son champ, avant tout envoi ; l'ordre des dates est contrôlé", () => {
    const ok = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-02-15" };
    expect(periodInputIssues(ok)).toEqual([]);
    expect(periodInputIssues({ ...ok, asOfDate: "20207-02-15" })).toEqual(["Date de revue : date invalide (« 20207-02-15 ») — jour, mois et année sur 4 chiffres attendus."]);
    expect(periodInputIssues({ ...ok, startDate: "", closingDate: "2026-02-30" }).map(i => i.split(" :")[0])).toEqual(["Début d'exercice", "Clôture"]);
    expect(periodInputIssues({ ...ok, asOfDate: "2026-12-30" })).toEqual(["Ordre requis : début d'exercice ≤ clôture ≤ date de revue."]);
    // What the date field keeps when a fifth digit rolls the year over: out of the field's 1900-2999 range, named the same way.
    expect(periodInputIssues({ ...ok, asOfDate: "0207-02-15" })).toEqual(["Date de revue : date invalide (« 0207-02-15 ») — jour, mois et année sur 4 chiffres attendus."]);
  });
  it("le refus L16_REQUEST_INVALID dit quoi vérifier au lieu du seul code", () => {
    expect(leaseFailureMessage("L16_REQUEST_INVALID", 400)).toContain("Vérifiez les dates de l'exercice");
  });
});

describe("Qualification dite avant le calcul", () => {
  it("un contrat historique sans ouverture (X24) annonce son diagnostic sous son statut ; le motif est listé comme information, sans bloquer", () => {
    const [first, ...rest] = qualification.contracts;
    const historical = { ...first, reasons: [...first.reasons, { code: "X24", effect: "info" as const, message: "Contrat historique sans ouverture validée : calcul affiché en diagnostic, aucun retraitement déterminé" }] };
    expect(infoNotes(historical)).toEqual(["Calcul en diagnostic : contrat antérieur à l'exercice sans ouverture IFRS validée (X24)"]);
    expect(infoNotes(first)).toEqual([]);
    render(<CompletenessMatrix qualification={{ ...qualification, contracts: [historical, ...rest] }} framing={framing} filter="all" selected={null} onFilter={() => {}} onOpen={() => {}}/>);
    const row = screen.getByRole("button", { name: first.contractId }).closest("tr")!;
    expect(within(row).getByText(/Calcul en diagnostic : contrat antérieur à l'exercice/)).toBeTruthy();
    expect(screen.getByText(/^Information, ne bloque pas : Contrat historique sans ouverture validée/)).toBeTruthy();
  });
  it("le cadrage PCG nomme les lignes non cadrées au lieu de « autre(s) »", () => {
    render(<CompletenessMatrix qualification={qualification} framing={framing} filter="all" selected={null} onFilter={() => {}} onOpen={() => {}}/>);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d autre\(s\)/);
    expect(text).toMatch(/lignes? de contrats non calculés ou non cadrés/);
  });
});

describe("Politiques attendues", () => {
  it("la catégorie d'un contrat de 12 mois au plus sans politique (Q08) est signalée avec ses contrats ; les autres cases restent facultatives", () => {
    const contracts = [
      { contractId: "NAC-01", assetCategory: "Matériel de levage", reasons: [{ code: "Q08", effect: "a_qualifier" as const, message: "politique court terme non déclarée" }] },
      { contractId: "ENT-VEN", assetCategory: "Locaux", reasons: [] },
    ];
    const awaited = awaitedPolicies(contracts);
    expect(awaited).toEqual({ "short_term_exemption|Matériel de levage": ["NAC-01"] });
    render(<PolicyEditor categories={["Locaux", "Matériel de levage"]} awaited={awaited} work={undefined} jurisdictions={[]} editable busy={false} saveState="idle" onSave={() => {}}/>);
    expect(screen.getByText(/Réponse attendue : Exemption court terme \(§ 8\) — Matériel de levage \(NAC-01\)/)).toBeTruthy();
    expect(screen.getByLabelText("Exemption court terme (§ 8) — Matériel de levage (réponse attendue)")).toBeTruthy();
    expect(screen.getByText("Attendue : NAC-01")).toBeTruthy();
    expect(screen.getByLabelText("Exemption court terme (§ 8) — Locaux")).toBeTruthy();
    cleanup();
    render(<PolicyEditor categories={["Locaux"]} awaited={{}} work={undefined} jurisdictions={[]} editable busy={false} saveState="idle" onSave={() => {}}/>);
    expect(screen.getByText(/Aucune réponse n'est attendue pour qualifier les contrats/)).toBeTruthy();
  });
});

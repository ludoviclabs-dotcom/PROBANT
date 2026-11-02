// @vitest-environment jsdom
/**
 * L16-05 — revue de la feuille et travaux IFRS du dossier de clôture, au niveau des composants : textes établis par le serveur, actions refusées
 * avec leur motif, et commandes exactes envoyées (version, empreinte, pièce citée). Les chaînes serveur sont vérifiées par les recettes PostgreSQL.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LeaseQualification } from "@/lib/ifrs/leases/qualification";
import type { LeaseReviewSummary } from "@/lib/ifrs/leases/review-summary";
import type { LeaseWorkspaceView } from "@/lib/ifrs/leases/view-model";
import { IFRS_PARTIAL_BRIDGE, type IfrsLineage, type IfrsWorks } from "@/lib/workpapers/closing-ifrs";
import { leaseDemoView } from "@/lib/workpapers/lease-demo";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { ClosingIfrsWorks } from "../../closing/ClosingIfrsWorks";
import type { ClosingView } from "../../closing/format";
import { ReviewPanel } from "../ReviewPanel";

let run: WorkpaperRun, summary: LeaseReviewSummary, qualification: LeaseQualification, workspace: LeaseWorkspaceView;
beforeAll(async () => {
  const view = await leaseDemoView(); run = view.runs[0];
  summary = (view.review as Record<string, LeaseReviewSummary>)[run.id]; qualification = (view.qualification as Record<string, LeaseQualification>)[run.id]; workspace = (view.workspace as Record<string, LeaseWorkspaceView>)[run.id];
});
afterEach(cleanup);
const ok = { allowed: true, reason: null };

describe("L16-05 panneau de revue de la feuille", () => {
  it("scénario : synthèse, points générés, export diagnostic seul ; l'export revu dit pourquoi il est refusé", () => {
    render(<ReviewPanel run={run} summary={summary} qualification={qualification} actions={workspace.actions} busy={false} demo onCommand={() => {}} onExport={() => {}}/>);
    expect(screen.getByLabelText("Synthèse de revue").textContent).toMatch(/Résultat de contrôle : exceptions relevées · 7 contrats, dont 3 déterminé\(s\) et 4 sans montant déterminé · 2 point\(s\) bloquant\(s\) ouvert\(s\) sur 6 · conclusion absente · aucune relecture · impôt non calculé/);
    expect(within(screen.getByRole("region", { name: /Synthèse de revue par contrat/ })).getAllByRole("row")).toHaveLength(8);
    expect(screen.getAllByText("Bloquant").length).toBe(2);
    const reviewed = within(screen.getByRole("group", { name: "Export revu" }));
    expect(reviewed.getAllByRole("button").every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(reviewed.getByText("Scénario synthétique : export diagnostic seulement, jamais revu")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Export diagnostic" })).getAllByRole("button").every(b => !(b as HTMLButtonElement).disabled)).toBe(true);
    // Read-only simulation: no resolution, conclusion or review form.
    expect(screen.queryByRole("button", { name: "Résoudre avec la pièce citée" })).toBeNull();
  });

  it("feuille réelle : une résolution cite une ligne de source figée du contrat ; la commande porte le point, le texte et la pièce", () => {
    const onCommand = vi.fn(), onExport = vi.fn();
    render(<ReviewPanel run={{ ...run, scope: { ...run.scope, mode: "real" }, state: "executed" }} summary={summary} qualification={qualification}
      actions={{ ...workspace.actions, resolve: ok, conclude: ok, export_reviewed: { allowed: false, reason: "Version approuvée ou verrouillée requise" } }} busy={false} demo={false} onCommand={onCommand} onExport={onExport}/>);
    const form = screen.getByLabelText("Résoudre « lease:D04 »").closest("form")!;
    fireEvent.change(within(form).getByLabelText("Résoudre « lease:D04 »"), { target: { value: "Taux nominal converti par la direction, note citée" } });
    const choice = within(form).getByLabelText("Pièce citée") as HTMLSelectElement;
    expect(choice.options[0].textContent).toMatch(/^D04 · /);
    fireEvent.click(within(form).getByRole("button", { name: "Résoudre avec la pièce citée" }));
    const [documentVersionId, rowId] = choice.value.split("|");
    expect(onCommand).toHaveBeenCalledWith("resolve", { noteId: "lease:D04", text: "Taux nominal converti par la direction, note citée", citation: { documentVersionId, rowId } });
    fireEvent.click(within(screen.getByRole("group", { name: "Export diagnostic" })).getByRole("button", { name: "CSV journal" }));
    expect(onExport).toHaveBeenCalledWith("diagnostic", "journal_csv");
  });
});

const lineage = (over: Partial<IfrsLineage>): IfrsLineage => ({ procedure: "ifrs16.leases", label: "Locations IFRS 16 — preneur, périmètre V1", rootId: "ROOT-A", logicalId: "ifrs16.leases:ROOT-A", runId: "RUN-A", revision: 1, version: 9,
  state: "locked", contentHash: "c".repeat(64), sourcesCurrent: true, ruleCurrent: true, outcome: "no_exception_detected",
  bundle: { status: "reviewed", bundleHash: "b".repeat(64), contracts: 2, lines: 11, debit: { amount: "51901.17", currency: "EUR" }, credit: { amount: "51901.17", currency: "EUR" }, taxStatus: "not_computed" },
  selection: { status: "non_selectionne", reasons: [], runId: null, revision: null, runVersion: null, bundleHash: null, by: null, at: null, base: null },
  posting: { status: "non_documentee", text: null, by: null, at: null, citations: [] }, toDecide: true, previous: [], ...over });
const closingView = (works: IfrsWorks) => ({ pieces: [], projection: { ifrsWorks: works } }) as unknown as ClosingView;
const works = (lineages: IfrsLineage[]): IfrsWorks => ({ notice: "Travaux IFRS : section distincte", lineages, orphanSelections: [],
  denominators: { lineages: lineages.length, reviewed: lineages.length, selected: lineages.filter(l => l.selection.status === "selectionne").length, toReexamine: lineages.filter(l => l.selection.status === "a_reexaminer").length, postingsDocumented: 0 } });

describe("L16-05 travaux IFRS du dossier de clôture", () => {
  it("lignée revue à décider : la sélection vise la version et l'empreinte affichées, avec la base déclarée", async () => {
    const send = vi.fn(async () => true);
    render(<ClosingIfrsWorks view={closingView(works([lineage({})]))} canPrepare send={send} busy={false}/>);
    expect(screen.getByTestId("ifrs-denominators").textContent).toBe("1 lignée(s) IFRS observée(s) · 1 revue(s) · 0 retraitement(s) sélectionné(s), 0 à réexaminer · 0 comptabilisation(s) documentée(s) par une pièce");
    expect(screen.getByText(/version revue, sélection à décider \(sans bloquer la clôture des cycles\)/)).toBeTruthy();
    expect(screen.getByText(/non documentée : la sélection et le verrouillage ne la prouvent pas/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sélectionner r1 · v9" }));
    expect(send).toHaveBeenCalledWith({ command: "select_ifrs_bundle", procedure: "ifrs16.leases", rootId: "ROOT-A", runId: "RUN-A", version: 9, contentHash: "c".repeat(64), bundleHash: "b".repeat(64),
      base: { includedAdjustments: { kind: "declared", identities: [] }, limits: "Base PCG de l'exercice ; pont partiel limité au retraitement IFRS 16, sans autre traitement IFRS" } });
  });

  it("sélection à réexaminer : motif écrit, retrait de la version lue, aucune nouvelle sélection d'une feuille dont la source est remplacée", () => {
    const send = vi.fn(async () => true), stale = lineage({ sourcesCurrent: false, toDecide: false,
      selection: { status: "a_reexaminer", reasons: ["source remplacée ou ajoutée"], runId: "RUN-A", revision: 1, runVersion: 9, bundleHash: "b".repeat(64), by: "local-owner", at: "2027-02-20T10:00:00.000Z",
        base: { baseKind: "PCG", included: "aucun retraitement IFRS 16 déjà inclus, déclaré", limits: "Base PCG", citation: "grand-livre.csv · aaaaaaaaaaaa", bridge: { kind: "partial_bridge", text: IFRS_PARTIAL_BRIDGE } } } });
    render(<ClosingIfrsWorks view={closingView(works([stale]))} canPrepare send={send} busy={false}/>);
    expect(screen.getByText("À réexaminer")).toBeTruthy();
    expect(screen.getByText(IFRS_PARTIAL_BRIDGE)).toBeTruthy();
    expect(screen.getByText(/: source remplacée ou ajoutée/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Sélectionner/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retirer la sélection lue (r1 · v9)" }));
    expect(send).toHaveBeenCalledWith({ command: "withdraw_ifrs_bundle", rootId: "ROOT-A", runId: "RUN-A", bundleHash: "b".repeat(64) });
  });
});

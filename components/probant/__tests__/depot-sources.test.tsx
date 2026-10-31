// @vitest-environment jsdom
/**
 * Section « Sources du dossier » de l'écran Dépôt : destination du badge bloquant du rail. Attendus posés à la main
 * sur le jeu DEMO SA (lib/demo/dataset.ts) : un seul constat d'admissibilité, DEMO-ADM-1, bloquant, règle R-HL-004
 * v1.0.0, LPF art. A.47 A-1, lignes 517, 904 et 1330 ; un seul document source, DEMO-SA-FEC-2024.txt, dont
 * l'empreinte est celle du FEC du dossier ; pas de nombre de lignes renseigné.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboard/depot",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import type { SourceDocumentSummary } from "@/lib/canonical-model/dossier";
import { buildSourceRegister } from "@/lib/depot-view/sources";
import { projectSourceState } from "@/lib/dossier/cycle-registry";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import type { DossierSnapshot } from "@/lib/dossier/types";

const active: { snapshot: DossierSnapshot } = { snapshot: buildDemoDossierSnapshot() };

vi.mock("@/lib/dossier/client", () => ({
  useActiveDossierSnapshot: () => active.snapshot,
  useOptionalActiveDossier: () => null,
}));

import { DepotSources } from "../DepotSources";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  active.snapshot = buildDemoDossierSnapshot();
});

const plain = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

const cycleDocument: SourceDocumentSummary = {
  id: "cycle-a",
  dossierId: "demo-sa-2024",
  fileName: "balance-auxiliaire-clients.csv",
  documentType: "cycle_document",
  fingerprint: "c".repeat(64),
  lineCount: 12,
  parserVersion: "rapprochement-tabular-2.0.0",
  location: { provider: "session", key: "browser/cycle-a" },
  createdAt: "2024-12-31T18:00:00.000Z",
};

describe("Sources du dossier — DEMO SA", () => {
  it("le compteur du rail et la section lisent la même projection : 1 alerte bloquante", () => {
    const state = projectSourceState(active.snapshot);
    expect(state.blockingAdmissibility).toBe(1);
    render(<DepotSources />);
    const section = screen.getByRole("region", { name: "Sources du dossier" });
    expect(plain(section.textContent)).toContain("Démonstration historique · 1 document");
    expect(plain(section.textContent)).toContain("1 alerte bloquante d’admissibilité à l’ingestion du FEC");
  });

  it("met en tête l'alerte bloquante avec le motif, la règle, la source et les lignes fournis par le modèle", () => {
    render(<DepotSources />);
    const alerts = screen.getByRole("list", { name: "Alertes d’admissibilité du FEC" });
    const items = within(alerts).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    const text = plain(items[0].textContent);
    expect(text).toContain("Bloquant");
    expect(text).toContain("3 écritures avec date hors format AAAAMMJJ");
    expect(text).toContain("Motif Trois écritures portent une EcritureDate au format JJ/MM/AAAA au lieu d'AAAAMMJJ.");
    expect(text).toContain("Règle R-HL-004 v1.0.0");
    expect(text).toContain("LPF");
    expect(text).toContain("lignes du FEC 517, 904, 1330");
    expect(text).toContain("Droit dur");
    expect(items[0].querySelector("svg path")?.getAttribute("d")).toBe("M1.5 1.5h7v7h-7z");
  });

  it("registre : le FEC de démonstration porte l'alerte ; un nombre de lignes absent reste inconnu", () => {
    render(<DepotSources />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    const cells = within(rows[0]).getAllByRole("cell").map((cell) => plain(cell.textContent));
    expect(plain(within(rows[0]).getByRole("rowheader").textContent)).toContain("DEMO-SA-FEC-2024.txt");
    expect(cells[0]).toContain("Démonstration");
    expect(cells[1]).toBe("1 bloquant");
    expect(cells[2]).toBe(active.snapshot.dossier.fecFingerprint.slice(0, 12));
    expect(cells[3]).toBe("— non renseigné");
    expect(cells.join(" ")).not.toMatch(/(^|\s)0(\s|$)/u);
  });

  it("le document bloquant passe en tête ; un document de cycle n'a aucun contrôle d'admissibilité rattaché", () => {
    active.snapshot = { ...active.snapshot, sourceDocuments: [cycleDocument, ...active.snapshot.sourceDocuments] };
    render(<DepotSources />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => plain(within(row).getByRole("rowheader").textContent))).toEqual([
      "DEMO-SA-FEC-2024.txt jeu intégré",
      "balance-auxiliaire-clients.csv session de ce navigateur",
    ]);
    expect(plain(within(rows[1]).getAllByRole("cell")[1].textContent)).toBe("aucun contrôle d’admissibilité rattaché");
    expect(plain(within(rows[1]).getAllByRole("cell")[3].textContent)).toBe("12");
  });

  it("sans constat d'admissibilité : aucune liste d'alertes, le FEC dit « aucune alerte »", () => {
    active.snapshot = { ...active.snapshot, admissibilityFindings: [] };
    render(<DepotSources />);
    expect(screen.queryByRole("list", { name: "Alertes d’admissibilité du FEC" })).toBeNull();
    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(plain(within(row).getAllByRole("cell")[1].textContent)).toBe("aucune alerte");
  });
});

describe("buildSourceRegister", () => {
  it("ordre du modèle conservé sans alerte bloquante ; alertes triées par gravité", () => {
    const snapshot = buildDemoDossierSnapshot();
    const blocking = snapshot.admissibilityFindings[0];
    const minor = { ...blocking, id: "ADM-MINEUR", severity: "mineur" as const };
    const withAlerts: DossierSnapshot = { ...snapshot, admissibilityFindings: [minor, blocking], sourceDocuments: [cycleDocument, ...snapshot.sourceDocuments] };
    const register = buildSourceRegister(withAlerts);
    expect(register.alerts.map((f) => f.id)).toEqual(["DEMO-ADM-1", "ADM-MINEUR"]);
    expect(register.counts).toEqual([
      { severity: "bloquant", count: 1 },
      { severity: "mineur", count: 1 },
    ]);
    expect(register.rows.map((r) => r.document.id)).toEqual(["demo-source-fec", "cycle-a"]);
    expect(register.unattached).toBe(false);

    const nonBlocking = buildSourceRegister({ ...withAlerts, admissibilityFindings: [minor] });
    expect(nonBlocking.rows.map((r) => r.document.id)).toEqual(["cycle-a", "demo-source-fec"]);
  });

  it("alertes sans document à l'empreinte du FEC : signalées comme non rattachées", () => {
    const snapshot = buildDemoDossierSnapshot();
    const register = buildSourceRegister({ ...snapshot, sourceDocuments: [cycleDocument] });
    expect(register.rows.every((r) => !r.carriesAdmissibility)).toBe(true);
    expect(register.unattached).toBe(true);
  });
});

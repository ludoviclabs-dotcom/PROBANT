/**
 * File de travail des Tests complémentaires. Attendus posés à la main d'après le dossier de démonstration : 43 constats,
 * dont 4 paramètres internes (2 de gravité informative) et aucun informatif d'une autre famille, soit 39 constats à
 * couvrir (2 bloquants, 19 majeurs, 18 mineurs) ; 2 procédures restent à définir (DEMO-ACHATS-1, DEMO-RESFIN-1) ;
 * 22 écarts de rapprochement (11 majeurs, 11 mineurs).
 */

import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/canonical-model/finding";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { buildQueueIndex, buildWorkQueue, exclusionSentence, filterQueue, isTestTarget, keepSelection, severityTally } from "../queue";

const findings = buildDemoDossierSnapshot().findings;
const queue = buildWorkQueue(findings);

describe("périmètre des tests complémentaires", () => {
  it.each([
    ["hardLaw", "majeur", true],
    ["methodology", "mineur", true],
    ["methodology", "bloquant", true],
    ["internal", "majeur", false],
    ["hardLaw", "informatif", false],
    ["internal", "informatif", false],
  ] as const)("%s / %s → %s", (family, severity, expected) => {
    expect(isTestTarget({ family, severity })).toBe(expected);
  });
});

describe("file de travail du dossier de démonstration", () => {
  it("39 constats à couvrir sur 43, dans l'ordre du snapshot", () => {
    expect(queue.total).toBe(43);
    expect(queue.items).toHaveLength(39);
    expect(queue.items[0].finding.id).toBe("DEMO-ADM-1");
  });

  it("4 exclus : les 4 paramètres internes, dont 2 informatifs", () => {
    expect(queue.excluded).toEqual({ total: 4, internal: 4, internalInformative: 2, informativeOnly: 0 });
    expect(exclusionSentence(queue.excluded)).toBe("4 exclus : 4 paramètres internes, dont 2 informatifs");
  });

  it("37 procédures proposées, 2 à définir par le professionnel", () => {
    expect(queue.resolved).toBe(37);
    expect(queue.toDefine).toBe(2);
    expect(filterQueue(queue.items, "to_define").map((i) => i.finding.id)).toEqual(["DEMO-ACHATS-1", "DEMO-RESFIN-1"]);
    expect(filterQueue(queue.items, "all")).toHaveLength(39);
  });

  it("par gravité : 2 bloquants, 19 majeurs, 18 mineurs", () => {
    expect(queue.bySeverity).toEqual({ bloquant: 2, majeur: 19, mineur: 18, informatif: 0 });
    expect(severityTally(queue.bySeverity)).toEqual([
      { severity: "bloquant", count: 2 },
      { severity: "majeur", count: 19 },
      { severity: "mineur", count: 18 },
    ]);
  });

  it("les procédures viennent du résolveur, pas de la vue", () => {
    const litigieuse = queue.items.find((i) => i.finding.titre === "Créance litigieuse échue non dépréciée")!;
    expect(litigieuse.proposal.title).toBe("Revue de recouvrabilité documentée");
    const toDefine = queue.items.find((i) => i.finding.id === "DEMO-ACHATS-1")!;
    expect(toDefine.proposal).toMatchObject({ status: "to_define", title: "Procédure à définir", steps: [] });
  });
});

describe("index de lecture", () => {
  const index = buildQueueIndex(queue.items);

  it("17 constats analytiques et 22 écarts de rapprochement regroupés", () => {
    expect(index.primary).toHaveLength(17);
    expect(index.reconciliation).toHaveLength(22);
    expect(index.reconciliationBySeverity).toEqual([
      { severity: "majeur", count: 11 },
      { severity: "mineur", count: 11 },
    ]);
  });

  it("le filtre « à définir » ne laisse aucun écart de rapprochement", () => {
    const only = buildQueueIndex(filterQueue(queue.items, "to_define"));
    expect(only.primary.map((i) => i.finding.id)).toEqual(["DEMO-ACHATS-1", "DEMO-RESFIN-1"]);
    expect(only.reconciliation).toEqual([]);
  });
});

describe("sélection gardée au changement de filtre", () => {
  const toDefine = filterQueue(queue.items, "to_define");
  it("garde le constat s'il reste visible", () => {
    expect(keepSelection(toDefine, "DEMO-RESFIN-1")).toBe("DEMO-RESFIN-1");
  });
  it("sinon retient le premier de la liste, ou aucun", () => {
    expect(keepSelection(toDefine, "DEMO-ADM-1")).toBe("DEMO-ACHATS-1");
    expect(keepSelection(toDefine, null)).toBe("DEMO-ACHATS-1");
    expect(keepSelection([], "DEMO-ADM-1")).toBeNull();
  });
});

describe("exclusions d'un autre dossier", () => {
  it("un informatif de droit dur est exclu par sa gravité, et dit comme tel", () => {
    const base = findings.find((f) => f.id === "DEMO-INCORP-1")!;
    const extra: Finding[] = [{ ...base, id: "X-INFO-1", severity: "informatif" }];
    const q = buildWorkQueue([...findings, ...extra]);
    expect(q.excluded).toEqual({ total: 5, internal: 4, internalInformative: 2, informativeOnly: 1 });
    expect(exclusionSentence(q.excluded)).toBe("5 exclus : 4 paramètres internes, dont 2 informatifs ; 1 constat informatif d’une autre famille");
  });

  it("aucun constat : rien à couvrir, rien d'exclu", () => {
    const q = buildWorkQueue([]);
    expect(q).toMatchObject({ total: 0, items: [], resolved: 0, toDefine: 0 });
    expect(exclusionSentence(q.excluded)).toBe("Aucun constat exclu.");
  });
});

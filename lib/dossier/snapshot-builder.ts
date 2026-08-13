
import {
  allFindings,
  type Dossier,
  type Finding,
  type ReconstitutedStatement,
  type SiloView,
} from "@/lib/canonical-model";
import { DEMO_DOSSIER, DEMO_MATERIALITY_BASIS } from "@/lib/demo/dataset";
import { SCENARIO_MAP } from "@/lib/demo/scenarios";
import type {
  CalculationContext,
  DossierSnapshot,
  FecDepotSnapshotInput,
  SourceDocumentSummary,
} from "./types";

export const DOSSIER_SNAPSHOT_VERSION = "1.0.0";

function stableHash(value: unknown): string {
  const text = JSON.stringify(value, Object.keys(value as object).sort());
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return `snapshot-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function emptyStatement(title: string): ReconstitutedStatement {
  return {
    titre: title,
    unite: "EUR",
    note: "Vue synthetique construite depuis les constats du dossier actif.",
    rows: [],
  };
}

function silosFromFindings(findings: Finding[]): SiloView[] {
  const bySilo = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = bySilo.get(finding.siloId) ?? [];
    list.push(finding);
    bySilo.set(finding.siloId, list);
  }
  return [...bySilo.entries()].map(([siloId, siloFindings]) => ({
    siloId,
    statement: emptyStatement(siloId),
    findings: siloFindings,
  }));
}

function defaultContext(
  findings: Finding[],
  entriesTotal = 0,
): CalculationContext {
  const concludedControls = new Set(
    findings.map((finding) => finding.ruleId),
  ).size;
  return {
    entriesTotal,
    entriesAnalysed: entriesTotal,
    controlsEligible: concludedControls,
    controlsExecuted: concludedControls,
    controlsConcluded: concludedControls,
    controlsNotConcluded: 0,
    notes: [],
  };
}

export function buildDemoDossierSnapshot(scenarioId?: string): DossierSnapshot {
  const scenario = scenarioId ? SCENARIO_MAP[scenarioId] : undefined;
  const dossier: Dossier = scenario
    ? {
        ...DEMO_DOSSIER,
        id: `demo-scenario-${scenario.id}`,
        societe: {
          raisonSociale: scenario.label,
          siren: scenario.siren,
          exercice: scenario.exercice,
          dateCloture: `${scenario.exercice}1231`,
        },
        silos: scenario.silos,
      }
    : DEMO_DOSSIER;
  const findings = allFindings(dossier);
  const sourceDocuments: SourceDocumentSummary[] = [
    {
      id: "demo-source-fec",
      dossierId: dossier.id,
      fileName: "DEMO-SA-FEC-2024.txt",
      documentType: "demo",
      fingerprint: dossier.fecFingerprint,
      parserVersion: "demo",
      createdAt: dossier.createdAt,
    },
  ];

  return {
    dossier,
    sourceDocuments,
    findings,
    admissibilityFindings: dossier.admissibilite,
    reviewEvents: [],
    calculationContext: {
      ...defaultContext(findings),
      materialityBasis: DEMO_MATERIALITY_BASIS,
      scenarioMeta: scenario
        ? {
            label: scenario.label,
            secteur: scenario.secteur,
            forme: scenario.forme,
            exercice: scenario.exercice,
          }
        : undefined,
    },
    snapshotVersion: DOSSIER_SNAPSHOT_VERSION,
    snapshotHash: stableHash({
      dossierId: dossier.id,
      fingerprint: dossier.fecFingerprint,
      findings: findings.map((finding) => finding.id),
    }),
    sourceKind: "demo",
    ledgerEntries: [],
  };
}

export function buildSnapshotFromFecDepot(input: FecDepotSnapshotInput): DossierSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const exercice =
    input.entries
      .map((entry) => entry.ecritureDate?.slice(0, 4))
      .filter((year): year is string => /^\d{4}$/u.test(year ?? ""))
      .at(0) ?? "session";
  const dateCloture = `${exercice}1231`;
  const dossierId =
    input.dossierId ?? `session-${input.siren ?? "unknown"}-${exercice}`;
  const findings = [...input.admissibilite, ...input.analyse];
  const dossier: Dossier = {
    id: dossierId,
    societe: {
      raisonSociale: input.siren ? `SIREN ${input.siren}` : input.nomFichier,
      siren: input.siren ?? "non-detecte",
      exercice,
      dateCloture,
    },
    demoMode: false,
    fecFingerprint: input.fingerprint,
    referentielVersion: input.referentielVersion,
    createdAt: generatedAt,
    admissibilite: input.admissibilite,
    silos: silosFromFindings(input.analyse),
  };

  return {
    dossier,
    sourceDocuments: [
      {
        id: `${dossierId}-fec`,
        dossierId,
        fileName: input.nomFichier,
        documentType: "fec",
        fingerprint: input.fingerprint,
        lineCount: input.totalEntryCount ?? input.entries.length,
        parserVersion: "fec-parser-1.0.0",
        truncated: input.entriesTruncated,
        createdAt: generatedAt,
      },
    ],
    findings,
    admissibilityFindings: input.admissibilite,
    reviewEvents: [],
    calculationContext: {
      ...defaultContext(findings, input.totalEntryCount ?? input.entries.length),
      controlsEligible:
        input.controlsEligible ??
        new Set(findings.map((finding) => finding.ruleId)).size,
      controlsExecuted:
        input.controlsExecuted ??
        new Set(findings.map((finding) => finding.ruleId)).size,
      controlsConcluded:
        input.controlsConcluded ??
        new Set(findings.map((finding) => finding.ruleId)).size,
      controlsNotConcluded: input.controlsNotConcluded ?? 0,
      notes: input.entriesTruncated
        ? ["Les lignes detaillees du FEC sont paginees; le snapshot conserve le nombre total."]
        : [],
    },
    snapshotVersion: DOSSIER_SNAPSHOT_VERSION,
    snapshotHash: stableHash({
      dossierId,
      fingerprint: input.fingerprint,
      findings: findings.map((finding) => finding.id),
    }),
    sourceKind: "session",
    ledgerEntries: input.entries,
  };
}

export function addRapprochementToSnapshot(
  current: DossierSnapshot,
  input: {
    cycleId: string;
    silo: SiloView;
    documents: Array<{
      id: string;
      fileName: string;
      fingerprint: string;
      lineCount: number;
    }>;
    generatedAt?: string;
  },
): DossierSnapshot {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const startsFromDemo = current.dossier.demoMode;
  const baseFindings = startsFromDemo ? [] : current.findings;
  const baseAdmissibility = startsFromDemo ? [] : current.admissibilityFindings;
  const findingsById = new Map(baseFindings.map((finding) => [finding.id, finding]));
  for (const finding of input.silo.findings) findingsById.set(finding.id, finding);
  const findings = [...findingsById.values()];
  const dossierId = startsFromDemo
    ? `session-cycle-${input.cycleId}`
    : current.dossier.id;
  const existingSilos = startsFromDemo ? [] : current.dossier.silos;
  const silos = [
    ...existingSilos.filter((silo) => silo.siloId !== input.silo.siloId),
    input.silo,
  ];
  const documentSummaries: SourceDocumentSummary[] = input.documents.map((document) => ({
    id: document.id,
    dossierId,
    fileName: document.fileName,
    documentType: "cycle_document",
    fingerprint: document.fingerprint,
    lineCount: document.lineCount,
    parserVersion: "rapprochement-tabular-1.0.0",
    createdAt: generatedAt,
  }));
  const sourceDocuments = startsFromDemo
    ? documentSummaries
    : [
        ...current.sourceDocuments.filter(
          (document) => !input.documents.some((next) => next.id === document.id),
        ),
        ...documentSummaries,
      ];
  const generatedYear = String(new Date(generatedAt).getUTCFullYear());
  const dossier: Dossier = startsFromDemo
    ? {
        id: dossierId,
        societe: {
          raisonSociale: `Dossier de rapprochement ${input.cycleId}`,
          siren: "non-detecte",
          exercice: generatedYear,
          dateCloture: `${generatedYear}1231`,
        },
        demoMode: false,
        fecFingerprint: input.documents.map((document) => document.fingerprint).join(":"),
        referentielVersion: current.dossier.referentielVersion,
        createdAt: generatedAt,
        admissibilite: [],
        silos,
      }
    : {
        ...current.dossier,
        silos,
      };

  return {
    ...current,
    dossier,
    sourceDocuments,
    findings,
    admissibilityFindings: baseAdmissibility,
    calculationContext: {
      ...current.calculationContext,
      controlsEligible: findings.length,
      controlsExecuted: findings.length,
      controlsConcluded: findings.length,
      cycleIdsCovered: [
        ...new Set([
          ...(current.calculationContext.cycleIdsCovered ?? []),
          input.cycleId,
        ]),
      ],
      notes: [
        ...current.calculationContext.notes,
        `Rapprochement ${input.cycleId} ajouté au snapshot actif.`,
      ],
    },
    snapshotHash: stableHash({
      dossierId,
      documents: sourceDocuments.map((document) => document.fingerprint),
      findings: findings.map((finding) => finding.id),
    }),
    sourceKind: "session",
  };
}

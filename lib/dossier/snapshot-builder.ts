
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
import { cycleById } from "@/lib/rapprochement/catalog";
import { stableHash } from "@/lib/synthesis/canonical";
import { UPLOAD_CONTRACT_VERSION, qualificationIssues, uploadStatus, type UploadExecution, type UploadDocument, type UploadQualification } from "@/lib/rapprochement/upload-contract";
import { computeDossierSnapshotHash } from "./snapshot-state";

export const DOSSIER_SNAPSHOT_VERSION = "1.0.0";

function finalizeSnapshot(snapshot: DossierSnapshot): DossierSnapshot {
  return { ...snapshot, snapshotHash: computeDossierSnapshotHash(snapshot) };
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
      location: { provider: "demo", key: "bundled/DEMO-SA-FEC-2024.txt" },
      createdAt: dossier.createdAt,
    },
  ];

  return finalizeSnapshot({
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
    snapshotHash: "",
    sourceKind: "demo",
    ledgerEntries: [],
  });
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

  return finalizeSnapshot({
    dossier,
    sourceDocuments: [
      {
        id: input.sourceDocumentId ?? `${dossierId}-fec`,
        dossierId,
        fileName: input.nomFichier,
        documentType: "fec",
        fingerprint: input.fingerprint,
        lineCount: input.totalEntryCount ?? input.entries.length,
        parserVersion: input.parserVersion ?? "fec-parser-1.0.0",
        location: input.sourceLocation ?? {
          provider: "session",
          key: `browser/${input.sourceDocumentId ?? `${dossierId}-fec`}`,
        },
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
    snapshotHash: "",
    sourceKind: "session",
    ledgerEntries: input.entries,
  });
}

/** Retire seulement les constats actifs de cette comparaison, jamais ceux d’un autre cycle. */
export function invalidateRapprochementInSnapshot(current: DossierSnapshot, cycleId: string, reason: string): DossierSnapshot {
  if (current.dossier.demoMode) return current;
  const cycle = cycleById(cycleId);
  if (!cycle) throw new Error(`Cycle inconnu : ${cycleId}`);
  const runs = current.uploadExecutions ?? [];
  const active = runs.filter((run) => run.cycleId === cycleId && run.state === "active");
  if (!active.length && !current.findings.some((f) => f.id.startsWith(`RAPPRO-${cycle.config.cycleSlug}-`))) return current;
  const obsolete = new Set(active.flatMap((run) => run.silo.findings.map((f) => f.id)));
  const isObsolete = (finding: Finding) => obsolete.has(finding.id) || finding.id.startsWith(`RAPPRO-${cycle.config.cycleSlug}-`);
  const uploadExecutions = runs.map((run) => run.cycleId === cycleId && run.state === "active" ? { ...run, state: "stale" as const, staleReason: reason } : run);
  const next = {
    ...current,
    uploadBaselineContext: uploadBaseline(current),
    uploadExecutions,
    findings: current.findings.filter((f) => !isObsolete(f)),
    dossier: { ...current.dossier, silos: current.dossier.silos.filter((silo) => silo.siloId !== cycle.config.siloId) },
    // Les anciens dépôts sans contrat n’apportent aucune assurance de couverture.
    calculationContext: uploadCalculationContext(current, uploadExecutions),
  };
  return finalizeSnapshot(next);
}

function uploadBaseline(current: DossierSnapshot): CalculationContext {
  if (current.uploadBaselineContext) return current.uploadBaselineContext;
  if (current.calculationContext.cycleIdsCovered?.length || current.findings.some((f) => f.id.startsWith("RAPPRO-"))) return {
    ...current.calculationContext, controlsEligible: 0, controlsExecuted: 0, controlsConcluded: 0, controlsNotConcluded: 0,
    notes: [...current.calculationContext.notes, "Compteurs historiques non vérifiables : anciens dépôts à relancer avec le contrat v2."],
  };
  return current.calculationContext;
}

function uploadCalculationContext(current: DossierSnapshot, runs: UploadExecution[]): CalculationContext {
  const baseline = uploadBaseline(current);
  const active = runs.filter((run) => run.state === "active");
  const executed = active.filter((run) => run.status !== "blocked").length;
  const concluded = active.filter((run) => run.status === "compared").length;
  return {
    ...baseline,
    controlsEligible: baseline.controlsEligible + active.length,
    controlsExecuted: baseline.controlsExecuted + executed,
    controlsConcluded: baseline.controlsConcluded + concluded,
    controlsNotConcluded: baseline.controlsNotConcluded + active.length - concluded,
    cycleIdsCovered: [],
    limitedToUploadedDocuments: true,
    notes: [...baseline.notes, "Les dépôts comparent les documents fournis ; ils ne démontrent pas la couverture d’un cycle ni son exhaustivité."],
  };
}

export function addRapprochementToSnapshot(
  current: DossierSnapshot,
  input: { cycleId: string; silo: SiloView; documents: UploadDocument[]; qualification: UploadQualification; generatedAt?: string },
): DossierSnapshot {
  if (current.sourceKind === "persistent") throw new Error("Le dépôt historique ne peut pas modifier un dossier persistant : le raccord durable de ces cartes est absent.");
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const cycle = cycleById(input.cycleId);
  if (!cycle || input.silo.siloId !== cycle.config.siloId) throw new Error("Cycle et résultat incompatibles.");
  const startsFromDemo = current.dossier.demoMode;
  const previous = startsFromDemo ? [] : current.uploadExecutions ?? [];
  const others = previous.filter((run) => run.state === "active" && run.cycleId !== input.cycleId);
  if (others.some((run) => run.qualification.entity !== input.qualification.entity || stableHash(run.qualification.period) !== stableHash(input.qualification.period))) {
    throw new Error("Entité ou période différente des autres cycles actifs du dossier. Utiliser un dossier distinct ou requalifier les comparaisons précédentes.");
  }
  const dossierId = startsFromDemo ? `session-cycle-${input.cycleId}-${stableHash({ generatedAt, entity: input.qualification.entity }).slice(0, 12)}` : current.dossier.id;
  const version = Math.max(0, ...previous.filter((run) => run.cycleId === input.cycleId).map((run) => run.version)) + 1;
  const identity = `${dossierId}:${input.cycleId}`;
  const id = `${identity}:v${version}`;
  const documents = input.documents.map((doc) => ({ ...doc, id: `${id}:${doc.id}` }));
  const documentIds = new Map(input.documents.map((doc, index) => [doc.id, documents[index].id]));
  const findings = input.silo.findings.map((finding, i) => ({ ...finding, id: `${id}:finding-${i + 1}`, statutRevue: "en_attente" as const }));
  const findingIds = new Map(input.silo.findings.map((f, i) => [f.id, findings[i].id]));
  const silo: SiloView = {
    ...input.silo, findings,
    statement: { ...input.silo.statement, rows: input.silo.statement.rows.map((row) => ({ ...row, flaggedBy: row.flaggedBy ? findingIds.get(row.flaggedBy) : undefined })) },
    rapprochement: input.silo.rapprochement ? { ...input.silo.rapprochement, groupes: input.silo.rapprochement.groupes.map((group) => ({
      ...group,
      source: group.source.map((line) => ({ ...line, documentId: documentIds.get(line.documentId) ?? line.documentId })),
      cible: group.cible.map((line) => ({ ...line, documentId: documentIds.get(line.documentId) ?? line.documentId })),
    })) } : undefined,
  };
  const run: UploadExecution = { id, identity, cycleId: input.cycleId, version, contractVersion: UPLOAD_CONTRACT_VERSION, state: "active", status: uploadStatus(silo, input.qualification), qualification: input.qualification, issues: qualificationIssues(input.qualification), documents, generatedAt, silo };
  const uploadExecutions = [...previous.map((old) => old.cycleId === input.cycleId && old.state === "active" ? { ...old, state: "stale" as const, staleReason: "Exécution remplacée par un nouvel import ou paramétrage." } : old), run];
  const invalidated = startsFromDemo ? current : invalidateRapprochementInSnapshot(current, input.cycleId, "Exécution remplacée.");
  const baseFindings = startsFromDemo ? [] : invalidated.findings;
  const silos = [...(startsFromDemo ? [] : invalidated.dossier.silos), silo];
  const period = input.qualification.period;
  const dossier: Dossier = {
    ...(startsFromDemo ? { id: dossierId, demoMode: false, fecFingerprint: "", referentielVersion: current.dossier.referentielVersion, createdAt: generatedAt, admissibilite: [] } : current.dossier),
    societe: { raisonSociale: input.qualification.entity.trim() || "Entité non qualifiée", siren: startsFromDemo ? "non-detecte" : current.dossier.societe.siren, exercice: period?.closingDate.slice(0, 4) ?? "inconnue", dateCloture: period?.closingDate.replaceAll("-", "") ?? "" },
    period, silos,
  };
  const baseline = startsFromDemo ? { entriesTotal: 0, entriesAnalysed: 0, controlsEligible: 0, controlsExecuted: 0, controlsConcluded: 0, controlsNotConcluded: 0, notes: [] } : uploadBaseline(current);
  const next: DossierSnapshot = {
    ...current, dossier, uploadExecutions, uploadBaselineContext: baseline,
    sourceDocuments: [...(startsFromDemo ? [] : current.sourceDocuments), ...documents.map((doc): SourceDocumentSummary => ({ ...doc, dossierId, documentType: "cycle_document", parserVersion: doc.parserVersion ?? "rapprochement-tabular-2.0.0", location: { provider: "session", key: `browser/${doc.id}` }, createdAt: generatedAt }))],
    findings: [...baseFindings, ...findings], admissibilityFindings: startsFromDemo ? [] : current.admissibilityFindings,
    reviewEvents: startsFromDemo ? [] : current.reviewEvents,
    workpapers: startsFromDemo ? undefined : current.workpapers,
    workpaperProjection: startsFromDemo ? undefined : current.workpaperProjection,
    calculationRuns: startsFromDemo ? undefined : current.calculationRuns,
    ledgerEntries: startsFromDemo ? [] : current.ledgerEntries,
    snapshotHash: "", sourceKind: "session",
  };
  next.calculationContext = uploadCalculationContext(next, uploadExecutions);
  return finalizeSnapshot(next);
}

import "server-only";

import { buildSnapshotFromFecDepot } from "@/lib/dossier/snapshot-builder";
import { computeDossierSnapshotHash } from "@/lib/dossier/snapshot-state";
import { FEC_STREAM_PARSER_VERSION, FecStreamError, parseFecStream } from "@/lib/fec/stream-parser";
import { REFERENTIEL_VERSION } from "@/lib/referentiel/sources";
import { ALL_REGISTRIES, runRules, splitAdmissibilite } from "@/lib/rules-engine";
import type { ObjectStorage } from "@/lib/storage/types";
import { reusableTerminalStatus } from "./job-idempotency";
import type { IngestionLimits } from "./limits";
import type { IngestionJobMessage } from "./queue";
import type { DrizzleIngestionRepository } from "./repository";

export class IngestionConcurrencyError extends Error {
  constructor() {
    super("INGESTION_ORGANIZATION_CONCURRENCY_LIMIT");
    this.name = "IngestionConcurrencyError";
  }
}

export class IngestionProcessor {
  constructor(
    private readonly repository: DrizzleIngestionRepository,
    private readonly storage: ObjectStorage,
    private readonly limits: IngestionLimits,
  ) {}

  async process(message: IngestionJobMessage): Promise<"completed" | "failed" | "quarantined"> {
    const current = await this.repository.getJobForProcessing(
      message.organizationId,
      message.jobId,
    );
    if (!current) return "failed";
    if (current.document.id !== message.sourceDocumentId) {
      await this.repository.markTerminal(message.jobId, "quarantined", "JOB_DOCUMENT_MISMATCH");
      return "quarantined";
    }
    if (current.document.documentType !== "fec") {
      await this.repository.markTerminal(message.jobId, "quarantined", "DOCUMENT_TYPE_UNSUPPORTED");
      return "quarantined";
    }
    const reusableStatus = reusableTerminalStatus(current.job.status, current.job.errorCode);
    if (reusableStatus) return reusableStatus;

    const acquired = await this.repository.acquireJob(
      message.jobId,
      message.organizationId,
      this.limits.maxConcurrentJobsPerOrg,
      new Date(Date.now() + this.limits.maxParseDurationMs),
    );
    if (!acquired) throw new IngestionConcurrencyError();

    try {
      await this.repository.prepareParsing(message.jobId, acquired.document.id);
      const stream = await this.storage.read({
        provider: "s3",
        bucket: acquired.document.storageBucket,
        key: acquired.document.storageKey,
        versionId: acquired.document.storageVersionId ?? undefined,
      });
      const parsed = await parseFecStream(stream, {
        limits: this.limits,
        onBatch: (entries) =>
          this.repository.insertFecBatch(
            acquired.document.id,
            acquired.document.dossierId,
            entries,
          ),
      });
      const duplicate = await this.repository.findDocumentBySha256(
        acquired.document.dossierId,
        parsed.sha256,
      );
      if (duplicate && duplicate.id !== acquired.document.id) {
        await this.repository.markTerminal(message.jobId, "failed", "DUPLICATE_DOCUMENT");
        return "failed";
      }
      await this.repository.completeParsing(message.jobId, acquired.document.id, parsed);

      await this.repository.setJobStatus(
        message.jobId,
        "running_controls",
        new Date(Date.now() + this.limits.maxParseDurationMs),
      );
      const entries = await this.repository.listAllEntries(acquired.document.id);
      const sirenMatch = acquired.document.originalName.match(/^(\d{9})FEC/iu);
      const siren = sirenMatch?.[1] ?? null;
      const allFindings = runRules({
        parsed: {
          separateur: parsed.separator,
          separateurNom: parsed.separatorName,
          headerColumns: parsed.headerColumns,
          variante: parsed.variant,
          entries,
          parseErrors: [],
        },
        entries,
        nomFichier: acquired.document.originalName,
        siren,
        referentielVersion: REFERENTIEL_VERSION,
      });
      const { admissibilite, analyse } = splitAdmissibilite(allFindings);
      const failedRuleIds = new Set(
        allFindings
          .filter((finding) => finding.id.endsWith("#error"))
          .map((finding) => finding.ruleId),
      );
      const controls = ALL_REGISTRIES.map((rule) => ({
        ruleId: rule.id,
        ruleVersion: rule.version,
        status: failedRuleIds.has(rule.id) ? ("failed" as const) : ("completed" as const),
        findingCount: allFindings.filter((finding) => finding.ruleId === rule.id).length,
      }));

      await this.repository.setJobStatus(
        message.jobId,
        "building_snapshot",
        new Date(Date.now() + this.limits.maxParseDurationMs),
      );
      const baseSnapshot = buildSnapshotFromFecDepot({
        dossierId: acquired.document.dossierId,
        sourceDocumentId: acquired.document.id,
        nomFichier: acquired.document.originalName,
        fingerprint: parsed.sha256,
        parserVersion: FEC_STREAM_PARSER_VERSION,
        sourceLocation: {
          provider: "s3",
          bucket: acquired.document.storageBucket,
          key: acquired.document.storageKey,
          versionId: acquired.document.storageVersionId ?? undefined,
        },
        siren,
        referentielVersion: REFERENTIEL_VERSION,
        admissibilite,
        analyse,
        entries: [],
        entriesTruncated: parsed.lineCount > 0,
        totalEntryCount: parsed.lineCount,
        controlsEligible: controls.length,
        controlsExecuted: controls.length,
        controlsConcluded: controls.length - failedRuleIds.size,
        controlsNotConcluded: failedRuleIds.size,
      });
      const snapshot = {
        ...baseSnapshot,
        sourceKind: "persistent" as const,
        snapshotVersion: `${baseSnapshot.snapshotVersion}+${message.jobId}`,
        ledgerEntries: undefined,
      };
      snapshot.snapshotHash = computeDossierSnapshotHash(snapshot);
      await this.repository.persistAnalysis({
        jobId: message.jobId,
        dossierId: acquired.document.dossierId,
        sourceDocumentId: acquired.document.id,
        findings: allFindings,
        controls,
        snapshot,
      });
      return "completed";
    } catch (error) {
      if (error instanceof FecStreamError) {
        const status = error.quarantined ? "quarantined" : "failed";
        await this.repository.markTerminal(message.jobId, status, error.code);
        return status;
      }
      await this.repository.markTerminal(message.jobId, "failed", "INGESTION_TRANSIENT_FAILURE");
      throw error;
    }
  }
}

export function assertParserVersion(version: string): void {
  if (version !== FEC_STREAM_PARSER_VERSION) throw new Error("PARSER_VERSION_UNSUPPORTED");
}

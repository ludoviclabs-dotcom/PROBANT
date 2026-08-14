import type { DossierContext, DossierSnapshot } from "@/lib/dossier";
import { reviewEventsDigest } from "@/lib/dossier/review";
import {
  canonicalJson,
  sha256Hex,
  verifySynthesisSnapshotHash,
  type SynthesisSnapshot,
} from "@/lib/synthesis";
import { buildCsv } from "./csv";
import { buildAccessibleEvidenceHtml } from "./html";
import type {
  CanonicalEvidenceExport,
  EvidenceArtifactFormat,
  EvidenceControlRow,
  EvidenceExportPackage,
  EvidenceManifest,
  ManifestArtifact,
  ManifestSourceDocument,
} from "./types";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export interface BuildEvidencePackageOptions {
  applicationVersion: string;
  activeContext: DossierContext;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function manifestSourceDocuments(snapshot: DossierSnapshot): ManifestSourceDocument[] {
  return [...snapshot.sourceDocuments]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((document) => ({
      id: document.id,
      fileName: document.fileName,
      documentType: document.documentType,
      sha256: document.fingerprint,
      location: document.location ?? null,
      parserVersion: document.parserVersion ?? null,
    }));
}

function controlsFromFindings(snapshot: DossierSnapshot): EvidenceControlRow[] {
  const controls = new Map<string, EvidenceControlRow>();
  for (const finding of [...snapshot.findings].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${finding.ruleId}@${finding.ruleVersion}`;
    const current = controls.get(key) ?? {
      controlId: finding.ruleId,
      controlVersion: finding.ruleVersion,
      status: "finding_emitted" as const,
      findingIds: [],
      normativeReferences: [],
    };
    current.findingIds.push(finding.id);
    current.normativeReferences.push(`${finding.source.ref}@${finding.source.effectiveDate}`);
    current.normativeReferences = [...new Set(current.normativeReferences)].sort();
    controls.set(key, current);
  }
  return [...controls.values()].sort(
    (a, b) => a.controlId.localeCompare(b.controlId) || a.controlVersion.localeCompare(b.controlVersion),
  );
}

function sourceIdsForFinding(snapshot: DossierSnapshot, findingId: string): string[] {
  const finding = snapshot.findings.find((candidate) => candidate.id === findingId);
  if (!finding) return [];
  const hashes = new Set((finding.preuve ?? []).map((step) => step.hash).filter(Boolean));
  const explicit = snapshot.sourceDocuments
    .filter((document) => hashes.has(document.fingerprint))
    .map((document) => document.id);
  if (explicit.length > 0) return explicit.sort();
  return snapshot.sourceDocuments.length === 1 ? [snapshot.sourceDocuments[0].id] : [];
}

export function assertExportScope(
  snapshot: DossierSnapshot,
  activeContext: DossierContext,
): void {
  if (activeContext.dossierId !== snapshot.dossier.id) {
    throw new Error("EXPORT_ACTIVE_DOSSIER_MISMATCH");
  }
  if (snapshot.sourceKind === "demo" && activeContext.organizationId !== "demo") {
    throw new Error("EXPORT_DEMO_SCOPE_FORBIDDEN");
  }
  if (snapshot.sourceKind !== "demo" && activeContext.organizationId === "demo") {
    throw new Error("EXPORT_NON_DEMO_SCOPE_FORBIDDEN");
  }
}

function buildCanonicalExport(
  snapshot: DossierSnapshot,
  synthesis: SynthesisSnapshot,
): CanonicalEvidenceExport {
  const sources = manifestSourceDocuments(snapshot);
  const controls = controlsFromFindings(snapshot);
  return {
    exportSchemaVersion: "1.0.0",
    dossier: snapshot.dossier,
    synthesisSnapshot: synthesis,
    sourceDocuments: sources,
    controls,
    findings: [...snapshot.findings].sort((a, b) => a.id.localeCompare(b.id)),
    reviewEvents: [...snapshot.reviewEvents],
    evidenceChain: [...snapshot.findings]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((finding) => ({
        findingId: finding.id,
        sourceDocumentIds: sourceIdsForFinding(snapshot, finding.id),
        parserVersions: sourceIdsForFinding(snapshot, finding.id)
          .map((id) => snapshot.sourceDocuments.find((document) => document.id === id)?.parserVersion)
          .filter((version): version is string => Boolean(version))
          .sort(),
        control: { id: finding.ruleId, version: finding.ruleVersion },
        normativeSource: {
          ref: finding.source.ref,
          version: finding.source.effectiveDate,
        },
        reviewEventIds: snapshot.reviewEvents
          .filter((event) => event.findingId === finding.id)
          .map((event) => event.id),
        snapshotId: synthesis.snapshotId,
      })),
  };
}

function artifact(
  format: EvidenceArtifactFormat,
  fileName: string,
  mediaType: string,
  content: string | Uint8Array,
  extra: Partial<ManifestArtifact> = {},
): ManifestArtifact {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return {
    id: fileName,
    format,
    fileName,
    mediaType,
    sha256: sha256Hex(bytes),
    byteLength: bytes.byteLength,
    ...extra,
  };
}

function buildCsvFiles(report: CanonicalEvidenceExport): EvidenceExportPackage["csv"] {
  return {
    findings: buildCsv(
      [
        "id", "dossierId", "family", "severity", "ruleId", "ruleVersion", "title",
        "normativeRef", "normativeVersion", "sourceDocumentIds", "evidenceSteps",
      ],
      report.findings.map((finding) => ({
        id: finding.id,
        dossierId: report.dossier.id,
        family: finding.family,
        severity: finding.severity,
        ruleId: finding.ruleId,
        ruleVersion: finding.ruleVersion,
        title: finding.titre,
        normativeRef: finding.source.ref,
        normativeVersion: finding.source.effectiveDate,
        sourceDocumentIds: report.evidenceChain.find((chain) => chain.findingId === finding.id)?.sourceDocumentIds ?? [],
        evidenceSteps: finding.preuve.map((step) => `${step.etape}:${step.detail}`),
      })),
    ),
    reviewEvents: buildCsv(
      [
        "id", "dossierId", "findingId", "actorId", "actorRole", "previousStatus",
        "newStatus", "comment", "relatedEvidenceIds", "createdAt", "previousEventHash", "eventHash",
      ],
      report.reviewEvents.map((event) => ({ ...event })),
    ),
    controls: buildCsv(
      ["controlId", "controlVersion", "status", "findingIds", "normativeReferences"],
      report.controls.map((control) => ({ ...control })),
    ),
    sources: buildCsv(
      [
        "id", "fileName", "documentType", "sha256", "parserVersion", "provider", "bucket",
        "key", "versionId",
      ],
      report.sourceDocuments.map((source) => ({
        id: source.id,
        fileName: source.fileName,
        documentType: source.documentType,
        sha256: source.sha256,
        parserVersion: source.parserVersion,
        provider: source.location?.provider,
        bucket: source.location?.bucket,
        key: source.location?.key,
        versionId: source.location?.versionId,
      })),
    ),
  };
}

export async function buildEvidenceExportPackage(
  snapshot: DossierSnapshot,
  synthesis: SynthesisSnapshot,
  options: BuildEvidencePackageOptions,
): Promise<EvidenceExportPackage> {
  assertExportScope(snapshot, options.activeContext);
  if (snapshot.dossier.id !== synthesis.dossierId) throw new Error("EXPORT_SNAPSHOT_DOSSIER_MISMATCH");
  if (!verifySynthesisSnapshotHash(synthesis)) throw new Error("EXPORT_SNAPSHOT_HASH_INVALID");
  const digest = reviewEventsDigest(snapshot.reviewEvents);
  if (digest !== synthesis.reviewEventsDigest) throw new Error("EXPORT_REVIEW_DIGEST_MISMATCH");

  const report = buildCanonicalExport(snapshot, synthesis);
  const canonical = canonicalJson(report);
  const csv = buildCsvFiles(report);
  const html = buildAccessibleEvidenceHtml(report);
  const { buildPdfFromAccessibleHtml } = await import("./pdf");
  const pdf = await buildPdfFromAccessibleHtml(html, {
    title: `Dossier de preuve PROBANT - ${snapshot.dossier.societe.raisonSociale}`,
    createdAt: synthesis.generatedAt,
  });
  const base = `probant-${snapshot.dossier.societe.siren}-${snapshot.dossier.societe.exercice}-${synthesis.snapshotHash.slice(0, 12)}`;
  const artifacts: ManifestArtifact[] = [
    artifact("canonical_json", `${base}.json`, "application/json", canonical),
    artifact("findings_csv", `${base}-findings.csv`, "text/csv;charset=utf-8", csv.findings),
    artifact("review_events_csv", `${base}-review-events.csv`, "text/csv;charset=utf-8", csv.reviewEvents),
    artifact("controls_csv", `${base}-controls.csv`, "text/csv;charset=utf-8", csv.controls),
    artifact("sources_csv", `${base}-sources.csv`, "text/csv;charset=utf-8", csv.sources),
    artifact("accessible_html", `${base}.html`, "text/html;charset=utf-8", html),
    artifact("pdf", `${base}.pdf`, "application/pdf", pdf, {
      derivedFrom: `${base}.html`,
      validation: {
        pdfA: {
          status: "not_validated",
          profile: null,
          validator: null,
          validatedAt: null,
        },
      },
    }),
  ];
  const sources = report.sourceDocuments;
  const extraLimitations: EvidenceManifest["limitations"] = [];
  const invalidHashes = sources.filter((source) => !SHA256_PATTERN.test(source.sha256));
  if (invalidHashes.length > 0) {
    extraLimitations.push({
      code: "invalid_source_hash",
      message: "Un ou plusieurs documents sources ne portent pas un SHA-256 hexadécimal complet.",
      subjects: invalidHashes.map((source) => source.id),
    });
  }
  const missingLocations = sources.filter((source) => source.location === null);
  if (missingLocations.length > 0) {
    extraLimitations.push({
      code: "missing_source_location",
      message: "La localisation logique d'un ou plusieurs documents sources est absente.",
      subjects: missingLocations.map((source) => source.id),
    });
  }
  const unresolvedEvidence = report.evidenceChain.filter((chain) => chain.sourceDocumentIds.length === 0);
  if (unresolvedEvidence.length > 0) {
    extraLimitations.push({
      code: "missing_evidence",
      message: "Le document source exact n'a pas pu être résolu pour certains constats.",
      subjects: unresolvedEvidence.map((chain) => chain.findingId),
    });
  }
  const parserVersions = Object.fromEntries(
    sources
      .filter((source): source is ManifestSourceDocument & { parserVersion: string } =>
        source.parserVersion !== null,
      )
      .map((source) => [source.id, source.parserVersion]),
  );
  const manifest: EvidenceManifest = {
    manifestVersion: "1.0.0",
    applicationVersion: options.applicationVersion,
    dossierId: snapshot.dossier.id,
    snapshotId: synthesis.snapshotId,
    createdAt: synthesis.generatedAt,
    sourceDocuments: sources,
    parserVersions,
    ruleSetVersion: synthesis.ruleSetVersion,
    referenceSetVersion: synthesis.referenceSetVersion,
    policyVersion: synthesis.policyVersion,
    snapshotSha256: synthesis.snapshotHash,
    reviewEventsDigest: digest,
    artifacts,
    limitations: [...synthesis.limitations, ...extraLimitations].sort(
      (a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
    ),
  };
  return {
    manifest,
    manifestJson: canonicalJson(manifest),
    canonicalJson: canonical,
    csv,
    html,
    pdf,
  };
}

export function verifyEvidenceExportPackage(pack: EvidenceExportPackage): string[] {
  const errors: string[] = [];
  if (canonicalJson(pack.manifest) !== pack.manifestJson) errors.push("MANIFEST_NOT_CANONICAL");
  const contents = new Map<EvidenceArtifactFormat, string | Uint8Array>([
    ["canonical_json", pack.canonicalJson],
    ["findings_csv", pack.csv.findings],
    ["review_events_csv", pack.csv.reviewEvents],
    ["controls_csv", pack.csv.controls],
    ["sources_csv", pack.csv.sources],
    ["accessible_html", pack.html],
    ["pdf", pack.pdf],
  ]);
  for (const artifactEntry of pack.manifest.artifacts) {
    const content = contents.get(artifactEntry.format);
    if (content === undefined) {
      errors.push(`ARTIFACT_MISSING:${artifactEntry.id}`);
      continue;
    }
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    if (sha256Hex(bytes) !== artifactEntry.sha256) errors.push(`ARTIFACT_HASH_INVALID:${artifactEntry.id}`);
    if (bytes.byteLength !== artifactEntry.byteLength) errors.push(`ARTIFACT_LENGTH_INVALID:${artifactEntry.id}`);
  }
  const referencedFormats = new Set(pack.manifest.artifacts.map((entry) => entry.format));
  if (
    pack.manifest.artifacts.length !== contents.size ||
    referencedFormats.size !== contents.size ||
    [...contents.keys()].some((format) => !referencedFormats.has(format))
  ) {
    errors.push("ARTIFACT_REFERENCES_INCOMPLETE");
  }
  const htmlArtifact = pack.manifest.artifacts.find((entry) => entry.format === "accessible_html");
  const pdfArtifact = pack.manifest.artifacts.find((entry) => entry.format === "pdf");
  if (!htmlArtifact || pdfArtifact?.derivedFrom !== htmlArtifact.fileName) {
    errors.push("PDF_HTML_DERIVATION_INVALID");
  }
  if (
    pdfArtifact?.validation?.pdfA.status === "valid" &&
    (!pdfArtifact.validation.pdfA.validator || !pdfArtifact.validation.pdfA.profile)
  ) {
    errors.push("PDF_ARCHIVE_VALIDATION_INCOMPLETE");
  }
  if (pack.manifest.sourceDocuments.some((source) => !SHA256_PATTERN.test(source.sha256))) {
    errors.push("SOURCE_HASH_INVALID");
  }
  if (utf8Length(pack.manifestJson) === 0) errors.push("MANIFEST_EMPTY");
  return errors;
}

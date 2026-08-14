import type { DossierSnapshot, ReviewEventStatus } from "@/lib/dossier";
import type { SynthesisSnapshot } from "@/lib/synthesis";

export type EvidenceArtifactFormat =
  | "canonical_json"
  | "findings_csv"
  | "review_events_csv"
  | "controls_csv"
  | "sources_csv"
  | "accessible_html"
  | "pdf";

export interface ManifestArtifact {
  id: string;
  format: EvidenceArtifactFormat;
  fileName: string;
  mediaType: string;
  sha256: string;
  byteLength: number;
  derivedFrom?: string;
  validation?: {
    pdfA: {
      status: "not_validated" | "valid" | "invalid";
      profile: string | null;
      validator: string | null;
      validatedAt: string | null;
    };
  };
}

export interface ManifestSourceDocument {
  id: string;
  fileName: string;
  documentType: string;
  sha256: string;
  location: {
    provider: string;
    bucket?: string;
    key: string;
    versionId?: string;
  } | null;
  parserVersion: string | null;
}

export interface EvidenceManifest {
  manifestVersion: "1.0.0";
  applicationVersion: string;
  dossierId: string;
  snapshotId: string;
  createdAt: string;
  sourceDocuments: ManifestSourceDocument[];
  parserVersions: Record<string, string>;
  ruleSetVersion: string;
  referenceSetVersion: string;
  policyVersion: string;
  snapshotSha256: string;
  reviewEventsDigest: string;
  artifacts: ManifestArtifact[];
  limitations: Array<{ code: string; message: string; subjects: string[] }>;
}

export interface EvidenceControlRow {
  controlId: string;
  controlVersion: string;
  status: "finding_emitted" | "completed_without_finding" | "not_concluded";
  findingIds: string[];
  normativeReferences: string[];
}

export interface CanonicalEvidenceExport {
  exportSchemaVersion: "1.0.0";
  dossier: DossierSnapshot["dossier"];
  synthesisSnapshot: SynthesisSnapshot;
  sourceDocuments: ManifestSourceDocument[];
  controls: EvidenceControlRow[];
  findings: DossierSnapshot["findings"];
  reviewEvents: DossierSnapshot["reviewEvents"];
  evidenceChain: Array<{
    findingId: string;
    sourceDocumentIds: string[];
    parserVersions: string[];
    control: { id: string; version: string };
    normativeSource: { ref: string; version: string };
    reviewEventIds: string[];
    snapshotId: string;
  }>;
}

export interface EvidenceExportPackage {
  manifest: EvidenceManifest;
  manifestJson: string;
  canonicalJson: string;
  csv: {
    findings: string;
    reviewEvents: string;
    controls: string;
    sources: string;
  };
  html: string;
  pdf: Uint8Array;
}

export interface ReviewDecisionRequest {
  findingId: string;
  newStatus: ReviewEventStatus;
  comment?: string;
  relatedEvidenceIds?: string[];
}


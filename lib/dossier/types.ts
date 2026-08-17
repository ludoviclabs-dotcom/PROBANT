
import type { DossierSnapshot, FecEntry, Finding } from "@/lib/canonical-model";

export type {
  CalculationContext,
  DossierSnapshot,
  DossierSourceKind,
  ReviewEvent,
  ReviewEventAction,
  ReviewEventStatus,
  SourceDocumentSummary,
} from "@/lib/canonical-model";

export interface DossierContext {
  organizationId: string;
  dossierId: string;
}

export interface DossierRepository {
  get(context: DossierContext): Promise<DossierSnapshot | null>;
  save(context: DossierContext, snapshot: DossierSnapshot): Promise<void>;
}

export interface PostgresDossierRepository extends DossierRepository {
  readonly kind: "persistent";
}

export interface FecDepotSnapshotInput {
  dossierId?: string;
  sourceDocumentId?: string;
  nomFichier: string;
  fingerprint: string;
  parserVersion?: string;
  sourceLocation?: import("@/lib/canonical-model").SourceDocumentSummary["location"];
  siren: string | null;
  referentielVersion: string;
  admissibilite: Finding[];
  analyse: Finding[];
  entries: FecEntry[];
  entriesTruncated: boolean;
  totalEntryCount?: number;
  controlsEligible?: number;
  controlsExecuted?: number;
  controlsConcluded?: number;
  controlsNotConcluded?: number;
  generatedAt?: string;
}


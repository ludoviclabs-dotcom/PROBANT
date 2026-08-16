import type {
  Finding,
  FiscalSynthesisSnapshot,
  TaxAdjustment,
  TaxComputationSnapshot,
  TaxControlExecution,
  TaxDocumentSnapshot,
  TaxPeriod,
  TaxProfile,
  TaxReconciliationLine,
} from "@/lib/canonical-model";

export interface TaxRepositoryScope {
  organizationId: string;
  dossierId: string;
}

export interface TaxRepository {
  saveProfile(scope: TaxRepositoryScope, profile: TaxProfile): Promise<void>;
  getProfile(scope: TaxRepositoryScope, id: string): Promise<TaxProfile | null>;
  savePeriod(scope: TaxRepositoryScope, period: TaxPeriod): Promise<void>;
  getPeriod(scope: TaxRepositoryScope, id: string): Promise<TaxPeriod | null>;
  saveDocument(scope: TaxRepositoryScope, document: TaxDocumentSnapshot): Promise<void>;
  getDocument(scope: TaxRepositoryScope, id: string): Promise<TaxDocumentSnapshot | null>;
  saveExecution(scope: TaxRepositoryScope, execution: TaxControlExecution): Promise<void>;
  getExecution(scope: TaxRepositoryScope, id: string): Promise<TaxControlExecution | null>;
  saveReconciliationLine(scope: TaxRepositoryScope, line: TaxReconciliationLine): Promise<void>;
  saveAdjustment(scope: TaxRepositoryScope, adjustment: TaxAdjustment): Promise<void>;
  saveComputation(scope: TaxRepositoryScope, snapshot: TaxComputationSnapshot): Promise<void>;
  saveFiscalSynthesis(scope: TaxRepositoryScope, snapshot: FiscalSynthesisSnapshot): Promise<void>;
  getFiscalSynthesis(scope: TaxRepositoryScope, id: string): Promise<FiscalSynthesisSnapshot | null>;
  saveTaxFinding(scope: TaxRepositoryScope, finding: Finding): Promise<void>;
}

function assertScope(scope: TaxRepositoryScope, value: TaxRepositoryScope): void {
  if (
    !scope.organizationId ||
    !scope.dossierId ||
    value.organizationId !== scope.organizationId ||
    value.dossierId !== scope.dossierId
  ) {
    throw new Error("Tax artifact is outside the organization/dossier scope.");
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryTaxRepository implements TaxRepository {
  private readonly profiles = new Map<string, TaxProfile>();
  private readonly periods = new Map<string, TaxPeriod>();
  private readonly documents = new Map<string, TaxDocumentSnapshot>();
  private readonly executions = new Map<string, TaxControlExecution>();
  private readonly reconciliationLines = new Map<string, TaxReconciliationLine>();
  private readonly adjustments = new Map<string, TaxAdjustment>();
  private readonly computations = new Map<string, TaxComputationSnapshot>();
  private readonly fiscalSyntheses = new Map<string, FiscalSynthesisSnapshot>();
  private readonly taxFindings = new Map<string, Finding>();

  private key(scope: TaxRepositoryScope, id: string): string {
    return `${scope.organizationId}\u0000${scope.dossierId}\u0000${id}`;
  }

  private insert<T>(map: Map<string, T>, scope: TaxRepositoryScope, id: string, value: T): void {
    const key = this.key(scope, id);
    if (map.has(key)) throw new Error("Immutable tax artifact already exists.");
    map.set(key, clone(value));
  }

  private read<T>(map: Map<string, T>, scope: TaxRepositoryScope, id: string): T | null {
    const value = map.get(this.key(scope, id));
    return value ? clone(value) : null;
  }

  async saveProfile(scope: TaxRepositoryScope, profile: TaxProfile): Promise<void> {
    assertScope(scope, profile);
    this.insert(this.profiles, scope, profile.id, profile);
  }

  async getProfile(scope: TaxRepositoryScope, id: string): Promise<TaxProfile | null> {
    return this.read(this.profiles, scope, id);
  }

  async savePeriod(scope: TaxRepositoryScope, period: TaxPeriod): Promise<void> {
    assertScope(scope, period);
    this.insert(this.periods, scope, period.id, period);
  }

  async getPeriod(scope: TaxRepositoryScope, id: string): Promise<TaxPeriod | null> {
    return this.read(this.periods, scope, id);
  }

  async saveDocument(scope: TaxRepositoryScope, document: TaxDocumentSnapshot): Promise<void> {
    assertScope(scope, document);
    for (const field of document.fields) assertScope(scope, field);
    this.insert(this.documents, scope, document.id, document);
  }

  async getDocument(scope: TaxRepositoryScope, id: string): Promise<TaxDocumentSnapshot | null> {
    return this.read(this.documents, scope, id);
  }

  async saveExecution(scope: TaxRepositoryScope, execution: TaxControlExecution): Promise<void> {
    assertScope(scope, execution);
    this.insert(this.executions, scope, execution.id, execution);
  }

  async getExecution(scope: TaxRepositoryScope, id: string): Promise<TaxControlExecution | null> {
    return this.read(this.executions, scope, id);
  }

  async saveReconciliationLine(scope: TaxRepositoryScope, line: TaxReconciliationLine): Promise<void> {
    assertScope(scope, line);
    this.insert(this.reconciliationLines, scope, line.id, line);
  }

  async saveAdjustment(scope: TaxRepositoryScope, adjustment: TaxAdjustment): Promise<void> {
    assertScope(scope, adjustment);
    this.insert(this.adjustments, scope, adjustment.id, adjustment);
  }

  async saveComputation(scope: TaxRepositoryScope, snapshot: TaxComputationSnapshot): Promise<void> {
    assertScope(scope, snapshot);
    this.insert(this.computations, scope, snapshot.id, snapshot);
  }

  async saveFiscalSynthesis(scope: TaxRepositoryScope, snapshot: FiscalSynthesisSnapshot): Promise<void> {
    assertScope(scope, snapshot);
    this.insert(this.fiscalSyntheses, scope, snapshot.id, snapshot);
  }

  async getFiscalSynthesis(scope: TaxRepositoryScope, id: string): Promise<FiscalSynthesisSnapshot | null> {
    return this.read(this.fiscalSyntheses, scope, id);
  }

  async saveTaxFinding(scope: TaxRepositoryScope, finding: Finding): Promise<void> {
    if (finding.domain !== "tax" || !finding.taxDetails) {
      throw new Error("A persisted tax finding must carry domain=tax and TaxFindingDetails.");
    }
    this.insert(this.taxFindings, scope, finding.id, finding);
  }
}


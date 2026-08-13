
import type {
  DossierContext,
  DossierRepository,
  DossierSnapshot,
  PostgresDossierRepository,
} from "./types";
import { buildDemoDossierSnapshot } from "./snapshot-builder";

export const DEMO_DOSSIER_CONTEXT: DossierContext = {
  organizationId: "demo",
  dossierId: buildDemoDossierSnapshot().dossier.id,
};

const SESSION_PREFIX = "probant:dossier:v1";
const SELECTED_CONTEXT_KEY = `${SESSION_PREFIX}:selected-context`;
const LEGACY_ACTIVE_KEY = "probant:active-dossier-snapshot";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isPersistentContext(context: DossierContext): boolean {
  return UUID_PATTERN.test(context.organizationId) && UUID_PATTERN.test(context.dossierId);
}

export interface SessionStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

function snapshotKey(context: DossierContext): string {
  return `${SESSION_PREFIX}:snapshot:${encodeURIComponent(context.organizationId)}:${encodeURIComponent(context.dossierId)}`;
}

function indexKey(organizationId: string): string {
  return `${SESSION_PREFIX}:index:${encodeURIComponent(organizationId)}`;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class DemoDossierRepository implements DossierRepository {
  async get(context: DossierContext): Promise<DossierSnapshot | null> {
    if (context.organizationId !== DEMO_DOSSIER_CONTEXT.organizationId) return null;
    if (context.dossierId === DEMO_DOSSIER_CONTEXT.dossierId) {
      return buildDemoDossierSnapshot();
    }
    const prefix = "demo-scenario-";
    if (!context.dossierId.startsWith(prefix)) return null;
    const snapshot = buildDemoDossierSnapshot(context.dossierId.slice(prefix.length));
    return snapshot.dossier.id === context.dossierId ? snapshot : null;
  }

  async save(): Promise<void> {
    throw new Error("DemoDossierRepository is read-only.");
  }
}

/** Adaptateur unique de sessionStorage pour les snapshots et leur selection. */
export class SessionDossierRepository implements DossierRepository {
  constructor(private readonly storage: SessionStoragePort) {}

  async get(context: DossierContext): Promise<DossierSnapshot | null> {
    const snapshot = parseJson<DossierSnapshot>(this.storage.getItem(snapshotKey(context)));
    if (!snapshot || snapshot.dossier.id !== context.dossierId) return null;
    const legacyKind = (snapshot as DossierSnapshot & { storageKind?: DossierSnapshot["sourceKind"] })
      .storageKind;
    return {
      ...snapshot,
      sourceKind: snapshot.sourceKind ?? legacyKind ?? "session",
      ledgerEntries: undefined,
    };
  }

  async save(context: DossierContext, snapshot: DossierSnapshot): Promise<void> {
    if (snapshot.dossier.id !== context.dossierId) {
      throw new Error("Le contexte et le snapshot ne referencent pas le meme dossier.");
    }
    const next: DossierSnapshot = {
      ...snapshot,
      sourceKind: snapshot.sourceKind === "persistent" ? "persistent" : "session",
      ledgerEntries: undefined,
    };
    this.storage.setItem(snapshotKey(context), JSON.stringify(next));
    const contexts = (await this.listContexts(context.organizationId)).filter(
      (item) => item.dossierId !== context.dossierId,
    );
    contexts.unshift(context);
    this.storage.setItem(indexKey(context.organizationId), JSON.stringify(contexts.slice(0, 20)));
  }

  async listContexts(organizationId: string): Promise<DossierContext[]> {
    const contexts = parseJson<DossierContext[]>(this.storage.getItem(indexKey(organizationId)));
    return Array.isArray(contexts) ? contexts : [];
  }

  async list(organizationId: string): Promise<DossierSnapshot[]> {
    const snapshots = await Promise.all(
      (await this.listContexts(organizationId)).map((context) => this.get(context)),
    );
    return snapshots.filter((snapshot): snapshot is DossierSnapshot => snapshot !== null);
  }

  async select(context: DossierContext): Promise<void> {
    this.storage.setItem(SELECTED_CONTEXT_KEY, JSON.stringify(context));
  }

  async getSelectedContext(): Promise<DossierContext | null> {
    const selected = parseJson<DossierContext>(this.storage.getItem(SELECTED_CONTEXT_KEY));
    if (selected?.organizationId && selected.dossierId) return selected;

    // Migration transparente du brouillon historique vers le stockage contextualise.
    const legacy = parseJson<DossierSnapshot>(this.storage.getItem(LEGACY_ACTIVE_KEY));
    if (!legacy || legacy.dossier.demoMode) return null;
    const context = { organizationId: "session", dossierId: legacy.dossier.id };
    await this.save(context, { ...legacy, sourceKind: "session" });
    await this.select(context);
    this.storage.removeItem(LEGACY_ACTIVE_KEY);
    return context;
  }
}

export class ActiveDossierService {
  constructor(
    private readonly demoRepository: DemoDossierRepository,
    private readonly sessionRepository: SessionDossierRepository,
    private readonly persistentRepository?: PostgresDossierRepository,
  ) {}

  /** Resout uniquement depuis un contexte de route explicite ou la session courante. */
  async resolve(routeContext?: DossierContext | null): Promise<{
    context: DossierContext;
    snapshot: DossierSnapshot;
  }> {
    const context = routeContext ?? (await this.sessionRepository.getSelectedContext());
    if (context) {
      const snapshot = context.organizationId === "demo"
        ? await this.demoRepository.get(context)
        : isPersistentContext(context)
          ? await this.persistentRepository?.get(context)
          : await this.sessionRepository.get(context);
      if (snapshot) return { context, snapshot };
      if (isPersistentContext(context)) {
        throw new Error(`Dossier persistant indisponible: ${context.dossierId}`);
      }
    }

    const demo = await this.demoRepository.get(DEMO_DOSSIER_CONTEXT);
    if (!demo) throw new Error("Le dossier de demonstration est indisponible.");
    return { context: DEMO_DOSSIER_CONTEXT, snapshot: demo };
  }

  async save(context: DossierContext, snapshot: DossierSnapshot): Promise<void> {
    const persistentContext = isPersistentContext(context);
    if (persistentContext !== (snapshot.sourceKind === "persistent")) {
      throw new Error("Le contexte et la source du snapshot sont incompatibles.");
    }
    const repository = snapshot.sourceKind === "persistent"
      ? this.persistentRepository
      : this.sessionRepository;
    if (!repository) throw new Error("Aucun repository persistant n'est configure.");
    await repository.save(context, snapshot);
    await this.sessionRepository.select(context);
  }

  async select(context: DossierContext): Promise<{ context: DossierContext; snapshot: DossierSnapshot }> {
    const resolved = await this.resolve(context);
    await this.sessionRepository.select(resolved.context);
    return resolved;
  }

  async list(organizationId: string): Promise<DossierSnapshot[]> {
    const [demo, sessions] = await Promise.all([
      this.demoRepository.get(DEMO_DOSSIER_CONTEXT),
      this.sessionRepository.list(organizationId),
    ]);
    return demo ? [demo, ...sessions] : sessions;
  }
}

export async function getServerDossierSnapshot(
  context: DossierContext = DEMO_DOSSIER_CONTEXT,
): Promise<DossierSnapshot> {
  const snapshot = await new DemoDossierRepository().get(context);
  if (!snapshot) throw new Error(`Dossier serveur introuvable: ${context.dossierId}`);
  return snapshot;
}


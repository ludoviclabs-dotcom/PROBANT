import type {
  DossierContext,
  DossierSnapshot,
  PostgresDossierRepository,
} from "./types";

export class HttpDossierRepository implements PostgresDossierRepository {
  readonly kind = "persistent" as const;

  async get(context: DossierContext): Promise<DossierSnapshot | null> {
    const response = await fetch(
      `/api/dossiers/${encodeURIComponent(context.dossierId)}/snapshot`,
      { cache: "no-store" },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`PERSISTENT_SNAPSHOT_UNAVAILABLE:${response.status}`);
    return (await response.json()) as DossierSnapshot;
  }

  async save(): Promise<void> {
    throw new Error("Les snapshots persistants sont produits par le worker d'ingestion.");
  }
}

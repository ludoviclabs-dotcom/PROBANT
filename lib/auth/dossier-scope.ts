import { eq } from "drizzle-orm";
import type { ProbantDatabase } from "@/lib/db/client";
import { dossiers } from "@/lib/db/schema";
import { AuthorizationDenied, type AuthenticatedPrincipal } from "./principal";

/**
 * Vérification d'appartenance d'un dossier à une organisation.
 *
 * C'est le second verrou de l'isolation inter-organisations. Le premier est le
 * filtrage `organization_id` de chaque requête métier ; celui-ci est
 * indépendant : même si une requête métier oubliait sa clause, l'accès serait
 * refusé avant elle.
 *
 * Le refus est **indistinguable** d'un dossier inexistant : répondre 403 pour
 * un dossier d'une autre organisation et 404 pour un dossier inconnu suffirait
 * à énumérer les dossiers du voisin.
 */
export interface DossierOwnershipReader {
  organizationIdFor(dossierId: string): Promise<string | null>;
}

export class DrizzleDossierOwnershipReader implements DossierOwnershipReader {
  constructor(private readonly db: ProbantDatabase) {}

  async organizationIdFor(dossierId: string): Promise<string | null> {
    const rows = await this.db
      .select({ organizationId: dossiers.organizationId })
      .from(dossiers)
      .where(eq(dossiers.id, dossierId))
      .limit(1);
    return rows[0]?.organizationId ?? null;
  }
}

/** Lecteur mémoire pour les tests d'isolation. */
export class InMemoryDossierOwnershipReader implements DossierOwnershipReader {
  constructor(private readonly ownership: ReadonlyMap<string, string>) {}

  async organizationIdFor(dossierId: string): Promise<string | null> {
    return this.ownership.get(dossierId) ?? null;
  }
}

export async function assertDossierBelongsToPrincipal(
  reader: DossierOwnershipReader,
  principal: AuthenticatedPrincipal,
  dossierId: string,
): Promise<void> {
  const owner = await reader.organizationIdFor(dossierId);
  if (owner !== principal.organizationId) {
    throw new AuthorizationDenied("DOSSIER_NOT_FOUND", "Dossier introuvable.", 403);
  }
}

/** Variante pour les ressources déjà lues, quand l'organisation est connue. */
export function assertRowBelongsToPrincipal(
  principal: AuthenticatedPrincipal,
  rowOrganizationId: string | null | undefined,
  resourceKind: string,
): void {
  if (!rowOrganizationId || rowOrganizationId !== principal.organizationId) {
    throw new AuthorizationDenied(
      "RESOURCE_NOT_FOUND",
      `Ressource introuvable : ${resourceKind}.`,
      403,
    );
  }
}

export interface TaxDocumentProviderRequest {
  organizationId: string;
  dossierId: string;
  siren: string;
  documentType: string;
  fiscalYear: number;
}

export interface TaxDocumentProviderResponse {
  providerDocumentId: string;
  content: Blob;
  mimeType: string;
  retrievedAt: string;
}

export interface TaxDocumentProvider {
  readonly providerId: string;
  isAvailable(): boolean;
  retrieve(request: TaxDocumentProviderRequest): Promise<TaxDocumentProviderResponse>;
}

export interface ApiEntrepriseTaxDocumentProviderConfig {
  enabled?: boolean;
  explicitlyAuthorized?: boolean;
  accessToken?: string;
}

/**
 * Point d'extension uniquement. TAX-03 n'effectue aucun appel reseau et le
 * provider reste indisponible tant qu'une configuration et une habilitation
 * explicites ne sont pas toutes deux presentes.
 */
export class ApiEntrepriseTaxDocumentProvider implements TaxDocumentProvider {
  readonly providerId = "api-entreprise";

  constructor(private readonly config: ApiEntrepriseTaxDocumentProviderConfig = {}) {}

  isAvailable(): boolean {
    return Boolean(
      this.config.enabled &&
      this.config.explicitlyAuthorized &&
      this.config.accessToken,
    );
  }

  async retrieve(_request: TaxDocumentProviderRequest): Promise<TaxDocumentProviderResponse> {
    if (!this.isAvailable()) throw new Error("TAX_DOCUMENT_PROVIDER_DISABLED");
    throw new Error("TAX_DOCUMENT_PROVIDER_NOT_IMPLEMENTED");
  }
}

export function getTaxDocumentProvider(): TaxDocumentProvider {
  return new ApiEntrepriseTaxDocumentProvider();
}



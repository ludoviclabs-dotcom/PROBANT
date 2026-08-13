export interface StoredObjectRef {
  provider: "s3";
  bucket: string;
  key: string;
  versionId?: string;
}

export interface DirectUploadRequest {
  object: StoredObjectRef;
  contentType: string;
  contentLength: number;
  checksumSha256Base64?: string;
  metadata: {
    organizationId: string;
    dossierId: string;
    sourceDocumentId: string;
    ingestionJobId: string;
  };
  expiresInSeconds: number;
}

export interface DirectUploadGrant {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface StoredObjectMetadata {
  contentLength: number;
  contentType?: string;
  checksumSha256Base64?: string;
  versionId?: string;
  metadata: Record<string, string>;
}

export interface ObjectStorage {
  readonly provider: "s3";
  readonly bucket: string;
  readonly maxDirectUploadBytes: number;
  createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadGrant>;
  head(object: StoredObjectRef): Promise<StoredObjectMetadata>;
  read(object: StoredObjectRef): Promise<ReadableStream<Uint8Array>>;
  deleteAbandoned(object: StoredObjectRef): Promise<void>;
}

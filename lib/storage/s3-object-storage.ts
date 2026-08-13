import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsRuntimeConfig } from "@/lib/aws/client-config";
import type {
  DirectUploadGrant,
  DirectUploadRequest,
  ObjectStorage,
  StoredObjectMetadata,
  StoredObjectRef,
} from "./types";

export const S3_SINGLE_PUT_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export class S3ObjectStorage implements ObjectStorage {
  readonly provider = "s3" as const;
  readonly maxDirectUploadBytes = S3_SINGLE_PUT_MAX_BYTES;
  private readonly client: S3Client;

  constructor(
    readonly bucket: string,
    region: string,
    client?: S3Client,
  ) {
    if (!bucket) throw new Error("S3_BUCKET_NOT_CONFIGURED");
    this.client = client ?? new S3Client(awsRuntimeConfig(region));
  }

  async createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadGrant> {
    if (request.object.bucket !== this.bucket) throw new Error("S3_BUCKET_MISMATCH");
    if (request.contentLength > S3_SINGLE_PUT_MAX_BYTES) {
      throw new Error("S3_SINGLE_PUT_LIMIT_EXCEEDED");
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: request.object.key,
      ContentType: request.contentType,
      ContentLength: request.contentLength,
      ChecksumSHA256: request.checksumSha256Base64,
      Metadata: {
        organizationId: request.metadata.organizationId,
        dossierId: request.metadata.dossierId,
        sourceDocumentId: request.metadata.sourceDocumentId,
        ingestionJobId: request.metadata.ingestionJobId,
      },
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: request.expiresInSeconds,
    });
    const headers: Record<string, string> = {
      "content-type": request.contentType,
      "x-amz-meta-organizationid": request.metadata.organizationId,
      "x-amz-meta-dossierid": request.metadata.dossierId,
      "x-amz-meta-sourcedocumentid": request.metadata.sourceDocumentId,
      "x-amz-meta-ingestionjobid": request.metadata.ingestionJobId,
    };
    if (request.checksumSha256Base64) {
      headers["x-amz-checksum-sha256"] = request.checksumSha256Base64;
    }
    return {
      method: "PUT",
      url,
      headers,
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000).toISOString(),
    };
  }

  async head(object: StoredObjectRef): Promise<StoredObjectMetadata> {
    const output = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        VersionId: object.versionId,
        ChecksumMode: "ENABLED",
      }),
    );
    return {
      contentLength: output.ContentLength ?? 0,
      contentType: output.ContentType,
      checksumSha256Base64: output.ChecksumSHA256,
      versionId: output.VersionId,
      metadata: output.Metadata ?? {},
    };
  }

  async read(object: StoredObjectRef): Promise<ReadableStream<Uint8Array>> {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        VersionId: object.versionId,
      }),
    );
    if (!output.Body) throw new Error("S3_OBJECT_BODY_MISSING");
    return output.Body.transformToWebStream() as ReadableStream<Uint8Array>;
  }

  async deleteAbandoned(object: StoredObjectRef): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        VersionId: object.versionId,
      }),
    );
  }
}

export function createS3ObjectStorageFromEnvironment(): S3ObjectStorage {
  return new S3ObjectStorage(
    process.env.S3_PRIVATE_BUCKET?.trim() ?? "",
    process.env.AWS_REGION?.trim() ?? "",
  );
}

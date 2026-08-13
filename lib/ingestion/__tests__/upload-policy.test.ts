import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { ObjectStorage } from "@/lib/storage/types";
import type { DrizzleIngestionRepository, UploadIntentRecord } from "../repository";
import type { IngestionJobQueue } from "../queue";
import {
  DirectUploadService,
  validateFileContract,
  type StartDirectUploadInput,
} from "../upload-service";

function input(overrides: Partial<StartDirectUploadInput> = {}): StartDirectUploadInput {
  return {
    organizationId: "00000000-0000-4000-8000-000000000001",
    dossierId: "00000000-0000-4000-8000-000000000002",
    fileName: "123456789FEC20241231.txt",
    documentType: "fec",
    contentType: "text/plain",
    contentLength: 100,
    idempotencyKey: "idempotency-test",
    parserVersion: "test",
    requestId: "request-test",
    expiresInSeconds: 60,
    ...overrides,
  };
}

function errorCode(overrides: Partial<StartDirectUploadInput>): string {
  try {
    validateFileContract(input(overrides));
  } catch (error) {
    return error instanceof ApiError ? error.code : "UNKNOWN";
  }
  return "NO_ERROR";
}

describe("politique extension / MIME", () => {
  it("accepte un FEC texte cohérent", () => {
    expect(() => validateFileContract(input())).not.toThrow();
  });

  it("rejette une mauvaise extension", () => {
    expect(errorCode({ fileName: "fec.exe" })).toBe("FILE_EXTENSION_MISMATCH");
  });

  it("rejette un mauvais MIME", () => {
    expect(errorCode({ contentType: "application/pdf" })).toBe("FILE_MIME_MISMATCH");
  });

  it("rejette explicitement XLS legacy", () => {
    expect(
      errorCode({
        fileName: "balance.xls",
        documentType: "balance",
        contentType: "application/vnd.ms-excel",
      }),
    ).toBe("XLS_LEGACY_NOT_SUPPORTED");
  });

  it("rend l'intention d'upload idempotente", async () => {
    const record = {
      job: { id: "00000000-0000-4000-8000-000000000003", status: "uploading" },
      document: {
        id: "00000000-0000-4000-8000-000000000004",
        originalName: "123456789FEC20241231.txt",
        documentType: "fec",
        declaredMimeType: "text/plain",
        declaredByteSize: 100,
        declaredChecksumSha256: null,
        storageBucket: "probant-private",
        storageKey: "object-key",
        storageVersionId: null,
      },
    } as unknown as UploadIntentRecord;
    const repository = {
      createOrGetUploadIntent: vi.fn().mockResolvedValue(record),
    } as unknown as DrizzleIngestionRepository;
    const storage: ObjectStorage = {
      provider: "s3",
      bucket: "probant-private",
      maxDirectUploadBytes: 1_000_000,
      createDirectUpload: vi.fn().mockResolvedValue({
        method: "PUT",
        url: "https://storage.invalid/upload",
        headers: {},
        expiresAt: "2026-08-13T20:00:00.000Z",
      }),
      head: vi.fn(),
      read: vi.fn(),
      deleteAbandoned: vi.fn(),
    };
    const queue = { publish: vi.fn() } as unknown as IngestionJobQueue;
    const service = new DirectUploadService(repository, storage, queue, {
      maxUploadBytes: 1_000_000,
      maxFecLines: 100,
      maxLineBytes: 1_000,
      maxFieldBytes: 500,
      maxParseDurationMs: 10_000,
      maxConcurrentJobsPerOrg: 1,
    });
    const first = await service.start(input());
    const second = await service.start(input());
    expect(first.jobId).toBe(second.jobId);
    expect(repository.createOrGetUploadIntent).toHaveBeenCalledTimes(2);
    expect(repository.createOrGetUploadIntent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: "idempotency-test" }),
    );
  });

  it("rejette la réutilisation d'une clé pour un fichier différent", async () => {
    const record = {
      job: { id: "00000000-0000-4000-8000-000000000003", status: "uploading" },
      document: {
        id: "00000000-0000-4000-8000-000000000004",
        originalName: "autre-fichier.txt",
        documentType: "fec",
        declaredMimeType: "text/plain",
        declaredByteSize: 100,
        declaredChecksumSha256: null,
        storageBucket: "probant-private",
        storageKey: "object-key",
        storageVersionId: null,
      },
    } as unknown as UploadIntentRecord;
    const repository = {
      createOrGetUploadIntent: vi.fn().mockResolvedValue(record),
    } as unknown as DrizzleIngestionRepository;
    const storage = {
      provider: "s3",
      bucket: "probant-private",
      maxDirectUploadBytes: 1_000_000,
      createDirectUpload: vi.fn(),
    } as unknown as ObjectStorage;
    const service = new DirectUploadService(
      repository,
      storage,
      { publish: vi.fn() },
      {
        maxUploadBytes: 1_000_000,
        maxFecLines: 100,
        maxLineBytes: 1_000,
        maxFieldBytes: 500,
        maxParseDurationMs: 10_000,
        maxConcurrentJobsPerOrg: 1,
      },
    );

    await expect(service.start(input())).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      status: 409,
    });
    expect(storage.createDirectUpload).not.toHaveBeenCalled();
  });
});

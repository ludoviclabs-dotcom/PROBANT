import "server-only";

import { getDatabase } from "@/lib/db/client";
import { createS3ObjectStorageFromEnvironment } from "@/lib/storage/s3-object-storage";
import { readIngestionLimits } from "./limits";
import {
  DrizzleUploadQuotaStore,
  UploadQuotaService,
  readUploadQuotaPolicy,
} from "./quota";
import { DrizzleIngestionRepository } from "./repository";
import { createJobQueueFromEnvironment } from "./sqs-job-queue";
import { DirectUploadService } from "./upload-service";
import { createLocalIngestionRuntime } from "./local-runtime";
import { executionProfile } from "@/lib/runtime/profile";

function uploadTtlSeconds(): number {
  const raw = process.env.DIRECT_UPLOAD_TTL_SECONDS;
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value <= 0 || value > 3_600) {
    throw new Error("DIRECT_UPLOAD_TTL_NOT_CONFIGURED");
  }
  return value;
}

export function createPersistentIngestionRuntime() {
  // Profil personnel local (C07) : mêmes contrats, pièces sur le PC, traitement local reprenable ; ni S3 ni SQS.
  if (executionProfile(process.env) === "personal_local") return createLocalIngestionRuntime();
  const repository = new DrizzleIngestionRepository(getDatabase());
  const storage = createS3ObjectStorageFromEnvironment();
  const queue = createJobQueueFromEnvironment();
  const limits = readIngestionLimits();
  const quota = new UploadQuotaService(
    new DrizzleUploadQuotaStore(getDatabase()),
    readUploadQuotaPolicy(),
  );
  return {
    repository,
    storage,
    queue,
    limits,
    quota,
    uploadTtlSeconds: uploadTtlSeconds(),
    uploadService: new DirectUploadService(repository, storage, queue, limits, quota),
  };
}

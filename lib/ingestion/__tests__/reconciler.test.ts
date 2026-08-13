import { describe, expect, it, vi } from "vitest";
import type { IngestionJobQueue } from "../queue";
import {
  IngestionQueueReconciler,
  type IngestionPublicationRepository,
} from "../reconciler";

const jobs = [
  {
    jobId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    sourceDocumentId: "00000000-0000-4000-8000-000000000003",
  },
  {
    jobId: "00000000-0000-4000-8000-000000000004",
    organizationId: "00000000-0000-4000-8000-000000000002",
    sourceDocumentId: "00000000-0000-4000-8000-000000000005",
  },
];

describe("IngestionQueueReconciler", () => {
  it("marque uniquement les publications SQS confirmées", async () => {
    const repository: IngestionPublicationRepository = {
      listUploadedJobsAwaitingPublication: vi.fn().mockResolvedValue(jobs),
      markQueuePublished: vi.fn().mockResolvedValue(undefined),
    };
    const queue: IngestionJobQueue = {
      publish: vi.fn()
        .mockResolvedValueOnce({ messageId: "message-1" })
        .mockRejectedValueOnce(new Error("SQS unavailable")),
    };

    const result = await new IngestionQueueReconciler(repository, queue).run(20);

    expect(result).toEqual({ scanned: 2, published: 1, failed: 1 });
    expect(repository.listUploadedJobsAwaitingPublication).toHaveBeenCalledWith(20);
    expect(repository.markQueuePublished).toHaveBeenCalledOnce();
    expect(repository.markQueuePublished).toHaveBeenCalledWith(jobs[0].jobId);
  });
});

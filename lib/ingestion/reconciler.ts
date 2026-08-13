import type { IngestionJobQueue } from "./queue";

export interface IngestionPublicationRepository {
  listUploadedJobsAwaitingPublication(limit: number): Promise<Array<{
    jobId: string;
    organizationId: string;
    sourceDocumentId: string;
  }>>;
  markQueuePublished(jobId: string): Promise<void>;
}

/**
 * Closes the DB-to-SQS publication gap without assuming exactly-once delivery.
 * The worker remains idempotent, so republishing an already delivered job is safe.
 */
export class IngestionQueueReconciler {
  constructor(
    private readonly repository: IngestionPublicationRepository,
    private readonly queue: IngestionJobQueue,
  ) {}

  async run(batchSize: number): Promise<{ scanned: number; published: number; failed: number }> {
    const jobs = await this.repository.listUploadedJobsAwaitingPublication(batchSize);
    let published = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await this.queue.publish({
          schemaVersion: 1,
          jobId: job.jobId,
          organizationId: job.organizationId,
          sourceDocumentId: job.sourceDocumentId,
        });
        await this.repository.markQueuePublished(job.jobId);
        published += 1;
      } catch {
        failed += 1;
      }
    }

    return { scanned: jobs.length, published, failed };
  }
}

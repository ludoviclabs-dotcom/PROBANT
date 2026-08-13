export interface IngestionJobMessage {
  schemaVersion: 1;
  jobId: string;
  organizationId: string;
  sourceDocumentId: string;
}

export interface IngestionJobQueue {
  publish(message: IngestionJobMessage): Promise<{ messageId: string }>;
}

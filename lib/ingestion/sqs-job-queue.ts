import "server-only";

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { awsRuntimeConfig } from "@/lib/aws/client-config";
import type { IngestionJobMessage, IngestionJobQueue } from "./queue";

export class SqsIngestionJobQueue implements IngestionJobQueue {
  private readonly client: SQSClient;

  constructor(
    private readonly queueUrl: string,
    region: string,
    client?: SQSClient,
  ) {
    if (!queueUrl) throw new Error("INGESTION_QUEUE_NOT_CONFIGURED");
    this.client = client ?? new SQSClient(awsRuntimeConfig(region));
  }

  async publish(message: IngestionJobMessage): Promise<{ messageId: string }> {
    const output = await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
      }),
    );
    if (!output.MessageId) throw new Error("INGESTION_QUEUE_MESSAGE_ID_MISSING");
    return { messageId: output.MessageId };
  }
}

export function createJobQueueFromEnvironment(): SqsIngestionJobQueue {
  return new SqsIngestionJobQueue(
    process.env.INGESTION_QUEUE_URL?.trim() ?? "",
    process.env.AWS_REGION?.trim() ?? "",
  );
}

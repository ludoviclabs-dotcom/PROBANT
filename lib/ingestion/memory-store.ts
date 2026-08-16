import type { IngestionJob } from "./types";

interface StoredJob {
  job: IngestionJob;
  payloadText?: string;
}

const memoryState = globalThis as typeof globalThis & {
  __probantIngestionJobs?: Map<string, StoredJob>;
};
const jobs =
  memoryState.__probantIngestionJobs ??
  (memoryState.__probantIngestionJobs = new Map<string, StoredJob>());

export function saveIngestionJob(job: IngestionJob, payloadText?: string): IngestionJob {
  jobs.set(job.id, { job, payloadText });
  return job;
}

export function getIngestionJob(id: string): IngestionJob | null {
  return jobs.get(id)?.job ?? null;
}

export function getIngestionPayload(id: string): string | undefined {
  return jobs.get(id)?.payloadText;
}

export function updateIngestionJob(id: string, patch: Partial<IngestionJob>): IngestionJob | null {
  const current = jobs.get(id);
  if (!current) return null;
  const next = { ...current.job, ...patch };
  jobs.set(id, { ...current, job: next });
  return next;
}

export function listIngestionJobs(): IngestionJob[] {
  return [...jobs.values()].map((item) => item.job);
}


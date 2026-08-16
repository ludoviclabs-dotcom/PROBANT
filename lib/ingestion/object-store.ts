import { get, put } from "@vercel/blob";
import { isPostgresConfigured } from "@/lib/persistence/db";

export interface PrivateObjectStore {
  readonly kind: "memory" | "vercel-blob";
  put(path: string, file: Blob, contentType: string): Promise<string>;
  get(path: string): Promise<ReadableStream<Uint8Array> | null>;
}

const objectState = globalThis as typeof globalThis & {
  __probantPrivateObjects?: Map<string, Blob>;
};
const memoryObjects =
  objectState.__probantPrivateObjects ??
  (objectState.__probantPrivateObjects = new Map<string, Blob>());

export class MemoryPrivateObjectStore implements PrivateObjectStore {
  readonly kind = "memory" as const;

  async put(path: string, file: Blob): Promise<string> {
    const objectPath = `memory://${path}`;
    memoryObjects.set(objectPath, file);
    return objectPath;
  }

  async get(path: string): Promise<ReadableStream<Uint8Array> | null> {
    return memoryObjects.get(path)?.stream() ?? null;
  }
}

export class VercelBlobPrivateObjectStore implements PrivateObjectStore {
  readonly kind = "vercel-blob" as const;

  async put(path: string, file: Blob, contentType: string): Promise<string> {
    const result = await put(path, file, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType,
    });
    return result.url;
  }

  async get(path: string): Promise<ReadableStream<Uint8Array> | null> {
    const result = await get(path, { access: "private", useCache: false });
    return result?.stream ?? null;
  }
}

export function isVercelBlobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

export function isPersistentIngestionConfigured(): boolean {
  return isPostgresConfigured() && isVercelBlobConfigured();
}

export function getPrivateObjectStore(): PrivateObjectStore {
  return isVercelBlobConfigured()
    ? new VercelBlobPrivateObjectStore()
    : new MemoryPrivateObjectStore();
}


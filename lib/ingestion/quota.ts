import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import type { ProbantDatabase } from "@/lib/db/client";
import { uploadQuotaCounters } from "@/lib/db/schema";

/**
 * Rate limit et quota d'upload **par organisation**.
 *
 * Les compteurs vivent en base et non en mémoire : sur Vercel, une Function
 * est recyclée et dupliquée, un compteur de processus ne limiterait donc rien.
 *
 * Deux fenêtres distinctes :
 * - `minute` : rate limit, contre les rafales et le déni de service ;
 * - `day`    : quota volumétrique, contre l'accumulation lente.
 *
 * L'incrément est atomique (`insert … on conflict do update`) : deux requêtes
 * concurrentes ne peuvent pas lire la même valeur et la réécrire.
 */
export type QuotaWindow = "minute" | "day";

const schema = z.object({
  UPLOAD_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000),
  UPLOAD_QUOTA_FILES_PER_DAY: z.coerce.number().int().min(1).max(1_000_000),
  UPLOAD_QUOTA_BYTES_PER_DAY: z.coerce.number().int().min(1),
});

export interface UploadQuotaPolicy {
  readonly ratePerMinute: number;
  readonly filesPerDay: number;
  readonly bytesPerDay: number;
}

export function readUploadQuotaPolicy(
  env: Record<string, string | undefined> = process.env,
): UploadQuotaPolicy {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ].sort();
    throw new Error(`UPLOAD_QUOTA_NOT_CONFIGURED:${missing.join(",")}`);
  }
  return {
    ratePerMinute: parsed.data.UPLOAD_RATE_LIMIT_PER_MINUTE,
    filesPerDay: parsed.data.UPLOAD_QUOTA_FILES_PER_DAY,
    bytesPerDay: parsed.data.UPLOAD_QUOTA_BYTES_PER_DAY,
  };
}

export function windowStart(kind: QuotaWindow, nowMs: number): Date {
  const size = kind === "minute" ? 60_000 : 86_400_000;
  return new Date(Math.floor(nowMs / size) * size);
}

export interface QuotaConsumption {
  readonly requestCount: number;
  readonly byteCount: number;
}

export interface UploadQuotaStore {
  consume(
    organizationId: string,
    kind: QuotaWindow,
    start: Date,
    bytes: number,
  ): Promise<QuotaConsumption>;
  release(
    organizationId: string,
    kind: QuotaWindow,
    start: Date,
    bytes: number,
  ): Promise<void>;
}

export class DrizzleUploadQuotaStore implements UploadQuotaStore {
  constructor(private readonly db: ProbantDatabase) {}

  async consume(
    organizationId: string,
    kind: QuotaWindow,
    start: Date,
    bytes: number,
  ): Promise<QuotaConsumption> {
    const [row] = await this.db
      .insert(uploadQuotaCounters)
      .values({
        organizationId,
        windowKind: kind,
        windowStart: start,
        requestCount: 1,
        byteCount: bytes,
      })
      .onConflictDoUpdate({
        target: [
          uploadQuotaCounters.organizationId,
          uploadQuotaCounters.windowKind,
          uploadQuotaCounters.windowStart,
        ],
        set: {
          requestCount: sql`${uploadQuotaCounters.requestCount} + 1`,
          byteCount: sql`${uploadQuotaCounters.byteCount} + ${bytes}`,
          updatedAt: new Date(),
        },
      })
      .returning({
        requestCount: uploadQuotaCounters.requestCount,
        byteCount: uploadQuotaCounters.byteCount,
      });
    return { requestCount: row.requestCount, byteCount: row.byteCount };
  }

  /** Restitue une consommation quand l'upload est finalement refusé. */
  async release(
    organizationId: string,
    kind: QuotaWindow,
    start: Date,
    bytes: number,
  ): Promise<void> {
    await this.db
      .update(uploadQuotaCounters)
      .set({
        requestCount: sql`greatest(${uploadQuotaCounters.requestCount} - 1, 0)`,
        byteCount: sql`greatest(${uploadQuotaCounters.byteCount} - ${bytes}, 0)`,
        updatedAt: new Date(),
      })
      .where(
        sql`${uploadQuotaCounters.organizationId} = ${organizationId}
            and ${uploadQuotaCounters.windowKind} = ${kind}
            and ${uploadQuotaCounters.windowStart} = ${start}`,
      );
  }
}

export class InMemoryUploadQuotaStore implements UploadQuotaStore {
  private readonly counters = new Map<string, { requestCount: number; byteCount: number }>();

  private key(organizationId: string, kind: QuotaWindow, start: Date): string {
    return `${organizationId}:${kind}:${start.getTime()}`;
  }

  async consume(
    organizationId: string,
    kind: QuotaWindow,
    start: Date,
    bytes: number,
  ): Promise<QuotaConsumption> {
    const key = this.key(organizationId, kind, start);
    const current = this.counters.get(key) ?? { requestCount: 0, byteCount: 0 };
    const next = {
      requestCount: current.requestCount + 1,
      byteCount: current.byteCount + bytes,
    };
    this.counters.set(key, next);
    return next;
  }

  async release(
    organizationId: string,
    kind: QuotaWindow,
    start: Date,
    bytes: number,
  ): Promise<void> {
    const key = this.key(organizationId, kind, start);
    const current = this.counters.get(key);
    if (!current) return;
    this.counters.set(key, {
      requestCount: Math.max(current.requestCount - 1, 0),
      byteCount: Math.max(current.byteCount - bytes, 0),
    });
  }
}

export class UploadQuotaService {
  constructor(
    private readonly store: UploadQuotaStore,
    private readonly policy: UploadQuotaPolicy,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  /**
   * Réserve un upload. Lève avant toute signature d'URL : l'organisation qui
   * dépasse son quota ne reçoit jamais d'autorisation d'écriture au stockage.
   */
  async reserve(organizationId: string, bytes: number): Promise<void> {
    const now = this.nowMs();
    const minuteStart = windowStart("minute", now);
    const minute = await this.store.consume(organizationId, "minute", minuteStart, bytes);
    if (minute.requestCount > this.policy.ratePerMinute) {
      await this.store.release(organizationId, "minute", minuteStart, bytes);
      throw new ApiError(
        "UPLOAD_RATE_LIMITED",
        "Trop de dépôts en peu de temps pour cette organisation.",
        429,
        true,
        { limitPerMinute: this.policy.ratePerMinute },
      );
    }

    const dayStart = windowStart("day", now);
    const day = await this.store.consume(organizationId, "day", dayStart, bytes);
    if (day.requestCount > this.policy.filesPerDay || day.byteCount > this.policy.bytesPerDay) {
      await this.store.release(organizationId, "day", dayStart, bytes);
      await this.store.release(organizationId, "minute", minuteStart, bytes);
      throw new ApiError(
        "UPLOAD_QUOTA_EXCEEDED",
        "Quota de dépôt de l'organisation atteint.",
        429,
        false,
        {
          limitFilesPerDay: this.policy.filesPerDay,
          limitBytesPerDay: this.policy.bytesPerDay,
        },
      );
    }
  }
}

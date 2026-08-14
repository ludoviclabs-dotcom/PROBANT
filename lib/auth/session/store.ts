import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { ProbantDatabase } from "@/lib/db/client";
import { authSessions, memberships, users } from "@/lib/db/schema";
import { normalizeRoles, type ProbantRole } from "../roles";

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly subject: string;
  readonly organizationId: string;
  readonly roles: readonly ProbantRole[];
  readonly acr: string | null;
  readonly amr: readonly string[];
  readonly mfaSatisfied: boolean;
  readonly idleExpiresAtEpochSeconds: number;
  readonly absoluteExpiresAtEpochSeconds: number;
}

export interface CreateSessionInput {
  readonly tokenSha256: string;
  readonly issuer: string;
  readonly subject: string;
  readonly organizationId: string;
  readonly roles: readonly ProbantRole[];
  readonly acr: string | null;
  readonly amr: readonly string[];
  readonly mfaSatisfied: boolean;
  readonly nowEpochSeconds: number;
  readonly idleTtlSeconds: number;
  readonly absoluteTtlSeconds: number;
}

export interface SessionStore {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  /** Retourne `null` si la session est inconnue, révoquée ou expirée. */
  findByTokenDigest(digest: string, nowEpochSeconds: number): Promise<SessionRecord | null>;
  /** Prolonge la fenêtre d'inactivité sans jamais dépasser le plafond absolu. */
  touch(id: string, idleExpiresAtEpochSeconds: number): Promise<void>;
  revoke(id: string): Promise<void>;
  deleteExpired(nowEpochSeconds: number): Promise<number>;
}

function toSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1_000);
}

export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: ProbantDatabase) {}

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const externalSubject = `${input.issuer}|${input.subject}`;
    const createdAt = new Date(input.nowEpochSeconds * 1_000);
    const idleExpiresAt = new Date((input.nowEpochSeconds + input.idleTtlSeconds) * 1_000);
    const absoluteExpiresAt = new Date(
      (input.nowEpochSeconds + input.absoluteTtlSeconds) * 1_000,
    );

    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ id: randomUUID(), externalSubject, createdAt, updatedAt: createdAt })
        .onConflictDoUpdate({
          target: users.externalSubject,
          set: { updatedAt: createdAt },
        })
        .returning({ id: users.id });

      // Miroir auditable des rôles émis par l'IdP — jamais la source de décision.
      if (input.roles.length > 0) {
        await tx
          .insert(memberships)
          .values(
            input.roles.map((role) => ({
              organizationId: input.organizationId,
              userId: user.id,
              role,
              grantedAt: createdAt,
              lastSeenAt: createdAt,
            })),
          )
          .onConflictDoUpdate({
            target: [memberships.organizationId, memberships.userId, memberships.role],
            set: { lastSeenAt: createdAt },
          });
      }

      const id = randomUUID();
      await tx.insert(authSessions).values({
        id,
        tokenSha256: input.tokenSha256,
        userId: user.id,
        organizationId: input.organizationId,
        subject: input.subject,
        roles: [...input.roles],
        acr: input.acr,
        amr: [...input.amr],
        mfaSatisfied: input.mfaSatisfied,
        createdAt,
        lastSeenAt: createdAt,
        idleExpiresAt,
        absoluteExpiresAt,
      });

      return {
        id,
        userId: user.id,
        subject: input.subject,
        organizationId: input.organizationId,
        roles: input.roles,
        acr: input.acr,
        amr: input.amr,
        mfaSatisfied: input.mfaSatisfied,
        idleExpiresAtEpochSeconds: toSeconds(idleExpiresAt),
        absoluteExpiresAtEpochSeconds: toSeconds(absoluteExpiresAt),
      };
    });
  }

  async findByTokenDigest(
    digest: string,
    nowEpochSeconds: number,
  ): Promise<SessionRecord | null> {
    const now = new Date(nowEpochSeconds * 1_000);
    const rows = await this.db
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.tokenSha256, digest),
          isNull(authSessions.revokedAt),
          sql`${authSessions.idleExpiresAt} > ${now}`,
          sql`${authSessions.absoluteExpiresAt} > ${now}`,
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      subject: row.subject,
      organizationId: row.organizationId,
      roles: normalizeRoles(row.roles),
      acr: row.acr,
      amr: row.amr,
      mfaSatisfied: row.mfaSatisfied,
      idleExpiresAtEpochSeconds: toSeconds(row.idleExpiresAt),
      absoluteExpiresAtEpochSeconds: toSeconds(row.absoluteExpiresAt),
    };
  }

  async touch(id: string, idleExpiresAtEpochSeconds: number): Promise<void> {
    const idleExpiresAt = new Date(idleExpiresAtEpochSeconds * 1_000);
    await this.db
      .update(authSessions)
      .set({ lastSeenAt: new Date(), idleExpiresAt })
      .where(
        and(
          eq(authSessions.id, id),
          // Ne jamais repousser au-delà du plafond absolu.
          sql`${authSessions.absoluteExpiresAt} > ${idleExpiresAt} or ${authSessions.absoluteExpiresAt} > now()`,
        ),
      );
  }

  async revoke(id: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
  }

  async deleteExpired(nowEpochSeconds: number): Promise<number> {
    const now = new Date(nowEpochSeconds * 1_000);
    const deleted = await this.db
      .delete(authSessions)
      .where(or(lt(authSessions.absoluteExpiresAt, now), lt(authSessions.idleExpiresAt, now)))
      .returning({ id: authSessions.id });
    return deleted.length;
  }
}

/** Implémentation mémoire — tests et outillage local uniquement. */
export class InMemorySessionStore implements SessionStore {
  private readonly byDigest = new Map<string, SessionRecord & { revoked: boolean; digest: string }>();

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const record = {
      id: randomUUID(),
      userId: randomUUID(),
      subject: input.subject,
      organizationId: input.organizationId,
      roles: input.roles,
      acr: input.acr,
      amr: input.amr,
      mfaSatisfied: input.mfaSatisfied,
      idleExpiresAtEpochSeconds: input.nowEpochSeconds + input.idleTtlSeconds,
      absoluteExpiresAtEpochSeconds: input.nowEpochSeconds + input.absoluteTtlSeconds,
      revoked: false,
      digest: input.tokenSha256,
    };
    this.byDigest.set(input.tokenSha256, record);
    return record;
  }

  async findByTokenDigest(
    digest: string,
    nowEpochSeconds: number,
  ): Promise<SessionRecord | null> {
    const record = this.byDigest.get(digest);
    if (!record || record.revoked) return null;
    if (
      record.idleExpiresAtEpochSeconds <= nowEpochSeconds ||
      record.absoluteExpiresAtEpochSeconds <= nowEpochSeconds
    ) {
      return null;
    }
    return record;
  }

  async touch(id: string, idleExpiresAtEpochSeconds: number): Promise<void> {
    for (const record of this.byDigest.values()) {
      if (record.id !== id) continue;
      Object.assign(record, {
        idleExpiresAtEpochSeconds: Math.min(
          idleExpiresAtEpochSeconds,
          record.absoluteExpiresAtEpochSeconds,
        ),
      });
    }
  }

  async revoke(id: string): Promise<void> {
    for (const record of this.byDigest.values()) {
      if (record.id === id) record.revoked = true;
    }
  }

  async deleteExpired(nowEpochSeconds: number): Promise<number> {
    let removed = 0;
    for (const [digest, record] of this.byDigest) {
      if (
        record.idleExpiresAtEpochSeconds <= nowEpochSeconds ||
        record.absoluteExpiresAtEpochSeconds <= nowEpochSeconds
      ) {
        this.byDigest.delete(digest);
        removed += 1;
      }
    }
    return removed;
  }
}

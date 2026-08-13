import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";

const contextSchema = z.object({
  sub: z.string().min(1).max(200),
  organizationId: z.string().uuid(),
  dossierIds: z.array(z.string().uuid()).max(100),
  roles: z.array(z.enum(["uploader", "reviewer", "admin"])).min(1).max(8),
  exp: z.number().int().positive(),
});

export type PersistentAuthorizationContext = z.infer<typeof contextSchema>;

export interface PersistentContextResolver {
  resolve(request: Request): Promise<PersistentAuthorizationContext>;
}

const CONTEXT_HEADER = "x-probant-auth-context";
const SIGNATURE_HEADER = "x-probant-auth-signature";

function configuredSecret(): string {
  const secret = process.env.PROBANT_CONTEXT_HMAC_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new ApiError(
      "PERSISTENT_AUTH_NOT_CONFIGURED",
      "Le mode persistant n'est pas disponible sans contexte d'autorisation configuré.",
      503,
      false,
    );
  }
  return secret;
}

function signatureFor(encodedContext: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedContext, "utf8").digest();
}

export class SignedHeaderContextResolver implements PersistentContextResolver {
  async resolve(request: Request): Promise<PersistentAuthorizationContext> {
    const secret = configuredSecret();
    const encoded = request.headers.get(CONTEXT_HEADER)?.trim();
    const signature = request.headers.get(SIGNATURE_HEADER)?.trim();
    if (!encoded || !signature) {
      throw new ApiError(
        "AUTH_CONTEXT_REQUIRED",
        "Un contexte d'autorisation signé est requis.",
        401,
        false,
      );
    }

    let suppliedSignature: Buffer;
    let payload: unknown;
    try {
      suppliedSignature = Buffer.from(signature, "base64url");
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw new ApiError("AUTH_CONTEXT_INVALID", "Contexte d'autorisation invalide.", 401);
    }

    const expected = signatureFor(encoded, secret);
    if (
      suppliedSignature.length !== expected.length ||
      !timingSafeEqual(suppliedSignature, expected)
    ) {
      throw new ApiError("AUTH_CONTEXT_INVALID", "Signature d'autorisation invalide.", 401);
    }

    const parsed = contextSchema.safeParse(payload);
    if (!parsed.success || parsed.data.exp <= Math.floor(Date.now() / 1000)) {
      throw new ApiError("AUTH_CONTEXT_EXPIRED", "Contexte d'autorisation expiré.", 401);
    }
    return parsed.data;
  }
}

export function assertDossierAccess(
  context: PersistentAuthorizationContext,
  dossierId: string,
  requiredRole: PersistentAuthorizationContext["roles"][number],
): void {
  if (!context.roles.includes(requiredRole) && !context.roles.includes("admin")) {
    throw new ApiError("FORBIDDEN", "Autorisation insuffisante.", 403);
  }
  if (!context.dossierIds.includes(dossierId)) {
    throw new ApiError("DOSSIER_FORBIDDEN", "Le dossier n'est pas autorisé.", 403);
  }
}

export function assertDossierAccessForAnyRole(
  context: PersistentAuthorizationContext,
  dossierId: string,
  roles: PersistentAuthorizationContext["roles"],
): void {
  if (!roles.some((role) => context.roles.includes(role)) && !context.roles.includes("admin")) {
    throw new ApiError("FORBIDDEN", "Autorisation insuffisante.", 403);
  }
  if (!context.dossierIds.includes(dossierId)) {
    throw new ApiError("DOSSIER_FORBIDDEN", "Le dossier n'est pas autorisé.", 403);
  }
}

/** Réservé aux tests et aux passerelles d'identité de confiance. */
export function signPersistentContext(
  context: PersistentAuthorizationContext,
  secret: string,
): { context: string; signature: string } {
  const parsed = contextSchema.parse(context);
  const encoded = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
  return {
    context: encoded,
    signature: signatureFor(encoded, secret).toString("base64url"),
  };
}

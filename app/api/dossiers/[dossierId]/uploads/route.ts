import { z } from "zod";
import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { FEC_STREAM_PARSER_VERSION } from "@/lib/fec/stream-parser";
import { createPersistentIngestionRuntime } from "@/lib/ingestion/runtime";

export const runtime = "nodejs";

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  // PR-03 ships the durable FEC consumer. Other document types keep their
  // local/demo readers until a dedicated durable consumer is decided.
  documentType: z.literal("fec"),
  contentType: z.string().min(1).max(200),
  contentLength: z.number().int().positive(),
  checksumSha256Base64: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u).optional(),
  idempotencyKey: z.string().min(8).max(200),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ dossierId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { dossierId } = await context.params;
    const principal = await authorizeRequest(request, {
      permission: "dossier:upload",
      dossierId,
    });
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new ApiError("REQUEST_INVALID", "Paramètres d'upload invalides.", 400);
    const runtime = createPersistentIngestionRuntime();
    const result = await runtime.uploadService.start({
      organizationId: principal.organizationId,
      dossierId,
      ...body.data,
      parserVersion: FEC_STREAM_PARSER_VERSION,
      requestId,
      expiresInSeconds: runtime.uploadTtlSeconds,
    });
    return Response.json(result, {
      status: result.upload ? 201 : 200,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

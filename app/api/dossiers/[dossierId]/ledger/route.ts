import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import {
  assertDossierAccessForAnyRole,
  SignedHeaderContextResolver,
} from "@/lib/auth/persistent-context";
import { createPersistentIngestionRuntime } from "@/lib/ingestion/runtime";
import { decodeLedgerCursor } from "@/lib/ingestion/repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ dossierId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { dossierId } = await context.params;
    const auth = await new SignedHeaderContextResolver().resolve(request);
    assertDossierAccessForAnyRole(auth, dossierId, ["reviewer", "uploader"]);
    const url = new URL(request.url);
    const sourceDocumentId = url.searchParams.get("sourceDocumentId");
    if (!sourceDocumentId || !zUuid(sourceDocumentId)) {
      throw new ApiError("SOURCE_DOCUMENT_REQUIRED", "Document source invalide.", 400);
    }
    const pageSize = Number(url.searchParams.get("pageSize") ?? "100");
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      throw new ApiError("PAGE_SIZE_INVALID", "Taille de page invalide.", 400);
    }
    let afterLine: number;
    try {
      afterLine = decodeLedgerCursor(url.searchParams.get("cursor"));
    } catch {
      throw new ApiError("LEDGER_CURSOR_INVALID", "Curseur invalide.", 400);
    }
    const page = await createPersistentIngestionRuntime().repository.listLedgerPage({
      organizationId: auth.organizationId,
      dossierId,
      sourceDocumentId,
      afterLine,
      pageSize,
    });
    return Response.json(page, {
      headers: { "x-request-id": requestId, "cache-control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

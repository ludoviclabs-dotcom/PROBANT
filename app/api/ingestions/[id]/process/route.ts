import { NextResponse } from "next/server";
import {
  getIngestionJobRepository,
  jsonError,
  processIngestionJob,
} from "@/lib/ingestion";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const repository = getIngestionJobRepository();
  const job = await repository.get(id);
  if (!job) return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
  if (job.status === "quarantined") {
    return jsonError("INGESTION_QUARANTINED", "Le fichier est en quarantaine.", 409, job);
  }
  try {
    const result = await processIngestionJob(job);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    await repository.update(id, {
      status: "failed",
      errorCode: "INGESTION_PROCESSING_FAILED",
      errorMessage: error instanceof Error ? error.message : "Echec du traitement.",
    });
    return jsonError(
      "INGESTION_PROCESSING_FAILED",
      "Le traitement du fichier a echoue.",
      422,
    );
  }
}


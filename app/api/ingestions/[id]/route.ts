import { NextResponse } from "next/server";
import { getIngestionJobRepository, jsonError } from "@/lib/ingestion";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getIngestionJobRepository().get(id);
  if (!job) return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
  return NextResponse.json(
    { job },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}


import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** L'ancien endpoint synchrone est volontairement fermé : aucun corps de fichier. */
export async function POST() {
  return NextResponse.json({
    code: "SYNCHRONOUS_UPLOAD_REMOVED",
    message: "Utilisez l'upload direct vers le stockage objet.",
    requestId: crypto.randomUUID(),
    retryable: false,
  }, { status: 410 });
}

import { NextResponse } from "next/server";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { buildReviewPack } from "@/lib/evidence/export";
import type { DossierSnapshot } from "@/lib/dossier";

export const runtime = "nodejs";

/** Exporte le review pack JSON du dossier de démonstration. */
export async function GET() {
  const pack = buildReviewPack(DEMO_DOSSIER, new Date().toISOString());
  const body = JSON.stringify(pack, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="review-pack-${DEMO_DOSSIER.societe.siren}-${DEMO_DOSSIER.societe.exercice}.json"`,
    },
  });
}

/** Exporte le dossier explicitement fourni par son contexte client. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { snapshot?: DossierSnapshot }
    | null;
  if (!body?.snapshot?.dossier) {
    return NextResponse.json({ error: "Snapshot de dossier invalide." }, { status: 400 });
  }
  const dossier = body.snapshot.dossier;
  const pack = buildReviewPack(dossier, new Date().toISOString());
  return new NextResponse(JSON.stringify(pack, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="review-pack-${dossier.societe.siren}-${dossier.societe.exercice}.json"`,
    },
  });
}

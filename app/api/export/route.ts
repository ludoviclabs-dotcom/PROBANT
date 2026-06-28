import { NextResponse } from "next/server";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { buildReviewPack } from "@/lib/evidence/export";

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

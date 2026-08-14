import { NextResponse } from "next/server";
import type { DossierContext, DossierSnapshot } from "@/lib/dossier";
import { buildEvidenceExportPackage } from "@/lib/evidence/package";
import { buildSynthesisSnapshot } from "@/lib/synthesis";

export const runtime = "nodejs";

/** Aucun GET implicite: il exportait historiquement DEMO quel que soit le dossier actif. */
export async function GET() {
  return NextResponse.json(
    { error: "Un snapshot et son contexte actif explicites sont requis." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { snapshot?: DossierSnapshot; activeContext?: DossierContext }
    | null;
  if (!body?.snapshot?.dossier || !body.activeContext) {
    return NextResponse.json({ error: "Snapshot ou contexte actif invalide." }, { status: 400 });
  }
  try {
    const synthesis = buildSynthesisSnapshot(body.snapshot, {
      clock: () => body.snapshot?.dossier.createdAt ?? new Date(0).toISOString(),
    });
    const pack = await buildEvidenceExportPackage(body.snapshot, synthesis, {
      applicationVersion: process.env.npm_package_version ?? "0.1.0",
      activeContext: body.activeContext,
    });
    const artifact = pack.manifest.artifacts.find((item) => item.format === "canonical_json");
    return new NextResponse(pack.canonicalJson, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${artifact?.fileName ?? "probant-evidence.json"}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export impossible." },
      { status: 409 },
    );
  }
}

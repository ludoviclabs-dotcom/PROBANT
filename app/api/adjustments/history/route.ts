import { NextResponse } from "next/server";
import { listHistory } from "@/lib/server-store/adjustments-store";
import { DEMO_DOSSIER_ID } from "@/lib/server-store/types";

/**
 * Historique des ajustements de jugement — persistance SIMULÉE en mémoire.
 *
 * Voir `lib/server-store/adjustments-store.ts` : aucune vraie base de
 * données, un simple tableau module-level perdu au redémarrage du process
 * Next.js. `force-dynamic` empêche toute mise en cache statique du store.
 */
export const dynamic = "force-dynamic";

/** Liste l'historique des ajustements d'un dossier, filtrable par cycle. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dossierId = searchParams.get("dossierId") ?? DEMO_DOSSIER_ID;
    const cycleSlug = searchParams.get("cycleSlug") ?? undefined;
    return NextResponse.json({ history: listHistory(dossierId, cycleSlug) });
  } catch {
    return NextResponse.json(
      { error: "Impossible de lire l'historique des ajustements." },
      { status: 400 },
    );
  }
}

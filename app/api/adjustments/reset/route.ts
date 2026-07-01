import { NextResponse } from "next/server";
import { deleteAllAdjustments } from "@/lib/server-store/adjustments-store";
import { DEMO_DOSSIER_ID } from "@/lib/server-store/types";

/**
 * Réinitialisation des ajustements de jugement — persistance SIMULÉE en
 * mémoire.
 *
 * Voir `lib/server-store/adjustments-store.ts` : aucune vraie base de
 * données, une simple `Map` module-level perdue au redémarrage du process
 * Next.js. `force-dynamic` empêche toute mise en cache statique du store.
 */
export const dynamic = "force-dynamic";

/** Supprime tous les ajustements d'un dossier (défaut : dossier de démo unique). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dossierId =
      typeof (body as { dossierId?: unknown })?.dossierId === "string" &&
      (body as { dossierId: string }).dossierId.length > 0
        ? (body as { dossierId: string }).dossierId
        : DEMO_DOSSIER_ID;

    const deletedCount = deleteAllAdjustments(dossierId);
    return NextResponse.json({ deletedCount });
  } catch {
    return NextResponse.json(
      { error: "Impossible de réinitialiser les ajustements." },
      { status: 400 },
    );
  }
}

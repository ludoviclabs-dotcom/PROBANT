import { NextResponse } from "next/server";
import { deleteAdjustment } from "@/lib/server-store/adjustments-store";

/**
 * Suppression d'un ajustement de jugement — persistance SIMULÉE en mémoire.
 *
 * Voir `lib/server-store/adjustments-store.ts` : aucune vraie base de
 * données, une simple `Map` module-level perdue au redémarrage du process
 * Next.js. `force-dynamic` empêche toute mise en cache statique du store.
 */
export const dynamic = "force-dynamic";

/** Supprime l'ajustement identifié par `id`. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant d'ajustement manquant." },
        { status: 400 },
      );
    }

    const deleted = deleteAdjustment(id);
    if (!deleted) {
      return NextResponse.json(
        { error: `Aucun ajustement trouvé pour l'id « ${id} ».` },
        { status: 404 },
      );
    }

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json(
      { error: "Impossible de supprimer l'ajustement." },
      { status: 400 },
    );
  }
}

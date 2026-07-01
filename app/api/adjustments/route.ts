import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertAdjustment, listAdjustments } from "@/lib/server-store/adjustments-store";
import { DEMO_DOSSIER_ID } from "@/lib/server-store/types";

/**
 * Route CRUD des ajustements de jugement — persistance SIMULÉE en mémoire.
 *
 * Aucune vraie base de données derrière : les opérations passent par
 * `lib/server-store/adjustments-store.ts` (une simple `Map` module-level),
 * perdues au redémarrage du process Next.js. Voir ce fichier pour le détail
 * de la simulation. `force-dynamic` empêche Next.js de mettre en cache une
 * réponse statique pour un store qui change à chaque requête.
 */
export const dynamic = "force-dynamic";

const UpsertAdjustmentSchema = z.object({
  dossierId: z.string().min(1).optional(),
  cycleSlug: z.string().min(1, "cycleSlug est requis"),
  axe: z.enum(["probabilite", "detectabilite"], {
    errorMap: () => ({ message: "axe doit valoir « probabilite » ou « detectabilite »" }),
  }),
  valeurAjustee: z.number({ invalid_type_error: "valeurAjustee doit être un nombre" }),
  commentaire: z.string().optional(),
});

/** Liste les ajustements courants d'un dossier (défaut : dossier de démo unique). */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dossierId = searchParams.get("dossierId") ?? DEMO_DOSSIER_ID;
    return NextResponse.json({ adjustments: listAdjustments(dossierId) });
  } catch {
    return NextResponse.json(
      { error: "Impossible de lire les ajustements." },
      { status: 400 },
    );
  }
}

/** Crée ou met à jour un ajustement de jugement (cycle + axe). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 },
    );
  }

  const parsed = UpsertAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  }

  try {
    const { dossierId, cycleSlug, axe, valeurAjustee, commentaire } = parsed.data;
    const record = upsertAdjustment({
      dossierId: dossierId ?? DEMO_DOSSIER_ID,
      cycleSlug,
      axe,
      valeurAjustee,
      commentaire,
    });
    return NextResponse.json(record, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Impossible d'enregistrer l'ajustement." },
      { status: 400 },
    );
  }
}

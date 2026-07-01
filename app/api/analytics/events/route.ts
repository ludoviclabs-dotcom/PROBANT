import { NextResponse } from "next/server";
import { recordEvent, listEvents } from "@/lib/server-store/analytics-store";
import { DEMO_DOSSIER_ID } from "@/lib/server-store/types";

/**
 * Route de tracking analytics SIMULÉ.
 *
 * Ne transmet aucune donnée à un provider tiers réel (pas de Vercel
 * Analytics/PostHog installé) : journalise uniquement en mémoire serveur via
 * `lib/server-store/analytics-store.ts` (voir ce fichier — non durable,
 * perdu au redémarrage du process Next.js). Sert à valider le câblage des
 * événements produit avant un vrai choix d'outil.
 */
export const dynamic = "force-dynamic";

/**
 * Enregistre un événement analytics simulé.
 *
 * Le tracking ne doit JAMAIS faire échouer la requête appelante : toute
 * erreur interne (payload invalide, exception du store) est absorbée et la
 * route répond tout de même 200, pour ne jamais casser l'UX autour d'un
 * simple souci de journalisation.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name : "unknown_event";
    const dossierId =
      typeof body?.dossierId === "string" && body.dossierId.length > 0
        ? body.dossierId
        : DEMO_DOSSIER_ID;
    const payload =
      body?.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : undefined;

    const event = recordEvent(name, dossierId, payload);

    return NextResponse.json({ event });
  } catch {
    // Le tracking ne doit jamais casser l'UX : on répond 200 même en cas de
    // souci interne mineur (le "faux" succès est intentionnel ici).
    return NextResponse.json({ ok: false });
  }
}

/**
 * Liste les événements journalisés — utile pour un debug manuel uniquement,
 * cette route n'est pas exposée dans l'UI publique de PROBANT.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dossierId = searchParams.get("dossierId") ?? undefined;
    return NextResponse.json({ events: listEvents(dossierId) });
  } catch {
    return NextResponse.json({ events: [] });
  }
}

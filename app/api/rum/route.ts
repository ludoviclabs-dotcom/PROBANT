import { requestIdFrom } from "@/lib/api/errors";
import { log } from "@/lib/observability/logger";
import { rate, vitalBatchSchema } from "@/lib/performance/web-vitals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Réception des mesures RUM.
 *
 * Route volontairement non authentifiée : les Core Web Vitals de la page
 * d'accueil doivent être mesurables avant toute connexion. Elle n'accepte
 * qu'un contrat fermé — nom de métrique, valeur bornée, page appartenant à une
 * liste finie — donc rien d'identifiant ne peut y transiter.
 *
 * Elle n'écrit pas en base : les mesures partent dans le flux de logs
 * structurés, où le collecteur agrège les percentiles.
 */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const parsed = vitalBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 204 même en cas de rejet : la télémétrie ne doit jamais faire réessayer
    // le navigateur ni révéler la forme attendue.
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  for (const sample of parsed.data.samples) {
    log("info", "web_vital", {
      requestId,
      metricName: sample.name.toLowerCase(),
      metricValue: sample.value,
      route: `/${sample.page}`,
      outcome: rate(sample.name, sample.value) === "poor" ? "rejected" : "success",
    });
  }

  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

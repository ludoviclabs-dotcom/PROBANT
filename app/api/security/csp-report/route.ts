import { z } from "zod";
import { requestIdFrom } from "@/lib/api/errors";
import { logSecurityEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Réception des violations CSP.
 *
 * Le rapport est **résumé, jamais recopié** : `blocked-uri` et
 * `script-sample` peuvent contenir des fragments de page, donc potentiellement
 * des libellés comptables. Seuls la directive violée et l'origine du blocage
 * sont conservées, ce qui suffit à décider de la bascule en enforcement.
 */
const reportSchema = z.object({
  "csp-report": z
    .object({
      "effective-directive": z.string().max(120).optional(),
      "violated-directive": z.string().max(120).optional(),
      "blocked-uri": z.string().max(2_048).optional(),
      disposition: z.string().max(40).optional(),
    })
    .optional(),
});

/** Ne conserve que le schéma+hôte d'une URI bloquée, ou un mot-clé CSP. */
function summarizeBlockedUri(value: string | undefined): string {
  if (!value) return "unknown";
  if (["inline", "eval", "self", "data", "blob"].includes(value)) return value;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "opaque";
  }
}

const DIRECTIVE_PATTERN = /^[a-z-]{1,40}/u;

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  const report = parsed.success ? parsed.data["csp-report"] : undefined;
  const directive =
    (report?.["effective-directive"] ?? report?.["violated-directive"] ?? "").match(
      DIRECTIVE_PATTERN,
    )?.[0] ?? "unknown";

  logSecurityEvent({
    event: "csp_violation",
    requestId,
    outcome: report?.disposition === "enforce" ? "rejected" : "denied",
    errorCode: directive.toUpperCase().replace(/-/gu, "_").slice(0, 64) || "UNKNOWN",
    route: `/${summarizeBlockedUri(report?.["blocked-uri"]).replace(/[^A-Za-z0-9\-._~/]/gu, "")}`.slice(0, 128),
  });

  // 204 : le navigateur n'attend aucun corps et ne doit pas réessayer.
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

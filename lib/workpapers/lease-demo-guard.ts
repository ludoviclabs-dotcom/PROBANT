/** Scénario synthétique de l'atelier : ouvert seulement sur l'origine de démonstration déclarée, jamais en production (C02-D04). */
export function assertLeaseDemoAllowed(request: Request) {
  const origin = process.env.PROBANT_DEMONSTRATION_ORIGIN, url = new URL(request.url);
  if (process.env.VERCEL_ENV === "production" || process.env.PROBANT_DEMONSTRATION_ENABLED !== "true" || !origin || new URL(origin).host !== request.headers.get("host") || new URL(origin).protocol !== url.protocol)
    throw new Error("DEMONSTRATION_DISABLED");
}

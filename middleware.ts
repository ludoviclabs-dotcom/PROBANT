import { NextResponse, type NextRequest } from "next/server";
import { buildSecurityHeaders, generateNonce, readCspMode } from "@/lib/security/headers";

/**
 * Middleware — **en-têtes uniquement**.
 *
 * Il ne prend aucune décision d'autorisation : chaque route appelle
 * `authorizeRequest`. Un middleware oublié ou contourné (rewrite, route
 * ajoutée, appel interne) ne doit jamais ouvrir un accès (ADR-007 § 4).
 */
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  // Exposé aux Server Components pour noncer les scripts inline légitimes.
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const headers = buildSecurityHeaders({
    nonce,
    mode: readCspMode(),
    development: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
  });
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    /**
     * Toutes les routes sauf les assets immuables et les fichiers statiques :
     * ceux-ci sont servis par le CDN et n'ont pas besoin de CSP par requête.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};

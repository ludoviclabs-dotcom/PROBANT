import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  generateNonce,
  readCspMode,
} from "@/lib/security/headers";

/**
 * Middleware — **en-têtes uniquement**.
 *
 * Il ne prend aucune décision d'autorisation : chaque route appelle
 * `authorizeRequest`. Un middleware oublié ou contourné (rewrite, route
 * ajoutée, appel interne) ne doit jamais ouvrir un accès (ADR-007 § 4).
 */
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const mode = readCspMode();
  const development = process.env.NODE_ENV === "development";
  const policy = buildContentSecurityPolicy({ nonce, mode, development });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  /**
   * Next.js lit la politique sur la **requête** pour en extraire le nonce et
   * l'appliquer à ses propres scripts d'amorçage et d'hydratation. Sans cet
   * en-tête, ces scripts ne sont pas noncés : en `enforce`, `strict-dynamic`
   * bloque l'hydratation de toutes les pages ; en `report-only`, ils
   * produisent un flot de violations légitimes qui rendrait illisibles les
   * rapports servant justement à décider de la bascule.
   *
   * Le nom `content-security-policy` est celui attendu côté requête, quel que
   * soit le mode ; seule la **réponse** distingue enforcement et report-only.
   */
  requestHeaders.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const headers = buildSecurityHeaders({
    nonce,
    mode,
    development,
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

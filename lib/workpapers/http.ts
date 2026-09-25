import { scopeSchema } from "./model";
import type { WorkpaperService } from "./service";

/** Adapter for trusted server injection only; no client principal/role is read. */
export function workpaperReadHandler(service: WorkpaperService) {
  return async (request: Request): Promise<Response> => {
    try {
      const params = new URL(request.url).searchParams;
      const scope = scopeSchema.parse({ organizationId: params.get("organizationId"), dossierId: params.get("dossierId"), periodId: params.get("periodId"), mode: params.get("mode") });
      const id = params.get("id");
      if (params.get("operation") === "projection") return Response.json(await service.projection(scope), { headers: { "Cache-Control": "no-store" } });
      if (!id) return Response.json({ error: "ID_REQUIRED" }, { status: 400 });
      if (params.get("operation") === "download") {
        const bytes = await service.download(scope, id);
        return bytes ? new Response(Uint8Array.from(bytes).buffer, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }) : Response.json({ error: "SOURCE_UNAVAILABLE" }, { status: 404 });
      }
      const run = await service.get(scope, id);
      return Response.json(run ?? { error: "WORKPAPER_NOT_FOUND" }, { status: run ? 200 : 404, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const forbidden = error instanceof Error && /FORBIDDEN|SCOPE_MISMATCH|DISABLED/.test(error.message);
      return Response.json({ error: forbidden ? "WORKPAPER_FORBIDDEN" : "WORKPAPER_REQUEST_INVALID" }, { status: forbidden ? 403 : 400, headers: { "Cache-Control": "no-store" } });
    }
  };
}
export function disabledWorkpaperEndpoint() {
  return Response.json({ error: "WORKPAPERS_DISABLED", reason: "Authentification serveur et persistance transactionnelle non configurées." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

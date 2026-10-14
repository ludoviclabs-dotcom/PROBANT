import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { durableChainEnabled } from "@/lib/runtime/profile";
import type { EquityRuntime as CapitauxRuntime } from "./capitaux-runtime";
import type { EquityRuntime as LegacyEquityRuntime } from "./equity-runtime";
import { buildParcours, journeyRuns, type JourneyAvailability, type JourneyReadResponse, type JourneyRun, type ParcoursProcedure } from "./capitaux-parcours";

/**
 * Server read of the single Capitaux propres journey (C09). Each procedure is read by its own runtime, with its own
 * activation flag, session, permissions, transaction and exact version: the unified view never bypasses a sheet’s
 * access rules and never writes. An authentication or authorization refusal of either runtime refuses the whole read.
 */
const id = z.string().min(1).max(200), version = z.coerce.number().int().min(1).max(100000);
const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), capitauxId: id.optional(), capitauxVersion: version.optional(), equityId: id.optional(), equityVersion: version.optional() }).strict()
  .refine(q => (q.capitauxVersion === undefined || !!q.capitauxId) && (q.equityVersion === undefined || !!q.equityId), "Version sans feuille");
const headers = { "Cache-Control": "private, no-store" };
const AUTH = /SESSION_INVALID|AUTHENTICATION_REQUIRED|FORBIDDEN|UNAUTHORIZED/;

export interface ParcoursRuntimes {
  capitaux: () => Pick<CapitauxRuntime, "read">;
  equity: () => Pick<LegacyEquityRuntime, "equityRead">;
  env?: Record<string, string | undefined>;
}
async function journey(procedure: ParcoursProcedure, enabled: boolean, read: () => Promise<JourneyReadResponse>, exact: boolean): Promise<{ availability: JourneyAvailability; code?: string; runs: JourneyRun[] }> {
  if (!enabled) return { availability: "disabled", code: procedure === "capitaux_propres.review" ? "EQ_DURABLE_DISABLED" : "EQUITY_DURABLE_DISABLED", runs: [] };
  try { return { availability: "ready", runs: journeyRuns(procedure, await read(), exact) }; }
  catch (error) {
    const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message : "";
    if (AUTH.test(code)) throw error;
    // A sheet that does not exist yet is not an outage: the journey is simply empty.
    if (/WORKPAPER_NOT_FOUND|WORKPAPER_VERSION_NOT_FOUND/.test(code)) return { availability: "ready", code, runs: [] };
    return { availability: "unavailable", code: /^[A-Z][A-Z0-9_]*$/.test(code) ? code : "DURABLE_UNAVAILABLE", runs: [] };
  }
}
export async function readParcours(request: Request, runtimes: ParcoursRuntimes) {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new Error("PARCOURS_QUERY_INVALID");
  const q = query.parse(Object.fromEntries(params)), env = runtimes.env ?? process.env;
  const [capitaux, equity] = await Promise.all([
    journey("capitaux_propres.review", durableChainEnabled(env, "PROBANT_CAPITAUX_DURABLE"), () => runtimes.capitaux().read(request, q.dossierId, q.periodId, q.capitauxId, false, q.capitauxVersion) as Promise<JourneyReadResponse>, q.capitauxVersion !== undefined),
    journey("equity.review", durableChainEnabled(env, "PROBANT_EQUITY_DURABLE"), () => runtimes.equity().equityRead(request, q.dossierId, q.periodId, q.equityId, false, q.equityVersion) as Promise<JourneyReadResponse>, q.equityVersion !== undefined),
  ]);
  return buildParcours({ scope: { dossierId: q.dossierId, periodId: q.periodId }, journeys: { "capitaux_propres.review": capitaux, "equity.review": equity } });
}
export function parcoursHandler(runtimes: ParcoursRuntimes) {
  return async (request: Request) => {
    try { return Response.json(await readParcours(request, runtimes), { headers }); }
    catch (error) {
      if (error instanceof z.ZodError) return Response.json({ error: "PARCOURS_QUERY_INVALID" }, { status: 400, headers });
      const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message : "";
      const status = /SESSION_INVALID|AUTHENTICATION_REQUIRED|UNAUTHORIZED/.test(code) ? 401 : /FORBIDDEN/.test(code) ? 403 : /QUERY_INVALID/.test(code) ? 400 : 503;
      return Response.json({ error: status === 503 ? "PARCOURS_UNAVAILABLE" : code }, { status, headers });
    }
  };
}

import "server-only";
import { getDatabase } from "@/lib/db/client";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { FiscalRuntime } from "./fiscal-runtime";
import { fiscalHandlers, requireDisposableFiscal } from "./fiscal-http";
import { PostgresFiscalDatabase } from "./fiscal-store";
export const fiscalServer = fiscalHandlers(() => new FiscalRuntime(new PostgresFiscalDatabase(getDatabase()), getRequestAuthorizer()));
/**
 * C05 / C10 : base IS de l'incidence fiscale pour un export du même dossier et du même exercice. Feuilles fiscales non
 * activées, droits insuffisants ou erreur de lecture : null, et l'incidence reste inconnue hors taux qualifié.
 */
export async function citIncidenceBaseFor(request: Request, dossierId: string, periodId: string) {
  try {
    requireDisposableFiscal();
    return await new FiscalRuntime(new PostgresFiscalDatabase(getDatabase()), getRequestAuthorizer()).citIncidenceBase(request, dossierId, periodId);
  } catch {
    return null;
  }
}

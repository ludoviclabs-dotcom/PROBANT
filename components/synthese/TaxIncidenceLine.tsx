import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import type { TaxIncidenceState } from "@/lib/dossier/tax-incidence-client";
import type { TaxIncidenceInterface } from "@/lib/synthesis/types";
import s from "./synthese.module.css";

/**
 * Source de l'incidence fiscale des ajustements (C05 / C10) : scénario d'IS de la feuille IS verrouillée, ou motif pour
 * lequel elle reste inconnue. Les montants viennent du SynthesisSnapshot ; cette ligne n'en calcule aucun.
 */
export function TaxIncidenceLine({ state, incidence }: { state: TaxIncidenceState; incidence: TaxIncidenceInterface }) {
  const available = state.status === "available";
  const sheet = state.status === "available" || state.status === "unavailable" ? state.sheet : null;
  const computed = incidence.computedFindingIds.length;
  const message =
    state.status === "loading"
      ? "Lecture de la feuille IS de l'exercice…"
      : state.status === "available"
        ? `Scénario d'IS avant/après sur la feuille IS verrouillée (v${state.sheet.version}, moteur ${state.sheet.engineVersion ?? "—"}) : ${computed} ajustement(s) du résultat qualifié(s) déductible(s) chiffré(s)${incidence.pendingFindingIds.length ? ` ; ${incidence.pendingFindingIds.length} restent sans incidence établie` : ""}. Aucun taux saisi n'est appliqué à leur place.`
        : state.reason;
  return (
    <section aria-label="Incidence fiscale des ajustements" aria-busy={state.status === "loading"} data-incidence={state.status} className={s.taxNote}>
      <p className={s.taxKey}>Incidence fiscale des ajustements · {available ? "scénario d'IS" : state.status === "loading" ? "lecture" : "inconnue hors taux qualifié"}</p>
      <p className={s.taxText}>
        {message}
        {sheet && (
          <>
            {" "}
            <Link href={sheet.href} className={s.linkButton}>
              Ouvrir la feuille IS (v{sheet.version})
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

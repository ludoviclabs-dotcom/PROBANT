"use client";

/**
 * Source de l'incidence fiscale des ajustements (C05 / C10) : scénario d'IS de la feuille IS verrouillée, ou motif
 * pour lequel elle reste inconnue. Les montants viennent du SynthesisSnapshot ; ce composant n'en calcule aucun.
 */

import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import type { TaxIncidenceState } from "@/lib/dossier/tax-incidence-client";
import type { TaxIncidenceInterface } from "@/lib/synthesis/types";
import { FONT, T, TONE_PREFIX } from "./tokens";

export function TaxIncidenceNotice({ state, incidence }: { state: TaxIncidenceState; incidence: TaxIncidenceInterface }) {
  const available = state.status === "available";
  const sheet = state.status === "available" || state.status === "unavailable" ? state.sheet : null;
  const computed = incidence.computedFindingIds.length;
  const message = state.status === "loading"
    ? "Lecture de la feuille IS de l'exercice…"
    : available
      ? `Scénario d'IS avant/après sur la feuille IS verrouillée (v${state.sheet.version}, moteur ${state.sheet.engineVersion ?? "—"}) : ${computed} ajustement(s) du résultat qualifié(s) déductible(s) chiffré(s)${incidence.pendingFindingIds.length ? ` ; ${incidence.pendingFindingIds.length} restent sans incidence établie` : ""}. Aucun taux saisi n'est appliqué à leur place.`
      : state.reason;
  return (
    <section
      aria-label="Incidence fiscale des ajustements"
      aria-busy={state.status === "loading"}
      data-incidence={state.status}
      style={{ border: `1px solid ${T.border}`, borderLeft: `3px solid ${available ? T.accent : T.borderStrong}`, background: T.surface2, borderRadius: 12, padding: "11px 16px", marginBottom: 22 }}
    >
      <p style={{ margin: 0, fontSize: FONT.meta, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: available ? T.accent : T.faint }}>
        {available ? TONE_PREFIX.neutral : TONE_PREFIX.warning} Incidence fiscale des ajustements · {available ? "scénario d'IS" : state.status === "loading" ? "lecture" : "inconnue hors taux qualifié"}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: FONT.body - 1, lineHeight: 1.5, color: T.muted }}>
        {message}
        {sheet && (
          <>
            {" "}
            <Link href={sheet.href} className="pbz-focusable" style={{ color: T.accent, textDecoration: "underline" }}>
              Ouvrir la feuille IS (v{sheet.version})
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

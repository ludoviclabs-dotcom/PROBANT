import type { EvolutionTiming, IntegrationStatus, LinkOutcome, VerificationState } from "@/lib/audit-cycles/veille";
import { INTEGRATION_LABEL, LINK_OUTCOME_LABEL, TIMING_LABEL, VERIFICATION_LABEL } from "@/lib/audit-cycles/veille";
import n from "./normatif.module.css";

/**
 * Glyphes de la veille, dessinés (forme + libellé, jamais la teinte seule) :
 *  - carré plein de signal   : évolution EN VIGUEUR non intégrée — le contenu affiché est en retard ;
 *  - carré contour           : évolution À VENIR non intégrée ;
 *  - losange contour         : évolution sans date d'effet (adresse, absence du registre) ;
 *  - cercle plein d'encre    : intégrée / vérifiée / joignable ;
 *  - cercle contour          : projet à surveiller, jamais vérifiée, ou lien non contrôlable par un robot ;
 *  - croix                   : lien introuvable ou injoignable.
 */
type Glyph = "sq-fill" | "sq-line" | "lozenge" | "dot" | "ring" | "cross" | "arrow";

export function VeilleGlyph({ glyph, size = 10 }: { glyph: Glyph; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 10 10", "aria-hidden": true as const, focusable: false as const, style: { flexShrink: 0 } };
  switch (glyph) {
    case "sq-fill":
      return (
        <svg {...common}>
          <path d="M1.5 1.5h7v7h-7z" style={{ fill: "var(--pb-signal)" }} />
        </svg>
      );
    case "sq-line":
      return (
        <svg {...common}>
          <path d="M1.5 1.5h7v7h-7z" strokeWidth={1.4} style={{ fill: "none", stroke: "var(--pb-signal)" }} />
        </svg>
      );
    case "lozenge":
      return (
        <svg {...common}>
          <path d="M5 1.2 8.8 5 5 8.8 1.2 5z" strokeWidth={1.4} style={{ fill: "none", stroke: "var(--pb-ink-2)" }} />
        </svg>
      );
    case "dot":
      return (
        <svg {...common}>
          <circle cx={5} cy={5} r={3.4} style={{ fill: "var(--pb-ink)" }} />
        </svg>
      );
    case "ring":
      return (
        <svg {...common}>
          <circle cx={5} cy={5} r={3.3} strokeWidth={1.3} style={{ fill: "none", stroke: "var(--pb-ink-3)" }} />
        </svg>
      );
    case "cross":
      return (
        <svg {...common}>
          <path d="M2 2l6 6M8 2 2 8" strokeWidth={1.6} style={{ stroke: "var(--pb-signal)" }} />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M1.5 5h6M5.2 2.5 7.8 5 5.2 7.5" strokeWidth={1.4} style={{ fill: "none", stroke: "var(--pb-ink-2)" }} />
        </svg>
      );
  }
}

export function timingGlyph(timing: EvolutionTiming, integration: IntegrationStatus): Glyph {
  if (integration === "integre") return "dot";
  if (integration === "a_surveiller") return "ring";
  if (timing === "en_vigueur") return "sq-fill";
  if (timing === "a_venir") return "sq-line";
  return "lozenge";
}

export function EvolutionMark({ timing, integration, label = true }: { timing: EvolutionTiming; integration: IntegrationStatus; label?: boolean }) {
  return (
    <span className={n.statusMark}>
      <VeilleGlyph glyph={timingGlyph(timing, integration)} />
      {label
        ? integration === "integre" || integration === "a_surveiller"
          ? INTEGRATION_LABEL[integration]
          : `${TIMING_LABEL[timing]} · ${INTEGRATION_LABEL[integration].toLowerCase()}`
        : null}
    </span>
  );
}

export function linkGlyph(state: LinkOutcome | "sans_url" | "non_releve"): Glyph {
  switch (state) {
    case "ok":
      return "dot";
    case "redirige":
      return "arrow";
    case "introuvable":
    case "injoignable":
    case "sans_url":
      return "cross";
    default:
      return "ring";
  }
}

export function LinkMark({ state }: { state: LinkOutcome | "sans_url" | "non_releve" }) {
  return (
    <span className={n.statusMark}>
      <VeilleGlyph glyph={linkGlyph(state)} />
      {LINK_OUTCOME_LABEL[state]}
    </span>
  );
}

export function VerificationMark({ state, date }: { state: VerificationState; date: string | null }) {
  return (
    <span className={n.statusMark}>
      <VeilleGlyph glyph={state === "verifiee" ? "dot" : state === "a_reverifier" ? "lozenge" : "ring"} />
      {VERIFICATION_LABEL[state]}
      {date ? ` le ${formatDate(date)}` : ""}
    </span>
  );
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 9 novembre 2026 » depuis une date AAAA-MM-JJ, sans fuseau horaire (même rendu serveur et navigateur). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`;
}

/** « 09/11/2026 ». */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

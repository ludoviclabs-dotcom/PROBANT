import p from "@/components/charte/page.module.css";
import type { TaxCockpitSummary } from "@/lib/tax/cockpit";
import { OutcomeMark, outcomeOfLabel } from "./OutcomeMark";
import x from "./fiscalite.module.css";

/**
 * « La chaîne de preuve » en strates fixes, lues de la déclaration vers la source : déclarations, liasse, FEC.
 * Remplace la scène 3D (plaques et particules) : aucun décor, des filets et des mots. La strate du haut porte le
 * statut d'attention du dossier en glyphe + mot, comme la plaque colorée le faisait auparavant.
 */
const STRATA = [
  { level: 3, name: "Déclarations", detail: "2065, CA3, avis de CFE" },
  { level: 2, name: "Liasse fiscale 2050-2059", detail: "dont 2058-A" },
  { level: 1, name: "FEC & grand-livre", detail: null },
] as const;

export function TaxProofStrata({ summary }: { summary: TaxCockpitSummary }) {
  return (
    <figure className={x.strata} aria-labelledby="tax-proof-chain-title">
      <figcaption id="tax-proof-chain-title" className={`${p.eyebrow} ${x.strataCaption}`}>
        La chaîne de preuve
      </figcaption>
      <ol className={x.strataList}>
        {STRATA.map((stratum, index) => (
          <li key={stratum.level} data-base={stratum.level === 1 ? "" : undefined}>
            <span className={x.strataLevel} aria-hidden="true">
              {stratum.level}
            </span>
            <span className={x.strataBody}>
              <span className="sr-only">Strate {stratum.level} : </span>
              {stratum.name}
              {stratum.detail && <span className={x.strataDetail}>{stratum.detail}</span>}
              {index === 0 && (
                <span className={x.strataStatus} title={summary.headlineDetail}>
                  <span className="sr-only">Statut d&apos;attention du dossier : </span>
                  <OutcomeMark outcome={outcomeOfLabel(summary.headlineLabel)} label={summary.headlineLabel} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

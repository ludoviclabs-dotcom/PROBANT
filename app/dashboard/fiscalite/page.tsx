/**
 * /dashboard/fiscalite — cockpit fiscalité (TAX-08).
 *
 * Server component : le dossier fiscal de démonstration exécute réellement les
 * moteurs TAX-05/06/07 et le planner TAX-04 côté serveur, puis les datasets
 * sont pré-construits pour chaque périmètre d'impôt. Le client ne fait que
 * sélectionner un paquet et rendre — aucun calcul métier dans React.
 *
 * Filtres portés par l'URL : `?impot=corporate_income_tax|vat|cfe` et
 * `?statut=<outcome>` (Next 15 : `searchParams` asynchrone).
 */
import { TaxCockpitWorkspace } from "@/components/tax-cockpit/TaxCockpitWorkspace";
import {
  buildTaxCockpitDatasets,
  TAX_COCKPIT_SCOPES,
  type TaxCockpitDatasets,
  type TaxCockpitScope,
} from "@/lib/tax/cockpit";
import { getDemoTaxCockpitSource } from "@/lib/tax/demo";

export const metadata = {
  title: "Fiscalité — contrôles & réconciliations · PROBANT",
};

function parseScope(value: string | undefined): TaxCockpitScope {
  return (TAX_COCKPIT_SCOPES as readonly string[]).includes(value ?? "")
    ? (value as TaxCockpitScope)
    : "all";
}

export default async function FiscalitePage({
  searchParams,
}: {
  searchParams: Promise<{ impot?: string; statut?: string }>;
}) {
  const params = await searchParams;
  const source = getDemoTaxCockpitSource();
  const bundles = Object.fromEntries(
    TAX_COCKPIT_SCOPES.map((scope) => [scope, buildTaxCockpitDatasets(source, scope)]),
  ) as Record<TaxCockpitScope, TaxCockpitDatasets>;

  return (
    <TaxCockpitWorkspace
      bundles={bundles}
      initialScope={parseScope(params.impot)}
      initialOutcome={params.statut ?? "tous"}
    />
  );
}

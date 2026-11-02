import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { OnboardingCta } from "@/components/probant/OnboardingCta";
/**
 * /dashboard/fiscalite — cockpit fiscalité (TAX-08), charte « instruments ».
 *
 * Server component : le dossier fiscal de démonstration exécute réellement les
 * moteurs TAX-05/06/07 et le planner TAX-04 côté serveur, puis les datasets
 * sont pré-construits pour chaque périmètre d'impôt. Le client ne fait que
 * sélectionner un paquet et rendre — aucun calcul métier dans React.
 *
 * Filtres portés par l'URL : `?impot=corporate_income_tax|vat|cfe` et
 * `?statut=<outcome>` (Next 15 : `searchParams` asynchrone).
 */
import { InstrumentPage, PageIntro } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import { TaxCockpitWorkspace } from "@/components/tax-cockpit/TaxCockpitWorkspace";
import x from "@/components/tax-cockpit/fiscalite.module.css";
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
    <InstrumentPage>
      <PageIntro
        index="05"
        title="Fiscalité"
        lead="Contrôles et réconciliations IS, TVA, CFE."
        aside={<OnboardingCta className={`${p.btnSecondary} ${x.introCta}`} />}
      />
      {/* Le cockpit reste une surface de démonstration ; les feuilles TVA d'un dossier réel vivent dans les procédures de mission (Mission 13). */}
      <nav aria-label="Feuilles de travail fiscales" className={x.synthetic}>
        <span className={p.key}>Dossier synthétique</span>
        <span className={p.soft}>
          Cockpit de démonstration : il lit un jeu fiscal synthétique (exercice {source.fiscalYear}), distinct du dossier
          affiché dans le ruban.
        </span>
        <span className={x.syntheticLinks}>
          Dossier réel en recette :{" "}
          <DossierContextAnchor href="/fiscal">feuilles de travail TVA par période</DossierContextAnchor> ·{" "}
          <DossierContextAnchor href="/fiscal/synthese">Synthèse fiscale</DossierContextAnchor>
        </span>
      </nav>
      <TaxCockpitWorkspace
        bundles={bundles}
        initialScope={parseScope(params.impot)}
        initialOutcome={params.statut ?? "tous"}
        evidenceSource={source}
      />
    </InstrumentPage>
  );
}

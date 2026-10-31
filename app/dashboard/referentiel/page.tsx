import { SEUILS_INTERNES, SOURCES } from "@/lib/referentiel/sources";
import { REFERENTIEL_VERSION, decrireReferentiel } from "@/lib/referentiel/edition";
import { ReferentielWorkspace, type SeuilParam } from "@/components/referentiel/ReferentielWorkspace";

/** Valeur d'un seuil interne en notation française (virgule décimale), unité insécable. */
const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const value = (n: number, unit: string) => `${fr.format(n)} ${unit}`;

export default function ReferentielPage() {
  const sources = Object.values(SOURCES);
  // Rôles repris des commentaires de `SEUILS_INTERNES` : des choix PROBANT, rattachés à aucune norme.
  const seuils: SeuilParam[] = [
    {
      label: "Matérialité (% bilan)",
      value: value(SEUILS_INTERNES.materialitePctBilan, "%"),
      detail: "Matérialité par défaut, en % du total bilan.",
    },
    {
      label: "Matérialité (% CA)",
      value: value(SEUILS_INTERNES.materialitePctCA, "%"),
      detail: "Matérialité par défaut, en % du chiffre d’affaires.",
    },
    {
      label: "Variation CA atypique",
      value: value(SEUILS_INTERNES.variationCaAtypiquePct, "%"),
      detail: "Variation du chiffre d’affaires jugée atypique d’un exercice à l’autre.",
    },
    {
      label: "Écart taux amort.",
      value: value(SEUILS_INTERNES.ecartTauxAmortPts, "pts"),
      detail: "Écart de taux d’amortissement jugé significatif, en points.",
    },
    {
      label: "Fenêtre écriture tardive",
      value: value(SEUILS_INTERNES.fenetreEcritureTardiveJours, "j"),
      detail: "Nombre de jours avant la clôture où une écriture manuelle devient « tardive ».",
    },
    {
      label: "Seuil faisceau",
      value: value(SEUILS_INTERNES.faisceauSeuilSignaux, "signaux"),
      detail: "Nombre de signaux concordants pour élever la gravité.",
    },
  ];

  const edition = decrireReferentiel(REFERENTIEL_VERSION);

  return <ReferentielWorkspace sources={sources} seuils={seuils} version={edition.libelle} versionDetail={edition.detail} />;
}

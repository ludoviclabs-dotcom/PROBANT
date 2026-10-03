import { REFERENTIEL_VERSION, SEUILS_INTERNES, SOURCES } from "@/lib/referentiel/sources";
import { ReferentielWorkspace } from "@/components/referentiel/ReferentielWorkspace";

export default function ReferentielPage() {
  const sources = Object.values(SOURCES);
  const seuils = [
    { label: "Matérialité (% bilan)", value: `${SEUILS_INTERNES.materialitePctBilan} %` },
    { label: "Matérialité (% CA)", value: `${SEUILS_INTERNES.materialitePctCA} %` },
    { label: "Variation CA atypique", value: `${SEUILS_INTERNES.variationCaAtypiquePct} %` },
    { label: "Écart taux amort.", value: `${SEUILS_INTERNES.ecartTauxAmortPts} pts` },
    { label: "Fenêtre écriture tardive", value: `${SEUILS_INTERNES.fenetreEcritureTardiveJours} j` },
    { label: "Seuil faisceau", value: `${SEUILS_INTERNES.faisceauSeuilSignaux} signaux` },
  ];

  return <ReferentielWorkspace sources={sources} seuils={seuils} version={REFERENTIEL_VERSION} />;
}

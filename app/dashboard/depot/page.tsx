import { InstrumentPage, PageIntro } from "@/components/charte/InstrumentPage";
import { DepotView } from "@/components/probant/DepotView";

export default function DepotPage() {
  return (
    <InstrumentPage>
      <PageIntro
        index="01"
        title="Dépôt & ingestion"
        lead="Le FEC passe par le moteur d’ingestion d’un dossier persistant autorisé ; balance, liasse et documents de cycle sont lus dans ce navigateur. Chaque résultat reste à qualifier et à revoir."
      />
      <DepotView />
    </InstrumentPage>
  );
}

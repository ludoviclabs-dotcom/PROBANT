import { PageHeader } from "@/components/probant/PageHeader";
import { DepotView } from "@/components/probant/DepotView";

export default function DepotPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Dépôt & ingestion"
        subtitle="Dans un dossier persistant autorisé, le FEC est transmis au stockage et traité par le moteur d’ingestion. Les autres formats et les dépôts par cycle sont lus dans le navigateur ; leurs résultats doivent être qualifiés et revus."
      />
      <DepotView />
    </div>
  );
}

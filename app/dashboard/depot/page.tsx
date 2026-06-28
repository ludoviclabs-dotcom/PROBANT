import { PageHeader } from "@/components/probant/PageHeader";
import { DepotView } from "@/components/probant/DepotView";

export default function DepotPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Dépôt & ingestion"
        subtitle="Déposez un FEC : empreinte, parsing, validation réglementaire (LPF art. A.47 A-1) et exécution du moteur s'enchaînent. Les anomalies bloquantes d'admissibilité sont traitées avant toute analyse financière."
      />
      <DepotView />
    </div>
  );
}

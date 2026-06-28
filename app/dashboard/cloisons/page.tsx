import { PageHeader } from "@/components/probant/PageHeader";
import { CloisonsView } from "@/components/probant/CloisonsView";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";

export default function CloisonsPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Revue par cloison"
        subtitle="Chaque catégorie comptable est isolée en silo : l'élément financier reconstruit, l'anomalie entourée et reliée par une flèche au constat, avec montant, seuil, source officielle et explication."
      />
      <CloisonsView silos={DEMO_DOSSIER.silos} />
    </div>
  );
}

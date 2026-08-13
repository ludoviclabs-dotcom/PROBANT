import { PageHeader } from "@/components/probant/PageHeader";
import { ActiveCloisons } from "@/components/probant/ActiveCloisons";
import { CloisonsViewLive } from "@/components/probant/CloisonsViewLive";

export default async function CloisonsPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; mode?: string }>;
}) {
  const params = await searchParams;
  if (params.mode === "live") {
    return (
      <div className="p-6">
        <PageHeader
          title="Revue par cloison"
          subtitle="Constats issus de l'analyse de votre FEC — groupés par cloison comptable. Les états reconstruits ne sont pas disponibles en mode FEC direct."
        />
        <CloisonsViewLive />
      </div>
    );
  }
  return <ActiveCloisons />;
}

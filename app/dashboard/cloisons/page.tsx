import { InstrumentPage, PageIntro } from "@/components/charte/InstrumentPage";
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
      <InstrumentPage>
        <PageIntro
          index="04"
          title="Revue par cloison"
          eyebrowNote="FEC direct"
          lead="Constats issus de l'analyse de votre FEC — groupés par cloison comptable. Les états reconstruits ne sont pas disponibles en mode FEC direct."
        />
        <CloisonsViewLive />
      </InstrumentPage>
    );
  }
  return <ActiveCloisons />;
}

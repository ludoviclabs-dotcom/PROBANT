import { charteFonts } from "./fonts";
import { loadAllCycles } from "@/lib/audit-cycles/loader";
import { decrireReferentiel, REFERENTIEL_VERSION } from "@/lib/referentiel/edition";
import { SYNTHESIS_ENGINE_VERSION } from "@/lib/synthesis/versions";
import { CloisonReplay } from "@/components/landing/CloisonReplay";
import { EvidenceChain } from "@/components/landing/EvidenceChain";
import { Hero } from "@/components/landing/Hero";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LayerFrieze } from "@/components/landing/LayerFrieze";
import { NormativeIndex } from "@/components/landing/NormativeIndex";
import { buildNormativeIndex } from "@/components/landing/normative-index";
import s from "@/components/landing/landing.module.css";

/**
 * Landing — refonte « Le grand livre rendu vivant » (ambiance papier de la charte).
 * Le contenu chiffré (versions, nombre de cycles, index normatif) vient du code et des fichiers du dépôt,
 * pas d'un texte figé : le moteur, l'édition du référentiel et les cycles d'audit sont lus à la génération.
 */
export default async function Home() {
  const cycles = await loadAllCycles();
  const families = buildNormativeIndex(cycles);

  return (
    <div data-ambiance="papier" data-document-surface className={`${charteFonts} ${s.root}`}>
      <LandingHeader />
      <Hero />
      <LayerFrieze />
      <CloisonReplay />
      <EvidenceChain />
      <NormativeIndex families={families} total={cycles.length} />
      <LandingFooter
        engineVersion={SYNTHESIS_ENGINE_VERSION}
        referentiel={decrireReferentiel(REFERENTIEL_VERSION).libelle}
        cycles={cycles.length}
      />
    </div>
  );
}

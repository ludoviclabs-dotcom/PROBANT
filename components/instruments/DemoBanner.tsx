import { OnboardingCta } from "@/components/probant/OnboardingCta";
import s from "./shell.module.css";

/**
 * Bandeau « Mode démo » : visible en haut de chaque écran tant que le dossier est la démonstration. Il dit
 * l'essentiel (société fictive, données non opposables) et garde l'entrée vers l'import d'un vrai FEC.
 */
export function DemoBanner({ societe }: { societe: string }) {
  return (
    <div role="note" data-ambiance="instruments" className={s.banner}>
      <span className={s.bannerStrong}>Mode démo</span>
      <span>Société fictive {societe} · données non opposables</span>
      <OnboardingCta className={s.bannerLink} />
    </div>
  );
}

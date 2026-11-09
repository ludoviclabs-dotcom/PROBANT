import p from "@/components/charte/page.module.css";

/**
 * Frontière de chargement du segment `cycles`.
 *
 * `/normatif/cycles` est rendue à la demande (elle lit `searchParams`). Sans cette frontière, le préchargement
 * automatique d'un lien ne contient que la mise en page partagée ; au clic, le routeur récupère la page en différé
 * et l'applique dans une transition suspendue, qui ne se terminait pas (navigation figée depuis les onglets,
 * l'accueil ou le fil d'Ariane). Avec elle, la navigation s'affiche aussitôt et le contenu remplace ce message
 * dès qu'il arrive.
 */
export default function CyclesLoading() {
  return (
    <div className={p.intro}>
      <p role="status" className={p.lead}>
        Chargement des cycles d&apos;audit…
      </p>
    </div>
  );
}

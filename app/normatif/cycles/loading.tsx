/**
 * Frontière de chargement du segment `cycles`.
 *
 * `/normatif/cycles` est rendue à la demande (elle lit `searchParams`). Sans
 * cette frontière, le préchargement automatique d'un lien ne contient que la
 * mise en page partagée ; au clic, le routeur récupère la page en différé et
 * l'applique dans une transition suspendue, qui ne se terminait pas
 * (navigation figée depuis la barre latérale, l'accueil ou le fil d'Ariane).
 * Avec elle, la navigation s'affiche aussitôt et le contenu remplace ce
 * message dès qu'il arrive.
 */
export default function CyclesLoading() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <p role="status" className="text-[13px] text-[var(--pb-text-muted)]">
        Chargement des cycles d'audit…
      </p>
    </div>
  );
}

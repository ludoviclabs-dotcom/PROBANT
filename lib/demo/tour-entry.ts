/**
 * Entrée de la « Visite guidée » — module léger, sans le jeu de données démo : le bouton de lancement (landing,
 * rail du tableau de bord) l'importe sans tirer le script complet ni le moteur de mise en scène.
 *
 * Les constantes ci-dessous sont des MIROIRS du script (`lib/demo/tour.ts`) et du dossier démo ; chacune est
 * verrouillée par `lib/demo/__tests__/tour.test.ts`, qui échoue si le script ou le dossier évoluent sans elles.
 */

/** Route de la première étape (ouverture). */
export const TOUR_ENTRY_ROUTE = "/dashboard/depot";

/**
 * Identité du dossier démo sur laquelle la visite se joue toujours : la narration cite les chiffres de DEMO SA,
 * elle ne doit jamais se superposer à un autre dossier ouvert dans la session.
 */
export const TOUR_DOSSIER_PARAMS = { dossier: "demo-sa-2024", organization: "demo" } as const;

/** Nombre de fiches cycles de la base normative (`lib/audit-cycles/data`), verrouillé par le test du chargeur. */
export const TOUR_CYCLE_COUNT = 35;

/** Durée annoncée sur les boutons de lancement (arrondi de l'estimation du script). */
export const TOUR_DURATION_LABEL = "2 min";

/** Lien d'une étape de la visite, toujours sur le dossier démo. */
export function tourHref(route: string, step: number): string {
  const q = new URLSearchParams({ guide: "1", etape: String(step), ...TOUR_DOSSIER_PARAMS });
  return `${route}?${q}`;
}

/** Lien de sortie de la visite : même écran, même dossier démo, sans paramètres de visite. */
export function tourExitHref(route: string): string {
  return `${route}?${new URLSearchParams(TOUR_DOSSIER_PARAMS)}`;
}

"use client";

import { useEffect } from "react";

/**
 * Branchement `@axe-core/react` en développement uniquement (Bloc 6.1).
 *
 * Audite en continu l'accessibilité du DOM monté (contraste, aria-*,
 * sémantique...) et journalise les violations dans la console navigateur.
 * Ne doit JAMAIS s'exécuter en production : le check `NODE_ENV` est fait
 * AVANT même l'import dynamique, pour que webpack/Next élague l'appel et que
 * le bundle de prod ne charge ni React DOM en double, ni `@axe-core/react`
 * (devDependency, absente en install prod). L'import dynamique (`await
 * import(...)`) garantit en plus qu'aucune référence statique à ce module
 * ne se retrouve dans le graphe de modules du bundle client de production.
 *
 * Composant purement diagnostique : aucun rendu, aucun effet sur l'UI ou les
 * données. Monté une seule fois dans `app/layout.tsx`, à côté de `GuidedTour`.
 */
export function AxeCoreDevTools() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let cancelled = false;

    (async () => {
      try {
        const [React, ReactDOM, axeModule] = await Promise.all([
          import("react"),
          import("react-dom"),
          import("@axe-core/react"),
        ]);
        if (cancelled) return;
        const axe = axeModule.default;
        axe(React, ReactDOM, 1000);
      } catch {
        // Environnement sans @axe-core/react disponible (ex: install prod
        // partielle) : diagnostic best-effort, ne doit jamais faire planter
        // l'application.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Configuration ESLint « flat » (ESLint 9) pour PROBANT.
 *
 * Remplace le script `next lint`, déprécié en Next.js 15.5 et supprimé en
 * Next.js 16. On reste sur la MÊME version majeure de Next (15.5.x) : seul
 * l'outillage de lint change, aucune migration de framework n'est engagée.
 *
 * `FlatCompat` est nécessaire parce que `eslint-config-next` est encore publié
 * au format eslintrc ; c'est le pont officiellement utilisé par
 * `create-next-app` sur la branche 15.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    // Artefacts de build et dépendances : jamais lintés.
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      /**
       * PROBANT est une application entièrement rédigée en français : les
       * apostrophes typographiques et droites sont omniprésentes dans le texte
       * JSX (« l'auditeur », « d'audit », « n'est pas »). La règle produit
       * 50 erreurs sur du texte parfaitement valide et son application
       * imposerait de réécrire du contenu affiché à l'utilisateur — donc de
       * modifier la restitution, ce que PR-00 s'interdit.
       *
       * Décision consignée : docs/architecture/DECISION_LOG.md § D-004.
       * À réexaminer en PR-06 (revue UX/accessibilité), qui peut décider d'un
       * passage systématique aux apostrophes typographiques « ’ ».
       */
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;

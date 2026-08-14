import { defineConfig } from "vitest/config";
import path from "node:path";

// Résout l'alias "@/" vers la racine du projet (cf. tsconfig paths) pour Vitest.
export default defineConfig({
  // JSX runtime automatique pour les tests de composants (.tsx).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "lib/**/__tests__/**/*.test.ts",
      // Tests de composants (jsdom activé fichier par fichier via
      // le pragma « @vitest-environment jsdom »).
      "components/**/__tests__/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

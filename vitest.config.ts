import { defineConfig } from "vitest/config";
import path from "node:path";

// Résout l'alias "@/" vers la racine du projet (cf. tsconfig paths) pour Vitest.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

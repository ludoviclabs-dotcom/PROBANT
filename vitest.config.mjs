import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // React 19 automatic JSX runtime for component tests.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "lib/**/__tests__/**/*.test.ts",
      "components/**/*.test.tsx",
      "components/**/__tests__/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
      "server-only": path.resolve(dirname, "node_modules/server-only/empty.js"),
    },
  },
});


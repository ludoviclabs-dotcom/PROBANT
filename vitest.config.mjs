import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // React 19 automatic JSX runtime for component tests.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    // Bound worker pressure for PDF and jsdom tests on local and CI hosts.
    pool: "threads",
    maxWorkers: 2,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "lib/**/*.test.ts",
            "lib/**/__tests__/**/*.test.ts",
            "components/**/*.test.tsx",
            "components/**/__tests__/**/*.test.tsx",
          ],
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
        },
      },
      {
        // Disposable PostgreSQL recipes share one database, and the Clients
        // recipe restarts its container: they run after the unit tests, one
        // file at a time, so a restart never cuts another recipe's connection.
        extends: true,
        test: {
          name: "durable",
          include: ["lib/**/*.integration.test.ts"],
          fileParallelism: false,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
      "server-only": path.resolve(dirname, "node_modules/server-only/empty.js"),
    },
  },
});


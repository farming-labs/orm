import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@farming-labs/orm": path.resolve(dirname, "../orm/src/index.ts"),
      "@farming-labs/orm-runtime/setup": path.resolve(dirname, "../runtime/src/setup.ts"),
      "@farming-labs/orm-runtime": path.resolve(dirname, "../runtime/src/index.ts"),
      "@farming-labs/orm-firestore": path.resolve(dirname, "./src/index.ts"),
    },
  },
  test: {
    include: ["test/local.integration.ts"],
  },
});

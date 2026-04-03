import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@farming-labs/orm": path.resolve(dirname, "../orm/src/index.ts"),
      "@farming-labs/orm-d1": path.resolve(dirname, "../d1/src/index.ts"),
      "@farming-labs/orm-neo4j": path.resolve(dirname, "../neo4j/src/index.ts"),
    },
  },
});

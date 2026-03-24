import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@farming-labs/orm": path.resolve(dirname, "../orm/src/index.ts"),
    },
  },
  test: {
    include: ["test/local.integration.ts"],
  },
});

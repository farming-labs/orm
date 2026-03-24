import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@farming-labs/orm": path.resolve(__dirname, "../orm/src/index.ts"),
    },
  },
});

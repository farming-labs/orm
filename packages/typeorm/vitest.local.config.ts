import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@farming-labs/orm": path.resolve(dirname, "../orm/src/index.ts"),
      "@farming-labs/orm-dynamodb": path.resolve(dirname, "../dynamodb/src/index.ts"),
      "@farming-labs/orm-drizzle": path.resolve(dirname, "../drizzle/src/index.ts"),
      "@farming-labs/orm-firestore": path.resolve(dirname, "../firestore/src/index.ts"),
      "@farming-labs/orm-kysely": path.resolve(dirname, "../kysely/src/index.ts"),
      "@farming-labs/orm-mongo": path.resolve(dirname, "../mongo/src/index.ts"),
      "@farming-labs/orm-mongoose": path.resolve(dirname, "../mongoose/src/index.ts"),
      "@farming-labs/orm-prisma": path.resolve(dirname, "../prisma/src/index.ts"),
      "@farming-labs/orm-runtime/setup": path.resolve(dirname, "../runtime/src/setup.ts"),
      "@farming-labs/orm-runtime": path.resolve(dirname, "../runtime/src/index.ts"),
      "@farming-labs/orm-sequelize": path.resolve(dirname, "../sequelize/src/index.ts"),
      "@farming-labs/orm-sql": path.resolve(dirname, "../sql/src/index.ts"),
      "@farming-labs/orm-typeorm": path.resolve(dirname, "./src/index.ts"),
    },
  },
  test: {
    include: ["test/local.integration.ts"],
  },
});

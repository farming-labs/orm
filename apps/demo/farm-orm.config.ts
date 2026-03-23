import { defineConfig } from "@farming-labs/orm-cli";
import { authSchema } from "./src/schema";

export default defineConfig({
  schemas: [authSchema],
  targets: {
    prisma: {
      out: "./generated/prisma/schema.prisma",
      provider: "postgresql",
      mode: "replace",
    },
    drizzle: {
      out: "./generated/drizzle/schema.ts",
      dialect: "pg",
    },
    sql: {
      out: "./generated/sql/0001_init.sql",
      dialect: "postgres",
    },
  },
});

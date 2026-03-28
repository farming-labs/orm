import { defineConfig } from "bumpp";

export default defineConfig({
  commit: "chore: release v%s",
  tag: "v%s",
  push: false,
  files: [
    "package.json",
    "packages/orm/package.json",
    "packages/cli/package.json",
    "packages/sql/package.json",
    "packages/drizzle/package.json",
    "packages/kysely/package.json",
    "packages/mongo/package.json",
    "packages/mongoose/package.json",
    "packages/prisma/package.json",
    "packages/runtime/package.json",
  ],
});

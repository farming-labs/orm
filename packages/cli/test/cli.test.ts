import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkTarget, generateTarget } from "../src";

const workspaces: string[] = [];
const dirname = path.dirname(fileURLToPath(import.meta.url));
const ormSourcePath = path.resolve(dirname, "../../orm/src/index.ts");
const cliSourcePath = path.resolve(dirname, "../src/index.ts");

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await import("node:fs/promises").then(({ rm }) =>
      rm(workspace, { recursive: true, force: true }),
    );
  }
});

async function createFixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "farm-orm-"));
  workspaces.push(workspace);

  const schemaPath = path.join(workspace, "schema.ts");
  await writeFile(
    schemaPath,
    `import { defineSchema, model, id, string } from ${JSON.stringify(ormSourcePath)};

export const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
    },
  }),
});
`,
    "utf8",
  );

  const configPath = path.join(workspace, "farm-orm.config.ts");
  await writeFile(
    configPath,
    `import { defineConfig } from ${JSON.stringify(cliSourcePath)};
import { schema } from "./schema";

export default defineConfig({
  schemas: [schema],
  targets: {
    prisma: { out: "./generated/prisma/schema.prisma", provider: "postgresql", mode: "replace" },
    drizzle: { out: "./generated/drizzle/schema.ts", dialect: "pg" },
    sql: { out: "./generated/sql/0001_init.sql", dialect: "postgres" },
  },
});
`,
    "utf8",
  );

  return { workspace, configPath };
}

describe("@farming-labs/orm-cli", () => {
  it("generates Prisma, Drizzle, and SQL files from config", async () => {
    const { workspace, configPath } = await createFixture();
    const cwd = process.cwd();
    process.chdir(workspace);

    try {
      const prismaPath = await generateTarget("prisma", configPath);
      const drizzlePath = await generateTarget("drizzle", configPath);
      const sqlPath = await generateTarget("sql", configPath);

      expect(existsSync(prismaPath)).toBe(true);
      expect(existsSync(drizzlePath)).toBe(true);
      expect(existsSync(sqlPath)).toBe(true);

      expect(await readFile(prismaPath, "utf8")).toContain("model User");
      expect(await readFile(drizzlePath, "utf8")).toContain("pgTable");
      expect(await readFile(sqlPath, "utf8")).toContain("create table if not exists users");
    } finally {
      process.chdir(cwd);
    }
  });

  it("checks generated output freshness", async () => {
    const { workspace, configPath } = await createFixture();
    const cwd = process.cwd();
    process.chdir(workspace);

    try {
      await generateTarget("prisma", configPath);
      const fresh = await checkTarget("prisma", configPath);
      expect(fresh.matches).toBe(true);

      const outputPath = path.join(workspace, "generated/prisma/schema.prisma");
      await writeFile(outputPath, "stale", "utf8");

      const stale = await checkTarget("prisma", configPath);
      expect(stale.matches).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });
});

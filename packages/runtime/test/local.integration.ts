import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createManifest, defineSchema, id, model, renderSafeSql, string } from "@farming-labs/orm";
import { createDriverFromRuntime, createOrmFromRuntime } from "../src";

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
    },
  }),
});

describe("runtime helper local integration", () => {
  it("creates a SQL driver and ORM from a real SQLite database", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-runtime-"));
    const databasePath = path.join(directory, "runtime.sqlite");
    const database = new DatabaseSync(databasePath);

    try {
      database.exec(renderSafeSql(schema, { dialect: "sqlite" }));

      const driver = createDriverFromRuntime({
        schema,
        client: database,
      });
      const orm = createOrmFromRuntime({
        schema,
        client: database,
      });

      const created = await orm.user.create({
        data: {
          email: "ada@farminglabs.dev",
          name: "Ada",
        },
        select: {
          id: true,
          email: true,
        },
      });

      const loaded = await orm.user.findUnique({
        where: {
          email: "ada@farminglabs.dev",
        },
        select: {
          email: true,
          name: true,
        },
      });

      expect(driver.handle.kind).toBe("sql");
      expect(driver.handle.dialect).toBe("sqlite");
      expect(createManifest(schema).models.user.table).toBe("users");
      expect(created).toEqual({
        id: expect.any(String),
        email: "ada@farminglabs.dev",
      });
      expect(loaded).toEqual({
        email: "ada@farminglabs.dev",
        name: "Ada",
      });
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

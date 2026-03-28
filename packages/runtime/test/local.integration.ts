import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createManifest,
  defineSchema,
  id,
  isOrmError,
  model,
  renderSafeSql,
  string,
} from "@farming-labs/orm";
import { createDriverFromRuntime, createOrmFromRuntime } from "../src";
import { applySchema, bootstrapDatabase, pushSchema } from "../src/setup";

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
  it("keeps setup helpers on the dedicated setup subpath", async () => {
    const core = await import("../src");
    const setup = await import("../src/setup");

    expect("applySchema" in core).toBe(false);
    expect("pushSchema" in core).toBe(false);
    expect("bootstrapDatabase" in core).toBe(false);
    expect(typeof setup.applySchema).toBe("function");
    expect(typeof setup.pushSchema).toBe("function");
    expect(typeof setup.bootstrapDatabase).toBe("function");
  });

  it("creates a SQL driver and ORM from a real SQLite database", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-runtime-"));
    const databasePath = path.join(directory, "runtime.sqlite");
    const database = new DatabaseSync(databasePath);

    try {
      database.exec(renderSafeSql(schema, { dialect: "sqlite" }));

      const driver = await createDriverFromRuntime({
        schema,
        client: database,
      });
      const orm = await createOrmFromRuntime({
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

  it("pushes, applies, and bootstraps schema against a real SQLite database", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-runtime-bootstrap-"));
    const databasePath = path.join(directory, "bootstrap.sqlite");
    const database = new DatabaseSync(databasePath);

    try {
      await pushSchema({
        schema,
        client: database,
      });
      await applySchema({
        schema,
        client: database,
      });

      const tables = database
        .prepare("select name from sqlite_master where type = 'table' and name = ?")
        .all("users") as Array<{ name: string }>;
      expect(tables).toEqual([{ name: "users" }]);

      const orm = await bootstrapDatabase({
        schema,
        client: database,
      });

      const created = await orm.user.create({
        data: {
          email: "bootstrap@farminglabs.dev",
          name: "Bootstrap",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "bootstrap@farminglabs.dev",
      });
      expect(renderSafeSql(schema, { dialect: "sqlite" })).toContain(
        'create table if not exists "users"',
      );
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("normalizes missing-table errors when the runtime client is used before schema setup", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-runtime-missing-table-"));
    const databasePath = path.join(directory, "missing.sqlite");
    const database = new DatabaseSync(databasePath);

    try {
      const orm = await createOrmFromRuntime({
        schema,
        client: database,
      });

      const error = await orm.user.count().catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("MISSING_TABLE");
      expect(error.backendKind).toBe("sql");
      expect(error.dialect).toBe("sqlite");
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

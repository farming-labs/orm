import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createManifest,
  defineSchema,
  id,
  inspectDatabaseRuntime,
  isOrmError,
  tableName,
  model,
  renderSafeSql,
  string,
} from "@farming-labs/orm";
import { createDriverFromRuntime, createOrmFromRuntime } from "../src";
import { applySchema, bootstrapDatabase, pushSchema } from "../src/setup";
import { startLocalDynamoDb } from "../../dynamodb/test/support/local-dynamodb";
import { InMemoryFirestore } from "../../firestore/test/support/firestore-harness";
import { startLocalUnstorage } from "../../unstorage/test/support/local-unstorage";

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

const numericSchema = defineSchema({
  auditEvent: model({
    table: tableName("audit_events"),
    fields: {
      id: id({ type: "integer" }),
      email: string().unique(),
    },
  }),
});

const generatedNumericSchema = defineSchema({
  auditEvent: model({
    table: "audit_events",
    fields: {
      id: id({ type: "integer", generated: "increment" }),
      email: string().unique(),
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
      await pushSchema({
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

  it("creates and bootstraps a Firestore runtime from a raw server-side client", async () => {
    const db = new InMemoryFirestore();

    await pushSchema({
      schema,
      client: db,
    });
    await applySchema({
      schema,
      client: db,
    });

    const driver = await createDriverFromRuntime({
      schema,
      client: db,
    });
    const orm = await bootstrapDatabase({
      schema,
      client: db,
    });

    const created = await orm.user.create({
      data: {
        email: "firestore@farminglabs.dev",
        name: "Firestore",
      },
      select: {
        id: true,
        email: true,
      },
    });

    expect(driver.handle.kind).toBe("firestore");
    expect(created).toEqual({
      id: expect.any(String),
      email: "firestore@farminglabs.dev",
    });
  });

  it("creates and bootstraps a DynamoDB runtime from a raw client", async () => {
    const local = await startLocalDynamoDb();

    try {
      await pushSchema({
        schema,
        client: local.client,
      });
      await applySchema({
        schema,
        client: local.client,
      });

      const driver = await createDriverFromRuntime({
        schema,
        client: local.client,
      });
      const orm = await bootstrapDatabase({
        schema,
        client: local.client,
      });

      const created = await orm.user.create({
        data: {
          email: "dynamodb@farminglabs.dev",
          name: "DynamoDB",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(driver.handle.kind).toBe("dynamodb");
      expect(created).toEqual({
        id: expect.any(String),
        email: "dynamodb@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("creates and bootstraps an Unstorage runtime from a raw storage client", async () => {
    const local = await startLocalUnstorage("memory");

    try {
      await pushSchema({
        schema,
        client: local.storage,
      });
      await applySchema({
        schema,
        client: local.storage,
      });

      const driver = await createDriverFromRuntime({
        schema,
        client: local.storage,
      });
      const orm = await bootstrapDatabase({
        schema,
        client: local.storage,
      });

      const created = await orm.user.create({
        data: {
          email: "unstorage@farminglabs.dev",
          name: "Unstorage",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(driver.handle.kind).toBe("unstorage");
      expect(created).toEqual({
        id: expect.any(String),
        email: "unstorage@farminglabs.dev",
      });
      expect(inspectDatabaseRuntime(local.storage).runtime?.kind).toBe("unstorage");
    } finally {
      await local.close();
    }
  });

  it("supports manual numeric ids against a real SQLite database", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-runtime-numeric-"));
    const databasePath = path.join(directory, "numeric.sqlite");
    const database = new DatabaseSync(databasePath);

    try {
      await pushSchema({
        schema: numericSchema,
        client: database,
      });

      const orm = await createOrmFromRuntime({
        schema: numericSchema,
        client: database,
      });

      const created = await orm.auditEvent.create({
        data: {
          id: 101,
          email: "numeric@farminglabs.dev",
        },
      });

      const loaded = await orm.auditEvent.findUnique({
        where: {
          id: 101,
        },
      });

      expect(created).toEqual({
        id: 101,
        email: "numeric@farminglabs.dev",
      });
      expect(loaded).toEqual({
        id: 101,
        email: "numeric@farminglabs.dev",
      });
      expect(createManifest(numericSchema).models.auditEvent.fields.id.idType).toBe("integer");
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("supports generated numeric ids against a real SQLite database", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-runtime-generated-numeric-"));
    const databasePath = path.join(directory, "generated-numeric.sqlite");
    const database = new DatabaseSync(databasePath);

    try {
      const orm = await bootstrapDatabase({
        schema: generatedNumericSchema,
        client: database,
      });

      const first = await orm.auditEvent.create({
        data: {
          email: "first@farminglabs.dev",
        },
      });
      const second = await orm.auditEvent.create({
        data: {
          email: "second@farminglabs.dev",
        },
      });

      expect(first).toEqual({
        id: 1,
        email: "first@farminglabs.dev",
      });
      expect(second).toEqual({
        id: 2,
        email: "second@farminglabs.dev",
      });
      expect(createManifest(generatedNumericSchema).models.auditEvent.fields.id.generated).toBe(
        "increment",
      );
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("explains runtime detection failures with a structured report", () => {
    const report = inspectDatabaseRuntime({
      execute: () => undefined,
    });

    expect(report.runtime).toBe(null);
    expect(report.summary).toContain("Could not detect");
    expect(report.hint).toContain("supported raw client");
  });
});

import { describe, expect, it } from "vitest";
import { createOrm, datetime, defineSchema, id, model, string } from "@farming-labs/orm";
import type { SqliteDatabaseLike, SqliteStatementLike } from "../src";
import { createSqliteDriver } from "../src";

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
      createdAt: datetime().defaultNow(),
    },
  }),
});

type RecordedCall = {
  sql: string;
  params: unknown[];
  kind: "all" | "run";
};

class RecordingSqliteStatement implements SqliteStatementLike {
  constructor(
    private readonly database: RecordingSqliteDatabase,
    private readonly sql: string,
  ) {}

  all(...params: unknown[]) {
    this.database.calls.push({
      sql: this.sql,
      params,
      kind: "all",
    });
    return this.database.selectResponses.shift() ?? [];
  }

  run(...params: unknown[]) {
    this.database.calls.push({
      sql: this.sql,
      params,
      kind: "run",
    });
    return this.database.runResponses.shift() ?? { changes: 1 };
  }
}

class RecordingSqliteDatabase implements SqliteDatabaseLike {
  readonly calls: RecordedCall[] = [];
  readonly execCalls: string[] = [];
  readonly selectResponses: unknown[][] = [];
  readonly runResponses: Array<{ changes?: number | bigint }> = [];

  prepare(sql: string) {
    return new RecordingSqliteStatement(this, sql);
  }

  exec(sql: string) {
    this.execCalls.push(sql);
  }
}

describe("sqlite SQL runtime", () => {
  it("exposes the underlying sqlite database on orm.$driver", async () => {
    const database = new RecordingSqliteDatabase();
    const orm = createOrm({
      schema,
      driver: createSqliteDriver(database),
    });

    expect(orm.$driver.kind).toBe("sql");
    expect(orm.$driver.dialect).toBe("sqlite");
    expect(orm.$driver.client).toBe(database);

    await orm.transaction(async (tx) => {
      expect(tx.$driver.kind).toBe("sql");
      expect(tx.$driver.dialect).toBe("sqlite");
      expect(tx.$driver.client).toBe(database);
    });
  });

  it("uses sqlite placeholders, quoting, and transaction hooks", async () => {
    const database = new RecordingSqliteDatabase();
    const orm = createOrm({
      schema,
      driver: createSqliteDriver(database),
    });

    database.selectResponses.push([
      {
        id: "user_1",
        email: "ada@farminglabs.dev",
        name: "Ada",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);

    database.runResponses.push({ changes: 1 });
    database.selectResponses.push([
      {
        id: "user_2",
        email: "grace@farminglabs.dev",
        name: "Grace",
        createdAt: "2025-01-02T00:00:00.000Z",
      },
    ]);

    database.selectResponses.push([{ count: 2 }]);
    database.selectResponses.push([
      {
        id: "user_1",
        email: "ada@farminglabs.dev",
        name: "Ada",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);

    const found = await orm.user.findOne({
      where: {
        email: "ada@farminglabs.dev",
      },
      select: {
        id: true,
        email: true,
      },
    });

    const created = await orm.user.create({
      data: {
        email: "grace@farminglabs.dev",
        name: "Grace",
      },
      select: {
        id: true,
        email: true,
      },
    });

    const counted = await orm.user.count({
      where: {
        email: {
          contains: "@farminglabs.dev",
        },
      },
    });

    const batch = await orm.batch([
      (tx) =>
        tx.user.findUnique({
          where: {
            email: "ada@farminglabs.dev",
          },
          select: {
            id: true,
          },
        }),
    ] as const);

    expect(found).toEqual({
      id: "user_1",
      email: "ada@farminglabs.dev",
    });
    expect(created).toEqual({
      id: "user_2",
      email: "grace@farminglabs.dev",
    });
    expect(counted).toBe(2);
    expect(batch).toEqual([{ id: "user_1" }]);

    expect(database.calls[0]?.sql).toContain('from "users"');
    expect(database.calls[0]?.sql).toContain('"users"."email" = ?');
    expect(database.calls[0]?.kind).toBe("all");
    expect(database.calls[1]?.sql).toContain('insert into "users"');
    expect(database.calls[1]?.sql).toContain("values (?, ?, ?, ?)");
    expect(database.calls[1]?.kind).toBe("run");
    expect(database.calls[3]?.sql).toContain('select count(*) as "count" from "users"');
    expect(database.execCalls).toEqual(["begin", "commit"]);
  });

  it("rolls back sqlite transactions on failure", async () => {
    const database = new RecordingSqliteDatabase();
    const orm = createOrm({
      schema,
      driver: createSqliteDriver(database),
    });

    database.runResponses.push({ changes: 1 });

    await expect(
      orm.transaction(async (tx) => {
        await tx.user.create({
          data: {
            email: "rollback@farminglabs.dev",
            name: "Rollback",
          },
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(database.execCalls).toEqual(["begin", "rollback"]);
  });

  it("uses a native sqlite upsert statement before reading the result", async () => {
    const database = new RecordingSqliteDatabase();
    const orm = createOrm({
      schema,
      driver: createSqliteDriver(database),
    });

    database.runResponses.push({ changes: 1 });
    database.selectResponses.push([
      {
        id: "user_1",
        email: "ada@farminglabs.dev",
        name: "Ada Lovelace",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);

    const user = await orm.user.upsert({
      where: {
        email: "ada@farminglabs.dev",
      },
      create: {
        email: "ada@farminglabs.dev",
        name: "Ada",
      },
      update: {
        name: "Ada Lovelace",
      },
      select: {
        id: true,
        name: true,
      },
    });

    expect(user).toEqual({
      id: "user_1",
      name: "Ada Lovelace",
    });
    expect(database.calls).toHaveLength(2);
    expect(database.calls[0]?.kind).toBe("run");
    expect(database.calls[0]?.sql).toContain('insert into "users"');
    expect(database.calls[0]?.sql).toContain('on conflict ("email") do update set "name" = ?');
    expect(database.calls[1]?.kind).toBe("all");
  });

  it("escapes wildcard characters in contains filters", async () => {
    const database = new RecordingSqliteDatabase();
    const orm = createOrm({
      schema,
      driver: createSqliteDriver(database),
    });

    database.selectResponses.push([{ count: 1 }]);

    const count = await orm.user.count({
      where: {
        email: {
          contains: "100%_match",
        },
      },
    });

    expect(count).toBe(1);
    expect(database.calls[0]?.sql).toContain(`instr("users"."email", ?) > 0`);
    expect(database.calls[0]?.params).toEqual(["100%_match"]);
  });

  it("rejects create flows for models without an id or unique field", async () => {
    const database = new RecordingSqliteDatabase();
    const identitylessSchema = defineSchema({
      audit: model({
        table: "audits",
        fields: {
          message: string(),
        },
      }),
    });
    const orm = createOrm({
      schema: identitylessSchema,
      driver: createSqliteDriver(database),
    });

    await expect(
      orm.audit.create({
        data: {
          message: "hello",
        },
      }),
    ).rejects.toThrow('requires an "id" field');

    expect(database.calls).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { createOrm, datetime, defineSchema, id, model, string } from "@farming-labs/orm";
import type { MysqlConnectionLike, MysqlPoolLike } from "../src";
import { createMysqlDriver } from "../src";

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

class RecordingMysqlConnection implements MysqlConnectionLike {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];
  readonly transactionLog: string[] = [];
  readonly responses: Array<unknown> = [];

  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<[Array<Record<string, unknown>> | { affectedRows?: number }, unknown]> {
    this.calls.push({
      sql,
      params,
    });

    const next = this.responses.shift();
    if (Array.isArray(next)) {
      return [next as Array<Record<string, unknown>>, undefined];
    }

    return [(next ?? { affectedRows: 1 }) as { affectedRows?: number }, undefined];
  }

  async beginTransaction() {
    this.transactionLog.push("begin");
  }

  async commit() {
    this.transactionLog.push("commit");
  }

  async rollback() {
    this.transactionLog.push("rollback");
  }
}

class RecordingMysqlPool implements MysqlPoolLike {
  constructor(readonly connection: RecordingMysqlConnection) {}

  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<[Array<Record<string, unknown>> | { affectedRows?: number }, unknown]> {
    return this.connection.execute(sql, params);
  }

  async getConnection() {
    return this.connection;
  }
}

describe("mysql SQL runtime", () => {
  it("uses mysql placeholders, quoting, and transaction hooks", async () => {
    const connection = new RecordingMysqlConnection();
    const pool = new RecordingMysqlPool(connection);
    const orm = createOrm({
      schema,
      driver: createMysqlDriver(pool),
    });

    connection.responses.push([
      {
        id: "user_1",
        email: "ada@farminglabs.dev",
        name: "Ada",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);

    connection.responses.push({ affectedRows: 1 });
    connection.responses.push([
      {
        id: "user_2",
        email: "grace@farminglabs.dev",
        name: "Grace",
        createdAt: "2025-01-02T00:00:00.000Z",
      },
    ]);

    connection.responses.push([{ count: "2" }]);
    connection.responses.push([
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

    expect(connection.calls[0]?.sql).toContain("from `users`");
    expect(connection.calls[0]?.sql).toContain("`users`.`email` = ?");
    expect(connection.calls[1]?.sql).toContain("insert into `users`");
    expect(connection.calls[1]?.sql).toContain("values (?, ?, ?, ?)");
    expect(connection.calls[3]?.sql).toContain("select count(*) as `count` from `users`");
    expect(connection.transactionLog).toEqual(["begin", "commit"]);
  });

  it("rolls back mysql transactions on failure", async () => {
    const connection = new RecordingMysqlConnection();
    const orm = createOrm({
      schema,
      driver: createMysqlDriver(connection),
    });

    connection.responses.push({ affectedRows: 1 });

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

    expect(connection.transactionLog).toEqual(["begin", "rollback"]);
  });

  it("uses a native mysql upsert statement before reading the result", async () => {
    const connection = new RecordingMysqlConnection();
    const pool = new RecordingMysqlPool(connection);
    const orm = createOrm({
      schema,
      driver: createMysqlDriver(pool),
    });

    connection.responses.push({ affectedRows: 1 });
    connection.responses.push([
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
    expect(connection.calls).toHaveLength(2);
    expect(connection.calls[0]?.sql).toContain("insert into `users`");
    expect(connection.calls[0]?.sql).toContain("on duplicate key update `name` = ?");
    expect(connection.calls[1]?.sql).toContain("select `users`.`id` as `id`");
  });
});

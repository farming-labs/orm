import { describe, expect, it } from "vitest";
import { createOrm, datetime, defineSchema, id, model, string } from "@farming-labs/orm";
import type { PgClientLike, PgPoolLike } from "../src";
import { createPgPoolDriver } from "../src";

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

class RecordingPgClient implements PgClientLike {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];
  readonly responses: Array<{ rows?: Array<Record<string, unknown>>; rowCount?: number }> = [];
  released = false;

  async query(sql: string, params: unknown[] = []) {
    this.calls.push({ sql, params });
    return this.responses.shift() ?? { rows: [], rowCount: 0 };
  }

  release() {
    this.released = true;
  }
}

class RecordingPgPool implements PgPoolLike {
  constructor(readonly client: RecordingPgClient) {}

  async query(sql: string, params: unknown[] = []) {
    return this.client.query(sql, params);
  }

  async connect() {
    return this.client;
  }
}

describe("pgPool SQL runtime transaction handling", () => {
  it("issues begin and commit through a connected pg client", async () => {
    const client = new RecordingPgClient();
    const pool = new RecordingPgPool(client);
    const orm = createOrm({
      schema,
      driver: createPgPoolDriver(pool),
    });

    client.responses.push({ rows: [], rowCount: 0 });
    client.responses.push({ rows: [], rowCount: 1 });
    client.responses.push({
      rows: [
        {
          id: "user_1",
          email: "ada@farminglabs.dev",
          name: "Ada",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      rowCount: 1,
    });
    client.responses.push({ rows: [], rowCount: 0 });

    const created = await orm.transaction(async (tx) =>
      tx.user.create({
        data: {
          email: "ada@farminglabs.dev",
          name: "Ada",
        },
        select: {
          id: true,
          email: true,
        },
      }),
    );

    expect(created).toEqual({
      id: "user_1",
      email: "ada@farminglabs.dev",
    });
    expect(client.calls[0]?.sql).toBe("begin");
    expect(client.calls[1]?.sql).toContain('insert into "users"');
    expect(client.calls[1]?.sql).toContain("values ($1, $2, $3, $4)");
    expect(client.calls[2]?.sql).toContain('select "users"."id" as "id"');
    expect(client.calls[3]?.sql).toBe("commit");
    expect(client.released).toBe(true);
  });

  it("issues rollback when a pgPool transaction fails", async () => {
    const client = new RecordingPgClient();
    const pool = new RecordingPgPool(client);
    const orm = createOrm({
      schema,
      driver: createPgPoolDriver(pool),
    });

    client.responses.push({ rows: [], rowCount: 0 });
    client.responses.push({ rows: [], rowCount: 1 });
    client.responses.push({
      rows: [
        {
          id: "user_1",
          email: "rollback@farminglabs.dev",
          name: "Rollback",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      rowCount: 1,
    });
    client.responses.push({ rows: [], rowCount: 0 });

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

    expect(client.calls[0]?.sql).toBe("begin");
    expect(client.calls.at(-1)?.sql).toBe("rollback");
    expect(client.released).toBe(true);
  });
});

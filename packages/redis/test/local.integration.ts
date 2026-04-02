import { describe, expect, it } from "vitest";
import {
  createOrm,
  datetime,
  defineSchema,
  detectDatabaseRuntime,
  id,
  inspectDatabaseRuntime,
  integer,
  isOrmError,
  model,
  string,
  tableName,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
import type { RuntimeOrm } from "../../mongoose/test/support/auth";
import {
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertEnumBigintAndDecimalQueries,
  assertIntegerAndJsonQueries,
  assertModelLevelConstraints,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  schema,
} from "../../mongoose/test/support/auth";
import { createRedisDriver } from "../src";
import type { RedisClientLike } from "../src";
import { hasLocalRedisServerBinary, startLocalRedis } from "./support/local-redis";

const generatedNumericIdSchema = defineSchema({
  auditEvent: model({
    table: "audit_events",
    fields: {
      id: id({ type: "integer", generated: "increment" }),
      email: string().unique(),
    },
  }),
});

const namespacedSchema = defineSchema({
  user: model({
    table: tableName("users", { schema: "auth" }),
    fields: {
      id: id(),
      email: string().unique(),
    },
  }),
});

const normalizedUniqueLookupSchema = defineSchema({
  event: model({
    table: "events",
    fields: {
      id: id(),
      revision: integer().unique(),
      occurredAt: datetime().unique(),
      name: string(),
    },
  }),
});

async function createLocalRedisOrm() {
  const local = await startLocalRedis();

  try {
    await pushSchema({
      schema,
      client: local.client,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createRedisDriver({
          client: local.client,
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

function createInMemoryRedisClient(options?: {
  ignoreUppercaseScanMatch?: boolean;
  requireSendCommandForNx?: boolean;
}) {
  const store = new Map<string, string>();
  const ignoreUppercaseScanMatch = options?.ignoreUppercaseScanMatch === true;

  const client: RedisClientLike = {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value, ...rest) {
      if (options?.requireSendCommandForNx && rest.length > 0) {
        throw new Error("Unsupported Redis SET argument shape.");
      }

      const nxOption = rest.find((entry) => typeof entry === "string" || typeof entry === "object");
      if (typeof nxOption === "string" && nxOption.toUpperCase() === "NX") {
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      }

      if (nxOption && typeof nxOption === "object") {
        const maybeNx = nxOption as { NX?: boolean; nx?: boolean };
        if (maybeNx.NX || maybeNx.nx) {
          if (store.has(key)) return null;
          store.set(key, value);
          return "OK";
        }
      }

      store.set(key, value);
      return "OK";
    },
    async del(...keys) {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
      }
      return removed;
    },
    async sendCommand(command) {
      const [name, key, value, modifier] = command.map(String);
      if (name.toUpperCase() === "SET" && modifier.toUpperCase() === "NX") {
        if (store.has(key)) return null;
        store.set(key, value);
        return "OK";
      }

      throw new Error(`Unsupported Redis command: ${command.join(" ")}`);
    },
    async scan(_cursor, options) {
      const keys = Array.from(store.keys()).sort();
      const upperMatch = typeof options?.MATCH === "string" ? options.MATCH : undefined;
      const lowerMatch = typeof options?.match === "string" ? options.match : undefined;
      const match =
        ignoreUppercaseScanMatch && upperMatch && lowerMatch === undefined
          ? undefined
          : (lowerMatch ?? upperMatch);

      if (!match) {
        return ["0", keys] as const;
      }

      const source = Array.from(match)
        .map((character) => {
          if (character === "*") return ".*";
          if (character === "?") return ".";
          return /[\\^$+?.()|[\]{}]/.test(character) ? `\\${character}` : character;
        })
        .join("");
      const expression = new RegExp(`^${source}$`);
      return ["0", keys.filter((key) => expression.test(key))] as const;
    },
  };

  return client;
}

const redisServerAvailable = hasLocalRedisServerBinary();
const describeWithLocalRedis = redisServerAvailable ? describe : describe.skip;

describe("redis compatibility", () => {
  it("detects Redis runtimes from a Redis-like client shape", async () => {
    const client = createInMemoryRedisClient({
      requireSendCommandForNx: true,
    });

    const detected = detectDatabaseRuntime(client);
    const inspected = inspectDatabaseRuntime(client);
    const orm = await createOrmFromRuntime({
      schema,
      client,
    });

    expect(detected).toEqual({
      kind: "redis",
      client,
      source: "client",
    });
    expect(inspected.runtime?.kind).toBe("redis");
    expect(orm.$driver.kind).toBe("redis");
  });

  it("filters scan results even when the client ignores uppercase match options", async () => {
    const client = createInMemoryRedisClient({
      ignoreUppercaseScanMatch: true,
    });

    const orm = createOrm({
      schema,
      driver: createRedisDriver({
        client,
      }),
    }) as RuntimeOrm;

    await orm.user.create({
      data: {
        id: "user_1",
        email: "scan-user@farminglabs.dev",
        name: "Scan User",
      },
    });

    await orm.session.create({
      data: {
        id: "session_1",
        userId: "user_1",
        token: "scan-token",
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    });

    const users = await orm.user.findMany({
      select: {
        email: true,
      },
    });

    expect(users).toEqual([
      {
        email: "scan-user@farminglabs.dev",
      },
    ]);
  });

  it("ignores false select entries instead of treating them like relation payloads", async () => {
    const client = createInMemoryRedisClient({
      requireSendCommandForNx: true,
    });

    const orm = createOrm({
      schema,
      driver: createRedisDriver({
        client,
      }),
    }) as RuntimeOrm;

    const user = await orm.user.create({
      data: {
        email: "false-select@farminglabs.dev",
        name: "False Select",
      },
    });

    await orm.session.create({
      data: {
        id: "false_select_session",
        userId: user.id,
        token: "false-select-token",
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    });

    const selected = await orm.user.findUnique({
      where: {
        email: "false-select@farminglabs.dev",
      },
      select: {
        id: true,
        sessions: false as never,
      },
    });

    expect(selected).toEqual({
      id: user.id,
    });
  });

  it("uses sendCommand NX support before falling back to a read-then-write lock path", async () => {
    const client = createInMemoryRedisClient({
      requireSendCommandForNx: true,
    });

    const orm = createOrm({
      schema,
      driver: createRedisDriver({
        client,
      }),
    }) as RuntimeOrm;

    await orm.user.create({
      data: {
        id: "user_send_command",
        email: "send-command@farminglabs.dev",
        name: "Send Command",
      },
    });

    const error = await orm.user
      .create({
        data: {
          id: "user_send_command_2",
          email: "send-command@farminglabs.dev",
          name: "Duplicate",
        },
      })
      .catch((reason) => reason);

    expect(isOrmError(error)).toBe(true);
    expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
  });
});

describeWithLocalRedis("redis local integration", () => {
  it("detects Redis runtimes and creates an ORM from the raw client", async () => {
    const local = await startLocalRedis();

    try {
      const detected = detectDatabaseRuntime(local.client);
      const inspected = inspectDatabaseRuntime(local.client);

      await pushSchema({
        schema,
        client: local.client,
      });

      const orm = (await createOrmFromRuntime({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      expect(detected).toEqual({
        kind: "redis",
        client: local.client,
        source: "client",
      });
      expect(inspected.runtime?.kind).toBe("redis");
      expect(orm.$driver.kind).toBe("redis");
      expect(orm.$driver.capabilities).toEqual({
        supportsNumericIds: true,
        numericIds: "manual",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: false,
        supportsSchemaNamespaces: false,
        supportsTransactionalDDL: false,
        supportsJoin: false,
        nativeRelationLoading: "none",
        textComparison: "case-sensitive",
        textMatching: {
          equality: "case-sensitive",
          contains: "case-sensitive",
          ordering: "case-sensitive",
        },
        upsert: "emulated",
        returning: {
          create: true,
          update: true,
          delete: false,
        },
        returningMode: {
          create: "record",
          update: "record",
          delete: "none",
        },
        nativeRelations: {
          singularChains: false,
          hasMany: false,
          manyToMany: false,
          filtered: false,
          ordered: false,
          paginated: false,
        },
      });
    } finally {
      await local.close();
    }
  });

  it("bootstraps through the runtime setup helpers without requiring schema push", async () => {
    const local = await startLocalRedis();

    try {
      const orm = (await bootstrapDatabase({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "bootstrap-redis@farminglabs.dev",
          name: "Bootstrap",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "bootstrap-redis@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalRedisOrm();

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalRedisOrm();

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries without requiring transaction rollback support", async () => {
    const local = await createLocalRedisOrm();

    try {
      await assertMutationQueries(local.orm, expect, {
        expectTransactionRollback: false,
      });
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalRedisOrm();

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalRedisOrm();

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enums, bigints, and decimals", async () => {
    const local = await createLocalRedisOrm();

    try {
      await assertEnumBigintAndDecimalQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalRedisOrm();

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("normalizes duplicate-key errors from Redis writes", async () => {
    const local = await createLocalRedisOrm();

    try {
      await local.orm.user.create({
        data: {
          email: "duplicate-redis@farminglabs.dev",
          name: "Ada",
        },
      });

      const error = await local.orm.user
        .create({
          data: {
            email: "duplicate-redis@farminglabs.dev",
            name: "Grace",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("redis");
    } finally {
      await local.close();
    }
  });

  it("normalizes unique lookups for integer and datetime fields", async () => {
    const local = await startLocalRedis();

    try {
      const orm = createOrm({
        schema: normalizedUniqueLookupSchema,
        driver: createRedisDriver({
          client: local.client,
        }),
      });

      await orm.event.create({
        data: {
          id: "event_1",
          revision: 7,
          occurredAt: new Date("2026-04-02T12:34:56.000Z"),
          name: "Launch",
        },
      });

      const integerMatch = await orm.event.findUnique({
        where: {
          revision: "7" as never,
        },
      });

      const datetimeMatch = await orm.event.findUnique({
        where: {
          occurredAt: "2026-04-02T12:34:56.000Z" as never,
        },
      });

      expect(integerMatch?.name).toBe("Launch");
      expect(datetimeMatch?.name).toBe("Launch");
    } finally {
      await local.close();
    }
  });

  it("rejects generated integer ids for Redis", async () => {
    const local = await startLocalRedis();

    try {
      await expect(
        createOrm({
          schema: generatedNumericIdSchema,
          driver: createRedisDriver({
            client: local.client,
          }),
        }).auditEvent.create({
          data: {
            email: "generated-redis@farminglabs.dev",
          },
        }),
      ).rejects.toThrow(/does not support generated integer ids/i);
    } finally {
      await local.close();
    }
  });

  it("rejects schema-qualified tables for Redis", async () => {
    const local = await startLocalRedis();

    try {
      await expect(
        createOrm({
          schema: namespacedSchema,
          driver: createRedisDriver({
            client: local.client,
          }),
        }).user.count(),
      ).rejects.toThrow(/does not support schema-qualified tables/i);
    } finally {
      await local.close();
    }
  });
});

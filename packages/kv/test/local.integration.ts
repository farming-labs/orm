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
import { createKvDriver } from "../src";
import type { KvClientLike } from "../src";
import { startLocalKv } from "./support/local-kv";

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

async function createLocalKvOrm() {
  const local = await startLocalKv();

  try {
    await pushSchema({
      schema,
      client: local.client,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createKvDriver({
          client: local.client,
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

function createInMemoryKvClient(options?: { ignorePrefixList?: boolean }) {
  const store = new Map<string, string>();
  const ignorePrefixList = options?.ignorePrefixList === true;

  const normalizeStoredValue = (
    value: string | ArrayBuffer | ArrayBufferView<ArrayBufferLike> | ReadableStream,
  ) => {
    if (typeof value === "string") {
      return value;
    }

    if (value instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(value));
    }

    if (ArrayBuffer.isView(value)) {
      return new TextDecoder().decode(value);
    }

    return JSON.stringify(value);
  };

  const client: KvClientLike = {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, normalizeStoredValue(value));
      return "OK";
    },
    async delete(key) {
      store.delete(key);
    },
    async list(options) {
      const keys = Array.from(store.keys()).sort();
      const prefix = ignorePrefixList ? undefined : options?.prefix;
      return {
        keys: keys
          .filter((key) => (typeof prefix === "string" ? key.startsWith(prefix) : true))
          .map((name) => ({ name })),
        list_complete: true,
        cursor: "",
      };
    },
  };

  return client;
}

describe("kv compatibility", () => {
  it("detects Cloudflare KV runtimes from a KV-like client shape", async () => {
    const client = createInMemoryKvClient();

    const detected = detectDatabaseRuntime(client);
    const inspected = inspectDatabaseRuntime(client);
    const orm = await createOrmFromRuntime({
      schema,
      client,
    });

    expect(detected).toEqual({
      kind: "kv",
      client,
      source: "client",
    });
    expect(inspected.runtime?.kind).toBe("kv");
    expect(orm.$driver.kind).toBe("kv");
  });

  it("filters listed results even when the client ignores list prefixes", async () => {
    const client = createInMemoryKvClient({
      ignorePrefixList: true,
    });

    const orm = createOrm({
      schema,
      driver: createKvDriver({
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
    const client = createInMemoryKvClient();

    const orm = createOrm({
      schema,
      driver: createKvDriver({
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

  it("uses the read-then-write uniqueness fallback for KV-like clients", async () => {
    const client = createInMemoryKvClient();

    const orm = createOrm({
      schema,
      driver: createKvDriver({
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

describe("kv local integration", () => {
  it("detects Cloudflare KV runtimes and creates an ORM from the raw client", async () => {
    const local = await startLocalKv();

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
        kind: "kv",
        client: local.client,
        source: "client",
      });
      expect(inspected.runtime?.kind).toBe("kv");
      expect(orm.$driver.kind).toBe("kv");
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
    const local = await startLocalKv();

    try {
      const orm = (await bootstrapDatabase({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "bootstrap-kv@farminglabs.dev",
          name: "Bootstrap",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "bootstrap-kv@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalKvOrm();

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalKvOrm();

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries without requiring transaction rollback support", async () => {
    const local = await createLocalKvOrm();

    try {
      await assertMutationQueries(local.orm, expect, {
        expectTransactionRollback: false,
      });
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalKvOrm();

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalKvOrm();

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enums, bigints, and decimals", async () => {
    const local = await createLocalKvOrm();

    try {
      await assertEnumBigintAndDecimalQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalKvOrm();

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("normalizes duplicate-key errors from Cloudflare KV writes", async () => {
    const local = await createLocalKvOrm();

    try {
      await local.orm.user.create({
        data: {
          email: "duplicate-kv@farminglabs.dev",
          name: "Ada",
        },
      });

      const error = await local.orm.user
        .create({
          data: {
            email: "duplicate-kv@farminglabs.dev",
            name: "Grace",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("kv");
    } finally {
      await local.close();
    }
  });

  it("normalizes unique lookups for integer and datetime fields", async () => {
    const local = await startLocalKv();

    try {
      const orm = createOrm({
        schema: normalizedUniqueLookupSchema,
        driver: createKvDriver({
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

  it("rejects generated integer ids for Cloudflare KV", async () => {
    const local = await startLocalKv();

    try {
      await expect(
        createOrm({
          schema: generatedNumericIdSchema,
          driver: createKvDriver({
            client: local.client,
          }),
        }).auditEvent.create({
          data: {
            email: "generated-kv@farminglabs.dev",
          },
        }),
      ).rejects.toThrow(/does not support generated integer ids/i);
    } finally {
      await local.close();
    }
  });

  it("rejects schema-qualified tables for Cloudflare KV", async () => {
    const local = await startLocalKv();

    try {
      await expect(
        createOrm({
          schema: namespacedSchema,
          driver: createKvDriver({
            client: local.client,
          }),
        }).user.count(),
      ).rejects.toThrow(/does not support schema-qualified tables/i);
    } finally {
      await local.close();
    }
  });
});

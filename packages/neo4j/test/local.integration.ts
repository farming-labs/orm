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
import { createNeo4jDriver } from "../src";
import { startLocalNeo4j } from "./support/local-neo4j";

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

async function createLocalNeo4jOrm() {
  const local = await startLocalNeo4j();

  try {
    await pushSchema({
      schema,
      client: local.client,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createNeo4jDriver({
          client: local.client,
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

describe("neo4j local integration", () => {
  it("detects Neo4j runtimes and creates an ORM from the raw client", async () => {
    const local = await startLocalNeo4j();

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
        kind: "neo4j",
        client: local.client,
        source: "client",
      });
      expect(inspected.runtime?.kind).toBe("neo4j");
      expect(orm.$driver.kind).toBe("neo4j");
      expect(orm.$driver.capabilities).toEqual({
        supportsNumericIds: true,
        numericIds: "manual",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: true,
        supportsSchemaNamespaces: false,
        supportsTransactionalDDL: true,
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

  it("bootstraps through the runtime setup helpers", async () => {
    const local = await startLocalNeo4j();

    try {
      const orm = (await bootstrapDatabase({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "bootstrap-neo4j@farminglabs.dev",
          name: "Bootstrap",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "bootstrap-neo4j@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries with transaction rollback support", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await assertMutationQueries(local.orm, expect, {
        expectTransactionRollback: true,
      });
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enums, bigints, and decimals", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await assertEnumBigintAndDecimalQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("normalizes duplicate-key errors from Neo4j writes", async () => {
    const local = await createLocalNeo4jOrm();

    try {
      await local.orm.user.create({
        data: {
          email: "duplicate-neo4j@farminglabs.dev",
          name: "Ada",
        },
      });

      const error = await local.orm.user
        .create({
          data: {
            email: "duplicate-neo4j@farminglabs.dev",
            name: "Grace",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("neo4j");
    } finally {
      await local.close();
    }
  });

  it("normalizes unique lookups for integer and datetime fields", async () => {
    const local = await startLocalNeo4j();

    try {
      const orm = createOrm({
        schema: normalizedUniqueLookupSchema,
        driver: createNeo4jDriver({
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

  it("rejects generated integer ids for Neo4j", async () => {
    const local = await startLocalNeo4j();

    try {
      await expect(
        createOrm({
          schema: generatedNumericIdSchema,
          driver: createNeo4jDriver({
            client: local.client,
          }),
        }).auditEvent.create({
          data: {
            email: "generated-neo4j@farminglabs.dev",
          },
        }),
      ).rejects.toThrow(/does not support generated integer ids/i);
    } finally {
      await local.close();
    }
  });

  it("rejects schema-qualified tables for Neo4j", async () => {
    const local = await startLocalNeo4j();

    try {
      await expect(
        createOrm({
          schema: namespacedSchema,
          driver: createNeo4jDriver({
            client: local.client,
          }),
        }).user.count(),
      ).rejects.toThrow(/does not support schema-qualified tables/i);
    } finally {
      await local.close();
    }
  });
});

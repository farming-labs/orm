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
import { createUnstorageDriver } from "../src";
import { type LocalUnstorageTarget, startLocalUnstorage } from "./support/local-unstorage";

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

async function createLocalUnstorageOrm(target: LocalUnstorageTarget) {
  const local = await startLocalUnstorage(target);

  try {
    await pushSchema({
      schema,
      client: local.storage,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createUnstorageDriver({
          storage: local.storage,
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

describe.each(["memory", "fs-lite"] as const)("unstorage local integration (%s)", (target) => {
  it("detects Unstorage runtimes and creates an ORM from the raw client", async () => {
    const local = await startLocalUnstorage(target);

    try {
      const detected = detectDatabaseRuntime(local.storage);
      const inspected = inspectDatabaseRuntime(local.storage);

      await pushSchema({
        schema,
        client: local.storage,
      });

      const orm = (await createOrmFromRuntime({
        schema,
        client: local.storage,
      })) as RuntimeOrm;

      expect(detected).toEqual({
        kind: "unstorage",
        client: local.storage,
        source: "client",
      });
      expect(inspected.runtime?.kind).toBe("unstorage");
      expect(orm.$driver.kind).toBe("unstorage");
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
    const local = await startLocalUnstorage(target);

    try {
      const orm = (await bootstrapDatabase({
        schema,
        client: local.storage,
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: `bootstrap-${target}@farminglabs.dev`,
          name: "Bootstrap",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: `bootstrap-${target}@farminglabs.dev`,
      });
    } finally {
      await local.close();
    }
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries without requiring transaction rollback support", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await assertMutationQueries(local.orm, expect, {
        expectTransactionRollback: false,
      });
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enum, bigint, and decimal fields", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await assertEnumBigintAndDecimalQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("normalizes duplicate key errors from Unstorage writes", async () => {
    const local = await createLocalUnstorageOrm(target);

    try {
      await local.orm.user.create({
        data: {
          email: `duplicate-${target}@farminglabs.dev`,
          name: "First",
        },
      });

      const error = await local.orm.user
        .create({
          data: {
            email: `duplicate-${target}@farminglabs.dev`,
            name: "Second",
          },
        })
        .catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
      expect(error.backendKind).toBe("unstorage");
    } finally {
      await local.close();
    }
  });

  it("rejects generated integer ids for Unstorage", async () => {
    const local = await startLocalUnstorage(target);

    try {
      await expect(
        createOrm({
          schema: generatedNumericIdSchema,
          driver: createUnstorageDriver({
            storage: local.storage,
          }),
        }).auditEvent.create({
          data: {
            email: `generated-${target}@farminglabs.dev`,
          },
        }),
      ).rejects.toThrow(/generated integer ids/i);
    } finally {
      await local.close();
    }
  });

  it("rejects schema-qualified tables for Unstorage", async () => {
    const local = await startLocalUnstorage(target);

    try {
      await expect(
        createOrm({
          schema: namespacedSchema,
          driver: createUnstorageDriver({
            storage: local.storage,
          }),
        }).user.count(),
      ).rejects.toThrow(/schema-qualified tables/i);
    } finally {
      await local.close();
    }
  });

  it("normalizes numeric and datetime unique filters before matching rows", async () => {
    const local = await startLocalUnstorage(target);

    try {
      const orm = await bootstrapDatabase({
        schema: normalizedUniqueLookupSchema,
        client: local.storage,
      });
      const occurredAt = new Date("2026-03-31T00:00:00.000Z");

      await orm.event.create({
        data: {
          revision: 7,
          occurredAt,
          name: "Launch",
        },
      });

      const byRevision = await orm.event.findUnique({
        where: {
          revision: "7" as unknown as number,
        },
        select: {
          name: true,
        },
      });
      const byDate = await orm.event.findUnique({
        where: {
          occurredAt: occurredAt.toISOString() as unknown as Date,
        },
        select: {
          name: true,
        },
      });

      expect(byRevision).toEqual({
        name: "Launch",
      });
      expect(byDate).toEqual({
        name: "Launch",
      });
    } finally {
      await local.close();
    }
  });
});

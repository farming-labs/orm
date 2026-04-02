import { describe, expect, it } from "vitest";
import {
  createOrm,
  defineSchema,
  detectDatabaseRuntime,
  id,
  inspectDatabaseRuntime,
  integer,
  isOrmError,
  model,
  renderSafeSql,
  string,
  tableName,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
import type { RuntimeOrm } from "../../drizzle/test/support/auth";
import {
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertIntegerAndJsonQueries,
  assertModelLevelConstraints,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  seedAuthData,
  schema,
} from "../../drizzle/test/support/auth";
import { createEdgeDbDriver } from "../src";
import { startLocalEdgeDb } from "./support/local-edgedb";

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

async function createLocalEdgeDbOrm() {
  const local = await startLocalEdgeDb();

  try {
    await local.applySql(renderSafeSql(schema, { dialect: "postgres" }));
    await pushSchema({
      schema,
      client: local.client,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createEdgeDbDriver({
          client: local.client,
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

describe("edgedb local integration", () => {
  it("detects EdgeDB runtimes and creates an ORM from the raw client", async () => {
    const local = await startLocalEdgeDb();

    try {
      const detected = detectDatabaseRuntime(local.client);
      const inspected = inspectDatabaseRuntime(local.client);

      await local.applySql(renderSafeSql(schema, { dialect: "postgres" }));

      const orm = (await createOrmFromRuntime({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      expect(detected).toEqual({
        kind: "edgedb",
        client: local.client,
        dialect: "postgres",
        source: "client",
      });
      expect(inspected.runtime?.kind).toBe("edgedb");
      expect(orm.$driver.kind).toBe("edgedb");
      expect(orm.$driver.capabilities).toEqual({
        supportsNumericIds: true,
        numericIds: "generated",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: true,
        supportsSchemaNamespaces: true,
        supportsTransactionalDDL: false,
        supportsJoin: false,
        nativeRelationLoading: "partial",
        textComparison: "database-default",
        textMatching: {
          equality: "database-default",
          contains: "database-default",
          ordering: "database-default",
        },
        upsert: "native",
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
          singularChains: true,
          hasMany: true,
          manyToMany: true,
          filtered: false,
          ordered: false,
          paginated: false,
        },
      });
    } finally {
      await local.close();
    }
  });

  it("bootstraps through the runtime helper path when the SQL schema already exists", async () => {
    const local = await startLocalEdgeDb();

    try {
      await local.applySql(renderSafeSql(schema, { dialect: "postgres" }));

      const orm = (await bootstrapDatabase({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "bootstrap-edgedb@farminglabs.dev",
          name: "Bootstrap",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "bootstrap-edgedb@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalEdgeDbOrm();

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalEdgeDbOrm();

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries with transactional rollback support", async () => {
    const local = await createLocalEdgeDbOrm();

    try {
      await assertMutationQueries(local.orm, expect, {
        expectTransactionRollback: true,
      });
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalEdgeDbOrm();

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalEdgeDbOrm();

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enums, bigints, and decimals", async () => {
    const local = await createLocalEdgeDbOrm();

    try {
      await seedAuthData(local.orm);

      const upgradedUser = await local.orm.user.update({
        where: {
          email: "ada@farminglabs.dev",
        },
        data: {
          tier: "enterprise",
          quota: 2048n,
        },
        select: {
          tier: true,
          quota: true,
        },
      });

      const updatedAccount = await local.orm.account.update({
        where: {
          provider: "github",
          accountId: "gh_ada",
        },
        data: {
          planTier: "pro",
          balance: "19.95",
        },
        select: {
          planTier: true,
          balance: true,
        },
      });

      expect(upgradedUser).toEqual({
        tier: "enterprise",
        quota: 2048n,
      });
      expect(updatedAccount).toEqual({
        planTier: "pro",
        balance: "19.95",
      });
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalEdgeDbOrm();

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("normalizes missing-table errors when the schema has not been created", async () => {
    const local = await startLocalEdgeDb();

    try {
      const orm = (await createOrmFromRuntime({
        schema,
        client: local.client,
      })) as RuntimeOrm;

      const error = await orm.user.count().catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("MISSING_TABLE");
      expect(error.backendKind).toBe("edgedb");
      expect(error.dialect).toBe("postgres");
    } finally {
      await local.close();
    }
  });

  it("supports generated numeric ids", async () => {
    const local = await startLocalEdgeDb();

    try {
      await local.applySql(renderSafeSql(generatedNumericIdSchema, { dialect: "postgres" }));

      const orm = await createOrmFromRuntime({
        schema: generatedNumericIdSchema,
        client: local.client,
      });

      const first = await orm.auditEvent.create({
        data: {
          email: "first-edgedb@farminglabs.dev",
        },
      });
      const second = await orm.auditEvent.create({
        data: {
          email: "second-edgedb@farminglabs.dev",
        },
      });

      expect(first).toEqual({
        id: 1,
        email: "first-edgedb@farminglabs.dev",
      });
      expect(second).toEqual({
        id: 2,
        email: "second-edgedb@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("supports schema-qualified table names in the runtime path", async () => {
    const local = await startLocalEdgeDb();

    try {
      await local.applySql(renderSafeSql(namespacedSchema, { dialect: "postgres" }));

      const orm = await createOrmFromRuntime({
        schema: namespacedSchema,
        client: local.client,
      });

      await orm.user.create({
        data: {
          email: "namespaced@farminglabs.dev",
        },
      });

      const loaded = await orm.user.findUnique({
        where: {
          email: "namespaced@farminglabs.dev",
        },
      });

      expect(loaded).toEqual({
        id: expect.any(String),
        email: "namespaced@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("keeps pushSchema as a no-op instead of trying to manage Gel SQL schemas", async () => {
    const local = await startLocalEdgeDb();

    try {
      await pushSchema({
        schema,
        client: local.client,
      });

      const orm = await createOrmFromRuntime({
        schema,
        client: local.client,
      });
      const error = await orm.user.count().catch((reason) => reason);

      expect(isOrmError(error)).toBe(true);
      expect(error.code).toBe("MISSING_TABLE");
    } finally {
      await local.close();
    }
  });

  it("runs manual setup plus bootstrap for existing schemas", async () => {
    const local = await startLocalEdgeDb();

    try {
      await local.applySql(renderSafeSql(schema, { dialect: "postgres" }));
      const orm = (await bootstrapDatabase({
        schema,
        client: local.client,
      })) as RuntimeOrm;
      const seeded = await seedAuthData(orm);

      expect(seeded.ada.email).toBe("ada@farminglabs.dev");
    } finally {
      await local.close();
    }
  });
});

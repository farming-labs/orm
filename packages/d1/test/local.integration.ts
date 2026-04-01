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
import { createD1Driver } from "../src";
import { startLocalD1 } from "./support/local-d1";

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

async function createLocalD1Orm() {
  const local = await startLocalD1();

  try {
    await pushSchema({
      schema,
      client: local.db,
    });

    return {
      ...local,
      orm: createOrm({
        schema,
        driver: createD1Driver({
          client: local.db,
        }),
      }) as RuntimeOrm,
    };
  } catch (error) {
    await local.close();
    throw error;
  }
}

describe("cloudflare d1 local integration", () => {
  it("detects D1 runtimes and creates an ORM from the raw binding", async () => {
    const local = await startLocalD1();

    try {
      const detected = detectDatabaseRuntime(local.db);
      const inspected = inspectDatabaseRuntime(local.db);

      await pushSchema({
        schema,
        client: local.db,
      });

      const orm = (await createOrmFromRuntime({
        schema,
        client: local.db,
      })) as RuntimeOrm;

      expect(detected).toEqual({
        kind: "d1",
        client: local.db,
        dialect: "sqlite",
        source: "database",
      });
      expect(inspected.runtime?.kind).toBe("d1");
      expect(orm.$driver.kind).toBe("d1");
      expect(orm.$driver.capabilities).toEqual({
        supportsNumericIds: true,
        numericIds: "generated",
        supportsJSON: true,
        supportsDates: true,
        supportsBooleans: true,
        supportsTransactions: false,
        supportsSchemaNamespaces: false,
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

  it("bootstraps through the runtime setup helpers", async () => {
    const local = await startLocalD1();

    try {
      const orm = (await bootstrapDatabase({
        schema,
        client: local.db,
      })) as RuntimeOrm;

      const created = await orm.user.create({
        data: {
          email: "bootstrap-d1@farminglabs.dev",
          name: "Bootstrap",
        },
        select: {
          id: true,
          email: true,
        },
      });

      expect(created).toEqual({
        id: expect.any(String),
        email: "bootstrap-d1@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("runs auth-style one-to-one and has-many queries", async () => {
    const local = await createLocalD1Orm();

    try {
      await assertOneToOneAndHasManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs belongs-to and many-to-many queries", async () => {
    const local = await createLocalD1Orm();

    try {
      await assertBelongsToAndManyToManyQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("runs mutation queries without claiming rollback semantics", async () => {
    const local = await createLocalD1Orm();

    try {
      await assertMutationQueries(local.orm, expect, {
        expectTransactionRollback: false,
      });
    } finally {
      await local.close();
    }
  });

  it("supports compound unique lookups and upserts", async () => {
    const local = await createLocalD1Orm();

    try {
      await assertCompoundUniqueQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports integer and json fields", async () => {
    const local = await createLocalD1Orm();

    try {
      await assertIntegerAndJsonQueries(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports enum, decimal, and safe-range bigint fields", async () => {
    const local = await createLocalD1Orm();

    try {
      const { ada } = await seedAuthData(local.orm);

      const premiumUsers = await local.orm.user.findMany({
        where: {
          quota: {
            gte: 1024n,
          },
        },
        orderBy: {
          email: "asc",
        },
        select: {
          email: true,
          tier: true,
          quota: true,
        },
      });

      const upgradedUser = await local.orm.user.update({
        where: {
          email: "ada@farminglabs.dev",
        },
        data: {
          tier: "enterprise",
          quota: 9007199254740991n,
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

      const reloadedAccount = await local.orm.account.findUnique({
        where: {
          provider: "github",
          accountId: "gh_ada",
        },
        select: {
          userId: true,
          planTier: true,
          balance: true,
        },
      });

      expect(premiumUsers).toEqual([
        {
          email: "ada@farminglabs.dev",
          tier: "pro",
          quota: 9007199254740991n,
        },
      ]);
      expect(upgradedUser).toEqual({
        tier: "enterprise",
        quota: 9007199254740991n,
      });
      expect(updatedAccount).toEqual({
        planTier: "pro",
        balance: "19.95",
      });
      expect(reloadedAccount).toEqual({
        userId: ada.id,
        planTier: "pro",
        balance: "19.95",
      });
    } finally {
      await local.close();
    }
  });

  it("enforces model-level unique constraints", async () => {
    const local = await createLocalD1Orm();

    try {
      await assertModelLevelConstraints(local.orm, expect);
    } finally {
      await local.close();
    }
  });

  it("supports generated integer ids through SQLite rowid semantics", async () => {
    const local = await startLocalD1();

    try {
      const orm = await bootstrapDatabase({
        schema: generatedNumericIdSchema,
        client: local.db,
      });

      const [first, second] = await orm.auditEvent.createMany({
        data: [
          {
            email: "ada@farminglabs.dev",
          },
          {
            email: "grace@farminglabs.dev",
          },
        ],
        select: {
          id: true,
          email: true,
        },
      });

      expect(first).toEqual({
        id: 1,
        email: "ada@farminglabs.dev",
      });
      expect(second).toEqual({
        id: 2,
        email: "grace@farminglabs.dev",
      });
    } finally {
      await local.close();
    }
  });

  it("rejects schema-qualified tables", async () => {
    const local = await startLocalD1();

    try {
      const setupError = await pushSchema({
        schema: namespacedSchema,
        client: local.db,
      }).catch((error) => error);

      expect(setupError).toBeInstanceOf(Error);
      expect(String(setupError)).toContain("schema-qualified tables");

      const orm = await createOrmFromRuntime({
        schema: namespacedSchema,
        client: local.db,
      });
      const error = await orm.user.count().catch((reason) => reason);

      expect(isOrmError(error)).toBe(false);
      expect(String(error)).toContain("schema-qualified tables");
    } finally {
      await local.close();
    }
  });
});

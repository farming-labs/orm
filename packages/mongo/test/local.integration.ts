import { describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { createOrm, detectDatabaseRuntime, isOrmError } from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
import { createMongoDriver } from "../src";
import type { RuntimeOrm } from "../../mongoose/test/support/auth";
import {
  assertEnumBigintAndDecimalQueries,
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertIntegerAndJsonQueries,
  assertModelLevelConstraints,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  createIsolatedName,
  schema,
} from "../../mongoose/test/support/auth";

const LOCAL_TIMEOUT_MS = 15_000;

function formatLocalDbError(error: unknown, uri: string) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `MongoDB local integration test could not connect. Make sure a local MongoDB server is running and reachable via FARM_ORM_LOCAL_MONGODB_URL (current default: ${uri}).\nOriginal error: ${message}`,
  );
}

async function closeLocalClient(client: MongoClient, databaseName: string) {
  try {
    await client.db(databaseName).dropDatabase();
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function createLocalMongoDatabase() {
  const baseUri = process.env.FARM_ORM_LOCAL_MONGODB_URL ?? "mongodb://127.0.0.1:27017";
  const databaseName = createIsolatedName("farm_orm_mongo");
  const client = new MongoClient(baseUri, {
    serverSelectionTimeoutMS: 2_500,
    connectTimeoutMS: 2_500,
  });

  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => undefined);
    throw formatLocalDbError(error, baseUri);
  }

  return {
    client,
    db: client.db(databaseName),
    close: async () => {
      await closeLocalClient(client, databaseName);
    },
  };
}

async function createLocalMongoOrm() {
  const { client, db, close } = await createLocalMongoDatabase();
  await db.collection("members").createIndex({ user_id: 1, organization_id: 1 }, { unique: true });
  await db.collection("members").createIndex({ organization_id: 1, role: 1 });
  await db.collection("sessions").createIndex({ user_id: 1, expires_at: 1 });
  await db.collection("accounts").createIndex({ provider: 1, account_id: 1 }, { unique: true });
  await db.collection("accounts").createIndex({ user_id: 1, provider: 1 });

  return {
    orm: createOrm({
      schema,
      driver: createMongoDriver<typeof schema>({
        db,
        startSession: async () => client.startSession(),
      }),
    }) as RuntimeOrm,
    db,
    client,
    close,
  };
}

async function withLocalOrm<TResult>(run: (orm: RuntimeOrm) => Promise<TResult>) {
  const { orm, close } = await createLocalMongoOrm();

  try {
    return await run(orm);
  } finally {
    await close();
  }
}

describe("mongo local integration", () => {
  it(
    "pushes and bootstraps collections and indexes from a live MongoClient",
    async () => {
      const { client, db, close } = await createLocalMongoDatabase();

      try {
        await pushSchema({
          schema,
          client,
          databaseName: db.databaseName,
        });

        const orm = (await bootstrapDatabase({
          schema,
          client,
          databaseName: db.databaseName,
        })) as RuntimeOrm;

        const created = await orm.user.create({
          data: {
            email: "runtime@farminglabs.dev",
            name: "Runtime",
          },
          select: {
            id: true,
            email: true,
          },
        });

        const accountIndexes = await db.collection("accounts").indexes();

        expect(created).toEqual({
          id: expect.any(String),
          email: "runtime@farminglabs.dev",
        });
        expect(
          accountIndexes.some((index) => index.name === "accounts_provider_account_id_unique"),
        ).toBe(true);
      } finally {
        await close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "exposes the live Mongo database on orm.$driver",
    async () => {
      const { orm, db, close } = await createLocalMongoOrm();

      try {
        expect(orm.$driver.kind).toBe("mongo");
        expect((orm.$driver.client as { db?: unknown }).db).toBe(db);
        expect(detectDatabaseRuntime(db)).toEqual({
          kind: "mongo",
          client: db,
          source: "db",
        });
        expect(orm.$driver.capabilities).toEqual({
          supportsNumericIds: false,
          supportsJSON: true,
          supportsDates: true,
          supportsBooleans: true,
          supportsTransactions: true,
          supportsSchemaNamespaces: false,
          supportsTransactionalDDL: false,
          supportsJoin: false,
          nativeRelationLoading: "none",
          textComparison: "case-sensitive",
          upsert: "native",
          returning: {
            create: true,
            update: true,
            delete: false,
          },
        });
        expect(Object.isFrozen(orm.$driver)).toBe(true);
        expect(Object.isFrozen(orm.$driver.capabilities)).toBe(true);
        expect(Object.isFrozen(orm.$driver.capabilities.returning)).toBe(true);
      } finally {
        await close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "creates an ORM directly from a live MongoClient",
    async () => {
      const { client, db, close } = await createLocalMongoOrm();

      try {
        const orm = (await createOrmFromRuntime({
          schema,
          client,
          databaseName: db.databaseName,
        })) as RuntimeOrm;

        const created = await orm.user.create({
          data: {
            email: "auto@farminglabs.dev",
            name: "Auto",
          },
          select: {
            id: true,
            email: true,
          },
        });

        const count = await orm.user.count({
          where: {
            email: "auto@farminglabs.dev",
          },
        });

        expect(orm.$driver.kind).toBe("mongo");
        expect(created).toEqual({
          id: expect.any(String),
          email: "auto@farminglabs.dev",
        });
        expect(count).toBe(1);
      } finally {
        await close();
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports one-to-one and one-to-many reads against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) => assertOneToOneAndHasManyQueries(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports belongsTo and many-to-many traversal against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) => assertBelongsToAndManyToManyQueries(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports updates, upserts, deletes, and optional transaction rollback against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) =>
        assertMutationQueries(orm, expect, {
          expectTransactionRollback: process.env.FARM_ORM_LOCAL_MONGODB_TRANSACTIONS === "1",
        }),
      );
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "normalizes duplicate-key errors from a real local MongoDB instance",
    async () => {
      await withLocalOrm(async (orm) => {
        await orm.user.create({
          data: {
            email: "duplicate@farminglabs.dev",
            name: "First",
          },
        });

        const error = await orm.user
          .create({
            data: {
              email: "duplicate@farminglabs.dev",
              name: "Second",
            },
          })
          .catch((reason) => reason);

        expect(isOrmError(error)).toBe(true);
        expect(error.code).toBe("UNIQUE_CONSTRAINT_VIOLATION");
        expect(error.backendKind).toBe("mongo");
      });
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports compound-unique lookups and upserts against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) => assertCompoundUniqueQueries(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports integer and json fields against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) => assertIntegerAndJsonQueries(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "supports enum, bigint, and decimal fields against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) => assertEnumBigintAndDecimalQueries(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "enforces model-level constraints against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) => assertModelLevelConstraints(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );
});

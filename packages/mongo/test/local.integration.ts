import { describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { createOrm, detectDatabaseRuntime } from "@farming-labs/orm";
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

async function createLocalMongoOrm() {
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

  const db = client.db(databaseName);
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
    close: async () => {
      await closeLocalClient(client, databaseName);
    },
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
          supportsJoin: false,
          nativeRelationLoading: "none",
        });
        expect(Object.isFrozen(orm.$driver)).toBe(true);
        expect(Object.isFrozen(orm.$driver.capabilities)).toBe(true);
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

import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { createOrm, detectDatabaseRuntime } from "@farming-labs/orm";
import { bootstrapDatabase, createOrmFromRuntime, pushSchema } from "@farming-labs/orm-runtime";
import { createMongooseDriver } from "../src";
import type { MongooseModelLike } from "../src";
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
  type RuntimeOrm,
} from "./support/auth";

const LOCAL_TIMEOUT_MS = 15_000;

function formatLocalDbError(error: unknown, uri: string) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `MongoDB local integration test could not connect. Make sure a local MongoDB server is running and reachable via FARM_ORM_LOCAL_MONGODB_URL (current default: ${uri}).\nOriginal error: ${message}`,
  );
}

function asModelLike(model: mongoose.Model<any>) {
  return model as unknown as MongooseModelLike;
}

async function closeLocalConnection(connection: mongoose.Connection) {
  try {
    await connection.dropDatabase();
  } finally {
    await connection.close().catch(() => undefined);
  }
}

async function createLocalConnection() {
  const baseUri = process.env.FARM_ORM_LOCAL_MONGODB_URL ?? "mongodb://127.0.0.1:27017";
  const connection = mongoose.createConnection(baseUri, {
    dbName: createIsolatedName("farm_orm_mongo"),
    serverSelectionTimeoutMS: 2_500,
    connectTimeoutMS: 2_500,
  });

  try {
    await connection.asPromise();
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw formatLocalDbError(error, baseUri);
  }

  return connection;
}

function registerModels(connection: mongoose.Connection, includeSchemaIndexes: boolean) {
  const userSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      email_verified: { type: Boolean, default: false },
      login_count: { type: Number, default: 0 },
      tier: { type: String, enum: ["free", "pro", "enterprise"], default: "free" },
      quota_bigint: { type: BigInt, default: 0n },
      created_at: { type: Date, default: Date.now },
      updated_at: { type: Date, default: Date.now },
    },
    { versionKey: false },
  );

  const profileSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true, unique: true },
      bio: { type: String, default: null },
    },
    { versionKey: false },
  );

  const sessionSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true },
      token: { type: String, required: true, unique: true },
      expires_at: { type: Date, required: true },
    },
    { versionKey: false },
  );
  if (includeSchemaIndexes) {
    sessionSchema.index({ user_id: 1, expires_at: 1 });
  }

  const accountSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true },
      provider: { type: String, required: true },
      account_id: { type: String, required: true },
      plan_tier: { type: String, enum: ["oss", "pro", "enterprise"], default: "oss" },
      balance: {
        type: mongoose.Schema.Types.Decimal128,
        default: () => mongoose.Types.Decimal128.fromString("0.00"),
      },
      metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { versionKey: false },
  );
  if (includeSchemaIndexes) {
    accountSchema.index({ provider: 1, account_id: 1 }, { unique: true });
    accountSchema.index({ user_id: 1, provider: 1 });
  }

  const organizationSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      name: { type: String, required: true, unique: true },
      slug: { type: String, required: true, unique: true },
    },
    { versionKey: false },
  );

  const memberSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true },
      organization_id: { type: String, required: true },
      role: { type: String, required: true },
    },
    { versionKey: false },
  );
  if (includeSchemaIndexes) {
    memberSchema.index({ user_id: 1, organization_id: 1 }, { unique: true });
    memberSchema.index({ organization_id: 1, role: 1 });
  }

  const UserModel = connection.model("User", userSchema, "users");
  const ProfileModel = connection.model("Profile", profileSchema, "profiles");
  const SessionModel = connection.model("Session", sessionSchema, "sessions");
  const AccountModel = connection.model("Account", accountSchema, "accounts");
  const OrganizationModel = connection.model("Organization", organizationSchema, "organizations");
  const MemberModel = connection.model("Member", memberSchema, "members");

  return {
    user: asModelLike(UserModel),
    profile: asModelLike(ProfileModel),
    session: asModelLike(SessionModel),
    account: asModelLike(AccountModel),
    organization: asModelLike(OrganizationModel),
    member: asModelLike(MemberModel),
  } satisfies Record<string, MongooseModelLike>;
}

async function createLocalMongooseOrm() {
  const connection = await createLocalConnection();
  const models = registerModels(connection, true);
  await Promise.all([
    connection.models.User.init(),
    connection.models.Profile.init(),
    connection.models.Session.init(),
    connection.models.Account.init(),
    connection.models.Organization.init(),
    connection.models.Member.init(),
  ]);

  return {
    orm: createOrm({
      schema,
      driver: createMongooseDriver<typeof schema>({
        models: models as Record<keyof typeof schema.models, MongooseModelLike>,
        transforms: {
          account: {
            balance: {
              encode(value) {
                if (value === undefined || value === null) return value;
                return mongoose.Types.Decimal128.fromString(
                  typeof value === "string" ? value : String(value),
                );
              },
              decode(value) {
                if (value === undefined || value === null) return value;
                const next = typeof value === "string" ? value : String(value);
                return next.includes(".")
                  ? next.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "")
                  : next;
              },
            },
          },
        },
        connection,
      }),
    }),
    connection,
    close: async () => {
      await closeLocalConnection(connection);
    },
  } satisfies {
    orm: RuntimeOrm;
    connection: typeof connection;
    close: () => Promise<void>;
  };
}

async function withLocalOrm<TResult>(run: (orm: RuntimeOrm) => Promise<TResult>) {
  const { orm, close } = await createLocalMongooseOrm();

  try {
    return await run(orm);
  } finally {
    await close();
  }
}

describe("mongoose local integration", () => {
  it(
    "pushes and bootstraps collections and indexes from a live Mongoose connection",
    async () => {
      const connection = await createLocalConnection();
      registerModels(connection, false);

      try {
        await pushSchema({
          schema,
          client: connection,
        });

        const orm = (await bootstrapDatabase({
          schema,
          client: connection,
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

        const accountIndexes = await connection.collection("accounts").indexes();

        expect(created).toEqual({
          id: expect.any(String),
          email: "runtime@farminglabs.dev",
        });
        expect(
          accountIndexes.some((index) => index.name === "accounts_provider_account_id_unique"),
        ).toBe(true);
      } finally {
        await closeLocalConnection(connection);
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "exposes the live Mongoose connection on orm.$driver",
    async () => {
      const { orm, connection, close } = await createLocalMongooseOrm();

      try {
        expect(orm.$driver.kind).toBe("mongoose");
        expect((orm.$driver.client as { connection?: unknown }).connection).toBe(connection);
        expect(detectDatabaseRuntime(connection)).toEqual({
          kind: "mongoose",
          client: connection,
          source: "connection",
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
    "creates an ORM directly from a live Mongoose connection",
    async () => {
      const { connection, close } = await createLocalMongooseOrm();

      try {
        const orm = createOrmFromRuntime({
          schema,
          client: connection,
        }) as RuntimeOrm;

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

        expect(orm.$driver.kind).toBe("mongoose");
        expect((orm.$driver.client as { connection?: unknown }).connection).toBe(connection);
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

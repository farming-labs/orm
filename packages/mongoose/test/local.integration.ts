import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { createOrm } from "@farming-labs/orm";
import { createMongooseDriver } from "../src";
import type { MongooseModelLike } from "../src";
import {
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

async function createLocalMongooseOrm() {
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

  const userSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      email_verified: { type: Boolean, default: false },
      login_count: { type: Number, default: 0 },
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
  sessionSchema.index({ user_id: 1, expires_at: 1 });

  const accountSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true },
      provider: { type: String, required: true },
      account_id: { type: String, required: true },
      metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { versionKey: false },
  );
  accountSchema.index({ provider: 1, account_id: 1 }, { unique: true });
  accountSchema.index({ user_id: 1, provider: 1 });

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
  memberSchema.index({ user_id: 1, organization_id: 1 }, { unique: true });
  memberSchema.index({ organization_id: 1, role: 1 });

  const UserModel = connection.model("User", userSchema, "users");
  const ProfileModel = connection.model("Profile", profileSchema, "profiles");
  const SessionModel = connection.model("Session", sessionSchema, "sessions");
  const AccountModel = connection.model("Account", accountSchema, "accounts");
  const OrganizationModel = connection.model("Organization", organizationSchema, "organizations");
  const MemberModel = connection.model("Member", memberSchema, "members");
  await Promise.all([
    UserModel.init(),
    ProfileModel.init(),
    SessionModel.init(),
    AccountModel.init(),
    OrganizationModel.init(),
    MemberModel.init(),
  ]);

  return {
    orm: createOrm({
      schema,
      driver: createMongooseDriver<typeof schema>({
        models: {
          user: asModelLike(UserModel),
          profile: asModelLike(ProfileModel),
          session: asModelLike(SessionModel),
          account: asModelLike(AccountModel),
          organization: asModelLike(OrganizationModel),
          member: asModelLike(MemberModel),
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
    "exposes the live Mongoose connection on orm.$driver",
    async () => {
      const { orm, connection, close } = await createLocalMongooseOrm();

      try {
        expect(orm.$driver.kind).toBe("mongoose");
        expect((orm.$driver.client as { connection?: unknown }).connection).toBe(connection);
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
    "enforces model-level constraints against a real local MongoDB instance",
    async () => {
      await withLocalOrm((orm) => assertModelLevelConstraints(orm, expect));
    },
    LOCAL_TIMEOUT_MS,
  );
});

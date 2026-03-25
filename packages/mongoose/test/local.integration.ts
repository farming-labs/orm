import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { createOrm } from "@farming-labs/orm";
import { createMongooseDriver } from "../src";
import type { MongooseModelLike } from "../src";
import {
  assertBelongsToAndManyToManyQueries,
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

  const UserModel = connection.model("User", userSchema, "users");
  const ProfileModel = connection.model("Profile", profileSchema, "profiles");
  const SessionModel = connection.model("Session", sessionSchema, "sessions");
  const OrganizationModel = connection.model("Organization", organizationSchema, "organizations");
  const MemberModel = connection.model("Member", memberSchema, "members");

  return {
    orm: createOrm({
      schema,
      driver: createMongooseDriver<typeof schema>({
        models: {
          user: asModelLike(UserModel),
          profile: asModelLike(ProfileModel),
          session: asModelLike(SessionModel),
          organization: asModelLike(OrganizationModel),
          member: asModelLike(MemberModel),
        },
        connection,
      }),
    }),
    close: async () => {
      await closeLocalConnection(connection);
    },
  } satisfies {
    orm: RuntimeOrm;
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
});

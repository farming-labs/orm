import mongoose from "mongoose";
import { createOrm } from "@farming-labs/orm";
import { createMongooseDriver, type MongooseModelLike } from "@farming-labs/orm-mongoose";
import type { AuthOrm } from "../../auth-store";
import { authSchema } from "../../schema";
import { mongoBaseUrl } from "../shared/config";
import type { DemoRuntimeHandle } from "../shared/types";
import {
  assignMongoDatabase,
  createIsolatedName,
  formatLocalRuntimeError,
  toDirectCheck,
} from "../shared/utils";

function asMongooseModelLike(model: mongoose.Model<any>) {
  return model as unknown as MongooseModelLike;
}

async function closeMongooseConnection(connection: mongoose.Connection) {
  try {
    await connection.dropDatabase();
  } finally {
    await connection.close().catch(() => undefined);
  }
}

export async function createMongooseRuntime(): Promise<DemoRuntimeHandle> {
  const databaseUrl = assignMongoDatabase(mongoBaseUrl, createIsolatedName("farm_orm_demo_mongo"));
  const connection = mongoose.createConnection(databaseUrl, {
    serverSelectionTimeoutMS: 2_500,
    connectTimeoutMS: 2_500,
  });

  try {
    await connection.asPromise();
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw formatLocalRuntimeError(
      "MongoDB",
      error,
      `Set FARM_ORM_DEMO_MONGODB_URL or FARM_ORM_LOCAL_MONGODB_URL if your local MongoDB URL is not ${mongoBaseUrl}.`,
    );
  }

  const userSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      email_address: { type: String, required: true, unique: true },
      emailVerified: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    },
    { versionKey: false },
  );

  const profileSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true, unique: true },
      bio: { type: String, default: null },
    },
    { versionKey: false },
  );

  const sessionSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      token: { type: String, required: true, unique: true },
      expiresAt: { type: Date, required: true },
    },
    { versionKey: false },
  );

  const accountSchema = new mongoose.Schema(
    {
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      provider: { type: String, required: true },
      accountId: { type: String, required: true },
    },
    { versionKey: false },
  );

  const UserModel = connection.model("DemoUser", userSchema, "users");
  const ProfileModel = connection.model("DemoProfile", profileSchema, "profiles");
  const SessionModel = connection.model("DemoSession", sessionSchema, "sessions");
  const AccountModel = connection.model("DemoAccount", accountSchema, "accounts");

  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createMongooseDriver<typeof authSchema>({
      models: {
        user: asMongooseModelLike(UserModel),
        profile: asMongooseModelLike(ProfileModel),
        session: asMongooseModelLike(SessionModel),
        account: asMongooseModelLike(AccountModel),
      },
    }),
  });

  return {
    name: "mongoose",
    label: "MongoDB runtime",
    client: "Mongoose models",
    orm,
    directCheck: async (userId) => {
      const row = await UserModel.findOne({
        id: userId,
      })
        .lean()
        .exec();

      return toDirectCheck(row as { id?: string; email_address?: string } | null | undefined);
    },
    close: async () => {
      await closeMongooseConnection(connection);
    },
  };
}

import { MongoClient } from "mongodb";
import { createOrm } from "@farming-labs/orm";
import { createMongoDriver } from "@farming-labs/orm-mongo";
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

async function closeMongoClient(client: MongoClient, databaseName: string) {
  try {
    await client.db(databaseName).dropDatabase();
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function createMongoRuntime(): Promise<DemoRuntimeHandle> {
  const databaseName = createIsolatedName("farm_orm_demo_mongo_native");
  const databaseUrl = assignMongoDatabase(mongoBaseUrl, databaseName);
  const client = new MongoClient(databaseUrl, {
    serverSelectionTimeoutMS: 2_500,
    connectTimeoutMS: 2_500,
  });

  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => undefined);
    throw formatLocalRuntimeError(
      "MongoDB",
      error,
      `Set FARM_ORM_DEMO_MONGODB_URL or FARM_ORM_LOCAL_MONGODB_URL if your local MongoDB URL is not ${mongoBaseUrl}.`,
    );
  }

  const db = client.db();
  const orm: AuthOrm = createOrm({
    schema: authSchema,
    driver: createMongoDriver<typeof authSchema>({
      db,
    }),
  });

  return {
    name: "mongo",
    label: "MongoDB runtime (native)",
    client: "mongodb MongoClient",
    orm,
    directCheck: async (userId) => {
      const row = await db.collection("users").findOne(
        { id: userId },
        {
          projection: {
            id: 1,
            email_address: 1,
          },
        },
      );

      return toDirectCheck(row as { id?: string; email_address?: string } | null | undefined);
    },
    close: async () => {
      await closeMongoClient(client, databaseName);
    },
  };
}

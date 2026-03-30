import {
  createOrm,
  type OrmClient,
  type OrmDriver,
  type SchemaDefinition,
} from "@farming-labs/orm";
import type { DrizzleDialect, DrizzleDriverConfig } from "@farming-labs/orm-drizzle";
import type { FirestoreDriverConfig } from "@farming-labs/orm-firestore";
import type { KyselyDialect, KyselyDriverConfig } from "@farming-labs/orm-kysely";
import type { MongoDriverConfig } from "@farming-labs/orm-mongo";
import type { MongooseDriverConfig } from "@farming-labs/orm-mongoose";
import type { PrismaDriverConfig } from "@farming-labs/orm-prisma";
import type { SequelizeDriverConfig, SequelizeDriverDialect } from "@farming-labs/orm-sequelize";
import type {
  MysqlConnectionLike,
  MysqlPoolLike,
  PgClientLike,
  PgPoolLike,
  SqliteDatabaseLike,
} from "@farming-labs/orm-sql";
import type { TypeormDriverConfig } from "@farming-labs/orm-typeorm";
import {
  inferMongooseModels,
  resolveDialect,
  resolveFirestoreDb,
  resolveMongoDb,
  resolveMongoSessionSource,
  resolveRuntime,
  type AutoDriverHandle,
  type CreateDriverFromRuntimeOptions,
  type CreateOrmFromRuntimeOptions,
  type MongooseConnectionLike,
} from "./shared";

async function createSqlDriverFromRuntime<TSchema extends SchemaDefinition<any>>(
  runtime: Awaited<ReturnType<typeof resolveRuntime>>,
  dialect: ReturnType<typeof resolveDialect>,
) {
  const { createMysqlDriver, createPgClientDriver, createPgPoolDriver, createSqliteDriver } =
    await import("@farming-labs/orm-sql");

  if (dialect === "sqlite") {
    return createSqliteDriver<TSchema>(runtime.client as SqliteDatabaseLike);
  }

  if (dialect === "postgres") {
    if (runtime.source === "pool") {
      return createPgPoolDriver<TSchema>(runtime.client as PgPoolLike);
    }

    return createPgClientDriver<TSchema>(runtime.client as PgClientLike);
  }

  if (runtime.source === "pool") {
    return createMysqlDriver<TSchema>(runtime.client as MysqlPoolLike);
  }

  return createMysqlDriver<TSchema>(runtime.client as MysqlConnectionLike);
}

export async function createDriverFromRuntime<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
>(
  options: CreateDriverFromRuntimeOptions<TSchema, TClient>,
): Promise<OrmDriver<TSchema, AutoDriverHandle<TClient>>> {
  const runtime = resolveRuntime(options);

  switch (runtime.kind) {
    case "prisma": {
      const { createPrismaDriver } = await import("@farming-labs/orm-prisma");
      return createPrismaDriver<TSchema>({
        client: runtime.client as PrismaDriverConfig<TSchema>["client"],
        models: options.prisma?.models,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "drizzle": {
      const { createDrizzleDriver } = await import("@farming-labs/orm-drizzle");
      return createDrizzleDriver<TSchema>({
        db: runtime.client as DrizzleDriverConfig<TSchema>["db"],
        client: options.drizzle?.client,
        dialect: resolveDialect(runtime, options.dialect) as DrizzleDialect,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "kysely": {
      const { createKyselyDriver } = await import("@farming-labs/orm-kysely");
      return createKyselyDriver<TSchema>({
        db: runtime.client as KyselyDriverConfig<TSchema>["db"],
        dialect: resolveDialect(runtime, options.dialect) as KyselyDialect,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "firestore": {
      const { createFirestoreDriver } = await import("@farming-labs/orm-firestore");
      return createFirestoreDriver<TSchema>({
        db: resolveFirestoreDb(runtime, options),
        collections: options.firestore?.collections,
        transforms: options.firestore?.transforms as FirestoreDriverConfig<TSchema>["transforms"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "sequelize": {
      const { createSequelizeDriver } = await import("@farming-labs/orm-sequelize");
      return createSequelizeDriver<TSchema>({
        sequelize: runtime.client as SequelizeDriverConfig<TSchema>["sequelize"],
        dialect: resolveDialect(runtime, options.dialect) as SequelizeDriverDialect,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "typeorm": {
      const { createTypeormDriver } = await import("@farming-labs/orm-typeorm");
      return createTypeormDriver<TSchema>({
        dataSource: runtime.client as TypeormDriverConfig<TSchema>["dataSource"],
        dialect: resolveDialect(runtime, options.dialect),
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "sql":
      return (await createSqlDriverFromRuntime<TSchema>(
        runtime,
        resolveDialect(runtime, options.dialect),
      )) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    case "mongo": {
      const { createMongoDriver } = await import("@farming-labs/orm-mongo");
      const db = resolveMongoDb(runtime, options);
      const sessionSource = resolveMongoSessionSource(runtime, db, options);

      return createMongoDriver<TSchema>({
        collections: options.mongo?.collections,
        db,
        client: sessionSource.client,
        startSession: sessionSource.startSession,
        transforms: options.mongo?.transforms as MongoDriverConfig<TSchema>["transforms"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "mongoose": {
      const { createMongooseDriver } = await import("@farming-labs/orm-mongoose");
      const connection = runtime.client as MongooseConnectionLike;

      return createMongooseDriver<TSchema>({
        models: options.mongoose?.models ?? inferMongooseModels(options.schema, connection),
        connection,
        startSession: options.mongoose?.startSession,
        transforms: options.mongoose?.transforms as MongooseDriverConfig<TSchema>["transforms"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
  }
}

export async function createOrmFromRuntime<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
>(
  options: CreateOrmFromRuntimeOptions<TSchema, TClient>,
): Promise<OrmClient<TSchema, AutoDriverHandle<TClient>>> {
  const driver = await createDriverFromRuntime(options);
  return createOrm({
    schema: options.schema,
    driver,
  }) as OrmClient<TSchema, AutoDriverHandle<TClient>>;
}

export type {
  AutoDialect,
  AutoDriverHandle,
  CreateDriverFromRuntimeOptions,
  CreateOrmFromRuntimeOptions,
  MongooseConnectionLike,
} from "./shared";

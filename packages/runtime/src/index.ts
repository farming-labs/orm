import {
  createOrm,
  type OrmClient,
  type OrmDriver,
  type SchemaDefinition,
} from "@farming-labs/orm";
import type { DrizzleDialect, DrizzleDriverConfig } from "@farming-labs/orm-drizzle";
import type { D1DriverConfig } from "@farming-labs/orm-d1";
import type { DynamoDbDriverConfig } from "@farming-labs/orm-dynamodb";
import type { EdgeDbDriverConfig } from "@farming-labs/orm-edgedb";
import type { FirestoreDriverConfig } from "@farming-labs/orm-firestore";
import type { KvDriverConfig } from "@farming-labs/orm-kv";
import type { KyselyDialect, KyselyDriverConfig } from "@farming-labs/orm-kysely";
import type { MikroormDriverConfig, MikroormDriverDialect } from "@farming-labs/orm-mikroorm";
import type { MongoDriverConfig } from "@farming-labs/orm-mongo";
import type { MongooseDriverConfig } from "@farming-labs/orm-mongoose";
import type { PrismaDriverConfig } from "@farming-labs/orm-prisma";
import type { RedisDriverConfig } from "@farming-labs/orm-redis";
import type { SupabaseDriverConfig } from "@farming-labs/orm-supabase";
import type { SequelizeDriverConfig, SequelizeDriverDialect } from "@farming-labs/orm-sequelize";
import type {
  MysqlConnectionLike,
  MysqlPoolLike,
  PgClientLike,
  PgPoolLike,
  SqliteDatabaseLike,
} from "@farming-labs/orm-sql";
import type { TypeormDriverConfig } from "@farming-labs/orm-typeorm";
import type { UnstorageDriverConfig } from "@farming-labs/orm-unstorage";
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
    case "edgedb": {
      const { createEdgeDbDriver } = await import("@farming-labs/orm-edgedb");
      return createEdgeDbDriver<TSchema>({
        client: runtime.client as EdgeDbDriverConfig<TSchema>["client"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "d1": {
      const { createD1Driver } = await import("@farming-labs/orm-d1");
      return createD1Driver<TSchema>({
        client: runtime.client as D1DriverConfig<TSchema>["client"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "mikroorm": {
      const { createMikroormDriver } = await import("@farming-labs/orm-mikroorm");
      return createMikroormDriver<TSchema>({
        orm: runtime.client as MikroormDriverConfig<TSchema>["orm"],
        dialect: resolveDialect(runtime, options.dialect) as MikroormDriverDialect,
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
    case "kv": {
      const { createKvDriver } = await import("@farming-labs/orm-kv");
      return createKvDriver<TSchema>({
        client: runtime.client as KvDriverConfig<TSchema>["client"],
        base: options.kv?.base,
        prefixes: options.kv?.prefixes,
        transforms: options.kv?.transforms as KvDriverConfig<TSchema>["transforms"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "dynamodb": {
      const { createDynamodbDriver } = await import("@farming-labs/orm-dynamodb");
      return createDynamodbDriver<TSchema>({
        client: runtime.client as DynamoDbDriverConfig<TSchema>["client"],
        documentClient: options.dynamodb?.documentClient,
        tables: options.dynamodb?.tables,
        transforms: options.dynamodb?.transforms as DynamoDbDriverConfig<TSchema>["transforms"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "unstorage": {
      const { createUnstorageDriver } = await import("@farming-labs/orm-unstorage");
      return createUnstorageDriver<TSchema>({
        storage: runtime.client as UnstorageDriverConfig<TSchema>["storage"],
        base: options.unstorage?.base,
        prefixes: options.unstorage?.prefixes,
        transforms: options.unstorage?.transforms as UnstorageDriverConfig<TSchema>["transforms"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "redis": {
      const { createRedisDriver } = await import("@farming-labs/orm-redis");
      return createRedisDriver<TSchema>({
        client: runtime.client as RedisDriverConfig<TSchema>["client"],
        base: options.redis?.base,
        prefixes: options.redis?.prefixes,
        transforms: options.redis?.transforms as RedisDriverConfig<TSchema>["transforms"],
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "supabase": {
      const { createSupabaseDriver } = await import("@farming-labs/orm-supabase");
      return createSupabaseDriver<TSchema>({
        client: runtime.client as SupabaseDriverConfig<TSchema>["client"],
        transforms: options.supabase?.transforms as SupabaseDriverConfig<TSchema>["transforms"],
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

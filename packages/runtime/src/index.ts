import {
  createManifest,
  createOrm,
  requireDatabaseRuntime,
  type DetectedDatabaseDialect,
  type DetectedDatabaseRuntime,
  type ModelName,
  type OrmClient,
  type OrmDriver,
  type OrmDriverHandle,
  type SchemaDefinition,
} from "@farming-labs/orm";
import {
  createDrizzleDriver,
  type DrizzleDialect,
  type DrizzleDriverConfig,
} from "@farming-labs/orm-drizzle";
import {
  createKyselyDriver,
  type KyselyDialect,
  type KyselyDriverConfig,
} from "@farming-labs/orm-kysely";
import {
  createMongoDriver,
  type MongoCollectionMap,
  type MongoDbLike,
  type MongoDriverConfig,
  type MongoSessionLike,
  type MongoSessionSourceLike,
} from "@farming-labs/orm-mongo";
import {
  createMongooseDriver,
  type MongooseDriverConfig,
  type MongooseFieldTransform,
  type MongooseModelLike,
  type MongooseSessionLike,
  type MongooseSessionSourceLike,
} from "@farming-labs/orm-mongoose";
import {
  createPrismaDriver,
  type PrismaDriverConfig,
  type PrismaDriverHandle,
} from "@farming-labs/orm-prisma";
import {
  createMysqlDriver,
  createPgClientDriver,
  createPgPoolDriver,
  createSqliteDriver,
  type MysqlConnectionLike,
  type MysqlPoolLike,
  type PgClientLike,
  type PgPoolLike,
  type SqlDriverHandle,
  type SqliteDatabaseLike,
} from "@farming-labs/orm-sql";

type AutoDialect = DetectedDatabaseDialect;

type AutoDriverHandle<TClient = unknown> =
  | PrismaDriverHandle
  | SqlDriverHandle<TClient, AutoDialect>
  | OrmDriverHandle<"drizzle", TClient, DrizzleDialect>
  | OrmDriverHandle<"kysely", TClient, KyselyDialect>
  | OrmDriverHandle<"mongo", unknown>
  | OrmDriverHandle<"mongoose", unknown>;

type CreateDriverFromRuntimeOptions<TSchema extends SchemaDefinition<any>, TClient = unknown> = {
  schema: TSchema;
  client?: TClient;
  runtime?: DetectedDatabaseRuntime<TClient>;
  dialect?: AutoDialect;
  databaseName?: string;
  prisma?: Pick<PrismaDriverConfig<TSchema>, "models">;
  drizzle?: Pick<DrizzleDriverConfig<TSchema>, "client">;
  mongo?: {
    collections?: MongoCollectionMap<TSchema>;
    db?: MongoDbLike;
    transforms?: MongoDriverConfig<TSchema>["transforms"];
    startSession?: () => Promise<MongoSessionLike>;
  };
  mongoose?: {
    models?: Record<ModelName<TSchema>, MongooseModelLike>;
    transforms?: Partial<Record<string, Partial<Record<string, MongooseFieldTransform>>>>;
    startSession?: () => Promise<MongooseSessionLike>;
  };
};

type CreateOrmFromRuntimeOptions<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
> = CreateDriverFromRuntimeOptions<TSchema, TClient>;

type MongooseConnectionLike = MongooseSessionSourceLike & {
  models?: Record<string, MongooseModelLike & { collection?: { collectionName?: string } }>;
};

type MongoClientLike = MongoSessionSourceLike & {
  db(name?: string): MongoDbLike;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function hasFunction<TName extends string>(
  value: unknown,
  name: TName,
): value is Record<TName, (...args: any[]) => unknown> {
  return isRecord(value) && typeof value[name] === "function";
}

function resolveRuntime<TClient>(
  options: CreateDriverFromRuntimeOptions<any, TClient>,
): DetectedDatabaseRuntime<TClient> {
  if (options.runtime) {
    return options.runtime;
  }

  if (options.client === undefined) {
    throw new Error(
      'createDriverFromRuntime() requires either a detected "runtime" or a raw "client".',
    );
  }

  return requireDatabaseRuntime(options.client);
}

function resolveDialect(
  runtime: DetectedDatabaseRuntime<any>,
  override?: AutoDialect,
): AutoDialect {
  const dialect = override ?? runtime.dialect;
  if (!dialect) {
    throw new Error(
      `Could not determine the database dialect for the detected ${runtime.kind} runtime. Pass a "dialect" option explicitly.`,
    );
  }
  return dialect;
}

function inferMongooseModels<TSchema extends SchemaDefinition<any>>(
  schema: TSchema,
  connection: MongooseConnectionLike,
) {
  const manifest = createManifest(schema);
  const registeredModels = Object.values(connection.models ?? {});
  const models = {} as Record<ModelName<TSchema>, MongooseModelLike>;

  for (const modelName of Object.keys(schema.models) as Array<ModelName<TSchema>>) {
    const expectedTable = manifest.models[modelName].table;
    const inferredModel =
      registeredModels.find(
        (candidate) => candidate.collection?.collectionName === expectedTable,
      ) ?? connection.models?.[String(modelName)];

    if (!inferredModel) {
      throw new Error(
        `Could not infer a Mongoose model for schema model "${String(modelName)}". Register a model for collection "${expectedTable}" or pass mongoose.models explicitly.`,
      );
    }

    models[modelName] = inferredModel;
  }

  return models;
}

function resolveMongoDb(
  runtime: DetectedDatabaseRuntime<any>,
  options: CreateDriverFromRuntimeOptions<any>,
) {
  if (options.mongo?.db) {
    return options.mongo.db;
  }

  if (runtime.source === "db") {
    return runtime.client as MongoDbLike;
  }

  const databaseName = options.databaseName;
  if (!databaseName) {
    throw new Error(
      'MongoClient auto-creation requires a "databaseName" option so the helper can resolve the target database.',
    );
  }

  return (runtime.client as MongoClientLike).db(databaseName);
}

function resolveMongoSessionSource(
  runtime: DetectedDatabaseRuntime<any>,
  db: MongoDbLike,
  options: CreateDriverFromRuntimeOptions<any>,
) {
  if (options.mongo?.startSession) {
    return {
      client: undefined,
      startSession: options.mongo.startSession,
    };
  }

  if (runtime.source === "client" && hasFunction(runtime.client, "startSession")) {
    return {
      client: runtime.client as MongoSessionSourceLike,
      startSession: undefined,
    };
  }

  const dbClient = isRecord(db) ? (db as Record<string, unknown>)["client"] : undefined;
  if (hasFunction(dbClient, "startSession")) {
    return {
      client: dbClient as MongoSessionSourceLike,
      startSession: undefined,
    };
  }

  return {
    client: undefined,
    startSession: undefined,
  };
}

function createSqlDriverFromRuntime<TSchema extends SchemaDefinition<any>>(
  runtime: DetectedDatabaseRuntime<any>,
  dialect: AutoDialect,
) {
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

export function createDriverFromRuntime<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: CreateDriverFromRuntimeOptions<TSchema, TClient>,
): OrmDriver<TSchema, AutoDriverHandle<TClient>> {
  const runtime = resolveRuntime(options);

  switch (runtime.kind) {
    case "prisma":
      return createPrismaDriver<TSchema>({
        client: runtime.client as PrismaDriverConfig<TSchema>["client"],
        models: options.prisma?.models,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    case "drizzle":
      return createDrizzleDriver<TSchema>({
        db: runtime.client as DrizzleDriverConfig<TSchema>["db"],
        client: options.drizzle?.client,
        dialect: resolveDialect(runtime, options.dialect) as DrizzleDialect,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    case "kysely":
      return createKyselyDriver<TSchema>({
        db: runtime.client as KyselyDriverConfig<TSchema>["db"],
        dialect: resolveDialect(runtime, options.dialect) as KyselyDialect,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    case "sql":
      return createSqlDriverFromRuntime<TSchema>(
        runtime,
        resolveDialect(runtime, options.dialect),
      ) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    case "mongo": {
      const db = resolveMongoDb(runtime, options);
      const sessionSource = resolveMongoSessionSource(runtime, db, options);

      return createMongoDriver<TSchema>({
        collections: options.mongo?.collections,
        db,
        client: sessionSource.client,
        startSession: sessionSource.startSession,
        transforms: options.mongo?.transforms,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
    case "mongoose": {
      const connection = runtime.client as MongooseConnectionLike;
      return createMongooseDriver<TSchema>({
        models: options.mongoose?.models ?? inferMongooseModels(options.schema, connection),
        connection,
        startSession: options.mongoose?.startSession,
        transforms: options.mongoose?.transforms,
      }) as OrmDriver<TSchema, AutoDriverHandle<TClient>>;
    }
  }
}

export function createOrmFromRuntime<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: CreateOrmFromRuntimeOptions<TSchema, TClient>,
): OrmClient<TSchema, AutoDriverHandle<TClient>> {
  const driver = createDriverFromRuntime(options);
  return createOrm({
    schema: options.schema,
    driver,
  }) as OrmClient<TSchema, AutoDriverHandle<TClient>>;
}

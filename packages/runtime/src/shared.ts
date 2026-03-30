import { createManifest, requireDatabaseRuntime } from "@farming-labs/orm";
import type {
  DetectedDatabaseDialect,
  DetectedDatabaseRuntime,
  ModelName,
  OrmDriverHandle,
  SchemaDefinition,
} from "@farming-labs/orm";
import type { DrizzleDialect, DrizzleDriverConfig } from "@farming-labs/orm-drizzle";
import type {
  FirestoreDbLike,
  FirestoreDriverConfig,
  FirestoreDriverHandle,
} from "@farming-labs/orm-firestore";
import type {
  MongoCollectionMap,
  MongoDbLike,
  MongoDriverConfig,
  MongoSessionLike,
  MongoSessionSourceLike,
} from "@farming-labs/orm-mongo";
import type {
  MongooseFieldTransform,
  MongooseModelLike,
  MongooseSessionLike,
  MongooseSessionSourceLike,
} from "@farming-labs/orm-mongoose";
import type { KyselyDialect } from "@farming-labs/orm-kysely";
import type { PrismaDriverConfig, PrismaDriverHandle } from "@farming-labs/orm-prisma";
import type { SqlDriverHandle } from "@farming-labs/orm-sql";
import type { TypeormDriverHandle } from "@farming-labs/orm-typeorm";

export type AutoDialect = DetectedDatabaseDialect;

export type AutoDriverHandle<TClient = unknown> =
  | PrismaDriverHandle
  | SqlDriverHandle<TClient, AutoDialect>
  | OrmDriverHandle<"drizzle", TClient, DrizzleDialect>
  | FirestoreDriverHandle<any>
  | OrmDriverHandle<"kysely", TClient, KyselyDialect>
  | OrmDriverHandle<"mongo", unknown>
  | OrmDriverHandle<"mongoose", unknown>
  | TypeormDriverHandle<TClient, AutoDialect>;

export type CreateDriverFromRuntimeOptions<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
> = {
  schema: TSchema;
  client?: TClient;
  runtime?: DetectedDatabaseRuntime<TClient>;
  dialect?: AutoDialect;
  databaseName?: string;
  prisma?: Pick<PrismaDriverConfig<TSchema>, "models"> & {
    databaseUrl?: string;
    packageRoot?: string;
  };
  drizzle?: Pick<DrizzleDriverConfig<TSchema>, "client">;
  firestore?: {
    db?: FirestoreDbLike;
    collections?: FirestoreDriverConfig<TSchema>["collections"];
    transforms?: FirestoreDriverConfig<TSchema>["transforms"];
  };
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

export type CreateOrmFromRuntimeOptions<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
> = CreateDriverFromRuntimeOptions<TSchema, TClient>;

export type MongooseConnectionLike = MongooseSessionSourceLike & {
  models?: Record<string, MongooseModelLike & { collection?: { collectionName?: string } }>;
};

type MongoClientLike = MongoSessionSourceLike & {
  db(name?: string): MongoDbLike;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function resolveFirestoreDb(
  runtime: DetectedDatabaseRuntime<any>,
  options: CreateDriverFromRuntimeOptions<any>,
) {
  return (options.firestore?.db ?? runtime.client) as FirestoreDbLike;
}

export function hasFunction<TName extends string>(
  value: unknown,
  name: TName,
): value is Record<TName, (...args: any[]) => unknown> {
  return isRecord(value) && typeof value[name] === "function";
}

export function resolveRuntime<TClient>(
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

export function resolveDialect(
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

export function inferMongooseModels<TSchema extends SchemaDefinition<any>>(
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

export function resolveMongoDb(
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

export function resolveMongoSessionSource(
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

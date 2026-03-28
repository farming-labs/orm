import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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
  renderPrismaSchema,
  renderSafeSql,
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

type PrismaProvider = "sqlite" | "postgresql" | "mysql";

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
  prisma?: Pick<PrismaDriverConfig<TSchema>, "models"> & {
    databaseUrl?: string;
    packageRoot?: string;
  };
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

export type PushSchemaOptions<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
> = CreateDriverFromRuntimeOptions<TSchema, TClient>;

export type ApplySchemaOptions<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
> = CreateDriverFromRuntimeOptions<TSchema, TClient>;

export type BootstrapDatabaseOptions<
  TSchema extends SchemaDefinition<any>,
  TClient = unknown,
> = CreateOrmFromRuntimeOptions<TSchema, TClient>;

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

type SqlQueryClient = {
  query(sql: string, params?: readonly unknown[]): Promise<unknown> | unknown;
};

type SqlExecuteClient = {
  execute(sql: string, params?: readonly unknown[]): Promise<unknown> | unknown;
};

type SqliteExecClient = {
  exec(sql: string): Promise<unknown> | unknown;
};

type KyselyExecuteClient = {
  executeQuery(query: {
    sql: string;
    parameters: readonly unknown[];
    query: {
      kind: "RawNode";
      sqlFragments: readonly string[];
      parameters: readonly unknown[];
    };
    queryId: object;
  }): Promise<unknown>;
};

type MongoIndexCollectionLike = {
  createIndex(
    keys: Record<string, 1 | -1>,
    options?: { unique?: boolean; name?: string },
  ): Promise<unknown>;
};

type MongoSchemaTargetLike = {
  collection(name: string): MongoIndexCollectionLike;
  createCollection?(name: string): Promise<unknown>;
};

const execFileAsync = promisify(execFile);
const defaultPrismaPackageRoot = process.cwd();

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

function prismaProviderForDialect(dialect: AutoDialect): PrismaProvider {
  switch (dialect) {
    case "sqlite":
      return "sqlite";
    case "postgres":
      return "postgresql";
    case "mysql":
      return "mysql";
  }
}

function withDatabaseEnv(rendered: string) {
  return rendered.replace(/url\s+=\s+.+/, `url      = env("DATABASE_URL")`);
}

function renderRuntimePrismaSchema(schema: SchemaDefinition<any>, provider: PrismaProvider) {
  return withDatabaseEnv(renderPrismaSchema(schema, { provider }));
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    const next = sql[index + 1];

    current += char;

    if (quote === "'") {
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
        continue;
      }

      if (char === "\\" && next === "'") {
        current += next;
        index += 1;
        continue;
      }

      if (char === "'") {
        quote = null;
      }

      continue;
    }

    if (quote === '"') {
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
        continue;
      }

      if (char === '"') {
        quote = null;
      }

      continue;
    }

    if (quote === "`") {
      if (char === "`" && next === "`") {
        current += next;
        index += 1;
        continue;
      }

      if (char === "\\" && next === "`") {
        current += next;
        index += 1;
        continue;
      }

      if (char === "`") {
        quote = null;
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
    }
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing.endsWith(";") ? trailing : `${trailing};`);
  }

  return statements.map((statement) => (statement.endsWith(";") ? statement : `${statement};`));
}

async function runSqlStatements(
  statements: readonly string[],
  run: (sql: string) => Promise<unknown> | unknown,
) {
  for (const statement of statements) {
    await run(statement);
  }
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

function resolvePrismaDatabaseUrl(
  runtime: DetectedDatabaseRuntime<any>,
  options: CreateDriverFromRuntimeOptions<any>,
): string {
  if (options.prisma?.databaseUrl) {
    return options.prisma.databaseUrl;
  }

  const client = runtime.client as Record<string, unknown>;
  const engineConfig = isRecord(client._engineConfig) ? client._engineConfig : undefined;

  const overrideDatasources = isRecord(engineConfig?.overrideDatasources)
    ? engineConfig.overrideDatasources
    : undefined;
  for (const datasource of Object.values(overrideDatasources ?? {})) {
    if (!isRecord(datasource)) continue;
    if (typeof datasource.url === "string" && datasource.url.length > 0) {
      return datasource.url;
    }
  }

  const inlineDatasources = isRecord(engineConfig?.inlineDatasources)
    ? engineConfig.inlineDatasources
    : undefined;
  for (const datasource of Object.values(inlineDatasources ?? {})) {
    if (!isRecord(datasource) || !isRecord(datasource.url)) continue;
    if (typeof datasource.url.value === "string" && datasource.url.value.length > 0) {
      return datasource.url.value;
    }
    if (
      typeof datasource.url.fromEnvVar === "string" &&
      process.env[datasource.url.fromEnvVar]?.length
    ) {
      return process.env[datasource.url.fromEnvVar]!;
    }
  }

  throw new Error(
    'pushSchema() for a Prisma runtime requires a resolvable database URL. Pass "prisma.databaseUrl" when the Prisma client does not expose one.',
  );
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

function resolveDrizzleRuntimeClient(
  runtime: DetectedDatabaseRuntime<any>,
  options: CreateDriverFromRuntimeOptions<any>,
) {
  const runtimeClient =
    options.drizzle?.client ??
    (runtime.client as DrizzleDriverConfig<any>["db"] | undefined)?.$client ??
    undefined;

  if (!runtimeClient) {
    throw new Error(
      'pushSchema() for a Drizzle runtime requires a Drizzle database with a "$client" property or an explicit "drizzle.client" option.',
    );
  }

  return runtimeClient;
}

function asMongoSchemaTarget(value: unknown): MongoSchemaTargetLike {
  if (hasFunction(value, "collection")) {
    return value as MongoSchemaTargetLike;
  }

  throw new Error("Unsupported Mongo schema target. Expected a MongoDB Db or Mongoose connection.");
}

function isMongoNamespaceExistsError(error: unknown) {
  if (isRecord(error) && error.code === 48) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /already exists|NamespaceExists/i.test(message);
}

function isMongoEquivalentIndexError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Index already exists with a different name/i.test(message);
}

function mongoIndexSpecsForModel(model: ReturnType<typeof createManifest>["models"][string]) {
  const deduped = new Map<string, { keys: Record<string, 1>; unique: boolean; name: string }>();

  for (const field of Object.values(model.fields)) {
    if (field.kind === "id") {
      if (field.column !== "_id") {
        const keys = { [field.column]: 1 } satisfies Record<string, 1>;
        deduped.set(JSON.stringify({ keys, unique: true }), {
          keys,
          unique: true,
          name: `${model.table}_${field.column}_pk_unique`,
        });
      }
      continue;
    }

    if (!field.unique) continue;
    const keys = { [field.column]: 1 } satisfies Record<string, 1>;
    deduped.set(JSON.stringify({ keys, unique: true }), {
      keys,
      unique: true,
      name: `${model.table}_${field.column}_unique`,
    });
  }

  for (const constraint of [...model.constraints.unique, ...model.constraints.indexes]) {
    const keys = Object.fromEntries(constraint.columns.map((column) => [column, 1])) as Record<
      string,
      1
    >;
    deduped.set(JSON.stringify({ keys, unique: constraint.unique }), {
      keys,
      unique: constraint.unique,
      name: constraint.name,
    });
  }

  return [...deduped.values()];
}

async function ensureMongoCollectionsAndIndexes(
  schema: SchemaDefinition<any>,
  target: MongoSchemaTargetLike,
) {
  const manifest = createManifest(schema);

  for (const model of Object.values(manifest.models)) {
    if (typeof target.createCollection === "function") {
      try {
        await target.createCollection(model.table);
      } catch (error) {
        if (!isMongoNamespaceExistsError(error)) {
          throw error;
        }
      }
    }

    const collection = target.collection(model.table);
    for (const index of mongoIndexSpecsForModel(model)) {
      try {
        await collection.createIndex(index.keys, {
          name: index.name,
          unique: index.unique,
        });
      } catch (error) {
        if (!isMongoEquivalentIndexError(error)) {
          throw error;
        }
      }
    }
  }
}

async function applySqlSchemaToClient(client: unknown, dialect: AutoDialect, sql: string) {
  if (dialect === "sqlite" && hasFunction(client, "exec")) {
    await (client as SqliteExecClient).exec(sql);
    return;
  }

  const statements = splitSqlStatements(sql);

  if (hasFunction(client, "query")) {
    await runSqlStatements(statements, (statement) => (client as SqlQueryClient).query(statement));
    return;
  }

  if (hasFunction(client, "execute")) {
    await runSqlStatements(statements, (statement) =>
      (client as SqlExecuteClient).execute(statement),
    );
    return;
  }

  if (hasFunction(client, "executeQuery")) {
    await runSqlStatements(statements, (statement) =>
      (client as KyselyExecuteClient).executeQuery({
        sql: statement,
        parameters: [],
        query: {
          kind: "RawNode",
          sqlFragments: [statement],
          parameters: [],
        },
        queryId: {},
      }),
    );
    return;
  }

  throw new Error(
    `Could not apply generated ${dialect} schema statements to the provided runtime client.`,
  );
}

async function runPrismaDbPush(schemaPath: string, databaseUrl: string, packageRoot: string) {
  await execFileAsync(
    "pnpm",
    ["exec", "prisma", "db", "push", "--schema", schemaPath, "--skip-generate"],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

async function pushPrismaSchema(
  schema: SchemaDefinition<any>,
  runtime: DetectedDatabaseRuntime<any>,
  options: CreateDriverFromRuntimeOptions<any>,
) {
  const dialect = resolveDialect(runtime, options.dialect);
  const provider = prismaProviderForDialect(dialect);
  const databaseUrl = resolvePrismaDatabaseUrl(runtime, options);
  const packageRoot = options.prisma?.packageRoot ?? defaultPrismaPackageRoot;
  const tempDir = await mkdtemp(path.join(tmpdir(), "farm-orm-runtime-prisma-"));
  const schemaPath = path.join(tempDir, "schema.prisma");

  try {
    await writeFile(schemaPath, renderRuntimePrismaSchema(schema, provider), "utf8");
    await runPrismaDbPush(schemaPath, databaseUrl, packageRoot);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function applySchemaInternal<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: CreateDriverFromRuntimeOptions<TSchema, TClient>,
) {
  const runtime = resolveRuntime(options);

  if (runtime.kind === "prisma") {
    await pushPrismaSchema(options.schema, runtime, options);
    return;
  }

  if (runtime.kind === "mongo") {
    const db = resolveMongoDb(runtime, options);
    await ensureMongoCollectionsAndIndexes(options.schema, asMongoSchemaTarget(db));
    return;
  }

  if (runtime.kind === "mongoose") {
    const connection = runtime.client as Record<string, unknown>;
    const db = isRecord(connection.db) ? connection.db : connection;
    await ensureMongoCollectionsAndIndexes(options.schema, asMongoSchemaTarget(db));
    return;
  }

  const dialect = resolveDialect(runtime, options.dialect);
  const sql = renderSafeSql(options.schema, { dialect });

  if (runtime.kind === "sql") {
    await applySqlSchemaToClient(runtime.client, dialect, sql);
    return;
  }

  if (runtime.kind === "drizzle") {
    await applySqlSchemaToClient(resolveDrizzleRuntimeClient(runtime, options), dialect, sql);
    return;
  }

  await applySqlSchemaToClient(runtime.client, dialect, sql);
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

export async function applySchema<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: ApplySchemaOptions<TSchema, TClient>,
) {
  await applySchemaInternal(options);
}

export async function pushSchema<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: PushSchemaOptions<TSchema, TClient>,
) {
  await applySchemaInternal(options);
}

export async function bootstrapDatabase<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: BootstrapDatabaseOptions<TSchema, TClient>,
) {
  await pushSchema(options);
  return createOrmFromRuntime(options);
}

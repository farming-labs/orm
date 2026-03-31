import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  createManifest,
  renderPrismaSchema,
  renderSafeSql,
  type SchemaDefinition,
} from "@farming-labs/orm";
import { CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDbBaseClientLike } from "@farming-labs/orm-dynamodb";
import type { DrizzleDriverConfig } from "@farming-labs/orm-drizzle";
import type { MongoDbLike } from "@farming-labs/orm-mongo";
import { createOrmFromRuntime } from "./index";
import {
  hasFunction,
  isRecord,
  resolveDialect,
  resolveMongoDb,
  resolveRuntime,
  type AutoDialect,
  type AutoDriverHandle,
  type CreateDriverFromRuntimeOptions,
  type CreateOrmFromRuntimeOptions,
  type MongooseConnectionLike,
} from "./shared";

type PrismaProvider = "sqlite" | "postgresql" | "mysql";

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

type SqlQueryClient = {
  query(sql: string, params?: readonly unknown[]): Promise<unknown> | unknown;
};

type SqlExecuteClient = {
  execute(sql: string, params?: readonly unknown[]): Promise<unknown> | unknown;
};

type SqliteExecClient = {
  exec(sql: string): Promise<unknown> | unknown;
};

type InitializableConnectionLike = {
  isInitialized?: boolean;
  initialize?(): Promise<unknown>;
};

type MikroormConnectionLike = {
  connect?(options?: { skipOnConnect?: boolean }): Promise<unknown> | unknown;
  ensureConnection?(): Promise<unknown> | unknown;
  execute(
    sql: string,
    params?: readonly unknown[],
    method?: "all" | "get" | "run",
    ctx?: unknown,
  ): Promise<unknown> | unknown;
  isConnected?(): Promise<boolean> | boolean;
};

type MikroormEntityManagerLike = {
  getConnection(type?: "read" | "write"): MikroormConnectionLike;
};

type MikroormRuntimeLike = {
  connect?(): Promise<unknown>;
  em?: MikroormEntityManagerLike;
  isConnected?(): Promise<boolean>;
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

const ormPrimaryKey = "__orm_pk";

type MongoSchemaTargetLike = {
  collection(name: string): MongoIndexCollectionLike;
  createCollection?(name: string): Promise<unknown>;
};

export class RuntimeSetupError extends Error {
  readonly stage: "apply" | "push" | "bootstrap";
  readonly runtimeKind: string;
  readonly dialect?: string;
  readonly statement?: string;
  override readonly cause?: unknown;

  constructor(input: {
    stage: "apply" | "push" | "bootstrap";
    runtimeKind: string;
    dialect?: string;
    message: string;
    statement?: string;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "RuntimeSetupError";
    this.stage = input.stage;
    this.runtimeKind = input.runtimeKind;
    this.dialect = input.dialect;
    this.statement = input.statement;
    this.cause = input.cause;
  }
}

const execFileAsync = promisify(execFile);
const defaultPrismaPackageRoot = process.cwd();

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
  dialect: AutoDialect,
  statements: readonly string[],
  run: (sql: string) => Promise<unknown> | unknown,
) {
  for (const statement of statements) {
    try {
      await run(statement);
    } catch (error) {
      if (isEquivalentSqlSetupError(dialect, statement, error)) {
        continue;
      }
      throw error;
    }
  }
}

function resolvePrismaDatabaseUrl(
  runtime: ReturnType<typeof resolveRuntime>,
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

function resolveDrizzleRuntimeClient(
  runtime: ReturnType<typeof resolveRuntime>,
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
    await runSqlStatements(dialect, statements, (statement) =>
      (client as SqlQueryClient).query(statement),
    );
    return;
  }

  if (hasFunction(client, "execute")) {
    await runSqlStatements(dialect, statements, (statement) =>
      (client as SqlExecuteClient).execute(statement),
    );
    return;
  }

  if (hasFunction(client, "executeQuery")) {
    await runSqlStatements(dialect, statements, (statement) =>
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

async function ensureInitializedConnection(client: unknown) {
  if (isRecord(client) && client.isInitialized === false && hasFunction(client, "initialize")) {
    await (client as InitializableConnectionLike).initialize?.();
  }
}

function resolveMikroormConnection(client: unknown) {
  if (hasFunction(client, "getConnection")) {
    return (client as MikroormEntityManagerLike).getConnection();
  }

  if (isRecord(client) && isRecord(client.em) && hasFunction(client.em, "getConnection")) {
    return (client.em as MikroormEntityManagerLike).getConnection();
  }

  throw new Error("Could not resolve a MikroORM SQL connection from the provided runtime client.");
}

async function ensureConnectedMikroorm(client: unknown) {
  if (isRecord(client) && hasFunction(client, "isConnected") && hasFunction(client, "connect")) {
    if (!(await (client as MikroormRuntimeLike).isConnected?.())) {
      await (client as MikroormRuntimeLike).connect?.();
    }
    return;
  }

  const connection = resolveMikroormConnection(client);
  if (hasFunction(connection, "isConnected")) {
    const connected = await connection.isConnected();
    if (connected) return;
  }

  if (hasFunction(connection, "ensureConnection")) {
    await connection.ensureConnection();
    return;
  }

  if (hasFunction(connection, "connect")) {
    await connection.connect({ skipOnConnect: false });
  }
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

function isEquivalentSqlSetupError(dialect: AutoDialect, statement: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = isRecord(error) ? error.code : undefined;
  const errno = isRecord(error) ? error.errno : undefined;
  const isIndexStatement = /^\s*create\s+(unique\s+)?index\b/i.test(statement);

  if (!isIndexStatement) {
    return false;
  }

  if (dialect === "mysql") {
    return code === "ER_DUP_KEYNAME" || errno === 1061 || /duplicate key name/i.test(message);
  }

  if (dialect === "sqlite") {
    return /index .+ already exists/i.test(message);
  }

  return code === "42P07" || /already exists/i.test(message);
}

function wrapSetupError(
  stage: "apply" | "push" | "bootstrap",
  runtime: ReturnType<typeof resolveRuntime>,
  error: unknown,
  statement?: string,
) {
  if (error instanceof RuntimeSetupError) {
    return error;
  }

  const runtimeLabel = runtime.dialect ? `${runtime.kind} (${runtime.dialect})` : runtime.kind;
  const detail = error instanceof Error ? error.message : String(error);
  const suffix = statement ? ` Statement: ${statement}` : "";
  const helperName =
    stage === "apply" ? "applySchema()" : stage === "push" ? "pushSchema()" : "bootstrapDatabase()";

  return new RuntimeSetupError({
    stage,
    runtimeKind: runtime.kind,
    dialect: runtime.dialect,
    statement,
    cause: error,
    message: `${helperName} failed for ${runtimeLabel} runtime. ${detail}${suffix}`.trim(),
  });
}

async function pushPrismaSchema(
  schema: SchemaDefinition<any>,
  runtime: ReturnType<typeof resolveRuntime>,
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

async function ensureDynamoDbTable(client: DynamoDbBaseClientLike, tableName: string) {
  try {
    const described = (await client.send(
      new DescribeTableCommand({
        TableName: tableName,
      }),
    )) as { Table?: { TableStatus?: string } };

    if (described.Table?.TableStatus === "ACTIVE") {
      return;
    }
  } catch (error) {
    if (
      !isRecord(error) ||
      (error.name !== "ResourceNotFoundException" && error.code !== "ResourceNotFoundException")
    ) {
      throw error;
    }

    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        KeySchema: [
          {
            AttributeName: ormPrimaryKey,
            KeyType: "HASH",
          },
        ],
        AttributeDefinitions: [
          {
            AttributeName: ormPrimaryKey,
            AttributeType: "S",
          },
        ],
      }),
    );
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const described = (await client.send(
      new DescribeTableCommand({
        TableName: tableName,
      }),
    )) as { Table?: { TableStatus?: string } };

    if (described.Table?.TableStatus === "ACTIVE") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out while waiting for DynamoDB table "${tableName}" to become active.`);
}

async function ensureDynamoDbTables(
  schema: SchemaDefinition<any>,
  client: DynamoDbBaseClientLike,
  tables?: Record<string, string | undefined>,
) {
  const manifest = createManifest(schema);

  for (const [modelName, model] of Object.entries(manifest.models)) {
    if (model.schema) {
      throw new Error(
        `The DynamoDB runtime does not support schema-qualified tables for model "${modelName}". Use flat table names instead.`,
      );
    }
    await ensureDynamoDbTable(client, tables?.[modelName] ?? model.table);
  }
}

async function applySchemaInternal<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  stage: "apply" | "push",
  options: CreateDriverFromRuntimeOptions<TSchema, TClient>,
) {
  const runtime = resolveRuntime(options);

  try {
    if (runtime.kind === "prisma") {
      await pushPrismaSchema(options.schema, runtime, options);
      return;
    }

    if (runtime.kind === "mongo") {
      const db = resolveMongoDb(runtime, options);
      await ensureMongoCollectionsAndIndexes(options.schema, asMongoSchemaTarget(db));
      return;
    }

    if (runtime.kind === "firestore") {
      return;
    }

    if (runtime.kind === "dynamodb") {
      await ensureDynamoDbTables(
        options.schema,
        runtime.client as DynamoDbBaseClientLike,
        options.dynamodb?.tables as Record<string, string | undefined> | undefined,
      );
      return;
    }

    if (runtime.kind === "unstorage") {
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

    if (runtime.kind === "typeorm") {
      await ensureInitializedConnection(runtime.client);
      await applySqlSchemaToClient(runtime.client, dialect, sql);
      return;
    }

    if (runtime.kind === "mikroorm") {
      await ensureConnectedMikroorm(runtime.client);
      await applySqlSchemaToClient(resolveMikroormConnection(runtime.client), dialect, sql);
      return;
    }

    await applySqlSchemaToClient(runtime.client, dialect, sql);
  } catch (error) {
    throw wrapSetupError(stage, runtime, error);
  }
}

export async function applySchema<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: ApplySchemaOptions<TSchema, TClient>,
) {
  await applySchemaInternal("apply", options);
}

export async function pushSchema<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: PushSchemaOptions<TSchema, TClient>,
) {
  await applySchemaInternal("push", options);
}

export async function bootstrapDatabase<TSchema extends SchemaDefinition<any>, TClient = unknown>(
  options: BootstrapDatabaseOptions<TSchema, TClient>,
) {
  const runtime = resolveRuntime(options);

  try {
    await pushSchema(options);
    return await createOrmFromRuntime(options);
  } catch (error) {
    throw wrapSetupError("bootstrap", runtime, error);
  }
}

export type {
  AutoDialect,
  AutoDriverHandle,
  CreateDriverFromRuntimeOptions,
  CreateOrmFromRuntimeOptions,
  MongooseConnectionLike,
};

export type DetectedDatabaseDialect = "sqlite" | "postgres" | "mysql";

export type DetectedDatabaseSource = "client" | "connection" | "pool" | "database" | "db";

export type DetectedDatabaseRuntime<TClient = unknown> = Readonly<{
  kind: "prisma" | "drizzle" | "kysely" | "sql" | "mongo" | "mongoose";
  client: TClient;
  dialect?: DetectedDatabaseDialect;
  source: DetectedDatabaseSource;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function hasFunction<TName extends string>(
  value: unknown,
  name: TName,
): value is Record<TName, (...args: any[]) => unknown> {
  return isRecord(value) && typeof value[name] === "function";
}

function getConstructorName(value: unknown) {
  if (!isRecord(value)) return "";
  const constructor = value.constructor;
  return typeof constructor?.name === "string" ? constructor.name : "";
}

function normalizeDialect(value: unknown): DetectedDatabaseDialect | undefined {
  switch (value) {
    case "sqlite":
    case "mysql":
    case "postgres":
      return value;
    case "postgresql":
      return "postgres";
    default:
      return undefined;
  }
}

function detectPrismaDialect(client: Record<string, unknown>) {
  return (
    normalizeDialect(client._activeProvider) ??
    normalizeDialect((client._engineConfig as Record<string, unknown> | undefined)?.activeProvider)
  );
}

function detectDrizzleDialect(client: Record<string, unknown>) {
  const dialectName = getConstructorName(client.dialect);

  if (dialectName.includes("SQLite")) return "sqlite";
  if (dialectName.includes("MySql")) return "mysql";
  if (dialectName.includes("Pg")) return "postgres";
  return undefined;
}

function detectKyselyDialect(client: { getExecutor?: () => { adapter?: unknown } }) {
  const adapterName = getConstructorName(client.getExecutor?.().adapter);

  if (adapterName.includes("Sqlite")) return "sqlite";
  if (adapterName.includes("Mysql")) return "mysql";
  if (adapterName.includes("Postgres")) return "postgres";
  return undefined;
}

function isPrismaClient(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "$connect") &&
    hasFunction(client, "$disconnect") &&
    hasFunction(client, "$transaction") &&
    (hasFunction(client, "$queryRawUnsafe") ||
      hasFunction(client, "$queryRaw") ||
      hasFunction(client, "$executeRaw"))
  );
}

function isDrizzleDatabase(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "select") &&
    hasFunction(client, "transaction") &&
    isRecord((client as Record<string, unknown>).query) &&
    isRecord((client as Record<string, unknown>).dialect)
  );
}

function isKyselyDatabase(client: unknown): client is {
  getExecutor: () => { adapter?: unknown };
} {
  return (
    hasFunction(client, "executeQuery") &&
    hasFunction(client, "selectFrom") &&
    hasFunction(client, "transaction") &&
    hasFunction(client, "getExecutor")
  );
}

function isSqliteDatabase(client: unknown) {
  return hasFunction(client, "prepare") && hasFunction(client, "exec");
}

function isMysqlPool(client: unknown) {
  return hasFunction(client, "getConnection") && hasFunction(client, "execute");
}

function isMysqlConnection(client: unknown) {
  return (
    hasFunction(client, "execute") &&
    hasFunction(client, "beginTransaction") &&
    hasFunction(client, "commit") &&
    hasFunction(client, "rollback")
  );
}

function isPgPool(client: unknown) {
  return (
    hasFunction(client, "connect") &&
    hasFunction(client, "query") &&
    isRecord(client) &&
    "totalCount" in client &&
    "idleCount" in client &&
    "waitingCount" in client
  );
}

function isPgClient(client: unknown) {
  return hasFunction(client, "connect") && hasFunction(client, "query");
}

function isMongooseConnection(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "collection") &&
    hasFunction(client, "model") &&
    hasFunction(client, "startSession") &&
    (hasFunction(client, "asPromise") ||
      typeof (client as Record<string, unknown>).readyState === "number")
  );
}

function isMongoDb(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "collection") &&
    hasFunction(client, "command") &&
    hasFunction(client, "admin")
  );
}

function isMongoClient(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "db") &&
    hasFunction(client, "connect") &&
    hasFunction(client, "close") &&
    hasFunction(client, "startSession")
  );
}

export function detectDatabaseRuntime<TClient>(
  client: TClient,
): DetectedDatabaseRuntime<TClient> | null {
  if (isPrismaClient(client)) {
    return Object.freeze({
      kind: "prisma",
      client,
      dialect: detectPrismaDialect(client),
      source: "client",
    });
  }

  if (isDrizzleDatabase(client)) {
    return Object.freeze({
      kind: "drizzle",
      client,
      dialect: detectDrizzleDialect(client),
      source: "db",
    });
  }

  if (isKyselyDatabase(client)) {
    return Object.freeze({
      kind: "kysely",
      client,
      dialect: detectKyselyDialect(client),
      source: "db",
    });
  }

  if (isMongooseConnection(client)) {
    return Object.freeze({
      kind: "mongoose",
      client,
      source: "connection",
    });
  }

  if (isMongoDb(client)) {
    return Object.freeze({
      kind: "mongo",
      client,
      source: "db",
    });
  }

  if (isMongoClient(client)) {
    return Object.freeze({
      kind: "mongo",
      client,
      source: "client",
    });
  }

  if (isSqliteDatabase(client)) {
    return Object.freeze({
      kind: "sql",
      client,
      dialect: "sqlite",
      source: "database",
    });
  }

  if (isMysqlPool(client)) {
    return Object.freeze({
      kind: "sql",
      client,
      dialect: "mysql",
      source: "pool",
    });
  }

  if (isMysqlConnection(client)) {
    return Object.freeze({
      kind: "sql",
      client,
      dialect: "mysql",
      source: "connection",
    });
  }

  if (isPgPool(client)) {
    return Object.freeze({
      kind: "sql",
      client,
      dialect: "postgres",
      source: "pool",
    });
  }

  if (isPgClient(client)) {
    return Object.freeze({
      kind: "sql",
      client,
      dialect: "postgres",
      source: "client",
    });
  }

  return null;
}

export function requireDatabaseRuntime<TClient>(client: TClient): DetectedDatabaseRuntime<TClient> {
  const detected = detectDatabaseRuntime(client);
  if (detected) return detected;
  throw new Error(
    "Unsupported database client. Expected a Prisma client, Drizzle database, Kysely instance, supported SQL client, MongoDB Db/MongoClient, or Mongoose connection.",
  );
}

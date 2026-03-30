export type DetectedDatabaseDialect = "sqlite" | "postgres" | "mysql";

export type DetectedDatabaseSource = "client" | "connection" | "pool" | "database" | "db";

export type DetectedDatabaseRuntime<TClient = unknown> = Readonly<{
  kind: "prisma" | "drizzle" | "kysely" | "sql" | "mongo" | "mongoose" | "firestore";
  client: TClient;
  dialect?: DetectedDatabaseDialect;
  source: DetectedDatabaseSource;
}>;

export type DatabaseRuntimeDetectionCandidate = Readonly<{
  kind: DetectedDatabaseRuntime["kind"];
  matched: boolean;
  reasons: readonly string[];
}>;

export type DatabaseRuntimeDetectionReport<TClient = unknown> = Readonly<{
  runtime: DetectedDatabaseRuntime<TClient> | null;
  constructorName: string;
  candidates: readonly DatabaseRuntimeDetectionCandidate[];
  summary: string;
  hint?: string;
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

function missingFunctions(value: unknown, names: readonly string[]) {
  if (!isRecord(value)) {
    return names.map((name) => `missing function "${name}"`);
  }

  return names
    .filter((name) => typeof value[name] !== "function")
    .map((name) => `missing function "${name}"`);
}

function missingKeys(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) {
    return keys.map((key) => `missing property "${key}"`);
  }

  return keys.filter((key) => !(key in value)).map((key) => `missing property "${key}"`);
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
  const adapterName = getConstructorName(client.getExecutor?.()?.adapter);

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

function isFirestoreDb(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "collection") &&
    hasFunction(client, "runTransaction") &&
    (hasFunction(client, "getAll") || hasFunction(client, "batch"))
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

  if (isFirestoreDb(client)) {
    return Object.freeze({
      kind: "firestore",
      client,
      source: "db",
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

export function inspectDatabaseRuntime<TClient>(
  client: TClient,
): DatabaseRuntimeDetectionReport<TClient> {
  const constructorName = getConstructorName(client);
  const runtime = detectDatabaseRuntime(client);
  const candidates: DatabaseRuntimeDetectionCandidate[] = [
    {
      kind: "prisma",
      matched: isPrismaClient(client),
      reasons: missingFunctions(client, ["$connect", "$disconnect", "$transaction"]).concat(
        hasFunction(client, "$queryRawUnsafe") ||
          hasFunction(client, "$queryRaw") ||
          hasFunction(client, "$executeRaw")
          ? []
          : ['missing one of "$queryRawUnsafe", "$queryRaw", or "$executeRaw"'],
      ),
    },
    {
      kind: "drizzle",
      matched: isDrizzleDatabase(client),
      reasons: missingFunctions(client, ["select", "transaction"]).concat(
        isRecord(client) && isRecord(client.query) ? [] : ['missing object property "query"'],
        isRecord(client) && isRecord(client.dialect) ? [] : ['missing object property "dialect"'],
      ),
    },
    {
      kind: "kysely",
      matched: isKyselyDatabase(client),
      reasons: missingFunctions(client, [
        "executeQuery",
        "selectFrom",
        "transaction",
        "getExecutor",
      ]),
    },
    {
      kind: "mongoose",
      matched: isMongooseConnection(client),
      reasons: missingFunctions(client, ["collection", "model", "startSession"]).concat(
        hasFunction(client, "asPromise") ||
          (isRecord(client) && typeof client.readyState === "number")
          ? []
          : ['missing "asPromise()" or numeric "readyState"'],
      ),
    },
    {
      kind: "mongo",
      matched: isMongoDb(client) || isMongoClient(client),
      reasons:
        isMongoDb(client) || isMongoClient(client)
          ? []
          : missingFunctions(client, ["collection"]).concat([
              'expected either a Mongo Db ("command", "admin") or MongoClient ("db", "connect", "close", "startSession") shape',
            ]),
    },
    {
      kind: "firestore",
      matched: isFirestoreDb(client),
      reasons: isFirestoreDb(client)
        ? []
        : missingFunctions(client, ["collection", "runTransaction"]).concat(
            hasFunction(client, "getAll") || hasFunction(client, "batch")
              ? []
              : ['missing "getAll()" or "batch()"'],
          ),
    },
    {
      kind: "sql",
      matched:
        isSqliteDatabase(client) ||
        isMysqlPool(client) ||
        isMysqlConnection(client) ||
        isPgPool(client) ||
        isPgClient(client),
      reasons:
        isSqliteDatabase(client) ||
        isMysqlPool(client) ||
        isMysqlConnection(client) ||
        isPgPool(client) ||
        isPgClient(client)
          ? []
          : ["expected a supported SQL runtime such as node:sqlite, pg, or mysql2"],
    },
  ];

  if (runtime) {
    return Object.freeze({
      runtime,
      constructorName,
      candidates: Object.freeze(candidates),
      summary: `Detected ${runtime.kind}${runtime.dialect ? ` (${runtime.dialect})` : ""} runtime from ${runtime.source}.`,
    });
  }

  const topReason =
    candidates.find((candidate) => candidate.reasons.length)?.reasons[0] ??
    "unsupported client shape";

  return Object.freeze({
    runtime: null,
    constructorName,
    candidates: Object.freeze(candidates),
    summary: constructorName
      ? `Could not detect a supported runtime from constructor "${constructorName}".`
      : "Could not detect a supported runtime from the provided client.",
    hint: `Pass a detected "runtime" override directly or provide a supported raw client. First failing check: ${topReason}.`,
  });
}

/**
 * @deprecated Use inspectDatabaseRuntime() instead.
 */
export function explainDatabaseRuntimeDetection<TClient>(
  client: TClient,
): DatabaseRuntimeDetectionReport<TClient> {
  return inspectDatabaseRuntime(client);
}

export function requireDatabaseRuntime<TClient>(client: TClient): DetectedDatabaseRuntime<TClient> {
  const report = inspectDatabaseRuntime(client);
  if (report.runtime) return report.runtime;
  throw new Error(`${report.summary} ${report.hint ?? ""}`.trim());
}

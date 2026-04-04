export type DetectedDatabaseDialect = "sqlite" | "postgres" | "mysql";

export type DetectedDatabaseSource = "client" | "connection" | "pool" | "database" | "db";

export type DetectedDatabaseRuntime<TClient = unknown> = Readonly<{
  kind:
    | "prisma"
    | "drizzle"
    | "kysely"
    | "xata"
    | "edgedb"
    | "mikroorm"
    | "neo4j"
    | "d1"
    | "kv"
    | "dynamodb"
    | "redis"
    | "supabase"
    | "unstorage"
    | "sequelize"
    | "sql"
    | "mongo"
    | "mongoose"
    | "firestore"
    | "typeorm";
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
      return value;
    case "better-sqlite3":
    case "sqljs":
    case "better-sqlite":
      return "sqlite";
    case "mysql":
    case "mariadb":
    case "aurora-mysql":
    case "mariadb-mysql":
      return "mysql";
    case "postgres":
    case "cockroachdb":
    case "aurora-postgres":
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

function detectTypeormDialect(client: Record<string, unknown>) {
  return normalizeDialect((client.options as Record<string, unknown> | undefined)?.type);
}

function detectSequelizeDialect(client: Record<string, unknown>) {
  return normalizeDialect((client.options as Record<string, unknown> | undefined)?.dialect);
}

function getConfigValue(config: unknown, key: string) {
  if (!isRecord(config) || typeof config.get !== "function") {
    return undefined;
  }

  try {
    return config.get(key);
  } catch {
    return undefined;
  }
}

function normalizeMikroormDialect(value: unknown): DetectedDatabaseDialect | undefined {
  if (typeof value === "string") {
    return normalizeDialect(value);
  }

  const constructorName = getConstructorName(value);
  if (/postgre|pgsql|pg/i.test(constructorName)) return "postgres";
  if (/mysql|maria/i.test(constructorName)) return "mysql";
  if (/sqlite|sqljs|better.?sqlite/i.test(constructorName)) return "sqlite";
  return undefined;
}

function detectMikroormDialect(client: Record<string, unknown>) {
  const entityManager = isRecord(client.em) ? client.em : undefined;
  const driver = isRecord(client.driver) ? client.driver : undefined;
  const config = isRecord(client.config) ? client.config : undefined;
  const connection = hasFunction(client, "getConnection")
    ? client.getConnection()
    : hasFunction(entityManager, "getConnection")
      ? entityManager.getConnection()
      : hasFunction(driver, "getConnection")
        ? driver.getConnection()
        : undefined;
  const platform = hasFunction(client, "getPlatform")
    ? client.getPlatform()
    : hasFunction(entityManager, "getPlatform")
      ? entityManager.getPlatform()
      : hasFunction(driver, "getPlatform")
        ? driver.getPlatform()
        : undefined;

  const candidates = [
    client,
    entityManager,
    driver,
    connection,
    platform,
    getConfigValue(config, "type"),
    getConfigValue(config, "driver"),
  ];

  for (const candidate of candidates) {
    const dialect = normalizeMikroormDialect(candidate);
    if (dialect) return dialect;
  }

  return undefined;
}

function isDynamoDbClient(client: unknown): client is Record<string, unknown> {
  const constructorName = getConstructorName(client);
  return (
    hasFunction(client, "send") &&
    (hasFunction(client, "destroy") || isRecord(client)) &&
    (constructorName.includes("DynamoDBClient") ||
      constructorName.includes("DynamoDBDocumentClient") ||
      (isRecord(client) &&
        isRecord((client as Record<string, unknown>).config) &&
        "translateConfig" in
          ((client as Record<string, unknown>).config as Record<string, unknown>)))
  );
}

function isD1PreparedStatement(client: unknown): client is Record<string, unknown> {
  return hasFunction(client, "bind") && hasFunction(client, "run");
}

function isNeo4jDriver(client: unknown): client is Record<string, unknown> {
  const constructorName = getConstructorName(client);
  return (
    hasFunction(client, "session") &&
    (hasFunction(client, "close") ||
      hasFunction(client, "verifyConnectivity") ||
      hasFunction(client, "getServerInfo") ||
      /driver/i.test(constructorName))
  );
}

function isNeo4jSession(client: unknown): client is Record<string, unknown> {
  const constructorName = getConstructorName(client);
  return (
    hasFunction(client, "run") &&
    (hasFunction(client, "beginTransaction") ||
      hasFunction(client, "executeRead") ||
      hasFunction(client, "executeWrite")) &&
    (hasFunction(client, "close") || /session/i.test(constructorName))
  );
}

function isD1DatabaseSession(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "prepare") &&
    hasFunction(client, "batch") &&
    hasFunction(client, "getBookmark")
  );
}

function isD1Database(client: unknown): client is Record<string, unknown> {
  if (!hasFunction(client, "prepare") || !hasFunction(client, "batch")) {
    return false;
  }

  try {
    const prepared = client.prepare("select 1");
    if (!isD1PreparedStatement(prepared)) {
      return false;
    }
  } catch {
    return false;
  }

  return (
    hasFunction(client, "withSession") ||
    hasFunction(client, "exec") ||
    hasFunction(client, "dump") ||
    getConstructorName(client).includes("D1Database")
  );
}

function isUnstorageClient(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "getItem") &&
    hasFunction(client, "setItem") &&
    hasFunction(client, "removeItem") &&
    hasFunction(client, "getKeys") &&
    hasFunction(client, "getMounts")
  );
}

function isKvClient(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "get") &&
    hasFunction(client, "put") &&
    hasFunction(client, "delete") &&
    hasFunction(client, "list")
  );
}

function isRedisClient(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "get") &&
    hasFunction(client, "set") &&
    (hasFunction(client, "del") || hasFunction(client, "unlink")) &&
    (hasFunction(client, "keys") ||
      hasFunction(client, "scan") ||
      hasFunction(client, "scanIterator")) &&
    (hasFunction(client, "setNX") ||
      hasFunction(client, "setnx") ||
      hasFunction(client, "sendCommand") ||
      hasFunction(client, "connect") ||
      hasFunction(client, "pipeline") ||
      hasFunction(client, "request"))
  );
}

function isSupabaseClient(client: unknown): client is Record<string, unknown> {
  const constructorName = getConstructorName(client);
  return (
    hasFunction(client, "from") &&
    hasFunction(client, "rpc") &&
    (hasFunction(client, "schema") ||
      (isRecord(client) &&
        ("auth" in client ||
          "storage" in client ||
          "functions" in client ||
          "realtime" in client)) ||
      /supabase/i.test(constructorName))
  );
}

function isXataClient(client: unknown): client is Record<string, unknown> {
  const constructorName = getConstructorName(client);
  const record = client as Record<string, unknown>;
  const sql = isRecord(record) ? record.sql : undefined;

  return (
    isRecord(client) &&
    typeof record.sql === "function" &&
    isRecord(record.db) &&
    (hasFunction(client, "getConfig") ||
      (typeof sql === "function" && ("connectionString" in sql || hasFunction(sql, "batch"))) ||
      /xata|baseclient/i.test(constructorName))
  );
}

function isEdgeDbClient(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "querySQL") &&
    hasFunction(client, "executeSQL") &&
    hasFunction(client, "transaction")
  );
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

function isSequelizeClient(client: unknown): client is Record<string, unknown> {
  const record = client as Record<string, unknown>;
  return (
    hasFunction(client, "query") &&
    hasFunction(client, "transaction") &&
    hasFunction(client, "authenticate") &&
    hasFunction(client, "close") &&
    isRecord(client) &&
    isRecord(record.options) &&
    "dialect" in record.options
  );
}

function isMikroormInstance(client: unknown): client is Record<string, unknown> {
  const record = client as Record<string, unknown>;

  return (
    hasFunction(client, "connect") &&
    hasFunction(client, "close") &&
    hasFunction(client, "isConnected") &&
    isRecord(client) &&
    isRecord(record.em) &&
    hasFunction(record.em, "getConnection") &&
    hasFunction(record.em, "transactional")
  );
}

function isMikroormEntityManager(client: unknown): client is Record<string, unknown> {
  return (
    hasFunction(client, "getConnection") &&
    hasFunction(client, "transactional") &&
    hasFunction(client, "fork") &&
    (hasFunction(client, "getDriver") || hasFunction(client, "getPlatform"))
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

function isTypeormDataSource(client: unknown): client is Record<string, unknown> {
  const record = client as Record<string, unknown>;
  return (
    hasFunction(client, "createQueryRunner") &&
    hasFunction(client, "transaction") &&
    isRecord(client) &&
    isRecord(record.options) &&
    "type" in record.options
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

  if (isEdgeDbClient(client)) {
    return Object.freeze({
      kind: "edgedb",
      client,
      dialect: "postgres",
      source: "client",
    });
  }

  if (isMikroormInstance(client) || isMikroormEntityManager(client)) {
    const dialect = detectMikroormDialect(client as Record<string, unknown>);
    if (dialect) {
      return Object.freeze({
        kind: "mikroorm",
        client,
        dialect,
        source: "connection",
      });
    }
  }

  if (isNeo4jDriver(client) || isNeo4jSession(client)) {
    return Object.freeze({
      kind: "neo4j",
      client,
      source: "client",
    });
  }

  if (isDynamoDbClient(client)) {
    return Object.freeze({
      kind: "dynamodb",
      client,
      source: "client",
    });
  }

  if (isD1Database(client) || isD1DatabaseSession(client)) {
    return Object.freeze({
      kind: "d1",
      client,
      dialect: "sqlite",
      source: "database",
    });
  }

  if (isKvClient(client)) {
    return Object.freeze({
      kind: "kv",
      client,
      source: "client",
    });
  }

  if (isUnstorageClient(client)) {
    return Object.freeze({
      kind: "unstorage",
      client,
      source: "client",
    });
  }

  if (isRedisClient(client)) {
    return Object.freeze({
      kind: "redis",
      client,
      source: "client",
    });
  }

  if (isSupabaseClient(client)) {
    return Object.freeze({
      kind: "supabase",
      client,
      dialect: "postgres",
      source: "client",
    });
  }

  if (isXataClient(client)) {
    return Object.freeze({
      kind: "xata",
      client,
      dialect: "postgres",
      source: "client",
    });
  }

  if (isSequelizeClient(client)) {
    const dialect = detectSequelizeDialect(client);
    if (dialect) {
      return Object.freeze({
        kind: "sequelize",
        client,
        dialect,
        source: "connection",
      });
    }
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

  if (isTypeormDataSource(client)) {
    return Object.freeze({
      kind: "typeorm",
      client,
      dialect: detectTypeormDialect(client),
      source: "connection",
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
      kind: "edgedb",
      matched: isEdgeDbClient(client),
      reasons: isEdgeDbClient(client)
        ? []
        : missingFunctions(client, ["querySQL", "executeSQL", "transaction"]).concat([
            "expected a Gel / EdgeDB client with querySQL(), executeSQL(), and transaction() support",
          ]),
    },
    {
      kind: "mikroorm",
      matched:
        (isMikroormInstance(client) || isMikroormEntityManager(client)) &&
        !!detectMikroormDialect(client as Record<string, unknown>),
      reasons:
        isMikroormInstance(client) || isMikroormEntityManager(client)
          ? detectMikroormDialect(client as Record<string, unknown>)
            ? []
            : [
                "unsupported MikroORM dialect; expected a PostgreSQL, MySQL/MariaDB, or SQLite-family SQL driver",
              ]
          : missingFunctions(client, ["getConnection", "transactional"]).concat([
              'expected either a MikroORM instance ("em", "connect", "close") or an EntityManager-like runtime',
            ]),
    },
    {
      kind: "neo4j",
      matched: isNeo4jDriver(client) || isNeo4jSession(client),
      reasons:
        isNeo4jDriver(client) || isNeo4jSession(client)
          ? []
          : missingFunctions(client, ["run"]).concat([
              'expected a Neo4j driver ("session") or session ("run", "beginTransaction"/"executeWrite") shape',
            ]),
    },
    {
      kind: "d1",
      matched: isD1Database(client) || isD1DatabaseSession(client),
      reasons:
        isD1Database(client) || isD1DatabaseSession(client)
          ? []
          : missingFunctions(client, ["prepare", "batch"]).concat([
              "expected a Cloudflare D1Database or D1DatabaseSession-like runtime",
            ]),
    },
    {
      kind: "dynamodb",
      matched: isDynamoDbClient(client),
      reasons: isDynamoDbClient(client)
        ? []
        : missingFunctions(client, ["send"]).concat([
            "expected a DynamoDBClient or DynamoDBDocumentClient-like runtime",
          ]),
    },
    {
      kind: "kv",
      matched: isKvClient(client),
      reasons: isKvClient(client)
        ? []
        : missingFunctions(client, ["get", "put", "delete", "list"]).concat([
            "expected a Cloudflare KV Namespace-like runtime with get/put/delete/list support",
          ]),
    },
    {
      kind: "unstorage",
      matched: isUnstorageClient(client),
      reasons: isUnstorageClient(client)
        ? []
        : missingFunctions(client, [
            "getItem",
            "setItem",
            "removeItem",
            "getKeys",
            "getMounts",
          ]).concat(["expected an Unstorage storage client created with createStorage(...)"]),
    },
    {
      kind: "redis",
      matched: isRedisClient(client),
      reasons: isRedisClient(client)
        ? []
        : missingFunctions(client, ["get", "set"]).concat([
            "expected a Redis or Upstash Redis client with get/set/del and key listing support",
          ]),
    },
    {
      kind: "supabase",
      matched: isSupabaseClient(client),
      reasons: isSupabaseClient(client)
        ? []
        : missingFunctions(client, ["from", "rpc"]).concat([
            "expected a Supabase client created with createClient(...)",
          ]),
    },
    {
      kind: "xata",
      matched: isXataClient(client),
      reasons: isXataClient(client)
        ? []
        : missingFunctions(client, ["sql"]).concat(
            isRecord(client) && isRecord((client as Record<string, unknown>).db)
              ? []
              : ['missing object property "db"'],
            ["expected an official Xata client with db repositories and sql() support"],
          ),
    },
    {
      kind: "sequelize",
      matched: isSequelizeClient(client) && !!detectSequelizeDialect(client),
      reasons: missingFunctions(client, ["query", "transaction", "authenticate", "close"]).concat(
        isRecord(client) && isRecord((client as Record<string, unknown>).options)
          ? "dialect" in ((client as Record<string, unknown>).options as Record<string, unknown>)
            ? detectSequelizeDialect(client as Record<string, unknown>)
              ? []
              : [
                  'unsupported Sequelize dialect; expected "postgres", "postgresql", "mysql", or "mariadb"',
                ]
            : ['missing "options.dialect"']
          : ['missing object property "options"'],
      ),
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
      kind: "typeorm",
      matched: isTypeormDataSource(client),
      reasons: missingFunctions(client, ["createQueryRunner", "transaction"]).concat(
        isRecord(client) && isRecord(client.options)
          ? "type" in client.options
            ? []
            : ['missing "options.type"']
          : ['missing object property "options"'],
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

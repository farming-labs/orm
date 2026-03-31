import {
  createDriverHandle,
  type OrmDriver,
  type OrmDriverCapabilityInput,
  type OrmDriverHandle,
  type SchemaDefinition,
} from "@farming-labs/orm";
import { createSqlDriverFromAdapter, type SqlAdapterLike } from "@farming-labs/orm-sql";

type SqlDialect = "sqlite" | "mysql" | "postgres";
type SqlRow = Record<string, unknown>;
type SqlQueryResult = {
  rows: SqlRow[];
  affectedRows: number;
  insertId?: unknown;
};

type MikroormForkOptions = {
  clear?: boolean;
  disableTransactions?: boolean;
  keepTransactionContext?: boolean;
  useContext?: boolean;
};

export type MikroormDriverDialect = SqlDialect;
export type MikroormDriverHandle<
  TClient = unknown,
  TDialect extends MikroormDriverDialect = MikroormDriverDialect,
> = OrmDriverHandle<"mikroorm", TClient, TDialect>;

export type MikroormConnectionLike = {
  connect?(options?: { skipOnConnect?: boolean }): Promise<unknown> | unknown;
  ensureConnection?(): Promise<unknown> | unknown;
  execute(
    sql: string,
    params?: unknown[],
    method?: "all" | "get" | "run",
    ctx?: unknown,
  ): Promise<unknown> | unknown;
  isConnected?(): Promise<boolean> | boolean;
};

export type MikroormEntityManagerLike = {
  config?: {
    get?(key: string): unknown;
  };
  fork?(options?: MikroormForkOptions): MikroormEntityManagerLike;
  getConnection(type?: "read" | "write"): MikroormConnectionLike;
  getTransactionContext?<T = unknown>(): T | undefined;
  getDriver?(): {
    getPlatform?(): unknown;
    getConnection?(type?: "read" | "write"): MikroormConnectionLike;
  };
  getPlatform?(): unknown;
  transactional<TResult>(
    run: (entityManager: MikroormEntityManagerLike) => Promise<TResult>,
    options?: unknown,
  ): Promise<TResult>;
};

export type MikroormLike = {
  config?: {
    get?(key: string): unknown;
  };
  connect(): Promise<unknown>;
  close(force?: boolean): Promise<unknown>;
  driver?: {
    getConnection?(type?: "read" | "write"): MikroormConnectionLike;
    getPlatform?(): unknown;
  };
  em: MikroormEntityManagerLike;
  isConnected(): Promise<boolean>;
  schema?: unknown;
};

export type MikroormDriverClient = MikroormLike | MikroormEntityManagerLike;

export type MikroormDriverConfig<TSchema extends SchemaDefinition<any>> = {
  orm: MikroormDriverClient;
  dialect?: MikroormDriverDialect;
  capabilities?: OrmDriverCapabilityInput;
  handle?: MikroormDriverHandle<MikroormDriverClient>;
};

type MikroormQueryResultLike = {
  affectedRows?: number;
  insertId?: unknown;
  insertedIds?: unknown[];
  row?: SqlRow;
  rows?: SqlRow[];
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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

function getConstructorName(value: unknown) {
  if (!isRecord(value)) return "";
  const constructor = value.constructor;
  return typeof constructor?.name === "string" ? constructor.name : "";
}

function isSqlSelectLike(sql: string) {
  return /^\s*(select|with|pragma|explain)\b/i.test(sql);
}

function constructorDialect(value: unknown): MikroormDriverDialect | undefined {
  if (typeof value === "string") {
    switch (value) {
      case "postgres":
      case "postgresql":
      case "cockroachdb":
      case "aurora-postgres":
        return "postgres";
      case "mysql":
      case "mariadb":
      case "aurora-mysql":
        return "mysql";
      case "sqlite":
      case "better-sqlite":
      case "better-sqlite3":
      case "sqljs":
        return "sqlite";
      default:
        return undefined;
    }
  }

  const constructorName = getConstructorName(value);

  if (/postgre|pgsql|pg/i.test(constructorName)) return "postgres";
  if (/mysql|maria/i.test(constructorName)) return "mysql";
  if (/sqlite|sqljs|better.?sqlite/i.test(constructorName)) return "sqlite";
  return undefined;
}

function getConfigValue(value: unknown, key: string) {
  if (!isRecord(value) || !hasFunction(value, "get")) return undefined;

  try {
    return value.get(key);
  } catch {
    return undefined;
  }
}

function isMikroormInstance(client: unknown): client is MikroormLike {
  return (
    hasFunction(client, "connect") &&
    hasFunction(client, "close") &&
    hasFunction(client, "isConnected") &&
    isRecord(client) &&
    isRecord((client as Record<string, unknown>).em) &&
    hasFunction((client as Record<string, unknown>).em, "getConnection") &&
    hasFunction((client as Record<string, unknown>).em, "transactional")
  );
}

function isMikroormEntityManager(client: unknown): client is MikroormEntityManagerLike {
  return (
    hasFunction(client, "getConnection") &&
    hasFunction(client, "transactional") &&
    hasFunction(client, "fork") &&
    (hasFunction(client, "getDriver") || hasFunction(client, "getPlatform"))
  );
}

export function normalizeMikroormDialect(value: unknown): MikroormDriverDialect | undefined {
  return constructorDialect(value);
}

export function detectMikroormDialect(
  client: MikroormDriverClient,
): MikroormDriverDialect | undefined {
  const record = client as Record<string, unknown>;
  const em = isRecord(record.em) ? record.em : undefined;
  const config = isRecord(record.config) ? record.config : undefined;
  const driver = isRecord(record.driver) ? record.driver : undefined;
  const connection = hasFunction(client, "getConnection")
    ? client.getConnection()
    : hasFunction(em, "getConnection")
      ? em.getConnection()
      : hasFunction(driver, "getConnection")
        ? driver.getConnection()
        : undefined;
  const platform = hasFunction(client, "getPlatform")
    ? client.getPlatform()
    : hasFunction(em, "getPlatform")
      ? em.getPlatform()
      : hasFunction(driver, "getPlatform")
        ? driver.getPlatform()
        : undefined;

  const candidates = [
    client,
    em,
    driver,
    connection,
    platform,
    getConfigValue(config, "type"),
    getConfigValue(config, "driver"),
    getConfigValue(config, "driverOptions"),
  ];

  for (const candidate of candidates) {
    const dialect = normalizeMikroormDialect(candidate);
    if (dialect) return dialect;
  }

  return undefined;
}

export function resolveMikroormDialect(
  client: MikroormDriverClient,
  override?: MikroormDriverDialect,
): MikroormDriverDialect {
  const dialect = override ?? detectMikroormDialect(client);
  if (!dialect) {
    throw new Error(
      "Could not determine the MikroORM dialect. Pass `dialect` explicitly or use a supported SQL driver such as PostgreSQL, MySQL/MariaDB, or SQLite.",
    );
  }

  return dialect;
}

function mikroormDriverCapabilities(dialect: MikroormDriverDialect): OrmDriverCapabilityInput {
  return {
    numericIds: "generated",
    supportsJSON: true,
    supportsDates: true,
    supportsBooleans: true,
    supportsTransactions: true,
    supportsSchemaNamespaces: dialect === "postgres",
    supportsTransactionalDDL: dialect !== "mysql",
    nativeRelationLoading: "partial",
    textComparison: "database-default",
    textMatching: {
      equality: "database-default",
      contains: "database-default",
      ordering: "database-default",
    },
    upsert: "native",
    returning: {
      create: true,
      update: true,
      delete: false,
    },
    returningMode: {
      create: "record",
      update: "record",
      delete: "none",
    },
    nativeRelations: {
      singularChains: true,
      hasMany: true,
      manyToMany: true,
      filtered: false,
      ordered: false,
      paginated: false,
    },
  };
}

function resolveEntityManager(client: MikroormDriverClient) {
  if (isMikroormInstance(client)) {
    const em = client.em;
    if (hasFunction(em, "fork")) {
      return em.fork({
        clear: false,
        useContext: false,
      });
    }
    return em;
  }

  return client;
}

function resolveConnection(client: MikroormDriverClient) {
  const entityManager = resolveEntityManager(client);
  return entityManager.getConnection();
}

async function ensureConnected(client: MikroormDriverClient) {
  if (isMikroormInstance(client)) {
    const connected = await client.isConnected();
    if (!connected) {
      await client.connect();
    }
    return;
  }

  const connection = client.getConnection();
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

function normalizeMikroormResult(sql: string, result: unknown): SqlQueryResult {
  if (Array.isArray(result)) {
    return {
      rows: result as SqlRow[],
      affectedRows: isSqlSelectLike(sql) ? result.length : 0,
    };
  }

  if (!isRecord(result)) {
    return {
      rows: [],
      affectedRows: 0,
    };
  }

  const typed = result as MikroormQueryResultLike;
  const rows = Array.isArray(typed.rows)
    ? typed.rows
    : isRecord(typed.row)
      ? [typed.row]
      : isSqlSelectLike(sql) && !("affectedRows" in typed)
        ? [typed as SqlRow]
        : [];

  return {
    rows,
    affectedRows: toNumber(typed.affectedRows) ?? (isSqlSelectLike(sql) ? rows.length : 0),
    insertId: typed.insertId ?? typed.insertedIds?.[0],
  };
}

async function executeQuery(
  connection: MikroormConnectionLike,
  sql: string,
  params: unknown[],
  dialect: MikroormDriverDialect,
  transactionContext?: unknown,
) {
  const query = dialect === "postgres" ? sql.replace(/\$\d+\b/g, "?") : sql;
  const method = isSqlSelectLike(sql) ? "all" : "run";

  if (dialect === "sqlite" || dialect === "mysql" || dialect === "postgres") {
    return normalizeMikroormResult(
      sql,
      await connection.execute(query, params, method, transactionContext),
    );
  }

  return normalizeMikroormResult(
    sql,
    await connection.execute(query, params, undefined, transactionContext),
  );
}

function createMikroormAdapter(
  client: MikroormDriverClient,
  dialect: MikroormDriverDialect,
): SqlAdapterLike {
  return {
    dialect,
    async query(sql, params) {
      await ensureConnected(client);
      return executeQuery(resolveConnection(client), sql, params, dialect);
    },
    async transaction<TResult>(run: (adapter: SqlAdapterLike) => Promise<TResult>) {
      await ensureConnected(client);

      const entityManager = resolveEntityManager(client);
      return entityManager.transactional(async (transactionEntityManager) => {
        const connection = transactionEntityManager.getConnection();
        const transactionContext = transactionEntityManager.getTransactionContext?.();
        const transactionAdapter: SqlAdapterLike = {
          dialect,
          async query(sql, params) {
            return executeQuery(connection, sql, params, dialect, transactionContext);
          },
          async transaction<TResultInner>(
            nestedRun: (adapter: SqlAdapterLike) => Promise<TResultInner>,
          ) {
            return nestedRun(transactionAdapter);
          },
        };

        return run(transactionAdapter);
      });
    },
  };
}

export function createMikroormDriver<TSchema extends SchemaDefinition<any>>(
  config: MikroormDriverConfig<TSchema>,
): OrmDriver<TSchema, MikroormDriverHandle<MikroormDriverClient>> {
  const dialect = resolveMikroormDialect(config.orm, config.dialect);
  const handle =
    config.handle ??
    createDriverHandle({
      kind: "mikroorm",
      client: config.orm,
      dialect,
      capabilities: {
        ...mikroormDriverCapabilities(dialect),
        ...config.capabilities,
      },
    });

  return createSqlDriverFromAdapter<TSchema, MikroormDriverHandle<MikroormDriverClient>>(
    createMikroormAdapter(config.orm, dialect),
    handle,
  );
}

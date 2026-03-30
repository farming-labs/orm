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

type TypeormQueryResultLike = {
  records?: unknown[];
  raw?: unknown;
  rows?: unknown[];
  affected?: number;
  rowCount?: number;
  insertId?: unknown;
};

export type TypeormDriverDialect = SqlDialect;
export type TypeormDriverHandle<
  TClient = unknown,
  TDialect extends TypeormDriverDialect = TypeormDriverDialect,
> = OrmDriverHandle<"typeorm", TClient, TDialect>;

export type TypeormQueryRunnerLike = {
  connect?(): Promise<unknown>;
  release?(): Promise<unknown>;
  query(
    sql: string,
    parameters?: readonly unknown[],
    useStructuredResult?: boolean,
  ): Promise<unknown>;
};

export type TypeormEntityManagerLike = {
  queryRunner?: TypeormQueryRunnerLike | null;
};

export type TypeormDataSourceLike = {
  readonly options?: {
    type?: string;
  };
  readonly isInitialized?: boolean;
  initialize?(): Promise<unknown>;
  createQueryRunner(): TypeormQueryRunnerLike;
  transaction<TResult>(
    run: (manager: TypeormEntityManagerLike) => Promise<TResult>,
  ): Promise<TResult>;
};

export type TypeormDriverConfig<TSchema extends SchemaDefinition<any>> = {
  dataSource: TypeormDataSourceLike;
  dialect?: TypeormDriverDialect;
  capabilities?: OrmDriverCapabilityInput;
  handle?: TypeormDriverHandle<TypeormDataSourceLike>;
};

const initializationPromises = new WeakMap<object, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return undefined;
}

function isSqlSelectLike(sql: string) {
  return /^\s*(select|with|pragma|explain)\b/i.test(sql);
}

export function normalizeTypeormDialect(value: unknown): TypeormDriverDialect | undefined {
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
    case "better-sqlite3":
    case "sqljs":
      return "sqlite";
    default:
      return undefined;
  }
}

export function resolveTypeormDialect(
  dataSource: TypeormDataSourceLike,
  override?: TypeormDriverDialect,
): TypeormDriverDialect {
  const dialect = override ?? normalizeTypeormDialect(dataSource.options?.type);
  if (!dialect) {
    throw new Error(
      'Could not determine the TypeORM dialect. Pass `dialect` explicitly or use a supported DataSource type such as "postgres", "mysql", "mariadb", "sqlite", "better-sqlite3", or "sqljs".',
    );
  }

  return dialect;
}

async function ensureInitialized(dataSource: TypeormDataSourceLike) {
  if (dataSource.isInitialized !== false || !dataSource.initialize) {
    return;
  }

  let pending = initializationPromises.get(dataSource as object);
  if (!pending) {
    pending = Promise.resolve(dataSource.initialize()).then(() => undefined);
    initializationPromises.set(dataSource as object, pending);
  }

  try {
    await pending;
  } finally {
    initializationPromises.delete(dataSource as object);
  }
}

async function withQueryRunner<TResult>(
  dataSource: TypeormDataSourceLike,
  run: (queryRunner: TypeormQueryRunnerLike) => Promise<TResult>,
) {
  await ensureInitialized(dataSource);

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect?.();

  try {
    return await run(queryRunner);
  } finally {
    await queryRunner.release?.();
  }
}

function normalizeStructuredResult(sql: string, result: unknown): SqlQueryResult {
  if (Array.isArray(result)) {
    return {
      rows: result as SqlRow[],
      affectedRows: result.length,
    };
  }

  if (!isRecord(result)) {
    return {
      rows: [],
      affectedRows: 0,
    };
  }

  const typed = result as TypeormQueryResultLike;
  const raw = typed.raw;
  const rows = Array.isArray(typed.records)
    ? (typed.records as SqlRow[])
    : Array.isArray(typed.rows)
      ? (typed.rows as SqlRow[])
      : Array.isArray(raw)
        ? (raw as SqlRow[])
        : [];

  const rawRecord = isRecord(raw) ? raw : undefined;
  const affectedRows =
    toNumber(typed.affected) ??
    toNumber(typed.rowCount) ??
    toNumber(rawRecord?.affectedRows) ??
    toNumber(rawRecord?.rowCount) ??
    toNumber(rawRecord?.changes) ??
    (isSqlSelectLike(sql) ? rows.length : 0);

  const insertId = typed.insertId ?? rawRecord?.insertId ?? rawRecord?.lastInsertRowid;

  return {
    rows,
    affectedRows,
    insertId,
  };
}

function typeormDriverCapabilities(dialect: TypeormDriverDialect): OrmDriverCapabilityInput {
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

function createTypeormAdapter(
  dataSource: TypeormDataSourceLike,
  dialect: TypeormDriverDialect,
): SqlAdapterLike {
  return {
    dialect,
    async query(sql, params) {
      return withQueryRunner(dataSource, async (queryRunner) =>
        normalizeStructuredResult(sql, await queryRunner.query(sql, params, true)),
      );
    },
    async transaction<TResult>(run: (adapter: SqlAdapterLike) => Promise<TResult>) {
      await ensureInitialized(dataSource);

      return dataSource.transaction(async (manager) => {
        const queryRunner = manager.queryRunner;
        if (!queryRunner) {
          throw new Error(
            "TypeORM transactions require an EntityManager with an attached query runner.",
          );
        }

        const transactionAdapter: SqlAdapterLike = {
          dialect,
          async query(sql, params) {
            return normalizeStructuredResult(sql, await queryRunner.query(sql, params, true));
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

export function createTypeormDriver<TSchema extends SchemaDefinition<any>>(
  config: TypeormDriverConfig<TSchema>,
): OrmDriver<TSchema, TypeormDriverHandle<TypeormDataSourceLike>> {
  const dialect = resolveTypeormDialect(config.dataSource, config.dialect);
  const handle =
    config.handle ??
    createDriverHandle({
      kind: "typeorm",
      client: config.dataSource,
      dialect,
      capabilities: {
        ...typeormDriverCapabilities(dialect),
        ...config.capabilities,
      },
    });

  return createSqlDriverFromAdapter<TSchema, TypeormDriverHandle<TypeormDataSourceLike>>(
    createTypeormAdapter(config.dataSource, dialect),
    handle,
  );
}

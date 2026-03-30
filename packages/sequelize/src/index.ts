import {
  createDriverHandle,
  type OrmDriver,
  type OrmDriverCapabilityInput,
  type OrmDriverHandle,
  type SchemaDefinition,
} from "@farming-labs/orm";
import { createSqlDriverFromAdapter, type SqlAdapterLike } from "@farming-labs/orm-sql";

type SqlDialect = "mysql" | "postgres";
type SqlRow = Record<string, unknown>;
type SqlQueryResult = {
  rows: SqlRow[];
  affectedRows: number;
  insertId?: unknown;
};

type SequelizeQueryOptionsLike = {
  bind?: readonly unknown[];
  replacements?: readonly unknown[];
  transaction?: SequelizeTransactionLike;
  raw?: boolean;
};

type SequelizeQueryMetadataLike = {
  rowCount?: number;
  affectedRows?: number;
  insertId?: unknown;
};

export type SequelizeDriverDialect = SqlDialect;
export type SequelizeDriverHandle<
  TClient = unknown,
  TDialect extends SequelizeDriverDialect = SequelizeDriverDialect,
> = OrmDriverHandle<"sequelize", TClient, TDialect>;

export type SequelizeTransactionLike = {
  afterCommit?(callback: () => void): void;
};

export type SequelizeLike = {
  readonly options?: {
    dialect?: string;
  };
  authenticate(): Promise<unknown>;
  close(): Promise<unknown>;
  query(...args: any[]): Promise<unknown>;
  transaction<TResult>(
    run: (transaction: SequelizeTransactionLike) => Promise<TResult>,
  ): Promise<TResult>;
};

export type SequelizeDriverConfig<TSchema extends SchemaDefinition<any>> = {
  sequelize: SequelizeLike;
  dialect?: SequelizeDriverDialect;
  capabilities?: OrmDriverCapabilityInput;
  handle?: SequelizeDriverHandle<SequelizeLike>;
};

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

function formatMysqlDateForDecoder(value: Date) {
  return value.toISOString().replace("T", " ").replace("Z", "");
}

function normalizeMysqlRowValue(value: unknown): unknown {
  if (value instanceof Date) {
    return formatMysqlDateForDecoder(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMysqlRowValue(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeMysqlRowValue(entry)]),
    );
  }

  return value;
}

function normalizeRowsForDialect(rows: SqlRow[], dialect: SequelizeDriverDialect) {
  if (dialect !== "mysql") {
    return rows;
  }

  return rows.map((row) => normalizeMysqlRowValue(row) as SqlRow);
}

export function normalizeSequelizeDialect(value: unknown): SequelizeDriverDialect | undefined {
  switch (value) {
    case "postgres":
    case "postgresql":
      return "postgres";
    case "mysql":
    case "mariadb":
      return "mysql";
    default:
      return undefined;
  }
}

export function resolveSequelizeDialect(
  sequelize: SequelizeLike,
  override?: SequelizeDriverDialect,
): SequelizeDriverDialect {
  const dialect = override ?? normalizeSequelizeDialect(sequelize.options?.dialect);
  if (!dialect) {
    throw new Error(
      'Could not determine the Sequelize dialect. Pass `dialect` explicitly or use a supported Sequelize dialect such as "postgres", "postgresql", "mysql", or "mariadb".',
    );
  }

  return dialect;
}

function normalizeSequelizeResult(
  sql: string,
  result: unknown,
  dialect: SequelizeDriverDialect,
): SqlQueryResult {
  if (!Array.isArray(result)) {
    return {
      rows: [],
      affectedRows: 0,
    };
  }

  const [rowsOrResult, metadata] = result as [unknown, unknown];
  const rows = Array.isArray(rowsOrResult)
    ? (rowsOrResult as SqlRow[])
    : isRecord(rowsOrResult)
      ? [rowsOrResult as SqlRow]
      : [];

  const metadataRecord = isRecord(metadata) ? (metadata as SequelizeQueryMetadataLike) : undefined;
  const rowsRecord = isRecord(rowsOrResult)
    ? (rowsOrResult as SequelizeQueryMetadataLike)
    : undefined;

  const affectedRows =
    toNumber(metadataRecord?.rowCount) ??
    toNumber(metadataRecord?.affectedRows) ??
    toNumber(rowsRecord?.rowCount) ??
    toNumber(rowsRecord?.affectedRows) ??
    (typeof metadata === "number" ? metadata : undefined) ??
    (isSqlSelectLike(sql) ? rows.length : 0);

  const insertId = metadataRecord?.insertId ?? rowsRecord?.insertId;

  return {
    rows: normalizeRowsForDialect(rows, dialect),
    affectedRows,
    insertId,
  };
}

function sequelizeDriverCapabilities(dialect: SequelizeDriverDialect): OrmDriverCapabilityInput {
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

function queryOptionsForDialect(
  dialect: SequelizeDriverDialect,
  params: unknown[],
  transaction?: SequelizeTransactionLike,
): SequelizeQueryOptionsLike {
  return {
    ...(dialect === "postgres" ? { bind: params } : { replacements: params }),
    ...(transaction ? { transaction } : {}),
    raw: true,
  };
}

function createSequelizeAdapter(
  sequelize: SequelizeLike,
  dialect: SequelizeDriverDialect,
): SqlAdapterLike {
  return {
    dialect,
    async query(sql, params) {
      await sequelize.authenticate();
      return normalizeSequelizeResult(
        sql,
        await sequelize.query(sql, queryOptionsForDialect(dialect, params)),
        dialect,
      );
    },
    async transaction<TResult>(run: (adapter: SqlAdapterLike) => Promise<TResult>) {
      await sequelize.authenticate();

      return sequelize.transaction(async (transaction) => {
        const transactionAdapter: SqlAdapterLike = {
          dialect,
          async query(sql, params) {
            return normalizeSequelizeResult(
              sql,
              await sequelize.query(sql, queryOptionsForDialect(dialect, params, transaction)),
              dialect,
            );
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

export function createSequelizeDriver<TSchema extends SchemaDefinition<any>>(
  config: SequelizeDriverConfig<TSchema>,
): OrmDriver<TSchema, SequelizeDriverHandle<SequelizeLike>> {
  const dialect = resolveSequelizeDialect(config.sequelize, config.dialect);
  const handle =
    config.handle ??
    createDriverHandle({
      kind: "sequelize",
      client: config.sequelize,
      dialect,
      capabilities: {
        ...sequelizeDriverCapabilities(dialect),
        ...config.capabilities,
      },
    });

  return createSqlDriverFromAdapter<TSchema, SequelizeDriverHandle<SequelizeLike>>(
    createSequelizeAdapter(config.sequelize, dialect),
    handle,
  );
}

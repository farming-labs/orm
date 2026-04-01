import {
  createDriverHandle,
  type OrmDriver,
  type OrmDriverCapabilityInput,
  type OrmDriverHandle,
  type SchemaDefinition,
} from "@farming-labs/orm";
import { createSqlDriverFromAdapter, type SqlAdapterLike } from "@farming-labs/orm-sql";

type D1Row = Record<string, unknown>;

type D1ResultMeta = {
  changes?: number | bigint;
  last_row_id?: number | bigint | string | null;
  rows_written?: number | bigint;
};

type D1QueryResultLike = {
  results?: unknown[];
  meta?: D1ResultMeta;
};

export type D1PreparedStatementLike = {
  bind(...params: unknown[]): D1PreparedStatementLike;
  run(): Promise<D1QueryResultLike> | D1QueryResultLike;
};

export type D1DatabaseSessionLike = {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: readonly D1PreparedStatementLike[]): Promise<unknown> | unknown;
  getBookmark?(): string;
};

export type D1DatabaseLike = D1DatabaseSessionLike & {
  exec?(sql: string): Promise<unknown> | unknown;
  withSession?(bookmark?: string): D1DatabaseSessionLike;
  dump?(): Promise<ArrayBuffer> | ArrayBuffer;
};

export type D1DriverClient = D1DatabaseLike | D1DatabaseSessionLike;

export type D1DriverHandle<TClient = D1DriverClient> = OrmDriverHandle<"d1", TClient, "sqlite">;

export type D1DriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: D1DriverClient;
  capabilities?: OrmDriverCapabilityInput;
  handle?: D1DriverHandle<D1DriverClient>;
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
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function d1DriverCapabilities(): OrmDriverCapabilityInput {
  return {
    numericIds: "generated",
    supportsJSON: true,
    supportsDates: true,
    supportsBooleans: true,
    supportsTransactions: false,
    supportsSchemaNamespaces: false,
    supportsTransactionalDDL: false,
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

function bindStatement(statement: D1PreparedStatementLike, params: unknown[]) {
  return statement.bind(...params);
}

function normalizeQueryResult(result: unknown) {
  const record = isRecord(result) ? result : {};
  const meta = isRecord(record.meta) ? (record.meta as D1ResultMeta) : undefined;
  const rows = Array.isArray(record.results)
    ? record.results.filter((value): value is D1Row => isRecord(value))
    : [];

  return {
    rows,
    affectedRows:
      toNumber(meta?.changes) ??
      toNumber(meta?.rows_written) ??
      (rows.length > 0 ? rows.length : 0),
    insertId: meta?.last_row_id,
  };
}

async function executeStatement(client: D1DriverClient, sql: string, params: unknown[]) {
  const statement = bindStatement(client.prepare(sql), params);
  return normalizeQueryResult(await statement.run());
}

function createD1Adapter(client: D1DriverClient, createSession = true): SqlAdapterLike {
  return {
    dialect: "sqlite",
    async query(sql, params) {
      return executeStatement(client, sql, params);
    },
    async transaction(run) {
      if (createSession && hasFunction(client, "withSession")) {
        return run(createD1Adapter(client.withSession() as D1DatabaseSessionLike, false));
      }

      return run(createD1Adapter(client, false));
    },
  };
}

export function createD1Driver<TSchema extends SchemaDefinition<any>>(
  config: D1DriverConfig<TSchema>,
): OrmDriver<TSchema, D1DriverHandle<D1DriverClient>> {
  const handle =
    config.handle ??
    createDriverHandle({
      kind: "d1",
      client: config.client,
      dialect: "sqlite",
      capabilities: {
        ...d1DriverCapabilities(),
        ...config.capabilities,
      },
    });

  return createSqlDriverFromAdapter<TSchema, D1DriverHandle<D1DriverClient>>(
    createD1Adapter(config.client),
    handle,
  );
}

import { userInfo } from "node:os";
import { Pool, type PoolClient, type QueryResult } from "pg";
import type {
  XataClientLike,
  XataSqlBatchQuery,
  XataSqlBatchResult,
  XataSqlFunction,
  XataSqlQueryJsonResult,
  XataSqlQueryParams,
} from "../../src";

export type LocalXataHarness = {
  client: XataClientLike;
  databaseUrl: string;
  close(): Promise<void>;
};

function createIsolatedName(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/-/g, "_");
}

function assignDatabase(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function formatLocalDbError(error: unknown, hint: string) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `PostgreSQL local Xata integration test could not connect. ${hint}\nOriginal error: ${message}`,
  );
}

async function resolvePostgresAdminUrl() {
  const candidates = [
    process.env.FARM_ORM_LOCAL_PG_ADMIN_URL,
    "postgres://postgres:postgres@127.0.0.1:5432/postgres",
    `postgres://${userInfo().username}@127.0.0.1:5432/postgres`,
  ].filter(Boolean) as string[];

  let lastError: unknown;
  for (const candidate of candidates) {
    const pool = new Pool({ connectionString: candidate });
    try {
      await pool.query("select 1");
      await pool.end();
      return candidate;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => undefined);
    }
  }

  throw formatLocalDbError(
    lastError,
    `Make sure a local PostgreSQL server is running and reachable via FARM_ORM_LOCAL_PG_ADMIN_URL (tried: ${candidates.join(", ")}).`,
  );
}

function normalizeResult(result: QueryResult<Record<string, unknown>>): XataSqlQueryJsonResult {
  return {
    records: result.rows,
    columns: result.fields.map((field) => ({
      name: field.name,
      type: String(field.dataTypeID),
    })),
  };
}

function isTemplateSqlQuery(
  value: TemplateStringsArray | XataSqlQueryParams,
): value is TemplateStringsArray {
  return Array.isArray(value) && "raw" in value;
}

function normalizeQuery(
  query: TemplateStringsArray | XataSqlQueryParams,
  parameters: unknown[],
): XataSqlQueryParams {
  if (isTemplateSqlQuery(query)) {
    const statement = query.reduce((output, fragment, index) => {
      const placeholder = index < parameters.length ? `$${index + 1}` : "";
      return output + fragment + placeholder;
    }, "");

    return {
      statement,
      params: parameters,
      responseType: "json",
    };
  }

  return {
    statement: query.statement,
    consistency: query.consistency,
    params: Array.isArray(query.params) ? [...query.params] : [],
    responseType: query.responseType ?? "json",
  };
}

async function executeStatement(
  queryable: Pool | PoolClient,
  statement: string,
  params: readonly unknown[],
) {
  return normalizeResult(
    await queryable.query<Record<string, unknown>>(statement, params as any[]),
  );
}

function createSqlFunction(pool: Pool, databaseUrl: string) {
  const sql = (async (
    query: TemplateStringsArray | XataSqlQueryParams,
    ...parameters: unknown[]
  ) => {
    const normalized = normalizeQuery(query, parameters);
    return executeStatement(pool, normalized.statement, normalized.params ?? []);
  }) as XataSqlFunction;

  sql.connectionString = databaseUrl;
  sql.batch = async (query: XataSqlBatchQuery): Promise<XataSqlBatchResult> => {
    const client = await pool.connect();

    try {
      await client.query("begin");
      const results: Array<Awaited<ReturnType<typeof executeStatement>>> = [];

      for (const statement of query.statements) {
        results.push(await executeStatement(client, statement.statement, statement.params ?? []));
      }

      await client.query("commit");
      return {
        results,
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  return sql;
}

export async function startLocalXata(): Promise<LocalXataHarness> {
  const adminUrl = await resolvePostgresAdminUrl();
  const databaseName = createIsolatedName("farm_orm_xata_pg");
  const adminPool = new Pool({ connectionString: adminUrl });

  try {
    await adminPool.query(`create database "${databaseName}"`);
  } catch (error) {
    await adminPool.end();
    throw formatLocalDbError(
      error,
      `Make sure a local PostgreSQL server is running and reachable via FARM_ORM_LOCAL_PG_ADMIN_URL (resolved admin URL: ${adminUrl}).`,
    );
  }

  await adminPool.end();

  const databaseUrl = assignDatabase(adminUrl, databaseName);
  const pool = new Pool({ connectionString: databaseUrl });

  const client: XataClientLike = {
    db: {},
    sql: createSqlFunction(pool, databaseUrl),
    async getConfig() {
      return {
        databaseURL: databaseUrl,
        branch: "main",
      };
    },
    transactions: {
      async run() {
        throw new Error(
          "The local Xata harness does not expose Xata transaction operations directly.",
        );
      },
    },
  };

  return {
    client,
    databaseUrl,
    async close() {
      await pool.end().catch(() => undefined);

      const cleanupPool = new Pool({ connectionString: adminUrl });
      try {
        await cleanupPool.query(`drop database if exists "${databaseName}"`);
      } finally {
        await cleanupPool.end();
      }
    },
  };
}

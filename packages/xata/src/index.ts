import {
  createDriverHandle,
  type OrmDriver,
  type OrmDriverCapabilityInput,
  type OrmDriverHandle,
  type SchemaDefinition,
} from "@farming-labs/orm";
import { createSqlDriverFromAdapter, type SqlAdapterLike } from "@farming-labs/orm-sql";

type SqlRow = Record<string, unknown>;

const affectedRowsAlias = "__orm_affected_rows";

export type XataSqlQueryJsonResult<T = unknown> = {
  records?: readonly T[];
  columns?: readonly {
    name: string;
    type: string;
  }[];
  warning?: string;
};

export type XataSqlQueryArrayResult = {
  rows?: readonly unknown[][];
  columns?: readonly {
    name: string;
    type: string;
  }[];
  warning?: string;
};

export type XataSqlQueryParams = {
  statement: string;
  params?: readonly unknown[];
  consistency?: "strong" | "eventual";
  responseType?: "json" | "array";
};

export type XataSqlBatchQuery = {
  statements: readonly {
    statement: string;
    params?: readonly unknown[];
  }[];
  consistency?: "strong" | "eventual";
  responseType?: "json" | "array";
};

export type XataSqlBatchResult = {
  results?: readonly (XataSqlQueryJsonResult<unknown> | XataSqlQueryArrayResult)[];
};

export type XataSqlFunction = ((
  query: TemplateStringsArray | XataSqlQueryParams,
  ...parameters: unknown[]
) =>
  | Promise<XataSqlQueryJsonResult<unknown> | XataSqlQueryArrayResult>
  | XataSqlQueryJsonResult<unknown>
  | XataSqlQueryArrayResult) & {
  connectionString?: string;
  batch?: (query: XataSqlBatchQuery) => Promise<XataSqlBatchResult> | XataSqlBatchResult;
};

export type XataClientLike = {
  db: Record<string, unknown>;
  sql: XataSqlFunction;
  getConfig?():
    | Promise<{
        databaseURL?: string;
        branch?: string;
      }>
    | {
        databaseURL?: string;
        branch?: string;
      };
  transactions?: {
    run?(operations: readonly unknown[]): Promise<unknown> | unknown;
  };
};

export type XataDriverClient = XataClientLike;

export type XataDriverHandle<TClient = XataDriverClient> = OrmDriverHandle<
  "xata",
  TClient,
  "postgres"
>;

export type XataDriverConfig<TSchema extends SchemaDefinition<any>> = {
  client: XataDriverClient;
  capabilities?: OrmDriverCapabilityInput;
  handle?: XataDriverHandle<XataDriverClient>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function tokenizeTopLevelSql(sql: string) {
  const tokens: string[] = [];
  let index = 0;
  let depth = 0;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === "$") {
      let endTag = index + 1;
      while (endTag < sql.length && /[A-Za-z0-9_]/.test(sql[endTag]!)) {
        endTag += 1;
      }
      if (sql[endTag] === "$") {
        const tag = sql.slice(index, endTag + 1);
        const closeIndex = sql.indexOf(tag, endTag + 1);
        index = closeIndex === -1 ? sql.length : closeIndex + tag.length;
        continue;
      }
    }

    if (char === "'" || char === '"') {
      const quote = char;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < sql.length) {
        if (sql[index] === "*" && sql[index + 1] === "/") {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === "(") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    if (depth === 0 && char === ",") {
      tokens.push(",");
      index += 1;
      continue;
    }

    if (depth === 0 && /[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < sql.length && /[A-Za-z0-9_$]/.test(sql[end]!)) {
        end += 1;
      }
      tokens.push(sql.slice(index, end).toUpperCase());
      index = end;
      continue;
    }

    index += 1;
  }

  return tokens;
}

function primaryStatementKeyword(sql: string) {
  const tokens = tokenizeTopLevelSql(sql);
  if (!tokens.length) {
    return null;
  }

  if (tokens[0] !== "WITH") {
    return tokens[0]!;
  }

  let index = 1;
  if (tokens[index] === "RECURSIVE") {
    index += 1;
  }

  while (index < tokens.length) {
    while (index < tokens.length && tokens[index] !== "AS") {
      index += 1;
    }

    if (index >= tokens.length) {
      return "WITH";
    }

    index += 1;
    if (tokens[index] === "NOT") {
      index += 1;
    }
    if (tokens[index] === "MATERIALIZED") {
      index += 1;
    }
    if (tokens[index] === ",") {
      index += 1;
      continue;
    }

    return tokens[index] ?? "WITH";
  }

  return "WITH";
}

function isReadQuery(sql: string) {
  const keyword = primaryStatementKeyword(sql);
  return (
    keyword === "SELECT" || keyword === "SHOW" || keyword === "DESCRIBE" || keyword === "EXPLAIN"
  );
}

function isMutationQuery(sql: string) {
  const keyword = primaryStatementKeyword(sql);
  return keyword === "INSERT" || keyword === "UPDATE" || keyword === "DELETE";
}

function hasReturningClause(sql: string) {
  return tokenizeTopLevelSql(sql).includes("RETURNING");
}

export const xataSqlIntrospection = {
  tokenizeTopLevelSql,
  primaryStatementKeyword,
  isReadQuery,
  isMutationQuery,
  hasReturningClause,
} as const;

function trimStatement(sql: string) {
  return sql.trim().replace(/;+$/g, "");
}

function wrapAffectedRowsQuery(sql: string) {
  const statement = trimStatement(sql);
  return `with "__farm_orm_mutation" as (${statement} returning 1) select count(*)::int as "${affectedRowsAlias}" from "__farm_orm_mutation"`;
}

function normalizeRows(result: unknown) {
  const records = isRecord(result) && Array.isArray(result.records) ? result.records : [];
  return records.filter((value): value is SqlRow => isRecord(value));
}

function xataDriverCapabilities(): OrmDriverCapabilityInput {
  return {
    numericIds: "generated",
    supportsJSON: true,
    supportsDates: true,
    supportsBooleans: true,
    supportsTransactions: false,
    supportsSchemaNamespaces: true,
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

async function callSql(client: XataDriverClient, statement: string, params: unknown[]) {
  return client.sql({
    statement,
    params,
    responseType: "json",
  });
}

async function executeXataStatement(client: XataDriverClient, sql: string, params: unknown[]) {
  if (isMutationQuery(sql) && !hasReturningClause(sql)) {
    const rows = normalizeRows(await callSql(client, wrapAffectedRowsQuery(sql), params));
    return {
      rows: [] as SqlRow[],
      affectedRows: toNumber(rows[0]?.[affectedRowsAlias]) ?? 0,
    };
  }

  if (isReadQuery(sql) || hasReturningClause(sql)) {
    const rows = normalizeRows(await callSql(client, sql, params));
    return {
      rows,
      affectedRows: rows.length,
    };
  }

  await callSql(client, sql, params);
  return {
    rows: [] as SqlRow[],
    affectedRows: 0,
  };
}

function createXataAdapter(client: XataDriverClient): SqlAdapterLike {
  return {
    dialect: "postgres",
    async query(sql, params) {
      return executeXataStatement(client, sql, params);
    },
    async transaction(run) {
      // The direct Xata runtime intentionally keeps orm.transaction() conservative.
      return run(createXataAdapter(client));
    },
  };
}

export function createXataDriver<TSchema extends SchemaDefinition<any>>(
  config: XataDriverConfig<TSchema>,
): OrmDriver<TSchema, XataDriverHandle<XataDriverClient>> {
  const handle =
    config.handle ??
    createDriverHandle({
      kind: "xata",
      client: config.client,
      dialect: "postgres",
      capabilities: {
        ...xataDriverCapabilities(),
        ...config.capabilities,
      },
    });

  return createSqlDriverFromAdapter<TSchema, XataDriverHandle<XataDriverClient>>(
    createXataAdapter(config.client),
    handle,
  );
}

import { randomUUID } from "node:crypto";
import {
  createManifest,
  type CountArgs,
  type CreateArgs,
  type CreateManyArgs,
  type DeleteArgs,
  type DeleteManyArgs,
  type FindFirstArgs,
  type FindManyArgs,
  type FindUniqueArgs,
  type ManifestField,
  type ManifestModel,
  type OrmDriver,
  type SchemaManifest,
  type SchemaDefinition,
  type SelectShape,
  type SelectedRecord,
  type UpdateArgs,
  type UpdateManyArgs,
  type UpsertArgs,
  type Where,
} from "@farming-labs/orm";
import type { ModelName, RelationName } from "@farming-labs/orm";

type SqlDialect = "sqlite" | "mysql" | "postgres";
type SqlRow = Record<string, unknown>;
type SqlFilterRecord = Record<string, string | number | boolean | Date | null>;
type SqlWhere = Where<SqlFilterRecord>;

type SqlQueryResult = {
  rows: SqlRow[];
  affectedRows: number;
};

type SqlAdapter = {
  dialect: SqlDialect;
  query(sql: string, params: unknown[]): Promise<SqlQueryResult>;
  transaction<TResult>(run: (adapter: SqlAdapter) => Promise<TResult>): Promise<TResult>;
};

type PgQueryResultLike = {
  rows?: SqlRow[];
  rowCount?: number | null;
};

export type PgClientLike = {
  query(sql: string, params?: unknown[]): Promise<PgQueryResultLike>;
  release?: () => void;
};

export type PgPoolLike = PgClientLike & {
  connect(): Promise<PgClientLike>;
};

type MysqlExecuteResult = {
  affectedRows?: number;
};

export type MysqlConnectionLike = {
  execute(sql: string, params?: unknown[]): Promise<[SqlRow[] | MysqlExecuteResult, unknown]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release?: () => void;
};

export type MysqlPoolLike = {
  execute(sql: string, params?: unknown[]): Promise<[SqlRow[] | MysqlExecuteResult, unknown]>;
  getConnection(): Promise<MysqlConnectionLike>;
};

type SqliteRunResult = {
  changes?: number | bigint;
};

export type SqliteStatementLike = {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): SqliteRunResult;
};

export type SqliteDatabaseLike = {
  prepare(sql: string): SqliteStatementLike;
  exec(sql: string): void;
};

type QueryState = {
  params: unknown[];
};

const manifestCache = new WeakMap<object, SchemaManifest>();

function getManifest(schema: SchemaDefinition<any>) {
  const cached = manifestCache.get(schema);
  if (cached) return cached;
  const next = createManifest(schema);
  manifestCache.set(schema, next);
  return next;
}

function quoteIdentifier(value: string, dialect: SqlDialect) {
  if (dialect === "mysql") {
    return `\`${value.replace(/`/g, "``")}\``;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function createPlaceholder(dialect: SqlDialect, state: QueryState, value: unknown) {
  state.params.push(value);
  return dialect === "postgres" ? `$${state.params.length}` : "?";
}

function parseReference(reference?: string) {
  if (!reference) return null;
  const [model, field] = reference.split(".");
  if (!model || !field) return null;
  return { model, field };
}

function identityField(model: ManifestModel) {
  if (model.fields.id) return model.fields.id;
  const uniqueField = Object.values(model.fields).find((field) => field.unique);
  if (uniqueField) return uniqueField;
  throw new Error(
    `Model "${model.name}" requires an "id" field or a unique field for the SQL runtime.`,
  );
}

function applyDefault(value: unknown, field: ManifestField) {
  if (value !== undefined) return value;
  if (field.generated === "id") return randomUUID();
  if (field.generated === "now") return new Date();
  if (typeof field.defaultValue === "function") {
    return (field.defaultValue as () => unknown)();
  }
  return field.defaultValue;
}

function encodeValue(field: ManifestField, dialect: SqlDialect, value: unknown) {
  if (value === undefined) return value;
  if (value === null) return null;

  if (field.kind === "boolean") {
    if (dialect === "postgres") return Boolean(value);
    return value ? 1 : 0;
  }

  if (field.kind === "datetime") {
    return value instanceof Date ? value.toISOString() : value;
  }

  return value;
}

function decodeValue(field: ManifestField, value: unknown) {
  if (value === undefined) return value;
  if (value === null) return null;

  if (field.kind === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "t";
    }
  }

  if (field.kind === "datetime") {
    if (value instanceof Date) return value;
    return new Date(String(value));
  }

  return value;
}

function decodeRow(model: ManifestModel, row: SqlRow) {
  const output: SqlRow = {};

  for (const field of Object.values(model.fields)) {
    output[field.name] = decodeValue(field, row[field.name]);
  }

  return output;
}

function mergeWhere(...clauses: Array<SqlWhere | undefined>) {
  const defined = clauses.filter(Boolean) as SqlWhere[];
  if (!defined.length) return undefined;
  if (defined.length === 1) return defined[0];
  return {
    AND: defined,
  } as SqlWhere;
}

function isFilterObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);
}

function extractEqualityValue(filter: unknown) {
  if (!isFilterObject(filter)) {
    return {
      supported: true,
      value: filter,
    };
  }

  const keys = Object.keys(filter);
  if (keys.length === 1 && "eq" in filter) {
    return {
      supported: true,
      value: filter.eq,
    };
  }

  return {
    supported: false,
    value: undefined,
  };
}

function extractUpsertConflict(model: ManifestModel, where: SqlWhere) {
  const keys = Object.keys(where).filter((key) => key !== "AND" && key !== "OR" && key !== "NOT");

  if ("AND" in where || "OR" in where || "NOT" in where || keys.length !== 1) {
    throw new Error(
      `Upsert on model "${model.name}" requires a single unique equality filter in "where".`,
    );
  }

  const fieldName = keys[0]!;
  const field = model.fields[fieldName];
  if (!field) {
    throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
  }

  if (!(field.kind === "id" || field.unique)) {
    throw new Error(
      `Upsert on model "${model.name}" requires the "where" field "${fieldName}" to be unique or an id field.`,
    );
  }

  const { supported, value } = extractEqualityValue(where[fieldName]);
  if (!supported || value === undefined || value === null) {
    throw new Error(
      `Upsert on model "${model.name}" requires the "where" field "${fieldName}" to use a single non-null equality value.`,
    );
  }

  return {
    field,
    value,
  };
}

function mergeUpsertCreateData(
  model: ManifestModel,
  createData: Partial<Record<string, unknown>>,
  conflict: { field: ManifestField; value: unknown },
) {
  const currentValue = createData[conflict.field.name];
  if (currentValue !== undefined && currentValue !== conflict.value) {
    throw new Error(
      `Upsert on model "${model.name}" requires create.${conflict.field.name} to match where.${conflict.field.name}.`,
    );
  }

  return {
    ...createData,
    [conflict.field.name]: currentValue ?? conflict.value,
  };
}

function validateUpsertUpdateData(
  model: ManifestModel,
  updateData: Partial<Record<string, unknown>>,
  conflict: { field: ManifestField; value: unknown },
) {
  const nextValue = updateData[conflict.field.name];
  if (nextValue !== undefined && nextValue !== conflict.value) {
    throw new Error(
      `Upsert on model "${model.name}" cannot change the conflict field "${conflict.field.name}".`,
    );
  }
}

function compileFieldFilter(
  model: ManifestModel,
  fieldName: string,
  filter: unknown,
  dialect: SqlDialect,
  state: QueryState,
) {
  const field = model.fields[fieldName];
  if (!field) {
    throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
  }

  const column = `${quoteIdentifier(model.table, dialect)}.${quoteIdentifier(field.column, dialect)}`;

  if (!isFilterObject(filter)) {
    if (filter === null) return `${column} is null`;
    const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, filter));
    return `${column} = ${placeholder}`;
  }

  const clauses: string[] = [];

  if ("eq" in filter) {
    if (filter.eq === null) {
      clauses.push(`${column} is null`);
    } else {
      const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, filter.eq));
      clauses.push(`${column} = ${placeholder}`);
    }
  }

  if ("not" in filter) {
    if (filter.not === null) {
      clauses.push(`${column} is not null`);
    } else {
      const placeholder = createPlaceholder(
        dialect,
        state,
        encodeValue(field, dialect, filter.not),
      );
      clauses.push(`${column} <> ${placeholder}`);
    }
  }

  if ("in" in filter) {
    const values = Array.isArray(filter.in) ? filter.in : [];
    if (!values.length) {
      clauses.push("1 = 0");
    } else {
      const placeholders = values.map((value) =>
        createPlaceholder(dialect, state, encodeValue(field, dialect, value)),
      );
      clauses.push(`${column} in (${placeholders.join(", ")})`);
    }
  }

  if ("contains" in filter) {
    const placeholder = createPlaceholder(dialect, state, String(filter.contains ?? ""));
    clauses.push(
      dialect === "postgres"
        ? `strpos(${column}, ${placeholder}) > 0`
        : `instr(${column}, ${placeholder}) > 0`,
    );
  }

  if ("gt" in filter) {
    const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, filter.gt));
    clauses.push(`${column} > ${placeholder}`);
  }

  if ("gte" in filter) {
    const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, filter.gte));
    clauses.push(`${column} >= ${placeholder}`);
  }

  if ("lt" in filter) {
    const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, filter.lt));
    clauses.push(`${column} < ${placeholder}`);
  }

  if ("lte" in filter) {
    const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, filter.lte));
    clauses.push(`${column} <= ${placeholder}`);
  }

  if (!clauses.length) return "1 = 1";
  if (clauses.length === 1) return clauses[0];
  return `(${clauses.join(" and ")})`;
}

function compileWhere(
  model: ManifestModel,
  where: SqlWhere | undefined,
  dialect: SqlDialect,
  state: QueryState,
): string | undefined {
  if (!where) return undefined;

  const clauses: string[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND") {
      const items = Array.isArray(value) ? value : [];
      if (!items.length) continue;
      const nested = items
        .map((item) => compileWhere(model, item as SqlWhere, dialect, state))
        .filter(Boolean)
        .map((item) => `(${item})`);
      if (nested.length) clauses.push(nested.join(" and "));
      continue;
    }

    if (key === "OR") {
      const items = Array.isArray(value) ? value : [];
      if (!items.length) continue;
      const nested = items
        .map((item) => compileWhere(model, item as SqlWhere, dialect, state))
        .filter(Boolean)
        .map((item) => `(${item})`);
      if (nested.length) clauses.push(`(${nested.join(" or ")})`);
      continue;
    }

    if (key === "NOT") {
      const nested = compileWhere(model, value as SqlWhere, dialect, state);
      if (nested) clauses.push(`not (${nested})`);
      continue;
    }

    clauses.push(compileFieldFilter(model, key, value, dialect, state));
  }

  if (!clauses.length) return undefined;
  return clauses.join(" and ");
}

function compileOrderBy(
  model: ManifestModel,
  orderBy: Partial<Record<string, "asc" | "desc">> | undefined,
  dialect: SqlDialect,
) {
  if (!orderBy) return "";

  const parts = Object.entries(orderBy)
    .filter(([fieldName]) => fieldName in model.fields)
    .map(([fieldName, direction]) => {
      const field = model.fields[fieldName];
      return `${quoteIdentifier(model.table, dialect)}.${quoteIdentifier(field.column, dialect)} ${
        direction === "desc" ? "desc" : "asc"
      }`;
    });

  if (!parts.length) return "";
  return ` order by ${parts.join(", ")}`;
}

function compilePagination(
  dialect: SqlDialect,
  take: number | undefined,
  skip: number | undefined,
) {
  if (take === undefined && skip === undefined) return "";

  if (take !== undefined && skip !== undefined) {
    return ` limit ${take} offset ${skip}`;
  }

  if (take !== undefined) {
    return ` limit ${take}`;
  }

  if (dialect === "postgres") {
    return ` offset ${skip ?? 0}`;
  }

  if (dialect === "mysql") {
    return ` limit 18446744073709551615 offset ${skip ?? 0}`;
  }

  return ` limit -1 offset ${skip ?? 0}`;
}

function buildSelectStatement(
  model: ManifestModel,
  dialect: SqlDialect,
  args: {
    where?: SqlWhere;
    orderBy?: Partial<Record<string, "asc" | "desc">>;
    take?: number;
    skip?: number;
  },
) {
  const state: QueryState = { params: [] };
  const selectList = Object.values(model.fields).map(
    (field) =>
      `${quoteIdentifier(model.table, dialect)}.${quoteIdentifier(field.column, dialect)} as ${quoteIdentifier(field.name, dialect)}`,
  );

  let sql = `select ${selectList.join(", ")} from ${quoteIdentifier(model.table, dialect)}`;
  const where = compileWhere(model, args.where, dialect, state);
  if (where) sql += ` where ${where}`;
  sql += compileOrderBy(model, args.orderBy, dialect);
  sql += compilePagination(dialect, args.take, args.skip);

  return { sql, params: state.params };
}

function buildCountStatement(
  model: ManifestModel,
  dialect: SqlDialect,
  where: SqlWhere | undefined,
) {
  const state: QueryState = { params: [] };
  let sql = `select count(*) as ${quoteIdentifier("count", dialect)} from ${quoteIdentifier(model.table, dialect)}`;
  const compiledWhere = compileWhere(model, where, dialect, state);
  if (compiledWhere) sql += ` where ${compiledWhere}`;
  return { sql, params: state.params };
}

function buildInsertRow(model: ManifestModel, data: Partial<Record<string, unknown>>) {
  const row: SqlRow = {};

  for (const field of Object.values(model.fields)) {
    row[field.name] = applyDefault(data[field.name], field);
  }

  return row;
}

function buildIdentityWhere(model: ManifestModel, row: SqlRow) {
  const field = identityField(model);
  const value = row[field.name];
  if (value === undefined) {
    throw new Error(
      `Model "${model.name}" could not resolve the identity field "${field.name}" from the current row.`,
    );
  }
  return {
    [field.name]: value,
  } as SqlWhere;
}

function buildInsertStatement(model: ManifestModel, dialect: SqlDialect, row: SqlRow) {
  const state: QueryState = { params: [] };
  const fields = Object.values(model.fields).filter((field) => row[field.name] !== undefined);
  const columns = fields.map((field) => quoteIdentifier(field.column, dialect));
  const values = fields.map((field) =>
    createPlaceholder(dialect, state, encodeValue(field, dialect, row[field.name])),
  );

  return {
    sql: `insert into ${quoteIdentifier(model.table, dialect)} (${columns.join(", ")}) values (${values.join(", ")})`,
    params: state.params,
  };
}

function buildUpsertStatement(
  model: ManifestModel,
  dialect: SqlDialect,
  row: SqlRow,
  updateData: Partial<Record<string, unknown>>,
  conflictField: ManifestField,
) {
  const state: QueryState = { params: [] };
  const insertFields = Object.values(model.fields).filter((field) => row[field.name] !== undefined);
  const columns = insertFields.map((field) => quoteIdentifier(field.column, dialect));
  const values = insertFields.map((field) =>
    createPlaceholder(dialect, state, encodeValue(field, dialect, row[field.name])),
  );
  const updateEntries = Object.entries(updateData).filter(([, value]) => value !== undefined);
  const conflictColumn = quoteIdentifier(conflictField.column, dialect);

  let sql = `insert into ${quoteIdentifier(model.table, dialect)} (${columns.join(", ")}) values (${values.join(", ")})`;

  if (dialect === "mysql") {
    const updateClause = updateEntries.length
      ? updateEntries.map(([fieldName, value]) => {
          const field = model.fields[fieldName];
          if (!field) {
            throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
          }
          const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, value));
          return `${quoteIdentifier(field.column, dialect)} = ${placeholder}`;
        })
      : [`${conflictColumn} = ${conflictColumn}`];

    sql += ` on duplicate key update ${updateClause.join(", ")}`;

    return {
      sql,
      params: state.params,
    };
  }

  if (!updateEntries.length) {
    sql += ` on conflict (${conflictColumn}) do nothing`;
    return {
      sql,
      params: state.params,
    };
  }

  const updateClause = updateEntries.map(([fieldName, value]) => {
    const field = model.fields[fieldName];
    if (!field) {
      throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
    }
    const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, value));
    return `${quoteIdentifier(field.column, dialect)} = ${placeholder}`;
  });

  sql += ` on conflict (${conflictColumn}) do update set ${updateClause.join(", ")}`;

  return {
    sql,
    params: state.params,
  };
}

function buildUpdateStatement(
  model: ManifestModel,
  dialect: SqlDialect,
  data: Partial<Record<string, unknown>>,
  where: SqlWhere,
) {
  const state: QueryState = { params: [] };
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return null;
  }

  const setClause = entries.map(([fieldName, value]) => {
    const field = model.fields[fieldName];
    if (!field) {
      throw new Error(`Unknown field "${fieldName}" on model "${model.name}".`);
    }
    const placeholder = createPlaceholder(dialect, state, encodeValue(field, dialect, value));
    return `${quoteIdentifier(field.column, dialect)} = ${placeholder}`;
  });

  const compiledWhere = compileWhere(model, where, dialect, state);
  if (!compiledWhere) {
    throw new Error(`Update on model "${model.name}" requires a where clause.`);
  }

  return {
    sql: `update ${quoteIdentifier(model.table, dialect)} set ${setClause.join(", ")} where ${compiledWhere}`,
    params: state.params,
  };
}

function buildDeleteStatement(model: ManifestModel, dialect: SqlDialect, where: SqlWhere) {
  const state: QueryState = { params: [] };
  const compiledWhere = compileWhere(model, where, dialect, state);
  if (!compiledWhere) {
    throw new Error(`Delete on model "${model.name}" requires a where clause.`);
  }

  return {
    sql: `delete from ${quoteIdentifier(model.table, dialect)} where ${compiledWhere}`,
    params: state.params,
  };
}

function createSqliteAdapter(database: SqliteDatabaseLike): SqlAdapter {
  let transactionDepth = 0;

  const adapter: SqlAdapter = {
    dialect: "sqlite",
    async query(sql, params) {
      const statement = database.prepare(sql);
      if (/^\s*(select|with)\b/i.test(sql)) {
        const rows = statement.all(...params) as SqlRow[];
        return {
          rows,
          affectedRows: rows.length,
        };
      }

      const result = statement.run(...params) as SqliteRunResult;
      return {
        rows: [],
        affectedRows: Number(result?.changes ?? 0),
      };
    },
    async transaction(run) {
      const savepoint = `farming_labs_${transactionDepth + 1}`;

      if (transactionDepth === 0) {
        database.exec("begin");
      } else {
        database.exec(`savepoint ${savepoint}`);
      }

      transactionDepth += 1;

      try {
        const result = await run(adapter);
        transactionDepth -= 1;

        if (transactionDepth === 0) {
          database.exec("commit");
        } else {
          database.exec(`release savepoint ${savepoint}`);
        }

        return result;
      } catch (error) {
        transactionDepth -= 1;

        if (transactionDepth === 0) {
          database.exec("rollback");
        } else {
          database.exec(`rollback to savepoint ${savepoint}`);
          database.exec(`release savepoint ${savepoint}`);
        }

        throw error;
      }
    },
  };

  return adapter;
}

function createPgTransactionalAdapter(client: PgClientLike): SqlAdapter {
  let transactionDepth = 0;

  const adapter: SqlAdapter = {
    dialect: "postgres",
    async query(sql, params) {
      const result = await client.query(sql, params);
      return {
        rows: result.rows ?? [],
        affectedRows: Number(result.rowCount ?? result.rows?.length ?? 0),
      };
    },
    async transaction(run) {
      const savepoint = `farming_labs_${transactionDepth + 1}`;

      if (transactionDepth === 0) {
        await client.query("begin");
      } else {
        await client.query(`savepoint ${savepoint}`);
      }

      transactionDepth += 1;

      try {
        const result = await run(adapter);
        transactionDepth -= 1;

        if (transactionDepth === 0) {
          await client.query("commit");
        } else {
          await client.query(`release savepoint ${savepoint}`);
        }

        return result;
      } catch (error) {
        transactionDepth -= 1;

        if (transactionDepth === 0) {
          await client.query("rollback");
        } else {
          await client.query(`rollback to savepoint ${savepoint}`);
          await client.query(`release savepoint ${savepoint}`);
        }

        throw error;
      }
    },
  };

  return adapter;
}

function createPgPoolAdapter(pool: PgPoolLike): SqlAdapter {
  return {
    dialect: "postgres",
    async query(sql, params) {
      const result = await pool.query(sql, params);
      return {
        rows: result.rows ?? [],
        affectedRows: Number(result.rowCount ?? result.rows?.length ?? 0),
      };
    },
    async transaction(run) {
      const client = await pool.connect();
      try {
        return await createPgTransactionalAdapter(client).transaction(run);
      } finally {
        client.release?.();
      }
    },
  };
}

function createMysqlTransactionalAdapter(connection: MysqlConnectionLike): SqlAdapter {
  let transactionDepth = 0;

  const adapter: SqlAdapter = {
    dialect: "mysql",
    async query(sql, params) {
      const [result] = await connection.execute(sql, params);
      if (Array.isArray(result)) {
        return {
          rows: result as SqlRow[],
          affectedRows: result.length,
        };
      }

      return {
        rows: [],
        affectedRows: Number((result as MysqlExecuteResult).affectedRows ?? 0),
      };
    },
    async transaction(run) {
      const savepoint = `farming_labs_${transactionDepth + 1}`;

      if (transactionDepth === 0) {
        await connection.beginTransaction();
      } else {
        await connection.execute(`savepoint ${savepoint}`);
      }

      transactionDepth += 1;

      try {
        const result = await run(adapter);
        transactionDepth -= 1;

        if (transactionDepth === 0) {
          await connection.commit();
        } else {
          await connection.execute(`release savepoint ${savepoint}`);
        }

        return result;
      } catch (error) {
        transactionDepth -= 1;

        if (transactionDepth === 0) {
          await connection.rollback();
        } else {
          await connection.execute(`rollback to savepoint ${savepoint}`);
          await connection.execute(`release savepoint ${savepoint}`);
        }

        throw error;
      }
    },
  };

  return adapter;
}

function createMysqlPoolAdapter(pool: MysqlPoolLike): SqlAdapter {
  return {
    dialect: "mysql",
    async query(sql, params) {
      const [result] = await pool.execute(sql, params);
      if (Array.isArray(result)) {
        return {
          rows: result as SqlRow[],
          affectedRows: result.length,
        };
      }

      return {
        rows: [],
        affectedRows: Number((result as MysqlExecuteResult).affectedRows ?? 0),
      };
    },
    async transaction(run) {
      const connection = await pool.getConnection();
      try {
        return await createMysqlTransactionalAdapter(connection).transaction(run);
      } finally {
        connection.release?.();
      }
    },
  };
}

function createSqlDriver<TSchema extends SchemaDefinition<any>>(
  adapter: SqlAdapter,
): OrmDriver<TSchema> {
  async function loadRows<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: SqlWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      take?: number;
      skip?: number;
      select?: TSelect;
    },
  ): Promise<Array<SelectedRecord<TSchema, TModelName, TSelect>>> {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const statement = buildSelectStatement(model, adapter.dialect, args);
    const result = await adapter.query(statement.sql, statement.params);
    const rows = result.rows.map((row) => decodeRow(model, row));

    return Promise.all(rows.map((row) => projectRow(schema, modelName, row, args.select)));
  }

  async function loadOneRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: SqlWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
      select?: TSelect;
    },
  ) {
    const rows = await loadRows(schema, modelName, {
      ...args,
      take: 1,
    });
    return rows[0] ?? null;
  }

  async function loadRawOneRow<TModelName extends ModelName<TSchema>>(
    schema: TSchema,
    modelName: TModelName,
    args: {
      where?: SqlWhere;
      orderBy?: Partial<Record<string, "asc" | "desc">>;
    },
  ) {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const statement = buildSelectStatement(model, adapter.dialect, {
      ...args,
      take: 1,
    });
    const result = await adapter.query(statement.sql, statement.params);
    const row = result.rows[0];
    return row ? decodeRow(model, row) : null;
  }

  async function projectRow<
    TModelName extends ModelName<TSchema>,
    TSelect extends SelectShape<TSchema, TModelName> | undefined,
  >(
    schema: TSchema,
    modelName: TModelName,
    row: SqlRow,
    select?: TSelect,
  ): Promise<SelectedRecord<TSchema, TModelName, TSelect>> {
    const manifest = getManifest(schema);
    const model = manifest.models[modelName];
    const output: SqlRow = {};

    if (!select) {
      for (const fieldName of Object.keys(model.fields)) {
        output[fieldName] = row[fieldName];
      }
      return output as SelectedRecord<TSchema, TModelName, TSelect>;
    }

    for (const [key, value] of Object.entries(select)) {
      if (value === undefined) continue;

      if (key in model.fields && value === true) {
        output[key] = row[key];
        continue;
      }

      if (key in schema.models[modelName].relations) {
        output[key] = await resolveRelation(
          schema,
          modelName,
          key as RelationName<TSchema, TModelName>,
          row,
          value as true | FindManyArgs<TSchema, any, any>,
        );
      }
    }

    return output as SelectedRecord<TSchema, TModelName, TSelect>;
  }

  async function resolveRelation<
    TModelName extends ModelName<TSchema>,
    TRelationName extends RelationName<TSchema, TModelName>,
  >(
    schema: TSchema,
    modelName: TModelName,
    relationName: TRelationName,
    row: SqlRow,
    value: true | FindManyArgs<TSchema, any, any>,
  ) {
    const manifest = getManifest(schema);
    const relation = schema.models[modelName].relations[relationName];
    const relationArgs = value === true ? {} : value;

    if (relation.kind === "belongsTo") {
      const foreignField = manifest.models[modelName].fields[relation.foreignKey];
      const targetReference = parseReference(foreignField?.references);
      const targetField =
        targetReference?.field ?? identityField(manifest.models[relation.target]).name;
      const foreignValue = row[relation.foreignKey];

      if (foreignValue == null) return null;

      return loadOneRow(schema, relation.target as ModelName<TSchema>, {
        where: mergeWhere(
          relationArgs.where as SqlWhere | undefined,
          {
            [targetField]: foreignValue,
          } as SqlWhere,
        ),
        orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
        select: relationArgs.select,
      });
    }

    if (relation.kind === "hasOne") {
      const targetModel = manifest.models[relation.target];
      const foreignField = targetModel.fields[relation.foreignKey];
      const sourceReference = parseReference(foreignField?.references);
      const sourceField = sourceReference?.field ?? identityField(manifest.models[modelName]).name;
      const sourceValue = row[sourceField];

      if (sourceValue == null) return null;

      return loadOneRow(schema, relation.target as ModelName<TSchema>, {
        where: mergeWhere(
          relationArgs.where as SqlWhere | undefined,
          {
            [relation.foreignKey]: sourceValue,
          } as SqlWhere,
        ),
        orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
        select: relationArgs.select,
      });
    }

    if (relation.kind === "hasMany") {
      const targetModel = manifest.models[relation.target];
      const foreignField = targetModel.fields[relation.foreignKey];
      const sourceReference = parseReference(foreignField?.references);
      const sourceField = sourceReference?.field ?? identityField(manifest.models[modelName]).name;
      const sourceValue = row[sourceField];

      if (sourceValue == null) return [];

      return loadRows(schema, relation.target as ModelName<TSchema>, {
        where: mergeWhere(
          relationArgs.where as SqlWhere | undefined,
          {
            [relation.foreignKey]: sourceValue,
          } as SqlWhere,
        ),
        orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
        take: relationArgs.take,
        skip: relationArgs.skip,
        select: relationArgs.select,
      });
    }

    const throughModel = manifest.models[relation.through];
    const throughFromReference = parseReference(throughModel.fields[relation.from]?.references);
    const throughToReference = parseReference(throughModel.fields[relation.to]?.references);
    const sourceField =
      throughFromReference?.field ?? identityField(manifest.models[modelName]).name;
    const targetField =
      throughToReference?.field ?? identityField(manifest.models[relation.target]).name;
    const sourceValue = row[sourceField];

    if (sourceValue == null) return [];

    const throughRows = await loadRows(schema, relation.through as ModelName<TSchema>, {
      where: {
        [relation.from]: sourceValue,
      } as SqlWhere,
    });

    const targetIds = throughRows
      .map((item: SqlRow) => item[relation.to])
      .filter((item) => item != null);
    if (!targetIds.length) return [];

    return loadRows(schema, relation.target as ModelName<TSchema>, {
      where: mergeWhere(
        relationArgs.where as SqlWhere | undefined,
        {
          [targetField]: {
            in: targetIds,
          },
        } as SqlWhere,
      ),
      orderBy: relationArgs.orderBy as Partial<Record<string, "asc" | "desc">> | undefined,
      take: relationArgs.take,
      skip: relationArgs.skip,
      select: relationArgs.select,
    });
  }

  const driver: OrmDriver<TSchema> = {
    async findMany(schema, model, args) {
      return loadRows(schema, model, args);
    },
    async findFirst(schema, model, args) {
      return loadOneRow(schema, model, args);
    },
    async findUnique(schema, model, args) {
      return loadOneRow(schema, model, args);
    },
    async count(schema, model, args?: CountArgs<TSchema, ModelName<TSchema>>) {
      const manifest = getManifest(schema);
      const statement = buildCountStatement(
        manifest.models[model],
        adapter.dialect,
        args?.where as SqlWhere | undefined,
      );
      const result = await adapter.query(statement.sql, statement.params);
      const rawCount = result.rows[0]?.count;
      if (typeof rawCount === "number") return rawCount;
      return Number.parseInt(String(rawCount ?? 0), 10);
    },
    async create(schema, model, args) {
      const manifest = getManifest(schema);
      identityField(manifest.models[model]);
      const row = buildInsertRow(
        manifest.models[model],
        args.data as Partial<Record<string, unknown>>,
      );
      const statement = buildInsertStatement(manifest.models[model], adapter.dialect, row);
      await adapter.query(statement.sql, statement.params);
      return loadOneRow(schema, model, {
        where: buildIdentityWhere(manifest.models[model], row),
        select: args.select,
      }) as Promise<any>;
    },
    async createMany(schema, model, args) {
      const results: unknown[] = [];
      for (const entry of args.data) {
        results.push(
          await driver.create(schema, model, {
            data: entry,
            select: args.select,
          } as CreateArgs<TSchema, ModelName<TSchema>, any>),
        );
      }
      return results as any;
    },
    async update(schema, model, args) {
      const manifest = getManifest(schema);
      const current = await loadRawOneRow(schema, model, {
        where: args.where as SqlWhere,
      });

      if (!current) return null;

      const update = buildUpdateStatement(
        manifest.models[model],
        adapter.dialect,
        args.data as Partial<Record<string, unknown>>,
        buildIdentityWhere(manifest.models[model], current),
      );

      if (update) {
        await adapter.query(update.sql, update.params);
      }

      return loadOneRow(schema, model, {
        where: buildIdentityWhere(manifest.models[model], current),
        select: args.select,
      }) as Promise<any>;
    },
    async updateMany(schema, model, args) {
      const manifest = getManifest(schema);
      const update = buildUpdateStatement(
        manifest.models[model],
        adapter.dialect,
        args.data as Partial<Record<string, unknown>>,
        args.where as SqlWhere,
      );

      if (!update) return 0;
      const result = await adapter.query(update.sql, update.params);
      return result.affectedRows;
    },
    async upsert(schema, model, args) {
      const manifest = getManifest(schema);
      const modelManifest = manifest.models[model];
      const conflict = extractUpsertConflict(modelManifest, args.where as SqlWhere);
      validateUpsertUpdateData(
        modelManifest,
        args.update as Partial<Record<string, unknown>>,
        conflict,
      );
      const row = buildInsertRow(
        modelManifest,
        mergeUpsertCreateData(
          modelManifest,
          args.create as Partial<Record<string, unknown>>,
          conflict,
        ),
      );
      const statement = buildUpsertStatement(
        modelManifest,
        adapter.dialect,
        row,
        args.update as Partial<Record<string, unknown>>,
        conflict.field,
      );

      await adapter.query(statement.sql, statement.params);

      return loadOneRow(schema, model, {
        where: args.where as SqlWhere,
        select: args.select,
      }) as Promise<any>;
    },
    async delete(schema, model, args) {
      const manifest = getManifest(schema);
      const current = await loadRawOneRow(schema, model, {
        where: args.where as SqlWhere,
      });

      if (!current) return 0;

      const statement = buildDeleteStatement(
        manifest.models[model],
        adapter.dialect,
        buildIdentityWhere(manifest.models[model], current),
      );
      const result = await adapter.query(statement.sql, statement.params);
      return result.affectedRows;
    },
    async deleteMany(schema, model, args) {
      const manifest = getManifest(schema);
      const statement = buildDeleteStatement(
        manifest.models[model],
        adapter.dialect,
        args.where as SqlWhere,
      );
      const result = await adapter.query(statement.sql, statement.params);
      return result.affectedRows;
    },
    async transaction(_schema, run) {
      return adapter.transaction(async (txAdapter) => run(createSqlDriver(txAdapter)));
    },
  };

  return driver;
}

export function createSqliteDriver<TSchema extends SchemaDefinition<any>>(
  database: SqliteDatabaseLike,
) {
  return createSqlDriver<TSchema>(createSqliteAdapter(database));
}

export function createPgPoolDriver<TSchema extends SchemaDefinition<any>>(pool: PgPoolLike) {
  return createSqlDriver<TSchema>(createPgPoolAdapter(pool));
}

export function createPgClientDriver<TSchema extends SchemaDefinition<any>>(client: PgClientLike) {
  return createSqlDriver<TSchema>(createPgTransactionalAdapter(client));
}

export function createMysqlDriver<TSchema extends SchemaDefinition<any>>(
  poolOrConnection: MysqlPoolLike | MysqlConnectionLike,
) {
  const adapter =
    "getConnection" in poolOrConnection
      ? createMysqlPoolAdapter(poolOrConnection)
      : createMysqlTransactionalAdapter(poolOrConnection);
  return createSqlDriver<TSchema>(adapter);
}

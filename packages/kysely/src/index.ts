import type { OrmDriver, SchemaDefinition } from "@farming-labs/orm";
import { createSqlDriverFromAdapter, type SqlAdapterLike } from "@farming-labs/orm-sql";
import { CompiledQuery, type Compilable, type QueryResult } from "kysely";

export type KyselyDialect = "sqlite" | "mysql" | "postgres";

export type KyselyDatabaseLike = {
  executeQuery<R>(query: Readonly<ReturnType<typeof CompiledQuery.raw>> | Compilable<R>): Promise<
    Pick<QueryResult<R>, "rows" | "numAffectedRows" | "numChangedRows">
  >;
  transaction(): {
    execute<TResult>(run: (trx: KyselyDatabaseLike) => Promise<TResult>): Promise<TResult>;
  };
};

export type KyselyDriverConfig<TSchema extends SchemaDefinition<any>> = {
  db: KyselyDatabaseLike;
  dialect: KyselyDialect;
};

function toAffectedRows(value: bigint | number | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

function createKyselyAdapter(db: KyselyDatabaseLike, dialect: KyselyDialect): SqlAdapterLike {
  return {
    dialect,
    async query(sql, params) {
      const result = await db.executeQuery(CompiledQuery.raw(sql, [...params]));

      return {
        rows: (result.rows ?? []) as Record<string, unknown>[],
        affectedRows: toAffectedRows(result.numAffectedRows ?? result.numChangedRows),
      };
    },
    async transaction(run) {
      return db.transaction().execute(async (trx) => run(createKyselyAdapter(trx, dialect)));
    },
  };
}

export function createKyselyDriver<TSchema extends SchemaDefinition<any>>(
  config: KyselyDriverConfig<TSchema>,
): OrmDriver<TSchema> {
  return createSqlDriverFromAdapter<TSchema>(createKyselyAdapter(config.db, config.dialect));
}

import type { OrmDriver, SchemaDefinition } from "@farming-labs/orm";
import {
  createMysqlDriver,
  createPgClientDriver,
  createPgPoolDriver,
  createSqliteDriver,
  type MysqlConnectionLike,
  type MysqlPoolLike,
  type PgClientLike,
  type PgPoolLike,
  type SqliteDatabaseLike,
} from "@farming-labs/orm-sql";

export type DrizzleDialect = "sqlite" | "mysql" | "postgres";

export type DrizzleDatabaseLike = object & {
  $client?: unknown;
};

export type DrizzleDriverConfig<TSchema extends SchemaDefinition<any>> = {
  db?: DrizzleDatabaseLike;
  client?: unknown;
  dialect: DrizzleDialect;
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

function resolveClient(config: DrizzleDriverConfig<any>) {
  const client = config.client ?? config.db?.$client;

  if (!client) {
    throw new Error(
      'Drizzle runtime requires a Drizzle database with a "$client" property or an explicit "client" option.',
    );
  }

  return client;
}

function createPostgresDrizzleDriver<TSchema extends SchemaDefinition<any>>(client: unknown) {
  if (hasFunction(client, "connect") && hasFunction(client, "query")) {
    return createPgPoolDriver<TSchema>(client as PgPoolLike);
  }

  if (hasFunction(client, "query")) {
    return createPgClientDriver<TSchema>(client as PgClientLike);
  }

  throw new Error(
    "Drizzle postgres runtime expects a node-postgres Pool or Client under db.$client.",
  );
}

function createMysqlDrizzleDriver<TSchema extends SchemaDefinition<any>>(client: unknown) {
  if (hasFunction(client, "getConnection") && hasFunction(client, "execute")) {
    return createMysqlDriver<TSchema>(client as MysqlPoolLike);
  }

  if (
    hasFunction(client, "execute") &&
    hasFunction(client, "beginTransaction") &&
    hasFunction(client, "commit") &&
    hasFunction(client, "rollback")
  ) {
    return createMysqlDriver<TSchema>(client as MysqlConnectionLike);
  }

  throw new Error(
    "Drizzle mysql runtime expects a mysql2 Pool or transactional Connection under db.$client.",
  );
}

function createSqliteDrizzleDriver<TSchema extends SchemaDefinition<any>>(client: unknown) {
  if (hasFunction(client, "prepare") && hasFunction(client, "exec")) {
    return createSqliteDriver<TSchema>(client as SqliteDatabaseLike);
  }

  throw new Error(
    "Drizzle sqlite runtime expects a sqlite-compatible database with prepare() and exec() under db.$client.",
  );
}

export function createDrizzleDriver<TSchema extends SchemaDefinition<any>>(
  config: DrizzleDriverConfig<TSchema>,
): OrmDriver<TSchema> {
  const client = resolveClient(config);

  switch (config.dialect) {
    case "postgres":
      return createPostgresDrizzleDriver<TSchema>(client);
    case "mysql":
      return createMysqlDrizzleDriver<TSchema>(client);
    case "sqlite":
      return createSqliteDrizzleDriver<TSchema>(client);
  }
}

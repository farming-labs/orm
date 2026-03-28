import {
  createDriverHandle,
  type OrmDriver,
  type OrmDriverHandle,
  type SchemaDefinition,
} from "@farming-labs/orm";
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

export type DrizzleDriverHandle<TClient = unknown> = OrmDriverHandle<
  "drizzle",
  TClient,
  DrizzleDialect
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function hasFunction<TName extends string>(
  value: unknown,
  name: TName,
): value is Record<TName, (...args: any[]) => unknown> {
  return isRecord(value) && typeof value[name] === "function";
}

function resolveRuntimeClient(config: DrizzleDriverConfig<any>) {
  const client = config.client ?? config.db?.$client;

  if (!client) {
    throw new Error(
      'Drizzle runtime requires a Drizzle database with a "$client" property or an explicit "client" option.',
    );
  }

  return client;
}

function wrapDrizzleDriver<TSchema extends SchemaDefinition<any>, TClient>(
  driver: OrmDriver<TSchema, any>,
  handle: DrizzleDriverHandle<TClient>,
): OrmDriver<TSchema, DrizzleDriverHandle<TClient>> {
  return {
    handle,
    findMany(schema, model, args) {
      return driver.findMany(schema, model, args);
    },
    findFirst(schema, model, args) {
      return driver.findFirst(schema, model, args);
    },
    findUnique(schema, model, args) {
      return driver.findUnique(schema, model, args);
    },
    count(schema, model, args) {
      return driver.count(schema, model, args);
    },
    create(schema, model, args) {
      return driver.create(schema, model, args);
    },
    createMany(schema, model, args) {
      return driver.createMany(schema, model, args);
    },
    update(schema, model, args) {
      return driver.update(schema, model, args);
    },
    updateMany(schema, model, args) {
      return driver.updateMany(schema, model, args);
    },
    upsert(schema, model, args) {
      return driver.upsert(schema, model, args);
    },
    delete(schema, model, args) {
      return driver.delete(schema, model, args);
    },
    deleteMany(schema, model, args) {
      return driver.deleteMany(schema, model, args);
    },
    transaction(schema, run) {
      return driver.transaction(schema, async (txDriver) =>
        run(wrapDrizzleDriver(txDriver, handle)),
      );
    },
  };
}

function createPostgresDrizzleDriver<TSchema extends SchemaDefinition<any>, TClient>(
  runtimeClient: unknown,
  handle: DrizzleDriverHandle<TClient>,
) {
  if (hasFunction(runtimeClient, "connect") && hasFunction(runtimeClient, "query")) {
    return wrapDrizzleDriver(createPgPoolDriver<TSchema>(runtimeClient as PgPoolLike), handle);
  }

  if (hasFunction(runtimeClient, "query")) {
    return wrapDrizzleDriver(createPgClientDriver<TSchema>(runtimeClient as PgClientLike), handle);
  }

  throw new Error(
    "Drizzle postgres runtime expects a node-postgres Pool or Client under db.$client.",
  );
}

function createMysqlDrizzleDriver<TSchema extends SchemaDefinition<any>, TClient>(
  runtimeClient: unknown,
  handle: DrizzleDriverHandle<TClient>,
) {
  if (hasFunction(runtimeClient, "getConnection") && hasFunction(runtimeClient, "execute")) {
    return wrapDrizzleDriver(createMysqlDriver<TSchema>(runtimeClient as MysqlPoolLike), handle);
  }

  if (
    hasFunction(runtimeClient, "execute") &&
    hasFunction(runtimeClient, "beginTransaction") &&
    hasFunction(runtimeClient, "commit") &&
    hasFunction(runtimeClient, "rollback")
  ) {
    return wrapDrizzleDriver(
      createMysqlDriver<TSchema>(runtimeClient as MysqlConnectionLike),
      handle,
    );
  }

  throw new Error(
    "Drizzle mysql runtime expects a mysql2 Pool or transactional Connection under db.$client.",
  );
}

function createSqliteDrizzleDriver<TSchema extends SchemaDefinition<any>, TClient>(
  runtimeClient: unknown,
  handle: DrizzleDriverHandle<TClient>,
) {
  if (hasFunction(runtimeClient, "prepare") && hasFunction(runtimeClient, "exec")) {
    return wrapDrizzleDriver(
      createSqliteDriver<TSchema>(runtimeClient as SqliteDatabaseLike),
      handle,
    );
  }

  throw new Error(
    "Drizzle sqlite runtime expects a sqlite-compatible database with prepare() and exec() under db.$client.",
  );
}

export function createDrizzleDriver<TSchema extends SchemaDefinition<any>>(
  config: DrizzleDriverConfig<TSchema>,
): OrmDriver<TSchema, DrizzleDriverHandle<DrizzleDatabaseLike | unknown>> {
  const runtimeClient = resolveRuntimeClient(config);
  const handle: DrizzleDriverHandle<DrizzleDatabaseLike | unknown> = createDriverHandle({
    kind: "drizzle",
    client: config.db ?? config.client ?? runtimeClient,
    dialect: config.dialect,
    capabilities: {
      numericIds: "manual",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsTransactions: true,
      supportsSchemaNamespaces: config.dialect === "postgres",
      supportsTransactionalDDL: config.dialect !== "mysql",
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
    },
  });

  switch (config.dialect) {
    case "postgres":
      return createPostgresDrizzleDriver<TSchema, DrizzleDatabaseLike | unknown>(
        runtimeClient,
        handle,
      );
    case "mysql":
      return createMysqlDrizzleDriver<TSchema, DrizzleDatabaseLike | unknown>(
        runtimeClient,
        handle,
      );
    case "sqlite":
      return createSqliteDrizzleDriver<TSchema, DrizzleDatabaseLike | unknown>(
        runtimeClient,
        handle,
      );
  }
}

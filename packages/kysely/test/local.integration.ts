import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import mysqlCore from "mysql2";
import { Pool } from "pg";
import {
  Kysely,
  MysqlDialect,
  PostgresDialect,
  SqliteDialect,
  type SqliteDatabase,
  type SqliteStatement,
} from "kysely";
import {
  createOrm,
  defineSchema,
  detectDatabaseRuntime,
  id,
  model,
  renderSafeSql,
  string,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
import { createKyselyDriver, type KyselyDatabaseLike, type KyselyDialect } from "../src";
import {
  assertEnumBigintAndDecimalQueries,
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertIntegerAndJsonQueries,
  assertModelLevelConstraints,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  schema,
  type RuntimeOrm,
} from "../../drizzle/test/support/auth";

type RuntimeFactory = () => Promise<{
  orm: RuntimeOrm;
  driverClient: KyselyDatabaseLike;
  dialect: KyselyDialect;
  close: () => Promise<void>;
}>;

const LOCAL_TIMEOUT_MS = 30_000;
const kyselyTargets = ["sqlite", "postgresql", "mysql"] as const;

type KyselyTarget = (typeof kyselyTargets)[number];

const semicolonDefaultSchema = defineSchema({
  note: model({
    table: "notes",
    fields: {
      id: id(),
      body: string().default("hello;world"),
    },
  }),
});

const requestedTargetValues = (process.env.FARM_ORM_LOCAL_KYSELY_TARGETS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const invalidTargets = requestedTargetValues.filter(
  (value): value is string => !(kyselyTargets as readonly string[]).includes(value),
);

if (invalidTargets.length) {
  throw new Error(
    `Invalid FARM_ORM_LOCAL_KYSELY_TARGETS values: ${invalidTargets.join(", ")}. Expected one of: ${kyselyTargets.join(", ")}.`,
  );
}

const requestedTargets = new Set(requestedTargetValues as KyselyTarget[]);

function shouldRunTarget(target: KyselyTarget) {
  return requestedTargets.size === 0 || requestedTargets.has(target);
}

function createIsolatedName(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/-/g, "_");
}

function assignDatabase(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function formatLocalDbError(label: string, error: unknown, hint: string) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `${label} local Kysely integration test could not connect. ${hint}\nOriginal error: ${message}`,
  );
}

function mysqlPoolConfig(connectionString: string) {
  return {
    uri: connectionString,
    supportBigNumbers: true,
    bigNumberStrings: true,
  } as const;
}

async function applyStatements(run: (sql: string) => Promise<unknown> | unknown, sql: string) {
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await run(`${statement};`);
  }
}

class NodeSqliteStatementAdapter implements SqliteStatement {
  readonly #statement: ReturnType<DatabaseSync["prepare"]>;
  readonly #sql: string;

  constructor(statement: ReturnType<DatabaseSync["prepare"]>, sql: string) {
    this.#statement = statement;
    this.#sql = sql;
    (
      this.#statement as ReturnType<DatabaseSync["prepare"]> & {
        setReadBigInts?: (enabled: boolean) => void;
      }
    ).setReadBigInts?.(true);
  }

  get reader() {
    return /^\s*(select|with|pragma|explain)\b/i.test(this.#sql);
  }

  all(parameters: ReadonlyArray<unknown>) {
    return this.#statement.all(...(parameters as any[])) as unknown[];
  }

  run(parameters: ReadonlyArray<unknown>) {
    const result = this.#statement.run(...(parameters as any[])) as {
      changes?: number | bigint;
      lastInsertRowid?: number | bigint;
    };

    return {
      changes: result.changes ?? 0,
      lastInsertRowid: result.lastInsertRowid ?? 0,
    };
  }

  iterate(parameters: ReadonlyArray<unknown>) {
    const statement = this.#statement as {
      iterate?: (...params: ReadonlyArray<unknown>) => IterableIterator<unknown>;
    };

    if (typeof statement.iterate === "function") {
      return statement.iterate(...parameters);
    }

    return this.all(parameters)[Symbol.iterator]();
  }
}

class NodeSqliteDatabaseAdapter implements SqliteDatabase {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  close() {
    this.#database.close();
  }

  prepare(sql: string) {
    return new NodeSqliteStatementAdapter(this.#database.prepare(sql), sql);
  }
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
    "PostgreSQL",
    lastError,
    `Make sure a local PostgreSQL server is running and reachable via FARM_ORM_LOCAL_PG_ADMIN_URL (tried: ${candidates.join(", ")}).`,
  );
}

async function resolveMysqlAdminUrl() {
  const candidates = [
    process.env.FARM_ORM_LOCAL_MYSQL_ADMIN_URL,
    "mysql://root@127.0.0.1:3306",
    "mysql://root:root@127.0.0.1:3306",
  ].filter(Boolean) as string[];

  let lastError: unknown;
  for (const candidate of candidates) {
    const pool = mysql.createPool(mysqlPoolConfig(candidate));
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
    "MySQL",
    lastError,
    `Make sure a local MySQL server is running and reachable via FARM_ORM_LOCAL_MYSQL_ADMIN_URL (tried: ${candidates.join(", ")}).`,
  );
}

async function createLocalSqliteOrm() {
  const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-kysely-sqlite-"));
  const databasePath = path.join(directory, "kysely.db");
  const client = new DatabaseSync(databasePath, { readBigInts: true });

  await applyStatements(client.exec.bind(client), renderSafeSql(schema, { dialect: "sqlite" }));

  const db = new Kysely({
    dialect: new SqliteDialect({
      database: new NodeSqliteDatabaseAdapter(client),
    }),
  });
  const orm = createOrm({
    schema,
    driver: createKyselyDriver<typeof schema>({
      db,
      dialect: "sqlite",
    }),
  }) as RuntimeOrm;

  return {
    orm,
    driverClient: db,
    dialect: "sqlite",
    close: async () => {
      await db.destroy();
      await rm(directory, { recursive: true, force: true });
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalPostgresOrm() {
  const adminUrl = await resolvePostgresAdminUrl();
  const databaseName = createIsolatedName("farm_orm_kysely_pg");
  const adminPool = new Pool({ connectionString: adminUrl });

  try {
    await adminPool.query(`create database "${databaseName}"`);
  } catch (error) {
    await adminPool.end();
    throw formatLocalDbError(
      "PostgreSQL",
      error,
      `Make sure a local PostgreSQL server is running and reachable via FARM_ORM_LOCAL_PG_ADMIN_URL (resolved admin URL: ${adminUrl}).`,
    );
  }

  await adminPool.end();

  const databaseUrl = assignDatabase(adminUrl, databaseName);
  const pool = new Pool({ connectionString: databaseUrl });
  pool.on("error", () => undefined);

  try {
    await applyStatements(
      (statement) => pool.query(statement),
      renderSafeSql(schema, { dialect: "postgres" }),
    );
  } catch (error) {
    await pool.end().catch(() => undefined);
    const cleanupAdmin = new Pool({ connectionString: adminUrl });
    await cleanupAdmin.query(`drop database if exists "${databaseName}"`);
    await cleanupAdmin.end();
    throw error;
  }

  const db = new Kysely({
    dialect: new PostgresDialect({
      pool,
    }),
  });
  const orm = createOrm({
    schema,
    driver: createKyselyDriver<typeof schema>({
      db,
      dialect: "postgres",
    }),
  }) as RuntimeOrm;

  return {
    orm,
    driverClient: db,
    dialect: "postgres",
    close: async () => {
      await db.destroy();
      const cleanupAdmin = new Pool({ connectionString: adminUrl });
      await cleanupAdmin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [databaseName],
      );
      await cleanupAdmin.query(`drop database if exists "${databaseName}"`);
      await cleanupAdmin.end();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalMysqlOrm() {
  const adminUrl = await resolveMysqlAdminUrl();
  const databaseName = createIsolatedName("farm_orm_kysely_mysql");
  const adminPool = mysql.createPool(mysqlPoolConfig(adminUrl));

  try {
    await adminPool.query(`create database \`${databaseName}\``);
  } catch (error) {
    await adminPool.end();
    throw formatLocalDbError(
      "MySQL",
      error,
      `Make sure a local MySQL server is running and reachable via FARM_ORM_LOCAL_MYSQL_ADMIN_URL (resolved admin URL: ${adminUrl}).`,
    );
  }

  await adminPool.end();

  const databaseUrl = assignDatabase(adminUrl, databaseName);
  const setupPool = mysql.createPool(mysqlPoolConfig(databaseUrl));

  try {
    await applyStatements(
      (statement) => setupPool.query(statement),
      renderSafeSql(schema, { dialect: "mysql" }),
    );
  } catch (error) {
    await setupPool.end().catch(() => undefined);
    const cleanupAdmin = mysql.createPool(mysqlPoolConfig(adminUrl));
    await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
    await cleanupAdmin.end();
    throw error;
  }

  await setupPool.end();

  const pool = mysqlCore.createPool(mysqlPoolConfig(databaseUrl));
  const db = new Kysely({
    dialect: new MysqlDialect({
      pool,
    }),
  });
  const orm = createOrm({
    schema,
    driver: createKyselyDriver<typeof schema>({
      db,
      dialect: "mysql",
    }),
  }) as RuntimeOrm;

  return {
    orm,
    driverClient: db,
    dialect: "mysql",
    close: async () => {
      await db.destroy();
      const cleanupAdmin = mysql.createPool(mysqlPoolConfig(adminUrl));
      await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
      await cleanupAdmin.end();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

const runtimeFactories: Record<KyselyTarget, RuntimeFactory> = {
  sqlite: createLocalSqliteOrm,
  postgresql: createLocalPostgresOrm,
  mysql: createLocalMysqlOrm,
};

describe("local Kysely integration", () => {
  it(
    "sqlite local Kysely integration > pushSchema handles semicolons inside string defaults",
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-kysely-splitter-"));
      const databasePath = path.join(directory, "splitter.db");
      const client = new DatabaseSync(databasePath, { readBigInts: true });
      const db = new Kysely({
        dialect: new SqliteDialect({
          database: new NodeSqliteDatabaseAdapter(client),
        }),
      });

      try {
        await pushSchema({
          schema: semicolonDefaultSchema,
          client: db,
        });

        const columns = client.prepare("pragma table_info('notes')").all() as Array<{
          name: string;
          dflt_value: string | null;
        }>;

        expect(columns.find((column) => column.name === "body")?.dflt_value).toBe("'hello;world'");
      } finally {
        await db.destroy();
        await rm(directory, { recursive: true, force: true });
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  it(
    "sqlite local Kysely integration > pushes and bootstraps schema through @farming-labs/orm-runtime",
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-kysely-runtime-"));
      const databasePath = path.join(directory, "runtime.db");
      const client = new DatabaseSync(databasePath, { readBigInts: true });
      const db = new Kysely({
        dialect: new SqliteDialect({
          database: new NodeSqliteDatabaseAdapter(client),
        }),
      });

      try {
        await pushSchema({
          schema,
          client: db,
        });

        const orm = (await bootstrapDatabase({
          schema,
          client: db,
        })) as RuntimeOrm;

        const created = await orm.user.create({
          data: {
            email: "runtime@farminglabs.dev",
            name: "Runtime",
          },
          select: {
            id: true,
            email: true,
          },
        });

        expect(created).toEqual({
          id: expect.any(String),
          email: "runtime@farminglabs.dev",
        });
      } finally {
        await db.destroy();
        await rm(directory, { recursive: true, force: true });
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  for (const target of kyselyTargets) {
    if (!shouldRunTarget(target)) continue;

    it(
      `${target} local Kysely integration > exposes the live Kysely instance on orm.$driver`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          expect(runtime.orm.$driver.kind).toBe("kysely");
          expect(runtime.orm.$driver.dialect).toBe(runtime.dialect);
          expect(runtime.orm.$driver.client).toBe(runtime.driverClient);
          expect(detectDatabaseRuntime(runtime.driverClient)).toEqual({
            kind: "kysely",
            client: runtime.driverClient,
            dialect: runtime.dialect,
            source: "db",
          });
          expect(runtime.orm.$driver.capabilities).toEqual({
            supportsNumericIds: false,
            supportsJSON: true,
            supportsDates: true,
            supportsBooleans: true,
            supportsTransactions: true,
            supportsSchemaNamespaces: runtime.dialect === "postgres",
            supportsTransactionalDDL: runtime.dialect !== "mysql",
            supportsJoin: false,
            nativeRelationLoading: "partial",
            textComparison: "database-default",
            upsert: "native",
            returning: {
              create: true,
              update: true,
              delete: false,
            },
          });
          expect(Object.isFrozen(runtime.orm.$driver)).toBe(true);
          expect(Object.isFrozen(runtime.orm.$driver.capabilities)).toBe(true);
          expect(Object.isFrozen(runtime.orm.$driver.capabilities.returning)).toBe(true);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > creates and uses a real Kysely database against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          const created = await runtime.orm.user.create({
            data: {
              email: "ada@farminglabs.dev",
              name: "Ada",
            },
            select: {
              id: true,
              email: true,
            },
          });

          const count = await runtime.orm.user.count({
            where: {
              email: "ada@farminglabs.dev",
            },
          });

          expect(created).toEqual({
            id: expect.any(String),
            email: "ada@farminglabs.dev",
          });
          expect(count).toBe(1);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > creates an ORM directly from the live Kysely instance`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          const orm = (await createOrmFromRuntime({
            schema,
            client: runtime.driverClient,
          })) as RuntimeOrm;

          const created = await orm.user.create({
            data: {
              email: "auto@farminglabs.dev",
              name: "Auto",
            },
            select: {
              id: true,
              email: true,
            },
          });

          const count = await orm.user.count({
            where: {
              email: "auto@farminglabs.dev",
            },
          });

          expect(orm.$driver.kind).toBe("kysely");
          expect(orm.$driver.dialect).toBe(runtime.dialect);
          expect(orm.$driver.client).toBe(runtime.driverClient);
          expect(created).toEqual({
            id: expect.any(String),
            email: "auto@farminglabs.dev",
          });
          expect(count).toBe(1);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > supports one-to-one and one-to-many reads against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          await assertOneToOneAndHasManyQueries(runtime.orm, expect);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > supports belongsTo and many-to-many traversal against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          await assertBelongsToAndManyToManyQueries(runtime.orm, expect);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > supports updates, upserts, deletes, and transaction rollback against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          await assertMutationQueries(runtime.orm, expect, {
            expectTransactionRollback: true,
          });
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > supports compound-unique lookups and upserts against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          await assertCompoundUniqueQueries(runtime.orm, expect);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > supports integer and json fields against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          await assertIntegerAndJsonQueries(runtime.orm, expect);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > supports enum, bigint, and decimal fields against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          await assertEnumBigintAndDecimalQueries(runtime.orm, expect);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Kysely integration > enforces model-level constraints against a real local database`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          await assertModelLevelConstraints(runtime.orm, expect);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );
  }
});

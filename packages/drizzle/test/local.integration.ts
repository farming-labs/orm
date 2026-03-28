import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import { createOrm, detectDatabaseRuntime, renderSafeSql } from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
import { createDrizzleDriver, type DrizzleDialect } from "../src";
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
} from "./support/auth";

type RuntimeFactory = () => Promise<{
  orm: RuntimeOrm;
  driverClient: unknown;
  rawClient: unknown;
  dialect: DrizzleDialect;
  close: () => Promise<void>;
}>;

const LOCAL_TIMEOUT_MS = 30_000;
const drizzleTargets = ["sqlite", "postgresql", "mysql"] as const;

type DrizzleTarget = (typeof drizzleTargets)[number];

const requestedTargetValues = (process.env.FARM_ORM_LOCAL_DRIZZLE_TARGETS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const invalidTargets = requestedTargetValues.filter(
  (value): value is string => !(drizzleTargets as readonly string[]).includes(value),
);

if (invalidTargets.length) {
  throw new Error(
    `Invalid FARM_ORM_LOCAL_DRIZZLE_TARGETS values: ${invalidTargets.join(", ")}. Expected one of: ${drizzleTargets.join(", ")}.`,
  );
}

const requestedTargets = new Set(requestedTargetValues as DrizzleTarget[]);

function shouldRunTarget(target: DrizzleTarget) {
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
    `${label} local Drizzle integration test could not connect. ${hint}\nOriginal error: ${message}`,
  );
}

function createMysqlPool(connectionString: string) {
  return mysql.createPool({
    uri: connectionString,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
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
    const pool = createMysqlPool(candidate);
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
  const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-drizzle-sqlite-"));
  const databasePath = path.join(directory, "drizzle.db");
  const client = new DatabaseSync(databasePath, { readBigInts: true });

  await applyStatements(client.exec.bind(client), renderSafeSql(schema, { dialect: "sqlite" }));

  const db = drizzleSqlite(async (sql, params, method) => {
    const statement = client.prepare(sql);
    (
      statement as typeof statement & {
        setReadBigInts?: (enabled: boolean) => void;
      }
    ).setReadBigInts?.(true);

    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }

    if (method === "get") {
      const row = statement.get(...params) as Record<string, unknown> | undefined;
      return { rows: row ? [row] : [] };
    }

    return {
      rows: statement.all(...params) as Record<string, unknown>[],
    };
  });
  const orm = createOrm({
    schema,
    driver: createDrizzleDriver<typeof schema>({
      db,
      client,
      dialect: "sqlite",
    }),
  }) as RuntimeOrm;

  return {
    orm,
    driverClient: db,
    rawClient: client,
    dialect: "sqlite",
    close: async () => {
      client.close();
      await rm(directory, { recursive: true, force: true });
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalPostgresOrm() {
  const adminUrl = await resolvePostgresAdminUrl();
  const databaseName = createIsolatedName("farm_orm_drizzle_pg");
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

  const db = drizzlePostgres(pool);
  const orm = createOrm({
    schema,
    driver: createDrizzleDriver<typeof schema>({
      db,
      dialect: "postgres",
    }),
  }) as RuntimeOrm;

  return {
    orm,
    driverClient: db,
    rawClient: pool,
    dialect: "postgres",
    close: async () => {
      await pool.end();
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
  const databaseName = createIsolatedName("farm_orm_drizzle_mysql");
  const adminPool = createMysqlPool(adminUrl);

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
  const pool = createMysqlPool(databaseUrl);

  try {
    await applyStatements(
      (statement) => pool.query(statement),
      renderSafeSql(schema, { dialect: "mysql" }),
    );
  } catch (error) {
    await pool.end().catch(() => undefined);
    const cleanupAdmin = createMysqlPool(adminUrl);
    await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
    await cleanupAdmin.end();
    throw error;
  }

  const db = drizzleMysql(pool);
  const orm = createOrm({
    schema,
    driver: createDrizzleDriver<typeof schema>({
      db,
      dialect: "mysql",
    }),
  }) as RuntimeOrm;

  return {
    orm,
    driverClient: db,
    rawClient: pool,
    dialect: "mysql",
    close: async () => {
      await pool.end();
      const cleanupAdmin = createMysqlPool(adminUrl);
      await cleanupAdmin.query(`drop database if exists \`${databaseName}\``);
      await cleanupAdmin.end();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

const runtimeFactories: Record<DrizzleTarget, RuntimeFactory> = {
  sqlite: createLocalSqliteOrm,
  postgresql: createLocalPostgresOrm,
  mysql: createLocalMysqlOrm,
};

describe("local Drizzle integration", () => {
  it(
    "sqlite local Drizzle integration > pushes and bootstraps schema through @farming-labs/orm-runtime",
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-drizzle-runtime-"));
      const databasePath = path.join(directory, "runtime.db");
      const client = new DatabaseSync(databasePath, { readBigInts: true });

      const db = drizzleSqlite(async (sql, params, method) => {
        const statement = client.prepare(sql);
        (
          statement as typeof statement & {
            setReadBigInts?: (enabled: boolean) => void;
          }
        ).setReadBigInts?.(true);

        if (method === "run") {
          statement.run(...params);
          return { rows: [] };
        }

        if (method === "get") {
          const row = statement.get(...params) as Record<string, unknown> | undefined;
          return { rows: row ? [row] : [] };
        }

        return {
          rows: statement.all(...params) as Record<string, unknown>[],
        };
      });

      try {
        await pushSchema({
          schema,
          client: db,
          drizzle: {
            client,
          },
        });

        const orm = (await bootstrapDatabase({
          schema,
          client: db,
          drizzle: {
            client,
          },
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
        client.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  for (const target of drizzleTargets) {
    if (!shouldRunTarget(target)) continue;

    it(
      `${target} local Drizzle integration > exposes the live Drizzle instance on orm.$driver`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          expect(runtime.orm.$driver.kind).toBe("drizzle");
          expect(runtime.orm.$driver.dialect).toBe(runtime.dialect);
          expect(runtime.orm.$driver.client).toBe(runtime.driverClient);
          expect(detectDatabaseRuntime(runtime.driverClient)).toEqual({
            kind: "drizzle",
            client: runtime.driverClient,
            dialect: runtime.dialect,
            source: "db",
          });
          expect(runtime.orm.$driver.capabilities).toEqual({
            supportsNumericIds: true,
            numericIds: "manual",
            supportsJSON: true,
            supportsDates: true,
            supportsBooleans: true,
            supportsTransactions: true,
            supportsSchemaNamespaces: runtime.dialect === "postgres",
            supportsTransactionalDDL: runtime.dialect !== "mysql",
            supportsJoin: false,
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
          });
          expect(Object.isFrozen(runtime.orm.$driver)).toBe(true);
          expect(Object.isFrozen(runtime.orm.$driver.capabilities)).toBe(true);
          expect(Object.isFrozen(runtime.orm.$driver.capabilities.returning)).toBe(true);
          expect(Object.isFrozen(runtime.orm.$driver.capabilities.returningMode)).toBe(true);
          expect(Object.isFrozen(runtime.orm.$driver.capabilities.textMatching)).toBe(true);
          expect(Object.isFrozen(runtime.orm.$driver.capabilities.nativeRelations)).toBe(true);
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local Drizzle integration > creates and uses a real Drizzle database against a real local database`,
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
      `${target} local Drizzle integration > creates an ORM directly from the live Drizzle instance`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          const orm = (await createOrmFromRuntime({
            schema,
            client: runtime.driverClient,
            drizzle: {
              client: runtime.rawClient,
            },
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

          expect(orm.$driver.kind).toBe("drizzle");
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
      `${target} local Drizzle integration > supports one-to-one and one-to-many reads against a real local database`,
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
      `${target} local Drizzle integration > supports belongsTo and many-to-many traversal against a real local database`,
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
      `${target} local Drizzle integration > supports updates, upserts, deletes, and transaction rollback against a real local database`,
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
      `${target} local Drizzle integration > supports compound-unique lookups and upserts against a real local database`,
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
      `${target} local Drizzle integration > supports integer and json fields against a real local database`,
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
      `${target} local Drizzle integration > supports enum, bigint, and decimal fields against a real local database`,
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
      `${target} local Drizzle integration > enforces model-level constraints against a real local database`,
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

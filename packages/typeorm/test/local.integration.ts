import { rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import initSqlJs from "sql.js";
import { DataSource } from "typeorm";
import {
  createOrm,
  defineSchema,
  detectDatabaseRuntime,
  id,
  model,
  string,
} from "@farming-labs/orm";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";
import { bootstrapDatabase, pushSchema } from "@farming-labs/orm-runtime/setup";
import {
  assertBelongsToAndManyToManyQueries,
  assertCompoundUniqueQueries,
  assertEnumBigintAndDecimalQueries,
  assertIntegerAndJsonQueries,
  assertModelLevelConstraints,
  assertMutationQueries,
  assertOneToOneAndHasManyQueries,
  schema,
  type RuntimeOrm,
} from "../../drizzle/test/support/auth";
import { createTypeormDriver, type TypeormDriverDialect } from "../src";

type RuntimeFactory = () => Promise<{
  orm: RuntimeOrm;
  dataSource: DataSource;
  dialect: TypeormDriverDialect;
  close: () => Promise<void>;
}>;

const LOCAL_TIMEOUT_MS = 30_000;
const typeormTargets = ["sqlite", "postgresql", "mysql"] as const;

type TypeormTarget = (typeof typeormTargets)[number];

const runtimeSmokeSchema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
    },
  }),
});

const requestedTargetValues = (process.env.FARM_ORM_LOCAL_TYPEORM_TARGETS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const invalidTargets = requestedTargetValues.filter(
  (value): value is string => !(typeormTargets as readonly string[]).includes(value),
);

if (invalidTargets.length) {
  throw new Error(
    `Invalid FARM_ORM_LOCAL_TYPEORM_TARGETS values: ${invalidTargets.join(", ")}. Expected one of: ${typeormTargets.join(", ")}.`,
  );
}

const requestedTargets = new Set(requestedTargetValues as TypeormTarget[]);

function shouldRunTarget(target: TypeormTarget) {
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
    `${label} local TypeORM integration test could not connect. ${hint}\nOriginal error: ${message}`,
  );
}

function createMysqlPool(connectionString: string) {
  return mysql.createPool({
    uri: connectionString,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
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
  const SQL = await initSqlJs();
  const dataSource = new DataSource({
    type: "sqljs",
    driver: SQL,
    entities: [],
    logging: false,
  });

  await pushSchema({
    schema,
    client: dataSource,
  });

  const orm = createOrm({
    schema,
    driver: createTypeormDriver<typeof schema>({
      dataSource,
    }),
  }) as RuntimeOrm;

  return {
    orm,
    dataSource,
    dialect: "sqlite",
    close: async () => {
      await dataSource.destroy();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalPostgresOrm() {
  const adminUrl = await resolvePostgresAdminUrl();
  const databaseName = createIsolatedName("farm_orm_typeorm_pg");
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
  const dataSource = new DataSource({
    type: "postgres",
    url: databaseUrl,
    entities: [],
    logging: false,
  });

  await pushSchema({
    schema,
    client: dataSource,
  });

  const orm = createOrm({
    schema,
    driver: createTypeormDriver<typeof schema>({
      dataSource,
    }),
  }) as RuntimeOrm;

  return {
    orm,
    dataSource,
    dialect: "postgres",
    close: async () => {
      await dataSource.destroy().catch(() => undefined);

      const cleanupPool = new Pool({ connectionString: adminUrl });
      try {
        await cleanupPool.query(`drop database if exists "${databaseName}"`);
      } finally {
        await cleanupPool.end();
      }
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalMysqlOrm() {
  const adminUrl = await resolveMysqlAdminUrl();
  const databaseName = createIsolatedName("farm_orm_typeorm_mysql");
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
  const dataSource = new DataSource({
    type: "mysql",
    url: databaseUrl,
    supportBigNumbers: true,
    bigNumberStrings: true,
    entities: [],
    logging: false,
  });

  await pushSchema({
    schema,
    client: dataSource,
  });

  const orm = createOrm({
    schema,
    driver: createTypeormDriver<typeof schema>({
      dataSource,
    }),
  }) as RuntimeOrm;

  return {
    orm,
    dataSource,
    dialect: "mysql",
    close: async () => {
      await dataSource.destroy().catch(() => undefined);

      const cleanupPool = createMysqlPool(adminUrl);
      try {
        await cleanupPool.query(`drop database if exists \`${databaseName}\``);
      } finally {
        await cleanupPool.end();
      }
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

const runtimeFactories: Record<TypeormTarget, RuntimeFactory> = {
  sqlite: createLocalSqliteOrm,
  postgresql: createLocalPostgresOrm,
  mysql: createLocalMysqlOrm,
};

describe("typeorm local integration", () => {
  it(
    "sqlite local TypeORM integration > bootstraps schema through @farming-labs/orm-runtime",
    async () => {
      const SQL = await initSqlJs();
      const dataSource = new DataSource({
        type: "sqljs",
        driver: SQL,
        entities: [],
        logging: false,
      });

      try {
        const orm = await bootstrapDatabase({
          schema: runtimeSmokeSchema,
          client: dataSource,
        });

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
        await dataSource.destroy().catch(() => undefined);
      }
    },
    LOCAL_TIMEOUT_MS,
  );

  for (const target of typeormTargets) {
    if (!shouldRunTarget(target)) continue;

    it(
      `${target} local TypeORM integration > exposes the live DataSource on orm.$driver`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          expect(runtime.orm.$driver.kind).toBe("typeorm");
          expect(runtime.orm.$driver.dialect).toBe(runtime.dialect);
          expect(runtime.orm.$driver.client).toBe(runtime.dataSource);
          expect(detectDatabaseRuntime(runtime.dataSource)).toEqual({
            kind: "typeorm",
            client: runtime.dataSource,
            dialect: runtime.dialect,
            source: "connection",
          });
          expect(runtime.orm.$driver.capabilities).toEqual({
            supportsNumericIds: true,
            numericIds: "generated",
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
        } finally {
          await runtime.close();
        }
      },
      LOCAL_TIMEOUT_MS,
    );

    it(
      `${target} local TypeORM integration > creates an ORM directly from the live DataSource`,
      async () => {
        const runtime = await runtimeFactories[target]();

        try {
          const orm = (await createOrmFromRuntime({
            schema,
            client: runtime.dataSource,
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

          expect(orm.$driver.kind).toBe("typeorm");
          expect(orm.$driver.dialect).toBe(runtime.dialect);
          expect(orm.$driver.client).toBe(runtime.dataSource);
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
      `${target} local TypeORM integration > supports one-to-one and one-to-many reads`,
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
      `${target} local TypeORM integration > supports belongsTo and many-to-many traversal`,
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
      `${target} local TypeORM integration > supports updates, upserts, deletes, and rollback`,
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
      `${target} local TypeORM integration > supports compound-unique lookups and upserts`,
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
      `${target} local TypeORM integration > supports integer and json fields`,
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

    if (target !== "sqlite") {
      it(
        `${target} local TypeORM integration > supports enum, bigint, and decimal fields`,
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
    }

    it(
      `${target} local TypeORM integration > enforces model-level constraints`,
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

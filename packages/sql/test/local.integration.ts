import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { Pool } from "pg";
import {
  belongsTo,
  bigint,
  boolean,
  createOrm,
  detectDatabaseRuntime,
  decimal,
  datetime,
  defineSchema,
  enumeration,
  hasMany,
  hasOne,
  id,
  integer,
  json,
  manyToMany,
  model,
  renderSafeSql,
  string,
} from "@farming-labs/orm";
import {
  createMysqlDriver,
  createPgClientDriver,
  createPgPoolDriver,
  createSqliteDriver,
} from "../src";
import type { MysqlConnectionLike, MysqlPoolLike } from "../src";
import { createOrmFromRuntime } from "@farming-labs/orm-runtime";

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
      emailVerified: boolean().default(false).map("email_verified"),
      loginCount: integer().default(0).map("login_count"),
      tier: enumeration(["free", "pro", "enterprise"]).default("free"),
      quota: bigint().default(0n).map("quota_bigint"),
      createdAt: datetime().defaultNow().map("created_at"),
      updatedAt: datetime().defaultNow().map("updated_at"),
    },
    relations: {
      profile: hasOne("profile", { foreignKey: "userId" }),
      sessions: hasMany("session", { foreignKey: "userId" }),
      accounts: hasMany("account", { foreignKey: "userId" }),
      organizations: manyToMany("organization", {
        through: "member",
        from: "userId",
        to: "organizationId",
      }),
    },
  }),
  profile: model({
    table: "profiles",
    fields: {
      id: id(),
      userId: string().unique().references("user.id").map("user_id"),
      bio: string().nullable(),
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
    },
  }),
  session: model({
    table: "sessions",
    fields: {
      id: id(),
      userId: string().references("user.id").map("user_id"),
      token: string().unique(),
      expiresAt: datetime().map("expires_at"),
    },
    constraints: {
      indexes: [["userId", "expiresAt"]],
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
    },
  }),
  account: model({
    table: "accounts",
    fields: {
      id: id(),
      userId: string().references("user.id").map("user_id"),
      provider: string(),
      accountId: string().map("account_id"),
      planTier: enumeration(["oss", "pro", "enterprise"]).default("oss").map("plan_tier"),
      balance: decimal().default("0.00"),
      metadata: json<{
        plan: string;
        scopes: string[];
        flags: { sync: boolean };
      } | null>().nullable(),
    },
    constraints: {
      unique: [["provider", "accountId"]],
      indexes: [["userId", "provider"]],
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
    },
  }),
  organization: model({
    table: "organizations",
    fields: {
      id: id(),
      name: string().unique(),
      slug: string().unique(),
    },
    relations: {
      users: manyToMany("user", {
        through: "member",
        from: "organizationId",
        to: "userId",
      }),
    },
  }),
  member: model({
    table: "members",
    fields: {
      id: id(),
      userId: string().references("user.id").map("user_id"),
      organizationId: string().references("organization.id").map("organization_id"),
      role: string(),
    },
    constraints: {
      unique: [["userId", "organizationId"]],
      indexes: [["organizationId", "role"]],
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
      organization: belongsTo("organization", { foreignKey: "organizationId" }),
    },
  }),
});

type RuntimeOrm = ReturnType<typeof createOrm<typeof schema>>;

type RuntimeFactory = () => Promise<{
  orm: RuntimeOrm;
  driverClient: unknown;
  dialect: "sqlite" | "postgres" | "mysql";
  close: () => Promise<void>;
}>;

type SqlTarget = "sqlite" | "postgres-pool" | "postgres-client" | "mysql-pool" | "mysql-connection";

const requestedTargets = new Set(
  (process.env.FARM_ORM_LOCAL_SQL_TARGETS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function shouldRunTarget(target: SqlTarget) {
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
    `${label} local integration test could not connect. ${hint}\nOriginal error: ${message}`,
  );
}

function asMysqlConnectionLike(connection: mysql.PoolConnection): MysqlConnectionLike {
  return {
    execute(sql, params) {
      return connection.execute(sql, params as any) as ReturnType<MysqlConnectionLike["execute"]>;
    },
    beginTransaction() {
      return connection.beginTransaction();
    },
    commit() {
      return connection.commit();
    },
    rollback() {
      return connection.rollback();
    },
    release() {
      connection.release();
    },
  };
}

function asMysqlPoolLike(pool: mysql.Pool): MysqlPoolLike {
  return {
    execute(sql, params) {
      return pool.execute(sql, params as any) as ReturnType<MysqlPoolLike["execute"]>;
    },
    async getConnection() {
      return asMysqlConnectionLike(await pool.getConnection());
    },
  };
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

async function seedAuthData(orm: RuntimeOrm) {
  const [ada, grace] = await orm.user.createMany({
    data: [
      {
        email: "ada@farminglabs.dev",
        name: "Ada",
        loginCount: 3,
        tier: "pro",
        quota: 9007199254740991n,
      },
      {
        email: "grace@farminglabs.dev",
        name: "Grace",
        loginCount: 1,
        tier: "free",
        quota: 128n,
      },
    ],
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  await orm.profile.create({
    data: {
      userId: ada.id,
      bio: "Writes one storage layer for every stack.",
    },
  });

  await orm.account.create({
    data: {
      userId: ada.id,
      provider: "github",
      accountId: "gh_ada",
      planTier: "oss",
      balance: "12.50",
      metadata: {
        plan: "oss",
        scopes: ["repo:read", "repo:write"],
        flags: {
          sync: true,
        },
      },
    },
  });

  const [acme, farmingLabs] = await orm.organization.createMany({
    data: [
      {
        name: "Acme",
        slug: "acme",
      },
      {
        name: "Farming Labs",
        slug: "farming-labs",
      },
    ],
    select: {
      id: true,
      name: true,
    },
  });

  await orm.member.createMany({
    data: [
      {
        userId: ada.id,
        organizationId: acme.id,
        role: "owner",
      },
      {
        userId: ada.id,
        organizationId: farmingLabs.id,
        role: "member",
      },
    ],
  });

  await orm.session.createMany({
    data: [
      {
        userId: ada.id,
        token: "session-1",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        userId: ada.id,
        token: "session-2",
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        userId: grace.id,
        token: "session-3",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    ],
  });

  return {
    ada,
    grace,
    acme,
    farmingLabs,
  };
}

async function assertModelLevelConstraints(orm: RuntimeOrm) {
  const { ada, acme } = await seedAuthData(orm);

  await expect(
    orm.member.create({
      data: {
        userId: ada.id,
        organizationId: acme.id,
        role: "duplicate",
      },
    }),
  ).rejects.toThrow();

  const memberships = await orm.member.findMany({
    where: {
      userId: ada.id,
      organizationId: acme.id,
    },
    select: {
      role: true,
    },
  });

  expect(memberships).toEqual([{ role: "owner" }]);
}

async function assertCompoundUniqueQueries(orm: RuntimeOrm) {
  const { ada, grace } = await seedAuthData(orm);

  const existingAccount = await orm.account.findUnique({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    select: {
      provider: true,
      accountId: true,
      userId: true,
    },
  });

  const updatedAccount = await orm.account.upsert({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    create: {
      userId: ada.id,
      provider: "github",
      accountId: "gh_ada",
    },
    update: {
      userId: grace.id,
    },
    select: {
      provider: true,
      accountId: true,
      userId: true,
    },
  });

  const createdAccount = await orm.account.upsert({
    where: {
      provider: "google",
      accountId: "google_grace",
    },
    create: {
      userId: grace.id,
      provider: "google",
      accountId: "google_grace",
    },
    update: {
      userId: grace.id,
    },
    select: {
      provider: true,
      accountId: true,
      userId: true,
    },
  });

  const updatedLookup = await orm.account.findUnique({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    select: {
      userId: true,
    },
  });

  expect(existingAccount).toEqual({
    provider: "github",
    accountId: "gh_ada",
    userId: ada.id,
  });
  expect(updatedAccount).toEqual({
    provider: "github",
    accountId: "gh_ada",
    userId: grace.id,
  });
  expect(createdAccount).toEqual({
    provider: "google",
    accountId: "google_grace",
    userId: grace.id,
  });
  expect(updatedLookup).toEqual({
    userId: grace.id,
  });
}

async function assertIntegerAndJsonQueries(orm: RuntimeOrm) {
  const { ada } = await seedAuthData(orm);

  const activeUsers = await orm.user.findMany({
    where: {
      loginCount: {
        gte: 2,
      },
    },
    orderBy: {
      email: "asc",
    },
    select: {
      email: true,
      loginCount: true,
    },
  });

  const account = await orm.account.findUnique({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    select: {
      metadata: true,
    },
  });

  const matchingAccounts = await orm.account.findMany({
    where: {
      metadata: {
        plan: "oss",
        scopes: ["repo:read", "repo:write"],
        flags: {
          sync: true,
        },
      },
    },
    select: {
      provider: true,
      metadata: true,
    },
  });

  const updatedUser = await orm.user.update({
    where: {
      email: "ada@farminglabs.dev",
    },
    data: {
      loginCount: 5,
    },
    select: {
      id: true,
      loginCount: true,
    },
  });

  const updatedAccount = await orm.account.update({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    data: {
      metadata: {
        plan: "pro",
        scopes: ["repo:read", "repo:write", "admin"],
        flags: {
          sync: false,
        },
      },
    },
    select: {
      metadata: true,
    },
  });

  const reloadedAccount = await orm.account.findUnique({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    select: {
      userId: true,
      metadata: true,
    },
  });

  expect(activeUsers).toEqual([
    {
      email: "ada@farminglabs.dev",
      loginCount: 3,
    },
  ]);
  expect(account).toEqual({
    metadata: {
      plan: "oss",
      scopes: ["repo:read", "repo:write"],
      flags: {
        sync: true,
      },
    },
  });
  expect(matchingAccounts).toEqual([
    {
      provider: "github",
      metadata: {
        plan: "oss",
        scopes: ["repo:read", "repo:write"],
        flags: {
          sync: true,
        },
      },
    },
  ]);
  expect(updatedUser).toEqual({
    id: ada.id,
    loginCount: 5,
  });
  expect(updatedAccount).toEqual({
    metadata: {
      plan: "pro",
      scopes: ["repo:read", "repo:write", "admin"],
      flags: {
        sync: false,
      },
    },
  });
  expect(reloadedAccount).toEqual({
    userId: ada.id,
    metadata: {
      plan: "pro",
      scopes: ["repo:read", "repo:write", "admin"],
      flags: {
        sync: false,
      },
    },
  });
}

async function assertEnumBigintAndDecimalQueries(orm: RuntimeOrm) {
  const { ada } = await seedAuthData(orm);

  const premiumUsers = await orm.user.findMany({
    where: {
      tier: "pro",
      quota: {
        gte: 1024n,
      },
    },
    orderBy: {
      email: "asc",
    },
    select: {
      email: true,
      tier: true,
      quota: true,
    },
  });

  const account = await orm.account.findUnique({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    select: {
      planTier: true,
      balance: true,
    },
  });

  const matchedAccounts = await orm.account.findMany({
    where: {
      planTier: "oss",
      balance: "12.50",
    },
    select: {
      planTier: true,
      balance: true,
    },
  });

  const upgradedUser = await orm.user.update({
    where: {
      email: "ada@farminglabs.dev",
    },
    data: {
      tier: "enterprise",
      quota: 9007199254741991n,
    },
    select: {
      tier: true,
      quota: true,
    },
  });

  const updatedAccount = await orm.account.update({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    data: {
      planTier: "pro",
      balance: "19.95",
    },
    select: {
      planTier: true,
      balance: true,
    },
  });

  const reloadedAccount = await orm.account.findUnique({
    where: {
      provider: "github",
      accountId: "gh_ada",
    },
    select: {
      userId: true,
      planTier: true,
      balance: true,
    },
  });

  expect(premiumUsers).toEqual([
    {
      email: "ada@farminglabs.dev",
      tier: "pro",
      quota: 9007199254740991n,
    },
  ]);
  expect(account).toEqual({
    planTier: "oss",
    balance: "12.5",
  });
  expect(matchedAccounts).toEqual([
    {
      planTier: "oss",
      balance: "12.5",
    },
  ]);
  expect(upgradedUser).toEqual({
    tier: "enterprise",
    quota: 9007199254741991n,
  });
  expect(updatedAccount).toEqual({
    planTier: "pro",
    balance: "19.95",
  });
  expect(reloadedAccount).toEqual({
    userId: ada.id,
    planTier: "pro",
    balance: "19.95",
  });
}

async function exerciseRuntime(orm: RuntimeOrm) {
  const { ada, grace } = await seedAuthData(orm);

  const user = await orm.user.findUnique({
    where: {
      email: "ada@farminglabs.dev",
    },
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          bio: true,
        },
      },
      sessions: {
        orderBy: {
          token: "desc",
        },
        take: 1,
        select: {
          token: true,
        },
      },
      organizations: {
        orderBy: {
          name: "asc",
        },
        select: {
          name: true,
        },
      },
    },
  });

  const session = await orm.session.findUnique({
    where: {
      token: "session-2",
    },
    select: {
      token: true,
      user: {
        select: {
          email: true,
          organizations: {
            where: {
              slug: {
                contains: "farming",
              },
            },
            select: {
              slug: true,
            },
          },
        },
      },
    },
  });

  const updatedUser = await orm.user.update({
    where: {
      email: "ada@farminglabs.dev",
    },
    data: {
      emailVerified: true,
    },
    select: {
      email: true,
      emailVerified: true,
    },
  });

  const updatedSessions = await orm.session.updateMany({
    where: {
      userId: ada.id,
    },
    data: {
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    },
  });

  const rotatedSession = await orm.session.upsert({
    where: {
      token: "session-2",
    },
    create: {
      userId: ada.id,
      token: "session-2",
      expiresAt: new Date("2028-01-01T00:00:00.000Z"),
    },
    update: {
      expiresAt: new Date("2028-01-01T00:00:00.000Z"),
    },
    select: {
      token: true,
      expiresAt: true,
    },
  });

  const deletedMany = await orm.session.deleteMany({
    where: {
      userId: grace.id,
    },
  });

  await expect(
    orm.transaction(async (tx) => {
      await tx.user.create({
        data: {
          email: "rollback@farminglabs.dev",
          name: "Rollback",
        },
      });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");

  const rollbackCount = await orm.user.count({
    where: {
      email: "rollback@farminglabs.dev",
    },
  });

  const summary = await orm.batch([
    (tx) =>
      tx.user.findUnique({
        where: {
          id: ada.id,
        },
        select: {
          email: true,
          emailVerified: true,
        },
      }),
    (tx) =>
      tx.session.count({
        where: {
          userId: ada.id,
        },
      }),
  ] as const);

  expect(user).toEqual({
    id: ada.id,
    email: "ada@farminglabs.dev",
    profile: {
      bio: "Writes one storage layer for every stack.",
    },
    sessions: [{ token: "session-2" }],
    organizations: [{ name: "Acme" }, { name: "Farming Labs" }],
  });
  expect(session).toEqual({
    token: "session-2",
    user: {
      email: "ada@farminglabs.dev",
      organizations: [{ slug: "farming-labs" }],
    },
  });
  expect(updatedUser).toEqual({
    email: "ada@farminglabs.dev",
    emailVerified: true,
  });
  expect(updatedSessions).toBe(2);
  expect(rotatedSession).toEqual({
    token: "session-2",
    expiresAt: new Date("2028-01-01T00:00:00.000Z"),
  });
  expect(deletedMany).toBe(1);
  expect(rollbackCount).toBe(0);
  expect(summary).toEqual([
    {
      email: "ada@farminglabs.dev",
      emailVerified: true,
    },
    2,
  ]);
}

async function createLocalSqliteOrm() {
  const directory = await mkdtemp(path.join(tmpdir(), "farm-orm-sqlite-"));
  const databasePath = path.join(directory, "local.db");
  const database = new DatabaseSync(databasePath, { readBigInts: true });

  await applyStatements(
    (statement) => database.exec(statement),
    renderSafeSql(schema, { dialect: "sqlite" }),
  );

  return {
    orm: createOrm({
      schema,
      driver: createSqliteDriver(database),
    }),
    driverClient: database,
    dialect: "sqlite",
    close: async () => {
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalPostgresPoolOrm() {
  const adminUrl = await (async () => {
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
  })();
  const databaseName = createIsolatedName("farm_orm_pg");
  const adminPool = new Pool({ connectionString: adminUrl });

  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    await adminPool.end();
    throw formatLocalDbError(
      "PostgreSQL",
      error,
      `Make sure a local PostgreSQL server is running and reachable via FARM_ORM_LOCAL_PG_ADMIN_URL (current default: ${adminUrl}).`,
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
    await pool.end();
    const cleanupAdmin = new Pool({ connectionString: adminUrl });
    await cleanupAdmin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await cleanupAdmin.end();
    throw error;
  }

  return {
    orm: createOrm({
      schema,
      driver: createPgPoolDriver(pool),
    }),
    driverClient: pool,
    dialect: "postgres",
    close: async () => {
      await pool.end();
      const cleanupAdmin = new Pool({ connectionString: adminUrl });
      await cleanupAdmin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      );
      await cleanupAdmin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await cleanupAdmin.end();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalPostgresClientOrm() {
  const adminUrl = await (async () => {
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
  })();
  const databaseName = createIsolatedName("farm_orm_pg_client");
  const adminPool = new Pool({ connectionString: adminUrl });

  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    await adminPool.end();
    throw formatLocalDbError(
      "PostgreSQL",
      error,
      `Make sure a local PostgreSQL server is running and reachable via FARM_ORM_LOCAL_PG_ADMIN_URL (current default: ${adminUrl}).`,
    );
  }

  await adminPool.end();

  const databaseUrl = assignDatabase(adminUrl, databaseName);
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await applyStatements(
      (statement) => client.query(statement),
      renderSafeSql(schema, { dialect: "postgres" }),
    );
  } catch (error) {
    client.release();
    await pool.end();
    const cleanupAdmin = new Pool({ connectionString: adminUrl });
    await cleanupAdmin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await cleanupAdmin.end();
    throw error;
  }

  return {
    orm: createOrm({
      schema,
      driver: createPgClientDriver(client),
    }),
    driverClient: client,
    dialect: "postgres",
    close: async () => {
      client.release();
      await pool.end();
      const cleanupAdmin = new Pool({ connectionString: adminUrl });
      await cleanupAdmin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      );
      await cleanupAdmin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await cleanupAdmin.end();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalMysqlPoolOrm() {
  const adminUrl = process.env.FARM_ORM_LOCAL_MYSQL_ADMIN_URL ?? "mysql://root@127.0.0.1:3306";
  const databaseName = createIsolatedName("farm_orm_mysql");
  const adminPool = createMysqlPool(adminUrl);

  try {
    await adminPool.query(`CREATE DATABASE \`${databaseName}\``);
  } catch (error) {
    await adminPool.end();
    throw formatLocalDbError(
      "MySQL",
      error,
      `Make sure a local MySQL server is running and reachable via FARM_ORM_LOCAL_MYSQL_ADMIN_URL (current default: ${adminUrl}).`,
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
    await pool.end();
    const cleanupAdmin = createMysqlPool(adminUrl);
    await cleanupAdmin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await cleanupAdmin.end();
    throw error;
  }

  const driverClient = asMysqlPoolLike(pool);

  return {
    orm: createOrm({
      schema,
      driver: createMysqlDriver(driverClient),
    }),
    driverClient,
    dialect: "mysql",
    close: async () => {
      await pool.end();
      const cleanupAdmin = createMysqlPool(adminUrl);
      await cleanupAdmin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      await cleanupAdmin.end();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

async function createLocalMysqlConnectionOrm() {
  const adminUrl = process.env.FARM_ORM_LOCAL_MYSQL_ADMIN_URL ?? "mysql://root@127.0.0.1:3306";
  const databaseName = createIsolatedName("farm_orm_mysql_conn");
  const adminPool = createMysqlPool(adminUrl);

  try {
    await adminPool.query(`CREATE DATABASE \`${databaseName}\``);
  } catch (error) {
    await adminPool.end();
    throw formatLocalDbError(
      "MySQL",
      error,
      `Make sure a local MySQL server is running and reachable via FARM_ORM_LOCAL_MYSQL_ADMIN_URL (current default: ${adminUrl}).`,
    );
  }

  await adminPool.end();

  const databaseUrl = assignDatabase(adminUrl, databaseName);
  const pool = createMysqlPool(databaseUrl);
  const connection = await pool.getConnection();

  try {
    await applyStatements(
      (statement) => connection.query(statement),
      renderSafeSql(schema, { dialect: "mysql" }),
    );
  } catch (error) {
    connection.release();
    await pool.end();
    const cleanupAdmin = createMysqlPool(adminUrl);
    await cleanupAdmin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await cleanupAdmin.end();
    throw error;
  }

  const driverClient = asMysqlConnectionLike(connection);

  return {
    orm: createOrm({
      schema,
      driver: createMysqlDriver(driverClient),
    }),
    driverClient,
    dialect: "mysql",
    close: async () => {
      connection.release();
      await pool.end();
      const cleanupAdmin = createMysqlPool(adminUrl);
      await cleanupAdmin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      await cleanupAdmin.end();
    },
  } satisfies Awaited<ReturnType<RuntimeFactory>>;
}

for (const [target, factory] of [
  ["sqlite", createLocalSqliteOrm],
  ["postgres-pool", createLocalPostgresPoolOrm],
  ["postgres-client", createLocalPostgresClientOrm],
  ["mysql-pool", createLocalMysqlPoolOrm],
  ["mysql-connection", createLocalMysqlConnectionOrm],
] as const satisfies ReadonlyArray<readonly [SqlTarget, RuntimeFactory]>) {
  describe.runIf(shouldRunTarget(target))(`${target} local integration`, () => {
    it("exposes the live SQL client on orm.$driver", async () => {
      const { orm, driverClient, dialect, close } = await factory();

      try {
        expect(orm.$driver.kind).toBe("sql");
        expect(orm.$driver.dialect).toBe(dialect);
        expect(orm.$driver.client).toBe(driverClient);
        expect(detectDatabaseRuntime(driverClient)).toEqual({
          kind: "sql",
          client: driverClient,
          dialect,
          source:
            target === "sqlite"
              ? "database"
              : target === "postgres-pool" || target === "mysql-pool"
                ? "pool"
                : target === "mysql-connection"
                  ? "connection"
                  : "client",
        });
        expect(orm.$driver.capabilities).toEqual({
          supportsNumericIds: false,
          supportsJSON: true,
          supportsDates: true,
          supportsBooleans: true,
          supportsTransactions: true,
          supportsJoin: false,
          nativeRelationLoading: "partial",
        });
        expect(Object.isFrozen(orm.$driver)).toBe(true);
        expect(Object.isFrozen(orm.$driver.capabilities)).toBe(true);
      } finally {
        await close();
      }
    });

    it("creates an ORM directly from the raw SQL runtime client", async () => {
      const { driverClient, dialect, close } = await factory();

      try {
        const orm = createOrmFromRuntime({
          schema,
          client: driverClient,
        }) as RuntimeOrm;

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

        expect(orm.$driver.kind).toBe("sql");
        expect(orm.$driver.dialect).toBe(dialect);
        expect(orm.$driver.client).toBe(driverClient);
        expect(created).toEqual({
          id: expect.any(String),
          email: "auto@farminglabs.dev",
        });
        expect(count).toBe(1);
      } finally {
        await close();
      }
    });

    it("keeps read-only driver capabilities inside a real database transaction", async () => {
      const { orm, close } = await factory();

      try {
        await orm.transaction(async (tx) => {
          expect(tx.$driver).toBe(orm.$driver);
          expect(tx.$driver.kind).toBe("sql");
          expect(tx.$driver.capabilities.supportsTransactions).toBe(true);
          expect(tx.$driver.capabilities.nativeRelationLoading).toBe("partial");
          expect(Object.isFrozen(tx.$driver)).toBe(true);
          expect(Object.isFrozen(tx.$driver.capabilities)).toBe(true);
        });
      } finally {
        await close();
      }
    });

    it("runs the auth-style runtime flow against a real local database", async () => {
      const { orm, close } = await factory();

      try {
        await exerciseRuntime(orm);
      } finally {
        await close();
      }
    });

    it("enforces model-level constraints against a real local database", async () => {
      const { orm, close } = await factory();

      try {
        await assertModelLevelConstraints(orm);
      } finally {
        await close();
      }
    });

    it("supports compound-unique lookups and upserts against a real local database", async () => {
      const { orm, close } = await factory();

      try {
        await assertCompoundUniqueQueries(orm);
      } finally {
        await close();
      }
    });

    it("supports integer and json fields against a real local database", async () => {
      const { orm, close } = await factory();

      try {
        await assertIntegerAndJsonQueries(orm);
      } finally {
        await close();
      }
    });

    it("supports enum, bigint, and decimal fields against a real local database", async () => {
      const { orm, close } = await factory();

      try {
        await assertEnumBigintAndDecimalQueries(orm);
      } finally {
        await close();
      }
    });
  });
}

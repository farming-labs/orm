import { createAuthStore } from "../auth-store";
import { alwaysAvailable, probeMongo, probeMysql, probePostgres } from "./shared/availability";
import type { DemoAdapterFactory, DemoAdapterInput, DemoAdapterName } from "./shared/types";
import { createMemoryRuntime } from "./memory";
import { createMongooseRuntime } from "./mongoose";
import { createMongoRuntime } from "./mongo";
import { createPrismaRuntime } from "./prisma";
import { createDrizzleMysqlRuntime } from "./drizzle/mysql";
import { createDrizzlePostgresRuntime } from "./drizzle/postgres";
import { createDrizzleSqliteRuntime } from "./drizzle/sqlite";
import { createMysqlConnectionRuntime, createMysqlPoolRuntime } from "./sql/mysql";
import { createPostgresClientRuntime, createPostgresPoolRuntime } from "./sql/postgres";
import { createSqliteRuntime } from "./sql/sqlite";

export type * from "./shared/types";

export const demoAdapters: Record<DemoAdapterName, DemoAdapterFactory> = {
  memory: {
    label: "Memory runtime",
    client: "Seeded in-memory store",
    availability: alwaysAvailable,
    create: createMemoryRuntime,
  },
  sqlite: {
    label: "SQLite runtime",
    client: "node:sqlite DatabaseSync",
    availability: alwaysAvailable,
    create: createSqliteRuntime,
  },
  "drizzle-sqlite": {
    label: "Drizzle runtime (sqlite)",
    client: "Drizzle sqlite-proxy",
    availability: alwaysAvailable,
    create: createDrizzleSqliteRuntime,
  },
  prisma: {
    label: "Prisma runtime",
    client: "Generated PrismaClient",
    availability: alwaysAvailable,
    create: createPrismaRuntime,
  },
  "postgres-pool": {
    label: "PostgreSQL runtime (pool)",
    client: "pg Pool",
    availability: probePostgres,
    create: createPostgresPoolRuntime,
  },
  "postgres-client": {
    label: "PostgreSQL runtime (client)",
    client: "pg Client",
    availability: probePostgres,
    create: createPostgresClientRuntime,
  },
  "drizzle-postgres": {
    label: "Drizzle runtime (postgres)",
    client: "Drizzle node-postgres",
    availability: probePostgres,
    create: createDrizzlePostgresRuntime,
  },
  "mysql-pool": {
    label: "MySQL runtime (pool)",
    client: "mysql2 pool",
    availability: probeMysql,
    create: createMysqlPoolRuntime,
  },
  "mysql-connection": {
    label: "MySQL runtime (connection)",
    client: "mysql2 connection",
    availability: probeMysql,
    create: createMysqlConnectionRuntime,
  },
  "drizzle-mysql": {
    label: "Drizzle runtime (mysql)",
    client: "Drizzle mysql2",
    availability: probeMysql,
    create: createDrizzleMysqlRuntime,
  },
  mongo: {
    label: "MongoDB runtime (native)",
    client: "mongodb MongoClient",
    availability: probeMongo,
    create: createMongoRuntime,
  },
  mongoose: {
    label: "MongoDB runtime",
    client: "Mongoose models",
    availability: probeMongo,
    create: createMongooseRuntime,
  },
};

export const selfContainedDemoAdapters = [
  "memory",
  "sqlite",
  "drizzle-sqlite",
  "prisma",
] as const satisfies readonly DemoAdapterName[];

export const localDemoAdapters = [
  "postgres-pool",
  "postgres-client",
  "drizzle-postgres",
  "mysql-pool",
  "mysql-connection",
  "drizzle-mysql",
  "mongo",
  "mongoose",
] as const satisfies readonly DemoAdapterName[];

export const allDemoAdapters = Object.keys(demoAdapters) as DemoAdapterName[];
export const defaultDemoAdapter: DemoAdapterName = "memory";

export async function probeDemoAdapter(adapterName: DemoAdapterName) {
  return demoAdapters[adapterName].availability();
}

export function parseDemoAdapterName(input?: string): DemoAdapterInput {
  if (!input) return defaultDemoAdapter;
  if (input === "all") return "all";
  if (Object.hasOwn(demoAdapters, input)) return input as DemoAdapterName;

  throw new Error(
    `Unknown demo adapter "${input}". Expected one of: ${[...allDemoAdapters, "all"].join(", ")}.`,
  );
}

export async function runUnifiedAuthDemo(adapterName: DemoAdapterName = defaultDemoAdapter) {
  const runtime = await demoAdapters[adapterName].create();

  try {
    const auth = createAuthStore(runtime.orm);

    const created = await auth.createOAuthUser({
      name: "Ada Lovelace",
      email: "ada@farminglabs.dev",
      provider: "github",
      accountId: "gh_ada",
    });

    await runtime.orm.profile.create({
      data: {
        userId: created.user.id,
        bio: `Unified auth flow running through ${runtime.client}.`,
      },
    });

    const rotated = await auth.rotateSession({
      userId: created.user.id,
      token: "session-token",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });

    const user = await auth.findUserByEmail("ADA@FARMINGLABS.DEV");
    const summary = await auth.getAuthSummary(created.user.id);
    const directCheck = runtime.directCheck ? await runtime.directCheck(created.user.id) : null;

    return {
      adapter: {
        name: runtime.name,
        label: runtime.label,
        client: runtime.client,
      },
      created,
      rotated,
      user,
      summary,
      directCheck,
    };
  } finally {
    await runtime.close();
  }
}

export async function runAvailableUnifiedAuthDemos() {
  const executed: Array<Awaited<ReturnType<typeof runUnifiedAuthDemo>>> = [];
  const skipped: Array<{ name: DemoAdapterName; reason: string }> = [];

  for (const adapterName of allDemoAdapters) {
    const availability = await probeDemoAdapter(adapterName);
    if (!availability.available) {
      skipped.push({
        name: adapterName,
        reason: availability.reason ?? "Unavailable on this machine.",
      });
      continue;
    }

    executed.push(await runUnifiedAuthDemo(adapterName));
  }

  return {
    executed,
    skipped,
  };
}

export type UnifiedDemoResult = Awaited<ReturnType<typeof runUnifiedAuthDemo>>;

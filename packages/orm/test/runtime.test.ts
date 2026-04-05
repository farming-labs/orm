import { describe, expect, it } from "vitest";
import {
  belongsTo,
  boolean,
  createDriverHandle,
  createMemoryDriver,
  createOrm,
  detectDatabaseRuntime,
  datetime,
  defineSchema,
  hasMany,
  hasOne,
  id,
  inspectDatabaseRuntime,
  integer,
  json,
  model,
  string,
  tableName,
} from "../src";

const authSchema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
      emailVerified: boolean().default(false),
      loginCount: integer().default(0),
      createdAt: datetime().defaultNow(),
      updatedAt: datetime().defaultNow(),
    },
    relations: {
      profile: hasOne("profile", { foreignKey: "userId" }),
      sessions: hasMany("session", { foreignKey: "userId" }),
      accounts: hasMany("account", { foreignKey: "userId" }),
    },
  }),
  profile: model({
    table: "profiles",
    fields: {
      id: id(),
      userId: string().unique().references("user.id"),
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
      userId: string().references("user.id"),
      token: string().unique(),
      expiresAt: datetime(),
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
    },
  }),
  account: model({
    table: "accounts",
    fields: {
      id: id(),
      userId: string().references("user.id"),
      provider: string(),
      accountId: string(),
      metadata: json<{
        plan: string;
        scopes: string[];
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
});

function createAuthOrm() {
  return createOrm({
    schema: authSchema,
    driver: createMemoryDriver({
      user: [
        {
          id: "user_1",
          email: "ada@farminglabs.dev",
          name: "Ada",
          emailVerified: true,
          loginCount: 3,
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        },
        {
          id: "user_2",
          email: "grace@farminglabs.dev",
          name: "Grace",
          emailVerified: false,
          loginCount: 1,
          createdAt: new Date("2025-01-02T00:00:00.000Z"),
          updatedAt: new Date("2025-01-02T00:00:00.000Z"),
        },
      ],
      profile: [
        {
          id: "profile_1",
          userId: "user_1",
          bio: "Writes one auth storage layer for every app.",
        },
      ],
      session: [
        {
          id: "session_1",
          userId: "user_1",
          token: "token-1",
          expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          id: "session_2",
          userId: "user_1",
          token: "token-2",
          expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        },
        {
          id: "session_3",
          userId: "user_2",
          token: "token-3",
          expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ],
      account: [
        {
          id: "account_1",
          userId: "user_1",
          provider: "github",
          accountId: "gh_ada",
          metadata: {
            plan: "oss",
            scopes: ["repo:read", "repo:write"],
          },
        },
      ],
    }),
  });
}

describe("runtime contract", () => {
  it("exposes the attached driver handle on the ORM instance", async () => {
    const orm = createAuthOrm();

    expect(orm.$driver.kind).toBe("memory");
    expect(orm.$driver.client.user?.[0]?.email).toBe("ada@farminglabs.dev");

    await orm.transaction(async (tx) => {
      expect(tx.$driver.kind).toBe("memory");
      expect(tx.$driver.client).toBe(orm.$driver.client);
    });
  });

  it("exposes read-only driver capabilities on the ORM instance", () => {
    const orm = createAuthOrm();

    expect(orm.$driver.capabilities).toEqual({
      supportsNumericIds: true,
      numericIds: "generated",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsTransactions: true,
      supportsSchemaNamespaces: false,
      supportsTransactionalDDL: false,
      supportsJoin: false,
      nativeRelationLoading: "none",
      textComparison: "case-sensitive",
      textMatching: {
        equality: "case-sensitive",
        contains: "case-sensitive",
        ordering: "case-sensitive",
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
        singularChains: false,
        hasMany: false,
        manyToMany: false,
        filtered: false,
        ordered: false,
        paginated: false,
      },
    });
    expect(Object.isFrozen(orm.$driver)).toBe(true);
    expect(Object.isFrozen(orm.$driver.capabilities)).toBe(true);
    expect(Object.isFrozen(orm.$driver.capabilities.returning)).toBe(true);
    expect(Object.isFrozen(orm.$driver.capabilities.returningMode)).toBe(true);
    expect(Object.isFrozen(orm.$driver.capabilities.textMatching)).toBe(true);
    expect(Object.isFrozen(orm.$driver.capabilities.nativeRelations)).toBe(true);

    expect(() => {
      (orm.$driver as { kind: string }).kind = "mutated";
    }).toThrow(TypeError);
  });

  it("returns null when runtime detection receives an unsupported client", () => {
    const orm = createAuthOrm();

    expect(detectDatabaseRuntime(orm.$driver.client)).toBe(null);
    expect(detectDatabaseRuntime({})).toBe(null);
    expect(detectDatabaseRuntime(null)).toBe(null);
  });

  it("detects Firestore runtimes from server-side clients", () => {
    const db = {
      collection() {
        return {
          doc() {
            return {
              get: async () => ({ exists: false, data: () => undefined }),
              set: async () => undefined,
              update: async () => undefined,
              delete: async () => undefined,
            };
          },
          get: async () => ({ docs: [] }),
        };
      },
      getAll: async () => [],
      batch() {
        return {};
      },
      runTransaction: async <TResult>(run: (transaction: unknown) => Promise<TResult>) => run({}),
      constructor: {
        name: "Firestore",
      },
    };

    expect(detectDatabaseRuntime(db)).toEqual({
      kind: "firestore",
      client: db,
      source: "db",
    });
    expect(inspectDatabaseRuntime(db).runtime?.kind).toBe("firestore");
  });

  it("detects DynamoDB runtimes from client shapes", () => {
    const dynamo = {
      send: async () => undefined,
      destroy: () => undefined,
      config: {},
      constructor: {
        name: "DynamoDBClient",
      },
    };

    expect(detectDatabaseRuntime(dynamo)).toEqual({
      kind: "dynamodb",
      client: dynamo,
      source: "client",
    });
    expect(inspectDatabaseRuntime(dynamo).runtime?.kind).toBe("dynamodb");
  });

  it("detects Neo4j runtimes from driver and session shapes", () => {
    const session = {
      run: async () => ({ records: [] }),
      beginTransaction: async () => ({
        run: async () => ({ records: [] }),
        commit: async () => undefined,
        rollback: async () => undefined,
      }),
      close: async () => undefined,
      constructor: {
        name: "Session",
      },
    };

    const driver = {
      session: () => session,
      close: async () => undefined,
      verifyConnectivity: async () => undefined,
      constructor: {
        name: "Driver",
      },
    };

    expect(detectDatabaseRuntime(driver)).toEqual({
      kind: "neo4j",
      client: driver,
      source: "client",
    });
    expect(detectDatabaseRuntime(session)).toEqual({
      kind: "neo4j",
      client: session,
      source: "client",
    });
    expect(inspectDatabaseRuntime(driver).runtime?.kind).toBe("neo4j");
    expect(inspectDatabaseRuntime(session).runtime?.kind).toBe("neo4j");
  });

  it("detects EdgeDB runtimes from Gel SQL client shapes", () => {
    const client = {
      querySQL: async () => [],
      executeSQL: async () => undefined,
      transaction: async <TResult>(run: (tx: unknown) => Promise<TResult>) => run({}),
      constructor: {
        name: "Client",
      },
    };

    expect(detectDatabaseRuntime(client)).toEqual({
      kind: "edgedb",
      client,
      dialect: "postgres",
      source: "client",
    });
    expect(inspectDatabaseRuntime(client).runtime?.kind).toBe("edgedb");
  });

  it("detects Cloudflare KV runtimes from KV namespace shapes", () => {
    const kv = {
      get: async () => null,
      getWithMetadata: async () => ({ value: null, metadata: null }),
      put: async () => undefined,
      delete: async () => undefined,
      list: async () => ({ keys: [], list_complete: true, cursor: "" }),
      constructor: {
        name: "KVNamespace",
      },
    };

    expect(detectDatabaseRuntime(kv)).toEqual({
      kind: "kv",
      client: kv,
      source: "client",
    });
    expect(inspectDatabaseRuntime(kv).runtime?.kind).toBe("kv");
  });

  it("detects Redis runtimes from client shapes", () => {
    const redis = {
      get: async () => null,
      set: async () => "OK",
      del: async () => 0,
      keys: async () => [],
      setNX: async () => true,
      connect: async () => undefined,
      quit: async () => undefined,
    };

    expect(detectDatabaseRuntime(redis)).toEqual({
      kind: "redis",
      client: redis,
      source: "client",
    });
    expect(inspectDatabaseRuntime(redis).runtime?.kind).toBe("redis");
  });

  it("detects Supabase runtimes from client shapes", () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          then: async (resolve?: (value: unknown) => unknown) =>
            resolve?.({
              data: [],
              error: null,
            }),
        };
      },
      schema() {
        return this;
      },
      rpc: async () => ({
        data: null,
        error: null,
      }),
      auth: {},
      storage: {},
      functions: {},
      constructor: {
        name: "SupabaseClient",
      },
    };

    expect(detectDatabaseRuntime(supabase)).toEqual({
      kind: "supabase",
      client: supabase,
      dialect: "postgres",
      source: "client",
    });
    expect(inspectDatabaseRuntime(supabase).runtime?.kind).toBe("supabase");
  });

  it("detects Xata runtimes from official client shapes", () => {
    const xata = {
      db: {},
      sql: Object.assign(
        async () => ({
          records: [],
          columns: [],
        }),
        {
          connectionString: "postgres://xata:test@127.0.0.1:5432/xata",
          batch: async () => ({
            results: [],
          }),
        },
      ),
      getConfig: async () => ({
        databaseURL: "postgres://xata:test@127.0.0.1:5432/xata",
        branch: "main",
      }),
      constructor: {
        name: "BaseClient",
      },
    };

    expect(detectDatabaseRuntime(xata)).toEqual({
      kind: "xata",
      client: xata,
      dialect: "postgres",
      source: "client",
    });
    expect(inspectDatabaseRuntime(xata).runtime?.kind).toBe("xata");
  });

  it("detects Xata runtimes from sql metadata even without getConfig or constructor hints", () => {
    const sql = Object.assign(
      async () => ({
        records: [],
        columns: [],
      }),
      {
        connectionString: "postgres://xata:test@127.0.0.1:5432/xata",
        batch: async () => ({
          results: [],
        }),
      },
    );

    const xata = {
      db: {},
      sql,
      constructor: {
        name: "AnonymousClient",
      },
    };

    expect(detectDatabaseRuntime(xata)).toEqual({
      kind: "xata",
      client: xata,
      dialect: "postgres",
      source: "client",
    });
    expect(inspectDatabaseRuntime(xata).runtime?.kind).toBe("xata");
  });

  it("detects Xata runtimes from batch metadata when the sql function has no connection string", () => {
    const sql = Object.assign(
      async () => ({
        records: [],
        columns: [],
      }),
      {
        batch: async () => ({
          results: [],
        }),
      },
    );

    const xata = {
      db: {},
      sql,
      constructor: {
        name: "AnonymousClient",
      },
    };

    expect(detectDatabaseRuntime(xata)).toEqual({
      kind: "xata",
      client: xata,
      dialect: "postgres",
      source: "client",
    });
    expect(inspectDatabaseRuntime(xata).runtime?.kind).toBe("xata");
  });

  it("detects Upstash-style Redis runtimes from client shapes", () => {
    const upstash = {
      get: async () => null,
      set: async () => "OK",
      del: async () => 0,
      keys: async () => [],
      setnx: async () => 1,
      request: async () => undefined,
      pipeline() {
        return { exec: async () => [] };
      },
      multi() {
        return { exec: async () => [] };
      },
    };

    expect(detectDatabaseRuntime(upstash)).toEqual({
      kind: "redis",
      client: upstash,
      source: "client",
    });
    expect(inspectDatabaseRuntime(upstash).runtime?.kind).toBe("redis");
  });

  it("detects SurrealDB runtimes from official client-like shapes", () => {
    const surreal = {
      query: async () => ({
        collect: async () => [],
      }),
      select: async () => [],
      create: () => ({
        content: async () => ({}),
      }),
      update: () => ({
        replace: async () => ({}),
        merge: async () => ({}),
        content: async () => ({}),
      }),
      upsert: () => ({
        replace: async () => ({}),
        merge: async () => ({}),
        content: async () => ({}),
      }),
      delete: async () => ({}),
      beginTransaction: async () => ({
        commit: async () => undefined,
        cancel: async () => undefined,
      }),
      constructor: {
        name: "Surreal",
      },
    };

    expect(detectDatabaseRuntime(surreal)).toEqual({
      kind: "surrealdb",
      client: surreal,
      source: "client",
    });
    expect(inspectDatabaseRuntime(surreal).runtime?.kind).toBe("surrealdb");
  });

  it("detects D1 runtimes from database and session shapes", () => {
    const preparedStatement = {
      bind() {
        return this;
      },
      run: async () => ({
        results: [],
        meta: {
          changes: 0,
        },
      }),
    };
    const d1Database = {
      prepare: () => preparedStatement,
      batch: async () => [],
      exec: async () => ({
        count: 0,
      }),
      withSession() {
        return d1Session;
      },
      constructor: {
        name: "D1Database",
      },
    };
    const d1Session = {
      prepare: () => preparedStatement,
      batch: async () => [],
      getBookmark: () => "bookmark",
      constructor: {
        name: "D1DatabaseSession",
      },
    };

    expect(detectDatabaseRuntime(d1Database)).toEqual({
      kind: "d1",
      client: d1Database,
      dialect: "sqlite",
      source: "database",
    });
    expect(detectDatabaseRuntime(d1Session)).toEqual({
      kind: "d1",
      client: d1Session,
      dialect: "sqlite",
      source: "database",
    });
    expect(inspectDatabaseRuntime(d1Database).runtime?.kind).toBe("d1");
  });

  it("detects Unstorage runtimes from storage shapes", () => {
    const storage = {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
      getKeys: async () => [],
      getMounts: () => [],
    };

    expect(detectDatabaseRuntime(storage)).toEqual({
      kind: "unstorage",
      client: storage,
      source: "client",
    });
    expect(inspectDatabaseRuntime(storage).runtime?.kind).toBe("unstorage");
  });

  it("detects TypeORM DataSource runtimes from the connection shape", () => {
    const dataSource = {
      options: {
        type: "postgres",
      },
      createQueryRunner: () => ({
        query: async () => undefined,
      }),
      transaction: async <TResult>(run: () => Promise<TResult>) => run(),
    };

    expect(detectDatabaseRuntime(dataSource)).toEqual({
      kind: "typeorm",
      client: dataSource,
      dialect: "postgres",
      source: "connection",
    });
    expect(inspectDatabaseRuntime(dataSource).runtime?.kind).toBe("typeorm");
  });

  it("detects MikroORM runtimes from ORM and EntityManager shapes", () => {
    const connection = {
      constructor: {
        name: "PostgreSqlConnection",
      },
      execute: async () => undefined,
    };
    const entityManager = {
      config: {
        get: () => undefined,
      },
      fork() {
        return this;
      },
      getConnection() {
        return connection;
      },
      getDriver() {
        return {
          getPlatform() {
            return {
              constructor: {
                name: "PostgreSqlPlatform",
              },
            };
          },
        };
      },
      transactional: async <TResult>(run: () => Promise<TResult>) => run(),
    };
    const mikroorm = {
      config: {
        get: () => undefined,
      },
      connect: async () => undefined,
      close: async () => undefined,
      em: entityManager,
      isConnected: async () => true,
    };

    expect(detectDatabaseRuntime(mikroorm)).toEqual({
      kind: "mikroorm",
      client: mikroorm,
      dialect: "postgres",
      source: "connection",
    });
    expect(detectDatabaseRuntime(entityManager)).toEqual({
      kind: "mikroorm",
      client: entityManager,
      dialect: "postgres",
      source: "connection",
    });
    expect(inspectDatabaseRuntime(mikroorm).runtime?.kind).toBe("mikroorm");
  });

  it("detects Sequelize runtimes from the connection shape", () => {
    const sequelize = {
      options: {
        dialect: "postgres",
      },
      query: async () => [],
      transaction: async <TResult>(run: () => Promise<TResult>) => run(),
      authenticate: async () => undefined,
      close: async () => undefined,
    };

    expect(detectDatabaseRuntime(sequelize)).toEqual({
      kind: "sequelize",
      client: sequelize,
      dialect: "postgres",
      source: "connection",
    });
    expect(inspectDatabaseRuntime(sequelize).runtime?.kind).toBe("sequelize");
  });

  it("derives numericIds from supportsNumericIds when only the boolean flag is provided", () => {
    const handle = createDriverHandle({
      kind: "test",
      client: {},
      capabilities: {
        supportsNumericIds: true,
      },
    });

    expect(handle.capabilities.supportsNumericIds).toBe(true);
    expect(handle.capabilities.numericIds).toBe("manual");
  });

  it("explains why unsupported runtime detection failed", () => {
    const report = inspectDatabaseRuntime({
      execute: () => undefined,
    });

    expect(report.runtime).toBe(null);
    expect(report.summary).toContain("Could not detect");
    expect(report.hint).toContain("supported raw client");
    expect(report.candidates.some((candidate) => candidate.kind === "prisma")).toBe(true);
  });

  it("auto-generates numeric ids in the memory runtime when increment ids are requested", async () => {
    const numericSchema = defineSchema({
      auditEvent: model({
        table: tableName("audit_events"),
        fields: {
          id: id({ type: "integer", generated: "increment" }),
          email: string().unique(),
        },
      }),
    });

    const orm = createOrm({
      schema: numericSchema,
      driver: createMemoryDriver(),
    });

    const first = await orm.auditEvent.create({
      data: {
        email: "ada@farminglabs.dev",
      },
    });
    const second = await orm.auditEvent.create({
      data: {
        email: "grace@farminglabs.dev",
      },
    });

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(orm.$driver.capabilities.numericIds).toBe("generated");
  });

  it("supports auth-style reads with findOne, findUnique, count, and nested relations", async () => {
    const orm = createAuthOrm();

    const foundByOne = await orm.user.findOne({
      where: { emailVerified: true },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        email: true,
      },
    });

    const user = await orm.user.findUnique({
      where: { email: "ada@farminglabs.dev" },
      select: {
        id: true,
        email: true,
        profile: {
          select: {
            bio: true,
          },
        },
        sessions: {
          where: {
            token: {
              contains: "token",
            },
          },
          orderBy: { token: "desc" },
          take: 1,
          select: {
            token: true,
          },
        },
      },
    });

    const sessionCount = await orm.session.count({
      where: {
        userId: "user_1",
      },
    });

    expect(foundByOne).toEqual({
      id: "user_1",
      email: "ada@farminglabs.dev",
    });
    expect(user).toEqual({
      id: "user_1",
      email: "ada@farminglabs.dev",
      profile: {
        bio: "Writes one auth storage layer for every app.",
      },
      sessions: [{ token: "token-2" }],
    });
    expect(sessionCount).toBe(2);
  });

  it("supports createMany, updateMany, upsert, delete, and deleteMany mutations", async () => {
    const orm = createAuthOrm();

    const createdSessions = await orm.session.createMany({
      data: [
        {
          userId: "user_1",
          token: "token-4",
          expiresAt: new Date("2026-04-01T00:00:00.000Z"),
        },
        {
          userId: "user_1",
          token: "token-5",
          expiresAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      select: {
        token: true,
      },
    });

    const updatedCount = await orm.session.updateMany({
      where: {
        userId: "user_1",
      },
      data: {
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    });

    const updatedAccount = await orm.account.upsert({
      where: {
        provider: "github",
        accountId: "gh_ada",
      },
      create: {
        userId: "user_2",
        provider: "github",
        accountId: "gh_ada",
      },
      update: {
        userId: "user_2",
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
        userId: "user_2",
        provider: "google",
        accountId: "google_grace",
      },
      update: {
        userId: "user_2",
      },
      select: {
        provider: true,
        accountId: true,
      },
    });

    const deletedSingle = await orm.session.delete({
      where: {
        token: "token-1",
      },
    });

    const deletedMany = await orm.session.deleteMany({
      where: {
        userId: "user_1",
      },
    });

    expect(createdSessions).toEqual([{ token: "token-4" }, { token: "token-5" }]);
    expect(updatedCount).toBe(4);
    expect(updatedAccount).toEqual({
      provider: "github",
      accountId: "gh_ada",
      userId: "user_2",
    });
    expect(createdAccount).toEqual({
      provider: "google",
      accountId: "google_grace",
    });
    expect(deletedSingle).toBe(1);
    expect(deletedMany).toBe(3);
    await expect(
      orm.session.count({
        where: {
          userId: "user_1",
        },
      }),
    ).resolves.toBe(0);
  });

  it("supports transactional auth workflows and batch reads", async () => {
    const orm = createAuthOrm();

    const created = await orm.transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: "new@farminglabs.dev",
          name: "New User",
        },
        select: {
          id: true,
          email: true,
        },
      });

      const session = await tx.session.create({
        data: {
          userId: user.id,
          token: "new-token",
          expiresAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        select: {
          token: true,
        },
      });

      const account = await tx.account.create({
        data: {
          userId: user.id,
          provider: "google",
          accountId: "google_new",
        },
        select: {
          provider: true,
        },
      });

      return { user, session, account };
    });

    expect(created).toEqual({
      user: {
        id: expect.any(String),
        email: "new@farminglabs.dev",
      },
      session: {
        token: "new-token",
      },
      account: {
        provider: "google",
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

    const batchResult = await orm.batch([
      (tx) =>
        tx.user.findUnique({
          where: { email: "ada@farminglabs.dev" },
          select: {
            id: true,
            email: true,
          },
        }),
      (tx) =>
        tx.session.count({
          where: { userId: "user_1" },
        }),
      (tx) =>
        tx.account.findMany({
          where: { userId: "user_1" },
          select: {
            provider: true,
          },
        }),
    ] as const);

    expect(rollbackCount).toBe(0);
    expect(batchResult).toEqual([
      {
        id: "user_1",
        email: "ada@farminglabs.dev",
      },
      2,
      [{ provider: "github" }],
    ]);
  });

  it("supports compound-unique findUnique lookups", async () => {
    const orm = createAuthOrm();

    const account = await orm.account.findUnique({
      where: {
        provider: "github",
        accountId: "gh_ada",
      },
      select: {
        userId: true,
        provider: true,
        accountId: true,
      },
    });

    expect(account).toEqual({
      userId: "user_1",
      provider: "github",
      accountId: "gh_ada",
    });
  });

  it("supports integer comparisons and raw json equality filters", async () => {
    const orm = createAuthOrm();

    const activeUsers = await orm.user.findMany({
      where: {
        loginCount: {
          gte: 2,
        },
      },
      select: {
        email: true,
        loginCount: true,
      },
    });

    const accounts = await orm.account.findMany({
      where: {
        metadata: {
          plan: "oss",
          scopes: ["repo:read", "repo:write"],
        },
      },
      select: {
        provider: true,
        metadata: true,
      },
    });

    expect(activeUsers).toEqual([
      {
        email: "ada@farminglabs.dev",
        loginCount: 3,
      },
    ]);
    expect(accounts).toEqual([
      {
        provider: "github",
        metadata: {
          plan: "oss",
          scopes: ["repo:read", "repo:write"],
        },
      },
    ]);
  });
});

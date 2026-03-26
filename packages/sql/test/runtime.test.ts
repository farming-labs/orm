import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DataType, newDb } from "pg-mem";
import {
  boolean,
  belongsTo,
  createOrm,
  datetime,
  defineSchema,
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
import { createSqlDriverFromAdapter } from "../src";

type RuntimeOrm = ReturnType<typeof createOrm<typeof schema>>;

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
      emailVerified: boolean().default(false).map("email_verified"),
      loginCount: integer().default(0).map("login_count"),
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
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
      organization: belongsTo("organization", { foreignKey: "organizationId" }),
    },
  }),
});

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
      },
      {
        email: "grace@farminglabs.dev",
        name: "Grace",
        loginCount: 1,
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
      metadata: {
        plan: "oss",
        scopes: ["repo:read", "repo:write"],
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

async function createSqliteOrm() {
  const database = new DatabaseSync(":memory:");
  await applyStatements(
    (statement) => database.exec(statement),
    renderSafeSql(schema, { dialect: "sqlite" }),
  );
  let queryCount = 0;
  let transactionDepth = 0;
  const driver = createSqlDriverFromAdapter<typeof schema>({
    dialect: "sqlite",
    async query(sql, params) {
      queryCount += 1;
      const statement = database.prepare(sql);
      if (/^\s*(select|with)\b/i.test(sql)) {
        const rows = statement.all(...(params as any[])) as Record<string, unknown>[];
        return {
          rows,
          affectedRows: rows.length,
        };
      }

      const result = statement.run(...(params as any[])) as { changes?: number | bigint };
      return {
        rows: [],
        affectedRows: Number(result?.changes ?? 0),
      };
    },
    async transaction(run) {
      const savepoint = `farming_labs_test_${transactionDepth + 1}`;

      if (transactionDepth === 0) {
        database.exec("begin");
      } else {
        database.exec(`savepoint ${savepoint}`);
      }

      transactionDepth += 1;

      try {
        const result = await run(this);
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
  });

  return {
    orm: createOrm({
      schema,
      driver,
    }),
    close: () => database.close(),
    queryCount: () => queryCount,
    resetQueryCount: () => {
      queryCount = 0;
    },
  } satisfies {
    orm: RuntimeOrm;
    close: () => void;
    queryCount: () => number;
    resetQueryCount: () => void;
  };
}

async function createPgOrm() {
  const db = newDb();
  db.public.registerFunction({
    name: "strpos",
    args: [DataType.text, DataType.text],
    returns: DataType.integer,
    implementation: (value: string, search: string) => value.indexOf(search) + 1,
  });
  const pg = db.adapters.createPg();
  const pool = new pg.Pool();
  await applyStatements(
    (statement) => pool.query(statement),
    renderSafeSql(schema, { dialect: "postgres" }),
  );
  let queryCount = 0;
  const driver = createSqlDriverFromAdapter<typeof schema>({
    dialect: "postgres",
    async query(sql, params) {
      queryCount += 1;
      const result = await pool.query(sql, params);
      return {
        rows: result.rows ?? [],
        affectedRows: Number(result.rowCount ?? result.rows?.length ?? 0),
      };
    },
    async transaction(run) {
      const client = await pool.connect();
      let transactionDepth = 0;
      const adapter = {
        dialect: "postgres" as const,
        async query(sql: string, params: unknown[]) {
          queryCount += 1;
          const result = await client.query(sql, params);
          return {
            rows: result.rows ?? [],
            affectedRows: Number(result.rowCount ?? result.rows?.length ?? 0),
          };
        },
        async transaction<TResult>(nestedRun: (adapter: any) => Promise<TResult>) {
          const savepoint = `farming_labs_test_${transactionDepth + 1}`;
          if (transactionDepth === 0) {
            await client.query("begin");
          } else {
            await client.query(`savepoint ${savepoint}`);
          }
          transactionDepth += 1;
          try {
            const result = await nestedRun(adapter);
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

      try {
        return await adapter.transaction(run);
      } finally {
        client.release();
      }
    },
  });

  return {
    orm: createOrm({
      schema,
      driver,
    }),
    close: () => pool.end(),
    queryCount: () => queryCount,
    resetQueryCount: () => {
      queryCount = 0;
    },
  } satisfies {
    orm: RuntimeOrm;
    close: () => Promise<void>;
    queryCount: () => number;
    resetQueryCount: () => void;
  };
}

for (const [label, factory] of [
  ["sqlite", createSqliteOrm],
  ["pgPool", createPgOrm],
] as const) {
  describe(`${label} SQL runtime`, () => {
    it("supports create, findOne, findMany, count, and nested relations", async () => {
      const { orm, close } = await factory();

      try {
        const { ada } = await seedAuthData(orm);

        const firstVerifiedCandidate = await orm.user.findOne({
          where: {
            name: {
              contains: "a",
            },
          },
          orderBy: {
            email: "asc",
          },
          select: {
            id: true,
            email: true,
          },
        });

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

        const sessions = await orm.session.findMany({
          where: {
            userId: ada.id,
          },
          orderBy: {
            token: "asc",
          },
          select: {
            token: true,
          },
        });

        const sessionCount = await orm.session.count({
          where: {
            userId: ada.id,
          },
        });

        expect(firstVerifiedCandidate).toEqual({
          id: ada.id,
          email: "ada@farminglabs.dev",
        });
        expect(user).toEqual({
          id: ada.id,
          email: "ada@farminglabs.dev",
          profile: {
            bio: "Writes one storage layer for every stack.",
          },
          sessions: [{ token: "session-2" }],
          organizations: [{ name: "Acme" }, { name: "Farming Labs" }],
        });
        expect(sessions).toEqual([{ token: "session-1" }, { token: "session-2" }]);
        expect(sessionCount).toBe(2);
      } finally {
        await close();
      }
    });

    it("supports advanced relation traversal across belongsTo, hasOne, hasMany, and manyToMany", async () => {
      const { orm, close } = await factory();

      try {
        await seedAuthData(orm);

        const session = await orm.session.findUnique({
          where: {
            token: "session-2",
          },
          select: {
            token: true,
            user: {
              select: {
                email: true,
                profile: {
                  select: {
                    bio: true,
                  },
                },
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

        const organization = await orm.organization.findUnique({
          where: {
            slug: "farming-labs",
          },
          select: {
            name: true,
            users: {
              where: {
                email: {
                  contains: "@farminglabs.dev",
                },
              },
              orderBy: {
                email: "asc",
              },
              take: 1,
              select: {
                email: true,
                sessions: {
                  orderBy: {
                    token: "asc",
                  },
                  skip: 1,
                  take: 1,
                  select: {
                    token: true,
                  },
                },
              },
            },
          },
        });

        const profile = await orm.profile.findOne({
          where: {
            bio: {
              contains: "storage layer",
            },
          },
          select: {
            bio: true,
            user: {
              select: {
                email: true,
                sessions: {
                  where: {
                    token: {
                      contains: "session",
                    },
                  },
                  orderBy: {
                    token: "desc",
                  },
                  take: 1,
                  select: {
                    token: true,
                  },
                },
              },
            },
          },
        });

        expect(session).toEqual({
          token: "session-2",
          user: {
            email: "ada@farminglabs.dev",
            profile: {
              bio: "Writes one storage layer for every stack.",
            },
            organizations: [{ slug: "farming-labs" }],
          },
        });
        expect(organization).toEqual({
          name: "Farming Labs",
          users: [
            {
              email: "ada@farminglabs.dev",
              sessions: [{ token: "session-2" }],
            },
          ],
        });
        expect(profile).toEqual({
          bio: "Writes one storage layer for every stack.",
          user: {
            email: "ada@farminglabs.dev",
            sessions: [{ token: "session-2" }],
          },
        });
      } finally {
        await close();
      }
    });

    it("uses one native SQL query for singular nested relation reads", async () => {
      const { orm, close, queryCount, resetQueryCount } = await factory();

      try {
        await seedAuthData(orm);
        resetQueryCount();

        const session = await orm.session.findUnique({
          where: {
            token: "session-2",
          },
          select: {
            token: true,
            user: {
              select: {
                email: true,
                profile: {
                  select: {
                    bio: true,
                  },
                },
              },
            },
          },
        });

        expect(session).toEqual({
          token: "session-2",
          user: {
            email: "ada@farminglabs.dev",
            profile: {
              bio: "Writes one storage layer for every stack.",
            },
          },
        });
        expect(queryCount()).toBe(1);
      } finally {
        await close();
      }
    });

    it("treats contains filters as literal substring matches", async () => {
      const { orm, close } = await factory();

      try {
        await orm.user.createMany({
          data: [
            {
              email: "percent@farminglabs.dev",
              name: "100% real",
            },
            {
              email: "plain@farminglabs.dev",
              name: "100 real",
            },
            {
              email: "underscore@farminglabs.dev",
              name: "under_score",
            },
            {
              email: "wildcard@farminglabs.dev",
              name: "underXscore",
            },
          ],
        });

        const percentMatches = await orm.user.findMany({
          where: {
            name: {
              contains: "100%",
            },
          },
          orderBy: {
            email: "asc",
          },
          select: {
            email: true,
          },
        });

        const underscoreMatches = await orm.user.findMany({
          where: {
            name: {
              contains: "under_score",
            },
          },
          orderBy: {
            email: "asc",
          },
          select: {
            email: true,
          },
        });

        expect(percentMatches).toEqual([{ email: "percent@farminglabs.dev" }]);
        expect(underscoreMatches).toEqual([{ email: "underscore@farminglabs.dev" }]);
      } finally {
        await close();
      }
    });

    it("supports compound-unique findUnique lookups and upserts", async () => {
      const { orm, close } = await factory();

      try {
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
      } finally {
        await close();
      }
    });

    it("supports integer comparisons and raw json equality filters", async () => {
      const { orm, close } = await factory();

      try {
        const { ada } = await seedAuthData(orm);

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

        const account = await orm.account.findUnique({
          where: {
            provider: "github",
            accountId: "gh_ada",
          },
          select: {
            metadata: true,
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
            },
          },
          select: {
            userId: true,
            metadata: true,
          },
        });

        const matchingAccounts = await orm.account.findMany({
          where: {
            metadata: {
              plan: "pro",
              scopes: ["repo:read", "repo:write", "admin"],
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
        expect(account).toEqual({
          metadata: {
            plan: "oss",
            scopes: ["repo:read", "repo:write"],
          },
        });
        expect(updatedAccount).toEqual({
          userId: ada.id,
          metadata: {
            plan: "pro",
            scopes: ["repo:read", "repo:write", "admin"],
          },
        });
        expect(matchingAccounts).toEqual([
          {
            provider: "github",
            metadata: {
              plan: "pro",
              scopes: ["repo:read", "repo:write", "admin"],
            },
          },
        ]);
      } finally {
        await close();
      }
    });

    it("supports update, updateMany, upsert, delete, deleteMany, transaction rollback, and batch", async () => {
      const { orm, close } = await factory();

      try {
        const { ada, grace } = await seedAuthData(orm);

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

        const createdSession = await orm.session.upsert({
          where: {
            token: "session-4",
          },
          create: {
            userId: grace.id,
            token: "session-4",
            expiresAt: new Date("2028-02-01T00:00:00.000Z"),
          },
          update: {
            expiresAt: new Date("2028-02-01T00:00:00.000Z"),
          },
          select: {
            token: true,
          },
        });

        const deletedOne = await orm.session.delete({
          where: {
            token: "session-1",
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

        expect(updatedUser).toEqual({
          email: "ada@farminglabs.dev",
          emailVerified: true,
        });
        expect(updatedSessions).toBe(2);
        expect(rotatedSession).toEqual({
          token: "session-2",
          expiresAt: new Date("2028-01-01T00:00:00.000Z"),
        });
        expect(createdSession).toEqual({
          token: "session-4",
        });
        expect(deletedOne).toBe(1);
        expect(deletedMany).toBe(2);
        if (label === "sqlite") {
          expect(rollbackCount).toBe(0);
        }
        expect(summary).toEqual([
          {
            email: "ada@farminglabs.dev",
            emailVerified: true,
          },
          1,
        ]);
      } finally {
        await close();
      }
    });
  });
}

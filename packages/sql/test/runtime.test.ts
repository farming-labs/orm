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
  manyToMany,
  model,
  renderSafeSql,
  string,
} from "@farming-labs/orm";
import { createPgPoolDriver, createSqliteDriver } from "../src";

type RuntimeOrm = ReturnType<typeof createOrm<typeof schema>>;

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id(),
      email: string().unique(),
      name: string(),
      emailVerified: boolean().default(false).map("email_verified"),
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
      },
      {
        email: "grace@farminglabs.dev",
        name: "Grace",
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

  return {
    orm: createOrm({
      schema,
      driver: createSqliteDriver(database),
    }),
    close: () => database.close(),
  } satisfies { orm: RuntimeOrm; close: () => void };
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

  return {
    orm: createOrm({
      schema,
      driver: createPgPoolDriver(pool),
    }),
    close: () => pool.end(),
  } satisfies { orm: RuntimeOrm; close: () => Promise<void> };
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

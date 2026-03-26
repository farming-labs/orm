import { describe, expect, it } from "vitest";
import {
  belongsTo,
  boolean,
  createMemoryDriver,
  createOrm,
  datetime,
  defineSchema,
  hasMany,
  hasOne,
  id,
  integer,
  json,
  model,
  string,
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

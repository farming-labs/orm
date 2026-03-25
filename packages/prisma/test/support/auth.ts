import {
  belongsTo,
  boolean,
  createOrm,
  datetime,
  defineSchema,
  hasMany,
  hasOne,
  id,
  manyToMany,
  model,
  string,
} from "@farming-labs/orm";

export const schema = defineSchema({
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

export type RuntimeOrm = ReturnType<typeof createOrm<typeof schema>>;

export async function seedAuthData(orm: RuntimeOrm) {
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
  };
}

export async function assertOneToOneAndHasManyQueries(
  orm: RuntimeOrm,
  expect: typeof import("vitest").expect,
) {
  const { ada } = await seedAuthData(orm);
  const firstCandidate = await orm.user.findOne({
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
  console.log({ user: user?.organizations });

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

  expect(firstCandidate).toEqual({
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
}

export async function assertBelongsToAndManyToManyQueries(
  orm: RuntimeOrm,
  expect: typeof import("vitest").expect,
) {
  const { ada } = await seedAuthData(orm);

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

  const profile = await orm.profile.findUnique({
    where: {
      userId: ada.id,
    },
    select: {
      bio: true,
      user: {
        select: {
          email: true,
          organizations: {
            orderBy: {
              name: "asc",
            },
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const organization = await orm.organization.findUnique({
    where: {
      slug: "acme",
    },
    select: {
      name: true,
      users: {
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
      organizations: [{ slug: "farming-labs" }],
    },
  });
  expect(profile).toEqual({
    bio: "Writes one storage layer for every stack.",
    user: {
      email: "ada@farminglabs.dev",
      organizations: [{ name: "Acme" }, { name: "Farming Labs" }],
    },
  });
  expect(organization).toEqual({
    name: "Acme",
    users: [
      {
        email: "ada@farminglabs.dev",
        profile: {
          bio: "Writes one storage layer for every stack.",
        },
      },
    ],
  });
}

export async function assertMutationQueries(
  orm: RuntimeOrm,
  expect: typeof import("vitest").expect,
  options: { expectTransactionRollback?: boolean } = {},
) {
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

  const deletedMany = await orm.session.deleteMany({
    where: {
      userId: grace.id,
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

  if (options.expectTransactionRollback) {
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

    expect(rollbackCount).toBe(0);
  }
}

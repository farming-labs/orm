import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
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
import { createMongooseDriver } from "../src";
import type { MongooseModelLike } from "../src";

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id().map("_id"),
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
      id: id().map("_id"),
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
      id: id().map("_id"),
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
      id: id().map("_id"),
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
      id: id().map("_id"),
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

type RuntimeOrm = ReturnType<typeof createOrm<typeof schema>>;

function createIsolatedName(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/-/g, "_");
}

function formatLocalDbError(error: unknown, uri: string) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `MongoDB local integration test could not connect. Make sure a local MongoDB server is running and reachable via FARM_ORM_LOCAL_MONGODB_URL (current default: ${uri}).\nOriginal error: ${message}`,
  );
}

function asModelLike(model: mongoose.Model<any>) {
  return model as unknown as MongooseModelLike;
}

async function createLocalMongooseOrm() {
  const baseUri = process.env.FARM_ORM_LOCAL_MONGODB_URL ?? "mongodb://127.0.0.1:27017";
  const connection = mongoose.createConnection(baseUri, {
    dbName: createIsolatedName("farm_orm_mongo"),
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    await connection.asPromise();
  } catch (error) {
    throw formatLocalDbError(error, baseUri);
  }

  const userSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      email_verified: { type: Boolean, default: false },
      created_at: { type: Date, default: Date.now },
      updated_at: { type: Date, default: Date.now },
    },
    { versionKey: false },
  );

  const profileSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true, unique: true },
      bio: { type: String, default: null },
    },
    { versionKey: false },
  );

  const sessionSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true },
      token: { type: String, required: true, unique: true },
      expires_at: { type: Date, required: true },
    },
    { versionKey: false },
  );

  const organizationSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      name: { type: String, required: true, unique: true },
      slug: { type: String, required: true, unique: true },
    },
    { versionKey: false },
  );

  const memberSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      user_id: { type: String, required: true },
      organization_id: { type: String, required: true },
      role: { type: String, required: true },
    },
    { versionKey: false },
  );

  const UserModel = connection.model("User", userSchema, "users");
  const ProfileModel = connection.model("Profile", profileSchema, "profiles");
  const SessionModel = connection.model("Session", sessionSchema, "sessions");
  const OrganizationModel = connection.model("Organization", organizationSchema, "organizations");
  const MemberModel = connection.model("Member", memberSchema, "members");

  return {
    orm: createOrm({
      schema,
      driver: createMongooseDriver<typeof schema>({
        models: {
          user: asModelLike(UserModel),
          profile: asModelLike(ProfileModel),
          session: asModelLike(SessionModel),
          organization: asModelLike(OrganizationModel),
          member: asModelLike(MemberModel),
        },
        connection,
      }),
    }),
    close: async () => {
      await connection.dropDatabase();
      await connection.close();
    },
  } satisfies {
    orm: RuntimeOrm;
    close: () => Promise<void>;
  };
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

  if (process.env.FARM_ORM_LOCAL_MONGODB_TRANSACTIONS === "1") {
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

describe("mongoose local integration", () => {
  it("runs the auth-style runtime flow against a real local MongoDB instance", async () => {
    const { orm, close } = await createLocalMongooseOrm();

    try {
      await exerciseRuntime(orm);
    } finally {
      await close();
    }
  });
});

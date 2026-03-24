import { describe, expect, it } from "vitest";
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
import type {
  MongooseExecLike,
  MongooseModelLike,
  MongooseQueryLike,
  MongooseSessionLike,
} from "../src";
import { createMongooseDriver } from "../src";

type StoredState = Record<string, Array<Record<string, unknown>>>;

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

function compareValues(left: unknown, right: unknown) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(String(left)).getTime() - new Date(String(right)).getTime();
  }
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  const entries = Object.entries(filter);
  if (!entries.length) return true;

  return entries.every(([key, value]) => {
    if (key === "$and") {
      return (value as Array<Record<string, unknown>>).every((item) => matchesFilter(doc, item));
    }
    if (key === "$or") {
      return (value as Array<Record<string, unknown>>).some((item) => matchesFilter(doc, item));
    }
    if (key === "$nor") {
      return !(value as Array<Record<string, unknown>>).some((item) => matchesFilter(doc, item));
    }

    const current = doc[key];
    if (!value || typeof value !== "object" || value instanceof Date || Array.isArray(value)) {
      return Object.is(current, value);
    }

    return Object.entries(value).every(([operator, operand]) => {
      if (operator === "$eq") return Object.is(current, operand);
      if (operator === "$ne") return !Object.is(current, operand);
      if (operator === "$in")
        return Array.isArray(operand) && operand.some((item) => Object.is(item, current));
      if (operator === "$regex") {
        return current != null && (operand as RegExp).test(String(current));
      }
      if (operator === "$gt") return compareValues(current, operand) > 0;
      if (operator === "$gte") return compareValues(current, operand) >= 0;
      if (operator === "$lt") return compareValues(current, operand) < 0;
      if (operator === "$lte") return compareValues(current, operand) <= 0;
      return false;
    });
  });
}

class FakeExec<TResult> implements MongooseExecLike<TResult> {
  private currentSession?: FakeSession;

  constructor(private readonly run: (session?: FakeSession) => TResult | Promise<TResult>) {}

  session(session: MongooseSessionLike) {
    this.currentSession = session as FakeSession;
    return this;
  }

  async exec() {
    return this.run(this.currentSession);
  }
}

class FakeQuery<TResult> implements MongooseQueryLike<TResult> {
  private currentSession?: FakeSession;
  private sortOrder?: Record<string, 1 | -1>;
  private skipValue?: number;
  private limitValue?: number;

  constructor(
    private readonly run: (input: {
      session?: FakeSession;
      sortOrder?: Record<string, 1 | -1>;
      skip?: number;
      limit?: number;
    }) => TResult | Promise<TResult>,
  ) {}

  sort(sort: Record<string, 1 | -1>) {
    this.sortOrder = sort;
    return this;
  }

  skip(value: number) {
    this.skipValue = value;
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  session(session: MongooseSessionLike) {
    this.currentSession = session as FakeSession;
    return this;
  }

  lean() {
    return this;
  }

  async exec() {
    return this.run({
      session: this.currentSession,
      sortOrder: this.sortOrder,
      skip: this.skipValue,
      limit: this.limitValue,
    });
  }
}

class FakeSession implements MongooseSessionLike {
  state: StoredState;

  constructor(
    private readonly manager: FakeSessionManager,
    snapshot: StoredState,
  ) {
    this.state = structuredClone(snapshot);
  }

  async withTransaction<TResult>(run: () => Promise<TResult>) {
    try {
      const result = await run();
      this.manager.state = structuredClone(this.state);
      return result;
    } catch (error) {
      throw error;
    }
  }

  endSession() {}
}

class FakeSessionManager {
  constructor(public state: StoredState) {}

  async startSession() {
    return new FakeSession(this, this.state);
  }
}

class FakeModel implements MongooseModelLike {
  constructor(
    private readonly manager: FakeSessionManager,
    private readonly collectionName: string,
  ) {}

  private getCollection(session?: FakeSession) {
    const state = session?.state ?? this.manager.state;
    state[this.collectionName] ??= [];
    return state[this.collectionName]!;
  }

  find(filter: Record<string, unknown>) {
    return new FakeQuery<Record<string, unknown>[]>(({ session, sortOrder, skip, limit }) => {
      let rows = this.getCollection(session)
        .filter((doc) => matchesFilter(doc, filter))
        .map((doc) => structuredClone(doc));

      if (sortOrder) {
        const orderEntries = Object.entries(sortOrder);
        rows.sort((left, right) => {
          for (const [key, direction] of orderEntries) {
            const result = compareValues(left[key], right[key]);
            if (result !== 0) {
              return direction === -1 ? -result : result;
            }
          }
          return 0;
        });
      }

      if (skip !== undefined) rows = rows.slice(skip);
      if (limit !== undefined) rows = rows.slice(0, limit);
      return rows;
    });
  }

  findOne(filter: Record<string, unknown>) {
    return new FakeQuery<Record<string, unknown> | null>(({ session }) => {
      const row = this.getCollection(session).find((doc) => matchesFilter(doc, filter));
      return row ? structuredClone(row) : null;
    });
  }

  countDocuments(filter: Record<string, unknown>) {
    return new FakeExec<number>(
      (session) => this.getCollection(session).filter((doc) => matchesFilter(doc, filter)).length,
    );
  }

  async create(doc: Record<string, unknown>, options?: { session?: MongooseSessionLike }) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const created = structuredClone(doc);
    collection.push(created);
    return structuredClone(created);
  }

  async insertMany(docs: Record<string, unknown>[], options?: { session?: MongooseSessionLike }) {
    const collection = this.getCollection(options?.session as FakeSession | undefined);
    const created = docs.map((doc) => structuredClone(doc));
    collection.push(...created);
    return structuredClone(created);
  }

  updateMany(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
    options?: { session?: MongooseSessionLike },
  ) {
    return new FakeExec<{ modifiedCount?: number; matchedCount?: number }>((sessionArg) => {
      const session = (options?.session as FakeSession | undefined) ?? sessionArg;
      const collection = this.getCollection(session);
      let matchedCount = 0;
      for (const row of collection) {
        if (!matchesFilter(row, filter)) continue;
        matchedCount += 1;
        Object.assign(row, structuredClone(update.$set));
      }
      return {
        matchedCount,
        modifiedCount: matchedCount,
      };
    });
  }

  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
    options?: {
      upsert?: boolean;
      new?: boolean;
      returnDocument?: "after" | "before";
      session?: MongooseSessionLike;
    },
  ) {
    return new FakeQuery<Record<string, unknown> | null>(({ session }) => {
      const activeSession = (options?.session as FakeSession | undefined) ?? session;
      const collection = this.getCollection(activeSession);
      const index = collection.findIndex((doc) => matchesFilter(doc, filter));

      if (index >= 0) {
        const current = collection[index]!;
        Object.assign(current, structuredClone(update.$set ?? {}));
        return structuredClone(current);
      }

      if (!options?.upsert) {
        return null;
      }

      const created = {
        ...(structuredClone(update.$setOnInsert ?? {}) as Record<string, unknown>),
        ...(structuredClone(update.$set ?? {}) as Record<string, unknown>),
      };
      collection.push(created);
      return structuredClone(created);
    });
  }

  findOneAndDelete(filter: Record<string, unknown>, options?: { session?: MongooseSessionLike }) {
    return new FakeQuery<Record<string, unknown> | null>(({ session }) => {
      const activeSession = (options?.session as FakeSession | undefined) ?? session;
      const collection = this.getCollection(activeSession);
      const index = collection.findIndex((doc) => matchesFilter(doc, filter));
      if (index === -1) return null;
      const [deleted] = collection.splice(index, 1);
      return deleted ? structuredClone(deleted) : null;
    });
  }

  deleteMany(filter: Record<string, unknown>, options?: { session?: MongooseSessionLike }) {
    return new FakeExec<{ deletedCount?: number }>((sessionArg) => {
      const session = (options?.session as FakeSession | undefined) ?? sessionArg;
      const collection = this.getCollection(session);
      const before = collection.length;
      const remaining = collection.filter((doc) => !matchesFilter(doc, filter));
      collection.splice(0, collection.length, ...remaining);
      return {
        deletedCount: before - remaining.length,
      };
    });
  }
}

function createTestRuntime() {
  const manager = new FakeSessionManager({
    users: [],
    profiles: [],
    sessions: [],
    organizations: [],
    members: [],
  });

  const orm = createOrm({
    schema,
    driver: createMongooseDriver<typeof schema>({
      models: {
        user: new FakeModel(manager, "users"),
        profile: new FakeModel(manager, "profiles"),
        session: new FakeModel(manager, "sessions"),
        organization: new FakeModel(manager, "organizations"),
        member: new FakeModel(manager, "members"),
      },
      startSession: () => manager.startSession(),
    }),
  });

  return { orm, manager };
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

describe("mongoose runtime", () => {
  it("supports create, findOne, findMany, count, and nested relations", async () => {
    const { orm, manager } = createTestRuntime();
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
    expect(manager.state.users[0]).toHaveProperty("_id");
    expect(manager.state.sessions[0]).toHaveProperty("user_id");
  });

  it("supports advanced relation traversal across belongsTo, hasOne, hasMany, and manyToMany", async () => {
    const { orm } = createTestRuntime();
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
  });

  it("supports update, updateMany, upsert, delete, deleteMany, transaction rollback, and batch", async () => {
    const { orm } = createTestRuntime();
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
    expect(rollbackCount).toBe(0);
    expect(summary).toEqual([
      {
        email: "ada@farminglabs.dev",
        emailVerified: true,
      },
      1,
    ]);
  });

  it("treats contains filters as literal substring matches", async () => {
    const { orm } = createTestRuntime();

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
  });

  it("falls back to non-transactional execution when no session source is configured", async () => {
    const manager = new FakeSessionManager({
      users: [],
      profiles: [],
      sessions: [],
      organizations: [],
      members: [],
    });

    const orm = createOrm({
      schema,
      driver: createMongooseDriver<typeof schema>({
        models: {
          user: new FakeModel(manager, "users"),
          profile: new FakeModel(manager, "profiles"),
          session: new FakeModel(manager, "sessions"),
          organization: new FakeModel(manager, "organizations"),
          member: new FakeModel(manager, "members"),
        },
      }),
    });

    await expect(
      orm.transaction(async () => {
        return "ok";
      }),
    ).resolves.toBe("ok");
  });
});

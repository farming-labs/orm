import { describe, expect, it } from "vitest";
import { createOrm } from "@farming-labs/orm";
import { createPrismaDriver } from "../src";
import { schema } from "./support/auth";

type PrismaWhereInput = Record<string, unknown>;
type PrismaRow = Record<string, unknown>;

function isFilterObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);
}

function matchesFilter(value: unknown, filter: unknown) {
  if (!isFilterObject(filter)) return value === filter;

  if ("equals" in filter && value !== filter.equals) return false;
  if ("contains" in filter && !String(value ?? "").includes(String(filter.contains))) return false;
  if ("in" in filter && Array.isArray(filter.in) && !filter.in.includes(value)) return false;
  if ("not" in filter && value === filter.not) return false;
  if ("gt" in filter) {
    const next = filter.gt as any;
    if (!(value instanceof Date && next instanceof Date ? value > next : (value as any) > next))
      return false;
  }
  if ("gte" in filter) {
    const next = filter.gte as any;
    if (!(value instanceof Date && next instanceof Date ? value >= next : (value as any) >= next))
      return false;
  }
  if ("lt" in filter) {
    const next = filter.lt as any;
    if (!(value instanceof Date && next instanceof Date ? value < next : (value as any) < next))
      return false;
  }
  if ("lte" in filter) {
    const next = filter.lte as any;
    if (!(value instanceof Date && next instanceof Date ? value <= next : (value as any) <= next))
      return false;
  }
  return true;
}

function matchesWhere(row: PrismaRow, where?: PrismaWhereInput) {
  if (!where) return true;

  if (
    Array.isArray(where.AND) &&
    !where.AND.every((entry) => matchesWhere(row, entry as PrismaWhereInput))
  ) {
    return false;
  }

  if (
    Array.isArray(where.OR) &&
    where.OR.length > 0 &&
    !where.OR.some((entry) => matchesWhere(row, entry as PrismaWhereInput))
  ) {
    return false;
  }

  if (where.NOT && matchesWhere(row, where.NOT as PrismaWhereInput)) {
    return false;
  }

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR" || key === "NOT") continue;
    if (!matchesFilter(row[key], value)) return false;
  }

  return true;
}

function sortRows(rows: PrismaRow[], orderBy?: Array<Record<string, "asc" | "desc">>) {
  if (!orderBy?.length) return [...rows];

  return [...rows].sort((left, right) => {
    for (const clause of orderBy) {
      const [field, direction] = Object.entries(clause)[0]!;
      const a = left[field];
      const b = right[field];
      if (a === b) continue;
      if (a == null) return direction === "asc" ? -1 : 1;
      if (b == null) return direction === "asc" ? 1 : -1;
      if (a < b) return direction === "asc" ? -1 : 1;
      if (a > b) return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}

class RecordingDelegate {
  readonly calls: Array<{ method: string; args: Record<string, unknown> | undefined }> = [];

  constructor(private readonly rows: PrismaRow[]) {}

  async findMany(args: Record<string, unknown> = {}) {
    this.calls.push({ method: "findMany", args });
    let results = this.rows.filter((row) => matchesWhere(row, args.where as PrismaWhereInput));
    results = sortRows(results, args.orderBy as Array<Record<string, "asc" | "desc">> | undefined);
    const skip = Number(args.skip ?? 0);
    const take = args.take == null ? undefined : Number(args.take);
    results = results.slice(skip, take == null ? undefined : skip + take);
    return results.map((row) => ({ ...row }));
  }

  async findFirst(args: Record<string, unknown> = {}) {
    this.calls.push({ method: "findFirst", args });
    return (await this.findMany({ ...args, take: 1 }))[0] ?? null;
  }

  async count(args: Record<string, unknown> = {}) {
    this.calls.push({ method: "count", args });
    return this.rows.filter((row) => matchesWhere(row, args.where as PrismaWhereInput)).length;
  }

  async create(args: { data: PrismaRow }) {
    this.calls.push({ method: "create", args });
    const row = { ...args.data };
    this.rows.push(row);
    return { ...row };
  }

  async update(args: { where: PrismaRow; data: PrismaRow }) {
    this.calls.push({ method: "update", args });
    const row = this.rows.find((entry) => matchesWhere(entry, args.where));
    if (!row) {
      throw new Error("Missing row for update");
    }
    Object.assign(row, args.data);
    return { ...row };
  }

  async updateMany(args: { where?: PrismaWhereInput; data: PrismaRow }) {
    this.calls.push({ method: "updateMany", args });
    let count = 0;
    for (const row of this.rows) {
      if (!matchesWhere(row, args.where)) continue;
      Object.assign(row, args.data);
      count += 1;
    }
    return { count };
  }

  async upsert(args: { where: PrismaRow; create: PrismaRow; update: PrismaRow }) {
    this.calls.push({ method: "upsert", args });
    const row = this.rows.find((entry) => matchesWhere(entry, args.where));
    if (row) {
      Object.assign(row, args.update);
      return { ...row };
    }
    const created = { ...args.create };
    this.rows.push(created);
    return { ...created };
  }

  async delete(args: { where: PrismaRow }) {
    this.calls.push({ method: "delete", args });
    const index = this.rows.findIndex((entry) => matchesWhere(entry, args.where));
    if (index === -1) {
      throw new Error("Missing row for delete");
    }
    const [deleted] = this.rows.splice(index, 1);
    return { ...deleted };
  }

  async deleteMany(args: { where?: PrismaWhereInput }) {
    this.calls.push({ method: "deleteMany", args });
    let count = 0;
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (!matchesWhere(this.rows[index], args.where)) continue;
      this.rows.splice(index, 1);
      count += 1;
    }
    return { count };
  }
}

class FakePrismaClient {
  readonly user: RecordingDelegate;
  readonly profile: RecordingDelegate;
  readonly session: RecordingDelegate;
  readonly organization: RecordingDelegate;
  readonly member: RecordingDelegate;
  transactionCalls = 0;

  constructor(seed?: Partial<Record<string, PrismaRow[]>>) {
    this.user = new RecordingDelegate([...(seed?.user ?? [])]);
    this.profile = new RecordingDelegate([...(seed?.profile ?? [])]);
    this.session = new RecordingDelegate([...(seed?.session ?? [])]);
    this.organization = new RecordingDelegate([...(seed?.organization ?? [])]);
    this.member = new RecordingDelegate([...(seed?.member ?? [])]);
  }

  async $transaction<TResult>(run: (tx: FakePrismaClient) => Promise<TResult>) {
    this.transactionCalls += 1;
    return run(this);
  }
}

function createSeededClient() {
  return new FakePrismaClient({
    user: [
      {
        id: "user_1",
        email: "ada@farminglabs.dev",
        name: "Ada",
        emailVerified: true,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ],
    profile: [
      {
        id: "profile_1",
        userId: "user_1",
        bio: "Writes one storage layer for every stack.",
      },
    ],
    session: [
      {
        id: "session_1",
        userId: "user_1",
        token: "session-1",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "session_2",
        userId: "user_1",
        token: "session-2",
        expiresAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ],
    organization: [
      {
        id: "org_1",
        name: "Acme",
        slug: "acme",
      },
      {
        id: "org_2",
        name: "Farming Labs",
        slug: "farming-labs",
      },
    ],
    member: [
      {
        id: "member_1",
        userId: "user_1",
        organizationId: "org_1",
        role: "owner",
      },
      {
        id: "member_2",
        userId: "user_1",
        organizationId: "org_2",
        role: "member",
      },
    ],
  });
}

describe("@farming-labs/orm-prisma", () => {
  it("loads nested relations through Prisma delegates", async () => {
    const client = createSeededClient();
    const orm = createOrm({
      schema,
      driver: createPrismaDriver({
        client: client as any,
      }),
    });

    const user = await orm.user.findOne({
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
          select: {
            token: true,
          },
          orderBy: {
            token: "asc",
          },
        },
        organizations: {
          select: {
            slug: true,
          },
          orderBy: {
            slug: "asc",
          },
        },
      },
    });

    expect(user).toEqual({
      id: "user_1",
      email: "ada@farminglabs.dev",
      profile: {
        bio: "Writes one storage layer for every stack.",
      },
      sessions: [{ token: "session-1" }, { token: "session-2" }],
      organizations: [{ slug: "acme" }, { slug: "farming-labs" }],
    });

    expect(client.user.calls[0]?.method).toBe("findFirst");
    expect(client.profile.calls[0]?.args?.where).toEqual({
      userId: "user_1",
    });
    expect(client.member.calls[0]?.args?.where).toEqual({
      userId: "user_1",
    });
    expect(client.organization.calls[0]?.args?.where).toEqual({
      id: {
        in: ["org_1", "org_2"],
      },
    });
  });

  it("translates writes, upserts, and batch workflows through Prisma delegates", async () => {
    const client = createSeededClient();
    const orm = createOrm({
      schema,
      driver: createPrismaDriver({
        client: client as any,
      }),
    });

    const created = await orm.user.create({
      data: {
        email: "grace@farminglabs.dev",
        name: "Grace",
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    const updated = await orm.user.update({
      where: {
        email: "grace@farminglabs.dev",
      },
      data: {
        name: "Grace Hopper",
      },
      select: {
        id: true,
        name: true,
      },
    });

    const upserted = await orm.session.upsert({
      where: {
        token: "session-3",
      },
      create: {
        userId: "user_1",
        token: "session-3",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      update: {
        expiresAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      select: {
        token: true,
      },
    });

    const deleted = await orm.session.deleteMany({
      where: {
        userId: "user_1",
      },
    });

    const batch = await orm.batch([
      (tx) =>
        tx.user.count({
          where: {
            email: {
              contains: "@farminglabs.dev",
            },
          },
        }),
      (tx) =>
        tx.organization.findMany({
          select: {
            slug: true,
          },
          orderBy: {
            slug: "asc",
          },
        }),
    ] as const);

    expect(created.id).toBeTypeOf("string");
    expect(created.email).toBe("grace@farminglabs.dev");
    expect(created.emailVerified).toBe(false);
    expect(updated).toEqual({
      id: created.id,
      name: "Grace Hopper",
    });
    expect(upserted).toEqual({
      token: "session-3",
    });
    expect(deleted).toBe(3);
    expect(batch).toEqual([2, [{ slug: "acme" }, { slug: "farming-labs" }]]);
    expect(client.transactionCalls).toBe(1);
    expect(client.user.calls.some((entry) => entry.method === "create")).toBe(true);
    expect(client.user.calls.some((entry) => entry.method === "update")).toBe(true);
    expect(client.session.calls.some((entry) => entry.method === "upsert")).toBe(true);
    expect(client.session.calls.some((entry) => entry.method === "deleteMany")).toBe(true);
  });
});

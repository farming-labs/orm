import { describe, expect, it } from "vitest";
import {
  belongsTo,
  createManifest,
  createMemoryDriver,
  createOrm,
  datetime,
  defineSchema,
  hasMany,
  hasOne,
  id,
  manyToMany,
  model,
  renderDrizzleSchema,
  renderPrismaSchema,
  renderSafeSql,
  string,
} from "../src";

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id().map("user_id"),
      email: string().unique().map("email_address"),
      createdAt: datetime().defaultNow(),
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
      userId: string().unique().references("user.id"),
      bio: string(),
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
    },
    relations: {
      members: hasMany("member", { foreignKey: "organizationId" }),
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
      userId: string().references("user.id"),
      organizationId: string().references("organization.id"),
      role: string(),
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
      organization: belongsTo("organization", { foreignKey: "organizationId" }),
    },
  }),
});

describe("@farming-labs/orm core", () => {
  it("builds a manifest from the schema DSL", () => {
    const manifest = createManifest(schema);
    expect(manifest.models.user.table).toBe("users");
    expect(manifest.models.user.fields.email.column).toBe("email_address");
    expect(manifest.models.session.fields.userId.references).toBe("user.id");
    expect(manifest.models.user.relations.profile.kind).toBe("hasOne");
    expect(manifest.models.user.relations.organizations.kind).toBe("manyToMany");
  });

  it("renders Prisma, Drizzle, and safe SQL outputs with relation-aware generation", () => {
    const prisma = renderPrismaSchema(schema, { provider: "postgresql" });
    const drizzle = renderDrizzleSchema(schema, { dialect: "pg" });
    const sql = renderSafeSql(schema, { dialect: "postgres" });
    const mysqlSql = renderSafeSql(schema, { dialect: "mysql" });

    expect(prisma).toContain("model User");
    expect(prisma).toContain('@map("email_address")');
    expect(prisma).toContain("profile Profile?");
    expect(prisma).toContain("sessions Session[]");
    expect(prisma).toContain("user User @relation(fields: [userId], references: [id])");
    expect(prisma).toContain("model Member");
    expect(drizzle).toContain('export const user = pgTable("users"');
    expect(drizzle).toContain('import { relations } from "drizzle-orm";');
    expect(drizzle).toContain("export const userRelations = relations(user");
    expect(drizzle).toContain("profile: one(profile)");
    expect(drizzle).toContain("sessions: many(session)");
    expect(drizzle).toContain(
      "user: one(user, { fields: [session.userId], references: [user.id] })",
    );
    expect(sql).toContain('create table if not exists "users"');
    expect(sql).toContain('references "users"("user_id")');
    expect(sql).toContain('create table if not exists "members"');
    expect(mysqlSql).toContain("`userId` varchar(191) not null references `users`(`user_id`)");
  });

  it("supports nested relation selection in the memory driver", async () => {
    const orm = createOrm({
      schema,
      driver: createMemoryDriver({
        user: [
          {
            id: "user_1",
            email: "ada@farminglabs.dev",
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          },
        ],
        session: [
          {
            id: "session_1",
            userId: "user_1",
            token: "token-1",
          },
        ],
      }),
    });

    const user = await orm.user.findFirst({
      where: { email: "ada@farminglabs.dev" },
      select: {
        id: true,
        email: true,
        sessions: {
          select: {
            token: true,
          },
        },
      },
    });

    expect(user).toEqual({
      id: "user_1",
      email: "ada@farminglabs.dev",
      sessions: [{ token: "token-1" }],
    });
  });
});

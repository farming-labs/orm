import { describe, expect, it } from "vitest";
import {
  belongsTo,
  bigint,
  createManifest,
  createMemoryDriver,
  createOrm,
  decimal,
  datetime,
  defineSchema,
  enumeration,
  hasMany,
  hasOne,
  id,
  integer,
  json,
  mergeUniqueLookupCreateData,
  manyToMany,
  model,
  renderDrizzleSchema,
  renderPrismaSchema,
  renderSafeSql,
  requireUniqueLookup,
  string,
  validateUniqueLookupUpdateData,
} from "../src";

const schema = defineSchema({
  user: model({
    table: "users",
    fields: {
      id: id().map("user_id"),
      email: string().unique().map("email_address"),
      loginCount: integer().default(0).map("login_count"),
      tier: enumeration(["free", "pro"]).default("free"),
      quota: bigint().default(0n).map("quota_bigint"),
      credit: decimal().default("0.00"),
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
      metadata: json<{ scope: string[] } | null>().nullable(),
    },
    constraints: {
      indexes: [["userId", "token"]],
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
    constraints: {
      unique: [["userId", "organizationId"]],
      indexes: [["organizationId", "role"]],
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
    expect(manifest.models.user.fields.loginCount.kind).toBe("integer");
    expect(manifest.models.user.fields.tier.kind).toBe("enum");
    expect(manifest.models.user.fields.tier.enumValues).toEqual(["free", "pro"]);
    expect(manifest.models.user.fields.quota.kind).toBe("bigint");
    expect(manifest.models.user.fields.credit.kind).toBe("decimal");
    expect(manifest.models.session.fields.metadata.kind).toBe("json");
    expect(manifest.models.session.fields.userId.references).toBe("user.id");
    expect(manifest.models.user.relations.profile.kind).toBe("hasOne");
    expect(manifest.models.user.relations.organizations.kind).toBe("manyToMany");
    expect(manifest.models.member.constraints.unique).toEqual([
      {
        name: "members_userid_organizationid_unique",
        fields: ["userId", "organizationId"],
        columns: ["userId", "organizationId"],
        unique: true,
      },
    ]);
  });

  it("renders Prisma, Drizzle, and safe SQL outputs with relation-aware generation", () => {
    const prisma = renderPrismaSchema(schema, { provider: "postgresql" });
    const drizzle = renderDrizzleSchema(schema, { dialect: "pg" });
    const sql = renderSafeSql(schema, { dialect: "postgres" });
    const mysqlSql = renderSafeSql(schema, { dialect: "mysql" });

    expect(prisma).toContain("model User");
    expect(prisma).toContain('loginCount Int @default(0) @map("login_count")');
    expect(prisma).toContain("enum UserTierEnum");
    expect(prisma).toContain("tier UserTierEnum @default(FREE)");
    expect(prisma).toContain('quota BigInt @default(0) @map("quota_bigint")');
    expect(prisma).toContain("credit Decimal @default(0.00)");
    expect(prisma).toContain("metadata Json?");
    expect(prisma).toContain('@map("email_address")');
    expect(prisma).toContain("profile Profile?");
    expect(prisma).toContain("sessions Session[]");
    expect(prisma).toContain("user User @relation(fields: [userId], references: [id])");
    expect(prisma).toContain("model Member");
    expect(prisma).toContain("@@unique([userId, organizationId])");
    expect(prisma).toContain("@@index([organizationId, role])");
    expect(drizzle).toContain('export const user = pgTable("users"');
    expect(drizzle).toContain('loginCount: integer("login_count").notNull().default(0)');
    expect(drizzle).toContain(
      'export const userTierEnum = pgEnum("users_tier_enum", ["free", "pro"]);',
    );
    expect(drizzle).toContain('tier: userTierEnum("tier").notNull().default("free")');
    expect(drizzle).toContain(
      'quota: bigint("quota_bigint", { mode: "bigint" }).notNull().default(0n)',
    );
    expect(drizzle).toContain(
      'credit: numeric("credit", { precision: 65, scale: 30 }).notNull().default("0.00")',
    );
    expect(drizzle).toContain('metadata: jsonb("metadata")');
    expect(drizzle).toContain('import { relations } from "drizzle-orm";');
    expect(drizzle).toContain('uniqueIndex("members_userid_organizationid_unique")');
    expect(drizzle).toContain('index("members_organizationid_role_idx")');
    expect(drizzle).toContain("export const userRelations = relations(user");
    expect(drizzle).toContain("profile: one(profile)");
    expect(drizzle).toContain("sessions: many(session)");
    expect(drizzle).toContain(
      "user: one(user, { fields: [session.userId], references: [user.id] })",
    );
    expect(sql).toContain('create table if not exists "users"');
    expect(sql).toContain('"login_count" integer not null default 0');
    expect(sql).toContain(
      "\"tier\" text not null default 'free' check (\"tier\" in ('free', 'pro'))",
    );
    expect(sql).toContain('"quota_bigint" bigint not null default 0');
    expect(sql).toContain("\"credit\" numeric(65, 30) not null default '0.00'");
    expect(sql).toContain('"metadata" jsonb');
    expect(sql).toContain('references "users"("user_id")');
    expect(sql).toContain('create table if not exists "members"');
    expect(sql).toContain(
      'create unique index if not exists "members_userid_organizationid_unique" on "members"("userId", "organizationId");',
    );
    expect(sql).toContain(
      'create index if not exists "members_organizationid_role_idx" on "members"("organizationId", "role");',
    );
    expect(mysqlSql).toContain("`userId` varchar(191) not null references `users`(`user_id`)");
    expect(mysqlSql).toContain("`login_count` integer not null default 0");
    expect(mysqlSql).toContain("`tier` enum('free', 'pro') not null default 'free'");
    expect(mysqlSql).toContain("`quota_bigint` bigint not null default 0");
    expect(mysqlSql).toContain("`credit` decimal(65, 30) not null default '0.00'");
    expect(mysqlSql).toContain("`metadata` json");
    expect(mysqlSql).toContain(
      "create unique index `members_userid_organizationid_unique` on `members`(`userId`, `organizationId`);",
    );
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

  it("treats equal Date values as matching compound-unique lookup values", () => {
    const auditSchema = defineSchema({
      auditEvent: model({
        table: "audit_events",
        fields: {
          id: id(),
          scope: string(),
          occurredAt: datetime(),
          note: string(),
        },
        constraints: {
          unique: [["scope", "occurredAt"]],
        },
      }),
    });

    const manifest = createManifest(auditSchema);
    const auditModel = manifest.models.auditEvent;
    const firstDate = new Date("2026-01-01T00:00:00.000Z");
    const secondDate = new Date("2026-01-01T00:00:00.000Z");
    const lookup = requireUniqueLookup(
      auditModel,
      {
        scope: "session",
        occurredAt: firstDate,
      },
      "Upsert",
    );

    expect(
      mergeUniqueLookupCreateData(
        auditModel,
        {
          scope: "session",
          occurredAt: secondDate,
          note: "create",
        },
        lookup,
        "Upsert",
      ),
    ).toEqual({
      scope: "session",
      occurredAt: secondDate,
      note: "create",
    });

    expect(() =>
      validateUniqueLookupUpdateData(
        auditModel,
        {
          occurredAt: secondDate,
        },
        lookup,
        "Upsert",
      ),
    ).not.toThrow();
  });
});

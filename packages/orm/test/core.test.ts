import { describe, expect, it } from "vitest";
import {
  belongsTo,
  createManifest,
  createMemoryDriver,
  createOrm,
  datetime,
  defineSchema,
  hasMany,
  id,
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
      sessions: hasMany("session", { foreignKey: "userId" }),
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
});

describe("@farming-labs/orm core", () => {
  it("builds a manifest from the schema DSL", () => {
    const manifest = createManifest(schema);
    expect(manifest.models.user.table).toBe("users");
    expect(manifest.models.user.fields.email.column).toBe("email_address");
    expect(manifest.models.session.fields.userId.references).toBe("user.id");
  });

  it("renders Prisma, Drizzle, and safe SQL outputs", () => {
    const prisma = renderPrismaSchema(schema, { provider: "postgresql" });
    const drizzle = renderDrizzleSchema(schema, { dialect: "pg" });
    const sql = renderSafeSql(schema, { dialect: "postgres" });
    const mysqlSql = renderSafeSql(schema, { dialect: "mysql" });

    expect(prisma).toContain("model User");
    expect(prisma).toContain('@map("email_address")');
    expect(drizzle).toContain('export const user = pgTable("users"');
    expect(sql).toContain('create table if not exists "users"');
    expect(sql).toContain('references "users"("user_id")');
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

import {
  belongsTo,
  boolean,
  datetime,
  defineSchema,
  hasMany,
  hasOne,
  id,
  model,
  string,
} from "@farming-labs/orm";

export const authSchema = defineSchema({
  user: model({
    table: "users",
    description: "Core user records for auth-like libraries.",
    fields: {
      id: id(),
      name: string(),
      email: string().unique().map("email_address"),
      emailVerified: boolean().default(false),
      createdAt: datetime().defaultNow(),
      updatedAt: datetime().defaultNow(),
    },
    relations: {
      profile: hasOne("profile", { foreignKey: "userId" }),
      accounts: hasMany("account", { foreignKey: "userId" }),
      sessions: hasMany("session", { foreignKey: "userId" }),
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
    },
    relations: {
      user: belongsTo("user", { foreignKey: "userId" }),
    },
  }),
});

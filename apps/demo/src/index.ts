import { createMemoryDriver, createOrm } from "@farming-labs/orm";
import { authSchema } from "./schema";

const orm = createOrm({
  schema: authSchema,
  driver: createMemoryDriver({
    user: [
      {
        id: "user_1",
        name: "Ada Lovelace",
        email: "ada@farminglabs.dev",
        emailVerified: true,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ],
    profile: [
      {
        id: "profile_1",
        userId: "user_1",
        bio: "Design once, ship to every storage layer.",
      },
    ],
    session: [
      {
        id: "session_1",
        userId: "user_1",
        token: "session-token",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    account: [
      {
        id: "account_1",
        userId: "user_1",
        provider: "github",
        accountId: "gh_ada",
      },
    ],
  }),
});

const user = await orm.user.findFirst({
  where: { email: "ada@farminglabs.dev" },
  select: {
    id: true,
    name: true,
    email: true,
    profile: {
      select: {
        bio: true,
      },
    },
    sessions: {
      select: {
        token: true,
        expiresAt: true,
      },
    },
    accounts: {
      select: {
        provider: true,
        accountId: true,
      },
    },
  },
});
console.log(JSON.stringify(user, null, 2));

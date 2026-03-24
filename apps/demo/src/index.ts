import { createMemoryDriver, createOrm } from "@farming-labs/orm";
import { createAuthStore, type AuthOrm } from "./auth-store";
import { authSchema } from "./schema";

const orm: AuthOrm = createOrm({
  schema: authSchema,
  driver: createMemoryDriver<typeof authSchema>({
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

const auth = createAuthStore(orm);
const user = await auth.findUserByEmail("ada@farminglabs.dev");
const summary = await auth.getAuthSummary("user_1");

console.log(
  JSON.stringify(
    {
      user,
      summary,
    },
    null,
    2,
  ),
);

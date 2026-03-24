import { describe, expect, it } from "vitest";
import { createMemoryDriver, createOrm } from "@farming-labs/orm";
import { createAuthStore, type AuthOrm } from "./auth-store";
import { authSchema } from "./schema";

describe("demo app", () => {
  it("loads a nested auth-shaped record through the typed API", async () => {
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
            bio: "Analytical engine fan.",
          },
        ],
      }),
    });

    const user = await orm.user.findFirst({
      where: { email: "ada@farminglabs.dev" },
      select: {
        id: true,
        profile: {
          select: {
            bio: true,
          },
        },
      },
    });

    expect(user).toEqual({
      id: "user_1",
      profile: {
        bio: "Analytical engine fan.",
      },
    });
  });

  it("shows how an auth library can write one storage layer against the unified runtime", async () => {
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
            bio: "Analytical engine fan.",
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
        session: [
          {
            id: "session_1",
            userId: "user_1",
            token: "session-token",
            expiresAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      }),
    });

    const auth = createAuthStore(orm);
    const user = await auth.findUserByEmail("ADA@FARMINGLABS.DEV");
    const rotated = await auth.rotateSession({
      userId: "user_1",
      token: "session-token",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    const summary = await auth.getAuthSummary("user_1");

    expect(user).toEqual({
      id: "user_1",
      name: "Ada Lovelace",
      email: "ada@farminglabs.dev",
      profile: {
        bio: "Analytical engine fan.",
      },
      accounts: [
        {
          provider: "github",
          accountId: "gh_ada",
        },
      ],
      sessions: [
        {
          token: "session-token",
          expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    expect(rotated).toEqual({
      token: "session-token",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(summary).toEqual([
      {
        id: "user_1",
        email: "ada@farminglabs.dev",
      },
      1,
      1,
    ]);
  });
});

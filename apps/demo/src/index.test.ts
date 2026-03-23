import { describe, expect, it } from "vitest";
import { createMemoryDriver, createOrm } from "@farming-labs/orm";
import { authSchema } from "./schema";

describe("demo app", () => {
  it("loads a nested auth-shaped record through the typed API", async () => {
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
});

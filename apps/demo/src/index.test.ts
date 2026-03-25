import { describe, expect, it } from "vitest";
import {
  localDemoAdapters,
  probeDemoAdapter,
  runUnifiedAuthDemo,
  selfContainedDemoAdapters,
  type DemoAdapterName,
} from "./demo-runtime";

const LOCAL_TIMEOUT_MS = 20_000;

function assertUnifiedAuthDemo(
  result: Awaited<ReturnType<typeof runUnifiedAuthDemo>>,
  adapterName: DemoAdapterName,
) {
  expect(result.adapter.name).toBe(adapterName);
  expect(result.created).toEqual({
    user: {
      id: expect.any(String),
      email: "ada@farminglabs.dev",
    },
    account: {
      provider: "github",
      accountId: "gh_ada",
    },
  });

  expect(result.rotated).toEqual({
    token: "session-token",
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  });

  expect(result.user).toEqual({
    id: result.created.user.id,
    name: "Ada Lovelace",
    email: "ada@farminglabs.dev",
    profile: {
      bio: `Unified auth flow running through ${result.adapter.client}.`,
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
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    ],
  });

  expect(result.summary).toEqual([
    {
      id: result.created.user.id,
      email: "ada@farminglabs.dev",
    },
    1,
    1,
  ]);

  if (adapterName === "memory") {
    expect(result.directCheck).toBeNull();
  } else {
    expect(result.directCheck).toEqual({
      id: result.created.user.id,
      email: "ada@farminglabs.dev",
    });
  }
}

describe("unified auth demo", () => {
  for (const adapterName of selfContainedDemoAdapters) {
    it(`runs the same auth flow through the ${adapterName} adapter`, async () => {
      const result = await runUnifiedAuthDemo(adapterName);
      assertUnifiedAuthDemo(result, adapterName);
    });
  }

  for (const adapterName of localDemoAdapters) {
    it(
      `can also swap into the ${adapterName} adapter when the local service is available`,
      async () => {
        if (process.env.FARM_ORM_DEMO_INCLUDE_LOCAL !== "1") {
          return;
        }

        const availability = await probeDemoAdapter(adapterName);
        if (!availability.available) {
          if (process.env.FARM_ORM_DEMO_REQUIRE_LOCAL === "1") {
            throw new Error(availability.reason ?? `Local adapter ${adapterName} is unavailable.`);
          }
          return;
        }

        const result = await runUnifiedAuthDemo(adapterName);
        assertUnifiedAuthDemo(result, adapterName);
      },
      LOCAL_TIMEOUT_MS,
    );
  }
});

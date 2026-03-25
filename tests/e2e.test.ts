import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(__dirname, "..");
const demoDir = path.join(rootDir, "apps", "demo");
const cliBin = path.join(rootDir, "packages", "cli", "dist", "bin.js");

async function runNode(args: string[], cwd = rootDir) {
  return execFileAsync("node", args, {
    cwd,
    env: process.env,
  });
}

async function runPnpm(args: string[], cwd = rootDir) {
  return execFileAsync("pnpm", args, {
    cwd,
    env: process.env,
  });
}

describe("workspace end to end", () => {
  it("builds packages, generates demo artifacts, validates them, and runs the demo flow", async () => {
    await runPnpm(["--filter", "@farming-labs/orm", "build"]);
    await runPnpm(["--filter", "@farming-labs/orm-cli", "build"]);

    const prisma = await runNode(
      [cliBin, "generate", "prisma", "-c", "./farm-orm.config.ts"],
      demoDir,
    );
    const drizzle = await runNode(
      [cliBin, "generate", "drizzle", "-c", "./farm-orm.config.ts"],
      demoDir,
    );
    const sql = await runNode([cliBin, "generate", "sql", "-c", "./farm-orm.config.ts"], demoDir);

    expect(prisma.stdout).toContain("Generated prisma output");
    expect(drizzle.stdout).toContain("Generated drizzle output");
    expect(sql.stdout).toContain("Generated sql output");

    const prismaCheck = await runNode(
      [cliBin, "check", "prisma", "-c", "./farm-orm.config.ts"],
      demoDir,
    );
    const drizzleCheck = await runNode(
      [cliBin, "check", "drizzle", "-c", "./farm-orm.config.ts"],
      demoDir,
    );
    const sqlCheck = await runNode([cliBin, "check", "sql", "-c", "./farm-orm.config.ts"], demoDir);

    expect(prismaCheck.stdout).toContain("up to date");
    expect(drizzleCheck.stdout).toContain("up to date");
    expect(sqlCheck.stdout).toContain("up to date");

    const prismaSchema = await readFile(
      path.join(demoDir, "generated/prisma/schema.prisma"),
      "utf8",
    );
    const drizzleSchema = await readFile(path.join(demoDir, "generated/drizzle/schema.ts"), "utf8");
    expect(prismaSchema).toContain("profile Profile?");
    expect(prismaSchema).toContain("accounts Account[]");
    expect(prismaSchema).toContain("sessions Session[]");
    expect(drizzleSchema).toContain("export const userRelations");
    expect(drizzleSchema).toContain("profile: one(profile)");
    expect(drizzleSchema).toContain("accounts: many(account)");
    expect(drizzleSchema).toContain("sessions: many(session)");

    const demoRun = await runPnpm(["exec", "tsx", "src/index.ts"], demoDir);
    const demoPayload = JSON.parse(demoRun.stdout) as {
      ok: boolean;
      status: string;
      adapter: string;
      result: {
        adapter: {
          name: string;
          client: string;
        };
        user: {
          name: string;
          profile: {
            bio: string;
          } | null;
        } | null;
        created: {
          account: {
            provider: string;
          };
        };
      };
    };

    expect(demoPayload.ok).toBe(true);
    expect(demoPayload.status).toBe("passed");
    expect(demoPayload.adapter).toBe("memory");
    expect(demoPayload.result.adapter.name).toBe("memory");
    expect(demoPayload.result.user?.name).toBe("Ada Lovelace");
    expect(demoPayload.result.created.account.provider).toBe("github");
    expect(demoPayload.result.user?.profile?.bio).toBe(
      `Unified auth flow running through ${demoPayload.result.adapter.client}.`,
    );

    const drizzleDemoRun = await runPnpm(["exec", "tsx", "src/index.ts", "--", "drizzle-sqlite"], demoDir);
    const drizzleDemoPayload = JSON.parse(drizzleDemoRun.stdout) as {
      ok: boolean;
      status: string;
      adapter: string;
      result: {
        adapter: {
          name: string;
          client: string;
        };
        user: {
          name: string;
          profile: {
            bio: string;
          } | null;
        } | null;
      };
    };

    expect(drizzleDemoPayload.ok).toBe(true);
    expect(drizzleDemoPayload.status).toBe("passed");
    expect(drizzleDemoPayload.adapter).toBe("drizzle-sqlite");
    expect(drizzleDemoPayload.result.adapter.name).toBe("drizzle-sqlite");
    expect(drizzleDemoPayload.result.user?.name).toBe("Ada Lovelace");
    expect(drizzleDemoPayload.result.user?.profile?.bio).toBe(
      `Unified auth flow running through ${drizzleDemoPayload.result.adapter.client}.`,
    );
  }, 120_000);
});

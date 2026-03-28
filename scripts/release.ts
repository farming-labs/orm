import { spawnSync } from "node:child_process";

const bumppArgs = [
  "exec",
  "bumpp",
  "package.json",
  "packages/orm/package.json",
  "packages/cli/package.json",
  "packages/sql/package.json",
  "packages/drizzle/package.json",
  "packages/kysely/package.json",
  "packages/mongo/package.json",
  "packages/mongoose/package.json",
  "packages/prisma/package.json",
  "packages/runtime/package.json",
  "--commit",
  "chore: release v%s",
  "--tag",
  "v%s",
  "--no-push",
  "--no-verify",
  ...process.argv.slice(2),
];

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, bumppArgs, {
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

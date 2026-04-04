import path from "node:path";
import { spawnSync } from "node:child_process";

function loadWorkspaceEnvFile() {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  try {
    process.loadEnvFile?.(rootEnvPath);
  } catch {}
}

loadWorkspaceEnvFile();

function hasRealXataApiKey() {
  return Boolean(process.env.FARM_ORM_LOCAL_XATA_API_KEY ?? process.env.XATA_API_KEY);
}

function hasRealXataDatabaseUrl() {
  return Boolean(process.env.FARM_ORM_LOCAL_XATA_DATABASE_URL ?? process.env.XATA_DATABASE_URL);
}

if (!hasRealXataApiKey()) {
  console.error(
    [
      "Real Xata tests need an API key.",
      "Set one of:",
      "  FARM_ORM_LOCAL_XATA_API_KEY=your-xata-api-key",
      "  XATA_API_KEY=your-xata-api-key",
    ].join("\n"),
  );
  process.exit(1);
}

if (!hasRealXataDatabaseUrl()) {
  console.error(
    [
      "Real Xata tests also need a database URL.",
      "Set one of:",
      "  FARM_ORM_LOCAL_XATA_DATABASE_URL=https://workspace.region.xata.sh/db/database:branch",
      "  XATA_DATABASE_URL=https://workspace.region.xata.sh/db/database:branch",
    ].join("\n"),
  );
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", "vitest.local.config.ts", "test/real.integration.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FARM_ORM_FORCE_REAL_XATA_TESTS: "1",
    },
  },
);

process.exit(result.status ?? 1);

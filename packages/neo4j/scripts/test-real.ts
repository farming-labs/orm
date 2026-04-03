import path from "node:path";
import { spawnSync } from "node:child_process";

function loadWorkspaceEnvFile() {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  try {
    process.loadEnvFile?.(rootEnvPath);
  } catch {}
}

loadWorkspaceEnvFile();

function hasRealNeo4jEnv() {
  return Boolean(process.env.FARM_ORM_LOCAL_NEO4J_URI ?? process.env.NEO4J_URI);
}

function hasNeo4jAuth() {
  return (
    Boolean(
      process.env.FARM_ORM_LOCAL_NEO4J_USERNAME ??
      process.env.NEO4J_USERNAME ??
      process.env.NEO4J_USER,
    ) && Boolean(process.env.FARM_ORM_LOCAL_NEO4J_PASSWORD ?? process.env.NEO4J_PASSWORD)
  );
}

if (!hasRealNeo4jEnv()) {
  console.error(
    [
      "Real Neo4j tests need a Bolt URI.",
      "Set one of:",
      "  FARM_ORM_LOCAL_NEO4J_URI=bolt://127.0.0.1:7687",
      "  NEO4J_URI=bolt://127.0.0.1:7687",
    ].join("\n"),
  );
  process.exit(1);
}

if (!hasNeo4jAuth()) {
  console.error(
    [
      "Real Neo4j tests also need credentials.",
      "Set one of:",
      "  FARM_ORM_LOCAL_NEO4J_USERNAME=neo4j",
      "  FARM_ORM_LOCAL_NEO4J_PASSWORD=your-password",
      "or:",
      "  NEO4J_USERNAME=neo4j",
      "  NEO4J_PASSWORD=your-password",
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
      FARM_ORM_FORCE_REAL_NEO4J_TESTS: "1",
    },
  },
);

process.exit(result.status ?? 1);

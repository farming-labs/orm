import path from "node:path";
import { spawnSync } from "node:child_process";

function loadWorkspaceEnvFile() {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  try {
    process.loadEnvFile?.(rootEnvPath);
  } catch {}
}

loadWorkspaceEnvFile();

function hasRealFirestoreEnv() {
  return Boolean(
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FARM_ORM_LOCAL_FIRESTORE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
  );
}

function hasProjectId() {
  return Boolean(
    process.env.FARM_ORM_LOCAL_FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
  );
}

if (!hasRealFirestoreEnv()) {
  console.error(
    [
      "Real Firestore tests need credentials or an emulator.",
      "Set one of:",
      "  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080",
      "  GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json",
      '  FARM_ORM_LOCAL_FIRESTORE_SERVICE_ACCOUNT_JSON=\'{"type":"service_account", ...}\'',
    ].join("\n"),
  );
  process.exit(1);
}

if (!process.env.FIRESTORE_EMULATOR_HOST && !hasProjectId()) {
  console.error(
    [
      "Real Firestore tests also need a project id.",
      "Set one of:",
      "  GOOGLE_CLOUD_PROJECT=your-firestore-project",
      "  FARM_ORM_LOCAL_FIRESTORE_PROJECT_ID=your-firestore-project",
    ].join("\n"),
  );
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "vitest", "run", "test/real.integration.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    FARM_ORM_FORCE_REAL_FIRESTORE_TESTS: "1",
  },
});

process.exit(result.status ?? 1);

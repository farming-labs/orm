import path from "node:path";
import { createIsolatedName } from "../../../mongoose/test/support/auth";

type Neo4jDriverModule = typeof import("neo4j-driver");
type RealNeo4jDriver = ReturnType<Neo4jDriverModule["default"]["driver"]>;

function loadWorkspaceEnvFile() {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  try {
    process.loadEnvFile?.(rootEnvPath);
  } catch {}
}

loadWorkspaceEnvFile();

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

export function shouldRunRealNeo4jTests() {
  if (
    process.env.FARM_ORM_SKIP_REAL_NEO4J_TESTS === "1" ||
    process.env.FARM_ORM_SKIP_REAL_NEO4J_TESTS === "true"
  ) {
    return false;
  }

  if (
    process.env.FARM_ORM_FORCE_REAL_NEO4J_TESTS === "1" ||
    process.env.FARM_ORM_FORCE_REAL_NEO4J_TESTS === "true"
  ) {
    return true;
  }

  return Boolean(
    readEnv("FARM_ORM_LOCAL_NEO4J_URI", "NEO4J_URI") &&
    readEnv("FARM_ORM_LOCAL_NEO4J_USERNAME", "NEO4J_USERNAME", "NEO4J_USER") &&
    readEnv("FARM_ORM_LOCAL_NEO4J_PASSWORD", "NEO4J_PASSWORD"),
  );
}

export function realNeo4jConfig() {
  const uri = readEnv("FARM_ORM_LOCAL_NEO4J_URI", "NEO4J_URI");
  const username = readEnv("FARM_ORM_LOCAL_NEO4J_USERNAME", "NEO4J_USERNAME", "NEO4J_USER");
  const password = readEnv("FARM_ORM_LOCAL_NEO4J_PASSWORD", "NEO4J_PASSWORD");
  const database = readEnv("FARM_ORM_LOCAL_NEO4J_DATABASE", "NEO4J_DATABASE");

  if (!uri || !username || !password) {
    throw new Error("Real Neo4j integration tests require a URI, username, and password.");
  }

  return {
    uri,
    username,
    password,
    database,
  };
}

export async function createRealNeo4jDriver() {
  const neo4j = (await import("neo4j-driver")) as Neo4jDriverModule;
  const config = realNeo4jConfig();
  const driver = neo4j.default.driver(
    config.uri,
    neo4j.default.auth.basic(config.username, config.password),
  );

  await driver.verifyConnectivity();

  return {
    driver,
    config,
  };
}

export function createRealNeo4jBase() {
  return createIsolatedName("farm_orm_neo4j");
}

export async function cleanupNeo4jBase(driver: RealNeo4jDriver, base: string, database?: string) {
  const session = driver.session(database ? { database } : undefined);

  try {
    await session.run(
      [
        "MATCH (n)",
        "WHERE (n:FarmOrmRecord OR n:FarmOrmUnique)",
        `  AND n.__ormNamespace STARTS WITH $base`,
        "DETACH DELETE n",
      ].join("\n"),
      {
        base,
      },
    );
  } finally {
    await session.close();
  }
}

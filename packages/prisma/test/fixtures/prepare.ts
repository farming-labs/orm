import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderPrismaSchema } from "@farming-labs/orm";
import { schema } from "../support/auth";

const execFileAsync = promisify(execFile);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, "..", "..");

type PrismaFixtureProvider = "sqlite" | "postgresql" | "mysql";

function fixtureDir(provider: PrismaFixtureProvider) {
  return path.join(dirname, provider);
}

function fixtureSchemaPath(provider: PrismaFixtureProvider) {
  return path.join(fixtureDir(provider), "schema.prisma");
}

function fixtureSqlPath(provider: PrismaFixtureProvider) {
  return path.join(fixtureDir(provider), "schema.sql");
}

function withDatabaseEnv(rendered: string) {
  return rendered.replace(/url\s+=\s+.+/, `url      = env("DATABASE_URL")`);
}

function renderFixtureSchema(provider: PrismaFixtureProvider) {
  const rendered = renderPrismaSchema(schema, { provider });
  return withDatabaseEnv(
    rendered.replace(
      `generator client {\n  provider = "prisma-client-js"\n}`,
      `generator client {\n  provider = "prisma-client-js"\n  output   = "./generated/client"\n}`,
    ),
  );
}

function assignDatabase(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function postgresGenerateUrl() {
  return (
    process.env.FARM_ORM_LOCAL_PG_ADMIN_URL ??
    `postgres://${userInfo().username}@127.0.0.1:5432/postgres`
  );
}

function mysqlGenerateUrl() {
  const baseUrl = process.env.FARM_ORM_LOCAL_MYSQL_ADMIN_URL ?? "mysql://root@127.0.0.1:3306";
  return assignDatabase(baseUrl, "mysql");
}

async function runPrismaGenerate(schemaPath: string, databaseUrl: string) {
  await execFileAsync("pnpm", ["exec", "prisma", "generate", "--schema", schemaPath], {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}

async function runPrismaDbExecute(schemaPath: string, sqlPath: string, databaseUrl: string) {
  await execFileAsync(
    "pnpm",
    ["exec", "prisma", "db", "execute", "--schema", schemaPath, "--file", sqlPath],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

async function writePrismaDiffSql(schemaPath: string, sqlPath: string, databaseUrl: string) {
  const { stdout } = await execFileAsync(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      schemaPath,
      "--script",
    ],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  await writeFile(sqlPath, stdout, "utf8");
}

async function prepareProvider(provider: PrismaFixtureProvider) {
  const dir = fixtureDir(provider);
  const schemaPath = fixtureSchemaPath(provider);
  const sqlPath = fixtureSqlPath(provider);
  const generatedDir = path.join(dir, "generated");

  await mkdir(dir, { recursive: true });
  await rm(generatedDir, { recursive: true, force: true });
  await rm(sqlPath, { force: true });
  await writeFile(schemaPath, renderFixtureSchema(provider), "utf8");

  if (provider === "sqlite") {
    const databasePath = path.join(dir, "dev.db");
    await rm(databasePath, { force: true });
    const databaseUrl = "file:dev.db";
    await writePrismaDiffSql(schemaPath, sqlPath, databaseUrl);
    await runPrismaDbExecute(schemaPath, sqlPath, databaseUrl);
    await runPrismaGenerate(schemaPath, databaseUrl);
    return;
  }

  if (provider === "postgresql") {
    await runPrismaGenerate(schemaPath, postgresGenerateUrl());
    return;
  }

  await runPrismaGenerate(schemaPath, mysqlGenerateUrl());
}

await prepareProvider("sqlite");
await prepareProvider("postgresql");
await prepareProvider("mysql");

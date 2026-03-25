import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createManifest, renderPrismaSchema, type ManifestField } from "@farming-labs/orm";
import { schema } from "../support/auth";

const execFileAsync = promisify(execFile);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, "..", "..");

type PrismaFixtureProvider = "sqlite" | "postgresql" | "mysql";

function sqliteIdentifier(value: string) {
  return `"${value}"`;
}

function sqliteType(field: ManifestField) {
  if (field.kind === "boolean") return "boolean";
  if (field.kind === "datetime") return "datetime";
  return "text";
}

function renderPrismaSqliteTables() {
  const manifest = createManifest(schema);

  return Object.values(manifest.models)
    .map((model) => {
      const columns = Object.values(model.fields).map((field) => {
        const parts = [`${sqliteIdentifier(field.column)} ${sqliteType(field)}`];

        if (field.kind === "id") parts.push("primary key");
        if (!field.nullable) parts.push("not null");
        if (field.unique && field.kind !== "id") parts.push("unique");

        if (field.references) {
          const [targetModel, targetField] = field.references.split(".");
          const targetTable = manifest.models[targetModel]?.table ?? targetModel;
          const targetColumn =
            manifest.models[targetModel]?.fields[targetField]?.column ?? targetField;
          parts.push(
            `references ${sqliteIdentifier(targetTable)}(${sqliteIdentifier(targetColumn)})`,
          );
        }

        return `  ${parts.join(" ")}`;
      });

      return `create table if not exists ${sqliteIdentifier(model.table)} (\n${columns.join(",\n")}\n);`;
    })
    .join("\n\n");
}

function applyStatements(database: DatabaseSync, sql: string) {
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    database.exec(`${statement};`);
  }
}

function fixtureDir(provider: PrismaFixtureProvider) {
  return path.join(dirname, provider);
}

function fixtureSchemaPath(provider: PrismaFixtureProvider) {
  return path.join(fixtureDir(provider), "schema.prisma");
}

function fixtureClientOutput(provider: PrismaFixtureProvider) {
  return "./generated/client";
}

function withFixtureOutput(rendered: string) {
  return rendered.replace(
    `generator client {\n  provider = "prisma-client-js"\n}`,
    `generator client {\n  provider = "prisma-client-js"\n  output   = "${fixtureClientOutput("sqlite")}"\n}`,
  );
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
  await execFileAsync(
    "pnpm",
    ["exec", "prisma", "generate", "--schema", schemaPath],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

async function prepareProvider(provider: PrismaFixtureProvider) {
  const dir = fixtureDir(provider);
  const schemaPath = fixtureSchemaPath(provider);
  const generatedDir = path.join(dir, "generated");

  await mkdir(dir, { recursive: true });
  await rm(generatedDir, { recursive: true, force: true });
  await writeFile(schemaPath, renderFixtureSchema(provider), "utf8");

  if (provider === "sqlite") {
    const databasePath = path.join(dir, "dev.db");
    await rm(databasePath, { force: true });
    const database = new DatabaseSync(databasePath);
    try {
      applyStatements(database, renderPrismaSqliteTables());
    } finally {
      database.close();
    }
    await runPrismaGenerate(schemaPath, `file:${databasePath}`);
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

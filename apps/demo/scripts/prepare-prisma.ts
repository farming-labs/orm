import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createManifest, type ManifestField } from "@farming-labs/orm";
import { authSchema } from "../src/schema";

const execFileAsync = promisify(execFile);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(dirname, "..");
const prismaDir = path.join(demoRoot, "prisma");
const schemaPath = path.join(prismaDir, "schema.prisma");
const databasePath = path.join(prismaDir, "dev.db");
const generatedDir = path.join(prismaDir, "generated");

function sqliteIdentifier(value: string) {
  return `"${value}"`;
}

function sqliteType(field: ManifestField) {
  if (field.kind === "boolean") return "boolean";
  if (field.kind === "datetime") return "datetime";
  return "text";
}

function renderDemoTables() {
  const manifest = createManifest(authSchema);

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

await mkdir(prismaDir, { recursive: true });
await rm(generatedDir, { recursive: true, force: true });
await rm(databasePath, { force: true });

const database = new DatabaseSync(databasePath);

try {
  applyStatements(database, renderDemoTables());
} finally {
  database.close();
}

await execFileAsync("pnpm", ["exec", "prisma", "generate", "--schema", "./prisma/schema.prisma"], {
  cwd: demoRoot,
  env: {
    ...process.env,
    DATABASE_URL: `file:${databasePath}`,
  },
});

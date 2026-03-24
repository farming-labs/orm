import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createManifest, renderPrismaSchema, type ManifestField } from "@farming-labs/orm";
import { schema } from "../../support/auth";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dirname, "schema.prisma");
const databasePath = path.join(dirname, "dev.db");

function applyStatements(database: DatabaseSync, sql: string) {
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    database.exec(`${statement};`);
  }
}

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

await mkdir(dirname, { recursive: true });
await rm(databasePath, { force: true });
await writeFile(schemaPath, renderPrismaSchema(schema, { provider: "sqlite" }), "utf8");

const database = new DatabaseSync(databasePath);

try {
  applyStatements(database, renderPrismaSqliteTables());
} finally {
  database.close();
}

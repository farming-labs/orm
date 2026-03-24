import {
  createManifest,
  type ManifestField,
  type ManifestModel,
  type SchemaManifest,
} from "./manifest";
import type { SchemaDefinition } from "./schema";

export type PrismaGenerationOptions = {
  provider?: "postgresql" | "mysql" | "sqlite";
  datasourceName?: string;
  generatorName?: string;
};

export type DrizzleGenerationOptions = {
  dialect: "pg" | "mysql" | "sqlite";
};

export type SqlGenerationOptions = {
  dialect: "postgres" | "mysql" | "sqlite";
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const pluralize = (value: string) => (value.endsWith("s") ? value : `${value}s`);

function prismaType(field: ManifestField) {
  switch (field.kind) {
    case "id":
    case "string":
      return "String";
    case "boolean":
      return "Boolean";
    case "datetime":
      return "DateTime";
  }
}

function drizzleImports(dialect: DrizzleGenerationOptions["dialect"], manifest: SchemaManifest) {
  const models = Object.values(manifest.models) as ManifestModel[];
  const needsBoolean = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "boolean"),
  );
  const needsDate = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "datetime"),
  );

  if (dialect === "pg") {
    return [
      "pgTable",
      "text",
      needsBoolean ? "boolean" : null,
      needsDate ? "timestamp" : null,
    ].filter(Boolean);
  }

  if (dialect === "mysql") {
    return [
      "mysqlTable",
      "varchar",
      "text",
      needsBoolean ? "boolean" : null,
      needsDate ? "datetime" : null,
    ].filter(Boolean);
  }

  return ["sqliteTable", "text", "integer"];
}

function drizzleColumn(field: ManifestField, dialect: DrizzleGenerationOptions["dialect"]) {
  if (field.kind === "id") {
    if (dialect === "mysql") {
      return `varchar("${field.column}", { length: 191 }).primaryKey()`;
    }
    return `text("${field.column}").primaryKey()`;
  }

  if (field.kind === "string") {
    if (dialect === "mysql") {
      const base =
        field.unique || field.references
          ? `varchar("${field.column}", { length: 191 })`
          : `text("${field.column}")`;
      return `${base}${field.nullable ? "" : ".notNull()"}${field.unique ? ".unique()" : ""}${
        field.defaultValue !== undefined ? `.default(${JSON.stringify(field.defaultValue)})` : ""
      }`;
    }
    return `text("${field.column}")${field.nullable ? "" : ".notNull()"}${field.unique ? ".unique()" : ""}${
      field.defaultValue !== undefined ? `.default(${JSON.stringify(field.defaultValue)})` : ""
    }`;
  }

  if (field.kind === "boolean") {
    if (dialect === "sqlite") {
      return `integer("${field.column}", { mode: "boolean" })${field.nullable ? "" : ".notNull()"}${
        field.defaultValue !== undefined ? `.default(${String(field.defaultValue)})` : ""
      }`;
    }
    return `boolean("${field.column}")${field.nullable ? "" : ".notNull()"}${
      field.defaultValue !== undefined ? `.default(${String(field.defaultValue)})` : ""
    }`;
  }

  if (dialect === "mysql") {
    return `datetime("${field.column}", { mode: "date" })${field.nullable ? "" : ".notNull()"}`;
  }
  if (dialect === "sqlite") {
    return `integer("${field.column}", { mode: "timestamp" })${field.nullable ? "" : ".notNull()"}`;
  }
  return `timestamp("${field.column}")${field.nullable ? "" : ".notNull()"}`;
}

function sqlType(field: ManifestField, dialect: SqlGenerationOptions["dialect"]) {
  if (field.kind === "id") {
    return dialect === "mysql" ? "varchar(191)" : "text";
  }
  if (field.kind === "string") {
    return dialect === "mysql" && (field.unique || field.references) ? "varchar(191)" : "text";
  }
  if (field.kind === "boolean") {
    return dialect === "sqlite" ? "integer" : "boolean";
  }
  if (dialect === "mysql") {
    return "datetime";
  }
  if (dialect === "sqlite") {
    return "text";
  }
  return "timestamp";
}

function sqlIdentifier(dialect: SqlGenerationOptions["dialect"], value: string) {
  if (dialect === "mysql") {
    return `\`${value}\``;
  }

  return `"${value}"`;
}

export function renderPrismaSchema(
  schema: SchemaDefinition<any>,
  options: PrismaGenerationOptions = {},
) {
  const manifest = createManifest(schema);
  const provider = options.provider ?? "postgresql";
  const generatorName = options.generatorName ?? "client";
  const datasourceName = options.datasourceName ?? "db";
  const reverseRelations = new Map<string, Array<{ sourceModel: string; many: boolean }>>();

  for (const model of Object.values(manifest.models) as ManifestModel[]) {
    for (const field of Object.values(model.fields)) {
      if (!field.references) continue;
      const [targetModel] = field.references.split(".");
      reverseRelations.set(targetModel, [
        ...(reverseRelations.get(targetModel) ?? []),
        {
          sourceModel: model.name,
          many: !field.unique,
        },
      ]);
    }
  }

  const blocks = (Object.values(manifest.models) as ManifestModel[]).map((model) => {
    const lines: string[] = [];
    const modelName = capitalize(model.name);

    for (const field of Object.values(model.fields)) {
      const fieldType = prismaType(field);
      const modifiers: string[] = [];
      if (field.kind === "id") modifiers.push("@id");
      if (field.generated === "id") modifiers.push("@default(cuid())");
      if (field.generated === "now") modifiers.push("@default(now())");
      if (field.defaultValue !== undefined && field.generated === undefined) {
        modifiers.push(
          typeof field.defaultValue === "string"
            ? `@default("${field.defaultValue}")`
            : `@default(${String(field.defaultValue)})`,
        );
      }
      if (field.unique && field.kind !== "id") modifiers.push("@unique");
      if (field.column !== field.name) modifiers.push(`@map("${field.column}")`);

      lines.push(
        `  ${field.name} ${fieldType}${field.nullable ? "?" : ""}${modifiers.length ? ` ${modifiers.join(" ")}` : ""}`,
      );

      if (field.references) {
        const [targetModel, targetField] = field.references.split(".");
        lines.push(
          `  ${targetModel} ${capitalize(targetModel)} @relation(fields: [${field.name}], references: [${targetField}])`,
        );
      }
    }

    for (const relation of reverseRelations.get(model.name) ?? []) {
      lines.push(
        relation.many
          ? `  ${pluralize(relation.sourceModel)} ${capitalize(relation.sourceModel)}[]`
          : `  ${relation.sourceModel} ${capitalize(relation.sourceModel)}?`,
      );
    }

    const mapLine = model.table !== modelName ? `\n  @@map("${model.table}")` : "";
    return `model ${modelName} {\n${lines.join("\n")}${mapLine}\n}`;
  });

  return (
    `generator ${generatorName} {\n  provider = "prisma-client-js"\n}\n\n` +
    `datasource ${datasourceName} {\n  provider = "${provider}"\n  url      = ${
      provider === "sqlite" ? '"file:./dev.db"' : 'env("DATABASE_URL")'
    }\n}\n\n${blocks.join("\n\n")}\n`
  );
}

export function renderDrizzleSchema(
  schema: SchemaDefinition<any>,
  options: DrizzleGenerationOptions,
) {
  const manifest = createManifest(schema);
  const imports = drizzleImports(options.dialect, manifest).join(", ");
  const tableFactory =
    options.dialect === "pg"
      ? "pgTable"
      : options.dialect === "mysql"
        ? "mysqlTable"
        : "sqliteTable";

  const modelBlocks = (Object.values(manifest.models) as ManifestModel[]).map((model) => {
    const lines = Object.values(model.fields).map((field) => {
      let value = drizzleColumn(field, options.dialect);
      if (field.references) {
        const [targetModel, targetField] = field.references.split(".");
        value += `.references(() => ${targetModel}.${targetField})`;
      }
      return `  ${field.name}: ${value}`;
    });

    return `export const ${model.name} = ${tableFactory}("${model.table}", {\n${lines.join(",\n")}\n});`;
  });

  return `import { ${imports} } from "drizzle-orm/${
    options.dialect === "pg"
      ? "pg-core"
      : options.dialect === "mysql"
        ? "mysql-core"
        : "sqlite-core"
  }";\n\n${modelBlocks.join("\n\n")}\n`;
}

export function renderSafeSql(schema: SchemaDefinition<any>, options: SqlGenerationOptions) {
  const manifest = createManifest(schema);
  const statements = (Object.values(manifest.models) as ManifestModel[]).map((model) => {
    const columns = Object.values(model.fields).map((field) => {
      const parts = [
        `${sqlIdentifier(options.dialect, field.column)} ${sqlType(field, options.dialect)}`,
      ];
      if (field.kind === "id") parts.push("primary key");
      if (!field.nullable) parts.push("not null");
      if (field.unique && field.kind !== "id") parts.push("unique");
      if (field.defaultValue !== undefined) {
        parts.push(
          `default ${
            typeof field.defaultValue === "string"
              ? `'${field.defaultValue}'`
              : String(field.defaultValue)
          }`,
        );
      }
      if (field.references) {
        const [targetModel, targetField] = field.references.split(".");
        const targetTable = manifest.models[targetModel]?.table ?? targetModel;
        const targetColumn =
          manifest.models[targetModel]?.fields[targetField]?.column ?? targetField;
        parts.push(
          `references ${sqlIdentifier(options.dialect, targetTable)}(${sqlIdentifier(
            options.dialect,
            targetColumn,
          )})`,
        );
      }
      return `  ${parts.join(" ")}`;
    });

    return `create table if not exists ${sqlIdentifier(options.dialect, model.table)} (\n${columns.join(",\n")}\n);`;
  });

  return `${statements.join("\n\n")}\n`;
}

export function replaceGeneratedBlock(input: { current: string; label: string; content: string }) {
  const start = `// @farming-labs/orm:start:${input.label}`;
  const end = `// @farming-labs/orm:end:${input.label}`;
  const block = `${start}\n${input.content.trim()}\n${end}`;

  if (input.current.includes(start) && input.current.includes(end)) {
    const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m");
    return input.current.replace(pattern, block);
  }

  return `${input.current.trim()}\n\n${block}\n`;
}

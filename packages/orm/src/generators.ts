import {
  createManifest,
  type ManifestConstraint,
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
const camelize = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^[^a-zA-Z]+/, "")
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
const pascalize = (value: string) => {
  const camel = camelize(value);
  return camel.length ? camel.charAt(0).toUpperCase() + camel.slice(1) : "Value";
};

function hasSchemaNamespaces(manifest: SchemaManifest) {
  return Object.values(manifest.models).some((model) => !!model.schema);
}

function requireSchemaNamespaceSupport(
  manifest: SchemaManifest,
  supported: boolean,
  consumer: string,
) {
  if (supported || !hasSchemaNamespaces(manifest)) {
    return;
  }

  throw new Error(`${consumer} does not support schema-qualified tables in this configuration.`);
}

function renderTsLiteral(value: unknown) {
  if (typeof value === "bigint") {
    return `${value}n`;
  }

  if (value instanceof Date) {
    return `new Date(${JSON.stringify(value.toISOString())})`;
  }

  return JSON.stringify(value);
}

function sqlStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function prismaEnumTypeName(modelName: string, fieldName: string) {
  return `${capitalize(modelName)}${capitalize(fieldName)}Enum`;
}

function drizzleEnumSymbolName(modelName: string, fieldName: string) {
  return camelize(`${modelName}_${fieldName}_enum`) || `${modelName}${capitalize(fieldName)}Enum`;
}

function uniqueIdentifiers(values: readonly string[], toIdentifier: (value: string) => string) {
  const used = new Map<string, number>();

  return Object.fromEntries(
    values.map((value) => {
      const base = toIdentifier(value);
      const nextCount = used.get(base) ?? 0;
      used.set(base, nextCount + 1);
      return [value, nextCount === 0 ? base : `${base}_${nextCount + 1}`];
    }),
  );
}

function prismaEnumValueIdentifiers(values: readonly string[]) {
  return uniqueIdentifiers(values, (value) => {
    const normalized = value
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^(\d)/, "_$1")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
    return normalized || "VALUE";
  });
}

function prismaEnumDefaultIdentifier(field: ManifestField, model: ManifestModel) {
  const enumIdentifiers = prismaEnumValueIdentifiers(field.enumValues ?? []);
  const identifier = enumIdentifiers[String(field.defaultValue)];

  if (!identifier) {
    throw new Error(
      `Invalid default value ${JSON.stringify(field.defaultValue)} for enum field "${model.name}.${field.name}". Expected one of: ${(field.enumValues ?? []).join(", ")}.`,
    );
  }

  return identifier;
}

function sqlEnumCheck(field: ManifestField, dialect: SqlGenerationOptions["dialect"]) {
  if (dialect === "mysql" || field.kind !== "enum" || !field.enumValues?.length) {
    return null;
  }

  const allowed = field.enumValues.map(sqlStringLiteral).join(", ");
  return `check (${sqlIdentifier(dialect, field.column)} in (${allowed}))`;
}

function resolveReferenceTarget(
  manifest: SchemaManifest,
  model: ManifestModel,
  foreignKey: string,
  fallbackTarget: string,
) {
  const reference = model.fields[foreignKey]?.references;
  if (!reference) {
    return {
      targetModel: fallbackTarget,
      targetField: "id",
    };
  }

  const [targetModel, targetField = "id"] = reference.split(".");
  return {
    targetModel,
    targetField,
  };
}

function hasExplicitInverseRelation(
  manifest: SchemaManifest,
  modelName: string,
  sourceModel: string,
  foreignKey: string,
) {
  const model = manifest.models[modelName];
  if (!model) return false;

  return Object.values(model.relations).some((relation) => {
    if (relation.target !== sourceModel) return false;
    if (relation.kind === "belongsTo" || relation.kind === "manyToMany") return false;
    return relation.foreignKey === foreignKey;
  });
}

function prismaType(field: ManifestField) {
  switch (field.kind) {
    case "id":
      return field.idType === "integer" ? "Int" : "String";
    case "string":
      return "String";
    case "boolean":
      return "Boolean";
    case "datetime":
      return "DateTime";
    case "integer":
      return "Int";
    case "json":
      return "Json";
    case "enum":
      return "String";
    case "bigint":
      return "BigInt";
    case "decimal":
      return "Decimal";
  }
}

function drizzleConstraintProperty(constraint: ManifestConstraint) {
  return camelize(constraint.name) || "constraint";
}

function constrainedFields(model: ManifestModel) {
  return new Set(
    [...model.constraints.unique, ...model.constraints.indexes].flatMap(
      (constraint) => constraint.fields,
    ),
  );
}

function drizzleImports(dialect: DrizzleGenerationOptions["dialect"], manifest: SchemaManifest) {
  const models = Object.values(manifest.models) as ManifestModel[];
  const needsSchemaNamespaces = hasSchemaNamespaces(manifest);
  const needsBoolean = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "boolean"),
  );
  const needsDate = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "datetime"),
  );
  const needsInteger = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "integer"),
  );
  const needsJson = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "json"),
  );
  const needsBigint = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "bigint"),
  );
  const needsDecimal = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "decimal"),
  );
  const needsEnum = models.some((model) =>
    Object.values(model.fields).some((field) => field.kind === "enum"),
  );
  const needsIndexes = models.some(
    (model) => model.constraints.indexes.length || model.constraints.unique.length,
  );

  if (dialect === "pg") {
    return [
      "pgTable",
      needsSchemaNamespaces ? "pgSchema" : null,
      needsEnum ? "pgEnum" : null,
      "text",
      needsBoolean ? "boolean" : null,
      needsBigint ? "bigint" : null,
      needsInteger ? "integer" : null,
      needsDecimal ? "numeric" : null,
      needsDate ? "timestamp" : null,
      needsJson ? "jsonb" : null,
      needsIndexes ? "index" : null,
      needsIndexes ? "uniqueIndex" : null,
    ].filter(Boolean);
  }

  if (dialect === "mysql") {
    return [
      "mysqlTable",
      needsEnum ? "mysqlEnum" : null,
      needsBigint ? "bigint" : null,
      needsDecimal ? "decimal" : null,
      "varchar",
      "text",
      needsBoolean ? "boolean" : null,
      needsInteger ? "int" : null,
      needsDate ? "datetime" : null,
      needsJson ? "json" : null,
      needsIndexes ? "index" : null,
      needsIndexes ? "uniqueIndex" : null,
    ].filter(Boolean);
  }

  return [
    "sqliteTable",
    "text",
    "integer",
    needsIndexes ? "index" : null,
    needsIndexes ? "uniqueIndex" : null,
  ].filter(Boolean);
}

function drizzleColumn(
  field: ManifestField,
  dialect: DrizzleGenerationOptions["dialect"],
  options: { indexed?: boolean; modelName?: string } = {},
) {
  const renderDefault = () => {
    if (field.defaultValue === undefined || field.kind === "json") return "";
    return `.default(${renderTsLiteral(field.defaultValue)})`;
  };

  if (field.kind === "id") {
    if (field.idType === "integer") {
      if (dialect === "mysql") {
        return `int("${field.column}").primaryKey()`;
      }
      return `integer("${field.column}").primaryKey()`;
    }

    if (dialect === "mysql") {
      return `varchar("${field.column}", { length: 191 }).primaryKey()`;
    }
    return `text("${field.column}").primaryKey()`;
  }

  if (field.kind === "string") {
    if (dialect === "mysql") {
      const base =
        field.unique || field.references || options.indexed
          ? `varchar("${field.column}", { length: 191 })`
          : `text("${field.column}")`;
      return `${base}${field.nullable ? "" : ".notNull()"}${field.unique ? ".unique()" : ""}${renderDefault()}`;
    }
    return `text("${field.column}")${field.nullable ? "" : ".notNull()"}${field.unique ? ".unique()" : ""}${renderDefault()}`;
  }

  if (field.kind === "enum") {
    if (dialect === "pg" || dialect === "mysql") {
      const symbolName = drizzleEnumSymbolName(options.modelName ?? "model", field.name);
      return `${symbolName}("${field.column}")${field.nullable ? "" : ".notNull()"}${field.unique ? ".unique()" : ""}${renderDefault()}`;
    }

    return `text("${field.column}")${field.nullable ? "" : ".notNull()"}${field.unique ? ".unique()" : ""}${renderDefault()}`;
  }

  if (field.kind === "boolean") {
    if (dialect === "sqlite") {
      return `integer("${field.column}", { mode: "boolean" })${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
    }
    return `boolean("${field.column}")${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
  }

  if (field.kind === "integer") {
    if (dialect === "mysql") {
      return `int("${field.column}")${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
    }
    return `integer("${field.column}")${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
  }

  if (field.kind === "bigint") {
    if (dialect === "pg" || dialect === "mysql") {
      return `bigint("${field.column}", { mode: "bigint" })${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
    }

    return `integer("${field.column}")${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
  }

  if (field.kind === "decimal") {
    if (dialect === "pg") {
      return `numeric("${field.column}", { precision: 65, scale: 30 })${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
    }
    if (dialect === "mysql") {
      return `decimal("${field.column}", { precision: 65, scale: 30 })${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
    }
    return `text("${field.column}")${field.nullable ? "" : ".notNull()"}${renderDefault()}`;
  }

  if (field.kind === "json") {
    if (dialect === "pg") {
      return `jsonb("${field.column}")${field.nullable ? "" : ".notNull()"}`;
    }
    if (dialect === "mysql") {
      return `json("${field.column}")${field.nullable ? "" : ".notNull()"}`;
    }
    return `text("${field.column}", { mode: "json" })${field.nullable ? "" : ".notNull()"}`;
  }

  if (dialect === "mysql") {
    return `datetime("${field.column}", { mode: "date" })${field.nullable ? "" : ".notNull()"}`;
  }
  if (dialect === "sqlite") {
    return `integer("${field.column}", { mode: "timestamp" })${field.nullable ? "" : ".notNull()"}`;
  }
  return `timestamp("${field.column}", { withTimezone: true, mode: "date" })${field.nullable ? "" : ".notNull()"}`;
}

function sqlType(
  field: ManifestField,
  dialect: SqlGenerationOptions["dialect"],
  options: { indexed?: boolean } = {},
) {
  if (field.kind === "id") {
    if (field.idType === "integer") {
      return "integer";
    }
    return dialect === "mysql" ? "varchar(191)" : "text";
  }
  if (field.kind === "string") {
    return dialect === "mysql" && (field.unique || field.references || options.indexed)
      ? "varchar(191)"
      : "text";
  }
  if (field.kind === "enum") {
    if (dialect === "mysql" && field.enumValues?.length) {
      return `enum(${field.enumValues.map(sqlStringLiteral).join(", ")})`;
    }
    return dialect === "mysql" && (field.unique || field.references || options.indexed)
      ? "varchar(191)"
      : "text";
  }
  if (field.kind === "boolean") {
    return dialect === "sqlite" ? "integer" : "boolean";
  }
  if (field.kind === "integer") {
    return "integer";
  }
  if (field.kind === "bigint") {
    return "bigint";
  }
  if (field.kind === "decimal") {
    if (dialect === "postgres") return "numeric(65, 30)";
    if (dialect === "mysql") return "decimal(65, 30)";
    return "text";
  }
  if (field.kind === "json") {
    if (dialect === "postgres") return "jsonb";
    if (dialect === "mysql") return "json";
    return "text";
  }
  if (dialect === "mysql") {
    return "datetime";
  }
  if (dialect === "sqlite") {
    return "text";
  }
  return "timestamptz";
}

function sqlIdentifier(dialect: SqlGenerationOptions["dialect"], value: string) {
  if (dialect === "mysql") {
    return `\`${value}\``;
  }

  return `"${value}"`;
}

function sqlTableIdentifier(dialect: SqlGenerationOptions["dialect"], model: ManifestModel) {
  if (!model.schema) {
    return sqlIdentifier(dialect, model.table);
  }

  return `${sqlIdentifier(dialect, model.schema)}.${sqlIdentifier(dialect, model.table)}`;
}

function drizzleSchemaSymbolName(schema: string) {
  return camelize(`${schema}_schema`) || "dbSchema";
}

function sqlCreateIndexStatement(
  dialect: SqlGenerationOptions["dialect"],
  model: ManifestModel,
  constraint: ManifestConstraint,
) {
  const indexName = sqlIdentifier(dialect, constraint.name);
  const tableName = sqlTableIdentifier(dialect, model);
  const columns = constraint.columns.map((column) => sqlIdentifier(dialect, column)).join(", ");
  const createKeyword = constraint.unique ? "create unique index" : "create index";
  const ifNotExists = dialect === "mysql" ? "" : " if not exists";
  return `${createKeyword}${ifNotExists} ${indexName} on ${tableName}(${columns});`;
}

export function renderPrismaSchema(
  schema: SchemaDefinition<any>,
  options: PrismaGenerationOptions = {},
) {
  const manifest = createManifest(schema);
  const provider = options.provider ?? "postgresql";
  requireSchemaNamespaceSupport(
    manifest,
    provider === "postgresql",
    `renderPrismaSchema(provider: "${provider}")`,
  );
  const generatorName = options.generatorName ?? "client";
  const datasourceName = options.datasourceName ?? "db";
  const schemas = [
    ...new Set(
      (Object.values(manifest.models) as ManifestModel[])
        .map((model) => model.schema)
        .filter((value): value is string => !!value),
    ),
  ];
  const reverseRelations = new Map<
    string,
    Array<{ sourceModel: string; foreignKey: string; many: boolean }>
  >();

  for (const model of Object.values(manifest.models) as ManifestModel[]) {
    for (const field of Object.values(model.fields)) {
      if (!field.references) continue;
      const [targetModel] = field.references.split(".");
      reverseRelations.set(targetModel, [
        ...(reverseRelations.get(targetModel) ?? []),
        {
          sourceModel: model.name,
          foreignKey: field.name,
          many: !field.unique,
        },
      ]);
    }
  }

  const enumBlocks = (Object.values(manifest.models) as ManifestModel[]).flatMap((model) =>
    Object.values(model.fields)
      .filter((field) => field.kind === "enum" && field.enumValues?.length)
      .map((field) => {
        const enumIdentifiers = prismaEnumValueIdentifiers(field.enumValues ?? []);
        const values = (field.enumValues ?? []).map((value) => {
          const identifier = enumIdentifiers[value]!;
          return identifier === value
            ? `  ${identifier}`
            : `  ${identifier} @map(${JSON.stringify(value)})`;
        });
        return `enum ${prismaEnumTypeName(model.name, field.name)} {\n${values.join("\n")}\n}`;
      }),
  );

  const blocks = (Object.values(manifest.models) as ManifestModel[]).map((model) => {
    const lines: string[] = [];
    const modelName = capitalize(model.name);
    const relationFieldNames = new Set<string>();
    const handledForeignKeys = new Set<string>();

    for (const field of Object.values(model.fields)) {
      const fieldType =
        field.kind === "enum" ? prismaEnumTypeName(model.name, field.name) : prismaType(field);
      const modifiers: string[] = [];
      if (field.kind === "id") modifiers.push("@id");
      if (field.generated === "id") modifiers.push("@default(cuid())");
      if (field.generated === "increment") modifiers.push("@default(autoincrement())");
      if (field.generated === "now") modifiers.push("@default(now())");
      if (
        field.defaultValue !== undefined &&
        field.generated === undefined &&
        field.kind !== "json"
      ) {
        if (field.kind === "enum") {
          modifiers.push(`@default(${prismaEnumDefaultIdentifier(field, model)})`);
        } else if (field.kind === "decimal") {
          modifiers.push(`@default(${String(field.defaultValue)})`);
        } else {
          modifiers.push(
            typeof field.defaultValue === "string"
              ? `@default("${field.defaultValue}")`
              : `@default(${String(field.defaultValue)})`,
          );
        }
      }
      if (field.unique && field.kind !== "id") modifiers.push("@unique");
      if (field.column !== field.name) modifiers.push(`@map("${field.column}")`);

      lines.push(
        `  ${field.name} ${fieldType}${field.nullable ? "?" : ""}${modifiers.length ? ` ${modifiers.join(" ")}` : ""}`,
      );
    }

    for (const [relationName, relation] of Object.entries(model.relations)) {
      if (relation.kind === "manyToMany") continue;

      relationFieldNames.add(relationName);

      if (relation.kind === "belongsTo") {
        const { targetField } = resolveReferenceTarget(
          manifest,
          model,
          relation.foreignKey,
          relation.target,
        );
        handledForeignKeys.add(relation.foreignKey);
        lines.push(
          `  ${relationName} ${capitalize(relation.target)} @relation(fields: [${relation.foreignKey}], references: [${targetField}])`,
        );
        continue;
      }

      if (relation.kind === "hasOne") {
        lines.push(`  ${relationName} ${capitalize(relation.target)}?`);
        continue;
      }

      lines.push(`  ${relationName} ${capitalize(relation.target)}[]`);
    }

    for (const field of Object.values(model.fields)) {
      if (!field.references || handledForeignKeys.has(field.name)) continue;
      const [targetModel, targetField] = field.references.split(".");
      if (relationFieldNames.has(targetModel)) continue;
      lines.push(
        `  ${targetModel} ${capitalize(targetModel)} @relation(fields: [${field.name}], references: [${targetField}])`,
      );
    }

    for (const relation of reverseRelations.get(model.name) ?? []) {
      if (
        hasExplicitInverseRelation(manifest, model.name, relation.sourceModel, relation.foreignKey)
      ) {
        continue;
      }

      const relationName = relation.many ? pluralize(relation.sourceModel) : relation.sourceModel;
      if (relationFieldNames.has(relationName)) continue;
      lines.push(
        relation.many
          ? `  ${relationName} ${capitalize(relation.sourceModel)}[]`
          : `  ${relationName} ${capitalize(relation.sourceModel)}?`,
      );
    }

    const modelLines = [
      ...lines,
      ...model.constraints.unique.map(
        (constraint) => `  @@unique([${constraint.fields.join(", ")}])`,
      ),
      ...model.constraints.indexes.map(
        (constraint) => `  @@index([${constraint.fields.join(", ")}])`,
      ),
      ...(model.table !== modelName ? [`  @@map("${model.table}")`] : []),
      ...(model.schema ? [`  @@schema("${model.schema}")`] : []),
    ];

    return `model ${modelName} {\n${modelLines.join("\n")}\n}`;
  });

  const generatorLines = [`generator ${generatorName} {`, '  provider = "prisma-client-js"'];
  if (schemas.length) {
    generatorLines.push('  previewFeatures = ["multiSchema"]');
  }
  generatorLines.push("}");

  const datasourceLines = [
    `datasource ${datasourceName} {`,
    `  provider = "${provider}"`,
    `  url      = ${provider === "sqlite" ? '"file:./dev.db"' : 'env("DATABASE_URL")'}`,
  ];
  if (schemas.length) {
    datasourceLines.push(
      `  schemas  = [${schemas.map((value) => JSON.stringify(value)).join(", ")}]`,
    );
  }
  datasourceLines.push("}");

  return `${generatorLines.join("\n")}\n\n${datasourceLines.join("\n")}\n\n${[...enumBlocks, ...blocks].join("\n\n")}\n`;
}

export function renderDrizzleSchema(
  schema: SchemaDefinition<any>,
  options: DrizzleGenerationOptions,
) {
  const manifest = createManifest(schema);
  requireSchemaNamespaceSupport(
    manifest,
    options.dialect === "pg",
    `renderDrizzleSchema(dialect: "${options.dialect}")`,
  );
  const coreImports = drizzleImports(options.dialect, manifest).join(", ");
  const tableFactory =
    options.dialect === "pg"
      ? "pgTable"
      : options.dialect === "mysql"
        ? "mysqlTable"
        : "sqliteTable";
  const enumBlocks =
    options.dialect === "sqlite"
      ? []
      : (Object.values(manifest.models) as ManifestModel[]).flatMap((model) =>
          Object.values(model.fields)
            .filter((field) => field.kind === "enum" && field.enumValues?.length)
            .map((field) => {
              const values = (field.enumValues ?? [])
                .map((value) => JSON.stringify(value))
                .join(", ");
              const factory = options.dialect === "pg" ? "pgEnum" : "mysqlEnum";
              return `export const ${drizzleEnumSymbolName(model.name, field.name)} = ${factory}("${model.qualifiedTable.replace(/\./g, "_")}_${field.column}_enum", [${values}]);`;
            }),
        );
  const schemaBlocks =
    options.dialect !== "pg"
      ? []
      : [
          ...new Set(
            (Object.values(manifest.models) as ManifestModel[])
              .map((model) => model.schema)
              .filter((value): value is string => !!value),
          ),
        ].map(
          (schemaName) =>
            `const ${drizzleSchemaSymbolName(schemaName)} = pgSchema(${JSON.stringify(schemaName)});`,
        );

  const modelBlocks = (Object.values(manifest.models) as ManifestModel[]).map((model) => {
    const indexedFields = constrainedFields(model);
    const lines = Object.values(model.fields).map((field) => {
      let value = drizzleColumn(field, options.dialect, {
        indexed: indexedFields.has(field.name),
        modelName: model.name,
      });
      if (field.references) {
        const [targetModel, targetField] = field.references.split(".");
        value += `.references(() => ${targetModel}.${targetField})`;
      }
      return `  ${field.name}: ${value}`;
    });

    const constraintLines = [
      ...model.constraints.unique.map(
        (constraint) =>
          `  ${drizzleConstraintProperty(constraint)}: uniqueIndex("${constraint.name}").on(${constraint.fields
            .map((fieldName) => `table.${fieldName}`)
            .join(", ")})`,
      ),
      ...model.constraints.indexes.map(
        (constraint) =>
          `  ${drizzleConstraintProperty(constraint)}: index("${constraint.name}").on(${constraint.fields
            .map((fieldName) => `table.${fieldName}`)
            .join(", ")})`,
      ),
    ];

    const target =
      options.dialect === "pg" && model.schema
        ? `${drizzleSchemaSymbolName(model.schema)}.table`
        : tableFactory;

    if (!constraintLines.length) {
      return `export const ${model.name} = ${target}("${model.table}", {\n${lines.join(",\n")}\n});`;
    }

    return `export const ${model.name} = ${target}("${model.table}", {\n${lines.join(",\n")}\n}, (table) => ({\n${constraintLines.join(",\n")}\n}));`;
  });

  const relationBlocks = (Object.values(manifest.models) as ManifestModel[])
    .map((model) => {
      const lines = Object.entries(model.relations)
        .flatMap(([relationName, relation]) => {
          if (relation.kind === "manyToMany") {
            return [];
          }

          if (relation.kind === "belongsTo") {
            const { targetField } = resolveReferenceTarget(
              manifest,
              model,
              relation.foreignKey,
              relation.target,
            );
            return [
              `  ${relationName}: one(${relation.target}, { fields: [${model.name}.${relation.foreignKey}], references: [${relation.target}.${targetField}] })`,
            ];
          }

          if (relation.kind === "hasOne") {
            return [`  ${relationName}: one(${relation.target})`];
          }

          return [`  ${relationName}: many(${relation.target})`];
        })
        .filter(Boolean);

      if (!lines.length) return null;

      return `export const ${model.name}Relations = relations(${model.name}, ({ one, many }) => ({\n${lines.join(",\n")}\n}));`;
    })
    .filter(Boolean);

  const imports = [
    `import { ${coreImports} } from "drizzle-orm/${
      options.dialect === "pg"
        ? "pg-core"
        : options.dialect === "mysql"
          ? "mysql-core"
          : "sqlite-core"
    }";`,
    relationBlocks.length ? `import { relations } from "drizzle-orm";` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${imports}\n\n${[...schemaBlocks, ...enumBlocks, ...modelBlocks, ...relationBlocks].join("\n\n")}\n`;
}

export function renderSafeSql(schema: SchemaDefinition<any>, options: SqlGenerationOptions) {
  const manifest = createManifest(schema);
  requireSchemaNamespaceSupport(
    manifest,
    options.dialect === "postgres",
    `renderSafeSql(dialect: "${options.dialect}")`,
  );
  const schemaStatements =
    options.dialect !== "postgres"
      ? []
      : [
          ...new Set(
            (Object.values(manifest.models) as ManifestModel[])
              .map((model) => model.schema)
              .filter((value): value is string => !!value),
          ),
        ].map(
          (schemaName) =>
            `create schema if not exists ${sqlIdentifier(options.dialect, schemaName)};`,
        );
  const statements = (Object.values(manifest.models) as ManifestModel[]).flatMap((model) => {
    const indexedFields = constrainedFields(model);
    const columns = Object.values(model.fields).map((field) => {
      const parts = [
        `${sqlIdentifier(options.dialect, field.column)} ${sqlType(field, options.dialect, {
          indexed: indexedFields.has(field.name),
        })}`,
      ];
      if (field.kind === "id") parts.push("primary key");
      if (!field.nullable) parts.push("not null");
      if (field.unique && field.kind !== "id") parts.push("unique");
      if (field.defaultValue !== undefined && field.kind !== "json") {
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
        const targetManifestModel = manifest.models[targetModel];
        const targetTable = targetManifestModel?.table ?? targetModel;
        const targetColumn = targetManifestModel?.fields[targetField]?.column ?? targetField;
        const targetTableIdentifier =
          targetManifestModel?.schema && options.dialect === "postgres"
            ? `${sqlIdentifier(options.dialect, targetManifestModel.schema)}.${sqlIdentifier(
                options.dialect,
                targetTable,
              )}`
            : sqlIdentifier(options.dialect, targetTable);
        parts.push(
          `references ${targetTableIdentifier}(${sqlIdentifier(options.dialect, targetColumn)})`,
        );
      }
      const enumCheck = sqlEnumCheck(field, options.dialect);
      if (enumCheck) {
        parts.push(enumCheck);
      }
      return `  ${parts.join(" ")}`;
    });

    return [
      `create table if not exists ${sqlTableIdentifier(options.dialect, model)} (\n${columns.join(",\n")}\n);`,
      ...model.constraints.unique.map((constraint) =>
        sqlCreateIndexStatement(options.dialect, model, constraint),
      ),
      ...model.constraints.indexes.map((constraint) =>
        sqlCreateIndexStatement(options.dialect, model, constraint),
      ),
    ];
  });

  return `${[...schemaStatements, ...statements].join("\n\n")}\n`;
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

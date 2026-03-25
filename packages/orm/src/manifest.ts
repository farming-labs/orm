import type { ScalarKind } from "./fields";
import type { AnyRelation } from "./relations";
import type { AnyModelDefinition, ModelConstraints, SchemaDefinition } from "./schema";

export type ManifestField = {
  name: string;
  column: string;
  kind: ScalarKind;
  nullable: boolean;
  unique: boolean;
  generated?: "id" | "now";
  defaultValue?: unknown;
  references?: string;
  description?: string;
};

export type ManifestConstraint = {
  name: string;
  fields: string[];
  columns: string[];
  unique: boolean;
};

export type ManifestModel = {
  name: string;
  table: string;
  description?: string;
  fields: Record<string, ManifestField>;
  relations: Record<string, AnyRelation>;
  constraints: {
    unique: ManifestConstraint[];
    indexes: ManifestConstraint[];
  };
};

export type SchemaManifest = {
  models: Record<string, ManifestModel>;
};

function createConstraintName(table: string, columns: string[], suffix: "unique" | "idx") {
  const base = [table, ...columns]
    .join("_")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return `${base}_${suffix}`;
}

function normalizeConstraints(
  modelName: string,
  table: string,
  fields: Record<string, ManifestField>,
  constraints: ModelConstraints<any>,
) {
  const normalize = (entries: readonly (readonly string[])[] | undefined, unique: boolean) =>
    (entries ?? []).map((entry) => {
      if (!entry.length) {
        throw new Error(
          `Model "${modelName}" defines an empty ${unique ? "unique" : "index"} constraint.`,
        );
      }

      const columns = entry.map((fieldName) => {
        const field = fields[fieldName];
        if (!field) {
          throw new Error(
            `Model "${modelName}" defines a ${unique ? "unique" : "index"} constraint on unknown field "${fieldName}".`,
          );
        }
        return field.column;
      });

      return {
        name: createConstraintName(table, columns, unique ? "unique" : "idx"),
        fields: [...entry],
        columns,
        unique,
      } satisfies ManifestConstraint;
    });

  return {
    unique: normalize(constraints.unique, true),
    indexes: normalize(constraints.indexes, false),
  };
}

export function createManifest<
  TSchema extends SchemaDefinition<Record<string, AnyModelDefinition>>,
>(schema: TSchema): SchemaManifest {
  const models = Object.fromEntries(
    (Object.entries(schema.models) as Array<[string, AnyModelDefinition]>).map(
      ([name, definition]) => {
        const fields = Object.fromEntries(
          (
            Object.entries(definition.fields) as Array<
              [string, AnyModelDefinition["fields"][string]]
            >
          ).map(([fieldName, field]) => [
            fieldName,
            {
              name: fieldName,
              column: field.config.mappedName ?? fieldName,
              kind: field.config.kind,
              nullable: field.config.nullable,
              unique: field.config.unique,
              generated: field.config.generated,
              defaultValue: field.config.defaultValue,
              references: field.config.references,
              description: field.config.description,
            } satisfies ManifestField,
          ]),
        );

        return [
          name,
          {
            name,
            table: definition.table,
            description: definition.description,
            fields,
            relations: definition.relations,
            constraints: normalizeConstraints(
              name,
              definition.table,
              fields,
              definition.constraints,
            ),
          } satisfies ManifestModel,
        ];
      },
    ),
  );

  return { models };
}

import type { ScalarKind } from "./fields";
import type { AnyRelation } from "./relations";
import type { AnyModelDefinition, SchemaDefinition } from "./schema";

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

export type ManifestModel = {
  name: string;
  table: string;
  description?: string;
  fields: Record<string, ManifestField>;
  relations: Record<string, AnyRelation>;
};

export type SchemaManifest = {
  models: Record<string, ManifestModel>;
};

export function createManifest<
  TSchema extends SchemaDefinition<Record<string, AnyModelDefinition>>
>(schema: TSchema): SchemaManifest {
  const models = Object.fromEntries(
    (Object.entries(schema.models) as Array<[string, AnyModelDefinition]>).map(
      ([name, definition]) => {
      const fields = Object.fromEntries(
        (Object.entries(definition.fields) as Array<[string, AnyModelDefinition["fields"][string]]>).map(([fieldName, field]) => [
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
        } satisfies ManifestModel,
      ];
    }),
  );

  return { models };
}

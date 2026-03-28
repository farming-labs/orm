import type { AnyFieldBuilder, FieldOutput } from "./fields";
import type { AnyRelation, RelationDefinition } from "./relations";

export type FieldMap = Record<string, AnyFieldBuilder>;
export type RelationMap = Record<string, AnyRelation>;
export type ConstraintFieldName<Fields extends FieldMap> = keyof Fields & string;
export type ConstraintFieldSet<Fields extends FieldMap> = readonly [
  ConstraintFieldName<Fields>,
  ...ConstraintFieldName<Fields>[],
];
export type ModelConstraints<Fields extends FieldMap = FieldMap> = {
  readonly unique?: readonly ConstraintFieldSet<Fields>[];
  readonly indexes?: readonly ConstraintFieldSet<Fields>[];
};

export type TableReference = Readonly<{
  name: string;
  schema?: string;
}>;

export type TableInput = string | TableReference;

export type ModelDefinition<
  Fields extends FieldMap = FieldMap,
  Relations extends RelationMap = RelationMap,
> = {
  readonly _tag: "model";
  readonly table: TableInput;
  readonly fields: Fields;
  readonly relations: Relations;
  readonly constraints: ModelConstraints<Fields>;
  readonly description?: string;
};

export type AnyModelDefinition = ModelDefinition<any, any>;

export type SchemaDefinition<
  Models extends Record<string, AnyModelDefinition> = Record<string, AnyModelDefinition>,
> = {
  readonly _tag: "schema";
  readonly models: Models;
};

function validateTablePart(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized.length) {
    throw new Error(`tableName() requires a non-empty ${label}.`);
  }

  if (normalized.includes(".")) {
    throw new Error(
      `tableName() ${label} values cannot contain ".". Pass the table name and schema separately.`,
    );
  }

  return normalized;
}

export function model<Fields extends FieldMap, Relations extends RelationMap = {}>(config: {
  table: TableInput;
  fields: Fields;
  relations?: Relations;
  constraints?: ModelConstraints<Fields>;
  description?: string;
}): ModelDefinition<Fields, Relations> {
  return {
    _tag: "model",
    table: config.table,
    fields: config.fields,
    relations: (config.relations ?? {}) as Relations,
    constraints: (config.constraints ?? {}) as ModelConstraints<Fields>,
    description: config.description,
  };
}

export function tableName(name: string, options?: { schema?: string }): TableReference {
  return Object.freeze({
    name: validateTablePart(name, "table name"),
    schema: options?.schema ? validateTablePart(options.schema, "schema name") : undefined,
  });
}

export function defineSchema<Models extends Record<string, AnyModelDefinition>>(
  models: Models,
): SchemaDefinition<Models> {
  return {
    _tag: "schema",
    models,
  };
}

export type SchemaModels<TSchema> = TSchema extends SchemaDefinition<infer Models> ? Models : never;

export type ModelName<TSchema> = keyof SchemaModels<TSchema> & string;

export type ModelForName<TSchema, TName extends ModelName<TSchema>> = SchemaModels<TSchema>[TName];

export type ModelFields<TSchema, TName extends ModelName<TSchema>> = ModelForName<
  TSchema,
  TName
>["fields"];

export type ModelRelations<TSchema, TName extends ModelName<TSchema>> = ModelForName<
  TSchema,
  TName
>["relations"];

export type ScalarRecord<TSchema, TName extends ModelName<TSchema>> = {
  [K in keyof ModelFields<TSchema, TName> & string]: FieldOutput<ModelFields<TSchema, TName>[K]>;
};

export type RelationName<TSchema, TName extends ModelName<TSchema>> = keyof ModelRelations<
  TSchema,
  TName
> &
  string;

export type RelationForName<
  TSchema,
  TName extends ModelName<TSchema>,
  TRelationName extends RelationName<TSchema, TName>,
> = ModelRelations<TSchema, TName>[TRelationName];

export type RelationTarget<
  TSchema,
  TName extends ModelName<TSchema>,
  TRelationName extends RelationName<TSchema, TName>,
> =
  RelationForName<TSchema, TName, TRelationName> extends RelationDefinition<infer Target, any>
    ? Extract<Target, ModelName<TSchema>>
    : never;
